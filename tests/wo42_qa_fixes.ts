// WO-42 — QA D3 bug-fix sweep. Offline, no secrets. Run: npx tsx tests/wo42_qa_fixes.ts
// Covers the pure logic (F3 judgment dedup) directly, and locks the a11y / preview-fallback
// contracts by asserting on the committed source so the fixes can't silently regress.
import { readFileSync } from "node:fs";
import { dedupeJudgments, type JudgmentRow } from "../src/lib/court/corpus-athena";

let failed = 0;
function ok(name: string, cond: boolean) {
  console.log(`${cond ? "✓" : "✗ FAIL"} ${name}`);
  if (!cond) failed++;
}
const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

// A minimal JudgmentRow factory — only the identity fields matter for dedup.
function row(o: Partial<JudgmentRow>): JudgmentRow {
  return {
    src: null, cnr: null, title: null, judge: null, court: null, year: null,
    decision_date: null, disposal_nature: null, citation: null, pdf_link: null,
    petitioner: null, respondent: null, ...o,
  };
}

// ── F3: dedupeJudgments (research/judgments duplicate rows + duplicate React key) ──
{
  const a = row({ cnr: "GJHC01", pdf_link: "a.pdf", title: "X v Y", decision_date: "2024-01-01" });
  const aDup = row({ cnr: "GJHC01", pdf_link: "a.pdf", title: "X v Y", decision_date: "2024-01-01" });
  const b = row({ cnr: "GJHC01", pdf_link: "b.pdf", title: "X v Y", decision_date: "2024-02-01" }); // same CNR, distinct order
  const c = row({ cnr: "GJHC02", pdf_link: "c.pdf", title: "P v Q", decision_date: "2024-03-01" });

  const out = dedupeJudgments([a, aDup, b, c]);
  ok("F3: exact duplicate row is collapsed", out.length === 3);
  ok("F3: distinct order sharing a CNR is preserved", out.some((r) => r.pdf_link === "b.pdf"));
  ok("F3: order is stable (first occurrence kept)", out[0] === a && out[1] === b && out[2] === c);

  // Null-heavy rows (SC / older batches) must not collide just because fields are null.
  const n1 = row({ cnr: null, title: "Alpha", pdf_link: null });
  const n2 = row({ cnr: null, title: "Beta", pdf_link: null });
  const n2Dup = row({ cnr: null, title: "Beta", pdf_link: null });
  const nOut = dedupeJudgments([n1, n2, n2Dup]);
  ok("F3: distinct null-cnr rows are kept apart", nOut.length === 2);

  // Separator safety: ["ab","c"] must not equal ["a","bc"] after joining.
  const s1 = row({ cnr: "ab", pdf_link: "c" });
  const s2 = row({ cnr: "a", pdf_link: "bc" });
  ok("F3: field-boundary collision avoided (join separator)", dedupeJudgments([s1, s2]).length === 2);

  ok("F3: empty input → empty output", dedupeJudgments([]).length === 0);
}

// ── F3: the render key is collision-proof (index-suffixed, never bare CNR) ──
// WO-289: the judgments list moved from a <table><tr> to a <ul><li> (order-text search replaced
// the Athena corpus browse) — the row-key regex is element-agnostic so it still locks the SAME
// invariant (index-suffixed, never a bare identity) regardless of markup.
{
  const page = src("src/app/dashboard/search/judgments/page.tsx");
  const rowKey = (page.match(/<(?:tr|li) key=\{([^\n]*?)\} className/) ?? [])[1] ?? "";
  ok("F3: judgments row key includes the row index", /r\.cnr/.test(rowKey) && /\$\{i\}/.test(rowKey));
  ok("F3: judgments key is not the bare `r.cnr` fallback-to-title", rowKey !== "r.cnr ?? `${r.title}-${i}`");
}

// ── F1: icon-only delete has an accessible name (falls back to confirmLabel) ──
{
  const cd = src("src/components/confirm-delete.tsx");
  ok("F1: ConfirmDelete trigger has aria-label", /aria-label=\{label \|\| confirmLabel\}/.test(cd));
}

// ── F2: the draft file input has an accessible name ──
{
  const draft = src("src/app/dashboard/assistant/draft/draft-ui.tsx");
  ok("F2: draft file input has aria-label", /type="file"[^>]*aria-label=\{t\("fileAria"\)\}/s.test(draft));
  // i18n parity for the new keys.
  const en = JSON.parse(src("src/i18n/messages/en.json"));
  const hi = JSON.parse(src("src/i18n/messages/hi.json"));
  ok("F2: draft.fileAria present in en + hi", Boolean(en.draft.fileAria && hi.draft.fileAria));
}

// ── N2/N3: DocPreview never embeds the download URL when there are no stored bytes ──
{
  const comp = src("src/components/doc-preview.tsx");
  ok("N2/N3: DocPreview takes a hasFile prop (default true)", /hasFile = true/.test(comp));
  ok("N2/N3: no-file path short-circuits before any <iframe>/<img>", /if \(!hasFile\)/.test(comp));
  // Callers must thread storage-path presence through.
  const detail = src("src/app/dashboard/documents/[id]/page.tsx");
  ok("N2/N3: detail page passes hasFile from storage_path", /hasFile=\{Boolean\(doc\.storage_path\)\}/.test(detail));
  // WO-334: the quick-look modal was replaced by the restored Notes/zoom DocViewerPanel — the
  // hasFile thread now runs documents-browser.tsx (passes the whole DocRow) → doc-viewer-panel.tsx
  // (passes doc.hasFile to DocPreview), so the invariant is checked at its new location.
  const browser = src("src/app/dashboard/documents/documents-browser.tsx");
  ok("N2/N3: quick-look trigger passes the full row (incl. hasFile) to the viewer", /doc=\{preview\}/.test(browser));
  // WO-334 EXACT-FIDELITY: the reference-faithful main list (documents-list.tsx) is a second,
  // independent path to the same viewer — same invariant, same DocRow, checked at its location too.
  const list = src("src/app/dashboard/documents/documents-list.tsx");
  ok("N2/N3: ref-faithful list also passes the full row (incl. hasFile) to the viewer", /doc=\{preview\}/.test(list));
  const viewer = src("src/app/dashboard/documents/doc-viewer-panel.tsx");
  ok("N2/N3: viewer panel passes hasFile", /hasFile=\{doc\.hasFile\}/.test(viewer));
  const listPage = src("src/app/dashboard/documents/page.tsx");
  ok("N2/N3: list rows carry hasFile from storage_path", /hasFile: Boolean\(d\.storage_path\)/.test(listPage));
  const en = JSON.parse(src("src/i18n/messages/en.json"));
  const hi = JSON.parse(src("src/i18n/messages/hi.json"));
  ok("N2/N3: preview.noFile present in en + hi", Boolean(en.documents.preview.noFile && hi.documents.preview.noFile));
}

console.log(failed ? `\n${failed} assertion(s) FAILED` : "\nAll WO-42 assertions passed");
process.exit(failed ? 1 : 0);
