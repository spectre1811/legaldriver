// WO-310 · Types for the shared migration parser (`migration-schema.mjs`).
// Hand-written because `scripts/` is excluded from the app tsconfig, and
// `tests/rls_isolation.ts` (which IS typechecked) imports it.

export interface PolicyInfo {
  /** Policy name, lowercased and unquoted. */
  name: string;
  /** `select` | `insert` | `update` | `delete` | `all` (PostgreSQL's default when `for` is omitted). */
  cmd: string;
  /** The `using (...)` predicate, whitespace-collapsed + lowercased, or null. */
  using: string | null;
  /** The `with check (...)` predicate, whitespace-collapsed + lowercased, or null. */
  withCheck: string | null;
  /** Migration file the policy's final definition came from. */
  file: string;
}

export interface TableInfo {
  name: string;
  /** Migration file that created the table. */
  file: string;
  hasTenantId: boolean;
  tenantIdNotNull: boolean;
  /** Primary-key column(s): inline (`id uuid primary key`) or table-level (`primary key (a, b)`). */
  primaryKey: string[];
  rlsEnabled: boolean;
  policies: PolicyInfo[];
}

export interface FunctionInfo {
  name: string;
  file: string;
  /** Roles the function's EXECUTE was revoked from (lowercased). */
  revokedFrom: Set<string>;
}

export interface MigrationModel {
  tables: Map<string, TableInfo>;
  definerFunctions: Map<string, FunctionInfo>;
  files: string[];
}

export function parseMigrations(dir?: string): MigrationModel;

/** Every table carrying a `tenant_id` column, sorted. Derived from the migrations — never hand-listed. */
export function tenantScopedTables(dir?: string): string[];
