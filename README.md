<h1 align="center">Chatfuel Apps</h1>

<h3 align="center">Ready-to-deploy micro-SaaS presets for the Chatfuel Wizard</h3>

<p align="center">
  One command scaffolds the full app into a repository of your own,<br/>
  and your coding agent gets the build plan that finishes the product.
</p>

<p align="center">
  <a href="https://github.com/chatfuel-lab/chatfuel-apps/actions/workflows/ci.yml"><img src="https://github.com/chatfuel-lab/chatfuel-apps/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/chatfuel-lab/chatfuel-apps/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT license"></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/badge/node-%3E%3D22-4f46e5.svg" alt="Node version"></a>
  <a href="https://discord.gg/TmrgcjVqFf"><img src="https://img.shields.io/badge/Discord-join-5865F2.svg" alt="Discord"></a>
</p>

```bash
npx @chatfuel/wizard --app <slug>
```

Every app in [the catalog](#the-catalog) below has its copy-paste command.

## What an app is

An app is not a fork of the [wizard](https://github.com/chatfuel-lab/wizard)'s
template — it is a **preset over it**:

- a set of wizard modules to install,
- a brand (name and logo),
- an `overlay/` of extra source files copied over the scaffold,
- a `playbook.md` the wizard hands to your coding agent as the build plan.

The wizard scaffolds its standard shell with the app's modules, applies the overlay, and the
agent finishes the product following the playbook. Everything the scaffold ships — the token
proxy, deploy scripts, module skills — works exactly as in a plain wizard run. The rule of
thumb throughout: **preset data in the overlay, behavior in the playbook.**

## The catalog

| App | Category | Install |
| --- | --- | --- |
| [Comments for Instagram](apps/instagram-comments/README.md) | Instagram | `npx @chatfuel/wizard --app instagram-comments` |
| [Inbox Analytics](apps/inbox-analytics/README.md) | Other | `npx @chatfuel/wizard --app inbox-analytics` |

## Directory contract

```
apps/<slug>/
├── app.json         # manifest — validated against app.schema.json
├── README.md        # this app's page on GitHub
├── listing.md       # listing copy for the catalog site, plain markdown
├── playbook.md      # the agent's build plan
├── overlay/         # files copied verbatim over the scaffolded app (overlay wins)
└── listing/
    ├── icon.png     # square PNG, >= 256x256
    └── screenshots/ # PNG, 16:10, < 1 MB each
```

## Rules the validator enforces

`npm run validate`, and CI on every push:

- `app.json` matches `app.schema.json`; `id` equals the directory name.
- Every referenced file exists inside the app directory.
- The overlay contains regular files only — no symlinks — and never touches wizard-owned files
  (`package.json`, `.env*`, `vite.config.ts`, `src/modules/index.ts`, …). Change those through
  the playbook instead; the wizard enforces the same deny list at scaffold time.
- Screenshots are PNG under 1 MB; the whole overlay stays under 2 MB. A preset is an overlay,
  not a fork.
- A `published` app has at least one screenshot; a `draft` may have none and is skipped by the
  catalog site.

## Authoring an app

1. Copy an existing app directory, rename it, set `id` to the new directory name.
2. Pick `modules` from the wizard's module ids (`npx @chatfuel/wizard --help` lists them).
3. Write the playbook as a build plan: what to construct, in what order, and how to verify
   it — the agent follows it before improvising.
4. Keep the overlay minimal: preset data and components the playbook wires up. Logic the agent
   should own belongs in the playbook, not the overlay.
5. `npm run validate`, then open a PR.

[docs/authoring.md](docs/authoring.md) is the full guide — every manifest field, the overlay
deny list, the playbook style, the asset specs, and the local test loop. It is written so a
coding agent can follow it verbatim.

## Repository map

- `apps/<slug>` — one directory per app: manifest, listing copy, playbook, overlay, assets.
- `app.schema.json` — the manifest schema; the copy the wizard validates against lives in
  [its repository](https://github.com/chatfuel-lab/wizard/blob/main/packages/module-manifest/app.schema.json)
  and the two are kept identical.
- `scripts/validate.mjs` — schema plus the semantic rules ajv cannot express; the only gate.
- `docs/` — the authoring guide.

## Working on this repo

```bash
npm install
npm run validate
```

Node 22 or newer (`.nvmrc`). The overlay's TypeScript compiles only inside a scaffolded app —
it imports the scaffold's vendored design system (`~ui`) — so there is no typecheck here: test
an overlay by scaffolding, as [docs/authoring.md](docs/authoring.md#test-the-app-end-to-end)
describes.

## Releases and updates

The wizard clones `main` at run time, so a merged PR reaches users immediately — there is no
version to publish. When an app lands or changes materially, a maintainer tags `v<date>` and
[Releases](https://github.com/chatfuel-lab/chatfuel-apps/releases) carries the announcement;
watch the repository to get them.

## Community

- [Discussions](https://github.com/chatfuel-lab/chatfuel-apps/discussions) — questions, ideas,
  and what you built
- [Discord](https://discord.gg/TmrgcjVqFf) — the faster route for "how do I…"
- [Issues](https://github.com/chatfuel-lab/chatfuel-apps/issues) — an app or the validator is
  broken, or an [app proposal](https://github.com/chatfuel-lab/chatfuel-apps/issues/new/choose)
- [SECURITY.md](SECURITY.md) — vulnerabilities, privately

## License

MIT — see [LICENSE](LICENSE). The apps the wizard scaffolds from this catalog are yours, under
the same license.
