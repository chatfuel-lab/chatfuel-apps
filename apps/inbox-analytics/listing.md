## What is the inbox actually doing?

Chatfuel answers every message but keeps no count of them, and it has no export: there is no chart of how many people wrote on Monday versus Friday, no way to see whether the automation or a human did the answering, and no button that hands you the conversations as files. This app is that count and that button.

## One chart, honest numbers

The overview draws inbound and outbound messages on one axis, per minute, hour, day, week or month, in the time zone you pick. Beside it: active and new conversations, messages per conversation, the median time to a first reply, the automation's share of every answer, the busiest hours and weekdays, the channels that carry the traffic, and the ten conversations with the most messages. Every figure prints the window it was measured over, and a figure with nothing behind it shows a dash rather than a zero.

## Everything, exported

Pick a window and download a zip: one JSON file and one readable transcript per conversation, a CSV index of the contacts, and a manifest that says what the archive covers. The zip is assembled in your browser from your own database — nothing leaves the deployment.

## Yours to run

The wizard scaffolds the full source into your repository. The message history lives in your Supabase project, filled by a crawler that reads the inbox in bounded chunks while the page is open and resumes where it stopped. The overview is plain React in src/modules/inbox-analytics, the crawler is one TypeScript file in the vendored proxy, and your coding agent gets a step-by-step build plan that applies the migration and mounts the routes in the first session. Channels connect from the Channels page; accounts come from the auth module.
