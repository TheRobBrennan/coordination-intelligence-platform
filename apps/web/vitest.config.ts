import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    // e2e/ is Playwright-only (pnpm e2e) — vitest's default glob would
    // otherwise also try to import those specs and fail.
    exclude: ["**/node_modules/**", "**/e2e/**"],
  },
});
