import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { Providers } from "@/components/ui/providers";
import { dictionary, normalizeLocale } from "@/lib/i18n";
import { currentUser } from "@/lib/auth";
import { catalog } from "@/lib/catalog";
import { WorkspaceFrame } from "@/components/layout/workspace-frame";
import { rows } from "@/lib/db";
export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!["en", "zh-CN", "bn-BD"].includes(locale)) notFound();
  const u = await currentUser();
  const theme = u?.theme || (await cookies()).get("theme")?.value;
  return (
    <Providers
      key={locale}
      locale={normalizeLocale(locale)}
      dictionary={dictionary(locale)}
      catalog={await catalog()}
      userId={u?.id}
      initialTheme={
        theme === "dark" ? "dark" : theme === "light" ? "light" : undefined
      }
    >
      <WorkspaceFrame
        user={u}
        notifications={
          u
            ? await rows(
                "SELECT id,type,detail,is_read FROM notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 50",
                [u.id],
              )
            : []
        }
      >
        {children}
      </WorkspaceFrame>
    </Providers>
  );
}
