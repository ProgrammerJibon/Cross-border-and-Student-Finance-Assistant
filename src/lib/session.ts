import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import type { User } from "@/types";
import { rows } from "./db";
const cookieName = "finbridge_session";
function key() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32)
    throw new Error("SESSION_SECRET must have at least 32 characters");
  return new TextEncoder().encode(secret);
}
export async function createSession(
  user: Pick<User, "id" | "session_version">,
  mfa = false,
) {
  const token = await new SignJWT({ version: user.session_version, mfa })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime("8h")
    .sign(key());
  (await cookies()).set(cookieName, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 8 * 3600,
  });
  const [preferences] = await rows<{ language: string; theme: string }>(
    "SELECT language,theme FROM user_preferences WHERE user_id=?",
    [user.id],
  );
  for (const name of ["language", "theme"] as const) {
    if (preferences)
      (await cookies()).set(name, preferences[name], {
        path: "/",
        sameSite: "lax",
        maxAge: 31536000,
      });
  }
}
export async function sessionPayload() {
  const token = (await cookies()).get(cookieName)?.value;
  if (!token) return null;
  try {
    return (await jwtVerify(token, key(), { algorithms: ["HS256"] })).payload;
  } catch {
    return null;
  }
}
export async function clearSession() {
  (await cookies()).delete(cookieName);
}
