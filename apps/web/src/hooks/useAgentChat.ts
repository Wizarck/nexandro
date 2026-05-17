import type { AgentChatSendRequest, AgentChatSseEvent } from '@nexandro/ui-kit';

/**
 * Wave 1.13 [3b] — `useAgentChat`. Owns the SSE connection lifecycle for the
 * `<AgentChatWidget />` UI primitive.
 *
 * The widget calls `send(req)` once per turn and consumes the returned
 * async-iterable to render token-by-token. This hook does NOT use TanStack
 * Query mutations because SSE is unidirectional streaming, not a single
 * request/response — the cache primitives don't model this well, and a
 * plain async-iterable is the simplest fit.
 *
 * Returns a stable `send` callback suitable for the widget's `onSend` prop:
 *
 *     const { send } = useAgentChat();
 *     return <AgentChatWidget {...} onSend={send} />;
 *
 * Lifecycle:
 *   - One `send` call → one HTTP POST to `/agent-chat/stream`.
 *   - The fetch response body is parsed frame-by-frame; events are yielded
 *     to the consumer as they arrive.
 *   - When the consumer breaks out of the loop (component unmounts mid-stream
 *     or the user closes the sidesheet), the AbortController fires and the
 *     fetch is cancelled.
 */
export function useAgentChat(): { send: (req: AgentChatSendRequest) => AsyncIterable<AgentChatSseEvent> } {
  const baseUrl = import.meta.env.VITE_API_URL ?? '';

  return {
    send: (req) => streamFromApi(baseUrl, req),
  };
}

async function* streamFromApi(
  baseUrl: string,
  req: AgentChatSendRequest,
): AsyncIterable<AgentChatSseEvent> {
  const controller = new AbortController();
  let response: Response;
  try {
    response = await fetch(`${baseUrl}/agent-chat/stream`, {
      method: 'POST',
      credentials: 'include',
      signal: controller.signal,
      headers: {
        'content-type': 'application/json',
        accept: 'text/event-stream',
      },
      body: JSON.stringify(req),
    });
  } catch (err) {
    yield {
      event: 'error',
      data: {
        code: 'AGENT_CHAT_TRANSPORT_ERROR',
        message: (err as Error).message ?? 'unknown',
      },
    };
    return;
  }

  if (!response.ok) {
    yield {
      event: 'error',
      data: {
        code: response.status === 404 ? 'AGENT_CHAT_DISABLED' : 'AGENT_CHAT_HTTP_ERROR',
        message:
          response.status === 404
            ? 'Agent chat is not enabled in this environment.'
            : `Server returned ${response.status}.`,
      },
    };
    return;
  }
  if (!response.body) {
    yield {
      event: 'error',
      data: { code: 'AGENT_CHAT_EMPTY_BODY', message: 'no response body from server' },
    };
    return;
  }

  try {
    for await (const event of parseSseStream(response.body)) {
      yield event;
      if (event.event === 'done' || event.event === 'error') return;
    }
  } finally {
    controller.abort();
  }
}

async function* parseSseStream(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<AgentChatSseEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buffer.indexOf('\n\n')) >= 0) {
      const frame = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      const parsed = parseFrame(frame);
      if (parsed) yield parsed;
    }
  }
}

function parseFrame(frame: string): AgentChatSseEvent | null {
  let event: string | null = null;
  const dataLines: string[] = [];
  for (const line of frame.split('\n')) {
    if (!line || line.startsWith(':')) continue;
    if (line.startsWith('event:')) event = line.slice(6).trim();
    else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
  }
  if (!event || dataLines.length === 0) return null;
  let data: unknown;
  try {
    data = JSON.parse(dataLines.join('\n'));
  } catch {
    return null;
  }
  switch (event) {
    case 'token':
    case 'tool-calling':
    case 'proactive':
    case 'image':
    case 'done':
    case 'error':
      return { event, data } as AgentChatSseEvent;
    default:
      return null;
  }
}
