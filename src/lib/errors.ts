import { ZodError } from "zod";
import type { Result } from "@/types";
export class AppError extends Error {
  constructor(public code: string, public fieldErrors?: Record<string, string>) {
    super(code);
  }
}
export async function action<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    return { success: true, data: await fn() };
  } catch (e) {
    const code =
      e instanceof AppError
        ? e.code
        : e instanceof ZodError
          ? "VALIDATION_ERROR"
          : "DATABASE_ERROR";
    if (!(e instanceof AppError) && !(e instanceof ZodError))
      console.error(
        "Server operation failed",
        e instanceof Error ? e.name : "unknown",
      );
    const fieldErrors = e instanceof ZodError ? Object.fromEntries(e.issues.map(issue => [
      issue.path.join(".") || "form",
      // Zod's default enum/custom messages may contain submitted values. Only
      // expose our own constraints, never provider payloads or secret input.
      issue.code === "too_small" ? `Must be at least ${issue.minimum}${issue.origin === "string" ? " characters" : ""}.` :
      issue.code === "too_big" ? `Must be at most ${issue.maximum}${issue.origin === "string" ? " characters" : ""}.` :
      issue.code === "invalid_value" ? "Select a supported option." :
      issue.code === "invalid_type" ? "This field is required and must have the correct type." :
      issue.code === "custom" && issue.message !== "Invalid input" ? issue.message :
      issue.code === "invalid_format" && issue.format === "email" ? "Enter a valid email address." :
      /amount|tuition|paid|scholarship|funding_needs|income|expenses|balance/.test(String(issue.path.at(-1))) ? "Enter a non-negative amount with at most two decimal places." :
      /currency/.test(String(issue.path.at(-1))) ? "Select a supported three-letter currency." :
      /date/.test(String(issue.path.at(-1))) ? "Enter a real date in YYYY-MM-DD format." :
      "Enter a valid value in the required format."
    ])) : e instanceof AppError ? e.fieldErrors : undefined;
    return { success: false, error: code, code, ...(fieldErrors ? { fieldErrors } : {}) };
  }
}
export function requireCondition(
  condition: unknown,
  code = "FORBIDDEN",
  fieldErrors?: Record<string, string>,
): asserts condition {
  if (!condition) throw new AppError(code, fieldErrors);
}
