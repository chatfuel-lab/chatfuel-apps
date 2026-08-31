# Rules for coding agents

Read [docs/authoring.md](docs/authoring.md) before creating or changing an app — it is the
full contract and is written to be followed verbatim.

The short list:

- **English only.** Everything in this repository ships into users' projects — manifests,
  playbooks, overlay code, comments, listing copy.
- **Preset data in the overlay, behavior in the playbook.** Never put wizard-owned files in an
  overlay (`src/modules/index.ts`, `package.json`, `.env*`, … — the deny list in
  `scripts/validate.mjs`); the playbook tells the user's agent to change those.
- **`npm run validate` before every commit.** CI runs exactly this; a red validator is never
  worked around.
- **No micro-commits.** One meaningful commit per change; a PR is exactly one commit, squashed.
  Follow-ups amend that commit. The history reads as the list of things that shipped.
- **Screenshots are real.** Scaffold the app, run it, photograph it — never a mockup, never an
  edited image. 2560×1600 PNG (1280×800 at 2×), under 1 MB.
- **Facts only in listings.** Taglines, descriptions and `listing.provides` describe what the
  app actually does after the playbook is done — nothing aspirational.
