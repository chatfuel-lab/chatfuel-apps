import { expect, test, vi } from 'vitest';
import type { ModuleClient } from '~api';
import { readInboxSample } from './inbox';

test('inbox context preserves speaker roles and only imports incoming text', async () => {
  const node = (id: string, type: string, text: string, sentTime: string) => ({ cursor: id, node: { id, __typename: type, text, sentTime, sender: { id: type.includes('OutText') ? 'business' : 'contact' } } });
  const query = vi.fn().mockResolvedValueOnce({ bot: { contactChatsConnection: { edges: [{ node: { name: 'Test contact', conversation: { id: 'conversation-1', platform: 'Instagram' } } }] } } }).mockResolvedValueOnce({ bot: { conversation: { messages: { edges: [node('reply','InstagramInTextMessage','Too expensive','2026-09-21T10:01:00Z'),node('price','InstagramOutTextMessage','It costs $40','2026-09-21T10:00:00Z')] } } } });
  const result = await readInboxSample({ query } as unknown as ModuleClient, 'bot-1');
  expect(result.messages).toHaveLength(1);
  expect(result.messages[0]).toMatchObject({ text:'Too expensive', context:'Business: It costs $40', sourceId:'reply', authorId:'contact', conversationId:'conversation-1',timestamp:'2026-09-21T10:01:00Z' });
  expect(query.mock.calls[0][1]).toMatchObject({botID:'bot-1',first:10});
  expect(query.mock.calls[1][1]).toEqual({botID:'bot-1',conversationID:'conversation-1',first:20});
});
