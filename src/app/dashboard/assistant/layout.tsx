import type { ReactNode } from "react";
import { AssistantTabs } from "./tabs";

// Shared shell for the Assistant surface — a tab bar over the Ask (copilot) and
// Draft sub-routes, so the two AI tools read as one consolidated surface.
export default function AssistantLayout({ children }: { children: ReactNode }) {
  return (
    <div className="space-y-6">
      <AssistantTabs />
      {children}
    </div>
  );
}
