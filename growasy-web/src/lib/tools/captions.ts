/**
 * Client-side caption generator. Builds a few caption variations from templated
 * hook/body/CTA fragments chosen by tone — deterministic per (topic, options) so
 * the same inputs give stable output. Purely local; no AI call.
 */

export type CaptionTone = 'casual' | 'professional' | 'funny' | 'inspirational';

export interface CaptionOptions {
  topic: string;
  tone: CaptionTone;
  emojis: boolean;
  cta: boolean;
  hashtags: boolean;
}

export const CAPTION_TONES: { value: CaptionTone; label: string }[] = [
  { value: 'casual', label: 'Casual' },
  { value: 'professional', label: 'Professional' },
  { value: 'funny', label: 'Funny' },
  { value: 'inspirational', label: 'Inspirational' },
];

const HOOKS: Record<CaptionTone, string[]> = {
  casual: ['Okay but {topic} though 👀', 'Just here vibing with {topic}.', 'A little {topic} to brighten your feed.'],
  professional: [
    'Here’s what we’ve learned about {topic}.',
    'Let’s talk {topic}.',
    'Our take on {topic}, in one post.',
  ],
  funny: ['Nobody:\nMe: {topic} 😅', 'POV: it’s {topic} o’clock again.', 'Warning: excessive {topic} ahead.'],
  inspirational: [
    'Every day is a new chance for {topic}.',
    'Believe in the power of {topic}.',
    'Small steps in {topic} lead to big change.',
  ],
};

const BODIES: Record<CaptionTone, string[]> = {
  casual: ['Honestly can’t get enough. What do you think?', 'Saving this one for later — you should too.'],
  professional: [
    'Consistency beats intensity every single time.',
    'The details are what set the great apart from the good.',
  ],
  funny: ['No regrets. Okay, maybe one.', 'Send help (and snacks).'],
  inspirational: [
    'Keep showing up — future you is watching.',
    'Progress, not perfection. That’s the whole secret.',
  ],
};

const CTAS: Record<CaptionTone, string> = {
  casual: 'Drop a 💜 if you agree!',
  professional: 'Follow for more insights like this.',
  funny: 'Tag someone who needed to see this 👇',
  inspirational: 'Save this as your reminder for today. ✨',
};

const TONE_EMOJIS: Record<CaptionTone, string[]> = {
  casual: ['✨', '💜', '🙌'],
  professional: ['📈', '✅', '💡'],
  funny: ['😂', '🤪', '🙈'],
  inspirational: ['🌟', '🔥', '💪'],
};

function topicSlug(topic: string): string {
  return topic.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function fill(template: string, topic: string): string {
  return template.replace(/\{topic\}/g, topic);
}

/** Returns up to 3 caption variations for the given options. */
export function generateCaptions(opts: CaptionOptions): string[] {
  const topic = opts.topic.trim();
  if (!topic) return [];

  const hooks = HOOKS[opts.tone];
  const bodies = BODIES[opts.tone];
  const emojis = TONE_EMOJIS[opts.tone];
  const slug = topicSlug(topic);
  const tags = opts.hashtags && slug ? `\n\n#${slug} #${slug}gram #instagood #reels` : '';

  const count = Math.min(3, hooks.length);
  const captions: string[] = [];
  for (let i = 0; i < count; i++) {
    let hook = fill(hooks[i], topic);
    const body = fill(bodies[i % bodies.length], topic);
    if (opts.emojis) hook = `${hook} ${emojis[i % emojis.length]}`;
    const parts = [hook, body];
    if (opts.cta) parts.push(CTAS[opts.tone]);
    captions.push(`${parts.join('\n\n')}${tags}`);
  }
  return captions;
}
