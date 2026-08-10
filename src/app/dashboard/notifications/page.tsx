import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { Icon } from "@/components/icons";
import { fmtAgo } from "@/components/ui";
import { courtCaseNo } from "../cases/cases-row";
import { OPEN_STATUS_OR } from "../cases/cases-query";
import { Reveal } from "../motion";
import { SectionLabel, ChannelCard, ChannelPill, ReceiptTrail, Stamp, type Step } from "./parts";
import { QuietHoursForm } from "./quiet-hours-form";

// design-system-v2 · Daybreak/Chambers (WO-336) — reskin of the Chambers prototype's
// design-mockups/iteration3/console/app.notifications.tsx onto legaldriver's real notification
// data. Four zones, all real: channel health (notification_prefs), per-case channels (matter +
// the SAME account-wide toggle — there is no per-case/per-alert-kind override to persist to, so
// every row honestly shows the same state instead of faking a matrix that doesn't exist), the
// delivery ledger (notification, filtered), and quiet hours/evening brief (notification_prefs,
// same mutation as Settings — see quiet-hours-form.tsx). Two real gaps, both flagged in-page
// rather than silently dropped or faked: (1) "Order uploaded" has no notification `kind` yet —
// its column reads "not tracked yet" everywhere; (2) delivered/read receipts aren't confirmed
// anywhere in the schema — the trail is honestly capped at "sent".

type Channel = "whatsapp" | "email" | "inapp";
const CHANNELS: { key: Channel; icon: "chat" | "gmail" | "monitor"; short: string }[] = [
  { key: "whatsapp", icon: "chat", short: "WA" },
  { key: "email", icon: "gmail", short: "EM" },
  { key: "inapp", icon: "monitor", short: "IN" },
];

// Alert kinds the matrix shows (matches the prototype's 3 columns). "order" has no backing
// `notification.kind` today — real:false gates that whole column to the honest placeholder.
const ALERT_COLS = [
  { key: "hearing", real: true },
  { key: "order", real: false },
  { key: "stage", real: true },
] as const;

function maskPhone(v: string | null): string | null {
  if (!v) return null;
  const digits = v.replace(/\D/g, "");
  if (digits.length < 6) return v;
  return `${v.slice(0, v.length - 8)}${digits.slice(-8, -3).replace(/./g, "•")}${digits.slice(-3)}`;
}

function ledgerDate(ts: string) {
  return new Date(ts).toLocaleDateString("en-IN", { day: "2-digit", month: "short", timeZone: "Asia/Kolkata" });
}
function ledgerTime(ts: string) {
  return new Date(ts).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });
}

export default async function NotificationsPage({ searchParams }: { searchParams: { channel?: string; failed?: string } }) {
  const supabase = createClient();
  const t = await getTranslations("dashboard.notifications");
  const tn = await getTranslations("notifications"); // existing kind/day vocabulary — reused, not forked

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: prefsRow }, { data: matters }] = await Promise.all([
    supabase
      .from("notification_prefs")
      .select("whatsapp_number, channel_whatsapp, channel_email, channel_sms, quiet_start, quiet_end, cause_list_time, updated_at")
      .eq("id", user?.id ?? "")
      .maybeSingle(),
    supabase
      .from("matter")
      .select("id, title, cnr, court, case_type, detail")
      .is("deleted_at", null)
      .or(OPEN_STATUS_OR)
      .order("created_at", { ascending: false })
      .limit(6),
  ]);
  const prefs = prefsRow ?? {
    whatsapp_number: null, channel_whatsapp: false, channel_email: true, channel_sms: false,
    quiet_start: null, quiet_end: null, cause_list_time: null, updated_at: null,
  };
  const cases = matters ?? [];
  const hasCases = cases.length > 0;

  const channelFilter = searchParams.failed === "1" ? "failed" : searchParams.channel === "whatsapp" || searchParams.channel === "email" ? searchParams.channel : "all";
  let ledgerQuery = supabase
    .from("notification")
    .select("id, channel, kind, payload, status, scheduled_for, sent_at, attempts, created_at")
    .order("created_at", { ascending: false })
    .limit(30);
  ledgerQuery = channelFilter === "failed" ? ledgerQuery.in("status", ["failed", "dead"]) : channelFilter !== "all" ? ledgerQuery.eq("channel", channelFilter) : ledgerQuery;
  const { data: ledgerRows } = await ledgerQuery;
  const ledger = ledgerRows ?? [];

  const activeChannels = (prefs.channel_whatsapp ? 1 : 0) + (prefs.channel_email ? 1 : 0) + 1; // in-app is always on

  const waMasked = maskPhone(prefs.whatsapp_number);
  const waDot = prefs.channel_whatsapp && prefs.whatsapp_number ? "on" : prefs.channel_whatsapp ? "partial" : "off";
  const waState = prefs.channel_whatsapp && prefs.whatsapp_number ? t("channelHealth.whatsapp.on") : prefs.channel_whatsapp ? t("channelHealth.whatsapp.needsNumber") : t("channelHealth.whatsapp.off");
  const emailDot = prefs.channel_email ? "on" : "off";

  return (
    <div className="space-y-8">
      <Reveal as="div" className="mk-engraved rounded-xl bg-ec-ink px-5 py-7 text-ec-paper sm:px-8">
        <p className="eyebrow !text-ec-honey">{t("header.eyebrow")}</p>
        <h1 className="mt-2 flex flex-wrap items-center gap-3 font-display text-[30px] leading-[1.05] text-ec-paper sm:text-[34px]">
          {t("header.title")}
          <span className="num rounded-md bg-ec-ink-chip px-2 py-0.5 font-mono text-[12px] text-ec-honey">
            {t("header.channelsOn", { n: activeChannels })}
          </span>
        </h1>
        <p className="mt-3 text-[14px] text-ec-line-strong">{t("header.meta")}</p>
      </Reveal>

      {!hasCases ? (
        <Reveal as="div" delay={80} className="ec-rule-left p-6">
          <p className="eyebrow">{t("empty.title")}</p>
          <p className="mt-2 max-w-xl font-display text-[24px] leading-snug text-ec-ink">{t("empty.body")}</p>
          <Link href="/dashboard/cases" className="ec-btn ec-btn-ink press mt-5 inline-flex w-fit items-center gap-2">
            <Icon name="cases" className="h-4 w-4 text-ec-honey" /> {t("empty.cta")}
          </Link>
        </Reveal>
      ) : (
        <div className="space-y-10">
          {/* channel health */}
          <Reveal as="section" delay={80}>
            <SectionLabel
              right={
                <span className="eyebrow">
                  {prefs.updated_at ? t("channelHealth.checked", { ago: fmtAgo(prefs.updated_at) }) : t("channelHealth.checkedNever")}
                </span>
              }
            >
              {t("channelHealth.title")}
            </SectionLabel>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <ChannelCard
                icon="chat"
                name={t("channelHealth.whatsapp.name")}
                dot={waDot}
                detail={waMasked ?? t("channelHealth.whatsapp.notAdded")}
                state={waState}
                configureLabel={t("channelHealth.configure")}
              />
              <ChannelCard
                icon="gmail"
                name={t("channelHealth.email.name")}
                dot={emailDot}
                detail={user?.email ?? "—"}
                state={prefs.channel_email ? t("channelHealth.email.on") : t("channelHealth.email.off")}
                configureLabel={t("channelHealth.configure")}
              />
              <ChannelCard
                icon="monitor"
                name={t("channelHealth.inapp.name")}
                dot="on"
                detail={t("channelHealth.inapp.detail")}
                state={t("channelHealth.inapp.state")}
                configureLabel={t("channelHealth.configure")}
              />
            </div>
          </Reveal>

          {/* per-case matrix */}
          <Reveal as="section" delay={140}>
            <SectionLabel right={<span className="eyebrow">{t("matrix.note")}</span>}>{t("matrix.title")}</SectionLabel>
            <div className="overflow-x-auto rounded-[10px] border border-ec-line bg-ec-card">
              <table className="w-full min-w-[640px] border-collapse text-left">
                <thead>
                  <tr className="border-b border-ec-line bg-ec-band">
                    <th className="eyebrow px-4 py-2.5 font-normal">{t("matrix.colCase")}</th>
                    {ALERT_COLS.map((c) => (
                      <th key={c.key} className="eyebrow px-4 py-2.5 font-normal">{t(`matrix.col.${c.key}`)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-ec-line bg-ec-bronze-tint/35">
                    <td className="min-w-[220px] px-4 py-3 align-top">
                      <div className="font-display text-[14.5px] leading-snug text-ec-bronze-deep">{t("matrix.defaultsRow")}</div>
                      <div className="num mt-0.5 font-mono text-[10.5px] uppercase tracking-[0.08em] text-ec-muted-ink">{t("matrix.defaultsHint")}</div>
                    </td>
                    {ALERT_COLS.map((c) => (
                      <td key={c.key} className="px-4 py-3 align-top">
                        {c.real ? (
                          <div className="flex flex-wrap gap-1">
                            {CHANNELS.map((ch) => (
                              <ChannelPill key={ch.key} icon={ch.icon} short={ch.short} label={t(`channelHealth.${ch.key}.name`)}
                                on={ch.key === "whatsapp" ? prefs.channel_whatsapp : ch.key === "email" ? prefs.channel_email : true} />
                            ))}
                          </div>
                        ) : (
                          <span className="text-[12px] text-ec-muted-ink">{t("matrix.notTracked")}</span>
                        )}
                      </td>
                    ))}
                  </tr>
                  {cases.map((m) => {
                    const detail = (m.detail ?? {}) as Record<string, unknown>;
                    const caseNo = courtCaseNo(m.case_type, detail);
                    return (
                      <tr key={m.id} className="border-b border-ec-line last:border-0">
                        <td className="min-w-[220px] px-4 py-3 align-top">
                          <Link href={`/dashboard/cases/${m.id}`} className="font-display text-[14.5px] leading-snug text-ec-ink hover:text-ec-bronze">{m.title}</Link>
                          <div className="num mt-0.5 font-mono text-[10.5px] uppercase tracking-[0.08em] text-ec-muted-ink">{m.cnr ?? "—"}</div>
                          <div className="mt-0.5 text-[12px] text-ec-muted-ink">{[m.court, caseNo].filter(Boolean).join(" · ") || "—"}</div>
                        </td>
                        {ALERT_COLS.map((c) => (
                          <td key={c.key} className="px-4 py-3 align-top">
                            {c.real ? (
                              <div className="flex flex-wrap gap-1">
                                {CHANNELS.map((ch) => (
                                  <ChannelPill key={ch.key} icon={ch.icon} short={ch.short} label={ch.short}
                                    on={ch.key === "whatsapp" ? prefs.channel_whatsapp : ch.key === "email" ? prefs.channel_email : true} />
                                ))}
                              </div>
                            ) : (
                              <span className="text-[12px] text-ec-muted-ink">{t("matrix.notTracked")}</span>
                            )}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Reveal>

          {/* delivery ledger */}
          <Reveal as="section" delay={200}>
            <SectionLabel right={<span className="eyebrow">{t("ledger.receipts", { n: ledger.length })}</span>}>{t("ledger.title")}</SectionLabel>
            <p className="mb-3 max-w-2xl text-[12px] text-ec-muted-ink">{t("ledger.note")}</p>
            <div className="mb-3 flex flex-wrap gap-1.5">
              {(["all", "whatsapp", "email", "failed"] as const).map((v) => {
                const href = v === "all" ? "/dashboard/notifications" : v === "failed" ? "/dashboard/notifications?failed=1" : `/dashboard/notifications?channel=${v}`;
                const active = channelFilter === v;
                return (
                  <Link
                    key={v}
                    href={href}
                    aria-current={active ? "true" : undefined}
                    className={`press rounded-md border px-2.5 py-1 text-[12.5px] transition-colors ${active ? "border-ec-bronze bg-ec-bronze-tint text-ec-bronze-deep" : "border-ec-line bg-ec-card text-ec-ink-2 hover:border-ec-line-strong hover:bg-ec-band"}`}
                  >
                    {t(`ledger.filter.${v}`)}
                  </Link>
                );
              })}
            </div>

            <ul className="divide-y divide-ec-line rounded-[10px] border border-ec-line bg-ec-card">
              {ledger.map((n) => {
                const p = (n.payload ?? {}) as { title?: string; eventDate?: string; offsetDays?: number; body?: string };
                const kindLabel = tn.has(`kind.${n.kind}`) ? tn(`kind.${n.kind}`) : n.kind;
                const detail = p.body ?? (p.eventDate ? `${p.eventDate}${typeof p.offsetDays === "number" ? ` · T-${p.offsetDays}` : ""}` : null);
                const ch = CHANNELS.find((c) => c.key === n.channel) ?? CHANNELS[2];
                const isFailed = n.status === "failed" || n.status === "dead";
                const reached: Step = n.status === "sent" ? "sent" : "queued"; // never fabricate past "sent" — see file header
                const failedLabel = n.status === "dead" ? t("ledger.dead") : isFailed ? t("ledger.failedAttempt", { n: n.attempts }) : undefined;
                const when = n.scheduled_for ?? n.created_at;
                return (
                  <li key={n.id} className="flex flex-wrap gap-3 px-4 py-3.5">
                    <Icon name={ch.icon} className={`mt-[3px] h-3.5 w-3.5 shrink-0 ${isFailed ? "text-ec-danger" : "text-ec-bronze"}`} />
                    <div className="min-w-0 flex-1">
                      <div className="text-[13.5px] leading-snug text-ec-ink">
                        {kindLabel}
                        {p.title && <><span className="text-ec-muted-ink"> · </span><span className="font-display text-[14px] text-ec-ink">{p.title}</span></>}
                      </div>
                      {detail && <div className="mt-0.5 truncate text-[12px] text-ec-muted-ink">{detail}</div>}
                      <div className="mt-1.5">
                        <ReceiptTrail reached={reached} failedLabel={failedLabel} stepLabel={(s) => t(`ledger.step.${s}`)} />
                      </div>
                    </div>
                    <div className="num shrink-0 font-mono text-[11px] uppercase tracking-[0.08em] text-ec-muted-ink">
                      {ledgerDate(when)} · {ledgerTime(when)}
                    </div>
                  </li>
                );
              })}
              {ledger.length === 0 && <li className="px-4 py-6 text-[13px] text-ec-muted-ink">{t("ledger.empty")}</li>}
            </ul>
          </Reveal>

          {/* quiet hours & evening brief */}
          <Reveal as="section" delay={260}>
            <SectionLabel>{t("brief.title")}</SectionLabel>
            <div className="ec-card grid gap-6 p-5 sm:grid-cols-2">
              <QuietHoursForm
                prefs={prefs}
                t={{
                  briefAt: t("brief.briefAt"), ist: t("brief.ist"), digest: t("brief.digest"), instant: t("brief.instant"),
                  instantSoon: t("brief.instantSoon"), quietFrom: t("brief.quietFrom"), quietTo: t("brief.quietTo"),
                  save: t("brief.save"), saving: t("brief.saving"),
                }}
              />
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              <span className="ec-chip ec-chip-hot">{t("brief.chipSaved")}</span>
              <span className="ec-chip">{t("brief.chipChannels", { n: activeChannels })}</span>
            </div>
          </Reveal>

          <Reveal as="div" delay={320} className="flex flex-wrap items-center justify-between gap-4">
            <Stamp lines={[t("footer.stampLine1"), t("footer.stampLine2", { date: ledgerDate(new Date().toISOString()) })]} />
            <Link href="/dashboard/settings" className="text-[12.5px] text-ec-bronze hover:underline">{t("footer.link")}</Link>
          </Reveal>
        </div>
      )}
    </div>
  );
}
