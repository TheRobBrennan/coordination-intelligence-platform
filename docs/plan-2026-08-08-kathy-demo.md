# Demo plan — Kathy, Saturday August 8th

**Status:** active · **Written:** 2026-08-07 · **Demo:** Saturday 2026-08-08,
11:00am–1:30pm, in person. Kathy has a hard out at 2pm.

The single goal of this plan is a working demo tomorrow morning. Everything not
required for that is listed at the bottom under "After the demo" and is
deliberately out of scope until Kathy has seen something run.

## The one thing this demo has to do

From the June kickoff review, unchanged and still correct:

> Type a topic, instantly see which organizations across sectors are working on
> it — with the evidence to back it up.

If Kathy types a topic and sees real organizations with real source quotes pulled
from real websites, the demo succeeded. Nothing else is load-bearing.

## Where the project actually stands (audited 2026-08-07)

**Working:**

- Full containerized stack — Neo4j, Keycloak, Postgres, API, web — with hot reload
  (`make up` / `make up-web`)
- Keycloak auth end to end: sign in, session, sign out, RP-initiated logout
- FastAPI read API over the graph: `/health`, `/topics`, `/topics/{topic}/orgs`,
  `/orgs/{org}/topics`, behind a `Graph` protocol so tests inject a fake
- Ingestion components, each independently tested: `scraper.fetch_html`,
  `extractor.extract_topics`, `loader.load`, `preflight.check`, and five LLM
  adapters behind `get_adapter()` (anthropic, claude_cli, openai, mock, manual)
- 26-org seed list at `ingestion/seed/organizations.json`
- pytest suites for the API routes and the extractor (offline, fixture-based)

**Missing — and this is why there is nothing to demo today:**

| Gap | Impact |
|---|---|
| `ingestion/run.py` does not exist | Nothing has ever populated Neo4j. The graph is empty, so the API returns empty results. |
| `apps/web` has no product UI | `page.tsx` is a sign-in/sign-out screen. No topic search, no org list, no evidence view. |
| Playwright covers only auth | Both specs in `e2e/login.spec.ts` test Keycloak. Nothing asserts the product claim. |
| No Playwright reporter | No HTML report exists to share as evidence. |

The two gaps in the first two rows are the entire critical path. Everything else
can wait.

## What must be true by 11am

1. Neo4j holds real extracted data for a handful of real organizations
2. Typing a topic in the web UI returns those organizations, grouped by sector,
   each showing its confidence and the verbatim source quote
3. The whole thing runs on the MacBook via `make up-web` with **no internet
   dependency** — the meeting is in a restaurant, and `localhost` does not care
   about their wifi
4. Keycloak sign-in still works, unchanged

## Guardrails

1. **No direct commits to `main`.** Date-prefixed branch and a PR (convention in
   commit `997c178`).
2. **Ingestion scales in a ladder, never all at once.** 1 org → 3 orgs → more,
   with a manual look at the graph between rungs. A scraper bug should cost one
   page fetch to find, not twenty-six.
3. **`mock` before real LLM calls.** `LLM_PROVIDER=mock` proves the wiring end to
   end at zero cost and zero network.
4. **Local demo is the primary path.** Any hosted URL is a bonus, never the thing
   the demo depends on.

## Tonight's critical path

### Step 1 — `ingestion/run.py`

Branch: `2026.08.08/ingestion-run-pipeline`

All three stages already exist with clean interfaces. This is orchestration, not
new architecture:

```
seed/organizations.json
  → scraper.fetch_html(url)
  → extractor.extract_topics(adapter, org_name=, source_url=, html=)
  → ExtractionResult(organization=, topics=, scraped_at=)
  → loader.load(driver, result)
```

**CLI shape** — the `--limit` / `--only` flags are what enforce guardrail 2:

| Flag | Purpose |
|---|---|
| `--seed PATH` | Seed file. Default `seed/organizations.json`. |
| `--limit N` | Process at most N orgs. **The ladder lives here.** |
| `--only NAME` | Process a single named org. Used for the first run. |
| `--dry-run` | Scrape and extract, print the result, write nothing to Neo4j. |

**Requirements:**

- Call `preflight.check()` before any work; exit non-zero if the provider is
  unusable — fail before spending a page fetch, not after
- `scraped_at` is stamped by `run.py` at call time, never inside pipeline code
  (`models.py` says so explicitly)
- One org failing must not abort the run. Seed orgs flagged `needs_validation`
  are expected to fail; log, count, continue
- Per-org progress line plus an end-of-run summary (processed / loaded / failed)
- pytest coverage with a fake adapter and fake driver — offline, matching the
  existing test style

**The ladder:**

1. `--only "Lumen Technologies" --dry-run` with `LLM_PROVIDER=mock` — proves
   scrape → extract without touching the database
2. Same without `--dry-run` — inspect the result in Neo4j Browser by hand
3. `--limit 3` — confirms multi-org iteration and error isolation
4. `--limit 3` with a real provider — first real extraction quality check
5. Only go wider once the above is clean. **The demo does not need 26 orgs** —
   it needs enough orgs across enough sectors to make cross-sector overlap
   visible. Five or six good ones beats twenty-six half-scraped ones.

### Step 2 — minimal topic search UI

Branch: `2026.08.08/topic-search-ui` · blocked by step 1

- Search page calling the existing API: type a topic → orgs grouped by sector,
  each with confidence and the verbatim `source_evidence` snippet
- Click through to an org → its topics
- **Build it as React Server Components** so Next.js calls FastAPI server-side.
  The API then never needs to be publicly reachable, which matters if the tunnel
  below gets set up.
- Empty state and error state that do not look broken — Kathy will type something
  that returns nothing, and that moment should look deliberate

**Not tomorrow:** the force-directed graph view. The evidence-backed list is what
proves the claim; the graph is polish and can wait.

### Step 3 — the shareable spec

- A Playwright spec that walks the claim exactly as a stakeholder would read it:
  search a topic, assert orgs appear, assert evidence is shown
- `reporter: [["html"]]` in `playwright.config.ts` so a run produces an artifact
  that can be handed to Kathy and, later, to CXC stakeholders
- The existing Keycloak login specs keep passing — nothing in this plan touches
  auth

## If there is time — Cloudflare Tunnel preview

**Optional. Skip without guilt if steps 1–3 run long.**

`sploosh.ai` is already on Cloudflare nameservers, so there is no nameserver
migration or propagation wait. `cloudflared` dials out from the MacBook to
Cloudflare's edge and publishes local ports at public hostnames with valid TLS —
no inbound ports, no public IP, no hosting cost.

| Hostname | → | Service |
|---|---|---|
| `cip-preview-web.sploosh.ai` | → | `localhost:3000` (Next.js) |
| `cip-preview-auth.sploosh.ai` | → | `localhost:8080` (Keycloak) |

Run it as its own compose profile so its lifecycle is independent of the app:

```bash
docker compose --profile tunnel up -d cloudflared    # tunnel up, app untouched
docker compose --profile tunnel down                 # tunnel down, app keeps running
```

**The gotcha:** Keycloak must know its public hostname or the OAuth redirect sends
the visitor's browser to *their* localhost and login dies. That means
`KC_HOSTNAME=https://cip-preview-auth.sploosh.ai`, the NextAuth issuer updated to
match, and the realm's redirect URIs pointed at
`https://cip-preview-web.sploosh.ai/api/auth/callback/keycloak`. Change the
redirect URIs live in the Keycloak admin console for speed, then persist them into
`realm-export.json` in the PR — `--import-realm` only applies on a fresh volume.

**Consequence to keep straight:** once `KC_HOSTNAME` points at the tunnel,
`localhost` logins redirect out to the tunnel too and therefore need internet.
Keep two `.env` variants and know which one is loaded. **The in-person demo should
run on the localhost variant** — no wifi dependency.

The tunnel's real value is *after* the meeting: Kathy can revisit the demo and
share it with CXC stakeholders ahead of the August 20th call.

## Not tomorrow

Explicitly out of scope, so they do not creep in at 1am:

- Keycloak account-lifecycle work — password reset, transactional email,
  verification, password policy
- Google SSO (tabled outright — see "After the demo")
- Enforcing auth on `apps/api`
- Vercel, VMs, AuraDB, or any hosted deployment
- Force-directed graph visualization
- The full 26-org ingest
- PRD phases 2–4, People/Initiative/Event nodes, the "unconnected parallel
  efforts" discovery pass

## After the demo — the road to August 20th

The CXC call on Thursday August 20th is the one that plausibly needs a URL for
stakeholders who are not in the room. In rough order:

1. **Lean into Keycloak instead of bolting SSO onto it.** Google SSO is
   **tabled** — it only ever earned a place in the plan because the Vercel framing
   made Keycloak look like a liability to route around. With Keycloak staying as
   the token authority, the higher-value work is the account lifecycle it already
   provides, most of which is realm configuration rather than code:

   - SMTP configuration on the realm, so Keycloak can actually send mail
   - Forgot-password / password-reset flow (realm → Login → "Forgot password")
   - Email verification as a required action on registration
   - Password policy (length, complexity, reuse history) and brute-force
     detection (realm → Security defenses)
   - Self-service account console — already live at
     `/realms/platform/account`, currently unused by the demo
   - Custom email templates and login theming, when branding matters

   **Add a mail catcher to compose for this work.** A `mailpit` service means the
   whole email lifecycle is developable and Playwright-testable offline, with no
   SMTP provider, no sending domain, and no deliverability rabbit hole. Wire a
   real provider (Resend, Brevo, and SendGrid all have usable free tiers) only
   when mail needs to leave the machine — at which point `sploosh.ai` needs
   SPF/DKIM records for the sending subdomain.

   Persist every realm change into `realm-export.json`, remembering that
   `--import-realm` only applies on a fresh volume (`make clean && make up`).

   Google brokering stays available if it is ever actually wanted — Keycloak
   supports it as an upstream identity provider, and adding it later changes no
   application code.
2. **Enforce auth on `apps/api`.** It currently enforces none — see the module
   docstring in `app/main.py`, which marks the intended seam. Add a verify-JWT
   dependency there (realm JWKS, check signature/issuer/audience/expiry, require
   the `analyst` role). Routes do not change.
3. **Decide how the preview is served** — the Cloudflare Tunnel above may simply
   be the answer, in which case there is no hosting to buy. If an always-on host
   is wanted, the whole stack is one `docker-compose.yml` and runs on any single
   VM; a four-provider split is not required and is more work, not less.
4. **Widen the ingest** to the full seed list once extraction quality is proven.
5. **Graph visualization** and the "unconnected parallel efforts" pass, if time
   allows — these are the stretch items from the June kickoff.

## Open questions for Kathy (tomorrow)

Carried from the June kickoff, still unanswered:

1. Is the ~25-org seed list the right demo dataset, or is there a sharper
   must-impress subset?
2. Is OpenAI/Azure a hard requirement (Azure credits, compliance), or is the
   provider ours to pick?
3. Do stakeholders need to reach the demo themselves before the August 20th call,
   or is a screen-share sufficient? — determines whether the tunnel above is worth
   finishing
4. Is anything non-public expected in the ingest? (PRD §9.3 says public sources
   only.)
5. What does "done" mean for the $1,200 — is the PoC the deliverable, or a
   stepping stone to a Phase 1 engagement?
