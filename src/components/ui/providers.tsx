"use client";
import {
  createContext,
  useContext,
  useMemo,
  useState,
  useEffect,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { ThemeProvider, createTheme, Snackbar, Alert } from "@mui/material";
import { AppRouterCacheProvider } from "@mui/material-nextjs/v15-appRouter";
import { useRouter } from "next/navigation";
import type { Result } from "@/types";
import type { Locale } from "@/lib/config";
import { updatePreferences } from "@/actions/preferences.actions";
type AppContextType = {
  catalog: {
    currencies: { code: string; name: string; symbol: string }[];
    countries: { code: string; name: string; currency_code: string }[];
  };
  locale: Locale;
  t: (key: string) => string;
  theme: "light" | "dark";
  toggleTheme: () => void;
  run: <T>(
    fn: () => Promise<Result<T>>,
    options?: { quiet?: boolean; refresh?: boolean },
  ) => Promise<T | undefined>;
  toast: (text: string, error?: boolean) => void;
};
const Context = createContext<AppContextType | null>(null);
const subscribeTheme = (callback: () => void) => {
  window.addEventListener("storage", callback);
  window.addEventListener("finbridge-theme", callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener("finbridge-theme", callback);
  };
};
function storeTheme(theme: "light" | "dark") {
  localStorage.setItem("theme", theme);
  document.documentElement.dataset.theme = theme;
  document.cookie = `theme=${theme};path=/;SameSite=Lax;max-age=31536000`;
  window.dispatchEvent(new Event("finbridge-theme"));
}
export const useApp = () => {
  const c = useContext(Context);
  if (!c) throw new Error("Missing AppProvider");
  return c;
};
export function Providers({
  children,
  locale,
  dictionary,
  initialTheme,
  catalog,
  userId,
}: {
  children: ReactNode;
  locale: Locale;
  dictionary: Record<string, string>;
  initialTheme?: "light" | "dark";
  catalog: AppContextType["catalog"];
  userId?: string;
}) {
  const mode = useSyncExternalStore(
    subscribeTheme,
    (): "light" | "dark" => {
      const stored = localStorage.getItem("theme");
      if (stored === "dark" || stored === "light") return stored;
      return window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
    },
    () => initialTheme || "light",
  );
  useEffect(() => {
    const stored = localStorage.getItem("theme") as "light" | "dark" | null;
    const system = window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
    const chosen = stored || system;
    storeTheme(chosen);
    if (!stored) {
      localStorage.setItem("theme", chosen);
      if (userId) void updatePreferences({ theme: chosen });
    }
  }, [userId]);
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  const [notice, setNotice] = useState({ message: "", error: false });
  const router = useRouter();
  const t = (key: string) => dictionary[key] || key;
  const theme = useMemo(
    () =>
      createTheme({
        palette: {
          mode,
          primary: { main: mode === "dark" ? "#65c6ad" : "#187a65" },
          background: {
            default: mode === "dark" ? "#101c23" : "#f6f8fa",
            paper: mode === "dark" ? "#17262e" : "#ffffff",
          },
          text: {
            primary: mode === "dark" ? "#e8f0ee" : "#18302d",
            secondary: mode === "dark" ? "#9cafa9" : "#768580",
          },
        },
        typography: {
          fontFamily: '"Segoe UI", Arial, sans-serif',
          button: { textTransform: "none", fontWeight: 600 },
        },
        shape: { borderRadius: 14 },
        components: {
          MuiOutlinedInput: {
            styleOverrides: {
              root: {
                "& .MuiOutlinedInput-notchedOutline": { borderColor: mode === "dark" ? "#526963" : "#91a69e" },
                "&.Mui-focused .MuiOutlinedInput-notchedOutline": { borderWidth: 1, borderColor: mode === "dark" ? "#83d9ba" : "#126c58" },
              },
              input: { "&:focus, &:focus-visible": { outline: "none", boxShadow: "none" } },
            },
          },
          MuiButton: { styleOverrides: { root: { minHeight: 44 } } },
          MuiDialog: { styleOverrides: { paper: { backgroundImage: "none" } } },
        },
      }),
    [mode],
  );
  const toast = (message: string, error = false) =>
    setNotice({ message, error });
  const run = async <T,>(
    fn: () => Promise<Result<T>>,
    options?: { quiet?: boolean; refresh?: boolean },
  ) => {
    try {
      const r = await fn();
      if (!r.success) {
        toast(t(r.code), true);
        return undefined;
      }
      if (!options?.quiet) toast(t("success"));
      if (options?.refresh !== false) router.refresh();
      return r.data;
    } catch {
      toast(t("DATABASE_ERROR"), true);
      return undefined;
    }
  };
  const toggleTheme = async () => {
    const next = mode === "light" ? "dark" : "light";
    storeTheme(next);
    await run(() => updatePreferences({ theme: next }), {
      quiet: true,
      refresh: false,
    });
  };
  return (
    <AppRouterCacheProvider>
      <ThemeProvider theme={theme}>
        <Context.Provider
          value={{ locale, t, theme: mode, toggleTheme, run, toast, catalog }}
        >
          {children}
          <Snackbar
            open={!!notice.message}
            autoHideDuration={6000}
            onClose={() => setNotice({ ...notice, message: "" })}
          >
            <Alert
              severity={notice.error ? "error" : "success"}
              onClose={() => setNotice({ ...notice, message: "" })}
            >
              {notice.message}
            </Alert>
          </Snackbar>
        </Context.Provider>
      </ThemeProvider>
    </AppRouterCacheProvider>
  );
}
