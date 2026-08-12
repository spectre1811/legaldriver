// WO-408 E3 — pure cascade-partition logic for the clients bulk-delete guard (offline-testable,
// no DB/React here). The rule: a client with ANY row in `matter.client_id` is "linked" and can't
// be deleted — the SAME signal the roster already shows in its own "Matters" column (WYSIWYG, not
// a second silently-different count). Everything else is deletable.
//
// Used TWICE, by the same function (never forked): client-side, to render the cascade-confirm
// dialog instantly off the rows already on the page; and server-side (clients/actions.ts
// `deleteClients`), the real, re-verified guard that decides what actually gets soft-deleted. The
// server call NEVER trusts the client-side partition — it recomputes `linkedIds` from a fresh
// `matter` query every time, so a stale or tampered selection can't slip a linked client through.
export function partitionByLinkedMatters<T extends { id: string }>(
  clients: readonly T[],
  linkedIds: ReadonlySet<string>,
): { deletable: T[]; blocked: T[] } {
  const deletable: T[] = [];
  const blocked: T[] = [];
  for (const c of clients) (linkedIds.has(c.id) ? blocked : deletable).push(c);
  return { deletable, blocked };
}
