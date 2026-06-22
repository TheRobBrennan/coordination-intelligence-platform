import { test, expect, type Page } from "@playwright/test";

// Seed value from infra/keycloak/realm-export.json (temporary: false, so this
// should be a one-shot login with no forced reset). NEW_PASSWORD is only used
// as a fallback: if a prior run's defensive reset-form branch below ever did
// fire and changed rob's password, retry against that value instead of the
// stale seed one — self-healing without needing Keycloak admin API calls.
const SEED_PASSWORD = "demo";
const NEW_PASSWORD = "DevLocal!2026";

async function fillAndSubmitLogin(page: Page, password: string) {
  await page.getByLabel("Username or email").fill("rob");
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

test("user can sign in via Keycloak, see their session, and sign out", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Sign in with Keycloak" }).click();
  await page.waitForURL(/\/realms\/platform\/protocol\/openid-connect\/auth/);

  await fillAndSubmitLogin(page, SEED_PASSWORD);

  // If the seed password is stale (e.g. a previous run's reset-form branch
  // changed it), Keycloak re-renders the same login form with an inline
  // error instead of erroring the request — retry once against the password
  // this suite itself would have changed it to.
  const invalidCredentials = await page
    .getByText(/Invalid username or password/i)
    .waitFor({ state: "visible", timeout: 3000 })
    .then(() => true)
    .catch(() => false);
  const activePassword = invalidCredentials ? NEW_PASSWORD : SEED_PASSWORD;
  if (invalidCredentials) {
    await fillAndSubmitLogin(page, activePassword);
  }

  await handlePasswordResetIfPresent(page, NEW_PASSWORD);

  await page.waitForURL("http://localhost:3000/");
  await expect(page.getByText(/Signed in as/)).toBeVisible();

  const signOutButton = page.getByRole("button", { name: "Sign out" });
  await expect(signOutButton).toBeVisible();
  await signOutButton.click();

  await expect(page.getByRole("button", { name: "Sign in with Keycloak" })).toBeVisible();
});
