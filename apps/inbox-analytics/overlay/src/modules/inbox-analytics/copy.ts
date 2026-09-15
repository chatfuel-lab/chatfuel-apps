/**
 * Every user-facing string of the module, and the presets the toolbar offers.
 * Edit copy here, never inline in components.
 */
import type { Bucket, Direction, SenderType } from './types';

export const APP_VERSION = '1.0.0';

export type RangePreset = 'today' | '24h' | '7d' | '30d' | '90d' | '12m' | 'custom';

export const RANGE_PRESETS: readonly { value: RangePreset; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: '24h', label: '24 hours' },
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
  { value: '90d', label: '90 days' },
  { value: '12m', label: '12 months' },
  { value: 'custom', label: 'Custom' },
];

export const BUCKET_LABELS: Record<Bucket, string> = {
  minute: 'Minute',
  hour: 'Hour',
  day: 'Day',
  week: 'Week',
  month: 'Month',
};

export const DIRECTION_LABELS: Record<Direction, string> = {
  in: 'Inbound',
  out: 'Outbound',
  system: 'System',
};

export const SENDER_LABELS: Record<SenderType, string> = {
  contact: 'Contact',
  admin: 'Operator',
  automation: 'Automation',
  app: 'Platform app',
  system: 'System',
};

export const PLATFORM_LABELS: Record<string, string> = {
  whatsapp: 'WhatsApp',
  instagram: 'Instagram',
  facebook: 'Facebook',
  tiktok: 'TikTok',
  widget: 'Web widget',
  unknown: 'Unknown',
};

export const WEEKDAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export const COPY = {
  title: 'Inbox Analytics',
  views: { overview: 'Overview', export: 'Export' },
  toolbar: {
    range: 'Range',
    bucket: 'Bucket',
    timezone: 'Time zone',
    from: 'From',
    to: 'To',
  },
  sync: {
    title: 'Sync',
    never: 'Never synced',
    lastSynced: 'Last synced',
    syncNow: 'Sync now',
    continueRun: 'Continue',
    cancel: 'Cancel',
    resync: 'Full re-sync',
    running: 'Syncing…',
    phase: {
      idle: 'Idle',
      contacts: 'Listing contacts',
      messages: 'Reading conversations',
      done: 'Done',
      cancelled: 'Cancelled',
      failed: 'Failed',
    },
    stored: (messages: number, conversations: number) =>
      `${messages.toLocaleString()} messages across ${conversations.toLocaleString()} conversations stored`,
    progressLabel: 'Sync progress',
    counters: (done: number, queued: number, messages: number) =>
      `${done.toLocaleString()} of ${queued.toLocaleString()} conversations read · ${messages.toLocaleString()} messages this run`,
    tabNote: 'A sync runs while this page is open. Close the tab and it pauses; press Sync again to pick it up.',
    resyncTitle: 'Read everything again?',
    resyncBody:
      'A full re-sync reads every conversation from the start. Stored messages are kept and updated; this costs one request per hundred messages.',
    resyncConfirm: 'Re-sync everything',
    busy: 'A sync is already running for this bot.',
    failedPrefix: 'The last sync failed:',
    toastDone: (messages: number) => `Sync finished — ${messages.toLocaleString()} messages stored this run`,
    toastCancelled: 'Sync cancelled',
    toastFailed: 'Sync failed',
  },
  danger: {
    title: 'Stored data',
    description: 'Everything this app keeps for this bot lives in your Supabase project. Delete it to start over.',
    purge: 'Delete stored data',
    purgeTitle: 'Delete every stored message?',
    purgeBody: 'The analytics and the export go blank until the next sync. Nothing changes in Chatfuel.',
    purgeConfirm: 'Delete',
    toastPurged: 'Stored data deleted',
  },
  setup: {
    title: 'Set up the sync routes',
    description:
      'This app keeps message history in your Supabase project, and the routes that fill it are not answering yet. The build plan (playbook) walks through the three steps.',
    steps: [
      'Turn the auth gate on: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY in the environment.',
      'Apply supabase/migrations/0030_chatfuel_inbox_analytics.sql to the project.',
      'Mount the routes in vendor/chatfuel-proxy (core.ts, proxyConfig.ts, supabaseRpc.ts) and restart.',
    ],
    retry: 'Check again',
  },
  channels: {
    title: 'No channels connected yet',
    description:
      'Connect WhatsApp, Instagram, TikTok, a Facebook page or the web widget, and the inbox has something to count.',
    action: 'Connect a channel',
  },
  empty: {
    noData: 'Nothing synced yet',
    noDataDescription:
      'Press Sync now to read the inbox into your database. Every figure on this page is computed from what is stored.',
    noWindow: 'No messages in this window',
    noWindowDescription: 'Widen the range, or sync again if the inbox has moved on since the last run.',
    error: 'Could not load',
    retry: 'Try again',
  },
  chart: {
    title: 'Messages over time',
    tableToggle: 'Show as table',
    chartToggle: 'Show as chart',
    ariaLabel: (inbound: number, outbound: number, range: string) =>
      `Inbound and outbound messages over time: ${inbound.toLocaleString()} inbound and ${outbound.toLocaleString()} outbound, ${range}`,
    columns: { bucket: 'Bucket', in: 'Inbound', out: 'Outbound', total: 'Total' },
  },
  tiles: {
    total: 'Messages',
    inbound: 'Inbound',
    outbound: 'Outbound',
    conversations: 'Active conversations',
    newConversations: 'New conversations',
    perConversation: 'Messages per conversation',
    firstResponse: 'Median first response',
    response: 'Median response',
    automationShare: 'Answered by automation',
    ofOutbound: 'of outbound messages',
    sample: (n: number) => `over ${n.toLocaleString()} ${n === 1 ? 'reply' : 'replies'}`,
    noReplies: 'no replies in this window',
    firstEver: 'first message ever in this window',
  },
  breakdown: {
    platforms: 'By channel',
    platformsDescription: 'Inbound and outbound messages per connected channel.',
    senders: 'Outbound by sender',
    sendersDescription: 'Who answered: the automation, a human operator, or the business from the platform app.',
    hours: 'Busiest hours',
    hoursDescription: 'Messages by hour of the day, in the selected time zone.',
    weekdays: 'Busiest weekdays',
    weekdaysDescription: 'Messages by weekday, in the selected time zone.',
    top: 'Most active conversations',
    topDescription: 'The ten conversations with the most messages in this window.',
    topColumns: { name: 'Contact', platform: 'Channel', in: 'In', out: 'Out', last: 'Last message' },
    unnamed: 'Unnamed contact',
    peak: (label: string) => `Peak: ${label}`,
    noMessages: 'No messages',
  },
  coverage: {
    line: (messages: number, range: string, tz: string) =>
      `over ${messages.toLocaleString()} ${messages === 1 ? 'message' : 'messages'} · ${range} · ${tz}`,
    staleWindow: (syncedAt: string) => `Stored history ends at ${syncedAt}; the window reaches past it.`,
  },
  export: {
    title: 'Export conversations',
    description:
      'Every conversation with a message in the window, as a zip built in your browser: one JSON and one transcript per conversation, a contacts index and a manifest.',
    contents: [
      'conversations/<channel>-<contact id>.json — every stored message with time, direction, sender and text',
      'conversations/<channel>-<contact id>.txt — the same as a readable transcript',
      'contacts.csv — one row per conversation: id, channel, name, message count, first and last message',
      'manifest.json — the window, the time zone, the counts and when the export was made',
    ],
    counts: (conversations: number, messages: number) =>
      `${conversations.toLocaleString()} conversations · ${messages.toLocaleString()} messages in this window`,
    download: 'Download zip',
    building: 'Building the zip…',
    fetching: (fetched: number, total: number) =>
      `Fetching messages: ${fetched.toLocaleString()} of ${total.toLocaleString()}`,
    progressLabel: 'Export progress',
    largeWarning: (messages: number) =>
      `${messages.toLocaleString()} messages is a large export; the zip is assembled in memory. Narrow the window if the browser struggles.`,
    nothing: 'Nothing to export in this window',
    fileName: (from: string, to: string) => `inbox-export-${from}-${to}.zip`,
    toastDone: (conversations: number) => `Exported ${conversations.toLocaleString()} conversations`,
    toastFailed: 'Export failed',
    mediaNote:
      'Media files are not included: Chatfuel keeps contact uploads for thirty days and the export carries text only.',
  },
  transcript: {
    operator: 'Operator',
    automation: 'Automation',
    app: (platform: string) => `${PLATFORM_LABELS[platform] ?? platform} app`,
    system: 'system',
    contact: 'Contact',
  },
  csv: {
    columns: ['id', 'platform', 'name', 'messages', 'first_message_at', 'last_message_at'],
  },
} as const;

export const platformLabel = (platform: string): string => PLATFORM_LABELS[platform] ?? platform;
