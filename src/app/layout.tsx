import type { Metadata } from "next";
import { cookies } from "next/headers";
import { appConfig } from "@/lib/config";
import "./globals.css";
export const metadata: Metadata = {
  title: { default: appConfig.name, template: `%s · ${appConfig.name}` },
  description:
    "Cross-border and student finance sandbox: tuition planning, remittance comparison, risk controls and auditable AI execution.",
};
export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const jar = await cookies();
  const theme = jar.get("theme")?.value;
  const locale = jar.get("language")?.value || "en";
  return (
    <html lang={locale} data-theme={theme || "light"} suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('theme')||document.cookie.match(/(?:^|; )theme=(light|dark)/)?.[1]||(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');localStorage.setItem('theme',t);document.documentElement.dataset.theme=t;}catch(e){}`,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
