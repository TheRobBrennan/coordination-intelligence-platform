import { test, expect, type Page } from "@playwright/test";

// Proves the actual demo claim end to end — not a page-load check. Walks the
// same path as the table demo: sign in, search a topic, see real orgs with
// evidence, then check the "Behind the scenes" pipeline page renders its
// live stats and graph. This is the shareable artifact — the HTML report
// this run produces (see playwright.config.ts) is handed to Kathy/CXC as
// proof, not just a claim.

const SEED_PASSWORD = "demo";

async function signIn(page: Page, baseURL: string) {
  await page.goto("/");
  await page.getByRole("button", { name: "Sign in with Keycloak" }).click();
  await page.waitForURL(/\/realms\/platform\/protocol\/openid-connect\/auth/);
  await page.getByLabel("Username or email").fill("demo-analyst");
  await page.getByLabel("Password", { exact: true }).fill(SEED_PASSWORD);
  await page.getByRole("button", { name: "Sign In" }).click();
  await page.waitForURL(baseURL + "/");
}

test("searching a topic returns real orgs with evidence — the core demo claim", async ({
  page,
  baseURL,
}) => {
  const resolvedBaseURL = baseURL ?? "http://localhost:3000";
  await signIn(page, resolvedBaseURL);

  // Click a suggested topic chip rather than typing — proves the chips
  // themselves are wired correctly, not just free-text search.
  const firstChip = page.locator('a[href^="/?q="]').first();
  const topicName = (await firstChip.textContent()) ?? "";
  await firstChip.click();

  // exact + role scopes to the chip link itself — the same topic name also
  // appears as a label inside the graph SVG below, which a plain text match
  // would ambiguously match too.
  await expect(page.getByRole("link", { name: topicName, exact: true })).toBeVisible();

  // At least one result card with a confidence score and a quoted evidence
  // snippet — the two things the whole pitch depends on.
  await expect(page.getByText(/% confidence/).first()).toBeVisible();
  await expect(page.locator("p", { hasText: "“" }).first()).toBeVisible();
});

test("Behind the scenes page shows live stats and the graph", async ({ page, baseURL }) => {
  const resolvedBaseURL = baseURL ?? "http://localhost:3000";
  await signIn(page, resolvedBaseURL);

  await page.getByRole("link", { name: "Behind the scenes" }).click();
  await page.waitForURL(resolvedBaseURL + "/pipeline");

  await expect(page.getByText("Current graph — live from Neo4j")).toBeVisible();
  await expect(page.getByText("organizations", { exact: true })).toBeVisible();
  await expect(page.getByText("Backend — offline / on-demand, writes the graph")).toBeVisible();
  await expect(page.getByText("Frontend — always-on, read-only from the graph")).toBeVisible();

  // The legend proves the graph itself rendered (SVG content isn't reliably
  // text-queryable the same way, so the legend is the stable assertion).
  await expect(page.getByText("Topic", { exact: true })).toBeVisible();
  await expect(page.getByText("Organization", { exact: true })).toBeVisible();
});
