import { PageHeader, Disclaimer } from "@/components/ui";
import { CauseListUploader } from "./uploader";

export const metadata = { title: "Cause list · Legaldriver" };

export default function CauseListPage() {
  return (
    <div className="space-y-7">
      <PageHeader
        title="Cause list"
        subtitle="Upload the cause list you received from the court — we match it to your cases and update next-hearing dates. No scraping; you supply the file."
      />
      <CauseListUploader />
      <Disclaimer />
    </div>
  );
}
