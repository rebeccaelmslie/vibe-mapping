// Public config (safe in the browser).
export const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8787';
export const MAPTILER_KEY = process.env.NEXT_PUBLIC_MAPTILER_API_KEY ?? '';

// Dev auth: a fixed user id sent to the API. Swap for a Clerk session in a
// later auth pass — the API already reads `x-dev-user-id`.
export const DEV_USER_ID = 'dev_user';
