'use client';

import { useState, useRef, useEffect } from 'react';
import type { Artifact } from '@/lib/artifact';
import { useArtifactPicker, ArtifactAttachButton, ArtifactPreview } from './artifact-attach';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  applied?: string[];
  /** File attached to a user message, for display. */
  artifact?: { kind: Artifact['kind']; name: string; previewUrl?: string };
}

export function ChatPanel({
  messages,
  busy,
  onSend,
  onError,
}: {
  messages: ChatMessage[];
  busy: boolean;
  onSend: (text: string, artifact?: Artifact) => void;
  onError?: (message: string) => void;
}) {
  const [input, setInput] = useState('');
  const { artifact, setArtifact, fileRef, pick } = useArtifactPicker(onError);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, busy]);

  function submit() {
    const text = input.trim();
    // Allow sending with just a file (we supply a default ask below).
    if ((!text && !artifact) || busy) return;
    const ask = text || 'Take a look at this file and use it for my map.';
    setInput('');
    setArtifact(null);
    onSend(ask, artifact ?? undefined);
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.length === 0 && (
          <p className="text-sm text-neutral-500">
            Upload data, then ask me to style it — e.g. “make the tracks dashed orange and label
            them by name”. You can also attach a file (image, PDF, notes) for me to work from.
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
            {m.artifact &&
              (m.artifact.kind === 'image' && m.artifact.previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={m.artifact.previewUrl}
                  alt={m.artifact.name}
                  className="mb-2 max-h-40 w-full rounded-md object-cover"
                />
              ) : (
                <div className="mb-2 flex items-center gap-2 rounded-md bg-black/20 px-2 py-1 text-xs">
                  <span aria-hidden>{m.artifact.kind === 'pdf' ? '📄' : '📝'}</span>
                  <span className="truncate">{m.artifact.name}</span>
                </div>
              ))}
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
        {artifact && <ArtifactPreview artifact={artifact} onRemove={() => setArtifact(null)} />}
        <div className="flex gap-2">
          <ArtifactAttachButton fileRef={fileRef} onPick={pick} disabled={busy} />
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
            disabled={busy || (!input.trim() && !artifact)}
            className="self-end rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
