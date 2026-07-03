import { getTranslations } from "next-intl/server";
import { Icon } from "@/components/icons";
import { CauseListUploader } from "./uploader";

export const metadata = { title: "Cause list · Mukadma" };

export default async function CauseListPage() {
  const t = await getTranslations("causeList");
  const tc = await getTranslations("common");
  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-[1.6rem] font-medium leading-tight tracking-tight text-ec-ink">{t("page.title")}</h1>
        <p className="mt-1 max-w-2xl text-sm text-ec-ink-3">{t("page.subtitle")}</p>
      </header>
      <CauseListUploader />
      <p className="flex items-center gap-1.5 text-xs text-ec-ink-3">
        <Icon name="alert" className="h-3.5 w-3.5" /> {tc("disclaimer")}
      </p>
    </div>
  );
}
