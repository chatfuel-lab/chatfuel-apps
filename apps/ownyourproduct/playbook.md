# Build plan: OwnYourProduct, salon playbook

The scaffold you are in is the OwnYourProduct preset, salon playbook: a beauty salon's day on
Chatfuel — bookings, clients, a knowledge base, and Comment Studio, which
answers every Instagram comment with buying intent with a fixed public reply
and a fixed Direct carrying the salon's prices (no AI, no usage cost). The
salon's own modules (Bookings, Contacts, Knowledge Base, Automations, Channels,
Auth, Admin) are the wizard's; the overlay adds `src/modules/salon-onboarding/`
(Set-up, the one-sitting setup), `src/modules/comment-studio/` and
`src/modules/equipo/` (team levels) and `src/modules/money/` (Money), plus
two app migrations under `supabase/app-migrations/`.

Every user-facing string of Comment Studio lives in
`src/modules/comment-studio/screen-copy.ts` (Spanish, English, Portuguese);
the bot's generated texts live in `src/modules/comment-studio/prefill.ts`.
Set-up's strings live in `src/modules/salon-onboarding/prepare-copy.ts`, its
service presets in `service-presets.ts` and the price anchors per country in
`price-anchors.ts`. Edit copy there, never inline in components. The default
keyword lists per language are in `comment-studio-model.ts`.

The screen follows the browser's language and remembers the choice made in
its ES / PT / EN switch. The labels quoted below are the Spanish ones: pick ES
in the switch before verifying.

Work through the steps in order and verify each before the next.

## 1. Register the Comment Studio and Set-up modules

The wizard generates `src/modules/index.ts` from the modules it installed, so
the overlay could not add to it (wizard-owned). You can:

1. In `src/modules/index.ts`: import `moduleDescriptor as salonOnboarding`
   from `./salon-onboarding` and `moduleDescriptor as commentStudio` from
   `./comment-studio`; put them FIRST in `MODULES`, Set-up before Comment
   Studio. The shell sends `/` to the first rail module, so a new salon lands
   on Set-up and, once set up, one tap away from Comment Studio.
2. In `src/modules/navGroups.tsx`: add `'salon-onboarding'` to the `crm`
   group, before `'bookings'`, and `'comment-studio'` to the `ai` group,
   before `'automations'`.

Verify: `npm run check` passes, `/` redirects to `/salon-onboarding`, and with
ES selected the screen renders "Tu negocio" with a "Continuar" button;
`/comment-studio` renders the header "Comment Studio" with the status tag
"Apagado" and the language switch ES / PT / EN.

## 2. Run the modules' tests and the typecheck

The overlay ships its own tests: Comment Studio's write plan, runner contract,
read-back and generated texts; Set-up's publish plan, its idempotent runner
and a white-screen guard for each screen. Set-up needs `libphonenumber-js`,
which the manifest declares and the wizard installs.

Verify: `npx vitest run src/modules/comment-studio src/modules/salon-onboarding`
reports every test passed, and `npm run check` is clean.

## 3. Set a salon up with Set-up

Sign in and open `/salon-onboarding`. Enter the business (name, country,
phone, address), pick the specialities, keep or edit the suggested services
and prices, set the week's hours and the team, review, press "Guardar y
empezar".

Verify: Bookings shows the services with their prices and durations and one
specialist per person entered, each performing every service, with the week's
hours; the Knowledge Base shows the company name, phone, address, business
hours and a cancellation rule in the additional instructions; Bookings settings
show appointment confirmation switched on. Pressing "Guardar y empezar" again
creates nothing twice.

## 4. Team levels: apply the app migration and register Team

The overlay ships `supabase/app-migrations/0019_staff_access.sql`: two levels
of staff access on the auth module's own tables. A Manager is an admin; a
Specialist is a member linked to exactly one Bookings specialist. Apply it to
the app's Supabase project after the auth migrations (dashboard SQL editor, or
`supabase db query -f supabase/app-migrations/0019_staff_access.sql` with the
project linked). It replaces `cf_create_invite`, `cf_change_member_role`,
`cf_list_members`, `cf_list_invites`, `cf_my_membership` and `cf_my_workspace`
with supersets that keep every column and argument the auth module uses.

Then register the module: import `moduleDescriptor as equipo` from
`./equipo` into `MODULES` and add `'equipo'` to the `crm` group after
`'bookings'`.

Verify: `/equipo` lists the members with the owner tagged "Dueña", a manager
can invite "ana@salon.cl" as a Specialist linked to a Bookings specialist and
copy the invitation link, and the auth module's Team page still opens and
still lists the same people.

## 5. Specialists see only their own calendar

`cf_my_workspace` now returns `specialist_id` for a member. In the bookings
module, when the signed-in membership carries a `specialist_id`, preselect
that specialist in the calendar and the appointments list and hide the
specialist switcher (a small change in `BookingsApp`, the wizard's file: it is
yours to edit). Server side, the proxy must refuse booking mutations for
another specialist when the caller's membership is a specialist: resolve the
caller's `specialist_id` from `cf_my_workspace`, and reject `BookingCreate`,
`BookingUpdate` and `BookingCancel` whose `specialistId` (or the booking's
current specialist) differs from it.

Verify: sign in as the invited specialist; the calendar opens on her column
and the switcher is gone; a manager still sees every column.

## 6. Connect Instagram and turn Comment Studio on

Sign in, connect the salon's Instagram account in Channels, enter two or
three services with prices in the Knowledge Base, then open Comment Studio:
the Direct card shows a message quoting those services in the chosen
language, and the Instagram notice is gone. Press "Encender".

Verify: in Automations, the Instagram post-comments source has a rule named
"Comment Studio · preguntas de precio y hora" that is enabled, with the keyword
filter, the public reply and the private reply as exact text; the Instagram
Direct, link-in-bio and story sources are off; back in Comment Studio the tag
reads "Activo". Comment "precio?" on a post from another account: the public
reply lands under the comment and the Direct arrives.

## 7. Money: apply the app migration and register Money

The overlay ships `supabase/app-migrations/0030_money.sql`: two tables next
to the auth schema, expenses and supply purchases, readable and writable by
the salon's managers only (row-level security through `cf_members`), never
deleted, only marked. Earnings are not stored: the Money screen reads
Bookings through the API and bills the service price of every booking that
was not cancelled or missed. Apply the migration after 0019, then import
`moduleDescriptor as money` from `./money` into `MODULES` and add `'money'`
to the `crm` group after `'equipo'`.

Verify: `/money` shows the overview for "Mes actual" with revenue that
matches the sum of the non-cancelled bookings' service prices in Bookings for
the same month; an expense added on the "Gastos" tab lowers "Ganancia neta"
by its amount and appears in the CSV download; a specialist signed in sees
only the "managers only" notice.

## 8. Mail: recovery through Supabase, invitations through Resend

Sign-in, verification and recovery e-mails are the auth module's and come from
Supabase Auth; point its SMTP at Resend in the Supabase dashboard (Auth →
SMTP settings) so they carry the salon's sender instead of Supabase's.

The invitation a manager sends from Team is the one mail the app sends
itself. The overlay ships `server/mail/` (the mailer, the es/en/pt templates,
the per-address brake and `staff-invite.mjs`, the seam). Mount a route
`POST /api/mail/staff-invite` behind the auth gate: it reads the caller's
tenant, builds the link from the invite token on the server (never from the
body), and calls `createStaffInviteMailer().send(...)`. Set `RESEND_API_KEY`
and `AGENDA_MAIL_FROM` server-side; without them the mailer logs and Team
keeps showing the link to copy.

Verify: `npx vitest run server/mail` passes; with the route mounted and the
key set, an invitation from Team arrives in the mailbox with the salon's
name and a link that opens the app's invite page.

## 9. Sign-up lands in Set-up

A new salon that signs up through the auth module gets its bot from the
wizard's sign-up flow and is sent to `/`, which step 1 made Set-up. Keep it
that way: the first minute must be "your services, your hours, done", not a
tour of seven modules.

Verify: sign up with a fresh e-mail; the first screen is Set-up on "Tu
negocio".

## Out of scope

- No AI conversation: Comment Studio writes fixed texts only. The AI Booking
  add-on (the product's "full" mode) is a later app version.
- No post picker of its own: choosing specific posts happens in Automations,
  in the rule Comment Studio owns; the screen only shows how many are chosen
  and never overwrites that choice.
- No ads, no WhatsApp, no marketplace: Instagram ad comments belong to a
  separate Ads app and are never touched here.
- No extra server routes: bookings, clients and the knowledge base are the
  toolkit's own. The two app migrations add staff levels and the salon's
  spending next to the auth schema; the product's records store and the
  operator lifecycle (deleting a salon safely) are not part of this app.
