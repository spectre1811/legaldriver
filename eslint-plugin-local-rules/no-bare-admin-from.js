"use strict";

// WO-364 W1 — advisory rule (ramp to "error" after a 2-week sweep, per the WO).
//
// Flags `.from(...)` called directly on the RLS-bypassing service-role admin client
// (`createAdminClient()`, or a local variable initialized straight from it) instead of
// through `adminFor(tenantId)` (src/lib/supabase/admin.ts). The bare client has no
// tenant filter of its own — a missing `.eq("tenant_id", …)` on it is a cross-tenant
// leak, not a type error, which is exactly what `adminFor` turns structural.
//
// Deliberately syntactic (no type-aware parserServices), so it only tracks admin
// clients created LOCALLY via `createAdminClient()` in the same file — a client that
// arrives as a bare function parameter (e.g. `function f(admin: SupabaseClient) {…}`)
// isn't traced across files. That's a known, accepted gap for an advisory rule: it
// catches the majority pattern cheaply, with zero new dependencies and zero type-
// checking cost in CI, instead of chasing dataflow it can't see.
//
// A genuinely cross-tenant call (a cron's own fan-out SELECT across every tenant) or a
// table with no tenant_id (`court_provider_health`, `court_cache`, …) still needs the
// raw client — silence the warning there with one line explaining why:
//   // eslint-disable-next-line no-bare-admin-from -- fan-out across all tenants, scoped per-row below

const MESSAGE =
  "Bare `.from()` on the admin (service-role) client bypasses RLS with no tenant scoping. " +
  "Use `adminFor(tenantId).from(...)` (src/lib/supabase/admin.ts), or silence this with a " +
  "one-line reason if the call is genuinely cross-tenant or the table has no tenant_id.";

function isCreateAdminClientCall(node) {
  return (
    !!node &&
    node.type === "CallExpression" &&
    node.callee.type === "Identifier" &&
    node.callee.name === "createAdminClient"
  );
}

module.exports = {
  meta: {
    type: "problem",
    docs: {
      description:
        "flag bare .from() calls on the RLS-bypassing admin client — use adminFor(tenantId) instead",
    },
    schema: [],
    messages: { bareFrom: MESSAGE },
  },
  create(context) {
    // Names of local variables/consts initialized directly from createAdminClient().
    // Per-file (create() is invoked once per file), so no cross-file/module tracking.
    const adminVars = new Set();

    return {
      VariableDeclarator(node) {
        if (node.id.type === "Identifier" && isCreateAdminClientCall(node.init)) {
          adminVars.add(node.id.name);
        }
      },
      CallExpression(node) {
        const callee = node.callee;
        if (callee.type !== "MemberExpression" || callee.computed) return;
        if (callee.property.type !== "Identifier" || callee.property.name !== "from") return;

        const obj = callee.object;
        // Direct chain: createAdminClient().from(...)
        if (isCreateAdminClientCall(obj)) {
          context.report({ node, messageId: "bareFrom" });
          return;
        }
        // Tracked local variable: const admin = createAdminClient(); admin.from(...)
        // (obj.type === "Identifier" excludes `admin.storage.from(...)` — that object is
        // a MemberExpression, not the tracked identifier, so Storage calls are untouched.)
        if (obj.type === "Identifier" && adminVars.has(obj.name)) {
          context.report({ node, messageId: "bareFrom" });
        }
      },
    };
  },
};
