// EXPO_PUBLIC_* vars are inlined into the client bundle by Expo.
// On a physical device, set EXPO_PUBLIC_API_URL to your machine's LAN IP
// (e.g. http://192.168.1.20:8787) — `localhost` points at the device itself.
export const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8787';
export const MAPTILER_KEY = process.env.EXPO_PUBLIC_MAPTILER_API_KEY ?? '';
export const LINZ_KEY = process.env.EXPO_PUBLIC_LINZ_API_KEY ?? '';

/** Accept a raw token or a full share URL (…/s/<token>) and return the token. */
export function extractToken(input: string): string {
  const trimmed = input.trim();
  const match = trimmed.match(/\/s\/([^/?#]+)/);
  return match ? match[1]! : trimmed;
}
