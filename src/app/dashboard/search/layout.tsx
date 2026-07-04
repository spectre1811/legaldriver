import type { ReactNode } from "react";
import { SearchTabs } from "./tabs";

// Shared shell for the Court Search surface — a tab bar over the Directory
// (live roster) and Judgments (corpus) sub-routes, so the two search tools read
// as one consolidated surface.
export default function SearchLayout({ children }: { children: ReactNode }) {
  return (
    <div className="space-y-6">
      <SearchTabs />
      {children}
    </div>
  );
}
