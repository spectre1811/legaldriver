"use client";

// WO-147 W4 — Settings → Profile photo block (design-system-v2 §7: "photo upload, initials fallback").
// Reuses the app's storage pattern via server actions (uploadAvatar/removeAvatar). The image is
// center-cropped to a square and downscaled to ≤256px client-side (canvas — no dependency), so what
// we upload is already small (well under the 1 MB server guard) and correctly shaped for a round frame.
// Fallback is the initials avatar (never a gray silhouette — honesty rule §7b).
import { useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/icons";
import { uploadAvatar, removeAvatar, type ActionResult } from "./actions";

const AVATAR_PX = 256;

// Draw the largest centered square of the source image onto a 256px canvas → JPEG blob.
function cropToSquare(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const side = Math.min(img.width, img.height);
      const sx = (img.width - side) / 2;
      const sy = (img.height - side) / 2;
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = AVATAR_PX;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("no canvas"));
      ctx.drawImage(img, sx, sy, side, side, 0, 0, AVATAR_PX, AVATAR_PX);
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("no blob"))), "image/jpeg", 0.85);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("bad image"));
    };
    img.src = url;
  });
}

type Props = { photoUrl: string | null; initial: string; name: string; designation: string | null };

export function PhotoBlock({ photoUrl, initial, name, designation }: Props) {
  const t = useTranslations("settings");
  const inputRef = useRef<HTMLInputElement>(null);
  // Optimistic preview so the change lands instantly; the server revalidate then makes it durable.
  const [preview, setPreview] = useState<string | null>(photoUrl);
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, start] = useTransition();

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file
    if (!file) return;
    setResult(null);
    let blob: Blob;
    try {
      blob = await cropToSquare(file);
    } catch {
      setResult({ ok: false, message: t("profile.photoType") });
      return;
    }
    const local = URL.createObjectURL(blob);
    setPreview(local);
    const fd = new FormData();
    fd.append("photo", blob, "avatar.jpg");
    start(async () => {
      const r = await uploadAvatar({ ok: false, message: "" }, fd);
      setResult(r);
      if (!r.ok) setPreview(photoUrl); // roll back the optimistic preview on failure
      URL.revokeObjectURL(local);
    });
  }

  function onRemove() {
    setResult(null);
    setPreview(null);
    start(async () => {
      const r = await removeAvatar();
      setResult(r);
      if (!r.ok) setPreview(photoUrl);
    });
  }

  return (
    <div>
      <div className="flex items-center gap-4">
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element -- signed one-off URL, not a static asset
          <img
            src={preview}
            alt={name}
            className="h-16 w-16 shrink-0 rounded-full object-cover ring-1 ring-ec-hair"
          />
        ) : (
          <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-ec-bronze-tint font-display text-2xl font-semibold text-ec-ink ring-1 ring-ec-hair">
            {initial}
          </span>
        )}
        <div className="min-w-0">
          <p className="truncate text-base font-medium text-ink">{name}</p>
          {designation && <p className="truncate text-sm text-ink-muted">{designation}</p>}
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={pending}
              className="inline-flex items-center gap-1.5 rounded-ec-s border border-ec-hair px-2.5 py-1.5 text-xs font-medium text-ec-ink transition hover:bg-ec-paper-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ec-honey disabled:opacity-60"
            >
              <Icon name="upload" className="h-3.5 w-3.5" />
              {pending ? t("profile.photoSaving") : t("profile.photoChange")}
            </button>
            {preview && (
              <button
                type="button"
                onClick={onRemove}
                disabled={pending}
                className="rounded-ec-s px-2 py-1.5 text-xs text-ec-ink-3 transition hover:text-ec-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ec-honey disabled:opacity-60"
              >
                {t("profile.photoRemove")}
              </button>
            )}
          </div>
        </div>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={onPick}
        className="sr-only"
        aria-hidden
        tabIndex={-1}
      />
      <p className="mt-2 text-xs text-ink-faint">{t("profile.photoHint")}</p>
      {result?.message && (
        <p role="status" className={`mt-2 text-xs ${result.ok ? "text-emerald-700" : "text-amber-800"}`}>
          {result.message}
        </p>
      )}
    </div>
  );
}
