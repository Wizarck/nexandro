import {
  type ChangeEvent,
  type ClipboardEvent,
  type DragEvent,
  type FormEvent,
  type KeyboardEvent,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';
import { cn } from '../../lib/cn';
import type {
  AgentChatWidgetProps,
  ChatBubble,
  ChatSseEvent,
  SendRequest,
} from './AgentChatWidget.types';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB before base64 expansion
const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

function genId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `id-${Math.random().toString(36).slice(2)}-${Date.now()}`;
}

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('FileReader error'));
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.readAsDataURL(file);
  });
}

/**
 * Wave 1.13 [3b] — `AgentChatWidget`.
 *
 * State machine (per ADR-CHAT-W-WIDGET):
 *
 *     closed ──[click FAB]──► open
 *     open   ──[Esc | click X]──► closed (FAB regains focus)
 *     open   ──[type + Enter | type + Send]──► streaming
 *     streaming ──[tool-calling event]──► tool-calling (inline mute note)
 *     tool-calling ──[next token event]──► streaming (back to bubble)
 *     streaming ──[done event]──► open (idle)
 *     streaming ──[error event]──► open + inline error
 *     streaming ──[proactive event]──► open + new agent bubble injected
 *
 * Tokens (per components.md):
 *   --surface (sidesheet bg) · --surface-2 (agent bubble) · --bg (user bubble)
 *   --border · --accent (focus ring + send button) · --ink · --mute (tool note)
 *   --destructive (errors, with icon — never colour-only)
 *
 * No celebration animations on response. Streaming is additive token append.
 */
export function AgentChatWidget(props: AgentChatWidgetProps): JSX.Element | null {
  const {
    agentEnabled,
    initialContext = 'none',
    onSend,
    className,
  } = props;

  const [open, setOpen] = useState(false);
  const [bubbles, setBubbles] = useState<ChatBubble[]>([]);
  const [draftText, setDraftText] = useState('');
  const [draftImage, setDraftImage] = useState<string | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fabRef = useRef<HTMLButtonElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const logRef = useRef<HTMLDivElement | null>(null);
  const labelId = useId();

  // Auto-scroll to bottom on new tokens.
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [bubbles]);

  const justClosed = useRef(false);

  // Auto-focus input when sidesheet opens; restore FAB focus when it closes
  // after having been open (avoids stealing focus on initial mount).
  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
      justClosed.current = true; // mark "we have been open" for the next close
    } else if (!open && justClosed.current && fabRef.current) {
      fabRef.current.focus();
      justClosed.current = false;
    }
  }, [open]);

  // Esc closes the sidesheet. Focus restoration to the FAB is handled by the
  // effect above, which runs AFTER the re-render so the new FAB ref is live.
  useEffect(() => {
    if (!open) return;
    const handler = (e: globalThis.KeyboardEvent): void => {
      if (e.key === 'Escape') {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open]);

  const handleSend = useCallback(
    async (e?: FormEvent): Promise<void> => {
      e?.preventDefault();
      const text = draftText.trim();
      if (!text && !draftImage) return;
      if (streaming) return;
      setErrorMessage(null);

      // Build user bubble + the SendRequest mirroring the wire format.
      const userBubble: ChatBubble = {
        id: genId(),
        role: 'user',
        text,
        attachment: draftImage ? { imageDataUrl: draftImage } : undefined,
      };
      const agentBubble: ChatBubble = {
        id: genId(),
        role: 'agent',
        text: '',
      };

      setBubbles((prev) => [...prev, userBubble, agentBubble]);
      setDraftText('');
      setDraftImage(null);
      setStreaming(true);

      const request: SendRequest = draftImage
        ? {
            message: {
              type: 'image',
              content: { text, imageData: draftImage },
            },
            metadata: initialContext !== 'none' ? { initialContext } : undefined,
          }
        : {
            message: { type: 'text', content: text },
            metadata: initialContext !== 'none' ? { initialContext } : undefined,
          };

      try {
        for await (const event of onSend(request)) {
          applyEvent(setBubbles, agentBubble.id, event);
          if (event.event === 'done') break;
          if (event.event === 'error') {
            setErrorMessage(event.data.message);
            break;
          }
        }
      } catch (err) {
        setErrorMessage((err as Error).message ?? 'unknown error');
      } finally {
        setStreaming(false);
      }
    },
    [draftText, draftImage, streaming, onSend, initialContext],
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>): void => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        void handleSend();
      }
    },
    [handleSend],
  );

  const ingestFile = useCallback(async (file: File): Promise<void> => {
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      setErrorMessage(`unsupported image type: ${file.type}`);
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setErrorMessage(`image too large: ${(file.size / 1024 / 1024).toFixed(1)} MB > 5 MB`);
      return;
    }
    const dataUrl = await fileToDataUrl(file);
    setDraftImage(dataUrl);
  }, []);

  const handleDrop = useCallback(
    async (e: DragEvent<HTMLDivElement>): Promise<void> => {
      e.preventDefault();
      const file = e.dataTransfer?.files?.[0];
      if (file) await ingestFile(file);
    },
    [ingestFile],
  );

  const handlePaste = useCallback(
    async (e: ClipboardEvent<HTMLTextAreaElement>): Promise<void> => {
      const item = Array.from(e.clipboardData?.items ?? []).find(
        (it) => it.kind === 'file' && it.type.startsWith('image/'),
      );
      const file = item?.getAsFile();
      if (file) {
        e.preventDefault();
        await ingestFile(file);
      }
    },
    [ingestFile],
  );

  const handleFilePick = useCallback(
    async (e: ChangeEvent<HTMLInputElement>): Promise<void> => {
      const file = e.target.files?.[0];
      if (file) await ingestFile(file);
      // Reset so picking the same file twice still fires onChange.
      if (fileInputRef.current) fileInputRef.current.value = '';
    },
    [ingestFile],
  );

  if (!agentEnabled) {
    return null;
  }

  if (!open) {
    return (
      <button
        ref={fabRef}
        type="button"
        aria-label="Open agent chat"
        onClick={() => setOpen(true)}
        className={cn(
          'fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center',
          'rounded-full shadow-lg',
          'bg-[var(--accent)] text-[var(--bg)]',
          'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--accent)]',
          'focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]',
          'hover:opacity-90 active:opacity-80',
          'disabled:cursor-not-allowed disabled:opacity-55',
          className,
        )}
      >
        <span aria-hidden className="text-2xl">
          {/* purposefully sparse — no celebration glyph; just a chat marker */}
          ◆
        </span>
      </button>
    );
  }

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-labelledby={labelId}
      className={cn(
        'fixed inset-y-0 right-0 z-50 flex flex-col',
        'w-full sm:w-[400px]',
        'border-l border-[var(--border)]',
        'bg-[var(--surface)] text-[var(--ink)]',
        className,
      )}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => void handleDrop(e)}
    >
      <header
        id={labelId}
        className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3"
      >
        <span className="font-semibold">nexandro</span>
        <button
          type="button"
          aria-label="Close agent chat"
          className={cn(
            'flex h-10 w-10 items-center justify-center rounded',
            'text-[var(--mute)] hover:text-[var(--ink)]',
            'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--accent)]',
          )}
          onClick={() => setOpen(false)}
        >
          ✕
        </button>
      </header>

      <div
        ref={logRef}
        role="log"
        aria-live="polite"
        aria-label="Conversation"
        className="flex-1 overflow-y-auto px-4 py-3"
      >
        {bubbles.length === 0 ? (
          <p className="text-sm text-[var(--mute)]">
            Hola — I&apos;m the nexandro assistant. Ask me anything about
            recipes, suppliers, menus, or the Owner dashboard.
          </p>
        ) : (
          <ul className="space-y-3">
            {bubbles.map((b) => (
              <li
                key={b.id}
                className={cn(
                  'flex',
                  b.role === 'user' ? 'justify-end' : 'justify-start',
                )}
              >
                <div
                  className={cn(
                    'max-w-[85%] rounded-md border border-[var(--border)] px-3 py-2 text-sm',
                    b.role === 'user'
                      ? 'bg-[var(--bg)]'
                      : 'bg-[var(--surface-2)]',
                  )}
                >
                  {b.toolNote ? (
                    <p className="mb-2 text-xs italic text-[var(--mute)]">
                      {b.toolNote}
                    </p>
                  ) : null}
                  {b.attachment ? (
                    <img
                      src={b.attachment.imageDataUrl}
                      alt=""
                      className="mb-2 max-h-40 rounded"
                    />
                  ) : null}
                  {b.text ? <span>{b.text}</span> : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {errorMessage ? (
        <div
          role="alert"
          className={cn(
            'border-t border-[var(--destructive)] px-4 py-2 text-sm',
            'text-[var(--destructive)]',
          )}
        >
          <span aria-hidden>⚠</span> {errorMessage}
        </div>
      ) : null}

      <form
        onSubmit={(e) => void handleSend(e)}
        className="border-t border-[var(--border)] px-4 py-3"
      >
        {draftImage ? (
          <div className="mb-2 flex items-center gap-2">
            <img
              src={draftImage}
              alt="attached"
              className="max-h-16 rounded border border-[var(--border)]"
            />
            <button
              type="button"
              aria-label="Remove attached image"
              onClick={() => setDraftImage(null)}
              className="text-xs text-[var(--mute)] underline"
            >
              remove
            </button>
          </div>
        ) : null}
        <div className="flex items-end gap-2">
          <button
            type="button"
            aria-label="Attach image"
            onClick={() => fileInputRef.current?.click()}
            disabled={streaming}
            className={cn(
              'flex h-10 w-10 items-center justify-center rounded border border-[var(--border)]',
              'text-[var(--mute)] hover:text-[var(--ink)]',
              'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--accent)]',
              'disabled:cursor-not-allowed disabled:opacity-55',
            )}
          >
            +
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept={ALLOWED_IMAGE_TYPES.join(',')}
            className="sr-only"
            onChange={(e) => void handleFilePick(e)}
          />
          <textarea
            ref={inputRef}
            value={draftText}
            onChange={(e) => setDraftText(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={(e) => void handlePaste(e)}
            placeholder={streaming ? 'Streaming…' : 'Ask the agent…'}
            disabled={streaming}
            rows={2}
            aria-label="Message"
            className={cn(
              'flex-1 resize-none rounded border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm',
              'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--accent)]',
              'disabled:cursor-not-allowed disabled:opacity-55',
            )}
          />
          <button
            type="submit"
            aria-label="Send message"
            disabled={streaming || (!draftText.trim() && !draftImage)}
            className={cn(
              'flex h-10 items-center justify-center rounded px-4 text-sm font-semibold',
              'bg-[var(--accent)] text-[var(--bg)]',
              'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--accent)]',
              'focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]',
              'hover:opacity-90 active:opacity-80',
              'disabled:cursor-not-allowed disabled:opacity-55',
            )}
          >
            Send
          </button>
        </div>
      </form>
    </div>
  );
}

/**
 * Apply one SSE event to the agent's in-flight bubble. Pure-ish: returns the
 * new bubbles array. Tool-calling events overwrite the toolNote (only the
 * latest tool call is shown). Token events append to text. Proactive events
 * inject a NEW agent bubble after the current one.
 */
function applyEvent(
  setBubbles: React.Dispatch<React.SetStateAction<ChatBubble[]>>,
  inflightId: string,
  event: ChatSseEvent,
): void {
  setBubbles((prev) => {
    const idx = prev.findIndex((b) => b.id === inflightId);
    if (idx < 0) return prev;
    const next = [...prev];
    const target = { ...next[idx] };
    switch (event.event) {
      case 'token':
        target.text = (target.text ?? '') + event.data.chunk;
        // A new token clears any tool-call note: we're back to streaming.
        target.toolNote = undefined;
        next[idx] = target;
        return next;
      case 'tool-calling':
        target.toolNote = `Calling ${event.data.tool}…`;
        next[idx] = target;
        return next;
      case 'image':
        target.attachment = { imageDataUrl: event.data.url };
        next[idx] = target;
        return next;
      case 'proactive': {
        // Inject a fresh agent bubble for proactive content; keeps it
        // distinguishable from the in-flight reply.
        const proactive: ChatBubble = {
          id: genId(),
          role: 'agent',
          text: event.data.text,
        };
        next.splice(idx + 1, 0, proactive);
        return next;
      }
      case 'done':
      case 'error':
        // Terminal — no bubble mutation; caller handles `streaming=false`.
        return prev;
      default:
        return prev;
    }
  });
}
