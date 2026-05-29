'use client';

import { useState, useRef, useEffect } from 'react';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  applied?: string[];
}

export function ChatPanel({
  messages,
  busy,
  onSend,
}: {
  messages: ChatMessage[];
  busy: boolean;
  onSend: (text: string) => void;
}) {
  const [input, setInput] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, busy]);

  function submit() {
    const text = input.trim();
    if (!text || busy) return;
    setInput('');
    onSend(text);
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.length === 0 && (
          <p className="text-sm text-neutral-500">
            Upload data, then ask me to style it — e.g. “make the tracks dashed orange and label
            them by name”.
          </p>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            className={
              m.role === 'user'
                ? 'ml-8 rounded-lg bg-blue-600 px-3 py-2 text-sm text-white'
                : 'mr-8 rounded-lg bg-neutral-800 px-3 py-2 text-sm text-neutral-100'
            }
          >
            <p className="whitespace-pre-wrap">{m.content}</p>
            {m.applied && m.applied.length > 0 && (
              <ul className="mt-2 space-y-1 border-t border-neutral-700 pt-2 text-xs text-neutral-400">
                {m.applied.map((a, j) => (
                  <li key={j}>• {a}</li>
                ))}
              </ul>
            )}
          </div>
        ))}
        {busy && <p className="text-sm text-neutral-500">Thinking…</p>}
        <div ref={endRef} />
      </div>

      <div className="border-t border-neutral-800 p-3">
        <div className="flex gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            rows={2}
            placeholder="Describe the map you want…"
            className="flex-1 resize-none rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-neutral-500"
          />
          <button
            onClick={submit}
            disabled={busy || !input.trim()}
            className="self-end rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
