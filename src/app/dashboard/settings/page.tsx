import { createClient } from "@/lib/supabase/server";
import { AdvocateForm } from "./advocate-form";

export default async function SettingsPage() {
  const supabase = createClient();
  const { data: advocates } = await supabase
    .from("advocate")
    .select("id, name, bar_registration_number, state_code")
    .order("name");

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-ink">Settings</h1>
        <p className="mt-1 text-sm text-slate-500">
          Add advocates with their Bar Registration Number to pull their daily cause list.
        </p>
      </header>

      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <h2 className="mb-3 font-medium text-ink">Advocates</h2>
        <AdvocateForm />
        {advocates && advocates.length > 0 && (
          <ul className="mt-4 divide-y divide-slate-100 text-sm">
            {advocates.map((a) => (
              <li key={a.id} className="flex items-center justify-between py-2">
                <span className="font-medium text-ink">{a.name}</span>
                <span className="font-mono text-xs text-slate-500">
                  {a.bar_registration_number ?? "—"} {a.state_code ? `· ${a.state_code}` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
