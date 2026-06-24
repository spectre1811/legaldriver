import { createClient } from "@/lib/supabase/server";
import { PageHeader, Card } from "@/components/ui";
import { Icon } from "@/components/icons";
import { AdvocateForm } from "./advocate-form";

export default async function SettingsPage() {
  const supabase = createClient();
  const { data: advocates } = await supabase
    .from("advocate")
    .select("id, name, bar_registration_number, state_code")
    .order("name");

  return (
    <div className="space-y-7">
      <PageHeader title="Settings" subtitle="Add advocates with their Bar Registration Number to pull their daily cause list." />

      <Card className="p-5">
        <h2 className="mb-4 text-base font-medium">Advocates</h2>
        <AdvocateForm />
        {advocates && advocates.length > 0 && (
          <ul className="mt-5 divide-y divide-line">
            {advocates.map((a) => (
              <li key={a.id} className="flex items-center justify-between py-3 text-sm">
                <span className="flex items-center gap-2.5 font-medium text-ink">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-50 text-xs font-semibold text-brand-700">
                    {a.name.slice(0, 1)}
                  </span>
                  {a.name}
                </span>
                <span className="font-mono text-xs text-ink-faint">
                  {a.bar_registration_number ?? "—"}{a.state_code ? ` · ${a.state_code}` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="flex items-start gap-3 p-5">
        <Icon name="gmail" className="mt-0.5 h-5 w-5 text-ink-faint" />
        <div className="text-sm text-ink-muted">
          <p className="font-medium text-ink">Connections</p>
          <p className="mt-0.5">Connect Gmail from the <span className="text-brand-600">Inbox</span> to auto-file emails and attachments against the right client and case.</p>
        </div>
      </Card>
    </div>
  );
}
