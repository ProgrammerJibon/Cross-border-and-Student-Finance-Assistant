import React from "react";

type PlanIconProps = {
  planId?: string | null;
  role?: string | null;
  className?: string;
  size?: number;
  "aria-hidden"?: boolean | "true" | "false";
};

export function PlanIcon({
  planId,
  role,
  className = "",
  size = 28,
  "aria-hidden": ariaHidden = true,
}: PlanIconProps) {
  const normalizedId = String(planId || role || "").toLowerCase();

  // 1. Administrator: Guardian shield with security key / command core
  if (role === "ADMIN" || normalizedId === "admin" || normalizedId === "demo-admin" || normalizedId === "administrator") {
    return (
      <svg
        className={`plan-icon plan-icon-admin ${className}`}
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden={ariaHidden}
      >
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" fill="currentColor" fillOpacity="0.12" />
        <circle cx="12" cy="11" r="2.5" />
        <path d="M12 13.5V17" />
        <path d="M10.5 15.5h3" />
      </svg>
    );
  }

  // 2. Family Pro: Regal crown & shield for multi-student household mastery
  if (normalizedId === "family-pro" || normalizedId === "family pro") {
    return (
      <svg
        className={`plan-icon plan-icon-family-pro ${className}`}
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden={ariaHidden}
      >
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" fill="currentColor" fillOpacity="0.12" />
        <path d="m5 9 3 5 4-3 4 3 3-5-2 6H7l-2-6z" fill="currentColor" fillOpacity="0.2" />
        <circle cx="5" cy="9" r="1" fill="currentColor" />
        <circle cx="12" cy="8" r="1" fill="currentColor" />
        <circle cx="19" cy="9" r="1" fill="currentColor" />
      </svg>
    );
  }

  // 3. Family Lite: Connected household shelter & family embrace
  if (normalizedId === "family" || normalizedId === "family-lite" || normalizedId === "family lite" || role === "PARENT") {
    return (
      <svg
        className={`plan-icon plan-icon-family-lite ${className}`}
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden={ariaHidden}
      >
        <path d="m3 9.5 9-7 9 7v10.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 20V9.5z" fill="currentColor" fillOpacity="0.1" />
        <circle cx="9" cy="13" r="2" />
        <path d="M6 18a3 3 0 0 1 6 0" />
        <circle cx="15.5" cy="14" r="1.5" />
        <path d="M13.5 18a2.5 2.5 0 0 1 4 0" />
      </svg>
    );
  }

  // 4. Student Pro: High-speed ambitious rocket with electric star / spark
  if (normalizedId === "student" || normalizedId === "student-pro" || normalizedId === "student pro" || normalizedId === "pro") {
    return (
      <svg
        className={`plan-icon plan-icon-student-pro ${className}`}
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden={ariaHidden}
      >
        <path
          d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"
          fill="currentColor"
          fillOpacity="0.2"
        />
        <path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" />
        <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0" />
        <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" />
        <circle cx="15.5" cy="8.5" r="1.5" fill="currentColor" />
      </svg>
    );
  }

  // 5. Student Free (Default for student): Graduation cap with fresh sprout / open book
  return (
    <svg
      className={`plan-icon plan-icon-student-free ${className}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={ariaHidden}
    >
      <path d="M22 10v6M2 10l10-5 10 5-10 5z" fill="currentColor" fillOpacity="0.12" />
      <path d="M6 12v5c3 3 9 3 12 0v-5" />
      <path d="M12 5V2" />
      <path d="M9.5 3.5C10 2 12 2 12 2s2 0 2.5 1.5" />
    </svg>
  );
}

