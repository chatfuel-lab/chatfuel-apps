# Build plan: Inbox Analytics

The scaffold you are in is the "Inbox Analytics" preset — a micro-SaaS for
one job: know what the inbox is doing, and be able to take it with you.
Chatfuel has no message analytics and no conversation export, so this app
crawls the inbox into the deployment's own Supabase project and computes
everything from there: inbound vs outbound messages per minute, hour, day,
week or month, summary figures, and a zip of every conversation.

The product already exists in this scaffold, in three parts the overlay
shipped:

- `src/modules/inbox-analytics/` — the UI (overview with the chart, tiles and
  breakdowns; the export). Every user-facing string lives in
  `src/modules/inbox-analytics/copy.ts` — edit copy there, never inline.
- `vendor/chatfuel-proxy/inboxAnalytics.ts` — the server half: the routes the
  UI calls and the crawler that reads Chatfuel with the deployment's token.
- `supabase/migrations/0030_chatfuel_inbox_analytics.sql` — the tables and the
  `cf_ia_*` functions the routes call.

The `channels` module handles connecting WhatsApp, Instagram, TikTok, Facebook
pages and the web widget; the `auth` module handles accounts. This app installs
no other product modules on purpose — no inbox UI, no flow builder.

Use the `chatfuel-core` skill for API patterns (`references/cors-proxy.md`,
`references/pagination.md`), `chatfuel-auth` for the gate and the RPC contract,
and `chatfuel-channels` for what the Channels page does. Work through the steps
in order and verify each before the next.

## 1. Register the module, first in the rail

The wizard generates `src/modules/index.ts` and `src/modules/navGroups.tsx`
(wizard-owned), so the overlay could not touch them. You can:

1. In `src/modules/index.ts`: import `moduleDescriptor as inboxAnalytics` from
   `./inbox-analytics` and put it **first** in `MODULES`. The app lands on the
   first rail module after sign-in, and this one is the product.
2. In `src/modules/navGroups.tsx`: add a group `{ id: 'analytics', title:
   'Analytics', icon: <IconChat />, items: ['inbox-analytics'] }` above the
   `settings` group (import `IconChat` from `~ui`). `channels` stays under
   Settings.

Verify: `npm run check` passes; `npm run dev` opens on `/inbox-analytics`
showing the "Set up the sync routes" screen; the rail shows Analytics above
Settings.

## 2. Apply the database migration

The wizard applies only the modules' own migrations, and it did so before the
overlay landed — so `supabase/migrations/0030_chatfuel_inbox_analytics.sql`
is on disk and not yet in the project. Apply it the way the auth guide
describes for a manual migration: paste it into the SQL editor of the project
in `VITE_SUPABASE_URL` (Dashboard → SQL), or POST it to the Management API
(`POST https://api.supabase.com/v1/projects/<ref>/database/query` with a
personal access token). It is idempotent; re-running it is safe. Add a line
for it to `supabase/README.md` beside the auth migration.

Verify: in the SQL editor,
`select count(*) from public.cf_ia_migrations` returns 1 and
`select count(*) from pg_proc where proname like 'cf_ia_%'` returns 17.

## 3. Mount the routes in the vendored proxy

Three edits under `vendor/chatfuel-proxy/`, each mirroring what the publishing
queue already does — search for `publishingQueueRoute` and add the inbox
analytics twin beside every hit:

1. `proxyConfig.ts`:
   - in `ChatfuelProxyOptions`, next to `publishingPath?: string`, add
     `inboxAnalyticsPath?: string;`
   - in `ResolvedProxyConfig`, next to `publishingPath: string`, add
     `inboxAnalyticsPath: string;`, and next to `publishingQueueRoute:
     boolean`, add `inboxAnalyticsRoute: boolean;`
   - in `resolveProxyConfig`, where `publishingQueueRoute` is computed, add
     `const inboxAnalyticsRoute = authMode === 'on' && Boolean(auth?.serviceRoleKey);`
     and in the returned object, next to `publishingPath: options.publishingPath
     ?? '/chatfuel/publishing'`, add `inboxAnalyticsPath:
     options.inboxAnalyticsPath ?? '/chatfuel/inbox-analytics'` and
     `inboxAnalyticsRoute`.
   - in `describeAuthMode`, add `'inboxAnalyticsRoute'` to the `Pick<…>` of
     its `config` parameter (next to `'publishingQueueRoute'`), and after the
     `publish queue routes mounted` fragment add
     `${config.inboxAnalyticsRoute ? ', inbox analytics routes mounted' : ''}`.
2. `core.ts`: import `handleInboxAnalytics` from `./inboxAnalytics.js`
   (the `.js` extension matters — Vercel transpiles these files one by one),
   add `inboxAnalyticsPath` to the `const { httpPath, apiPath, … } = config`
   destructuring, and add this branch to `matchRoute` after the publishing
   block:

   ```ts
   if (config.inboxAnalyticsRoute && (pathname === inboxAnalyticsPath || pathname.startsWith(`${inboxAnalyticsPath}/`))) {
     return (req, res) => settle(res, handleInboxAnalytics(ctx, req, res, pathname));
   }
   ```

3. `supabaseRpc.ts`: add the app's refusal codes to `RPC_REFUSAL_CODES`:

   ```ts
   // Inbox Analytics' own refusals, raised by the cf_ia_* functions.
   sync_busy: 'SyncBusy',
   sync_not_found: 'SyncNotFound',
   bad_bucket: 'BadRange',
   bad_tz: 'BadRange',
   bad_range: 'BadRange',
   range_too_wide: 'BadRange',
   bad_rows: 'InvalidRequest',
   bad_mode: 'InvalidRequest',
   bad_phase: 'InvalidRequest',
   bad_state: 'InvalidRequest',
   ```

Verify: `npm run check` passes; the dev server's startup line ends with
"inbox analytics routes mounted";
`curl -s "http://localhost:5173/chatfuel/inbox-analytics/status?botID=x"`
answers a JSON envelope with code `AuthSessionRequired` — not the app's HTML.

## 4. Connect a channel and run the first sync

Sign up, open `/channels` and connect at least one channel (the WhatsApp,
Instagram and TikTok hand-offs need an `https://` origin — on `npm run dev`,
use a bot that already has a channel connected in Chatfuel). Back on
`/inbox-analytics`, press **Sync now**. The crawl runs in chunks while the
page is open: contacts first, then every conversation newest-first, stored
through `cf_ia_messages_upsert`.

Verify: the sync card moves through "Listing contacts" → "Reading
conversations" → "Done"; the status route reports messages > 0; in SQL,
`select direction, count(*) from public.cf_ia_messages group by 1` shows
`in` and `out` rows and `select count(*) from public.cf_ia_messages where
message_type = 'SystemTypingMessage'` is 0.

## 5. Verify the analytics

Pick "7 days" with the day bucket, then "Today" with the hour bucket, then
"12 months" with the month bucket; switch the time zone.

Verify: the chart's legend totals equal the Messages tile's inbound and
outbound; "Show as table" lists the same numbers as the chart; every tile
and card prints its coverage line; changing the zone moves the busiest-hour
bar accordingly; a window with no messages shows the empty state rather than
zeros pretending to be facts.

## 6. Verify the export

Open Export with "30 days" and press **Download zip**.

Verify: the zip contains `manifest.json`, `contacts.csv`, and one `.json` and
one `.txt` per conversation under `conversations/`; the row count of
`contacts.csv` equals the Active conversations tile; `manifest.json`'s
`counts.messages` equals the window's total including system messages; a
transcript reads `[YYYY-MM-DD HH:mm:ss] Name: text` in the chosen zone.

## 7. Incremental sync

Send a test message to the bot from a connected channel, then press **Sync
now** again.

Verify: the run finishes after a handful of requests (`requestsMade` on the
sync card stays small), the new message appears in the series for "Today",
and `messagesUpserted` counts only the new rows.

## 8. Sign-up lands in the product

The auth module gives every account its own bot. After sign-up the first
screen must be `/inbox-analytics`.

Verify: a fresh account sees the overview with the "No channels connected
yet" state and its button opens `/channels`.

## Out of scope

Scheduled or cron-driven sync (a sync runs while the page is open, and the
UI says so — the publishing module's `pg_cron` pattern is the model if the
user asks), media files in the zip, per-operator SLA and staffing reports, an
inbox or reply UI, deleting messages upstream, anything the API cannot see
(read receipts, CSAT). Note that `npx @chatfuel/wizard update` will list the
three proxy files edited in step 3 as conflicts — re-apply that step after an
update.
