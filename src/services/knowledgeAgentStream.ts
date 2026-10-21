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
  /** 工具调用的开始/结束事件配对用（同名工具会出现多次） */
  callId?: string;
  /** 参数摘要（工具调用） */
  detail?: string;
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
  /** agent_finished 时由后端给出：因长度被截断、结束原因、是否为回放 */
  truncated?: boolean;
  finishReason?: string | null;
  replayed?: boolean;
};

export type ChatSsePayload =
  | { type: 'text'; text: string; replayed?: boolean; messageId?: string; seq?: number; timestamp?: string }
  | { type: 'message_meta'; userMessageId: string; assistantMessageId: string; clientMessageId?: string; runId?: string }
  | { type: 'citation'; citation: Citation; seq?: number; timestamp?: string }
  | AgentStatusEvent
  | { warning: string; text: string }
  | { error: string; code?: ApiErrorCode; requestId?: string; retryable?: boolean };

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

/** 没有后端给出 stepLabel 时使用的兜底文案 */
const DEFAULT_STEP_LABELS: Record<string, string> = {
  agent: '智能助手',
  retrieval: '检索知识库',
  analysis: '分析问题',
  generation: '生成回答',
};

/** 步骤唯一 ID：工具调用用 callId（同名工具会多次出现），其余用 stepKey。 */
function stepIdOf(event: { callId?: string; stepKey?: string }) {
  return event.callId ?? event.stepKey ?? 'unknown';
}

/** 把所有仍在进行中的步骤标记为失败（出错或中断时使用）。 */
function failRunningSteps(steps: Record<string, KnowledgeAgentStep>): Record<string, KnowledgeAgentStep> {
  const next: Record<string, KnowledgeAgentStep> = {};
  for (const [id, step] of Object.entries(steps)) {
    next[id] = step.stepStatus === 'running' ? { ...step, stepStatus: 'failed' } : step;
  }
  return next;
}

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
        steps: failRunningSteps(state.steps),
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

    if (event.event === 'agent_finished') {
      if (event.citations?.length) mergeCitations(event.citations);
      // 回答结束：仍在进行中的步骤全部视为完成，并更新 agent 自身这一步
      const steps: Record<string, KnowledgeAgentStep> = {};
      for (const [id, step] of Object.entries(state.steps)) {
        steps[id] = step.stepStatus === 'running' ? { ...step, stepStatus: 'completed' } : step;
      }
      const id = stepIdOf(event);
      const previous = state.steps[id];
      steps[id] = {
        id,
        stepKey: event.stepKey,
        stepLabel: event.stepLabel || previous?.stepLabel || DEFAULT_STEP_LABELS[event.stepKey] || event.stepKey,
        stepStatus: 'completed',
        stepIndex: event.stepIndex ?? previous?.stepIndex ?? 0,
        stepTotal: event.stepTotal ?? previous?.stepTotal ?? 0,
        seq: event.seq,
        timestamp: event.timestamp,
        durationMs: event.durationMs ?? previous?.durationMs,
        message: previous?.message,
      };
      publish({
        steps,
        status: event.truncated ? 'truncated' : 'completed',
        finishReason: event.finishReason ?? state.finishReason,
      });
      return state;
    }

    // 错误事件是 agent_status(error)：只含 code/message，没有 stepKey，不能当成一个步骤
    if (event.event === 'error') {
      publish({
        steps: failRunningSteps(state.steps),
        status: 'failed',
        error: event.message || '回答生成失败',
        errorCode: event.code ?? state.errorCode,
        requestId: event.requestId ?? state.requestId,
      });
      return state;
    }

    if (event.citations?.length) mergeCitations(event.citations);

    // 同名步骤（多次工具调用）以 callId 区分；tool_finished 可能省略 stepLabel，沿用 started 的值
    const id = stepIdOf(event);
    const previous = state.steps[id];
    const step: KnowledgeAgentStep = {
      id,
      stepKey: event.stepKey,
      callId: event.callId ?? previous?.callId,
      detail: event.detail ?? previous?.detail,
      stepLabel: event.stepLabel || previous?.stepLabel || DEFAULT_STEP_LABELS[event.stepKey] || event.stepKey,
      // *_started 若未携带 stepStatus，按进行中处理，避免步骤没有运行态
      stepStatus: event.stepStatus ?? (event.event.endsWith('_started') ? 'running' : 'completed'),
      stepIndex: event.stepIndex ?? previous?.stepIndex ?? 0,
      stepTotal: event.stepTotal ?? previous?.stepTotal ?? 0,
      seq: event.seq,
      timestamp: event.timestamp,
      durationMs: event.durationMs ?? previous?.durationMs,
      message: event.message ?? previous?.message,
      code: event.stepStatus === 'failed' ? event.code ?? previous?.code : previous?.code,
    };
    const streamStatus =
      event.stepStatus === 'failed'
        ? 'failed'
        : event.event === 'tool_started'
          ? 'retrieving'
          : 'generating';

    publish({
      steps: { ...state.steps, [id]: step },
      status: streamStatus,
      executionMode: event.mode ?? state.executionMode,
      requestId: event.requestId ?? state.requestId,
      errorCode: event.code ?? state.errorCode,
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
        // agent_finished 可能已经给出 truncated；[DONE] 只负责收尾，不能把截断覆盖成 completed。
        state = { ...state, status: state.status === 'truncated' ? 'truncated' : 'completed' };
        options.onState(state);
        completed = true;
        break;
      }
      let event: ChatSsePayload;
      try { event = JSON.parse(frame.data); }
      catch { throw new ApiError('流式响应格式错误', 'LLM_STREAM_INCOMPLETE', undefined, true); }
      const seq = 'seq' in event ? event.seq : undefined;
      if (typeof seq === 'number') {
        if (seenSeq.has(seq)) continue;
        seenSeq.add(seq);
      }
      if ('warning' in event) { options.onWarning?.(event.warning); continue; }
      if ('type' in event && event.type === 'message_meta') { options.onMessageMeta?.(event); continue; }
      state = reduceChatEvent(state, event);
      options.onState(state, 'type' in event && event.type === 'text' && event.replayed === true);
      if ('error' in event) throw new ApiError(event.error, event.code, event.requestId, event.retryable ?? false);
      if ('type' in event && event.type === 'agent_status' && event.event === 'error') {
        throw new ApiError(event.message || '回答生成失败', event.code, event.requestId);
      }
      // agent_finished 表示回答已结束；仍等待 [DONE] 或连接关闭。
      if ('type' in event && event.type === 'agent_status' && event.event === 'agent_finished') {
        completed = true;
      }
    }
    if (!completed) throw new ApiError('连接提前结束，回答不完整，请重试', 'LLM_STREAM_INCOMPLETE', undefined, true);
  } catch (error) {
    if (options.signal?.aborted) {
      options.onState({ ...state, status: 'aborted' });
      throw new DOMException('The operation was aborted.', 'AbortError');
    }
    throw error;
  }
  return state;
}
