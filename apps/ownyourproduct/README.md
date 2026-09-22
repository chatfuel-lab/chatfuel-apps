# OwnYourProduct

A beauty salon's booking business under your own name: set-up in five steps, Instagram comments answered with your real prices, team levels and money — scaffolded into your repository.

```sh
npx @chatfuel/wizard --app ownyourproduct
```

Modules: `bookings` (calendar, services, staff), `contacts`, `knowledge-base`, `automations`, `livechat` (the inbox), `channels` (Instagram, WhatsApp, the web widget), `auth` (accounts) and `admin` — the four product screens ship in this app's overlay under `src/modules/`.

- **Set-up** (`src/modules/salon-onboarding/`): business, specialities, services, hours and team in five steps, in Spanish, Portuguese or English. Services come pre-filled per speciality with prices anchored to the salon's country; publishing writes them into Bookings and the Knowledge Base, and running set-up again updates instead of duplicating.
- **Comment Studio** (`src/modules/comment-studio/`): one keyword rule on Instagram post comments — a fixed public reply under the comment and a Direct quoting the prices from the Knowledge Base. No AI, no per-message cost; texts per language ready to edit.
- **Team** (`src/modules/equipo/`): owner, manager and specialist levels on top of the auth module, invitations by e-mail, a specialist linked to her column in Bookings. Migration `supabase/app-migrations/0019_staff_access.sql`.
- **Money** (`src/modules/money/`): revenue by service, specialist and client per period, next to expenses and supplies, with a CSV export — computed from the bookings themselves. Migration `supabase/app-migrations/0030_money.sql`.
- **Mail** (`server/mail/`): the staff invitation e-mail, sent through Resend.
- **Theme** (`src/theme/salon.css`): the product's palette over the toolkit's tokens, light and dark, one import line away (playbook step 1).
- All strings live in each module's copy file (`screen-copy.ts`, `prepare-copy.ts`, `copy.ts`), never inline.

Adds one npm dependency, `libphonenumber-js` (pure JS, no install scripts), to validate the salon's contact phone per country.

See [`playbook.md`](playbook.md) for the build plan the wizard hands to your coding agent — registering the modules, applying the two migrations, mounting the mail route — and [`listing.md`](listing.md) for the catalog copy.
