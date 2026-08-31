/**
 * The product's one data shape: a comment-reply rule. A rule watches incoming
 * Instagram post comments and answers twice at most — once publicly under the
 * comment, once privately in the commenter's DMs.
 *
 * `DEFAULT_RULES` is the app's voice on first launch — edit the strings here,
 * not inline in components. Storage is localStorage for now; the build plan
 * (playbook.md in the catalog) replaces `loadRules`/`saveRules` with the
 * Chatfuel API without the components changing.
 */

export type RuleTrigger = 'all' | 'keywords';

export interface ReplyAction {
  enabled: boolean;
  text: string;
}

export interface CommentRule {
  id: string;
  name: string;
  enabled: boolean;
  trigger: RuleTrigger;
  /** Only read when `trigger` is 'keywords'. */
  keywords: string[];
  /** Public reply, threaded under the comment for everyone to see. */
  publicReply: ReplyAction;
  /** Private reply, sent to the commenter's Instagram DMs. */
  privateReply: ReplyAction;
}

export const DEFAULT_RULES: readonly CommentRule[] = [
  {
    id: 'thank-everyone',
    name: 'Thank every comment',
    enabled: true,
    trigger: 'all',
    keywords: [],
    publicReply: {
      enabled: true,
      text: 'Thank you! 💜 We read every comment — if you have a question, ask away.',
    },
    privateReply: { enabled: false, text: '' },
  },
  {
    id: 'price-questions',
    name: 'Price questions → DM',
    enabled: true,
    trigger: 'keywords',
    keywords: ['price', 'how much', 'cost', 'order', 'buy'],
    publicReply: {
      enabled: true,
      text: 'Great question — just sent the details to your DMs 📩',
    },
    privateReply: {
      enabled: true,
      text: 'Hi! Here is everything about pricing and how to order. Reply here and a human picks the conversation up.',
    },
  },
  {
    id: 'support',
    name: 'Support requests',
    enabled: true,
    trigger: 'keywords',
    keywords: ['help', 'refund', 'broken', 'not working'],
    publicReply: { enabled: true, text: 'Sorry about that — check your DMs, we are on it.' },
    privateReply: {
      enabled: true,
      text: 'Sorry for the trouble! Tell us what happened and we will sort it out right here.',
    },
  },
];

const storageKey = (botId: string): string => `instagram-comments.rules.${botId}`;

export function loadRules(botId: string): CommentRule[] {
  try {
    const raw = localStorage.getItem(storageKey(botId));
    if (raw) return JSON.parse(raw) as CommentRule[];
  } catch {
    // Corrupt or unavailable storage reads as "first launch".
  }
  return DEFAULT_RULES.map((rule) => ({ ...rule }));
}

export function saveRules(botId: string, rules: readonly CommentRule[]): void {
  try {
    localStorage.setItem(storageKey(botId), JSON.stringify(rules));
  } catch {
    // Storage full or blocked: the session keeps working in memory.
  }
}

export function newRule(): CommentRule {
  return {
    id: `rule-${Date.now().toString(36)}`,
    name: 'New rule',
    enabled: false,
    trigger: 'keywords',
    keywords: [],
    publicReply: { enabled: true, text: '' },
    privateReply: { enabled: false, text: '' },
  };
}

/** One line under the rule's name in the list: what makes it fire. */
export function triggerSummary(rule: CommentRule): string {
  if (rule.trigger === 'all') return 'Every comment';
  if (rule.keywords.length === 0) return 'No keywords yet';
  return rule.keywords.join(' · ');
}
