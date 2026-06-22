import { test, expect } from "@playwright/test";

const KEYCLOAK_BASE = process.env.KEYCLOAK_ISSUER?.replace(/\/realms\/.*/, "") ?? "http://localhost:8080";
const ADMIN_USER = process.env.KC_ADMIN ?? "admin";
const ADMIN_PASSWORD = process.env.KC_ADMIN_PASSWORD ?? "admin";

// Reset rob's credential back to the seeded "changeme"/temporary=true state
// via Keycloak's admin API, so this test is rerunnable without a full realm
// reimport even after a real password-reset flow has changed it.
async function resetRobPassword() {
  const tokenRes = await fetch(`${KEYCLOAK_BASE}/realms/master/protocol/openid-connect/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "password",
      client_id: "admin-cli",
      username: ADMIN_USER,
      password: ADMIN_PASSWORD,
    }),
  });
  const { access_token } = await tokenRes.json();

  const usersRes = await fetch(`${KEYCLOAK_BASE}/admin/realms/platform/users?username=rob`, {
    headers: { Authorization: `Bearer ${access_token}` },
  });
  const [rob] = await usersRes.json();

  await fetch(`${KEYCLOAK_BASE}/admin/realms/platform/users/${rob.id}/reset-password`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${access_token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ type: "password", value: "changeme", temporary: true }),
  });
}

test.beforeAll(resetRobPassword);

// Verifies the full Keycloak sign-in flow against the real realm seeded by
// infra/keycloak/realm-export.json. rob's seed credential is flagged
// "temporary", so Keycloak forces a password reset on this first login —
// the test drives that step too rather than assuming a one-shot login form.
test("user can sign in via Keycloak and see their session", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Sign in with Keycloak" }).click();

  await page.waitForURL(/\/realms\/platform\/protocol\/openid-connect\/auth/);
  await page.getByLabel("Username or email").fill("rob");
  await page.getByLabel("Password", { exact: true }).fill("changeme");
  await page.getByRole("button", { name: "Sign In" }).click();

  // First-login forced password reset (seed credential is "temporary").
  // isVisible() doesn't wait/retry — it's an instant check — so use waitFor()
  // to actually give the page a chance to navigate before deciding.
  const newPassword = page.getByLabel("New Password", { exact: true });
  const hasPasswordReset = await newPassword
    .waitFor({ state: "visible", timeout: 5000 })
    .then(() => true)
    .catch(() => false);
  if (hasPasswordReset) {
    await newPassword.fill("DevLocal!2026");
    await page.getByLabel("Confirm password", { exact: true }).fill("DevLocal!2026");
    await page.getByRole("button", { name: "Submit" }).click();
  }

  await page.waitForURL("http://localhost:3000/");
  await expect(page.getByText(/Signed in as/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
});
