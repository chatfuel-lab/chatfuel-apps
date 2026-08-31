# Comments for Instagram

Fixed and keyword-triggered replies to every Instagram comment — public under the post, private in DMs.

```sh
npx @chatfuel/wizard --app instagram-comments
```

Modules: `auth` (accounts) — the product itself ships in this app's overlay as `src/modules/comments/`.

- One screen: reply rules. A rule fires on every comment or on a keyword list.
- Each rule sends a public reply under the comment, a private reply to the commenter's DMs, or both.
- Three default rules ship ready to edit: thank everyone, price questions → DM, support requests.
- All strings live in `src/modules/comments/rules.ts`, never inline.

See [`playbook.md`](playbook.md) for the build plan the wizard hands to your coding agent, and [`listing.md`](listing.md) for the catalog copy.
