const stopWords = new Set('a an the i me my we our you your it its this that these those is are was were be been to of for from in on at and or but with without can could would should please hi hello hey thanks thank question quick team let know take look really very have has had do does did not now just more some any about there here how what when where why all so as if then than through get need want appreciate help send details better saved time simpler way use find information sharing discussing great happened morning again let know much'.split(' '));
export const phraseTokens = text => String(text).toLocaleLowerCase().match(/[\p{L}\p{N}]+(?:['’][\p{L}]+)?/gu) || [];
export const findRepeatedTopics = (messages, limit = 6) => {
  const candidates = new Map();
  for (const message of messages) {
    const tokens = phraseTokens(message.text), found = new Set();
    for (let size = 2; size <= 4; size++) for (let i = 0; i <= tokens.length - size; i++) {
      const words = tokens.slice(i, i + size);
      if (stopWords.has(words[0]) || stopWords.has(words.at(-1)) || words.filter(word => !stopWords.has(word) && word.length > 2).length < 2) continue;
      found.add(words.join(' '));
    }
    for (const phrase of found) {
      if (!candidates.has(phrase)) candidates.set(phrase, { phrase, ids: [] });
      candidates.get(phrase).ids.push(message.id);
    }
  }
  const ranked = [...candidates.values()].filter(item => item.ids.length >= 2).sort((a, b) => b.ids.length * Math.sqrt(b.phrase.split(' ').length) - a.ids.length * Math.sqrt(a.phrase.split(' ').length));
  const selected = [];
  for (const candidate of ranked) {
    const ids = new Set(candidate.ids);
    if (selected.some(item => item.ids.filter(id => ids.has(id)).length / Math.min(item.ids.length, ids.size) > .8)) continue;
    selected.push({ ...candidate, label: candidate.phrase[0].toUpperCase() + candidate.phrase.slice(1), count: ids.size });
    if (selected.length >= limit) break;
  }
  return selected;
};
export const evidenceSummary = (all, selected, excluded = new Set()) => {
  const kept = selected.filter(message => !excluded.has(message.id));
  return { total: all.length, analyzed: all.filter(message => message.source === 'live' || message.source === 'recorded').length, selected: kept.length, excluded: selected.length - kept.length, ids: kept.map(message => message.id) };
};
export const createFinding = ({ question, title, action, messages, scope, excluded = new Set(), provenance }) => {
  if (!title.trim()) throw new Error('Write an observation first.');
  const summary = evidenceSummary(scope, messages, excluded);
  if (!summary.selected) throw new Error('Keep at least one message as evidence.');
  return { version: 1, createdAt: new Date().toISOString(), question, observation: title.trim().slice(0, 2000), nextAction: action.trim().slice(0, 2000), provenance, coverage: summary,
    evidence: messages.filter(message => !excluded.has(message.id)).map(message => ({ id: message.id, sourceId: message.sourceId || message.id, text: message.text, context: message.context || '', channel: message.channel, timestamp: message.timestamp || null, conversationId: message.conversationId || null, classificationSource: message.source, reviewedCategory: message.reviewedCategory || null })) };
};
export const normalizeMetadata = value => {
  const read = (...keys) => {
    for (const key of keys) if (value[key] !== undefined && value[key] !== null) {
      if (!['string', 'number'].includes(typeof value[key])) throw new Error(`${key} must be text or a number.`);
      const text = String(value[key]).trim();
      if (text.length > 256) throw new Error(`${key} is too long.`);
      return text;
    }
    return '';
  };
  const rawDate = read('timestamp', 'sentTime', 'created_at', 'date');
  const parsedDate = rawDate && /T|^\d{4}-\d\d-\d\d/.test(rawDate) ? Date.parse(rawDate) : NaN;
  return { sourceId: read('sourceId', 'id', 'message_id'), authorId: read('authorId', 'author_id', 'sender_id'), conversationId: read('conversationId', 'conversation_id', 'thread_id', 'post_id'), timestamp: Number.isFinite(parsedDate) ? new Date(parsedDate).toISOString() : null };
};
