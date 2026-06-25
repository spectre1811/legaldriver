import type { CourtDataClient } from "./client";
import type {
  AdvocateQuery,
  CaseSearchResult,
  CauseListItem,
  CauseListQuery,
  CourtOrder,
  NormalizedCase,
} from "./types";

// Deterministic, free, offline court-data provider for dev/test/demo. Given the
// same CNR it always returns the same plausible case, so flows are reproducible.
// No network — works even where the live provider WAF-blocks this host.

const COURTS = [
  "District & Sessions Court, Pune",
  "Bombay High Court",
  "City Civil Court, Mumbai",
  "District Court, Nagpur",
];
const PURPOSES = ["Appearance", "Evidence", "Arguments", "Framing of Issues", "Final Hearing", "Orders"];
const STAGES = ["Pending", "Evidence", "Arguments", "Reserved for Orders"];
// Small pools so cases share parties / advocates / judges / acts — this is what
// makes similar-case discovery demonstrable on mock data.
const PETITIONERS = ["Rajesh Sharma", "Anita Deshmukh", "Mehta Industries Pvt Ltd", "Vikram Nair", "Sunita Rao"];
const RESPONDENTS = ["Suresh Patel", "State of Maharashtra", "Global Logistics Ltd", "Kiran Shah", "Deepak Verma"];
const ADVOCATES = ["Adv. M. Joshi", "Adv. K. Iyer", "Adv. S. Bhosale", "Adv. P. Menon", "Adv. R. Gupta"];
const JUDGES = ["Hon'ble Smt. R. Desai", "Hon'ble Shri A. Kulkarni", "Hon'ble Shri V. Rao", "Hon'ble Smt. N. Pillai"];
const ACTS = ["NI Act 138", "CPC Order 39", "IPC 420", "BNS 318", "Specific Relief Act 38", "Arbitration Act 9"];

// Simple deterministic hash so output depends only on the CNR.
function seed(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}
function pick<T>(arr: T[], n: number): T {
  return arr[n % arr.length];
}
function isoDate(base: Date, addDays: number): string {
  const d = new Date(base);
  d.setUTCDate(d.getUTCDate() + addDays);
  return d.toISOString().slice(0, 10);
}

function buildCase(cnr: string, now: Date): NormalizedCase {
  const h = seed(cnr);
  const court = pick(COURTS, h);
  const caseNo = (h % 9000) + 1000;
  const year = 2018 + (h % 7);
  const pet = pick(PETITIONERS, h);
  const res = pick(RESPONDENTS, h >> 2);
  const petAdv = pick(ADVOCATES, h);
  const resAdv = pick(ADVOCATES, h >> 3);
  const judge = pick(JUDGES, h);
  const acts = [pick(ACTS, h), pick(ACTS, h >> 4)].filter((v, i, a) => a.indexOf(v) === i);
  const title = `${pet.split(" ")[0]} v. ${res.split(" ")[0]} (${caseNo}/${year})`;

  // A few past hearings + one upcoming next date.
  const hearings = [];
  for (let i = 4; i >= 1; i--) {
    hearings.push({
      date: isoDate(now, -(i * 28 + (h % 10))),
      purpose: pick(PURPOSES, h + i),
      courtNo: String((h % 6) + 1),
      judge,
    });
  }
  const nextHearingDate = isoDate(now, (h % 21) + 3); // 3–23 days out
  hearings.push({
    date: nextHearingDate,
    purpose: pick(PURPOSES, h),
    courtNo: String((h % 6) + 1),
    judge,
  });

  return {
    cnr,
    title,
    court,
    caseType: pick(["Civil Suit", "Criminal Appeal", "Writ Petition", "Execution"], h),
    stage: pick(STAGES, h),
    status: "Pending",
    parties: [
      { name: pet, side: "petitioner", advocate: petAdv },
      { name: res, side: "respondent", advocate: resAdv },
    ],
    judge,
    nextHearingDate,
    hearings,
    orders: [
      { id: `${cnr}-ORD-1`, date: hearings[0].date, title: "Order on interim application" },
    ],
    acts,
    judges: [judge],
    detail: { registrationNumber: `${caseNo}/${year}`, court, petitionerAdvocates: [petAdv], respondentAdvocates: [resAdv] },
    source: "mock",
    fetchedAt: now.toISOString(),
  };
}

export class MockCourtDataClient implements CourtDataClient {
  readonly source = "mock";

  async getCaseByCNR(cnr: string): Promise<NormalizedCase | null> {
    if (!cnr || cnr.length < 6) return null;
    return buildCase(cnr.toUpperCase(), new Date());
  }

  async searchByAdvocate(q: AdvocateQuery): Promise<CaseSearchResult[]> {
    const key = (q.barNumber ?? q.name ?? "ADV").toUpperCase();
    const base = seed(key);
    return Array.from({ length: 4 }, (_, i) => {
      const cnr = `MHPU${String((base + i * 7919) % 1_000_000).padStart(12, "0")}`;
      const c = buildCase(cnr, new Date());
      return { cnr, title: c.title, court: c.court, parties: c.title };
    });
  }

  async getCauseList(q: CauseListQuery): Promise<CauseListItem[]> {
    const key = (q.barNumber ?? q.name ?? "ADV").toUpperCase();
    const base = seed(key + q.date);
    const count = (base % 3) + 1; // 1–3 items listed that day
    return Array.from({ length: count }, (_, i) => {
      const cnr = `MHPU${String((base + i * 104729) % 1_000_000).padStart(12, "0")}`;
      const c = buildCase(cnr, new Date());
      return {
        listDate: q.date,
        court: c.court,
        itemNo: String(i + 1),
        cnr,
        title: c.title,
      };
    });
  }

  async refreshCases(cnrs: string[]): Promise<NormalizedCase[]> {
    const now = new Date();
    return cnrs.slice(0, 50).map((c) => buildCase(c.toUpperCase(), now));
  }

  async getOrder(cnr: string, orderId: string): Promise<CourtOrder | null> {
    return {
      id: orderId,
      cnr,
      date: new Date().toISOString().slice(0, 10),
      markdown: `# Order\n\nIn the matter of ${cnr}. The application is heard. Matter adjourned.`,
      aiSummary: "Interim application heard; matter adjourned to the next date.",
    };
  }
}
