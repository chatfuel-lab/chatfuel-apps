# Authoring an app

This is the full contract for a catalog app, written so a coding agent can follow it verbatim.
The short version lives in the [root README](../README.md); `apps/instagram-comments/` is the
worked example every section below points at.

An app is a preset over the wizard's standard shell, never a fork of it. Four things make one
up — a module set, a brand, an overlay, a playbook — and one rule of thumb decides where any
given piece goes: **preset data in the overlay, behavior in the playbook.**

## The manifest: `app.json`

Validated against [`app.schema.json`](../app.schema.json) by `npm run validate` and again by
the wizard at scaffold time. Field by field:

| Field | Required | Meaning |
| --- | --- | --- |
| `id` | yes | `^[a-z][a-z0-9-]*$`. Must equal the directory name; doubles as the catalog-site slug and the `--app` value. |
| `name` | yes | The product name, ≤ 60 chars. |
| `tagline` | yes | One line under the name, ≤ 120 chars. |
| `description` | yes | Meta/OG description, one or two sentences, ≤ 300 chars. |
| `category` | yes | One of `instagram`, `whatsapp`, `facebook`, `website`, `other`. |
| `status` | yes | `draft` or `published`. The site lists only published apps; the wizard scaffolds drafts too, which is how you test before publishing. |
| `modules` | yes | Wizard module ids, min 1 — what `--modules` takes (`npx @chatfuel/wizard --help` lists them), not the site's marketing slugs. |
| `brand.appName` | yes | The name the wizard brands the scaffold with. `--app-name` on the command line still wins. |
| `brand.logo` | no | App-dir-relative path, e.g. `listing/icon.png`. `--logo` still wins. |
| `minWizardVersion` | no | `x.y.z`. Older wizards refuse the app and say to re-run with `@latest`. |
| `env` | no | Extra `.env` lines: `name` (`^[A-Z][A-Z0-9_]*$`), `default`, `optional`. Deliberately narrower than a module's env — no `secret`, no `resolve`, no `prompt` — an app preset must not hook wizard steps or declare secrets. Module declarations come first and first declaration wins, so an app can add variables but never redefine `CHATFUEL_TOKEN`. |
| `npmDependencies` | no | `{ "package": "range" }`, merged into the scaffold's `package.json`. Every new dependency needs a written justification in the PR — its install scripts run on every user's machine. |
| `playbook` | no | App-dir-relative path to the build plan. Default `playbook.md`. |
| `listing.icon` | yes | Square PNG, at least 256×256. |
| `listing.screenshots` | yes | `[{ file, alt }]` — `alt` is required and non-empty. A `published` app needs at least one. |
| `listing.keywords` | no | Plain strings for the site's metadata. |
| `listing.provides` | no | `[{ name ≤ 60, description ≤ 160 }]` — what the app itself ships (overlay modules, product surfaces). The site renders these beside the wizard modules so the install section tells the whole truth; without it, an overlay-product app looks like it installs only supporting modules. |

## The overlay

`overlay/` is copied file-by-file over the scaffolded app after every template transform.
Overlay wins on collision, and the wizard prints every replaced path.

Hard rules, enforced by the validator here and by the wizard again at scaffold time:

- Regular files only. No symlinks, no `..` segments, nothing that resolves outside the
  scaffold.
- Wizard-owned files may never be replaced — the deny list is `OVERLAY_DENY` in
  [`scripts/validate.mjs`](../scripts/validate.mjs), matched case-insensitively:
  - scaffold files: `package.json`, `.gitignore`, `_gitignore`, `index.html`,
    `vite.config.ts`, `vite.config.js`, `vite.config.mjs`, `vite.server.config.ts`,
    `tsconfig.json`, `server/entry.ts`, `api/chatfuel.ts`, `src/index.css`,
    `src/modules/index.ts`, `src/modules/navGroups.tsx`;
  - package manager instructions and lockfiles: `.npmrc`, `.yarnrc`, `.yarnrc.yml`,
    `.pnpmfile.cjs`, `pnpm-workspace.yaml`, `.node-version`, `.nvmrc`, `package-lock.json`,
    `npm-shrinkwrap.json`, `pnpm-lock.yaml`, `yarn.lock`, `bun.lockb`;
  - scripts run with the token in `.env`: `scripts/deploy-vercel.mjs`,
    `scripts/connect-git.mjs`, `scripts/codegen.mjs`;
  - plus anything under `.env*`, `node_modules/`, `.git/`, `patches/`, `scripts/deploy/`.

  Changes to those belong in the playbook, where the user's own agent applies them in the open.
- The whole overlay stays under 2 MB. A preset is an overlay, not a fork.

What belongs in an overlay: a product module's React tree (see
`apps/instagram-comments/overlay/src/modules/comments/`), its data/copy file, nothing else.
The overlay's TypeScript compiles only inside a scaffolded app — it imports the scaffold's
vendored design system (`~ui`) — so this repository does not typecheck it; the test loop below
does.

Two files the overlay cannot touch but every app needs registered —
`src/modules/index.ts` and `src/modules/navGroups.tsx` — are the canonical example of a
playbook step: the playbook tells the agent to import the module descriptor and add the nav
group, and the agent does it in the user's own repository.

## The playbook

The playbook is the build plan the wizard hands to the user's coding agent, inserted above the
module guides in the finish-setup checklist. `apps/instagram-comments/playbook.md` is the
reference; match its shape:

- Open with two or three sentences saying what the product is and where its UI already lives.
- Numbered steps in build order. **Every step ends with a `Verify:` line** — a concrete check
  the agent can run before moving on.
- Step one is almost always "register the overlay's module" (the two wizard-owned files
  above), plus any chrome branding.
- Close with an `## Out of scope` section naming what the app deliberately does not do —
  agents improvise without one.
- All user-facing copy the agent might edit lives in one file in the overlay (for
  instagram-comments: `rules.ts`), and the playbook says so — never spread copy through
  components.
- English only, like everything in this repository: the playbook lands verbatim in the user's
  project.

The scaffold ships agent skills (`chatfuel-core`, per-module guides); the playbook can and
should reference them for API patterns instead of inlining GraphQL.

## The listing: `listing.md` and assets

`listing.md` is the app's long description on the catalog site — plain markdown, `##` sections
with paragraphs. The site renders it as-is, so no HTML.

Assets under `listing/`:

- **Icon** — square PNG, at least 256×256. Doubles as `brand.logo` so the scaffolded app and
  the catalog card match.
- **Screenshots** — PNG, 16:10, under 1 MB each. Take them at 2560×1600: a 1280×800 viewport
  rendered at 2× device scale, so retina screens get a sharp image. Show the app window
  content only — no browser chrome, no desktop. Screenshots show the **actual scaffolded
  app**, never mockups: scaffold it, run it, photograph it. Every screenshot carries a real
  `alt` text.

## Test the app end to end

The wizard clones the catalog's **committed HEAD** — uncommitted changes are invisible to it,
so commit first, then scaffold from your local checkout:

```bash
npm run validate
git add -A && git commit
npx @chatfuel/wizard --app <slug> --apps-repo /path/to/your/chatfuel-apps --dry-run
```

`--dry-run` skips deploys and external provisioning; drop it for a full run. In the scaffolded
directory, check:

- every overlay file landed (the wizard lists the paths it copied),
- `npm run dev` compiles — this is where the overlay's TypeScript is actually checked,
- the finish-setup instructions open with your playbook,
- then follow the playbook yourself once, verifying each step's `Verify:` line.

Iterate by re-committing and re-scaffolding; a stale scaffold means a forgotten commit.

## Submitting

`npm run validate` green, one commit, one app per PR — [CONTRIBUTING.md](../CONTRIBUTING.md)
has the rest.
