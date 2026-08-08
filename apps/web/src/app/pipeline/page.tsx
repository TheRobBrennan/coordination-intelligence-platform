import { revalidatePath } from "next/cache";
import { signIn } from "@/auth";
import { getSession } from "@/lib/session";
import LocalTime from "./LocalTime";

const API_BASE =
  process.env.API_INTERNAL_BASE_URL ??
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  "http://localhost:8000";

type SeedOrg = {
  name: string;
  url: string | null;
  sector: string;
  type?: string | null;
  needs_validation?: boolean;
  validation_note?: string | null;
  loaded: boolean;
  cached: boolean;
};

type Stats = {
  orgs: number;
  topics: number;
  relationships: number;
  last_ingested: string | null;
};

async function getStats(): Promise<Stats> {
  const res = await fetch(`${API_BASE}/admin/stats`, { cache: "no-store" });
  return res.json();
}

async function getSeedStatus(): Promise<{
  organizations: SeedOrg[];
  loaded_count: number;
  total_count: number;
}> {
  const res = await fetch(`${API_BASE}/admin/seed`, { cache: "no-store" });
  return res.json();
}

async function resetDemoData() {
  "use server";
  await fetch(`${API_BASE}/admin/reset`, { method: "POST" });
  revalidatePath("/pipeline");
  revalidatePath("/");
}

async function cleanToEmpty() {
  "use server";
  await fetch(`${API_BASE}/admin/clean`, { method: "POST" });
  revalidatePath("/pipeline");
  revalidatePath("/");
}

async function runSelected(formData: FormData) {
  "use server";
  const orgs = formData.getAll("orgs").map(String);
  if (orgs.length === 0) return;
  await fetch(`${API_BASE}/admin/ingest`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ orgs }),
  });
  revalidatePath("/pipeline");
  revalidatePath("/");
}

async function runAllCached() {
  "use server";
  await fetch(`${API_BASE}/admin/ingest`, { method: "POST" });
  revalidatePath("/pipeline");
  revalidatePath("/");
}

// The seed file lives on the server (mounted into the API container) — link
// straight to the API's raw file route so it opens the real JSON, not a copy.
const SEED_JSON_URL = `${process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000"}/admin/seed.json`;

const STAGES = [
  {
    emoji: "\u{1F4CB}",
    title: "Seed list",
    detail: (
      <>
        <a
          href={SEED_JSON_URL}
          target="_blank"
          rel="noreferrer"
          className="underline hover:opacity-70"
        >
          organizations.json
        </a>{" "}
        — 26 candidate orgs, sector + URL
      </>
    ),
  },
  {
    emoji: "\u{1F310}",
    title: "Scraper",
    detail: "Playwright fetches each org's live page (JS-rendered)",
  },
  {
    emoji: "\u{1F9E0}",
    title: "Extractor",
    detail: "LLM adapter pulls topics + verbatim evidence (swappable: mock / Claude / OpenAI)",
  },
  {
    emoji: "\u{1F578}\u{FE0F}",
    title: "Neo4j graph",
    detail: "(Organization)-[WORKS_ON {confidence, evidence}]->(Topic)",
  },
  {
    emoji: "\u{1F4E1}",
    title: "Read API",
    detail: "FastAPI, read-only over the graph — /topics, /topics/search, /orgs/{org}/topics",
  },
  {
    emoji: "\u{1F5A5}\u{FE0F}",
    title: "Web UI",
    detail: "This app — Next.js Server Components query the API directly, no client-side fetch",
  },
];

export default async function Pipeline() {
  const session = await getSession();

  if (!session?.user) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-zinc-50 font-sans dark:bg-black">
        <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">
          Behind the scenes
        </h1>
        <form
          action={async () => {
            "use server";
            await signIn("keycloak");
          }}
        >
          <button
            type="submit"
            className="rounded-full bg-foreground px-5 py-3 text-background"
          >
            Sign in with Keycloak
          </button>
        </form>
      </div>
    );
  }

  const [stats, seed] = await Promise.all([getStats(), getSeedStatus()]);

  return (
    <div className="min-h-screen bg-zinc-50 px-6 py-10 font-sans dark:bg-black">
      <div className="mx-auto flex max-w-3xl flex-col gap-8">
        <div className="flex items-center justify-between">
          <div className="flex items-baseline gap-3">
            <a href="/" className="text-sm text-zinc-500 underline dark:text-zinc-400">
              &larr; Search
            </a>
            <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">
              Behind the scenes
            </h1>
          </div>
        </div>

        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          The graph you just searched didn&rsquo;t appear by magic — here&rsquo;s the
          pipeline that built it, and the current state of the data behind it.
        </p>

        {/* Live stats */}
        <div className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Current graph — live from Neo4j
          </h2>
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg border border-zinc-200 bg-white p-4 text-center dark:border-zinc-800 dark:bg-zinc-900">
              <div className="text-2xl font-semibold text-black dark:text-zinc-50">
                {stats.orgs}
              </div>
              <div className="text-xs text-zinc-500 dark:text-zinc-400">organizations</div>
            </div>
            <div className="rounded-lg border border-zinc-200 bg-white p-4 text-center dark:border-zinc-800 dark:bg-zinc-900">
              <div className="text-2xl font-semibold text-black dark:text-zinc-50">
                {stats.topics}
              </div>
              <div className="text-xs text-zinc-500 dark:text-zinc-400">topics</div>
            </div>
            <div className="rounded-lg border border-zinc-200 bg-white p-4 text-center dark:border-zinc-800 dark:bg-zinc-900">
              <div className="text-2xl font-semibold text-black dark:text-zinc-50">
                {stats.relationships}
              </div>
              <div className="text-xs text-zinc-500 dark:text-zinc-400">connections</div>
            </div>
          </div>
          {stats.last_ingested && (
            <p className="text-xs text-zinc-400 dark:text-zinc-500">
              Last ingested <LocalTime iso={stats.last_ingested} />
            </p>
          )}
        </div>

        {/* Reset action */}
        <div className="flex flex-col gap-3 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Reset &amp; reload a clean demo set
          </h2>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Wipes the graph and reloads 6 organizations from cached page snapshots —
            not a live internet scrape, so this stays fast and reliable at the table
            regardless of wifi. The full pipeline (live scrape + real extraction) is
            the same code path, run from the command line via{" "}
            <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">
              ingestion/run.py
            </code>
            .
          </p>
          <div className="flex gap-2">
            <form action={resetDemoData}>
              <button
                type="submit"
                className="rounded-lg bg-foreground px-4 py-2 text-sm text-background"
              >
                Reset to clean demo set
              </button>
            </form>
            <form action={cleanToEmpty}>
              <button
                type="submit"
                className="rounded-lg border border-zinc-300 px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                Clean to empty
              </button>
            </form>
          </div>
        </div>

        {/* Pipeline stages */}
        <div className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            How it works
          </h2>
          <div className="flex flex-col">
            {STAGES.map((stage, i) => (
              <div key={stage.title} className="flex flex-col">
                <div className="flex items-center gap-3">
                  <div className="z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-zinc-300 bg-white text-lg dark:border-zinc-700 dark:bg-zinc-900">
                    {stage.emoji}
                  </div>
                  <div>
                    <div className="font-medium text-black dark:text-zinc-50">
                      {stage.title}
                    </div>
                    <div className="text-sm text-zinc-500 dark:text-zinc-400">
                      {stage.detail}
                    </div>
                  </div>
                </div>
                {i < STAGES.length - 1 && (
                  <div className="relative h-6 w-10 shrink-0 overflow-hidden">
                    <div className="absolute left-1/2 h-full w-px -translate-x-1/2 bg-zinc-300 dark:bg-zinc-700" />
                    <div
                      className="pipeline-flow-dot absolute left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-zinc-900 dark:bg-zinc-100"
                      style={{ animationDelay: `${i * 0.3}s` }}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Seed list status */}
        <form className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Seed list — {seed.loaded_count} of {seed.total_count} loaded
            </h2>
            <div className="flex gap-3">
              <button
                type="submit"
                formAction={runSelected}
                className="text-sm text-zinc-700 underline hover:opacity-70 dark:text-zinc-300"
              >
                Run selected
              </button>
              <button
                type="submit"
                formAction={runAllCached}
                className="text-sm text-zinc-700 underline hover:opacity-70 dark:text-zinc-300"
              >
                Run all cached
              </button>
            </div>
          </div>
          <p className="text-xs text-zinc-400 dark:text-zinc-500">
            Checkboxes only work for orgs with a cached snapshot (grayed out otherwise —
            no snapshot means no live internet fetch happened for it yet).
          </p>
          <div className="flex flex-col divide-y divide-zinc-200 rounded-lg border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900">
            {seed.organizations.map((org) => (
              <label
                key={org.name}
                className={`flex items-center justify-between gap-3 px-4 py-2 text-sm ${
                  org.cached ? "cursor-pointer" : "opacity-40"
                }`}
              >
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    name="orgs"
                    value={org.name}
                    disabled={!org.cached}
                    className="h-4 w-4"
                  />
                  <span>{org.loaded ? "✅" : org.needs_validation ? "⚠️" : "⬜"}</span>
                  <span className="text-black dark:text-zinc-50">{org.name}</span>
                  {org.needs_validation && (
                    <span
                      title={
                        org.validation_note ??
                        (org.url
                          ? "Flagged for validation before trusting this org's data."
                          : "No URL on file — can't be scraped until one is confirmed.")
                      }
                      className="cursor-help text-xs text-amber-600 dark:text-amber-500"
                    >
                      (?)
                    </span>
                  )}
                </div>
                <span className="text-xs text-zinc-500 dark:text-zinc-400">
                  {org.sector}
                </span>
              </label>
            ))}
          </div>
        </form>
      </div>
    </div>
  );
}
