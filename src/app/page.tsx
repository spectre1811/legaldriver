import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Landing } from "@/components/landing";

export default async function Home() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // Logged-in users go straight to their workspace; everyone else sees the
  // public marketing landing.
  if (user) redirect("/dashboard");
  return <Landing />;
}
