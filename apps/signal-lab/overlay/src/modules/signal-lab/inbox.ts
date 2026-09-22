import type { ModuleClient } from '~api';
import { ChatListDocument, ConversationMessagesDocument } from '~api/generated/livechat/graphql';
import { UNFILTERED_CHAT_ARGS } from '~api/domain/livechat';

export const readInboxSample = async (client: ModuleClient, botId: string) => {
  const list = await client.query(ChatListDocument, { botID: botId, first: 10, ...UNFILTERED_CHAT_ARGS });
  const messages: { id: string; name: string; text: string; channel: string; context: string; sourceId: string; authorId: string; conversationId: string; timestamp: string }[] = [];
  const seen = new Set<string>();
  let skipped = 0;
  for (const edge of list.bot?.contactChatsConnection.edges || []) {
    const chat = edge.node;
    if (!chat.conversation?.id) continue;
    const platform = String(chat.conversation.platform).toLowerCase();
    if (!platform.includes('instagram') && !platform.includes('whatsapp')) { skipped++; continue; }
    const result = await client.query(ConversationMessagesDocument, { botID: botId, conversationID: chat.conversation.id, first: 20 });
    const timeline = [...(result.bot?.conversation?.messages.edges || [])].sort((a, b) => Date.parse(a.node.sentTime) - Date.parse(b.node.sentTime));
    for (const [index, entry] of timeline.entries()) {
      const node = entry.node;
      if (node.__typename !== 'InstagramInTextMessage' && node.__typename !== 'WhatsAppInTextMessage') continue;
      if (!('text' in node) || typeof node.text !== 'string' || node.text.trim().length < 3) continue;
      const id = `${chat.conversation.id}:${node.id || entry.cursor}`;
      if (seen.has(id)) continue;
      seen.add(id);
      const context = timeline.slice(Math.max(0, index - 5), index).filter(item => 'text' in item.node && typeof item.node.text === 'string').map(item => `${/^(Instagram|WhatsApp)InTextMessage$/.test(item.node.__typename) ? 'Contact' : 'Business'}: ${'text' in item.node ? String(item.node.text).slice(0, 450) : ''}`).join('\n').slice(0, 3000);
      messages.push({ sourceId: node.id || entry.cursor, authorId: node.sender.id, conversationId: chat.conversation.id, timestamp: node.sentTime, id, name: chat.name || 'Contact', text: node.text.slice(0, 3000), channel: platform.includes('instagram') ? 'Instagram DM' : 'WhatsApp', context });
    }
  }
  return { messages, skipped, note: 'Up to 10 recent conversations, 20 messages each. Incoming text only, with up to 5 preceding text messages as context. No read markers changed.' };
};
