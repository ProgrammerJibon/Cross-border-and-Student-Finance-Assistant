"use client";
import Image from "next/image";
import Link from "next/link";
import {
  useState,
  useEffect,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  FiGrid,
  FiZap,
  FiCreditCard,
  FiList,
  FiGlobe,
  FiSend,
  FiBookOpen,
  FiPieChart,
  FiTrendingUp,
  FiBell,
  FiActivity,
  FiUsers,
  FiSettings,
  FiSearch,
  FiPlus,
  FiArrowUpRight,
  FiLogOut,
  FiMoon,
  FiSun,
  FiMenu,
  FiShield,
  FiCheckCircle,
  FiLayers,
  FiFlag,
} from "react-icons/fi";
import { appConfig } from "@/lib/config";
import type { User, Row } from "@/types";
import { useApp } from "@/components/ui/providers";
import { Modal } from "@/components/ui/primitives";
import { updatePreferences } from "@/actions/preferences.actions";
import { logout } from "@/actions/auth.actions";
import { globalSearch } from "@/actions/dashboard.actions";
import { readNotifications } from "@/actions/alert.actions";
import { hasPermission } from "@/lib/admin-permissions";
const subscribeSidebar = (cb: () => void) => {
  window.addEventListener("sidebar-state", cb);
  return () => window.removeEventListener("sidebar-state", cb);
};
export function ThemeToggle() {
  const { theme, t, toggleTheme } = useApp();
  return (
    <button
      type="button"
      className="icon-button"
      aria-label={t(theme === "dark" ? "light" : "dark")}
      onClick={toggleTheme}
    >
      {theme === "dark" ? <FiSun /> : <FiMoon />}
    </button>
  );
}
const icons: Record<string, ReactNode> = {
  dashboard: <FiGrid />,
  agent: <FiZap />,
  money: <FiCreditCard />,
  transactions: <FiList />,
  wallet: <FiGlobe />,
  transfer: <FiSend />,
  tuition: <FiBookOpen />,
  budget: <FiPieChart />,
  credit: <FiTrendingUp />,
  alerts: <FiBell />,
  activity: <FiActivity />,
  family: <FiUsers />,
  subscription: <FiLayers />,
  settings: <FiSettings />,
  users: <FiUsers />,
  plans: <FiLayers />,
  risk: <FiShield />,
  finance: <FiGlobe />,
  audit: <FiList />,
  reports: <FiFlag />,
  approvals: <FiCheckCircle />,
  students: <FiUsers />,
  controls: <FiShield />,
  overview: <FiGrid />,
  subscriptions: <FiCreditCard />,
};
export function Brand() {
  return (
    <span className="brand">
      <span className="brand-mark">
        <span />
        <span />
        <span />
      </span>
      <span>
        {appConfig.name.replace(/ AI$/, "")}
        <b>AI</b>
      </span>
    </span>
  );
}
export function LanguageSwitch() {
  const { locale, run, t } = useApp();
  const router = useRouter();
  const path = usePathname();
  return (
    <select
      className="language-select"
      aria-label={t("language")}
      value={locale}
      onChange={async (e) => {
        const next = e.target.value;
        const ok = await run(() => updatePreferences({ language: next }), {
          quiet: true,
          refresh: false,
        });
        if (ok) router.replace(path.replace(`/${locale}`, `/${next}`));
      }}
    >
      <option value="en">EN</option>
      <option value="zh-CN">中文</option>
      <option value="bn-BD">বাংলা</option>
    </select>
  );
}
export function Shell({
  user,
  notifications,
  children,
}: {
  user: User;
  notifications: Row[];
  children: ReactNode;
}) {
  const { locale, t, theme, toggleTheme, run } = useApp();
  const path = usePathname();
  const router = useRouter();
  const [drawer, setDrawer] = useState(false);
  const [modal, setModal] = useState("");
  const [results, setResults] = useState<Row[]>([]);
  const [query, setQuery] = useState("");
  const [searched, setSearched] = useState(false);
  const navRef = useRef<HTMLElement>(null);
  const collapsed = useSyncExternalStore(
    subscribeSidebar,
    () => localStorage.getItem("sidebar-collapsed") === "true",
    () => false,
  );
  const toggleSidebar = () => {
    localStorage.setItem("sidebar-collapsed", String(!collapsed));
    window.dispatchEvent(new Event("sidebar-state"));
  };
  useEffect(() => {
    if (navRef.current)
      navRef.current.scrollTop = Number(
        sessionStorage.getItem("sidebar-scroll") || 0,
      );
  }, []);
  useEffect(() => {
    if (modal !== "search") return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      if (query.trim().length < 2) {
        setResults([]);
        setSearched(false);
        return;
      }
      const result = await globalSearch(query);
      if (!cancelled) {
        setResults(result.success ? result.data : []);
        setSearched(true);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, modal]);
  const prefix = `/${locale}`;
  const groups =
    user.role === "STUDENT"
      ? [
          [
            "dashboard",
            "agent",
            "money",
            "payments",
            "beneficiaries",
            "transactions",
            "wallet",
            "transfer",
          ],
          ["tuition", "budget", "credit", "alerts", "activity"],
          ["family", "subscription", "api-keys", "settings"],
        ]
      : user.role === "PARENT"
        ? [
            [
              "parent",
              "parent/students",
              "parent/approvals",
              "parent/controls",
            ],
            [
              "agent",
              "money",
              "payments",
              "beneficiaries",
              "transactions",
              "activity",
              "alerts",
            ],
            ["subscription", "api-keys", "settings"],
          ]
        : [
            [
              "admin",
              "admin/users",
              "admin/plans",
              "admin/subscriptions",
              "admin/reports",
            ],
            [
              ...(user.role === "ADMIN" ? ["agent"] : []),
              "admin/risk",
              "admin/agent",
              "admin/finance",
              "admin/settlements",
              "admin/payment-methods",
              "admin/catalog",
              "admin/models",
              "admin/team",
              "admin/audit",
            ],
            ["project-evidence", "security-assessment", "api-keys", "settings"],
          ];
  const nav = (route: string) => {
    if (
      user.role === "MODERATOR" &&
      ((route.startsWith("admin/") &&
        !hasPermission(user, route.split("/")[1])) ||
        route === "project-evidence")
    )
      return null;
    const key =
      route === "parent"
        ? "dashboard"
        : route === "admin"
          ? "overview"
          : route.split("/").at(-1)!;
    return (
      <Link
        key={route}
        href={`${prefix}/${route}`}
        className={`nav-link ${path === `${prefix}/${route}` ? "active" : ""}`}
        onClick={() => setDrawer(false)}
      >
        {icons[key] || <FiShield />}
        <span>{t(key)}</span>
        {key === "agent" && <span className="nav-ai">AI</span>}
      </Link>
    );
  };
  return (
    <div className={`app-shell ${collapsed ? "sidebar-collapsed" : ""}`}>
      <a className="skip-link" href="#main">
        {t("continue")}
      </a>
      {drawer && (
        <button
          className="sidebar-backdrop"
          aria-label={t("close")}
          onClick={() => setDrawer(false)}
        />
      )}
      <aside className={`sidebar ${drawer ? "open" : ""}`}>
        <Link
          className="brand-link"
          href={`${prefix}/${user.role === "STUDENT" ? "dashboard" : user.role === "PARENT" ? "parent" : "admin"}`}
        >
          <Brand />
        </Link>
        <div className="workspace-label">
          <span className="workspace-dot" />
          {t(user.role.toLowerCase())}
          <span className="workspace-chevron">⌄</span>
        </div>
        <nav
          ref={navRef}
          onScroll={(e) =>
            sessionStorage.setItem(
              "sidebar-scroll",
              String(e.currentTarget.scrollTop),
            )
          }
        >
          {groups.map((g, i) => (
            <div className="nav-group" key={i}>
              <p>{t(["workspace", "planning", "account"][i])}</p>
              {g.map(nav)}
            </div>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sandbox-tag">
            <FiShield />
            <span>
              {t("sandbox")}
              <small>{t("sandboxNote")}</small>
            </span>
          </div>
          <button
            className="user-profile"
            onClick={() => {
              setModal("profile");
              setDrawer(false);
            }}
          >
            <span className="avatar">
              {user.avatar ? (
                <Image
                  unoptimized
                  src={user.avatar}
                  alt=""
                  width={36}
                  height={36}
                />
              ) : (
                <>
                  {user.name
                    .split(" ")
                    .map((n) => n[0])
                    .slice(0, 2)
                    .join("")}
                </>
              )}
            </span>
            <span>
              <strong>{user.name}</strong>
              <small>{t(user.role.toLowerCase())}</small>
            </span>
            <FiSettings />
          </button>
        </div>
      </aside>
      <div className="main-column">
        <header className="topbar">
          <div className="topbar-left">
            <button
              className="icon-button desktop-sidebar-toggle"
              aria-label={t(collapsed ? "showSidebar" : "hideSidebar")}
              aria-expanded={!collapsed}
              onClick={toggleSidebar}
            >
              <FiMenu />
            </button>
            <button
              className="icon-button menu-toggle"
              onClick={() => setDrawer(!drawer)}
              aria-label={t("more")}
            >
              <FiMenu />
            </button>
            <span className="breadcrumb">
              {t(user.role.toLowerCase())}
              <span>/</span>
              <strong>
                {t(
                  path.split("/").at(-1) === "admin"
                    ? "overview"
                    : path.split("/").at(-1) === "parent"
                      ? "dashboard"
                      : path.split("/").at(-1)!,
                )}
              </strong>
            </span>
          </div>
          <div className="topbar-actions">
            <button
              className="search-trigger"
              aria-label={t("search")}
              onClick={() => setModal("search")}
            >
              <FiSearch />
              <span>{t("search")}</span>
              <kbd>⌕</kbd>
            </button>
            <LanguageSwitch />
            <button
              className="icon-button"
              aria-label={t(theme === "light" ? "dark" : "light")}
              onClick={toggleTheme}
            >
              {theme === "light" ? <FiMoon /> : <FiSun />}
            </button>
            <button
              className="icon-button notification-bell"
              aria-label={`${t("notifications")}: ${notifications.filter((n) => !n.is_read).length} ${t("unread")}`}
              onClick={() => {
                setModal("notifications");
                void run(readNotifications, { quiet: true });
              }}
            >
              <FiBell />
              {notifications.some((n) => !n.is_read) && (
                <span className="notification-count">
                  {notifications.filter((n) => !n.is_read).length}
                </span>
              )}
            </button>
            <span className="avatar small">{user.name[0]}</span>
          </div>
        </header>
        <main id="main" className="main-content">
          {children}
          <footer className="app-footer">
            <span>
              <FiShield />
              {t("sandboxDisclosure")}
            </span>
            <Link href={`${prefix}/reports`}>
              {t("reportProblem")}
              <FiArrowUpRight />
            </Link>
          </footer>
        </main>
      </div>
      <nav className="bottom-nav">
        {(user.role === "STUDENT"
          ? ["dashboard", "agent", "transfer", "tuition"]
          : groups[0].slice(0, 4)
        ).map(nav)}
        <button onClick={() => setDrawer(true)}>
          <FiMenu />
          <span>{t("more")}</span>
        </button>
      </nav>
      <button
        className="fab"
        aria-label={t("quickAction")}
        onClick={() => setModal("quick")}
      >
        <FiPlus />
      </button>
      {modal === "profile" && (
        <Modal title={user.name} onClose={() => setModal("")}>
          <div className="stack">
            <Link
              className="button secondary"
              href={`${prefix}/settings`}
              onClick={() => setModal("")}
            >
              {t("settings")}
            </Link>
            <button
              className="button danger"
              onClick={async () => {
                const r = await run(logout, { quiet: true, refresh: false });
                if (r !== undefined) router.push(`${prefix}/login`);
              }}
            >
              <FiLogOut />
              {t("logout")}
            </button>
          </div>
        </Modal>
      )}
      {modal === "search" && (
        <Modal title={t("search")} onClose={() => setModal("")}>
          <form
            className="search-form"
            onSubmit={async (e) => {
              e.preventDefault();
              setResults(
                (await run(() => globalSearch(query), {
                  quiet: true,
                  refresh: false,
                })) || [],
              );
              setSearched(true);
            }}
          >
            <input
              aria-label={t("search")}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              minLength={2}
            />
            <button className="button" type="submit">
              <FiSearch />
              {t("search")}
            </button>
          </form>
          <div className="stack">
            {results.map((r, i) => (
              <Link
                className="search-result"
                key={i}
                href={`${prefix}/${r.kind}${r.kind === "transactions" ? `?search=${encodeURIComponent(String(r.title))}` : ""}`}
                onClick={() => setModal("")}
              >
                <span>{r.title}</span>
                <small>{t(String(r.kind))}</small>
              </Link>
            ))}
            {searched && !results.length && (
              <p role="status">{t("noSearchResults")}</p>
            )}
          </div>
        </Modal>
      )}
      {modal === "notifications" && (
        <Modal title={t("notifications")} onClose={() => setModal("")}>
          <div className="stack">
            {notifications.length ? (
              notifications.map((n) => (
                <div className="notification-row" key={String(n.id)}>
                  <FiBell />
                  <div>
                    <strong>{t(String(n.type))}</strong>
                    <p>{t(String(n.detail))}</p>
                  </div>
                </div>
              ))
            ) : (
              <p>{t("emptyBody")}</p>
            )}
          </div>
        </Modal>
      )}
      {modal === "quick" && (
        <Modal title={t("quickAction")} onClose={() => setModal("")}>
          <div className="quick-grid">
            {["agent", "transactions", "tuition", "transfer", "budget"].map(
              (k) => (
                <Link
                  className="quick-card"
                  key={k}
                  href={`${prefix}/${k}`}
                  onClick={() => setModal("")}
                >
                  {icons[k]}
                  {t(k)}
                  <FiArrowUpRight />
                </Link>
              ),
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
