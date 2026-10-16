import { ApiError } from '../api';
import { readSseFrames } from './streamTransport';
import type {
  ApiErrorCode,
  ChatMode,
  Citation,
  KnowledgeAgentStep,
  KnowledgeAgentStreamState,
} from '../types/chat';

export type AgentStatusEvent = {
  type: 'agent_status';
  event:
    | 'agent_started'
    | 'agent_finished'
    | 'model_started'
    | 'model_finished'
    | 'tool_started'
    | 'tool_finished'
    | 'error';
  stepKey: string;
  stepLabel: string;
  stepStatus: 'running' | 'completed' | 'failed';
  stepIndex: number;
  stepTotal: number;
  requestId?: string;
  mode?: ChatMode;
  durationMs?: number;
  citations?: Citation[];
  code?: ApiErrorCode;
  message?: string;
  seq?: number;
  timestamp?: string;
};

export type ChatSsePayload =
  | { type: 'text'; text: string; replayed?: boolean; messageId?: string; seq?: number; timestamp?: string }
  | { type: 'message_meta'; userMessageId: string; assistantMessageId: string; clientMessageId?: string }
  | { type: 'citation'; citation: Citation; seq?: number; timestamp?: string }
  | AgentStatusEvent
  | { warning: string; text: string }
  | { error: string; code?: ApiErrorCode; requestId?: string };

interface ConsumeOptions {
  signal?: AbortSignal;
  onState: (state: KnowledgeAgentStreamState, replaced?: boolean) => void;
  onWarning?: (warning: string) => void;
  onMessageMeta?: (event: Extract<ChatSsePayload, { type: 'message_meta' }>) => void;
}

export function createKnowledgeAgentState(): KnowledgeAgentStreamState {
  return {
    answer: '',
    steps: {},
    status: 'connecting',
    citations: [],
  };
}

/** Pure business reduction; request-level sequence deduplication belongs to the consumer. */
export function reduceChatEvent(current: KnowledgeAgentStreamState, event: ChatSsePayload): KnowledgeAgentStreamState {
  let state = current;
  const publish = (patch: Partial<KnowledgeAgentStreamState>) => { state = { ...state, ...patch }; };
  const mergeCitations = (citations: Citation[]) => {
    const byId = new Map(
      state.citations.map((citation) => [citation.citationId, citation]),
    );
    citations.forEach((citation) => byId.set(citation.citationId, citation));
    publish({ citations: [...byId.values()] });
  };


    if ('error' in event) {
      publish({
        status: 'failed',
        error: event.error,
        errorCode: event.code,
        requestId: event.requestId,
      });
      return state;
    }

    if ('warning' in event) {

      return state;
    }

    if (event.type === 'text') {
      publish({
        answer: event.replayed ? event.text : state.answer + event.text,
        status: 'generating',
        ...(event.replayed ? { citations: [], steps: {} } : {}),
      });
      return state;
    }

    if (event.type === 'message_meta') {

      return state;
    }

    if (event.type === 'citation') {
      mergeCitations([event.citation]);
      return state;
    }

    if (event.citations?.length) mergeCitations(event.citations);

    // tool_finished may omit labels already supplied by tool_started.
    const previous = state.steps[event.stepKey];
    const step: KnowledgeAgentStep = {
      stepKey: event.stepKey,
      stepLabel: event.stepLabel || previous?.stepLabel || event.stepKey,
      stepStatus: event.stepStatus,
      stepIndex: event.stepIndex ?? previous?.stepIndex ?? 0,
      stepTotal: event.stepTotal ?? previous?.stepTotal ?? 0,
      seq: event.seq,
      timestamp: event.timestamp,
      durationMs: event.durationMs,
      message: event.message,
    };
    const streamStatus =
      event.event === 'error' || event.stepStatus === 'failed'
        ? 'failed'
        : event.event === 'tool_started'
          ? 'retrieving'
          : 'generating';

    publish({
      steps: { ...state.steps, [event.stepKey]: step },
      status: streamStatus,
      executionMode: event.mode ?? state.executionMode,
      requestId: event.requestId ?? state.requestId,
      errorCode: event.code ?? state.errorCode,
      error:
        event.event === 'error'
          ? event.message || '回答生成失败'
          : state.error,
    });


  return state;
}

export async function consumeKnowledgeChatStream(response: Response, options: ConsumeOptions): Promise<KnowledgeAgentStreamState> {
  if (!response.body) throw new ApiError('浏览器不支持流式响应');
  const seenSeq = new Set<number>();
  let state = createKnowledgeAgentState();
  let completed = false;
  try {
    for await (const frame of readSseFrames(response, options.signal)) {
      if (frame.data.trim() === '[DONE]') {
        state = { ...state, status: 'completed' };
        options.onState(state);
        completed = true;
        break;
      }
      let event: ChatSsePayload;
      try { event = JSON.parse(frame.data); }
      catch { throw new ApiError('流式响应格式错误', 'LLM_UNAVAILABLE'); }
      const seq = 'seq' in event ? event.seq : undefined;
      if (typeof seq === 'number') {
        if (seenSeq.has(seq)) continue;
        seenSeq.add(seq);
      }
      if ('warning' in event) { options.onWarning?.(event.warning); continue; }
      if ('type' in event && event.type === 'message_meta') { options.onMessageMeta?.(event); continue; }
      state = reduceChatEvent(state, event);
      options.onState(state, 'type' in event && event.type === 'text' && event.replayed === true);
      if ('error' in event) throw new ApiError(event.error, event.code, event.requestId);
      if ('type' in event && event.type === 'agent_status' && event.event === 'error') {
        throw new ApiError(event.message || '回答生成失败', event.code, event.requestId);
      }
    }
    if (!completed) throw new ApiError('连接提前结束，请重试', 'LLM_UNAVAILABLE');
  } catch (error) {
    if (options.signal?.aborted) {
      options.onState({ ...state, status: 'aborted' });
      throw new DOMException('The operation was aborted.', 'AbortError');
    }
    throw error;
  }
  return state;
}
