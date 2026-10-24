"use client";
import { useSyncExternalStore } from "react";
import { FiX } from "react-icons/fi";
const key = "finbridge:competition-banner-dismissed:2026";
const subscribe = (callback: () => void) => {
  window.addEventListener("storage", callback);
  window.addEventListener("competition-banner", callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener("competition-banner", callback);
  };
};
let dismissed = false;
const snapshot = () => {
  try {
    return dismissed || localStorage.getItem(key) === "1";
  } catch {
    return dismissed;
  }
};
export function CompetitionBanner() {
  const hidden = useSyncExternalStore(subscribe, snapshot, () => true);
  if (hidden) return null;
  return (
    <aside className="competition-banner">
      <span>Demo for Shenzhen FinTech Competition 2026 in China.</span>
      <button
        type="button"
        className="icon-button"
        aria-label="Dismiss competition banner"
        onClick={() => {
          dismissed = true;
          try {
            localStorage.setItem(key, "1");
          } catch {
            /* Dismiss for this visit when storage is unavailable. */
          }
          window.dispatchEvent(new Event("competition-banner"));
        }}
      >
        <FiX />
      </button>
    </aside>
  );
}
