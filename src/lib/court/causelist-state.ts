// WO-205 W3 · The cause-list board's honest-state machine. Pure (no DOM, no React, no network) so
// the branch logic is unit-tested offline (tests/wo205_causelist_cascade.ts) and the page + fetch
// island stay dumb renderers of a resolved state. Mirrors the ecourts-scraper read-through
// contract's honest vocabulary (found | fetching | empty) — the surface never shows a raw 404 or a
// spinner-forever, and never fabricates a board.

/** The rendered board state. One of these, never ambiguous:
 *  - `pick`      — no court chosen yet (the cascade is still open).
 *  - `held`      — we hold a board for this court+date → render it (fast, server-rendered).
 *  - `fetching`  — a held miss on a live-retrievable (District) court → the on-demand lane is
 *                  retrieving; render the skeleton + "retrieving the board". Non-blocking.
 *  - `empty`     — the on-demand lane confirmed there's genuinely no board for this court+date.
 *  - `hcUnheld`  — a held miss on a High Court date → NOT retrievable live (HC lists are PDF-only,
 *                  WO-150); render the honest "not yet retrievable live" state, never a fake queue.
 *  - `error`     — the on-demand request itself failed (network/transient) → honest retry. */
export type BoardState = "pick" | "held" | "fetching" | "empty" | "hcUnheld" | "error";

/** The on-demand fetch outcome, mapped from the W2 endpoint's HTTP status:
 *  200 found → "found" · 200/empty → "empty" · 202 → "fetching" · 422 (not_a_record/HC) → "empty"
 *  (the surface already gates HC before calling, so a 422 here means "no board") · network → "error". */
export type FetchOutcome = "found" | "fetching" | "empty" | "error";

/** Map a W2 `POST /v1/cause-lists/fetch` HTTP status to a fetch outcome. `null` = the request never
 *  completed (network / abort) → "error". 200 needs the body to tell found vs empty (see caller). */
export function outcomeFromStatus(status: number | null, hasItems: boolean): FetchOutcome {
  if (status === null) return "error";
  if (status === 200) return hasItems ? "found" : "empty";
  if (status === 202) return "fetching";
  if (status === 422) return "empty"; // HC/District-only/not_a_record — the surface pre-gates HC, so this is "no board"
  return "error"; // 5xx and anything unexpected → honest retry, never a silent empty
}

/**
 * Resolve the initial board state on a server render, BEFORE any on-demand call. `heldCount` is how
 * many rows we already hold for this court+date. `onDemandLive` is whether the W2 lane is wired in
 * prod (the feature flag) — when it isn't, a District miss falls straight to `empty` (honest), never
 * a spinner for a lane that can't run.
 */
export function initialBoardState(input: {
  courtId: string | null;
  tier: "HIGH" | "DISTRICT" | null;
  heldCount: number;
  onDemandLive: boolean;
}): BoardState {
  if (!input.courtId || !input.tier) return "pick";
  if (input.heldCount > 0) return "held";
  // A held miss. HC is never live-retrievable (PDF-only). District → the on-demand lane, if live.
  if (input.tier === "HIGH") return "hcUnheld";
  return input.onDemandLive ? "fetching" : "empty";
}

/** Reduce an in-flight on-demand outcome to the next board state. `found` means the poll should stop
 *  and the caller re-reads the held board (router.refresh). Kept pure so the island's effect is a
 *  thin driver over this. */
export function nextFromOutcome(outcome: FetchOutcome): BoardState {
  switch (outcome) {
    case "found":
      return "held"; // caller refreshes the server board, which now holds it
    case "fetching":
      return "fetching"; // keep polling
    case "empty":
      return "empty";
    case "error":
      return "error";
  }
}
