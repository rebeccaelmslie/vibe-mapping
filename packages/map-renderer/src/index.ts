// @vibe/map-renderer — the ONLY place that translates a MapSpec into a
// MapLibre style JSON. Imported by both apps/web and apps/mobile.
// The real `mapSpecToStyle(spec)` implementation lands in Phase 2.

import { SHARED_PACKAGE } from '@vibe/shared';

export const RENDERER_PACKAGE = `@vibe/map-renderer (built on ${SHARED_PACKAGE})`;
