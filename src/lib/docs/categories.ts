// Canonical document categories for a legal practice + the controlled doc_type
// vocabulary. categoryOf() buckets any doc_type (including legacy free-text) into a
// canonical category so the UI can group/filter documents consistently and the
// classifier produces structured types instead of everything landing in "other".

export const CATEGORIES = [
  { key: "pleadings", label: "Pleadings", icon: "documents" },
  { key: "orders_judgments", label: "Orders & Judgments", icon: "scale" },
  { key: "notices", label: "Notices", icon: "notices" },
  { key: "correspondence", label: "Correspondence", icon: "gmail" },
  { key: "agreements", label: "Agreements & Deeds", icon: "documents" },
  { key: "evidence", label: "Evidence & Annexures", icon: "clip" },
  { key: "kyc_identity", label: "KYC & Identity", icon: "check" },
  { key: "financial", label: "Financial", icon: "documents" },
  { key: "court_filing", label: "Court Filings", icon: "cases" },
  { key: "other", label: "Other", icon: "documents" },
] as const;

export type CategoryKey = (typeof CATEGORIES)[number]["key"];
export const CATEGORY_LABEL: Record<string, string> = Object.fromEntries(CATEGORIES.map((c) => [c.key, c.label]));
export const CATEGORY_ORDER: string[] = CATEGORIES.map((c) => c.key);

// The controlled vocabulary the classifier should choose doc_type from.
export const DOC_TYPES = [
  "plaint", "written_statement", "petition", "application", "affidavit", "vakalatnama", "rejoinder",
  "order", "judgment", "decree",
  "legal_notice", "demand_notice", "summons", "reply_notice",
  "letter", "email", "correspondence",
  "agreement", "contract", "deed", "mou", "power_of_attorney",
  "evidence", "exhibit", "witness_statement",
  "kyc", "id_proof", "aadhaar", "pan", "passport",
  "invoice", "receipt", "bank_statement", "cheque", "financial_statement",
  "court_filing", "efiling_receipt",
  "other",
] as const;

const MAP: Record<string, CategoryKey> = {
  plaint: "pleadings", written_statement: "pleadings", petition: "pleadings", application: "pleadings", affidavit: "pleadings", vakalatnama: "pleadings", rejoinder: "pleadings",
  order: "orders_judgments", judgment: "orders_judgments", decree: "orders_judgments", court_order: "orders_judgments",
  legal_notice: "notices", demand_notice: "notices", summons: "notices", reply_notice: "notices", notice: "notices",
  letter: "correspondence", email: "correspondence", correspondence: "correspondence",
  agreement: "agreements", contract: "agreements", deed: "agreements", mou: "agreements", power_of_attorney: "agreements", poa: "agreements",
  evidence: "evidence", exhibit: "evidence", witness_statement: "evidence", annexure: "evidence",
  kyc: "kyc_identity", id_proof: "kyc_identity", aadhaar: "kyc_identity", pan: "kyc_identity", passport: "kyc_identity",
  invoice: "financial", receipt: "financial", bank_statement: "financial", cheque: "financial", financial_statement: "financial",
  court_filing: "court_filing", efiling_receipt: "court_filing",
};

const KEYWORDS: [RegExp, CategoryKey][] = [
  [/plaint|written.?statement|petition|affidavit|vakalat|pleading|rejoinder|application/i, "pleadings"],
  [/order|judg|decree/i, "orders_judgments"],
  [/notice|summon/i, "notices"],
  [/letter|e-?mail|correspond/i, "correspondence"],
  [/agreement|contract|deed|mou|attorney|\bpoa\b/i, "agreements"],
  [/evidence|exhibit|witness|annex/i, "evidence"],
  [/kyc|aadhaa?r|\bpan\b|passport|identity|id.?proof/i, "kyc_identity"],
  [/invoice|receipt|bank.?statement|account.?statement|securities.?statement|cheque|payment|financial/i, "financial"],
  [/filing|e-?filing/i, "court_filing"],
];

// Bucket a doc_type into a canonical category. `hint` (e.g. the filename) is used
// as a fallback when doc_type is missing/uninformative, so legacy docs and direct
// uploads still categorise sensibly.
export function categoryOf(docType: string | null | undefined, hint?: string | null): CategoryKey {
  const t = (docType ?? "").trim().toLowerCase().replace(/\s+/g, "_");
  if (t && MAP[t]) return MAP[t];
  const haystack = `${docType ?? ""} ${hint ?? ""}`;
  for (const [re, cat] of KEYWORDS) if (re.test(haystack)) return cat;
  return "other";
}
