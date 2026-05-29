'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import type { MapSpec } from '@vibe/shared';
import { api, type SourceRow } from '@/lib/api';
import { toCatalog } from '@/lib/catalog';
import { MapView } from '@/components/map-view';
import { ChatPanel, type ChatMessage } from '@/components/chat-panel';
import { UploadDropzone } from '@/components/upload-dropzone';
import { ShareControl } from '@/components/share-control';
import { SourcesPanel } from '@/components/sources-panel';
import { useToast } from '@/components/toast';

async function postChat(spec: MapSpec, sources: ReturnType<typeof toCatalog>, messages: ChatMessage[]) {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      spec,
      sources,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    }),
  });
  const data = (await res.json()) as
    | { spec: MapSpec; message: string; applied: string[] }
    | { error: string };
  if (!res.ok || 'error' in data) {
    throw new Error('error' in data ? data.error : 'Chat failed');
  }
  return data;
}

export default function ProjectWorkspace() {
  const projectId = String(useParams().id);
  const toast = useToast();

  const [projectName, setProjectName] = useState('');
  const [sources, setSources] = useState<SourceRow[]>([]);
  const [mapId, setMapId] = useState<string | null>(null);
  const [spec, setSpec] = useState<MapSpec | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Keep a ref so async callbacks always see the latest spec/messages.
  const specRef = useRef<MapSpec | null>(null);
  specRef.current = spec;

  useEffect(() => {
    (async () => {
      try {
        const { project, sources, maps } = await api.getProject(projectId);
        setProjectName(project.name);
        setSources(sources);
        const map = maps[0] ?? (await api.createMap(projectId, 'Untitled map')).map;
        setMapId(map.id);
        setSpec(map.spec);
      } catch (e) {
        toast(e instanceof Error ? e.message : 'Failed to load project', 'error');
      }
    })();
  }, [projectId, toast]);

  const runChat = useCallback(
    async (history: ChatMessage[], catalog = toCatalog(sources)) => {
      const currentSpec = specRef.current;
      if (!currentSpec || !mapId) return;
      setBusy(true);
      try {
        const { spec: nextSpec, message, applied } = await postChat(currentSpec, catalog, history);
        setSpec(nextSpec);
        setMessages([...history, { role: 'assistant', content: message, applied }]);
        await api.updateMap(mapId, nextSpec);
      } catch (e) {
        toast(e instanceof Error ? e.message : 'Chat failed', 'error');
        setMessages(history);
      } finally {
        setBusy(false);
      }
    },
    [mapId, sources, toast],
  );

  const handleSend = useCallback(
    (text: string) => {
      const history = [...messages, { role: 'user' as const, content: text }];
      setMessages(history);
      void runChat(history);
    },
    [messages, runChat],
  );

  const handleUpload = useCallback(
    async (file: File) => {
      setUploading(true);
      try {
        const { source } = await api.uploadSource(projectId, file);
        const refreshed = await api.getProject(projectId);
        setSources(refreshed.sources);
        if (source.status === 'failed') {
          toast(`Could not read ${file.name}: ${source.error ?? 'unknown error'}`, 'error');
          return;
        }
        // Let the assistant inspect the new source and propose a starting map.
        // Pass a fresh catalog since `sources` state hasn't settled yet.
        const history: ChatMessage[] = [
          ...messages,
          { role: 'user', content: `I just uploaded "${file.name}". Inspect it and propose an initial map.` },
        ];
        setMessages(history);
        await runChat(history, toCatalog(refreshed.sources));
      } catch (e) {
        toast(e instanceof Error ? e.message : 'Upload failed', 'error');
      } finally {
        setUploading(false);
      }
    },
    [projectId, messages, runChat, toast],
  );

  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center justify-between border-b border-neutral-800 px-4 py-2">
        <div className="flex items-center gap-3">
          <Link href="/" className="text-sm text-neutral-400 hover:text-neutral-200">
            ← Projects
          </Link>
          <span className="font-medium">{projectName || 'Loading…'}</span>
        </div>
        <ShareControl mapId={mapId} />
      </header>

      <div className="flex min-h-0 flex-1">
        <div className="relative min-w-0 flex-1">
          {spec ? (
            <MapView spec={spec} />
          ) : (
            <div className="flex h-full items-center justify-center text-neutral-500">Loading map…</div>
          )}
          {spec && spec.layers.length === 0 && (
            <div className="pointer-events-none absolute inset-x-0 top-6 flex justify-center">
              <div className="rounded-full bg-neutral-900/90 px-4 py-2 text-sm text-neutral-300 shadow">
                Upload a file to start your map →
              </div>
            </div>
          )}
        </div>

        <aside className="flex w-[380px] flex-col border-l border-neutral-800">
          <div className="border-b border-neutral-800 p-3">
            <UploadDropzone onFile={handleUpload} busy={uploading} />
          </div>
          <SourcesPanel sources={sources} />
          <div className="min-h-0 flex-1">
            <ChatPanel messages={messages} busy={busy} onSend={handleSend} />
          </div>
        </aside>
      </div>
    </div>
  );
}
