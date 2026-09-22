export const intents = [
  { id: 'buy', name: 'Покупка', color: '#4265ed', rgb: '66,101,237' },
  { id: 'book', name: 'Запись', color: '#39a993', rgb: '57,169,147' },
  { id: 'question', name: 'Вопрос', color: '#9b88da', rgb: '155,136,218' },
  { id: 'support', name: 'Проблема', color: '#ee8791', rgb: '238,135,145' },
  { id: 'partner', name: 'Партнёрство', color: '#dba349', rgb: '219,163,73' },
  { id: 'noise', name: 'Шум', color: '#97a2b9', rgb: '151,162,185' },
];

export const businesses = [
  {
    id: 'shop', name: 'Nook Studio', kind: 'Мебель', initial: 'N', color: '#4265ed',
    context: 'A furniture shop selling sofas, tables and lighting through Instagram. Delivery and payment are handled by the shop.',
    items: ['the olive sofa', 'the oak dining table', 'the linen armchair', 'the curved bookcase', 'the reading lamp', 'the walnut desk', 'the modular sofa', 'the round coffee table'],
    messages: {
      buy: [
        'If {item} fits through a 75cm doorway, we can take it {day}.',
        'Can {item} arrive before our guests come {day}? That is the only thing holding us back.',
        'We have cleared a space for {item}. Can you send the payment link?',
        'Two of {item}, same address. Can you include assembly {day}?',
        'Does {item} come apart for the stairs? Our building has no lift and we need it {day}.',
        'Is {item} still in stock? I would like to buy it {day}.',
      ],
      book: ['Could we see {item} in your showroom {day}?', 'Can I book a consultation about {item} {day}?', 'I want to try {item} in person. Are you open {day}?'],
      question: ['What fabric is used on {item}? We have a cat.', 'How does {item} look next to dark oak flooring?', 'Could you show the back of {item}? Still comparing options.', 'Would {item} work in a room with very little daylight?'],
      support: ['Order {order}: {item} arrived damaged. I need someone to sort this out {day}.', 'I paid for {item} but the payment went through twice. Order {order}.', 'The delivery window for {item} passed. Nobody has contacted us. Order {order}.', 'Can you explain the return terms for {item}? The finish is different from the photos.'],
      partner: ['I am an interior designer specifying {item} for a project. Do you have trade terms?', 'We photograph home interiors. Would you lend us {item} for a shoot {day}?'],
      noise: ['Promote {item} to 50k followers. DM us for our growth package!', 'Amazing {item} 🔥🔥', 'Hi dear, we offer the best Instagram marketing services.'],
    },
  },
  {
    id: 'studio', name: 'Luna Pilates', kind: 'Студия', initial: 'L', color: '#9b88da',
    context: 'A Pilates studio with introductory sessions, group classes and memberships. Do not make medical recommendations.',
    items: ['the beginner class', 'the evening reformer class', 'the private session', 'the weekend group', 'the introductory session', 'the lunchtime class', 'the small-group session', 'the morning class'],
    messages: {
      buy: ['Can my partner use the same membership for {item}? If yes, send the link.', 'I tried {item} last week. I am ready for the monthly plan.', 'Do you take company wellness credit for {item}? That is all I need to know before joining.', 'Can I buy five sessions of {item} and start {day}?'],
      book: ['I can leave work early {day}. Any space in {item}?', 'Is there somewhere to leave a stroller during {item}? I can come {day}.', 'I have never done Pilates. Can I book {item} {day}?', 'My friend and I can both come {day}. Any two spots in {item}?', 'Is parking nearby? I would like to make it to {item} {day}.'],
      question: ['What is the difference between {item} and a private lesson?', 'How much experience do I need for {item}? Just exploring.', 'What should I wear to {item}? I am comparing a few studios.', 'How many people usually attend {item}?'],
      support: ['My membership was charged twice after {item}. Can someone check receipt {order}?', 'I hurt my back during {item} and need to talk to a member of your team.', 'I cancelled {item} but still received a no-show charge. Reference {order}.', 'The door was locked when I arrived for {item} {day}.'],
      partner: ['Our company wants a wellness partnership around {item}. Who should I speak to?', 'I teach mobility classes. Could we run {item} together {day}?'],
      noise: ['Love the vibe in {item} ✨', 'We sell fitness followers. Guaranteed growth for your studio.', 'Great content! Keep going 💪'],
    },
  },
  {
    id: 'homes', name: 'Harbor Homes', kind: 'Недвижимость', initial: 'H', color: '#39a993',
    context: 'A real-estate agency handling property questions, viewings and listings. A human handles contracts, payments and complaints.',
    items: ['the Riverside apartment', 'the loft on Park Street', 'the two-bedroom in North End', 'the garden flat', 'the Harbour View listing', 'the townhouse near the station', 'the duplex on Oak Road', 'the furnished studio'],
    messages: {
      buy: ['Does {item} allow a small dog? Our lease ends {day} and we have the deposit ready.', 'We already have mortgage approval for {item}. Can you send the next steps?', 'Would the owner accept a 12-month lease for {item}? We can transfer the deposit {day}.', 'I want to buy {item}. Can we speak {day}?'],
      book: ['Can we see {item} after work {day}?', 'My flight lands {day}. Could someone show me {item} then?', 'Is {item} step-free? I can bring my parents to see it {day}.', 'I would like to book a viewing for {item} {day}.'],
      question: ['What are the monthly charges for {item}? We are still comparing areas.', 'How noisy is the road outside {item}?', 'Is there fibre internet at {item}? Just gathering details.', 'What schools are near {item}? We may move next year.'],
      support: ['I transferred the deposit for {item}, reference {order}, and nobody has confirmed it.', 'The contract for {item} has a different rent than the listing. Please call me.', 'I waited outside {item} for 40 minutes {day} and no agent arrived.', 'Please remove my personal documents from the application for {item}. Reference {order}.'],
      partner: ['I manage relocation for a company. Can we work together on listings like {item}?', 'I own a property similar to {item} and need an agent. Who can help?'],
      noise: ['Dream place 😍 {item} is beautiful.', 'We can get your property page to 100k followers.', 'Manifesting a home like {item} one day ✨'],
    },
  },
  {
    id: 'saas', name: 'Flowdesk', kind: 'SaaS', initial: 'F', color: '#dba349',
    context: 'A B2B workflow SaaS for agencies. Prospects ask about integrations and purchasing. Existing customers report account, billing and integration issues.',
    items: ['the Instagram integration', 'the team inbox', 'the agency plan', 'the client portal', 'the reporting module', 'the white-label option', 'the WhatsApp integration', 'the automation builder'],
    messages: {
      buy: ['Can {item} use our own domain? We already have three clients waiting for this.', 'Does {item} support separate client workspaces? We could roll it out {day}.', 'We tested {item} and want to upgrade. Where is the payment link?', 'Can we pay for {item} by invoice? Our finance team closes the budget {day}.', 'We are replacing our current tool {day}. Will {item} handle 20 client accounts?'],
      book: ['Could you show our team {item} in a demo {day}?', 'Can I book 20 minutes to discuss {item} {day}?', 'Our developer has questions about {item}. Can we have a call {day}?'],
      question: ['Does {item} work with HubSpot? Researching tools for next quarter.', 'How is {item} different from the standard plan?', 'Where can I read about the API for {item}?', 'Is there a usage limit for {item}? Still mapping the requirements.'],
      support: ['{item} stopped working for all our clients. We have campaigns running right now. Ticket {order}.', 'I cannot access {item} after the renewal. Our account reference is {order}.', 'We were billed twice for {item}. Can a person review invoice {order}?', 'A client can see another workspace in {item}. Please escalate this now.'],
      partner: ['We implement {item} for clients. Do you have a reseller program?', 'We are building a connector for {item}. Could we discuss a partnership {day}?'],
      noise: ['Nice launch for {item} 🚀', 'Get unlimited leads with our growth service!', 'Follow back? We love automation.'],
    },
  },
];

const names = ['Alex', 'Maya', 'Sam', 'Priya', 'Luca', 'Sofia', 'Daniel', 'Nina', 'Ben', 'Ana', 'Omar', 'Emma', 'Leo', 'Zoe', 'Theo', 'Mila', 'Ravi', 'Ella', 'Noah', 'Lara', 'Ilya', 'Tara', 'Max', 'Ines'];
const days = ['today', 'tomorrow morning', 'this Friday', 'next Monday', 'this weekend', 'before Thursday', 'next week', 'on the 28th'];
const greetings = ['', 'Hi! ', 'Hey, ', 'Hello! ', 'Just saw your post. ', 'Quick question: ', 'Hi there, ', 'Saw your story — '];

export const keywordPattern = /\b(buy|book|price|cost|purchase|order|booking|pay|payment|deposit|upgrade|confirm|join|viewing|appointment)\b/i;
export const readinessLabels = ['Вне покупки', 'Присматривается', 'Сравнивает', 'Готов к шагу', 'Готов оформить'];
export const laneNames = ['Следующий шаг', 'Уточнить запрос', 'Передать человеку', 'Вне продаж'];
export const laneColors = ['#4265ed', '#9b88da', '#ee8791', '#97a2b9'];

function seeded(seed) {
  return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
}

export function createCorpus() {
  const random = seeded(8149);
  const out = [];
  for (let b = 0; b < businesses.length; b++) {
    const business = businesses[b];
    for (let i = 0; i < 256; i++) {
      const bucket = i % 32;
      const intent = bucket < 9 ? 'buy' : bucket < 15 ? 'book' : bucket < 23 ? 'question' : bucket < 28 ? 'support' : bucket < 30 ? 'partner' : 'noise';
      const variants = business.messages[intent];
      const variant = Math.floor(random() * variants.length);
      const template = variants[variant];
      const day = days[Math.floor(random() * days.length)];
      const item = business.items[Math.floor(random() * business.items.length)];
      const text = greetings[i % greetings.length] + template.replaceAll('{item}', item).replaceAll('{day}', day).replaceAll('{order}', `#${21000 + b * 300 + i}`);
      const ambiguous = i % 9 === 0 && intent !== 'noise';
      const confidence = +(ambiguous ? .38 + random() * .26 : .72 + random() * .25).toFixed(2);
      const top = ambiguous ? .46 + random() * .15 : .79 + random() * .17;
      const alternative = intent === 'buy' ? 'question' : intent === 'book' ? 'buy' : intent === 'support' ? 'question' : 'buy';
      const probabilities = Object.fromEntries(intents.map(x => [x.id, x.id === intent ? top : x.id === alternative ? (1 - top) * .8 : (1 - top) * .05]));
      const ready = intent === 'buy' ? (variant % 3 === 0 ? 4 : 3) : intent === 'book' ? 3 : intent === 'question' ? (i % 3 === 0 ? 2 : 1) : 0;
      const urgency = +Math.min(.98, /today|tomorrow|now|stopped|twice|deposit|documents|another workspace/i.test(text) ? .78 + random() * .2 : .05 + random() * .62).toFixed(2);
      const review = intent === 'support' ? .93 : ambiguous ? .62 : intent === 'partner' ? .55 : .08;
      const scoreProbabilities = Object.fromEntries(readinessLabels.map((_, n) => [n, n === ready ? .82 : .045]));
      out.push({
        id: `dm-${String(out.length + 1).padStart(4, '0')}`, name: names[(i + b * 3) % names.length], business: business.id,
        channel: i % 3 === 0 ? 'WhatsApp' : 'Instagram', hour: `${String(8 + i % 12).padStart(2, '0')}:${String((i * 7) % 60).padStart(2, '0')}`,
        text, source: 'fixture', hidden: ready >= 3 && !keywordPattern.test(text), ambiguous,
        answers: { intent: { type: 'choice', choice: intent, probabilities, confidence }, readiness: { type: 'score', score: ready, confidence: .84, probabilities: scoreProbabilities }, urgent: { type: 'noul', noul: urgency }, needs_human: { type: 'noul', noul: review } },
        seed: random(), seed2: random(),
      });
    }
  }
  return out;
}

export function routeMessage(item, threshold) {
  const a = item.answers;
  if (a.intent.confidence < threshold || a.needs_human.noul >= .65 || a.intent.choice === 'support') return 2;
  if (['noise', 'partner'].includes(a.intent.choice)) return 3;
  if (a.readiness.score >= 3) return 0;
  return 1;
}

export const corpus = createCorpus();
