import { NextResponse, type NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// WO-323 · CSP violation sink. The security headers ship `Content-Security-Policy-Report-Only`
// (WO-316) with a `report-uri` pointing here, so the report-only phase actually observes: browsers
// POST a violation report and we log a bounded, PII-free summary. This is how we size what to allow
// before the policy is enforced. Never fails the browser (always 204).
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const r: Record<string, unknown> =
      (body && (body["csp-report"] as Record<string, unknown> | undefined)) ?? body ?? {};
    // Only the directive + the blocked/document URIs — never headers, cookies, or bodies.
    console.warn(
      `[csp] ${JSON.stringify({
        directive: r["violated-directive"] ?? r["effectiveDirective"] ?? null,
        blocked: String(r["blocked-uri"] ?? r["blockedURL"] ?? "").slice(0, 200),
        doc: String(r["document-uri"] ?? r["documentURL"] ?? "").slice(0, 200),
      })}`,
    );
  } catch {
    // a malformed report is not worth a 500 — the header is best-effort telemetry
  }
  return new NextResponse(null, { status: 204 });
}
