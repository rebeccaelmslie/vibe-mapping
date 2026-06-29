'use client';

// Shared artifact-attach UI for both the editor and export-view prompts:
// a hook that turns a picked file into an Artifact, plus the attach button
// and the preview chip.

import { useRef, useState, type RefObject } from 'react';
import {
  fileToArtifact,
  ARTIFACT_ACCEPT,
  UnsupportedArtifactError,
  ArtifactTooLargeError,
  type Artifact,
} from '@/lib/artifact';

export function useArtifactPicker(onError?: (message: string) => void) {
  const [artifact, setArtifact] = useState<Artifact | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function pick(file: File | undefined) {
    if (!file) return;
    try {
      setArtifact(await fileToArtifact(file));
    } catch (e) {
      const msg =
        e instanceof UnsupportedArtifactError || e instanceof ArtifactTooLargeError
          ? e.message
          : 'Could not read that file.';
      onError?.(msg);
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  return { artifact, setArtifact, fileRef, pick };
}

export function ArtifactAttachButton({
  fileRef,
  onPick,
  disabled,
}: {
  fileRef: RefObject<HTMLInputElement | null>;
  onPick: (file: File | undefined) => void;
  disabled?: boolean;
}) {
  return (
    <>
      <input
        ref={fileRef}
        type="file"
        accept={ARTIFACT_ACCEPT}
        className="hidden"
        onChange={(e) => onPick(e.target.files?.[0] ?? undefined)}
      />
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        disabled={disabled}
        title="Attach a file (image, PDF, or text) for Claude to consider"
        aria-label="Attach a file"
        className="self-end rounded-md border border-neutral-700 px-3 py-2 text-sm text-neutral-300 hover:bg-neutral-800 disabled:opacity-40"
      >
        📎
      </button>
    </>
  );
}

export function ArtifactPreview({ artifact, onRemove }: { artifact: Artifact; onRemove: () => void }) {
  return (
    <div className="mb-2 flex items-center gap-2 rounded-md border border-neutral-700 bg-neutral-900 p-2">
      {artifact.kind === 'image' && artifact.previewUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={artifact.previewUrl} alt="" className="h-12 w-12 rounded object-cover" />
      ) : (
        <div className="flex h-12 w-12 items-center justify-center rounded bg-neutral-800 text-xl" aria-hidden>
          {artifact.kind === 'pdf' ? '📄' : '📝'}
        </div>
      )}
      <span className="flex-1 truncate text-xs text-neutral-400">{artifact.name}</span>
      <button
        type="button"
        onClick={onRemove}
        className="rounded px-2 py-1 text-xs text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200"
        aria-label="Remove file"
      >
        Remove
      </button>
    </div>
  );
}
