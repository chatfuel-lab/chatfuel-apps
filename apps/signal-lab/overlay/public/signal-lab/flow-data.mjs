export const flowColors = ['#92a8ff', '#ff9cbd', '#76ebc5', '#ffc57c', '#c0a1ff', '#80d8ff'];
export const flowDimensions = {
  topic: ['Accounts', 'Payments', 'Orders', 'Delivery', 'Product', 'Community'],
  urgency: ['Whenever', 'Soon', 'Right now'],
  intent: ['Question', 'Problem', 'Idea', 'Feedback', 'Request', 'Other'],
};
const flowSubjects = [
  ['login link', 'profile settings', 'team invitation', 'password reset', 'email address'],
  ['monthly invoice', 'card payment', 'subscription', 'refund', 'billing address'],
  ['latest order', 'checkout', 'discount code', 'order confirmation', 'shopping cart'],
  ['tracking link', 'delivery window', 'shipping address', 'parcel', 'pickup point'],
  ['mobile app', 'dashboard', 'export', 'new update', 'search feature'],
  ['tutorial', 'live workshop', 'community chat', 'weekly newsletter', 'recording'],
];
const flowNames = ['Alex', 'Maya', 'Jordan', 'Sam', 'Leah', 'Kai', 'Ava', 'Noah', 'Riley', 'Nina', 'Jamie', 'Robin'];
const flowChannels = ['WhatsApp', 'Instagram DM', 'Instagram comment', 'Email'];
export const generateFlowMessages = (count = 10000) => {
  if (!Number.isInteger(count) || count < 0 || count > 50000) throw new Error('Use 0–50,000 demo messages.');
  let seed = 87314;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  return Array.from({ length: count }, (_, index) => {
    const topic = Math.floor(random() * 6), intent = Math.floor(random() * 6);
    const urgency = intent === 1 ? 1 + Math.floor(random() * 2) : random() > .8 ? 1 : 0;
    const subject = flowSubjects[topic][Math.floor(random() * 5)];
    const prefix = ['Hi! ', 'Quick question — ', '', 'Hey team, ', 'Hello, '][Math.floor(random() * 5)];
    const tail = ['Thanks!', 'Could you take a look?', 'I appreciate your help.', 'Let me know.', ''][Math.floor(random() * 5)];
    const text = [
      `Where can I find more information about the ${subject}?`,
      `The ${subject} is not working for me.${urgency === 2 ? ' I am blocked and need help now.' : ' It happened again this morning.'}`,
      `It would be great to have a simpler way to use the ${subject}.`,
      `The ${subject} is so much better now. It saved me time this week.`,
      `Could you send me the details for the ${subject}?`,
      `Sharing this with the team. We were just discussing the ${subject}.`,
    ][intent];
    return { id: `demo-${String(index + 1).padStart(5, '0')}`, name: flowNames[index % flowNames.length], text: `${prefix}${text} ${tail}`.trim(), channel: flowChannels[Math.floor(random() * 4)], topic, intent, urgency, seed: random(), source: 'generated', evidence: 'Generated scenario · scripted labels', originalId: null };
  });
};

export const flowGroups = (messages, dimension, labels = flowDimensions[dimension]) => {
  if (!labels) throw new Error('Unknown map dimension.');
  return labels.map((label, index) => ({ label, index, color: flowColors[index % flowColors.length], count: messages.reduce((n, message) => n + (message[dimension] === index ? 1 : 0), 0) }));
};
