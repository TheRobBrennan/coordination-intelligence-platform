# pnpm for npm users

This repo uses **pnpm** instead of npm. If you've only used npm, here's everything
you need — pnpm is ~95% the same commands, with a few differences that matter in a
monorepo like this one.

## 1. Install pnpm (once)

pnpm is a separate program from npm. Pick one:

```bash
# Recommended: Corepack ships with Node 16.13+ and pins the right version
corepack enable
corepack prepare pnpm@latest --activate

# or via Homebrew (macOS)
brew install pnpm

# or the standalone installer
curl -fsSL https://get.pnpm.io/install.sh | sh -
```

Verify: `pnpm --version`. This project pins a version via the `packageManager`
field in `package.json`, so Corepack will use exactly that.

## 2. The mental model (why it's different)

- **npm** copies every dependency into each project's `node_modules`. 100 projects
  using React = 100 copies on disk.
- **pnpm** stores each package **once** in a global content-addressable store and
  hard-links it into `node_modules`. Faster installs, far less disk, and a stricter
  `node_modules` layout that catches "phantom dependency" bugs (using a package you
  never declared).

Practical upshot: installs are fast, and if pnpm says a package "isn't found,"
the fix is usually to **add it to `package.json`** rather than rely on a transitive
dependency — that's a feature, not a bug.

## 3. Command cheat sheet

| Task | npm | pnpm |
|---|---|---|
| Install all deps | `npm install` | `pnpm install` (or `pnpm i`) |
| Add a dependency | `npm install lodash` | `pnpm add lodash` |
| Add a dev dependency | `npm install -D vitest` | `pnpm add -D vitest` |
| Remove a dependency | `npm uninstall lodash` | `pnpm remove lodash` |
| Run a script | `npm run dev` | `pnpm dev` (the `run` is optional) |
| Run a script (explicit) | `npm run build` | `pnpm run build` |
| Run a one-off binary | `npx create-next-app` | `pnpm dlx create-next-app` |
| Run a package's bin | `npx playwright test` | `pnpm exec playwright test` |
| Update deps | `npm update` | `pnpm update` |
| Audit | `npm audit` | `pnpm audit` |
| Clean install (CI) | `npm ci` | `pnpm install --frozen-lockfile` |

Two name changes worth memorizing: **`npx` → `pnpm dlx`** (download & run) or
**`pnpm exec`** (run an already-installed bin), and the lockfile is
**`pnpm-lock.yaml`** (not `package-lock.json`). Commit the lockfile.

## 4. Workspaces — the part that's actually new

This repo is a **monorepo**: one git repo, multiple packages. `pnpm-workspace.yaml`
at the root lists them:

```yaml
packages:
  - "apps/web"
  - "packages/*"
```

That unlocks the `--filter` flag — run a script in one specific package from the
root, without `cd`-ing around:

```bash
pnpm --filter web dev          # run the "dev" script in apps/web
pnpm --filter web add zod      # add a dep to apps/web only
pnpm --filter web exec playwright test
```

`--filter` matches the package's `name` in its `package.json` (here, `web`), not
the folder path. The root `package.json` scripts already wrap the common ones, so
day-to-day you'll mostly type the shortcuts in the next section.

## 5. What you'll actually run in this repo

The root scripts wrap everything — you rarely call `pnpm --filter` directly:

```bash
pnpm install     # install JS deps for the whole workspace
pnpm start       # docker infra up + API & web with hot reload
pnpm stop        # shut it all down
pnpm dev:api     # just the FastAPI backend (no web needed)
pnpm test:web    # vitest in apps/web
```

See the **Local development** table in the root `README.md` for the full list.

> Heads-up: `apps/web` isn't generated yet. When you scaffold it, the command is
> `pnpm create next-app@latest .` (pnpm's equivalent of `npm create`) — see
> `apps/web/README.md`.

## 6. Gotchas coming from npm

- **`pnpm install` at the root installs the whole workspace.** You don't install
  per-package; one root install wires them all together.
- **No `npx`.** Use `pnpm dlx <pkg>` to download-and-run, or `pnpm exec <bin>` for
  something already installed. Plain `npx foo` may still work (it ignores pnpm), but
  prefer the pnpm forms so versions stay consistent.
- **Stricter resolution.** If an import fails with "cannot find module" even though
  it works under npm, you're relying on a phantom dependency — `pnpm add` it
  explicitly to the package that imports it.
- **Lockfile is `pnpm-lock.yaml`.** Don't commit a `package-lock.json`; delete it if
  one appears.
- **`node_modules` looks weird** (symlinks, a `.pnpm/` folder). That's intentional —
  don't try to "fix" it.

## 7. Shell aliases — `pp*` mirrors your `np*` muscle memory

If your `~/.zshrc` has npm shortcut aliases (`npb`, `npr`, `nps`, etc.), there's a
`pp*` alias for each one, same letters, just `pp` instead of `np`. Use these in
this repo instead of the `np*` ones — the underlying scripts here are pnpm, not
npm.

| npm alias | pnpm alias | Command |
|---|---|---|
| `npb` | `ppb` | `pnpm run build` |
| `npc` | `ppc` | `pnpm run clean` |
| `npd` | `ppd` | `pnpm run deploy` |
| `npdp` | `ppdp` | `pnpm run deploy:prod` |
| `npdb` | `ppdb` | `pnpm run docker:build` |
| `npdn` | `ppdn` | `pnpm run docker:nuke` |
| `npds` | `ppds` | `pnpm run docker:start` |
| `npdst` | `ppdst` | `pnpm run docker:stop` |
| `nppd` | `pppd` | `pnpm run pre-deploy` |
| `npr` | `ppr` | `pnpm run` |
| `nps` | `pps` | `pnpm start` |
| `npst` | `ppst` | `pnpm stop` |
| `npt` | `ppt` | `pnpm test` |
| — | `ppi` | `pnpm install` (no npm alias existed for this one) |
| — | `ppx` | `pnpm dlx` (pnpm's `npx`; no npm alias existed for this one) |

These were added to `~/.zshrc` right after the existing npm alias block:

```bash
# pnpm (mirrors the npm aliases above — use these in pnpm-managed repos, e.g.
# coordination-intelligence-platform, instead of the np* npm ones)
alias ppb="pnpm run build"
alias ppc="pnpm run clean"
alias ppd="pnpm run deploy"
alias ppdp="pnpm run deploy:prod"
alias ppdb="pnpm run docker:build"
alias ppdn="pnpm run docker:nuke"
alias ppds="pnpm run docker:start"
alias ppdst="pnpm run docker:stop"
alias pppd="pnpm run pre-deploy"
alias ppr="pnpm run"
alias pps="pnpm start"
alias ppst="pnpm stop"
alias ppt="pnpm test"
alias ppi="pnpm install"
alias ppx="pnpm dlx"
```

The `np*` aliases are left in place (other repos may still use npm) — `pp*` is
additive, not a replacement. After editing `~/.zshrc`, run `source ~/.zshrc` (or
open a new terminal tab) to pick them up.

> Heads-up: the root `package.json` here doesn't define `build`, `clean`,
> `deploy`, `docker:*`, or `pre-deploy` scripts — those `pp*` aliases exist only
> to mirror your npm habits 1:1; the ones that map to real scripts in *this*
> repo are `pps` (`pnpm start`), `ppst` (`pnpm stop`), and `ppr dev:api` /
> `ppr test:web` for the rest. See §5 above for the full list of scripts that
> actually exist here.

## 8. If you'd rather not learn pnpm right now

Only `apps/web` (the Next.js frontend) uses pnpm. The Python side (`apps/api`,
`ingestion`) uses **uv**, and Docker is just `docker compose`. So you can do most
backend work without touching pnpm at all — `pnpm dev:api` is the only JS-adjacent
command you need until the web app exists.
