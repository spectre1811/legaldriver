import { redirect } from "next/navigation";

// The Assistant surface has no landing of its own — default to the Ask tab.
export default function AssistantIndex() {
  redirect("/dashboard/assistant/ask");
}
