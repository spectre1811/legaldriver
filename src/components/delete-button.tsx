"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";

type DeleteResult = { ok: boolean; message: string };

// Reusable two-step inline delete control (no window.confirm). First click reveals
// "Delete? · Confirm / Cancel"; Confirm runs the passed server action in a
// transition, then refreshes. Server actions are passed as props in this codebase
// (see RespondButton/DocActions importing actions directly).
export function DeleteButton({
  onDelete,
  label = "Delete",
  size = "sm",
}: {
  onDelete: () => Promise<DeleteResult>;
  label?: string;
  size?: "sm" | "md";
}) {
  const [confirming, setConfirming] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();

  const pad = size === "md" ? "px-3 py-1.5 text-sm" : "px-2 py-1 text-xs";

  if (confirming) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs">
        <span className="text-ink-soft">Delete?</span>
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              await onDelete();
              setConfirming(false);
              router.refresh();
            })
          }
          className={`btn ${pad} bg-red-600 text-white hover:bg-red-700`}
        >
          {pending ? "…" : "Confirm"}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => setConfirming(false)}
          className={`btn-ghost ${pad}`}
        >
          Cancel
        </button>
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setConfirming(true)}
      className={`btn-ghost inline-flex items-center gap-1.5 text-red-600 hover:bg-red-50 ${pad}`}
      aria-label={label}
    >
      <Icon name="alert" className="h-4 w-4" />
      {label}
    </button>
  );
}
