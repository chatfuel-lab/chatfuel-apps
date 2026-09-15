# Inbox Analytics

Inbound vs outbound message volume over time across every channel, and a zip export of every conversation.

```sh
npx @chatfuel/wizard --app inbox-analytics
```

Modules: `auth` (accounts) and `channels` (connecting WhatsApp, Instagram, TikTok, Facebook pages and the web widget) — the product itself ships in this app's overlay.

- **Overview**: one chart of inbound vs outbound messages per minute, hour, day, week or month in any time zone; tiles for active and new conversations, messages per conversation, median first-response and response time, the automation's share of replies; breakdowns by channel, sender, hour and weekday, and the most active conversations. Every figure prints the window it was measured over.
- **Export**: every conversation in the window as a zip built in the browser — `conversations/<channel>-<contact id>.json` and `.txt` transcript per conversation, `contacts.csv`, `manifest.json`.
- **Sync**: Chatfuel has no export and no message analytics, so the app crawls the inbox into your own Supabase project. The server half is `vendor/chatfuel-proxy/inboxAnalytics.ts` (routes plus a chunked crawler behind the same auth gate as everything else) and `supabase/migrations/0030_chatfuel_inbox_analytics.sql` (the `cf_ia_*` tables and functions). A sync runs while the page is open and resumes from its bookmark when pressed again.
- All strings live in `src/modules/inbox-analytics/copy.ts`, never inline.

Adds one npm dependency, `fflate` (pure JS, no install scripts), to zip in the browser.

See [`playbook.md`](playbook.md) for the build plan the wizard hands to your coding agent — registering the module, applying the migration, mounting the routes — and [`listing.md`](listing.md) for the catalog copy.
