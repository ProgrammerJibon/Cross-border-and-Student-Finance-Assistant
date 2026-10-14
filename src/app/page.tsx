import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { normalizeLocale } from "@/lib/i18n";
export default async function Page() {
  redirect(
    `/${normalizeLocale((await cookies()).get("language")?.value || "en")}`,
  );
}
