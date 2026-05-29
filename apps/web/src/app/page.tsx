import { RENDERER_PACKAGE } from '@vibe/map-renderer';

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-4xl font-bold">Vibe Mapping</h1>
      <p className="max-w-md text-neutral-400">
        Upload your spatial data and build maps by chatting. The map + chat workspace lands in
        Phase 4.
      </p>
      <code className="rounded bg-neutral-800 px-3 py-1 text-xs text-neutral-300">
        {RENDERER_PACKAGE}
      </code>
    </main>
  );
}
