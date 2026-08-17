import { test, expect, type Page } from "@playwright/test";

// Proves the actual demo claim end to end — not a page-load check. Walks the
// same path as the table demo: sign in, search a topic, see real orgs with
// evidence, then exercise the "Behind the scenes" pipeline page live. This
// is the shareable artifact — the HTML report this run produces (see
// playwright.config.ts) is handed to Kathy/CXC as proof, not just a claim.
//
// Serialized (test.describe.serial): the "Behind the scenes" tests below all
// mutate the same live Neo4j graph through the real /admin/* endpoints —
// running them in parallel workers races Reset against Clean against Run
// against each other on shared state. Serial mode runs them one after
// another in a fixed order, in the same worker — which also means, run
// --headed, they play out as one coherent, watchable sequence instead of
// two browser windows fighting over the same database.

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

async function goToPipeline(page: Page, baseURL: string) {
  await page.getByRole("link", { name: "Behind the scenes" }).click();
  await page.waitForURL(baseURL + "/how-it-works-preview");
}

async function checkOrg(page: Page, orgName: string) {
  await page.locator("label", { hasText: orgName }).locator('input[type="checkbox"]').check();
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

test.describe.serial("Behind the scenes — live pipeline operations", () => {
  test("shows live stats, the graph, and the backend/frontend architecture split", async ({
    page,
    baseURL,
  }) => {
    const resolvedBaseURL = baseURL ?? "http://localhost:3000";
    await signIn(page, resolvedBaseURL);
    await goToPipeline(page, resolvedBaseURL);

    await expect(page.getByText("Current graph — live from Neo4j")).toBeVisible();
    await expect(page.getByText("organizations", { exact: true })).toBeVisible();
    await expect(page.getByText("Backend — offline / on-demand, writes the graph")).toBeVisible();
    await expect(page.getByText("Frontend — always-on, read-only from the graph")).toBeVisible();

    // The legend proves the graph itself rendered (SVG content isn't
    // reliably text-queryable the same way, so the legend is the stable
    // assertion here).
    await expect(page.getByText("Topic", { exact: true })).toBeVisible();
    await expect(page.getByText("Organization", { exact: true })).toBeVisible();
  });

  test("the graph is interactive — click a pill, click a path, click outside to clear", async ({
    page,
    baseURL,
  }) => {
    const resolvedBaseURL = baseURL ?? "http://localhost:3000";
    await signIn(page, resolvedBaseURL);
    await goToPipeline(page, resolvedBaseURL);

    const svg = page.getByTestId("graph-svg");
    await expect(svg).toBeVisible();
    await expect(page.getByRole("button", { name: "Clear selection" })).not.toBeVisible();

    // Click a topic pill's label — selects it and highlights its edges.
    await svg.locator("text").first().click();
    await expect(page.getByRole("button", { name: "Clear selection" })).toBeVisible();

    // Clicking empty svg background clears the selection again.
    await svg.click({ position: { x: 4, y: 4 } });
    await expect(page.getByRole("button", { name: "Clear selection" })).not.toBeVisible();

    // Click a connecting path itself — selects just that one edge, via the
    // invisible fat hit-area each edge renders (the visible line is only
    // 1-2px, too thin to click reliably on its own — see GraphViz.tsx).
    // force: true — this path is deliberately stroke="transparent" (a hit
    // area, not something meant to be seen), which Playwright's own
    // actionability check reads as "not visible" and refuses to click.
    // That's correct behavior working against an intentional design choice,
    // not a bug to route around blindly — bypassing it here is the right
    // call specifically because we already know why it looks invisible.
    await svg.getByTestId("edge-hit-area").first().click({ force: true });
    await expect(page.getByRole("button", { name: "Clear selection" })).toBeVisible();
    await svg.click({ position: { x: 4, y: 4 } });
    await expect(page.getByRole("button", { name: "Clear selection" })).not.toBeVisible();
  });

  test("clean to empty, reset to the demo set, then load organizations outside it", async ({
    page,
    baseURL,
  }) => {
    const resolvedBaseURL = baseURL ?? "http://localhost:3000";
    await signIn(page, resolvedBaseURL);
    await goToPipeline(page, resolvedBaseURL);

    // 1. Wipe to nothing.
    await page.getByRole("button", { name: "💥 Nuke data" }).click();
    await page.waitForURL(resolvedBaseURL + "/how-it-works-preview");
    await expect(page.getByText("Nothing to draw yet")).toBeVisible();
    await expect(page.getByText("Seed list — 0 of 29 loaded")).toBeVisible();

    // 2. Reset back to the curated 6-org demo set.
    await page.getByRole("button", { name: "Reset to clean demo set" }).click();
    await page.waitForURL(resolvedBaseURL + "/how-it-works-preview");
    await expect(page.getByText("Nothing to draw yet")).not.toBeVisible();
    await expect(page.getByText("Seed list — 6 of 29 loaded")).toBeVisible();

    // 3. Select two real organizations that are NOT part of the demo
    // starter set (Pinkerton, SAIC — cached but never auto-loaded) and run
    // just those, proving the ingestion pipeline reaches beyond the six
    // curated for the table demo.
    await checkOrg(page, "Pinkerton");
    await checkOrg(page, "SAIC");
    await page.getByRole("button", { name: "Run selected" }).first().click();
    await page.waitForURL(resolvedBaseURL + "/how-it-works-preview");

    await expect(page.getByText("Seed list — 8 of 29 loaded")).toBeVisible();
    await expect(page.locator("label", { hasText: "Pinkerton" })).toContainText("✅");
    await expect(page.locator("label", { hasText: "SAIC" })).toContainText("✅");
  });
});
