"use client";
import { GuidedInput } from "@/components/ui/dashboard-guidance";
import { freePages } from "@/lib/plan-policy";
import { FooterCredits } from "./footer-credits";
import { LanguagePicker } from "@/components/ui/language-picker";
import { normalizeLocale } from "@/lib/i18n";
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
  FiKey,
  FiCheck,
} from "react-icons/fi";
import { appConfig } from "@/lib/config";
import type { User, Row } from "@/types";
import { useApp } from "@/components/ui/providers";
import { Modal } from "@/components/ui/primitives";
import { updatePreferences } from "@/actions/preferences.actions";
import { logout } from "@/actions/auth.actions";
import { globalSearch } from "@/actions/dashboard.actions";
import {
  readNotifications,
  markNotificationRead,
  resubscribeDevice,
} from "@/actions/alert.actions";
import {
  resubscribeNotifications,
  showBrowserNotification,
  sendTestNotification,
} from "@/components/ui/browser-notifications";
import { hasPermission } from "@/lib/admin-permissions";
const subscribeSidebar = (cb: () => void) => {
  window.addEventListener("sidebar-state", cb);
  return () => window.removeEventListener("sidebar-state", cb);
};
const subscribePermission = (callback: () => void) => {
  window.addEventListener("focus", callback);
  window.addEventListener("notification-permission", callback);
  document.addEventListener("visibilitychange", callback);
  return () => {
    window.removeEventListener("focus", callback);
    window.removeEventListener("notification-permission", callback);
    document.removeEventListener("visibilitychange", callback);
  };
};
const getPermission = () =>
  "Notification" in window ? Notification.permission : "unsupported";
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
    <LanguagePicker
      locale={normalizeLocale(locale)}
      label={t("language")}
      onChange={async (next) => {
        const ok = await run(() => updatePreferences({ language: next }), {
          quiet: true,
          refresh: false,
        });
        if (ok) {
          try {
            localStorage.setItem("language", next);
          } catch {
            /* The language cookie remains available. */
          }
          router.replace(path.replace(`/${locale}`, `/${next}`));
        }
      }}
    />
  );
}

function getNotificationRoute(
  type: string,
  detail: string,
  role: string,
  prefix: string,
): string {
  const tUpper = (type || "").toUpperCase();
  const dUpper = (detail || "").toUpperCase();

  if (
    tUpper.includes("TUITION") ||
    tUpper.includes("FUNDING_GAP") ||
    dUpper.includes("TUITION")
  ) {
    return `${prefix}/tuition`;
  }
  if (tUpper.includes("BUDGET") || dUpper.includes("BUDGET")) {
    return `${prefix}/budget`;
  }
  if (
    tUpper.includes("LOW_BALANCE") ||
    tUpper.includes("WALLET") ||
    dUpper.includes("BALANCE")
  ) {
    return `${prefix}/wallet`;
  }
  if (
    tUpper.includes("APPROVAL") ||
    tUpper.includes("DECISION") ||
    tUpper.includes("APPROVAL_REQUIRED")
  ) {
    return role === "PARENT"
      ? `${prefix}/parent/approvals`
      : `${prefix}/payments`;
  }
  if (tUpper.includes("LINK") || tUpper.includes("FAMILY")) {
    return role === "PARENT" ? `${prefix}/parent` : `${prefix}/family`;
  }
  if (tUpper.includes("BENEFICIARY")) {
    return role === "PARENT"
      ? `${prefix}/parent/controls`
      : `${prefix}/beneficiaries`;
  }
  if (tUpper.includes("REPORT")) {
    return `${prefix}/reports`;
  }
  if (
    tUpper.includes("TRANSFER") ||
    tUpper.includes("PAYMENT") ||
    tUpper.includes("SETTLE")
  ) {
    return `${prefix}/transactions`;
  }
  return `${prefix}/alerts`;
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
  const isAgentPage = path.endsWith("/agent");
  const router = useRouter();
  const prefix = `/${locale}`;
  const [drawer, setDrawer] = useState(false);
  const [modal, setModal] = useState("");
  const [results, setResults] = useState<Row[]>([]);
  const [query, setQuery] = useState("");
  const [searched, setSearched] = useState(false);
  const [topbarMenuOpen, setTopbarMenuOpen] = useState(false);
  const [sidebarMenuOpen, setSidebarMenuOpen] = useState(false);
  const topbarMenuRef = useRef<HTMLDivElement>(null);
  const sidebarMenuRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [localNotifications, setLocalNotifications] = useState(notifications);
  const [previousNotifications, setPreviousNotifications] =
    useState(notifications);
  if (previousNotifications !== notifications) {
    setPreviousNotifications(notifications);
    setLocalNotifications(notifications);
  }
  const browserPerm = useSyncExternalStore(
    subscribePermission,
    getPermission,
    () => "default",
  );
  const [notificationStatus, setNotificationStatus] = useState("");
  const [notificationBusy, setNotificationBusy] = useState(false);
  const notifiedIds = useRef(new Set(notifications.map((n) => String(n.id))));
  useEffect(() => {
    if (modal === "search") {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    }
  }, [modal]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        topbarMenuRef.current &&
        !topbarMenuRef.current.contains(e.target as Node)
      ) {
        setTopbarMenuOpen(false);
      }
      if (
        sidebarMenuRef.current &&
        !sidebarMenuRef.current.contains(e.target as Node)
      ) {
        setSidebarMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleNotifClick = async (id: string) => {
    setModal("");
    setLocalNotifications((prev) =>
      prev.map((n) => (String(n.id) === id ? { ...n, is_read: 1 } : n)),
    );
    const result = await run(() => markNotificationRead(id), {
      quiet: true,
      refresh: false,
    });
    if (result === undefined) router.refresh();
  };
  const handleMarkAllAsRead = async () => {
    setLocalNotifications((prev) => prev.map((n) => ({ ...n, is_read: 1 })));
    const result = await run(readNotifications, {
      quiet: true,
      refresh: false,
    });
    if (result === undefined) router.refresh();
  };
  const testBrowserNotification = async () => {
    setNotificationBusy(true);
    try {
      await sendTestNotification(t("notifications"), t("notificationTestBody"), path);
      setNotificationStatus("notificationTestSent");
    } catch (error) {
      setNotificationStatus(error instanceof Error && error.message.startsWith("notification") ? error.message : "notificationFailed");
    } finally { window.dispatchEvent(new Event("notification-permission")); setNotificationBusy(false); }
  };
  const requestBrowserNotifications = async () => {
    setNotificationBusy(true);
    try {
      const device = await resubscribeNotifications();
      const saved = await resubscribeDevice(device);
      if (!saved.success) throw new Error("notificationSaveFailed");
      router.refresh();
      setNotificationStatus("notificationResubscribed");
      try {
        await showBrowserNotification(
          t("notifications"),
          t("notificationOpenOnly"),
          "finbridge-test",
          path,
        );
      } catch {
        setNotificationStatus("notificationResubscribedDeliveryFailed");
      }
    } catch (error) {
      setNotificationStatus(
        error instanceof Error && error.message.startsWith("notification")
          ? error.message
          : "notificationFailed",
      );
    } finally {
      window.dispatchEvent(new Event("notification-permission"));
      setNotificationBusy(false);
    }
  };
  useEffect(() => {
    const sync = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, 30000);
    document.addEventListener("visibilitychange", sync);
    window.addEventListener("focus", sync);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", sync);
      window.removeEventListener("focus", sync);
    };
  }, [router]);
  useEffect(() => {
    if (browserPerm !== "granted" || !Number(user.notifications ?? 1)) return;
    for (const n of localNotifications) {
      const id = String(n.id);
      if (Number(n.is_read) || notifiedIds.current.has(id)) continue;
      notifiedIds.current.add(id);
      const url = getNotificationRoute(
        String(n.type),
        String(n.detail),
        user.role,
        prefix,
      );
      void showBrowserNotification(
        t(String(n.type)),
        t(String(n.detail)),
        `finbridge-${user.id}-${id}`,
        url,
      ).catch(() => {
        notifiedIds.current.delete(id);
        setNotificationStatus("notificationFailed");
      });
    }
  }, [
    localNotifications,
    browserPerm,
    prefix,
    t,
    user.id,
    user.role,
    user.notifications,
  ]);

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
    if (user.role === "STUDENT" && user.plan_id === "student-free" && !freePages.includes(route)) return null;
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
          href={user.is_demo ? `/${locale}/demo` : `/${locale}`}
        >
          <Brand />
        </Link>
        <div className="workspace-label">
          <span className="workspace-dot" />
          {t(user.role.toLowerCase())}
          <span className="workspace-chevron">{"※"}</span>
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
          {!!user.is_demo && <div className="sandbox-tag">
            <FiShield />
            <span>
              {t("sandbox")}
              <small>{t("sandboxNote")}</small>
            </span>
          </div>}
          <div className="sidebar-profile-container" ref={sidebarMenuRef}>
            {sidebarMenuOpen && (
              <div className="profile-dropdown-menu sidebar-dropdown">
                <div className="profile-dropdown-header">
                  <strong>{user.name}</strong>
                  <small>{user.email}</small>
                </div>
                <Link
                  href={`${prefix}/settings`}
                  className="profile-dropdown-item"
                  onClick={() => {
                    setSidebarMenuOpen(false);
                    setDrawer(false);
                  }}
                >
                  <FiSettings />
                  <span>{t("settings")}</span>
                </Link>
                <Link
                  href={`${prefix}/api-keys`}
                  className="profile-dropdown-item"
                  onClick={() => {
                    setSidebarMenuOpen(false);
                    setDrawer(false);
                  }}
                >
                  <FiKey />
                  <span>{t("api-keys")}</span>
                </Link>
                <Link
                  href={`${prefix}/activity`}
                  className="profile-dropdown-item"
                  onClick={() => {
                    setSidebarMenuOpen(false);
                    setDrawer(false);
                  }}
                >
                  <FiActivity />
                  <span>{t("activity")}</span>
                </Link>
                <div className="profile-dropdown-divider" />
                <button
                  type="button"
                  className="profile-dropdown-item danger"
                  onClick={() =>
                    void logout().then(() => router.push(`/${locale}/login`))
                  }
                >
                  <FiLogOut />
                  <span>{t("logout")}</span>
                </button>
              </div>
            )}
            <button
              type="button"
              className="user-profile"
              aria-expanded={sidebarMenuOpen}
              onClick={() => setSidebarMenuOpen((prev) => !prev)}
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
              aria-label={`${t("notifications")}: ${localNotifications.filter((n) => !n.is_read).length} ${t("unread")}`}
              onClick={() => {
                setModal("notifications");
              }}
            >
              <FiBell />
              {localNotifications.some((n) => !n.is_read) && (
                <span className="notification-count">
                  {localNotifications.filter((n) => !n.is_read).length}
                </span>
              )}
            </button>
            <div className="profile-menu-container" ref={topbarMenuRef}>
              <button
                type="button"
                className="avatar-button"
                aria-label={user.name}
                aria-expanded={topbarMenuOpen}
                onClick={() => setTopbarMenuOpen((prev) => !prev)}
              >
                <span className="avatar small">
                  {user.avatar ? (
                    <Image
                      unoptimized
                      src={user.avatar}
                      alt=""
                      width={28}
                      height={28}
                    />
                  ) : (
                    user.name[0]
                  )}
                </span>
              </button>
              {topbarMenuOpen && (
                <div className="profile-dropdown-menu topbar-dropdown">
                  <div className="profile-dropdown-header">
                    <strong>{user.name}</strong>
                    <small>{user.email}</small>
                  </div>
                  <Link
                    href={`${prefix}/settings`}
                    className="profile-dropdown-item"
                    onClick={() => setTopbarMenuOpen(false)}
                  >
                    <FiSettings />
                    <span>{t("settings")}</span>
                  </Link>
                  <Link
                    href={`${prefix}/api-keys`}
                    className="profile-dropdown-item"
                    onClick={() => setTopbarMenuOpen(false)}
                  >
                    <FiKey />
                    <span>{t("api-keys")}</span>
                  </Link>
                  <Link
                    href={`${prefix}/activity`}
                    className="profile-dropdown-item"
                    onClick={() => setTopbarMenuOpen(false)}
                  >
                    <FiActivity />
                    <span>{t("activity")}</span>
                  </Link>
                  <div className="profile-dropdown-divider" />
                  <button
                    type="button"
                    className="profile-dropdown-item danger"
                    onClick={() =>
                      void logout().then(() => router.push(`/${locale}/login`))
                    }
                  >
                    <FiLogOut />
                    <span>{t("logout")}</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>
        <main id="main" className={`main-content ${isAgentPage ? "agent-main-layout" : ""}`}>
          {children}
          {!isAgentPage && (
            <footer className="app-footer">
              <FooterCredits />
              <span>
                <FiShield />
                {t("sandboxDisclosure")}
              </span>
              <Link href={`${prefix}/reports`}>
                {t("reportProblem")}
                <FiArrowUpRight />
              </Link>
            </footer>
          )}
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
            <GuidedInput
              ref={searchInputRef}
              autoFocus
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
          <div className="notif-modal-header-actions">
            {localNotifications.some((n) => !n.is_read) && (
              <button
                type="button"
                className="button secondary small"
                onClick={handleMarkAllAsRead}
              >
                <FiCheck />
                <span>{t("markAllAsRead")}</span>
              </button>
            )}
            {
              <button
                type="button"
                className={`button small ${browserPerm === "granted" ? "ghost" : "secondary"}`}
                onClick={requestBrowserNotifications}
                disabled={notificationBusy}
                title={
                  browserPerm === "granted"
                    ? t("notificationResubscribe")
                    : t("enableBrowserNotifs")
                }
              >
                <FiBell />
                <span>{t("notificationResubscribe")}</span>
              </button>
            }
          <button type="button" className="button secondary small" disabled={notificationBusy} onClick={testBrowserNotification}>{t("notificationTest")}</button>
          </div>
          <p className="notification-guidance" role="status">
            {t(notificationStatus || "notificationOpenOnly")}
          </p>
          <div className="stack">
            {localNotifications.length ? (
              localNotifications.map((n) => (
                <div
                  className={`notification-row-wrapper ${!n.is_read ? "unread" : ""}`}
                  key={String(n.id)}
                >
                  <Link
                    className="notification-row clickable"
                    href={getNotificationRoute(
                      String(n.type),
                      String(n.detail),
                      user.role,
                      prefix,
                    )}
                    onClick={() => void handleNotifClick(String(n.id))}
                  >
                    {!n.is_read && <span className="unread-dot" />}
                    <FiBell />
                    <div className="notification-content">
                      <strong>{t(String(n.type))}</strong>
                      <p>{t(String(n.detail))}</p>
                    </div>
                    <FiArrowUpRight className="notification-link-icon" />
                  </Link>
                  {!n.is_read && (
                    <button
                      type="button"
                      className="icon-button mark-read-btn"
                      title={t("markAsRead")}
                      aria-label={t("markAsRead")}
                      onClick={() => void handleNotifClick(String(n.id))}
                    >
                      <FiCheck />
                    </button>
                  )}
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
