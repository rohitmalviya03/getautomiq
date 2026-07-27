import { type ComponentType } from 'react';
import { Calculator, Hash, Wand2, type LucideIcon } from 'lucide-react';
import { HashtagTool, CaptionTool, EngagementTool } from '@/components/tools/tool-widgets';

export interface ToolMeta {
  slug: string;
  /** H1 / display name. */
  name: string;
  shortName: string;
  icon: LucideIcon;
  /** <title> and meta description for SEO. */
  metaTitle: string;
  metaDescription: string;
  /** One-liner shown on the hub card. */
  tagline: string;
  /** Intro paragraph above the tool. */
  intro: string;
  Widget: ComponentType;
  faqs: { q: string; a: string }[];
}

export const TOOLS: ToolMeta[] = [
  {
    slug: 'instagram-hashtag-generator',
    name: 'Instagram Hashtag Generator',
    shortName: 'Hashtag Generator',
    icon: Hash,
    metaTitle: 'Free Instagram Hashtag Generator — Find the Best Hashtags | Automiq',
    metaDescription:
      'Generate the best Instagram hashtags for any topic in seconds. Free tool that mixes broad, niche and long-tail hashtags to grow your reach. No login required.',
    tagline: 'Turn any topic into a balanced set of reach + niche hashtags.',
    intro:
      'Paste a topic or a few keywords and get a ready-to-post mix of broad, niche, and long-tail Instagram hashtags — built to get discovered on the Explore page while staying rankable in smaller tags. 100% free, no sign-up needed.',
    Widget: HashtagTool,
    faqs: [
      {
        q: 'How many hashtags should I use on Instagram?',
        a: 'Instagram allows up to 30, but a focused mix of 8–20 relevant tags usually performs best. This generator gives you a balanced set across reach, niche and long-tail so you are not relying only on mega-tags.',
      },
      {
        q: 'How do I find the best hashtags for my niche?',
        a: 'Start with 2–4 keywords that describe your post and audience. The tool expands them with proven hashtag patterns and popular tags, then groups them by competition level so you can pick the right blend.',
      },
      {
        q: 'Is this Instagram hashtag generator free?',
        a: 'Yes — completely free and no login required. Generate as many hashtag sets as you like and copy them with one click.',
      },
    ],
  },
  {
    slug: 'instagram-caption-generator',
    name: 'Instagram Caption Generator',
    shortName: 'Caption Generator',
    icon: Wand2,
    metaTitle: 'Free Instagram Caption Generator — Scroll-Stopping Captions | Automiq',
    metaDescription:
      'Write better Instagram captions in seconds. Pick a tone, toggle emojis, CTAs and hashtags, and get ready-to-post caption ideas. Free, no login required.',
    tagline: 'Pick a tone and get scroll-stopping caption ideas instantly.',
    intro:
      'Describe your post, choose a tone, and get a handful of ready-to-tweak Instagram captions with optional emojis, a call-to-action, and hashtags. Great for beating writer’s block on posts, reels and stories — free and no sign-up.',
    Widget: CaptionTool,
    faqs: [
      {
        q: 'How do I write a good Instagram caption?',
        a: 'Open with a hook in the first line, keep the middle valuable or relatable, and end with a clear call-to-action. This generator structures every caption that way so you just tweak the wording.',
      },
      {
        q: 'What is the best Instagram caption length?',
        a: 'It depends on the goal — punchy one-liners work for reels, while stories and carousels can go longer. The tool gives you concise, editable drafts you can expand or trim.',
      },
      {
        q: 'Is the caption generator free to use?',
        a: 'Yes, it’s free with no login. Generate multiple caption variations, then copy the one you like.',
      },
    ],
  },
  {
    slug: 'engagement-rate-calculator',
    name: 'Instagram Engagement Rate Calculator',
    shortName: 'Engagement Calculator',
    icon: Calculator,
    metaTitle: 'Free Instagram Engagement Rate Calculator | Automiq',
    metaDescription:
      'Calculate your Instagram engagement rate instantly and see how you compare to industry benchmarks. Free tool — just enter your followers, likes and comments.',
    tagline: 'See your engagement rate and how it stacks up to benchmarks.',
    intro:
      'Enter your follower count and average likes and comments to instantly calculate your Instagram engagement rate — and see whether it’s low, average, good, or excellent against real industry benchmarks. Free and private; nothing is stored.',
    Widget: EngagementTool,
    faqs: [
      {
        q: 'What is a good Instagram engagement rate?',
        a: 'Roughly: under 1% is below average, 1–3% is typical, 3–6% is strong, and above 6% is excellent (often on smaller, loyal audiences). The calculator labels your result against these bands.',
      },
      {
        q: 'How is Instagram engagement rate calculated?',
        a: 'The most common formula is (average likes + average comments) ÷ followers × 100. This tool uses exactly that so your number is comparable to industry reports.',
      },
      {
        q: 'Does this store my data?',
        a: 'No. The calculation runs entirely in your browser — your numbers are never sent anywhere or saved.',
      },
    ],
  },
];

export function findTool(slug: string | undefined): ToolMeta | undefined {
  return TOOLS.find((t) => t.slug === slug);
}
