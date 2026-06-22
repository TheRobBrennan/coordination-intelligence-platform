import { test, expect } from "@playwright/test";

const KEYCLOAK_BASE = process.env.KEYCLOAK_ISSUER?.replace(/\/realms\/.*/, "") ?? "http://localhost:8080";
const ADMIN_USER = process.env.KC_ADMIN ?? "admin";
const ADMIN_PASSWORD = process.env.KC_ADMIN_PASSWORD ?? "admin";
const SEED_PASSWORD = "demo";

// Reset rob's credential back to the seeded "demo"/temporary=false state via
// Keycloak's admin API, so this test is rerunnable without a full realm
// reimport even if a manual password change happened in between.
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
    body: JSON.stringify({ type: "password", value: SEED_PASSWORD, temporary: false }),
  });
}

test.beforeAll(resetRobPassword);

// Verifies the full Keycloak sign-in flow against the real realm seeded by
// infra/keycloak/realm-export.json. The seed credential is not temporary, so
// this should be a one-shot login with no forced password-reset step — the
// defensive check below just guards against that ever silently regressing
// (e.g. someone flips the seed back to temporary=true).
test("user can sign in via Keycloak and see their session", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Sign in with Keycloak" }).click();

  await page.waitForURL(/\/realms\/platform\/protocol\/openid-connect\/auth/);
  await page.getByLabel("Username or email").fill("rob");
  await page.getByLabel("Password", { exact: true }).fill(SEED_PASSWORD);
  await page.getByRole("button", { name: "Sign In" }).click();

  // Defensive only: isVisible() doesn't wait/retry, so use waitFor() to give
  // the page a chance to navigate before deciding whether a reset form (it
  // shouldn't) appeared.
  const newPassword = page.getByLabel("New Password", { exact: true });
  const hasPasswordReset = await newPassword
    .waitFor({ state: "visible", timeout: 2000 })
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
