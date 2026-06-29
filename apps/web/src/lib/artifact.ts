// A user-uploaded artifact for Claude to contemplate: an image (handed to
// vision), or a document (PDF / text / markdown) Claude reads. Images are
// downscaled; documents are passed through (with a size cap).

import { fileToInspirationImage, ImageTooLargeError, NotAnImageError } from './image';

export type ArtifactKind = 'image' | 'pdf' | 'text';

export interface Artifact {
  kind: ArtifactKind;
  name: string;
  /** image/jpeg | application/pdf | text/plain */
  mediaType: string;
  /** Base64 for image/pdf; raw UTF-8 text for text. */
  data: string;
  /** data: URL for an image thumbnail in the composer/message. */
  previewUrl?: string;
}

export class UnsupportedArtifactError extends Error {}
export class ArtifactTooLargeError extends Error {}

/** Anthropic caps PDFs around 32MB/100pp; keep documents comfortably under. */
const MAX_DOC_BYTES = 20 * 1024 * 1024;

const TEXT_EXT = /\.(txt|md|markdown|csv|tsv|json|log|yaml|yml)$/i;

export async function fileToArtifact(file: File): Promise<Artifact> {
  if (file.type.startsWith('image/')) {
    try {
      const img = await fileToInspirationImage(file);
      return { kind: 'image', name: file.name, mediaType: img.mediaType, data: img.data, previewUrl: img.dataUrl };
    } catch (e) {
      if (e instanceof ImageTooLargeError || e instanceof NotAnImageError) {
        throw new UnsupportedArtifactError(e.message);
      }
      throw e;
    }
  }

  if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) {
    if (file.size > MAX_DOC_BYTES) throw new ArtifactTooLargeError('PDF is too large (max 20 MB).');
    const data = arrayBufferToBase64(await file.arrayBuffer());
    return { kind: 'pdf', name: file.name, mediaType: 'application/pdf', data };
  }

  if (file.type.startsWith('text/') || TEXT_EXT.test(file.name)) {
    if (file.size > MAX_DOC_BYTES) throw new ArtifactTooLargeError('File is too large (max 20 MB).');
    return { kind: 'text', name: file.name, mediaType: 'text/plain', data: await file.text() };
  }

  throw new UnsupportedArtifactError('Unsupported file. Upload an image, PDF, or text file.');
}

/** Accept attribute for the hidden file input. */
export const ARTIFACT_ACCEPT = 'image/*,application/pdf,.pdf,text/*,.txt,.md,.markdown,.csv,.json';

function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = '';
  const chunk = 0x8000; // avoid call-stack limits on String.fromCharCode
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}
