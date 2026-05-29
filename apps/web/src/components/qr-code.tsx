'use client';

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

export function QrCode({ value, size = 160 }: { value: string; size?: number }) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    QRCode.toDataURL(value, { width: size, margin: 1 })
      .then((url) => active && setSrc(url))
      .catch(() => active && setSrc(null));
    return () => {
      active = false;
    };
  }, [value, size]);

  if (!src) return <div style={{ width: size, height: size }} className="rounded bg-neutral-800" />;
  // eslint-disable-next-line @next/next/no-img-element -- data URL, not a remote asset
  return <img src={src} width={size} height={size} alt="Share QR code" className="rounded bg-white p-2" />;
}
