// WO-414 · transactional email templates v3.1 — the Chambers shell (founder-approved gallery,
// email-templates-v3-2026-08-11 / .spec-gallery.html). Transcribed verbatim from the gallery:
// graphite masthead with bilingual mark + honey category label, 3px honey rule, hidden preheader,
// fact table / date banner / changes block / callout / stat roles, one graphite CTA, footer
// disclaimer + per-template "why you got this" line + Notification settings link.
//
// ENGLISH ONLY (founder directive 2026-07-18): transactional emails ship in English only —
// refined, targeted English, no Hindi. (Overrides the product-wide bilingual default for emails;
// the HI catalog carries no `emails.*` keys — see tests/i18n_coverage.ts EN_ONLY.)
//
// Brand-facing, data-bound, honest: every line is a `{slot}` template filled through
// fillTemplate (src/i18n/comms.ts) — a missing slot DROPS its line, never fakes a value
// (copy-deck §8). The preheader slot-drops like every other line (no half-filled hidden div).
// A subject resolves subject → subjectFallback → null; null means no send, so delivery
// guarantees are unchanged. A genuine numeric 0 renders; a fabricated ₹0 never does.
//
// Email-safe HTML: single-column, 600px, all styles INLINE (no <style>, no external CSS/fonts),
// web-safe font stacks (Georgia serif display + system sans), no images, no webfonts. Light map
// only — the gallery's dark map is its preview toggle, not a second email. No AI content in any
// email (founder call 2026-08-13): the changes block is the record's own diff, not inference.
//
// This module BUILDS templates; it does NOT send. Kinds without a dedicated template render
// through renderNotice() below — same shell, one design system.

import en from "@/i18n/messages/en.json";
import { fillTemplate, type Slot } from "@/i18n/comms";

export type EmailKey = keyof typeof en.emails;
export type EmailData = Record<string, Slot>;

const EMAILS = en.emails;

// The gallery's light colour map `C` (the `D` map is the dark-preview toggle, not a second email).
const SERIF = "Georgia, 'Times New Roman', serif";
const SANS = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif";
const MONO = "'Courier New', Courier, monospace";
const PAPER = "#FAF9F7";
const CARD = "#FFFFFF";
const WELL = "#F1ECE1";
const BAND = "#EAE3D5";
const INK = "#1A1C1E";
const INK2 = "#4A4A45";
const INK3 = "#8B8578";
const BRONZE = "#78582B";
const BRONZE_DEEP = "#5E461F";
const TINT = "#F7E7C8";
const HONEY = "#E8B563";
const ON_HONEY = "#4A3410";
const HAIR = "#DDD5C6";
const DANGER = "#8C3B24";
const DANGER_T = "#F3DDD5";

// The footer settings link is a REAL route, built the way email-render.ts builds app URLs:
// NEXT_PUBLIC_APP_URL (default app root) + /dashboard/settings. Never a bare "#" mock.
const APP_ROOT = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.mukadma.in";
const SETTINGS_URL = APP_ROOT.replace(/\/$/, "") + "/dashboard/settings";

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Escaped slot values, developer-authored markup preserved. Slot VALUES are the only untrusted
// input; the en.json copy (and any intentional inline markup like <b>) is trusted.
const escData = (data: EmailData): Record<string, Slot> => {
  const out: Record<string, Slot> = {};
  for (const [k, v] of Object.entries(data)) out[k] = typeof v === "string" ? esc(v) : v;
  return out;
};

const stripTags = (s: string) => s.replace(/<[^>]*>/g, "");
const decodeEntities = (s: string) =>
  s
    .replace(/&nbsp;/g, " ")
    .replace(/&#8199;/g, " ")
    .replace(/&#847;/g, "")
    .replace(/&#8594;/g, "→")
    .replace(/&#8593;/g, "↑")
    .replace(/&#8377;/g, "₹")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");

// HTML-ready fill (escaped slots, markup preserved) and plain-text fill (tags stripped, entities decoded).
function fillHtml(sec: Record<string, string>, key: string, data: EmailData): string | null {
  const tpl = sec[key];
  return tpl === undefined ? null : fillTemplate(tpl, escData(data));
}
function fillText(sec: Record<string, string>, key: string, data: EmailData): string | null {
  const tpl = sec[key];
  if (tpl === undefined) return null;
  const raw = fillTemplate(stripTags(tpl), data);
  return raw === null ? null : decodeEntities(raw);
}

type Pair = { html: string; text: string };
function pair(sec: Record<string, string>, key: string, data: EmailData): Pair | null {
  const html = fillHtml(sec, key, data);
  if (html === null) return null;
  const text = fillText(sec, key, data);
  return { html, text: text ?? "" };
}

type Block = { html: string; text: string; role?: "cta" };

// ---- role renderers (transcribed from the gallery's one-line helpers, light map) ----
function roleBlock(
  p: Pair,
  role: "chip" | "chipDanger" | "title" | "lead" | "para" | "muted" | "signoff" | "amount" | "code" | "callout" | "cta",
): Block {
  switch (role) {
    case "chip":
      return { html: `<p style="margin:0 0 14px;"><span style="display:inline-block;background:${TINT};color:${BRONZE_DEEP};font-family:${SANS};font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;padding:7px 12px;border-radius:4px;">${p.html}</span></p>`, text: p.text };
    case "chipDanger":
      return { html: `<p style="margin:0 0 14px;"><span style="display:inline-block;background:${DANGER_T};color:${DANGER};font-family:${SANS};font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;padding:7px 12px;border-radius:4px;">${p.html}</span></p>`, text: p.text };
    case "title":
      return { html: `<h1 style="margin:0 0 18px;font-family:${SERIF};font-size:23px;line-height:1.3;font-weight:600;color:${INK};">${p.html}</h1>`, text: p.text };
    case "lead":
      return { html: `<p style="margin:0 0 14px;font-family:${SANS};font-size:15.5px;line-height:1.6;color:${INK};">${p.html}</p>`, text: p.text };
    case "para":
      return { html: `<p style="margin:10px 0;font-family:${SANS};font-size:14.5px;line-height:1.6;color:${INK2};">${p.html}</p>`, text: p.text };
    case "muted":
      return { html: `<p style="margin:8px 0;font-family:${SANS};font-size:13px;line-height:1.55;color:${INK3};">${p.html}</p>`, text: p.text };
    case "signoff":
      return { html: `<p style="margin:22px 0 0;font-family:${SERIF};font-size:15px;color:${INK2};">${p.html}</p>`, text: p.text };
    case "amount":
      return { html: `<p style="margin:2px 0 4px;font-family:${SERIF};font-size:34px;font-weight:700;color:${INK};">${p.html}</p>`, text: p.text };
    case "code":
      return { html: `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 4px;"><tr><td align="center" style="background:${PAPER};border:1px dashed ${HAIR};border-radius:8px;padding:20px;"><span style="font-family:${MONO};font-size:34px;font-weight:700;letter-spacing:10px;color:${INK};">${p.html}</span></td></tr></table>`, text: p.text };
    case "callout":
      return { html: `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:14px 0;"><tr><td style="width:3px;background:${HONEY};border-radius:2px;font-size:0;">&nbsp;</td><td style="background:${PAPER};padding:11px 16px;font-family:${SANS};font-size:14px;line-height:1.55;color:${INK2};">${p.html}</td></tr></table>`, text: p.text };
    case "cta":
      return { html: `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0 0;"><tr><td style="background:${INK};border-radius:7px;"><a href="{ctaUrl}" style="display:inline-block;padding:12px 24px;font-family:${SANS};font-size:14px;font-weight:600;color:#FFFFFF;text-decoration:none;">${p.html} <span style="color:${HONEY};">&#8594;</span></a></td></tr></table>`, text: p.text, role: "cta" };
  }
}

function simple(sec: Record<string, string>, key: string, data: EmailData, role: Parameters<typeof roleBlock>[1]): Block | null {
  const p = pair(sec, key, data);
  return p ? roleBlock(p, role) : null;
}

// Old→new diff value (struck old, bold new, honest delta) — the record's own change, no inference.
function diffVal(oldV: string, newV: string, delta?: string): Pair {
  return {
    html: `<span style="text-decoration:line-through;color:${INK3};">${esc(oldV)}</span> &nbsp;&#8594;&nbsp; <b style="color:${INK};">${esc(newV)}</b>${delta ? ` <span style="color:${INK3};">(${esc(delta)})</span>` : ""}`,
    text: `${oldV} → ${newV}${delta ? ` (${delta})` : ""}`,
  };
}

function facts(rows: { label: Pair; value: Pair; mono?: boolean }[]): Block {
  const html = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 4px;">${rows
    .map(
      (r) =>
        `<tr><td style="padding:8px 14px 8px 0;font-family:${SANS};font-size:10.5px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:${INK3};white-space:nowrap;vertical-align:top;border-top:1px solid ${WELL};">${r.label.html}</td><td style="padding:8px 0;font-family:${r.mono ? MONO : SANS};font-size:${r.mono ? "13px" : "14px"};line-height:1.5;color:${INK2};border-top:1px solid ${WELL};">${r.value.html}</td></tr>`,
    )
    .join("\n")}</table>`;
  const text = rows.map((r) => `${r.label.text}: ${r.value.text}`).join("\n");
  return { html, text };
}

function dateBanner(day: Pair, mon: Pair, wk: Pair, note: Pair): Block {
  const html = `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:4px 0 16px;"><tr>
  <td style="background:${HONEY};border-radius:8px;padding:10px 16px;text-align:center;">
    <p style="margin:0;font-family:${SERIF};font-size:26px;line-height:1;font-weight:700;color:${ON_HONEY};">${day.html}</p>
    <p style="margin:2px 0 0;font-family:${SANS};font-size:10px;font-weight:700;letter-spacing:2px;color:${ON_HONEY};">${mon.html}</p>
  </td>
  <td style="padding-left:16px;">
    <p style="margin:0;font-family:${SANS};font-size:15px;font-weight:600;color:${INK};">${wk.html}</p>
    <p style="margin:3px 0 0;font-family:${SANS};font-size:13px;color:${INK3};">${note.html}</p>
  </td>
  </tr></table>`;
  return { html, text: `${wk.text} · ${note.text}` };
}

function changes(heading: Pair, rows: { tag: Pair; value: Pair }[]): Block {
  const html = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 14px;"><tr>
  <td style="width:3px;background:${HONEY};border-radius:2px;font-size:0;">&nbsp;</td>
  <td style="padding-left:16px;">
    <p style="margin:0 0 2px;font-family:${SANS};font-size:9.5px;font-weight:700;letter-spacing:1.8px;text-transform:uppercase;color:${INK3};">${heading.html}</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows
      .map(
        (r) =>
          `<tr><td style="padding:8px 12px 8px 0;font-family:${SANS};font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:${BRONZE_DEEP};white-space:nowrap;vertical-align:top;">${r.tag.html}</td><td style="padding:8px 0;font-family:${SANS};font-size:14px;line-height:1.5;color:${INK};">${r.value.html}</td></tr>`,
      )
      .join("")}</table>
  </td></tr></table>`;
  const text = `${heading.text}\n${rows.map((r) => `${r.tag.text}: ${r.value.text}`).join("\n")}`;
  return { html, text };
}

function stats(items: { n: Pair; l: Pair }[]): Block {
  const html = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 12px;border-collapse:separate;border-spacing:6px 0;"><tr>${items
    .map(
      (it) =>
        `<td align="center" style="padding:14px 6px;background:${PAPER};border:1px solid ${WELL};"><p style="margin:0;font-family:${SERIF};font-size:24px;font-weight:700;color:${INK};">${it.n.html}</p><p style="margin:4px 0 0;font-family:${SANS};font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:${INK3};">${it.l.html}</p></td>`,
    )
    .join("")}</tr></table>`;
  return { html, text: items.map((it) => `${it.n.text} ${it.l.text}`).join(" · ") };
}

function statsDelta(items: { n: Pair; l: Pair; d: Pair | null }[]): Block {
  const html = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 12px;border-collapse:separate;border-spacing:6px 0;"><tr>${items
    .map(
      (it) =>
        `<td align="center" style="padding:14px 6px;background:${PAPER};border:1px solid ${WELL};"><p style="margin:0;font-family:${SERIF};font-size:24px;font-weight:700;color:${INK};">${it.n.html}</p><p style="margin:4px 0 0;font-family:${SANS};font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:${INK3};">${it.l.html}</p>${it.d ? `<p style="margin:3px 0 0;font-family:${SANS};font-size:10.5px;color:${INK3};">${it.d.html}</p>` : ""}</td>`,
    )
    .join("")}</tr></table>`;
  return { html, text: items.map((it) => `${it.n.text} ${it.l.text}${it.d ? ` (${it.d.text})` : ""}`).join(" · ") };
}

function boardRow(parties: Pair, where: Pair | null, sub: Pair | null): Block {
  const html = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:12px 0;"><tr>
  <td style="width:3px;background:${HONEY};border-radius:2px;font-size:0;">&nbsp;</td>
  <td style="padding:2px 0 2px 16px;">
    <p style="margin:0;font-family:${SERIF};font-size:16px;line-height:1.4;font-weight:600;color:${INK};">${parties.html}</p>${where ? `<p style="margin:3px 0 0;font-family:${SANS};font-size:13px;color:${INK2};">${where.html}</p>` : ""}${sub ? `<p style="margin:2px 0 0;font-family:${MONO};font-size:11.5px;color:${INK3};">${sub.html}</p>` : ""}
  </td></tr></table>`;
  const text = [parties.text, where?.text, sub?.text].filter(Boolean).join(" · ");
  return { html, text };
}

// ---- structured-block helpers over en.json keys ----
function factsItems(
  sec: Record<string, string>,
  data: EmailData,
  spec: [string, string, boolean?][],
): { label: Pair; value: Pair; mono?: boolean }[] {
  const out: { label: Pair; value: Pair; mono?: boolean }[] = [];
  for (const [lk, vk, mono] of spec) {
    const label = pair(sec, lk, data);
    const value = pair(sec, vk, data);
    if (label && value) out.push({ label, value, mono });
  }
  return out;
}

function statsItems(sec: Record<string, string>, data: EmailData, count: number): { n: Pair; l: Pair }[] {
  const out: { n: Pair; l: Pair }[] = [];
  for (let i = 0; i < count; i++) {
    const n = pair(sec, `stat${i}n`, data);
    const l = pair(sec, `stat${i}l`, data);
    if (n && l) out.push({ n, l });
  }
  return out;
}

function statsDeltaItems(sec: Record<string, string>, data: EmailData, count: number): { n: Pair; l: Pair; d: Pair | null }[] {
  const out: { n: Pair; l: Pair; d: Pair | null }[] = [];
  for (let i = 0; i < count; i++) {
    const n = pair(sec, `stat${i}n`, data);
    const l = pair(sec, `stat${i}l`, data);
    if (n && l) out.push({ n, l, d: pair(sec, `stat${i}d`, data) });
  }
  return out;
}

function changeBlockFrom(
  sec: Record<string, string>,
  data: EmailData,
  headingKey: string,
  rows: { tagKey: string; kind: "new" | "diff"; valueKey?: string; oldKey?: string; newKey?: string; deltaKey?: string; gate?: (data: EmailData) => boolean }[],
): Block | null {
  const heading = pair(sec, headingKey, data);
  const built: { tag: Pair; value: Pair }[] = [];
  for (const r of rows) {
    if (r.gate && !r.gate(data)) continue;
    const tag = pair(sec, r.tagKey, data);
    if (!tag) continue;
    if (r.kind === "new") {
      const v = pair(sec, r.valueKey!, data);
      if (v) built.push({ tag, value: v });
    } else {
      const oldV = fillText(sec, r.oldKey!, data);
      const newV = fillText(sec, r.newKey!, data);
      const delta = r.deltaKey ? fillText(sec, r.deltaKey, data) : null;
      if (oldV === null || newV === null) continue;
      built.push({ tag, value: diffVal(oldV, newV, delta ?? undefined) });
    }
  }
  if (!heading || !built.length) return null;
  return changes(heading, built);
}

// The closed-set `change` label recordCaseChanges (sync.ts) emits "New order"/"New orders" precisely
// when an order genuinely moved this sync. Everything else (bench, next-hearing, disposal) is NOT a new
// order — and must not assert one in the changes block.
const isNewOrder = (data: EmailData) => data.change === "New order" || data.change === "New orders";

function bodyLines(key: EmailKey, sec: Record<string, string>, data: EmailData): Block[] {
  const B: Block[] = [];
  const add = (b: Block | null) => {
    if (b) B.push(b);
  };
  const s = (k: string, role: Parameters<typeof roleBlock>[1]) => add(simple(sec, k, data, role));

  switch (key) {
    case "welcome":
      s("title", "title");
      s("body", "lead");
      s("ctaHint", "muted");
      s("cta", "cta");
      s("signoff", "signoff");
      break;
    case "assembled": {
      s("title", "title");
      const items = statsItems(sec, data, 3);
      if (items.length) add(stats(items));
      s("body", "para");
      s("cta", "cta");
      break;
    }
    case "dailyHearings":
      // The row-expanded board renders via renderDailyHearings (below); this is the flat,
      // single-row/no-data shape the generic path + styleguide fall back on.
      s("title", "title");
      s("date", "muted");
      s("orders", "muted");
      s("cta", "cta");
      break;
    case "weekly": {
      s("title", "title");
      const items = statsDeltaItems(sec, data, 4);
      if (items.length) add(statsDelta(items));
      s("callout", "callout");
      s("body", "para");
      s("cta", "cta");
      break;
    }
    case "invoice": {
      s("from", "muted");
      s("amount", "amount");
      s("due", "muted");
      const f = factsItems(sec, data, [["fact0l", "fact0v"], ["fact1l", "fact1v"]]);
      if (f.length) add(facts(f));
      s("pay", "muted");
      s("cta", "cta");
      s("reply", "muted");
      break;
    }
    case "receipt":
      s("title", "title");
      s("body", "lead");
      s("ctaHint", "muted");
      break;
    case "syncFailure":
      s("title", "title");
      s("body", "lead");
      s("callout", "callout");
      s("reassure", "muted");
      break;
    case "security":
      s("title", "title");
      s("code", "code");
      s("device", "muted");
      s("note", "muted");
      break;
    case "caseUpdate": {
      s("chip", "chip");
      s("title", "title");
      // D1: the Order row asserts a NEW order — gate it on the change label. When the label is anything
      // else the order is NOT new, and it renders as the honest "Latest order" fact row instead.
      const newOrder = isNewOrder(data);
      add(
        changeBlockFrom(sec, data, "changesHeading", [
          { tagKey: "change0tag", kind: "new", valueKey: "change0value", gate: () => newOrder },
          { tagKey: "change1tag", kind: "diff", oldKey: "change1old", newKey: "change1new", deltaKey: "change1delta" },
          { tagKey: "change2tag", kind: "diff", oldKey: "change2old", newKey: "change2new" },
        ]),
      );
      const callLead = pair(sec, "calloutLead", data);
      if (callLead) {
        const callTail = pair(sec, "calloutTail", data);
        add(roleBlock({ html: callLead.html + (callTail?.html ?? ""), text: callLead.text + (callTail?.text ?? "") }, "callout"));
      }
      const factsSpec: [string, string, boolean?][] = [
        ["fact0l", "fact0v"], ["fact1l", "fact1v"], ["fact2l", "fact2v"], ["fact3l", "fact3v"], ["fact4l", "fact4v", true],
      ];
      if (!newOrder) factsSpec.push(["fact5l", "fact5v"]);
      const f = factsItems(sec, data, factsSpec);
      if (f.length) add(facts(f));
      s("detail", "muted");
      s("cta", "cta");
      break;
    }
    case "trackConfirm": {
      s("chip", "chip");
      s("title", "title");
      const f = factsItems(sec, data, [
        ["fact0l", "fact0v"], ["fact1l", "fact1v"], ["fact2l", "fact2v"], ["fact3l", "fact3v"], ["fact4l", "fact4v"],
        ["fact5l", "fact5v"], ["fact6l", "fact6v"], ["fact7l", "fact7v"], ["fact8l", "fact8v", true],
      ]);
      if (f.length) add(facts(f));
      s("body", "para");
      s("cta", "cta");
      break;
    }
    case "hearingReminder": {
      s("chip", "chip");
      s("title", "title");
      const dDay = pair(sec, "dateDay", data);
      const dMon = pair(sec, "dateMon", data);
      const dWk = pair(sec, "dateWk", data);
      const dNote = pair(sec, "dateNote", data);
      if (dDay && dMon && dWk && dNote) add(dateBanner(dDay, dMon, dWk, dNote));
      // NIT-1: "Latest order" is the most recent order ON FILE; the changes "Order" row claims a NEW
      // order. Gate them mutually-exclusively on the same signal as D1 so the same order never prints
      // twice (fact + "new since the last listing").
      const newOrder = isNewOrder(data);
      const factsSpec: [string, string, boolean?][] = [
        ["fact0l", "fact0v"], ["fact1l", "fact1v"], ["fact2l", "fact2v"], ["fact3l", "fact3v"],
        ...(newOrder ? [] : [["fact4l", "fact4v"] as [string, string, boolean?]]),
        ["fact5l", "fact5v", true],
      ];
      const f = factsItems(sec, data, factsSpec);
      if (f.length) add(facts(f));
      add(
        changeBlockFrom(sec, data, "changesHeading", [
          { tagKey: "change0tag", kind: "new", valueKey: "change0value", gate: () => newOrder },
          { tagKey: "change1tag", kind: "diff", oldKey: "change1old", newKey: "change1new" },
        ]),
      );
      s("cta", "cta");
      break;
    }
    case "disposalNotice": {
      s("chip", "chipDanger");
      s("title", "title");
      s("lead", "lead");
      const rows: { label: Pair; value: Pair; mono?: boolean }[] = [];
      const wasLabel = pair(sec, "fact0l", data);
      const wasOld = fillText(sec, "fact0old", data);
      const wasNew = fillText(sec, "fact0new", data);
      if (wasLabel && wasOld !== null && wasNew !== null) rows.push({ label: wasLabel, value: diffVal(wasOld, wasNew) });
      rows.push(...factsItems(sec, data, [["fact1l", "fact1v"], ["fact2l", "fact2v"], ["fact3l", "fact3v", true]]));
      if (rows.length) add(facts(rows));
      s("muted", "muted");
      s("cta", "cta");
      break;
    }
  }
  return B;
}

const PRE_PAD = "&#8199;&#847;".repeat(40);

// The single-column 600px inline-styled shell. `preheader` and `why` are already-slot-filled
// HTML (or null — a missing preheader emits NO hidden div, a missing why drops the footer text).
function shell(opts: { category: string; preheader: string | null; inner: string; why: string | null }): string {
  const pre = opts.preheader ? `<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${opts.preheader}${PRE_PAD}</div>` : "";
  const whyLine = opts.why ? `${opts.why} &nbsp;·&nbsp; ` : "";
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta name="color-scheme" content="light"></head>
<body style="margin:0;padding:0;background:${PAPER};">
${pre}<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PAPER}"><tr><td align="center" style="padding:28px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;">
  <tr><td style="background:${INK};border-radius:12px 12px 0 0;padding:18px 30px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      <td style="font-family:${SERIF};font-size:17px;letter-spacing:3px;color:${PAPER};font-weight:600;white-space:nowrap;">MUKADMA&nbsp;<span style="font-size:13px;letter-spacing:0;color:${INK3};font-weight:400;">मुक़दमा</span></td>
      <td align="right" style="font-family:${SANS};font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:${HONEY};white-space:nowrap;">${esc(opts.category)}</td>
    </tr></table>
  </td></tr>
  <tr><td style="background:${HONEY};height:3px;line-height:3px;font-size:0;">&nbsp;</td></tr>
  <tr><td style="background:${CARD};border:1px solid ${HAIR};border-top:none;padding:30px 30px 32px;">
${opts.inner}
  </td></tr>
  <tr><td style="background:${PAPER};border:1px solid ${HAIR};border-top:1px solid ${BAND};border-radius:0 0 12px 12px;padding:16px 30px 18px;">
    <p style="margin:0 0 6px;font-family:${SANS};font-size:11.5px;line-height:1.55;color:${INK3};">Not legal advice — verify against the official record.</p>
    <p style="margin:0;font-family:${SANS};font-size:11.5px;line-height:1.55;color:${INK3};">${whyLine}<a href="${SETTINGS_URL}" style="color:${BRONZE};text-decoration:underline;">Notification settings</a></p>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;
}

export type RenderedEmail = { subject: string; html: string; text: string };

// Fallback-notice category + why-line, keyed by notification kind (the gallery's fallbackNotice is
// a deadline EXAMPLE, not a mandate to stamp "Deadline" on every fallback kind). EN-only catalog
// copy (en.emailNotice) so a notice_escalation never labels itself "Deadline" and never promises a
// subscription the reader does not have. Unknown kinds fall to the neutral default.
const NOTICE_CAT = en.emailNotice.category as Record<string, string>;
const NOTICE_WHY = en.emailNotice.why as Record<string, string>;
const DEFAULT_NOTICE_CATEGORY = NOTICE_CAT.default;
const DEFAULT_NOTICE_WHY = NOTICE_WHY.default;

function footerText(whyText: string | null): string {
  const settings = `Notification settings: ${SETTINGS_URL}`;
  return [whyText ? `${whyText} · ${settings}` : settings].join("\n");
}

/**
 * Render a transactional email from real data. The subject resolves subject → subjectFallback →
 * null: a required subject slot that can't fill (and has no fallback) means no email to send —
 * delivery guarantees are unchanged. Body lines, the preheader, and the why-line slot-drop
 * independently. `ctaUrl` binds the ONE CTA link; the footer settings link is always real.
 */
export function renderEmail(key: EmailKey, data: EmailData, ctaUrl = APP_ROOT): RenderedEmail | null {
  const sec = EMAILS[key] as Record<string, string>;
  const meta = EMAIL_META[key];

  const subject =
    fillText(sec, "subject", data) ?? (sec.subjectFallback ? fillText(sec, "subjectFallback", data) : null);
  if (subject === null) return null;

  // F1: preheader resolves preheader → preheaderFallback → no div, exactly like the subject. The
  // fallback binds only TODAY's slots, so a case email always lands a preview line even before
  // WO-415 widens the payload (e.g. caseUpdate's primary preheader needs {prevHearingDate}).
  const preheader = fillHtml(sec, "preheader", data) ?? fillHtml(sec, "preheaderFallback", data);
  const whyHtml = fillHtml(sec, "why", data);
  const whyText = fillText(sec, "why", data);

  const blocks = bodyLines(key, sec, data);
  const inner = blocks.map((b) => b.html).join("\n");
  const html = shell({ category: meta.category, preheader, inner, why: whyHtml }).replace(/\{ctaUrl\}/g, esc(ctaUrl));

  const text = [
    subject,
    "",
    ...blocks.map((b) => (b.role === "cta" ? `${b.text}: ${ctaUrl}` : b.text)).filter(Boolean),
    "",
    "Not legal advice — verify against the official record.",
    footerText(whyText),
  ].join("\n");

  return { subject, html, text };
}

// Every template key, for the styleguide + tests to iterate without a hardcoded list.
export const EMAIL_KEYS = Object.keys(en.emails) as EmailKey[];

/**
 * Daily hearings board — the evening-before board of tomorrow's listed matters. `rows` are
 * per-matter listings rendered through the gallery's `boardRow` role (serif parties, court +
 * court-no + purpose, then CNR · stage · last-listed). A row requires court + parties (the case
 * title IS the parties caption); sub-fields slot-drop independently. Never sent empty.
 */
export function renderDailyHearings(rows: EmailData[], meta: { date: Slot; count: Slot } & Record<string, Slot>, ctaUrl = APP_ROOT): RenderedEmail | null {
  const sec = EMAILS.dailyHearings as Record<string, string>;
  const subject = fillText(sec, "subject", meta);
  if (subject === null) return null;

  const whyHtml = fillHtml(sec, "why", meta);
  const whyText = fillText(sec, "why", meta);

  const blocks: Block[] = [];
  const add = (b: Block | null) => {
    if (b) blocks.push(b);
  };
  add(simple(sec, "title", meta, "title"));
  add(simple(sec, "date", meta, "muted"));
  add(simple(sec, "callout", meta, "callout"));

  const rowBlocks: Block[] = [];
  for (const r of rows) {
    const partiesP = pair(sec, "boardParties", r);
    const courtP = pair(sec, "boardCourt", r);
    if (!partiesP || !courtP) continue; // court + parties required — never fake a court
    const courtNoP = pair(sec, "boardCourtNo", r);
    const purposeP = pair(sec, "boardPurpose", r);
    const cnrP = pair(sec, "boardCnr", r);
    const stageP = pair(sec, "boardStage", r);
    const lastP = pair(sec, "boardLast", r);
    const where = { html: [courtP.html, courtNoP?.html, purposeP?.html].filter(Boolean).join(" &nbsp;·&nbsp; "), text: [courtP.text, courtNoP?.text, purposeP?.text].filter(Boolean).join(" · ") };
    const sub = { html: [cnrP?.html, stageP?.html, lastP?.html].filter(Boolean).join(" &nbsp;·&nbsp; "), text: [cnrP?.text, stageP?.text, lastP?.text].filter(Boolean).join(" · ") };
    rowBlocks.push(boardRow(partiesP, where.html ? where : null, sub.html ? sub : null));
  }
  if (!rowBlocks.length) return null; // no listed matter → no email (send rule)

  blocks.push(...rowBlocks);
  add(simple(sec, "orders", { orders: meta.orders }, "muted"));
  add(simple(sec, "cta", meta, "cta"));

  const inner = blocks.map((b) => b.html).join("\n");

  // Preheader = the first surviving row's "court — parties" (§04 {firstListing}).
  let preheader: string | null = null;
  for (const r of rows) {
    const court = fillText(sec, "boardCourt", r);
    const parties = fillText(sec, "boardParties", r);
    if (court !== null && parties !== null) {
      preheader = fillHtml(sec, "preheader", { firstListing: `${court} — ${parties}` });
      break;
    }
  }

  const html = shell({ category: EMAIL_META.dailyHearings.category, preheader, inner, why: whyHtml }).replace(/\{ctaUrl\}/g, esc(ctaUrl));
  const text = [
    subject,
    "",
    ...blocks.map((b) => (b.role === "cta" ? `${b.text}: ${ctaUrl}` : b.text)).filter(Boolean),
    "",
    "Not legal advice — verify against the official record.",
    footerText(whyText),
  ].join("\n");
  return { subject, html, text };
}

/**
 * Generic branded notice — the ONE fallback for notification kinds without a dedicated template
 * (deadline_reminder, notice_escalation, cause_list_digest, legacy case_update). Same shell, same
 * disclaimer, same why-line + settings footer. Subject + lines are caller-provided REAL payload
 * data; nothing here fabricates content. `category` + `why` default to the neutral fallback pair
 * ("Notice" / "You receive notices about matters you track on Mukadma."); the composer passes the
 * honest per-kind pair (en.emailNotice) so a notice-escalation never labels itself "Deadline".
 */
export function renderNotice(
  subject: string,
  lines: { text: string; role?: "lead" | "muted" }[],
  ctaUrl?: string,
  ctaLabel = "Open Mukadma",
  category = DEFAULT_NOTICE_CATEGORY,
  why = DEFAULT_NOTICE_WHY,
): RenderedEmail {
  const kept = lines.filter((l) => l.text && l.text.trim());
  const blocks: Block[] = kept.map((l, i) => {
    const role = l.role ?? (i === 0 ? "lead" : "para");
    return roleBlock({ html: esc(l.text), text: l.text }, role as "lead" | "muted" | "para");
  });
  if (ctaUrl) blocks.push(roleBlock({ html: esc(ctaLabel), text: ctaLabel }, "cta"));

  const inner = blocks.map((b) => b.html).join("\n");
  const preheader = kept.length ? esc(kept[0].text) : null; // the gallery fallback's "first payload line"
  const html = shell({ category, preheader, inner, why }).replace(/\{ctaUrl\}/g, esc(ctaUrl ?? APP_ROOT));

  const text = [
    subject,
    "",
    ...blocks.map((b) => (b.role === "cta" ? `${b.text}: ${ctaUrl}` : b.text)).filter(Boolean),
    "",
    "Not legal advice — verify against the official record.",
    footerText(why),
  ].join("\n");
  return { subject, html, text };
}

/**
 * TRIGGER + TIMING matrix ("which email, when") + the per-template masthead category label.
 * Documentation only: this module does NOT schedule or send. `cta` is the case-relative link
 * PATTERN the send-path caller resolves to an absolute URL.
 */
export const EMAIL_META: Record<EmailKey, { category: string; trigger: string; timing: string; cta: string; wiring?: string }> = {
  welcome: { category: "Welcome", trigger: "Signup complete", timing: "Immediate, once", cta: "/dashboard/onboarding" },
  assembled: { category: "Practice Assembled", trigger: "First onboarding sync finishes", timing: "Immediate, once", cta: "/dashboard/cases" },
  dailyHearings: {
    category: "Tomorrow's Board",
    trigger: "Advocate has ≥1 matter listed for tomorrow — SKIP if none (never sent empty)",
    timing: "6 pm IST daily (cron /api/cron/daily-hearings, 12:30 UTC)",
    cta: "/dashboard/calendar",
    wiring: "WIRED (WO-264): sourced from the synced record's next-hearing dates (tomorrow, IST).",
  },
  weekly: { category: "Weekly Recap", trigger: "Weekly recap", timing: "Sunday 6 pm IST", cta: "/dashboard/calendar" },
  invoice: {
    category: "Invoice",
    trigger: "Advocate sends an invoice to a client",
    timing: "Immediate",
    cta: "/dashboard/invoices/{id}",
    wiring: "Per-invoice route /dashboard/invoices/[id] exists; client pay link needs a token — send-path (WO-144/billing) resolves it.",
  },
  receipt: { category: "Receipt", trigger: "Payment confirmed", timing: "Immediate", cta: "— (receipt, no CTA)" },
  syncFailure: { category: "Service Notice", trigger: "2 consecutive nightly sync misses", timing: "On the 2nd miss", cta: "— (reassurance, no CTA)" },
  security: { category: "Sign-in Code", trigger: "OTP / password-reset requested", timing: "Immediate", cta: "— (code, no CTA)" },
  caseUpdate: {
    category: "Case Update",
    trigger: "A tracked case changes materially on nightly sync — new order · next-hearing set/changed · status/disposal change",
    timing: "On detection (day-of); tight per-user roundup if several change the same day, to avoid spam",
    cta: "caseDetailHref(cnr, matterId) → /dashboard/cases/{id}",
    wiring: "WIRED (WO-264): recordCaseChanges enqueues the email row; the notify cron folds a tenant's same-run changes into ONE email.",
  },
  trackConfirm: {
    category: "Now Tracking",
    trigger: "trackCaseByCnr succeeds (user tracks a case from any page)",
    timing: "Immediate",
    cta: "caseDetailHref(cnr, matterId) → /dashboard/cases/{id}",
    wiring: "WIRED (WO-264): sent inline from the track action, fire-and-forget (a mailer failure never fails tracking).",
  },
  hearingReminder: {
    category: "Hearing Reminder",
    trigger: "T-3 / T-1 / day-of reminder for a hearing on a tracked matter (scheduleReminders)",
    timing: "At each offset; the {when} label (today/tomorrow/in N days) is computed at send time in IST — a stale reminder is skipped, never sent late",
    cta: "caseDetailHref(cnr, matterId) → /dashboard/cases/{id}",
    wiring: "WIRED (WO-264): the notify cron renders hearing_reminder rows through this template.",
  },
  disposalNotice: {
    category: "Case Status",
    trigger: "Sync shows no next date where one existed",
    timing: "Day-of, never rolled into a roundup",
    cta: "caseDetailHref(cnr, matterId) → /dashboard/cases/{id}",
    wiring: "WO-414: bound off the existing change label ('No next date on record'); the structured payload.disposal flag arrives in WO-415 and replaces that check.",
  },
};
