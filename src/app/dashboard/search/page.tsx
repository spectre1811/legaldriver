import { redirect } from "next/navigation";

// WO-82 · The Directory (Judges & Lawyers) moved to /dashboard/directory (Practice). The Court
// Search surface is now the Judgments corpus — default there.
export default function SearchIndex() {
  redirect("/dashboard/search/judgments");
}
