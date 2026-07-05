// WO-32 · CodeLabel now lives in the shared court kit (BP-17). Re-exported here so existing
// imports (`@/components/code-label`) keep working. The kit type is structurally identical to
// `Expanded` from "@/lib/court/code-labels", so callers pass expandCaseType(...) unchanged.
export { CodeLabel } from "./court/code-label";
