import { test, expect, type Page } from "@playwright/test";

// Seed value from infra/keycloak/realm-export.json (temporary: false, so this
// should be a one-shot login with no forced reset). NEW_PASSWORD is only used
// as a fallback: if a prior run's defensive reset-form branch below ever did
// fire and changed the admin user's password, retry against that value instead of the
// stale seed one — self-healing without needing Keycloak admin API calls.
const SEED_PASSWORD = "demo";
const NEW_PASSWORD = "DevLocal!2026";

async function fillAndSubmitLogin(page: Page, username: string, password: string) {
  await page.getByLabel("Username or email").fill(username);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign In" }).click();
}

// Forced password-reset step shouldn't fire (seed isn't temporary) — this is
// a defensive guard against that ever silently regressing, e.g. someone flips
// the seed back to temporary: true. waitFor() (not isVisible(), which doesn't
// wait/retry) gives the page a chance to navigate before deciding.
async function handlePasswordResetIfPresent(page: Page, password: string) {
  const newPassword = page.getByLabel("New Password", { exact: true });
  const hasPasswordReset = await newPassword
    .waitFor({ state: "visible", timeout: 2000 })
    .then(() => true)
    .catch(() => false);
  if (hasPasswordReset) {
    await newPassword.fill(password);
    await page.getByLabel("Confirm password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Submit" }).click();
  }
}

// Click "Sign in with Keycloak" from the home page and complete the login
// form, retrying once with NEW_PASSWORD if the seed password turns out to be
// stale (see the module comment above). baseURL is threaded through instead
// of hardcoded so this runs correctly against any PLAYWRIGHT_BASE_URL, not
// just localhost — e.g. `PLAYWRIGHT_BASE_URL=https://cip-preview-web.sploosh.ai
// pnpm exec playwright test` for the tunnel preview.
async function signInFromHome(page: Page, username: string, baseURL: string) {
  await page.goto("/");
  await page.getByRole("button", { name: "Sign in with Keycloak" }).click();
  await page.waitForURL(/\/realms\/platform\/protocol\/openid-connect\/auth/);

  await fillAndSubmitLogin(page, username, SEED_PASSWORD);

  const invalidCredentials = await page
    .getByText(/Invalid username or password/i)
    .waitFor({ state: "visible", timeout: 3000 })
    .then(() => true)
    .catch(() => false);
  if (invalidCredentials) {
    await fillAndSubmitLogin(page, username, NEW_PASSWORD);
  }

  await handlePasswordResetIfPresent(page, NEW_PASSWORD);
  await page.waitForURL(baseURL + "/");
}

test("user can sign in via Keycloak, see their session, and sign out", async ({ page, baseURL }) => {
  await signInFromHome(page, "demo-admin", baseURL ?? "http://localhost:3000");

  await expect(page.getByRole("button", { name: /Sign out/ })).toBeVisible();

  const signOutButton = page.getByRole("button", { name: "Sign out" });
  await expect(signOutButton).toBeVisible();
  await signOutButton.click();

  await expect(page.getByRole("button", { name: "Sign in with Keycloak" })).toBeVisible();
});

// Regression test: signing out of the app must also end Keycloak's own SSO
// session (RP-initiated logout), not just the app's session cookie. If it
// doesn't, the next "Sign in with Keycloak" click silently re-authenticates
// whoever was previously signed in instead of showing a login form, and a
// second user can never sign in without manually clearing cookies.
test("signing out lets a different user sign in", async ({ page, baseURL }) => {
  const resolvedBaseURL = baseURL ?? "http://localhost:3000";
  await signInFromHome(page, "demo-admin", resolvedBaseURL);
  await expect(page.getByRole("button", { name: /Sign out/ })).toContainText("Demo Admin");

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("button", { name: "Sign in with Keycloak" })).toBeVisible();

  await page.getByRole("button", { name: "Sign in with Keycloak" }).click();
  // Must land on a real login form, not get silently re-authenticated via a
  // still-alive Keycloak SSO session.
  await page.getByLabel("Username or email").waitFor({ state: "visible", timeout: 5000 });

  await fillAndSubmitLogin(page, "demo-analyst", SEED_PASSWORD);
  const invalidCredentials = await page
    .getByText(/Invalid username or password/i)
    .waitFor({ state: "visible", timeout: 3000 })
    .then(() => true)
    .catch(() => false);
  if (invalidCredentials) {
    await fillAndSubmitLogin(page, "demo-analyst", NEW_PASSWORD);
  }
  await handlePasswordResetIfPresent(page, NEW_PASSWORD);
  await page.waitForURL(resolvedBaseURL + "/");

  await expect(page.getByRole("button", { name: /Sign out/ })).toContainText("Demo Analyst");
});
