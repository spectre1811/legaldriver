"use client";

// WO-409 · shared bulk-zip-download — extracted from documents-browser.tsx's Trash "Export" action
// so the main list's new BulkBar "Download" (documents-list.tsx) reuses the exact same real
// /api/documents/export path instead of a second copy of the fetch → blob → anchor dance.
export async function downloadDocumentsZip(ids: string[]): Promise<boolean> {
  try {
    const res = await fetch("/api/documents/export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    });
    if (!res.ok) return false;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "documents-export.zip";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    return true;
  } catch {
    return false;
  }
}
