# Contributing

Before it is a pull request, it can be a question. Ask in
[Discussions](https://github.com/chatfuel-lab/chatfuel-apps/discussions) or the Discord:
<https://discord.gg/TmrgcjVqFf>

## Setup

Node 22 or newer (`.nvmrc`).

```bash
npm install
npm run validate
```

The validator is the one gate, and CI runs exactly it (`.github/workflows/ci.yml`): schema,
id/dirname agreement, referenced files, overlay hygiene against the wizard's deny list, and
size caps. There is no typecheck here — an overlay's TypeScript compiles only inside a
scaffolded app, so it is tested by scaffolding
([docs/authoring.md](docs/authoring.md#test-the-app-end-to-end)).

## One commit, one PR

A PR contains **exactly one commit**. Squash before opening. Review feedback is folded into
that same commit — amend and force-push — never stacked on top as fix-up commits. The history
should read as the list of things that shipped, one commit each.

Commit messages carry three things: the problem, the reasoning, what changed.

## What a PR may contain

- **One app per PR.** Changes to `app.schema.json` or `scripts/validate.mjs` get their own PR
  — and the schema is kept byte-identical with the wizard's copy
  ([`packages/module-manifest/app.schema.json`](https://github.com/chatfuel-lab/wizard/blob/main/packages/module-manifest/app.schema.json)),
  so a schema change lands in both repositories together.
- **New `npmDependencies` need a written justification** in the PR description — an app that
  installs a dependency runs that dependency's install scripts on every user's machine.
- **The overlay never touches wizard-owned files** (the validator's deny list). Behavior
  changes to scaffold internals go through the playbook, where the user's agent applies them
  transparently.
- **Screenshots show the actual scaffolded app**, not mockups.

## What may leave the building

Everything here is copied into users' projects: the overlay becomes their source, the playbook
lands verbatim in their instructions. Three rules:

1. **English only** — code, comments, playbooks, listing copy, everything.
2. **Nothing that names what only a maintainer can see** — no internal tooling, environments,
   people, or private repositories.
3. **No credentials, and no unfinished-work markers** — a known gap is either fixed or written
   up as an issue, never left as a comment flag.

## Trust and review

Every catalog change is reviewed by a maintainer before it merges, and the wizard re-enforces
the overlay rules at scaffold time on the user's machine. Planned before third-party
submissions are accepted routinely: pinned per-app revisions, dependency vetting, and overlay
content scanning.
