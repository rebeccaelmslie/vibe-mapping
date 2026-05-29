'use client';

import { useRef, useState } from 'react';

const ACCEPT = '.geojson,.json,.zip,.kml,.gpx';

export function UploadDropzone({
  onFile,
  busy,
}: {
  onFile: (file: File) => void;
  busy: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  function handleFiles(files: FileList | null) {
    const file = files?.[0];
    if (file && !busy) onFile(file);
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        handleFiles(e.dataTransfer.files);
      }}
      onClick={() => inputRef.current?.click()}
      className={`cursor-pointer rounded-lg border-2 border-dashed p-4 text-center text-sm transition-colors ${
        dragging ? 'border-blue-500 bg-blue-500/10' : 'border-neutral-700 text-neutral-400'
      } ${busy ? 'pointer-events-none opacity-50' : ''}`}
    >
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
      {busy ? 'Uploading & inspecting…' : 'Drop a shapefile (.zip), GeoJSON, KML or GPX — or click to browse'}
    </div>
  );
}
