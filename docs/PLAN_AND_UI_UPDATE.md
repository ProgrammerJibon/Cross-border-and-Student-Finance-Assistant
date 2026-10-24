# Plan access and interface update

- Student Free is the starting plan. Student Pro (`student`) enables CSV imports and the higher student quotas. Legacy Pro student subscriptions migrate to Student Pro.
- Parents can purchase or renew Family only. Family supports five seats, counting pending invitations, and gives linked students Student Pro at no extra charge. The student's underlying subscription stays Free. Removing the link or expiry of Family removes included Pro immediately. A student can belong to one family at a time.
- Demo accounts resolve to Free and cannot purchase, cancel, or switch subscriptions. Family-sponsored students cannot change their included plan themselves.
- Run `npm run db:migrate` on deployment to update plans and create notification device storage. The migration preserves configured plan prices.
- Notification Resubscribe is in the notification bell dialog. It requests browser permission, refreshes the service worker, saves the device registration and notification preference, and re-saves an existing push subscription when present. Closed-app push delivery remains unavailable; the UI explains this.
- The landing competition banner dismissal is stored in localStorage. SVG flags appear only inside the language menu. The favicon reproduces the three-bar navigation brand. Footer credits: Developer Jibon; Tester Meher.
- AI execution reuses deterministic calculations and action schemas within a run, rechecks financial state, rejects tools outside the role's allowlist, and stops immediately after a validated final response. No configured provider or model was replaced. These changes follow the request-reduction principles in [OpenAI's latency guide](https://developers.openai.com/api/docs/guides/latency-optimization).

Validation commands:

```text
npm run typecheck
npm run lint
npm test
npm run test:billing
node --conditions=react-server --import tsx --test tests/entitlements.integration.ts
npx playwright test tests/e2e/requested-updates.spec.ts
npx next build
```
