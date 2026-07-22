import type {
  KnowledgeAgentStep,
  KnowledgeAgentStreamState,
} from '../types/chat';

type KnowledgeAgentStatusEvent = KnowledgeAgentStep & {
  type: 'agent_status';
  event:
    | 'agent_started'
    | 'model_started'
    | 'model_finished'
    | 'tool_started'
    | 'tool_finished'
    | 'agent_finished'
    | 'error';
};

type KnowledgeChatEvent = {
  type?: 'text' | 'agent_status';
  text?: string;
  warning?: string;
  error?: string | { message?: string };
} & Partial<KnowledgeAgentStatusEvent>;

interface StreamKnowledgeChatOptions {
  signal?: AbortSignal;
  onState: (state: KnowledgeAgentStreamState) => void;
  onWarning?: (warning: string) => void;
}

export function createKnowledgeAgentState(): KnowledgeAgentStreamState {
  return {
    answer: '',
    steps: {},
    status: 'idle',
  };
}

function getErrorMessage(error: KnowledgeChatEvent['error']) {
  if (typeof error === 'string') return error;
  return error?.message || '知识库 Agent 执行失败';
}

function reduceStatusEvent(
  state: KnowledgeAgentStreamState,
  event: KnowledgeAgentStatusEvent,
): KnowledgeAgentStreamState {
  const { type: _type, event: eventName, ...stepPatch } = event;
  const step: KnowledgeAgentStep = {
    ...state.steps[event.stepKey],
    ...stepPatch,
  };

  return {
    ...state,
    steps: {
      ...state.steps,
      [event.stepKey]: step,
    },
    status:
      eventName === 'error' || event.stepStatus === 'failed'
        ? 'failed'
        : eventName === 'agent_finished'
          ? 'completed'
          : 'running',
    error:
      eventName === 'error'
        ? event.message || '知识库 Agent 执行失败'
        : state.error,
  };
}

export async function consumeKnowledgeChatStream(
  response: Response,
  options: StreamKnowledgeChatOptions,
): Promise<KnowledgeAgentStreamState> {
  if (!response.body) throw new Error('响应正文为空');

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let state = createKnowledgeAgentState();

  const publish = (nextState: KnowledgeAgentStreamState) => {
    state = nextState;
    options.onState(state);
  };

  const processFrame = (frame: string) => {
    const trimmed = frame.trim();
    if (!trimmed || trimmed.startsWith(':')) return false;

    const raw = trimmed
      .split('\n')
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice('data:'.length).trim())
      .join('\n');

    if (!raw) return false;
    if (raw === '[DONE]') {
      if (state.status !== 'failed') {
        publish({ ...state, status: 'completed' });
      }
      return true;
    }

    let event: KnowledgeChatEvent;
    try {
      event = JSON.parse(raw) as KnowledgeChatEvent;
    } catch {
      console.error('解析知识库 Agent SSE 数据失败:', raw);
      return false;
    }

    if (event.type === 'agent_status') {
      publish(reduceStatusEvent(state, event as KnowledgeAgentStatusEvent));
    } else if (event.type === 'text' && typeof event.text === 'string') {
      publish({ ...state, answer: state.answer + event.text });
    } else if (event.warning) {
      options.onWarning?.(event.warning);
      if (typeof event.text === 'string') {
        publish({ ...state, answer: state.answer + event.text });
      }
    }

    if (event.error) {
      const message = getErrorMessage(event.error);
      publish({ ...state, status: 'failed', error: message });
      throw new Error(message);
    }

    return false;
  };

  while (true) {
    if (options.signal?.aborted) {
      await reader.cancel().catch(() => undefined);
      throw new DOMException('The operation was aborted.', 'AbortError');
    }

    const { value, done } = await reader.read();
    buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });

    let boundary = buffer.indexOf('\n\n');
    while (boundary !== -1) {
      const frame = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      if (processFrame(frame)) return state;
      boundary = buffer.indexOf('\n\n');
    }

    if (done) {
      if (buffer.trim()) processFrame(buffer);
      break;
    }
  }

  if (state.status !== 'failed') {
    publish({ ...state, status: 'completed' });
  }
  return state;
}
