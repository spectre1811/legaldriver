import { redirect } from "next/navigation";

// The Court Search surface has no landing of its own — default to the Directory tab.
export default function SearchIndex() {
  redirect("/dashboard/search/directory");
}
