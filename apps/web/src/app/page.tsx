import { signIn, signOut } from "@/auth";
import GraphViz from "@/lib/GraphViz";
import { getSession } from "@/lib/session";

const API_BASE =
  process.env.API_INTERNAL_BASE_URL ??
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  "http://localhost:8000";

type OrgResult = {
  org: string;
  sector: string;
  topic: string;
  confidence: number;
  source_url: string;
  evidence: string;
};

async function searchTopic(topic: string): Promise<OrgResult[]> {
  // Query param, not a path segment — topic names can contain "/" (e.g.
  // "Cybersecurity / threat intelligence sharing"), which breaks path routing.
  const res = await fetch(`${API_BASE}/topics/search?topic=${encodeURIComponent(topic)}`, {
    cache: "no-store",
  });
  if (!res.ok) return [];
  const data = await res.json();
  return data.results ?? [];
}

async function listTopics(): Promise<string[]> {
  const res = await fetch(`${API_BASE}/topics`, { cache: "no-store" });
  if (!res.ok) return [];
  const data = await res.json();
  return data.topics ?? [];
}

type GraphSnapshot = {
  orgs: { name: string; sector: string }[];
  topics: string[];
  edges: { org: string; topic: string; confidence: number }[];
};

async function getGraph(): Promise<GraphSnapshot> {
  const res = await fetch(`${API_BASE}/admin/graph`, { cache: "no-store" });
  if (!res.ok) return { orgs: [], topics: [], edges: [] };
  return res.json();
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const session = await getSession();
  const { q } = await searchParams;

  if (!session?.user) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 px-4 font-sans dark:bg-black">
        <div className="flex w-full max-w-sm flex-col items-center gap-4 rounded-2xl border border-zinc-200 bg-white p-8 text-center shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <h1 className="text-xl font-semibold text-black sm:text-2xl dark:text-zinc-50">
            Coordination Intelligence Platform
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Map who&rsquo;s working on what across critical-infrastructure sectors.
          </p>
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
              Sign in
            </button>
          </form>
        </div>
      </div>
    );
  }

  const topics = await listTopics();
  const results = q ? await searchTopic(q) : [];
  const graph = q ? null : await getGraph();

  const bySector = results.reduce<Record<string, OrgResult[]>>((acc, r) => {
    (acc[r.sector] ??= []).push(r);
    return acc;
  }, {});

  return (
    <div className="min-h-screen bg-zinc-50 px-4 py-6 font-sans sm:px-6 sm:py-10 dark:bg-black">
      <div className="mx-auto flex max-w-3xl flex-col gap-6 sm:gap-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <a href="/" className="text-xl font-semibold text-black hover:opacity-70 sm:text-2xl dark:text-zinc-50">
            Coordination Intelligence Platform
          </a>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <a
              href="/how-it-works-preview"
              className="whitespace-nowrap text-sm text-zinc-500 underline dark:text-zinc-400"
            >
              How it works
            </a>
            <form
              action={async () => {
                "use server";
                await signOut();
              }}
            >
              <button
                type="submit"
                className="whitespace-nowrap text-sm text-zinc-500 underline dark:text-zinc-400"
              >
                Sign out ({session.user.name ?? session.user.email})
              </button>
            </form>
          </div>
        </div>

        <form action="/" className="flex flex-col gap-2 sm:flex-row">
          <input
            type="text"
            name="q"
            defaultValue={q}
            placeholder="Type a topic — e.g. cybersecurity, drones, supply chain"
            className="flex-1 rounded-lg border border-zinc-300 bg-white px-4 py-3 text-black dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
          <button
            type="submit"
            className="shrink-0 rounded-lg bg-foreground px-5 py-3 text-background"
          >
            Search
          </button>
        </form>

        {topics.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-zinc-500 dark:text-zinc-400">Try:</span>
            {topics.map((t) => {
              const active = q === t;
              return (
                <a
                  key={t}
                  href={`/?q=${encodeURIComponent(t)}`}
                  className={
                    active
                      ? "rounded-full border border-black bg-black px-3 py-1 text-sm text-white dark:border-white dark:bg-white dark:text-black"
                      : "rounded-full border border-zinc-300 px-3 py-1 text-sm text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
                  }
                >
                  {t}
                </a>
              );
            })}
          </div>
        )}

        {q && results.length === 0 && (
          <p className="text-zinc-500 dark:text-zinc-400">
            No organizations found for &ldquo;{q}&rdquo; yet. Try one of the topics above.
          </p>
        )}

        {q && results.length > 0 && (
          <div className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
            <GraphViz
              topics={[...new Set(results.map((r) => r.topic))]}
              orgs={[...new Map(results.map((r) => [r.org, { name: r.org, sector: r.sector }])).values()]}
              edges={results}
            />
          </div>
        )}

        {!q && graph && (
          <div className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Full graph
            </h2>
            <div className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
              <GraphViz topics={graph.topics} orgs={graph.orgs} edges={graph.edges} />
            </div>
          </div>
        )}

        {Object.entries(bySector).map(([sector, orgs]) => (
          <div key={sector} className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              {sector}
            </h2>
            <div className="flex flex-col gap-3">
              {orgs.map((o) => (
                <div
                  key={`${o.org}-${o.topic}`}
                  className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-black dark:text-zinc-50">
                      {o.org}
                    </span>
                    <span className="text-xs text-zinc-500 dark:text-zinc-400">
                      {Math.round(o.confidence * 100)}% confidence
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                    &ldquo;{o.evidence}&rdquo;
                  </p>
                  <a
                    href={o.source_url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 inline-block text-xs text-zinc-400 underline hover:text-zinc-600 dark:hover:text-zinc-300"
                  >
                    {o.source_url}
                  </a>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
