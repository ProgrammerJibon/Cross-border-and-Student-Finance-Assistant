# Frontend update

- Next.js and eslint-config-next are upgraded together to 16.4.2.
- All React components and pages retain their original TSX files and types.
  Backend logic, services, and database schema are unchanged.
- The shared visual system in `src/app/design-refresh.css` styles public,
  authentication, student, parent, and admin screens, with dark mode, mobile
  layouts, focus states, and reduced-motion support.

## Device notifications

Open the notification bell and select **Enable device notifications**. After
granting permission, a test notification is displayed. Use **Send a test
notification** to check delivery again. Permission errors appear in the dialog.

Notifications require HTTPS (localhost also works). On iPhone and iPad, use a
supported version of iOS, add the site to the Home Screen, and open that installed
app before enabling notifications. The manifest and PNG icons support this flow.

New alerts are obtained using the existing server-rendered data: the visible app
refreshes every 30 seconds and on focus. Existing alerts are not replayed on
initial load. The notification preference is respected for incoming alerts.
Service-worker notifications support mobile delivery and open the relevant page
when clicked. The worker does not cache financial pages or responses.

This is **not closed-app push delivery**. No VAPID service, push sender, database
migration, or backend subscription changes were introduced. The previous client
code that saved fabricated push credentials was removed. Background browsers
may suspend refreshes; returning to the app refreshes the alert list.

## Verification

Run `npm run lint`, `npm run typecheck`, `npm test`, and `npx next build`.
`tests/notifications.test.ts` covers the worker-based delivery path, permission
failures, and notification click routing, including rejection of external URLs.
Actual operating-system banners still depend on browser permissions, device
notification settings, and focus/do-not-disturb settings.

Verification completed: production build, lint, TypeScript checks, 25 existing
unit tests, and 3 notification tests passed. A browser smoke check visited 51
public/student/parent/admin routes at 1440px and 390px with no runtime errors or
horizontal overflow. The automated Chromium environment denied OS notification
permission, so real-device banner delivery still needs manual verification.
