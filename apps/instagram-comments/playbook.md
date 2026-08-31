# Build plan: Comments for Instagram

The scaffold you are in is the "Comments for Instagram" preset — a micro-SaaS
for one job: every Instagram post comment gets an instant reply. A reply is
one or both of: a public reply threaded under the comment, and a private reply
in the commenter's DMs. Rules decide which comments fire which reply — a rule
matches every comment or a keyword list.

The product's UI already exists in this scaffold: the overlay shipped
`src/modules/comments/` (rules list + editor). Its default rules and every
user-facing string live in `src/modules/comments/rules.ts` — edit copy there,
never inline in components.

This app installs no other product modules on purpose. Keep it that way: no
inbox, no flow builder, no contacts. The auth module handles accounts.

Work through the steps in order and verify each before the next.

## 1. Register the comments module

The wizard generates `src/modules/index.ts` from the modules it installed, so
the overlay could not add to it (wizard-owned). You can. Register the module:

1. In `src/modules/index.ts`: import `moduleDescriptor` from `./comments` and
   add it to `MODULES`.
2. In `src/modules/navGroups.tsx`: add a group with id `comments`, title
   `Comments`, and items `['comments']`.

Then brand the chrome: in `src/vendor/ui/shell/NavRail.tsx` (the app's own
vendored copy — yours to edit), give the ACTIVE rail item the same Instagram
gradient the comments module uses (`linear-gradient(45deg, #f9ce34 0%,
#ee2a7b 55%, #6228d7 100%)` as an inline background) with white icon, in
place of the `bg-accent-soft text-accent` classes.

Verify: the app compiles, the rail shows the Instagram icon (gradient when
active), `/comments` renders three default rules with the editor on the right.

## 2. Persist rules through the Chatfuel bot

`loadRules`/`saveRules` in `src/modules/comments/rules.ts` are localStorage
placeholders. Replace their internals with per-bot persistence through the
Chatfuel API (the components must not change — the store is the seam). Use
the chatfuel-core skill for API access patterns; the bot's attributes are the
natural home for a JSON blob this size.

Verify: edit a rule, reload the page — the change survives; a second browser
sees it.

## 3. Apply the rules to the bot

Make the rules real: configure the bot's Instagram comment behavior from the
saved rules — the public reply text and the private reply text per rule, with
keyword conditions. Instagram must be connected to the bot in the Chatfuel
panel first; when it is not, show the existing empty-state pattern with a link
to the panel's Instagram connection page instead of failing silently.

Verify: comment on a post from a test account; the public reply lands under
the comment, and the private reply arrives in DMs.

## 4. Sign-up lands in the product

The auth module gives every account its own bot. After sign-up, the first
screen must be `/comments` with the three default rules already in place —
seeded from `DEFAULT_RULES` on first load, which step 2's store already does.

Verify: a fresh account signs up and sees the rules screen without touching
anything.

## Out of scope

Billing, DM campaigns, comment analytics, other channels. This preset is
Instagram comments only; keep it that way unless the user asks.
