// WO-310 W1+W2 · Static schema model of `supabase/migrations/*.sql`.
//
// ONE parser, TWO consumers — that is the whole point:
//   • `scripts/check-migrations.mjs` (CI, every PR via the offline suite) uses it to
//     REFUSE a migration that ships a table without tenancy, a write policy that is
//     `true`, or an ungated SECURITY DEFINER function.
//   • `tests/rls_isolation.ts` (db-tests job) uses it to ENUMERATE the tenant-scoped
//     tables it must probe — so table #46 is covered the moment its migration lands,
//     with no test edit. A hand-written table array is exactly how the previous
//     coverage gap (12 of 45) opened.
//
// Zero dependencies (Node built-ins only) so both the CLI guard and a tsx test can
// import it without a build step.
//
// ── Scope of the parse ───────────────────────────────────────────────────────────
// This is a deliberately small, PATTERN-MATCHING reader, not a SQL parser. It models
// exactly the four statement shapes this repo actually uses:
//   1. `create table [if not exists] <t> ( ... );`
//   2. `alter table <t> enable row level security;`
//   3. `create policy <p> on <t> [for <cmd>] [using (...)] [with check (...)];`
//      + `drop policy [if exists] <p> on <t>;`
//   4. `create [or replace] function <f>(...) ... security definer ...;`
//      + `revoke ... on function <f>(...) from ... anon/authenticated ...;`
// plus the repo's TWO dynamic idioms inside `do $$ … end $$;` blocks, which are
// expanded before matching (see `expandDoBlocks`):
//   a. `foreach t in array array['a','b'] loop … execute format('… %1$I …', t) … end loop;`
//   b. `declare t text := 'a'; begin … execute format('… %1$I …', t) …`
// If a future migration invents a third idiom the parser will simply not see its
// tables/policies — which fails CLOSED (the guard reports "no policy"), never open.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const DEFAULT_DIR = "supabase/migrations";

const IDENT = String.raw`(?:"[^"]+"|[a-z_][a-z0-9_$]*)`;
const unquote = (s) => s.replace(/^"(.*)"$/, "$1").toLowerCase();

/** Strip `--` line comments (keeps SQL string literals intact enough for our patterns). */
function stripLineComments(sql) {
  return sql.replace(/--[^\n]*/g, "");
}

/**
 * Expand the repo's two dynamic-DDL idioms so the literal matchers below see real
 * table names. For every `do $$ … end $$;` block we collect the table names bound to
 * the loop/declare variable, then emit one substituted copy of the block per name
 * (`%1$I`, `%1$s`, `%I`, `%s` → the name). The ORIGINAL block text is kept too, so
 * literal statements inside a `do $$ begin … end $$;` guard still match.
 * @param {string} sql
 * @returns {string}
 */
function expandDoBlocks(sql) {
  const out = [sql];
  const blockRe = /do\s+\$\$([\s\S]*?)end\s*\$\$\s*;/gi;
  let m;
  while ((m = blockRe.exec(sql)) !== null) {
    const block = m[1];
    const names = new Set();
    // (a) foreach t in array array['a','b'] loop
    for (const fm of block.matchAll(/foreach\s+\w+\s+in\s+array\s+array\s*\[([^\]]*)\]/gi)) {
      for (const lit of fm[1].matchAll(/'([^']+)'/g)) names.add(lit[1].toLowerCase());
    }
    // (b) declare t text := 'a';
    for (const dm of block.matchAll(/\b\w+\s+text\s*:=\s*'([^']+)'/gi)) names.add(dm[1].toLowerCase());
    if (!names.size) continue;
    for (const n of names) out.push(block.replace(/%1\$[Is]|%[Is]\b/g, n));
  }
  return out.join("\n");
}

/**
 * @typedef {{ name: string, cmd: string, using: string|null, withCheck: string|null, file: string }} PolicyInfo
 * @typedef {{ name: string, file: string, hasTenantId: boolean, tenantIdNotNull: boolean,
 *             rlsEnabled: boolean, policies: PolicyInfo[] }} TableInfo
 * @typedef {{ name: string, file: string, revokedFrom: Set<string> }} FunctionInfo
 */

/**
 * Build the static schema model from a migrations directory.
 * @param {string} [dir]
 * @returns {{ tables: Map<string, TableInfo>, definerFunctions: Map<string, FunctionInfo>, files: string[] }}
 */
export function parseMigrations(dir = DEFAULT_DIR) {
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();

  /** @type {Map<string, TableInfo>} */
  const tables = new Map();
  /** @type {Map<string, FunctionInfo>} */
  const definerFunctions = new Map();
  /** @type {Map<string, Set<string>>} functionName → roles revoked from */
  const revokes = new Map();

  for (const file of files) {
    const raw = stripLineComments(readFileSync(join(dir, file), "utf8"));
    const sql = expandDoBlocks(raw);

    // 1. create table <t> ( <body> );  — body is matched to the FIRST line that
    //    closes the column list at column 0 (`);`), which is this repo's style.
    const tableRe = new RegExp(
      String.raw`create\s+table\s+(?:if\s+not\s+exists\s+)?(${IDENT})\s*\(([\s\S]*?)\n\s*\)\s*;`,
      "gi",
    );
    for (const t of sql.matchAll(tableRe)) {
      const name = unquote(t[1]);
      if (tables.has(name)) continue; // `if not exists` re-declaration
      const body = t[2];
      const tenantCol = body.match(/^\s*tenant_id\b([^\n,]*)/im);
      tables.set(name, {
        name,
        file,
        hasTenantId: Boolean(tenantCol),
        tenantIdNotNull: Boolean(tenantCol && /not\s+null/i.test(tenantCol[1])),
        primaryKey: primaryKeyOf(body),
        rlsEnabled: false,
        policies: [],
      });
    }

    // 1b. alter table <t> alter column tenant_id { drop | set } not null;
    for (const a of sql.matchAll(
      new RegExp(String.raw`alter\s+table\s+(?:if\s+exists\s+)?(${IDENT})\s+alter\s+column\s+tenant_id\s+(drop|set)\s+not\s+null`, "gi"),
    )) {
      const t = tables.get(unquote(a[1]));
      if (t) t.tenantIdNotNull = a[2].toLowerCase() === "set";
    }

    // 2. alter table <t> enable row level security;
    for (const r of sql.matchAll(
      new RegExp(String.raw`alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?(${IDENT})\s+enable\s+row\s+level\s+security`, "gi"),
    )) {
      const t = tables.get(unquote(r[1]));
      if (t) t.rlsEnabled = true;
    }

    // 3a. drop policy [if exists] <p> on <t>;   (applied before creates in-file, which
    //     matches this repo's `drop … ; create …` replace idiom.)
    for (const d of sql.matchAll(
      new RegExp(String.raw`drop\s+policy\s+(?:if\s+exists\s+)?(${IDENT})\s+on\s+(?:only\s+)?(${IDENT})`, "gi"),
    )) {
      const t = tables.get(unquote(d[2]));
      if (!t) continue;
      const p = unquote(d[1]);
      t.policies = t.policies.filter((x) => x.name !== p);
    }

    // 3b. create policy <p> on <t> [for <cmd>] [to <roles>] [using (…)] [with check (…)];
    const policyRe = new RegExp(
      String.raw`create\s+policy\s+(${IDENT})\s+on\s+(?:only\s+)?(${IDENT})([\s\S]*?);`,
      "gi",
    );
    for (const p of sql.matchAll(policyRe)) {
      const t = tables.get(unquote(p[2]));
      if (!t) continue;
      const tail = p[3];
      const cmd = (tail.match(/\bfor\s+(all|select|insert|update|delete)\b/i)?.[1] ?? "all").toLowerCase();
      const name = unquote(p[1]);
      t.policies = t.policies.filter((x) => x.name !== name);
      t.policies.push({
        name,
        cmd,
        using: balancedExpr(tail, /\busing\s*\(/i),
        withCheck: balancedExpr(tail, /\bwith\s+check\s*\(/i),
        file,
      });
    }

    // 4a. create [or replace] function <f>( … ) <options> as $$ … $$
    //     `security definer` is an OPTION, so it always sits between the arg list and
    //     the body delimiter — look only there (the body may mention it in prose).
    const fnRe = new RegExp(
      String.raw`create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?(${IDENT})\s*\(([^)]*)\)([\s\S]*?)(?:\bas\s+(?:\$\w*\$|')|;)`,
      "gi",
    );
    for (const f of sql.matchAll(fnRe)) {
      if (!/\bsecurity\s+definer\b/i.test(f[3])) continue;
      const name = unquote(f[1]);
      if (!definerFunctions.has(name)) definerFunctions.set(name, { name, file, revokedFrom: new Set() });
    }

    // 4b. revoke … on function <f>( … ) from <roles>;
    for (const r of sql.matchAll(
      new RegExp(String.raw`revoke\s+[\s\S]*?\bon\s+function\s+(?:public\.)?(${IDENT})\s*\([^)]*\)\s*from\s+([^;]+);`, "gi"),
    )) {
      const name = unquote(r[1]);
      const roles = r[2].split(",").map((s) => s.trim().toLowerCase());
      const set = revokes.get(name) ?? new Set();
      for (const role of roles) set.add(role);
      revokes.set(name, set);
    }
  }

  for (const [name, set] of revokes) {
    const fn = definerFunctions.get(name);
    if (fn) for (const r of set) fn.revokedFrom.add(r);
  }

  return { tables, definerFunctions, files };
}

/**
 * Primary-key column(s) of a `create table` body — inline (`id uuid primary key`) or
 * table-level (`primary key (source, partition)`). The isolation test needs this to
 * aim its direct-id probe: `capture_token` is keyed on `token`, `firm_billing` on
 * `tenant_id`, so a hardcoded "id" would silently skip them.
 * @param {string} body
 * @returns {string[]}
 */
function primaryKeyOf(body) {
  const table = body.match(/^\s*(?:constraint\s+\S+\s+)?primary\s+key\s*\(([^)]*)\)/im);
  if (table) return table[1].split(",").map((c) => unquote(c.trim()));
  const inline = body.match(new RegExp(String.raw`^\s*(${IDENT})\s+[^,\n]*?\bprimary\s+key\b`, "im"));
  return inline ? [unquote(inline[1])] : [];
}

/**
 * Extract a parenthesis-balanced expression that follows `open` (e.g. `using (`),
 * normalised to lowercase with collapsed whitespace. Returns null if absent.
 * @param {string} text
 * @param {RegExp} open
 * @returns {string|null}
 */
function balancedExpr(text, open) {
  const m = text.match(open);
  if (!m || m.index === undefined) return null;
  let depth = 1;
  let i = m.index + m[0].length;
  const start = i;
  for (; i < text.length && depth > 0; i++) {
    if (text[i] === "(") depth++;
    else if (text[i] === ")") depth--;
  }
  return text.slice(start, i - 1).trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * The tables the isolation test must probe: every table that carries a `tenant_id`
 * column. Derived, never hand-listed. Sorted for stable output.
 * @param {string} [dir]
 * @returns {string[]}
 */
export function tenantScopedTables(dir = DEFAULT_DIR) {
  const { tables } = parseMigrations(dir);
  return [...tables.values()].filter((t) => t.hasTenantId).map((t) => t.name).sort();
}
