import { ZodError } from "zod";
import type { Result } from "@/types";
export class AppError extends Error {
  constructor(public code: string) {
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
    return { success: false, error: code, code };
  }
}
export function requireCondition(
  condition: unknown,
  code = "FORBIDDEN",
): asserts condition {
  if (!condition) throw new AppError(code);
}
