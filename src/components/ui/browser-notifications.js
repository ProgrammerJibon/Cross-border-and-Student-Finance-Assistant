// Persistent notifications work on mobile browsers where new Notification() fails.
export async function notificationRegistration() {
  if (!window.isSecureContext) throw new Error("notificationSecure");
  if (!("Notification" in window) || !("serviceWorker" in navigator)) {
    throw new Error("notificationUnsupported");
  }
  await navigator.serviceWorker.register("/notifications-sw.js", {
    scope: "/",
    updateViaCache: "none",
  });
  let timer;
  try {
    return await Promise.race([
      navigator.serviceWorker.ready,
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("notificationFailed")),
          10000,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export async function enableNotifications() {
  if (!window.isSecureContext) throw new Error("notificationSecure");
  if (!("Notification" in window)) throw new Error("notificationUnsupported");
  // Request directly in the click handler, before asynchronous worker setup.
  const permission = await Notification.requestPermission();
  if (permission !== "granted")
    throw new Error(
      permission === "denied" ? "notificationDenied" : "notificationDismissed",
    );
  return notificationRegistration();
}

export async function resubscribeNotifications() {
  const registration = await enableNotifications();
  await registration.update();
  // Keep an existing push endpoint alive; never unsubscribe before saving it.
  const subscription = await registration.pushManager?.getSubscription();
  let deviceId = localStorage.getItem("finbridge:notification-device");
  if (!deviceId) {
    deviceId = crypto.randomUUID();
    localStorage.setItem("finbridge:notification-device", deviceId);
  }
  return {
    deviceId,
    scope: registration.scope,
    subscription: subscription?.toJSON() || null,
  };
}

export async function showBrowserNotification(title, body, tag, url) {
  const registration = await notificationRegistration();
  await registration.showNotification(title, {
    body,
    tag,
    icon: "/icons/icon-192.png",
    data: { url },
  });
}
