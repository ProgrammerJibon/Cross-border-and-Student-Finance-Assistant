import { test } from "node:test";
import assert from "node:assert/strict";
import { encryptSecret, decryptSecret } from "../src/lib/secrets";
import { hasPermission } from "../src/lib/admin-permissions";
import { canOpen } from "../src/lib/permissions";
import { avatarSchema } from "../src/lib/avatar";

test("stored provider keys use randomized authenticated encryption", () => {
  process.env.AI_KEY_ENCRYPTION_SECRET =
    "test-secret-only-32-characters-long-12345";
  const secret = "demo-provider-secret-not-a-real-key";
  const a = encryptSecret(secret),
    b = encryptSecret(secret);
  assert.notEqual(a, b);
  assert.ok(!a.includes(secret));
  assert.equal(decryptSecret(a), secret);
  const parts = a.split(".");
  const bytes = Buffer.from(parts[2], "base64");
  bytes[0] ^= 1;
  parts[2] = bytes.toString("base64");
  assert.throws(() => decryptSecret(parts.join(".")));
});
test("moderator sections deny missing, malformed and cross-role permissions", () => {
  const permissions = JSON.stringify(["reports", "catalog"]);
  assert.equal(canOpen("MODERATOR", "admin/reports", permissions), true);
  assert.equal(canOpen("MODERATOR", "admin/users", permissions), false);
  assert.equal(canOpen("MODERATOR", "project-evidence", permissions), false);
  assert.equal(
    hasPermission(
      { role: "MODERATOR", admin_permissions: '{"users":true}' },
      "users",
    ),
    false,
  );
  assert.equal(
    hasPermission({ role: "STUDENT", admin_permissions: '["users"]' }, "users"),
    false,
  );
  assert.equal(hasPermission({ role: "ADMIN" }, "models"), true);
});
test("profile photos reject SVG, MIME spoofing and oversized payloads", () => {
  assert.equal(
    avatarSchema.safeParse("data:image/svg+xml;base64,PHN2Zy8+").success,
    false,
  );
  assert.equal(
    avatarSchema.safeParse(
      "data:image/png;base64," +
        Buffer.from("not really a PNG image").toString("base64"),
    ).success,
    false,
  );
  assert.equal(
    avatarSchema.safeParse(
      "data:image/png;base64," + Buffer.alloc(300001).toString("base64"),
    ).success,
    false,
  );
});
