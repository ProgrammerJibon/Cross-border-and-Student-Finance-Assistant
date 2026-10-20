import "server-only";
import "./env";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
function encryptionKey() {
  const value =
    process.env.AI_KEY_ENCRYPTION_SECRET || process.env.SESSION_SECRET;
  if (!value || value.length < 32) throw new Error("Missing encryption secret");
  return createHash("sha256").update(value).digest();
}
export function encryptSecret(secret: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(secret, "utf8"),
    cipher.final(),
  ]);
  return [iv, cipher.getAuthTag(), encrypted]
    .map((b) => b.toString("base64"))
    .join(".");
}

export function decryptSecret(payload: string) {
  const parts = payload.split(".");
  if (parts.length !== 3) throw new Error("Malformed cipher");
  const [iv, tag, data] = parts.map((v) => Buffer.from(v, "base64"));
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([
    decipher.update(data),
    decipher.final(),
  ]).toString("utf8");
}
