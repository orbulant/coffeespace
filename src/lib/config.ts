/**
 * The seed data is dated June 2026. Staleness / "what changed recently" are
 * computed against a fixed reference date so the demo stays stable no matter when
 * it's run. In production this would simply be `new Date()`.
 */
export const REFERENCE_DATE = new Date("2026-06-30T00:00:00Z");

// A candidate in an active stage with no activity for this many days is "stale".
export const STALE_AFTER_DAYS = 7;

export const CLIENT_ID = "client_tidalwave";

// Anthropic model id, used with the @ai-sdk/anthropic provider. Swap to
// claude-opus-4-8 for max synthesis quality at higher cost.
export const AI_MODEL = "claude-sonnet-4-6";
