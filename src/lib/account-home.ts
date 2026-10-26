export function accountHome(user: { role: string; onboarded: number }) {
  return ["ADMIN", "MODERATOR"].includes(user.role) ? "admin"
    : user.role === "PARENT" ? "parent"
    : user.onboarded ? "dashboard" : "onboarding";
}
