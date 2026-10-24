import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

// Run the browser module in isolation, without changing the process globals.
const source = readFileSync(
  new URL("../src/components/ui/browser-notifications.js", import.meta.url),
  "utf8",
).replaceAll("export async function", "async function");
function browser(permission = "granted", secure = true) {
  const calls: unknown[][] = [];
  const registration = {
    showNotification: async (...args: unknown[]) => {
      calls.push(args);
    },
  };
  const context = vm.createContext({
    window: { isSecureContext: secure, Notification: {} },
    Notification: {
      requestPermission: async () => {
        calls.push(["permission"]);
        return permission;
      },
    },
    navigator: {
      serviceWorker: {
        register: async () => {
          calls.push(["register"]);
          return registration;
        },
        ready: Promise.resolve(registration),
      },
    },
    setTimeout,
    clearTimeout,
  });
  vm.runInContext(source, context);
  return { context, calls };
}
test("mobile notifications use the service worker with a destination and stable tag", async () => {
  const { context, calls } = browser();
  await vm.runInContext("enableNotifications()", context);
  assert.deepEqual(calls.slice(0, 2), [["permission"], ["register"]]);
  await vm.runInContext(
    'showBrowserNotification("Tuition", "Due soon", "notice-1", "/en/tuition")',
    context,
  );
  assert.deepEqual(JSON.parse(JSON.stringify(calls.at(-1))), [
    "Tuition",
    {
      body: "Due soon",
      tag: "notice-1",
      icon: "/icons/icon-192.png",
      data: { url: "/en/tuition" },
    },
  ]);
});
test("blocked, dismissed and insecure permissions produce actionable failures", async () => {
  for (const [permission, secure, message] of [
    ["denied", true, "notificationDenied"],
    ["default", true, "notificationDismissed"],
    ["granted", false, "notificationSecure"],
  ] as const) {
    const { context, calls } = browser(permission, secure);
    await assert.rejects(vm.runInContext("enableNotifications()", context), {
      message,
    });
    assert.equal(
      calls.some((c) => c[0] === "register"),
      false,
    );
  }
});

test("resubscribe refreshes the worker and preserves the device ID and existing push keys", async () => {
  const { context } = browser();
  const stored = new Map<string, string>();
  let updates = 0;
  const push = {
    endpoint: "https://push.example.test/device",
    keys: { p256dh: "public", auth: "auth" },
  };
  context.localStorage = {
    getItem: (key: string) => stored.get(key),
    setItem: (key: string, value: string) => stored.set(key, value),
  };
  context.crypto = { randomUUID: () => "00000000-0000-4000-8000-000000000001" };
  context.navigator.serviceWorker.ready = Promise.resolve({
    scope: "https://finbridge.test/",
    update: async () => {
      updates++;
    },
    pushManager: { getSubscription: async () => ({ toJSON: () => push }) },
  });
  const first = await vm.runInContext("resubscribeNotifications()", context);
  const second = await vm.runInContext("resubscribeNotifications()", context);
  assert.equal(first.deviceId, second.deviceId);
  assert.deepEqual(first.subscription, push);
  assert.equal(updates, 2);
});
test("notification clicks navigate and focus an existing window; external URLs are refused", async () => {
  let handler: (event: unknown) => void = () => {};
  const calls: string[] = [];
  let finished = Promise.resolve();
  const context = vm.createContext({
    URL,
    self: {
      location: { origin: "https://finbridge.test" },
      addEventListener: (name: string, callback: typeof handler) => {
        if (name === "notificationclick") handler = callback;
      },
      clients: {
        matchAll: async () => [
          {
            url: "https://finbridge.test/en/dashboard",
            navigate: async (url: string) => calls.push(url),
            focus: async () => calls.push("focus"),
          },
        ],
        openWindow: async () => calls.push("open"),
      },
    },
  });
  vm.runInContext(
    readFileSync(
      new URL("../public/notifications-sw.js", import.meta.url),
      "utf8",
    ),
    context,
  );
  const click = (url: string) =>
    handler({
      notification: { data: { url }, close: () => {} },
      waitUntil: (promise: Promise<void>) => {
        finished = promise;
      },
    });
  click("/en/tuition");
  await finished;
  assert.deepEqual(calls, ["https://finbridge.test/en/tuition", "focus"]);
  click("https://evil.test");
  await finished;
  assert.equal(calls.length, 2);
});
