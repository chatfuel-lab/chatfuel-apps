# Build plan: Signal Lab

Signal Lab is a configurable message-classification app with an animated 10,000-scenario playground. Its shared UI lives in `public/signal-lab/`, the host module in `src/modules/signal-lab/`, and the optional TypeSafe adapter in `server/signal-lab/`. The demo works without a provider key or customer data.

## 1. Register the app

Run `node scripts/install-signal-lab.mjs` from the scaffold root. The idempotent script registers the module and navigation, adds the two read-only inbox GraphQL operations, installs the Vite and Node API handlers, and adds the Vercel rewrite. It checks the scaffold structure before writing. Do not replace wizard-owned files with copies from elsewhere.

The preset selects `auth`, `channels` and `livechat`. Their vendored API supplies `ChatListDocument`, `ConversationMessagesDocument` and the shared chat filters. The Signal Lab iframe uses the host's base path and remounts when the selected bot changes. Its same-origin message bridge receives the host client; it does not receive account tokens.

Verify: run the setup script twice, then `npm run check` and `npm run build`. Open `/signal-lab`. The generated map starts with 10,000 points. Imported data uses Source, Category and the configured flag label as grouping dimensions.

## 2. Check the demo and local workspace

The default playground is generated locally with scripted category labels. It makes zero provider requests. The Rules & data workbench also includes 128 synthetic messages with actual recorded Jev responses. Keep these provenance labels accurate and visible. Play stream and Video view show a vertical column of three or four persistent message cards. Slides take 550ms every 1.6 seconds; 1×/10×/50× accelerates the particles independently. Keyboard focus pauses the slide without detaching the focused card. Streams follow source/group/topic/text filters; inspecting a message exits Video view and pauses playback. Playback never represents provider throughput.

Use Categories & rules to define categories and questions. The main map supports source filtering, evidence search, exclusions, manual category corrections, repeated-phrase candidates and finding export. Candidates are lexical suggestions; using them as categories requires a fresh explicit analysis. Manual corrections preserve model provenance and do not count as analysis. Import JSON/CSV or paste messages. They stay unclassified until analyzed with the matching configuration. Changing the questions invalidates previous results; changing labels, colors or routing thresholds reuses valid results. Use the map's dataset toggle to visualize the current workspace. Importing another dataset requires confirmation before replacement.

Verify: test regrouping, message inspection, exclusion-aware finding export and list-to-workbench navigation. Import two messages, including literal HTML text. They appear as pending and the HTML does not execute.

## 3. Enable optional live analysis

Set `TYPESAFE_API_KEY` on the server, alongside the SDK's existing `CHATFUEL_TOKEN`. Never use a `VITE_` prefix or put either secret in the client. No key is shipped with this app. Follow the scaffold's auth guide before deploying: the adapter rejects ungated analysis outside localhost and uses SDK admission plus the selected bot's workspace fence.

The browser prompts before every run and submits only selected messages, their context, and the classifier to `https://api.typesafe.ai/v1/systemone`. Batches are limited to five messages, request bodies to 64 KiB, concurrent analysis requests to two, and caches are isolated by admitted workspace/bot. Provider errors leave messages pending. Imports never trigger analysis automatically.

Verify: with no provider key, demo and import work and live analysis is unavailable. With configured authentication and a key, analyze one invented message after consent. Reject the consent prompt once and verify that no request is sent. Confirm a different workspace's bot is rejected. Do not use real customer data for setup tests.

## 4. Preview a connected inbox

Select a bot in the SDK shell and connect a WhatsApp or Instagram channel through Channels. Open Use your messages → Preview recent inbox messages. The importer reads incoming text from up to ten recent conversations and twenty messages per conversation. It does not send replies, change read markers, read all account history, or claim to export every Instagram comment. For each selected message, it preserves available IDs, timestamp and up to five preceding text turns. Outgoing turns are marked Business; incoming turns are marked Contact. The preview states the bounded scope. Confirm Open dataset to replace the current local workspace, then explicitly choose messages for analysis.

Verify: with a fixture client, only the two query operations run; no mutation is called. With no channel or incoming text, an actionable empty state appears. Switching bots creates a new iframe and discards the previous in-memory workspace.

## 5. Verify hosting and prepare the listing

The setup script wires Vite development, the Node production server, and Vercel. The isolated static UI at `/signal-lab/index.html` allows same-origin framing; the rest of the SDK keeps its existing frame restrictions. Preserve the SDK's authentication and server token proxy. For sub-path hosting, use matching `VITE_BASE_PATH` and `BASE_PATH`; adjust Vercel rewrite/header prefixes if deploying under a sub-path.

Run `npm run build && npm start` and verify the iframe renders in production. For focused adapter regression tests, copy `tests/signal-routes.test.ts` from the catalog app into `server/signal-lab/` and run `npx vitest run server/signal-lab/signal-routes.test.ts`. The tests use generated messages and a mocked provider.

The UI files in the overlay are built from the shared Signal Lab product. Edit the source product and run `npm run build:sdk` to regenerate them. Do not hand-edit both copies. Capture real scaffold screenshots and run the catalog's `npm run validate` before submission. Keep the manifest draft until accepted for publication.

Verify: catalog validation, SDK type-check/build and focused adapter tests pass; desktop and mobile have no horizontal overflow. No keys, customer data, dependencies or build output are included in the preset.

## Out of scope

- Continuous background inbox synchronization, exhaustive account-history export, training on customer data, and automatic replies.
- Unverified export of Instagram post comments outside the conversation API.
- Claims that generated scenarios are real customers, replay speed is measured model performance, or model confidence is a sales probability.
- Automatic public deployment, catalog publication or sending the package to another person.
