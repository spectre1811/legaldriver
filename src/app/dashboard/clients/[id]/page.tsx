import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { Disclaimer, fmtSize, fmtMoney, fmtAgo } from "@/components/ui";
import { formatCourtDate } from "@/components/court";
import { Icon } from "@/components/icons";
import { DocActions } from "@/components/doc-actions";
import { PortalInvite, FirmComposer } from "./portal-controls";
import { ClientDocUpload } from "./client-docs";
import { Communications } from "@/components/communications";
import { ConfirmDelete } from "@/components/confirm-delete";
import { CATEGORY_LABEL, CATEGORY_ORDER } from "@/lib/docs/categories";
import { Pagination } from "@/components/pagination";
import { parsePage, clampPerPage, rangeFor } from "@/lib/paginate";
import { deleteClient } from "./actions";
import { ClientEdit } from "./client-edit";

// WO-333 · Client detail → Daybreak/Chambers. Same restyle approach as the roster: `ec-*`
// primitives already established by cases/[id]/page.tsx, no new global CSS, every section
// still bound to the SAME real queries — plus two honest extensions:
//   - Activity: activity_event scoped to this client's matter ids (mirrors the exact pattern
//     cases/[id]/page.tsx already uses for a single matter — RLS-scoped AND explicitly
//     filtered to this client's own matters, bounded to the last 10).
//   - Billing: Billed/Received/Due computed from this client's own invoice rows (real
//     statuses only — draft/cancelled excluded from "billed", matching invoices-query.ts's
//     documented semantics). Bounded to one client's invoices, not a fan-out.
// Portal is rendered as the 2 states the schema actually has (Active / Not invited) — there
// is no separate "invited, not yet signed in" row in portal_user, so a 3rd state would be
// fabricated.
export default async function ClientDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { page?: string; per?: string; dpage?: string; dper?: string };
}) {
  const t = await getTranslations("clients");
  const td = await getTranslations("dashboard.clients");
  const supabase = createClient();
  const { data: client } = await supabase.from("client").select("*").eq("id", params.id).maybeSingle();
  if (!client) notFound();

  // WO-56: two independent paginated lists on this page — the client's matters (`page`/
  // `per`) and its document library (`dpage`/`dper`). A lightweight id+title fetch of ALL
  // the client's matters still backs the doc cross-reference + "filed under" labels (docs
  // can belong to any of the client's cases, not just the visible page).
  const mPage = parsePage(searchParams.page);
  const mPer = clampPerPage(searchParams.per);
  const mRange = rangeFor(mPage, mPer);
  const dPage = parsePage(searchParams.dpage);
  const dPer = clampPerPage(searchParams.dper);

  const [{ data: matters, count: matterTotal }, { data: clientMatters }, { data: portal }, { data: messages }, { data: allClients }, { data: allMatters }, { data: invoiceRows }, { data: allAreas }] = await Promise.all([
    supabase.from("matter").select("id, title, cnr, status, next_hearing_date", { count: "exact" }).eq("client_id", client.id).order("next_hearing_date", { ascending: true, nullsFirst: false }).range(mRange.from, mRange.to),
    supabase.from("matter").select("id, title").eq("client_id", client.id),
    supabase.from("portal_user").select("id").eq("client_id", client.id).maybeSingle(),
    supabase.from("portal_message").select("id, sender, body, created_at").eq("client_id", client.id).order("created_at", { ascending: true }).limit(100),
    supabase.from("client").select("id, name"),
    supabase.from("matter").select("id, title"),
    // Every invoice for this client, any status — bounded to one client, tenant-scoped via
    // RLS + the explicit client_id filter. Billed/Received/Due are derived below.
    supabase.from("invoice").select("status, total_minor").eq("client_id", client.id),
    supabase.from("practice_area").select("id, name").order("name"),
  ]);

  // custom jsonb fields (no schema change) + resolved practice-area name.
  const custom = (client.custom as { practice_area_id?: string; address?: string; contact_person?: string; notes?: string }) ?? {};
  const practiceAreaName = custom.practice_area_id ? (allAreas ?? []).find((a) => a.id === custom.practice_area_id)?.name ?? null : null;

  // Billed = issued invoices (sent + paid) — draft (unbilled) and cancelled (void) excluded,
  // matching invoices-query.ts's documented status semantics. Received = paid only. Due =
  // sent only (the same "outstanding" figure this page always showed).
  const rows = invoiceRows ?? [];
  const sumWhere = (pred: (s: string) => boolean) => rows.filter((i) => pred(i.status)).reduce((a, i) => a + Number(i.total_minor ?? 0), 0);
  const billedMinor = sumWhere((s) => s === "sent" || s === "paid");
  const receivedMinor = sumWhere((s) => s === "paid");
  const outstandingMinor = sumWhere((s) => s === "sent");

  const editDefaults = {
    name: client.name,
    type: client.type,
    emails: client.emails ?? [],
    phones: client.phones ?? [],
    practiceAreaId: custom.practice_area_id ?? null,
    address: custom.address,
    contactPerson: custom.contact_person,
    notes: custom.notes,
  };

  // Every document filed under this client directly, or under one of its cases — paginated.
  const matterIds = (clientMatters ?? []).map((m) => m.id);
  const orFilter = matterIds.length
    ? `client_id.eq.${client.id},matter_id.in.(${matterIds.join(",")})`
    : `client_id.eq.${client.id}`;
  const dRange = rangeFor(dPage, dPer);
  const { data: docs, count: docTotal } = await supabase
    .from("document")
    .select("id, filename, doc_type, category, source, client_id, matter_id, size_bytes, portal_shared, created_at", { count: "exact" })
    .or(orFilter)
    .order("created_at", { ascending: false })
    .range(dRange.from, dRange.to);

  // Activity across this client's own matters only (mirrors cases/[id]/page.tsx's single-matter
  // query, extended to `.in()`) — RLS-scoped AND explicitly bounded to matterIds so this can
  // never surface another client's or tenant's rows even if a policy regressed.
  const { data: activity } = matterIds.length
    ? await supabase.from("activity_event").select("id, type, summary, created_at").in("matter_id", matterIds).order("created_at", { ascending: false }).limit(10)
    : { data: [] as { id: string; type: string; summary: string; created_at: string }[] };

  const matterName = new Map((clientMatters ?? []).map((m) => [m.id, m.title]));
  const clientOpts = (allClients ?? []).map((c) => ({ id: c.id, label: c.name }));
  const matterOpts = (allMatters ?? []).map((m) => ({ id: m.id, label: m.title }));

  // Group documents by canonical category, preserving the created_at ordering within
  // each group and presenting groups in CATEGORY_ORDER. Unknown categories fall back
  // to "other" so nothing is dropped.
  const docList = docs ?? [];
  const byCategory = new Map<string, typeof docList>();
  for (const d of docList) {
    const key = d.category && CATEGORY_LABEL[d.category] ? d.category : "other";
    (byCategory.get(key) ?? byCategory.set(key, []).get(key)!).push(d);
  }
  const docGroups = CATEGORY_ORDER
    .map((key) => ({ key, docs: byCategory.get(key) ?? [] }))
    .filter((g) => g.docs.length > 0);

  return (
    <div className="space-y-6">
      <Link href="/dashboard/clients" className="inline-flex items-center gap-1.5 text-sm font-medium text-ec-bronze hover:underline">
        <Icon name="back" className="h-4 w-4" /> {t("backToClients")}
      </Link>

      <header className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="ec-label">{t("clientSince", { date: formatCourtDate(client.created_at) ?? "—" })}</p>
            <h1 className="mt-1 font-display text-[1.7rem] font-medium leading-tight text-ec-ink">{client.name}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-ec-ink-3">
              <span className="ec-chip">{client.type === "org" ? t("intake.typeOrg") : t("intake.typeIndividual")}</span>
              {practiceAreaName && <span>{practiceAreaName}</span>}
            </div>
            {outstandingMinor > 0 && (
              <p className="mt-2 text-sm text-ec-ink-3">{t("outstanding")}: <span className="num font-medium text-ec-ink">{fmtMoney(outstandingMinor)}</span></p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <ConfirmDelete action={deleteClient} id={client.id} label={t("deleteClient")} confirmLabel={t("deleteClient")} note={t("deleteNote")} redirectTo="/dashboard/clients" size="md" />
          </div>
        </div>
        <ClientEdit id={client.id} practiceAreas={allAreas ?? []} defaults={editDefaults} />
      </header>

      {(custom.address || custom.contact_person || custom.notes) && (
        <div className="ec-card p-5">
          <dl className="grid gap-4 text-sm sm:grid-cols-2">
            {custom.contact_person && <div><dt className="ec-label">{t("intake.contactPerson")}</dt><dd className="mt-1 text-ec-ink">{custom.contact_person}</dd></div>}
            {custom.address && <div><dt className="ec-label">{t("intake.address")}</dt><dd className="mt-1 text-ec-ink">{custom.address}</dd></div>}
            {custom.notes && <div className="sm:col-span-2"><dt className="ec-label">{t("intake.notes")}</dt><dd className="mt-1 whitespace-pre-wrap text-ec-ink">{custom.notes}</dd></div>}
          </dl>
        </div>
      )}

      {((client.phones?.length ?? 0) > 0 || (client.emails?.length ?? 0) > 0) && (
        <div className="ec-card p-5">
          <p className="ec-label mb-2">{td("contactHeading")}</p>
          <div className="flex flex-wrap gap-2">
            {(client.phones ?? []).map((p: string) => (
              <a key={p} href={`tel:${p}`} className="num rounded-ec-s border border-ec-hair bg-ec-paper px-3 py-1.5 text-[12.5px] text-ec-ink-2 transition hover:border-ec-bronze hover:text-ec-bronze">{p}</a>
            ))}
            {(client.emails ?? []).map((e: string) => (
              <a key={e} href={`mailto:${e}`} className="num rounded-ec-s border border-ec-hair bg-ec-paper px-3 py-1.5 text-[12.5px] text-ec-ink-2 transition hover:border-ec-bronze hover:text-ec-bronze">{e}</a>
            ))}
          </div>
        </div>
      )}

      {/* Client portal + Billing — side by side only once each has room for its own content
          (the Billing card's 3-col Billed/Received/Due needs more than half of a 768px column). */}
      <section className="grid gap-4 lg:grid-cols-2">
        <div className="ec-card p-5">
          <div className="mb-2 flex items-center gap-2">
            <Icon name="inbox" className="h-4 w-4 text-ec-bronze" />
            <p className="ec-label">{t("clientPortal")}</p>
          </div>
          <p className="text-[13px] text-ec-ink-2">{portal?.id ? td("portalActiveDesc") : td("portalNotInvitedDesc")}</p>
          <div className="mt-3">
            <PortalInvite clientId={client.id} portalUserId={portal?.id ?? null} />
          </div>
        </div>
        <div className="ec-card p-5">
          <p className="ec-label mb-3">{td("billingHeading")}</p>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <div className="ec-label">{td("billed")}</div>
              <div className="num mt-0.5 font-display text-[16px] text-ec-ink">{fmtMoney(billedMinor)}</div>
            </div>
            <div>
              <div className="ec-label">{td("received")}</div>
              <div className="num mt-0.5 font-display text-[16px] text-ec-ink">{fmtMoney(receivedMinor)}</div>
            </div>
            <div>
              <div className="ec-label">{td("due")}</div>
              <div className="num mt-0.5 font-display text-[16px] text-ec-ink">{outstandingMinor > 0 ? fmtMoney(outstandingMinor) : "—"}</div>
            </div>
          </div>
        </div>
      </section>

      {/* Matters */}
      <div className="ec-card overflow-hidden">
        <div className="border-b border-ec-hair px-5 py-4"><h2 className="font-display text-base font-medium text-ec-ink">{t("casesHeading")} <span className="text-ec-ink-3">({matterTotal ?? 0})</span></h2></div>
        {matters && matters.length ? (
          <>
            <ul className="divide-y divide-ec-hair">
              {matters.map((m) => (
                <li key={m.id}>
                  <Link href={`/dashboard/cases/${m.id}`} className="ec-row flex flex-col gap-1 px-5 py-3 text-sm sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                    <span className="min-w-0 truncate font-medium text-ec-ink">{m.title}</span>
                    <span className="num shrink-0 text-xs text-ec-ink-3">{m.cnr ?? "—"} · {t("nextPrefix")} {(formatCourtDate(m.next_hearing_date) ?? "—")}</span>
                  </Link>
                </li>
              ))}
            </ul>
            <div className="border-t border-ec-hair px-5 py-3">
              <Pagination page={mPage} perPage={mPer} total={matterTotal ?? 0} />
            </div>
          </>
        ) : <p className="px-5 py-8 text-center text-sm text-ec-ink-3">{t("noCases")}</p>}
      </div>

      {/* Document library — everything filed under this client or its cases */}
      <div className="ec-card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ec-hair px-5 py-3">
          <h2 className="font-display text-base font-medium text-ec-ink">{t("documentsHeading")} <span className="text-ec-ink-3">({docTotal ?? 0})</span></h2>
          <ClientDocUpload clientId={client.id} />
        </div>
        {docGroups.length ? (
          <div className="divide-y divide-ec-hair">
            {docGroups.map((g) => (
              <section key={g.key}>
                <div className="flex items-center gap-2 bg-ec-band/40 px-5 py-2.5">
                  <h3 className="ec-label">{CATEGORY_LABEL[g.key]}</h3>
                  <span className="text-xs text-ec-ink-3">({g.docs.length})</span>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-ec-hair text-left">
                      <th className="ec-label px-5 py-3">{t("colFile")}</th>
                      <th className="ec-label hidden px-5 py-3 sm:table-cell">{t("colType")}</th>
                      <th className="ec-label px-5 py-3">{t("colFiledUnder")}</th>
                      <th className="ec-label hidden px-5 py-3 lg:table-cell">{t("colSize")}</th>
                      <th className="ec-label hidden px-5 py-3 lg:table-cell">{t("colAdded")}</th>
                      <th className="px-5 py-3"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.docs.map((d) => {
                      const filedName = d.matter_id ? matterName.get(d.matter_id) ?? t("filedCase") : t("filedClient");
                      return (
                        <tr key={d.id} className="ec-row border-b border-ec-hair last:border-0">
                          <td className="px-5 py-3.5">
                            <Link href={`/dashboard/documents/${d.id}`} className="flex items-center gap-2.5 text-ec-ink hover:text-ec-bronze">
                              <Icon name="documents" className="h-4 w-4 shrink-0 text-ec-ink-3" />
                              <span className="font-medium">{d.filename ?? "—"}</span>
                            </Link>
                          </td>
                          <td className="hidden px-5 py-3.5 sm:table-cell">{d.doc_type ? <span className="ec-chip">{d.doc_type}</span> : <span className="text-ec-ink-3">—</span>}</td>
                          <td className="px-5 py-3.5 text-ec-ink-3">{filedName}</td>
                          <td className="hidden px-5 py-3.5 text-xs text-ec-ink-3 lg:table-cell">{fmtSize(d.size_bytes)}</td>
                          <td className="hidden px-5 py-3.5 text-xs text-ec-ink-3 lg:table-cell">{(formatCourtDate(d.created_at) ?? "—")}</td>
                          <td className="px-5 py-3.5 text-right">
                            <DocActions documentId={d.id} matterId={d.matter_id} clientId={d.client_id} matters={matterOpts} clients={clientOpts} shared={d.portal_shared} docType={d.doc_type} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </section>
            ))}
          </div>
        ) : <p className="px-5 py-8 text-center text-sm text-ec-ink-3">{t("noDocuments")}</p>}
        {(docTotal ?? 0) > 0 && (
          <div className="border-t border-ec-hair px-5 py-3">
            <Pagination page={dPage} perPage={dPer} total={docTotal ?? 0} pageKey="dpage" perKey="dper" />
          </div>
        )}
      </div>

      {/* Communications timeline (email + WhatsApp/SMS filed to this client) */}
      <Communications clientId={client.id} />

      {/* Activity — this client's matters only (bounded, tenant + client scoped) */}
      <div className="ec-card">
        <div className="border-b border-ec-hair px-5 py-4"><h2 className="font-display text-base font-medium text-ec-ink">{td("activityHeading")}</h2></div>
        {activity && activity.length ? (
          <ul className="px-5 py-2">
            {activity.map((a) => (
              <li key={a.id} className="flex gap-3 py-2.5 text-sm">
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-ec-bronze" />
                <span className="flex-1 text-ec-ink-2">{a.summary}</span>
                <span className="shrink-0 text-xs text-ec-ink-3">{fmtAgo(a.created_at)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-5 py-8 text-center text-sm text-ec-ink-3">{td("activityEmpty")}</p>
        )}
      </div>

      {/* Secure messaging (same thread the client sees in the portal) */}
      <div className="ec-card overflow-hidden">
        <div className="border-b border-ec-hair px-5 py-3"><h2 className="font-display text-base font-medium text-ec-ink">{t("messagesHeading")}</h2></div>
        <ul className="max-h-72 space-y-2 overflow-y-auto px-5 py-4">
          {messages && messages.length ? messages.map((m) => (
            <li key={m.id} className={`flex ${m.sender === "firm" ? "justify-end" : "justify-start"}`}>
              <span className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-sm ${m.sender === "firm" ? "bg-ec-ink text-ec-paper" : "bg-ec-paper-3 text-ec-ink-2"}`}>{m.body}</span>
            </li>
          )) : <li className="py-6 text-center text-sm text-ec-ink-3">{t("noMessages")}</li>}
        </ul>
        <div className="border-t border-ec-hair px-5 py-3"><FirmComposer clientId={client.id} /></div>
      </div>

      <Disclaimer />
    </div>
  );
}
