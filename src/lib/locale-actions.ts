"use server";

// Language-switch server action (WO-03). In its own "use server" module so the
// client <LanguageSwitcher/> can import it without pulling next/headers into the
// client bundle. Persists to BOTH the NEXT_LOCALE cookie (per-request fast path)
// and the signed-in user's profile.locale (durable source of truth, RLS-scoped
// to auth.uid() by the profile_update policy).
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isLocale, LOCALE_COOKIE } from "@/i18n/config";

export async function setLocaleAction(formData: FormData): Promise<void> {
  const value = formData.get("locale")?.toString();
  if (!isLocale(value)) return;

  cookies().set(LOCALE_COOKIE, value, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) await supabase.from("profile").update({ locale: value }).eq("id", user.id);

  revalidatePath("/", "layout");
}
