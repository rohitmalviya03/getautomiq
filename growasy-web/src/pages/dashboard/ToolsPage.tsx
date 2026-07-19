import { useMemo, useState } from 'react';
import { Calculator, Check, Copy, Hash, Sparkles, Wand2 } from 'lucide-react';
import { PageTransition } from '@/components/ui/PageTransition';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Label } from '@/components/ui/Input';
import { useToast } from '@/components/ui/toast-context';
import { generateHashtags } from '@/lib/tools/hashtags';
import { CAPTION_TONES, generateCaptions, type CaptionTone } from '@/lib/tools/captions';
import { computeEngagement, type EngagementRating } from '@/lib/tools/engagement';

type ToolTab = 'hashtags' | 'captions' | 'engagement';

const TABS: { id: ToolTab; label: string; icon: typeof Hash }[] = [
  { id: 'hashtags', label: 'Hashtag generator', icon: Hash },
  { id: 'captions', label: 'Caption generator', icon: Wand2 },
  { id: 'engagement', label: 'Engagement rate', icon: Calculator },
];

export function ToolsPage() {
  const [tab, setTab] = useState<ToolTab>('hashtags');

  return (
    <PageTransition>
      <div className="mx-auto max-w-4xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Free tools</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Handy creator tools — generate hashtags &amp; captions and check your engagement rate.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`focus-ring inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                tab === id
                  ? 'bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>

        {tab === 'hashtags' ? <HashtagTool /> : null}
        {tab === 'captions' ? <CaptionTool /> : null}
        {tab === 'engagement' ? <EngagementTool /> : null}
      </div>
    </PageTransition>
  );
}

/** Small hook: copy text to clipboard with a transient "copied" flag + toast fallback. */
function useCopy() {
  const { showToast } = useToast();
  const [copied, setCopied] = useState<string | null>(null);
  const copy = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied((c) => (c === key ? null : c)), 1500);
    } catch {
      showToast({ title: 'Copy failed — copy it manually', variant: 'error' });
    }
  };
  return { copied, copy };
}

function HashtagTool() {
  const [input, setInput] = useState('');
  const [submitted, setSubmitted] = useState('');
  const { copied, copy } = useCopy();
  const result = useMemo(() => generateHashtags(submitted), [submitted]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Hashtag generator</CardTitle>
        <CardDescription>
          Enter a topic or a few keywords. We mix broad, niche, and long-tail tags so your posts
          get discovered and stay rankable.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            setSubmitted(input);
          }}
        >
          <Input
            placeholder="e.g. coffee, morning routine, cafe"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            aria-label="Hashtag keywords"
          />
          <Button type="submit">
            <Sparkles className="mr-1.5 h-4 w-4" /> Generate
          </Button>
        </form>

        {result.groups.length > 0 ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {result.all.length} hashtags
              </p>
              <button
                type="button"
                onClick={() => copy(result.all.join(' '), 'all')}
                className="focus-ring inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm font-medium text-brand-600 hover:text-brand-700 dark:text-brand-300"
              >
                {copied === 'all' ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                {copied === 'all' ? 'Copied all' : 'Copy all'}
              </button>
            </div>
            {result.groups.map((group) => (
              <div key={group.bucket}>
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                  {group.label}
                </p>
                <p className="mb-2 text-xs text-slate-400">{group.hint}</p>
                <div className="flex flex-wrap gap-1.5">
                  {group.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-md bg-brand-50 px-2 py-1 text-sm text-brand-700 dark:bg-brand-950 dark:text-brand-300"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : submitted ? (
          <p className="text-sm text-slate-400">Add a couple of real words to generate hashtags.</p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function CaptionTool() {
  const [topic, setTopic] = useState('');
  const [tone, setTone] = useState<CaptionTone>('casual');
  const [emojis, setEmojis] = useState(true);
  const [cta, setCta] = useState(true);
  const [hashtags, setHashtags] = useState(false);
  const [captions, setCaptions] = useState<string[]>([]);
  const { copied, copy } = useCopy();

  const generate = () => setCaptions(generateCaptions({ topic, tone, emojis, cta, hashtags }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Caption generator</CardTitle>
        <CardDescription>
          Describe your post and pick a tone — get a few ready-to-tweak caption ideas.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label htmlFor="caption-topic">What&apos;s the post about?</Label>
          <Input
            id="caption-topic"
            placeholder="new coffee blend launch"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="caption-tone">Tone</Label>
          <select
            id="caption-tone"
            value={tone}
            onChange={(e) => setTone(e.target.value as CaptionTone)}
            className="focus-ring w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
          >
            {CAPTION_TONES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-wrap gap-4">
          <Toggle label="Emojis" checked={emojis} onChange={setEmojis} />
          <Toggle label="Call-to-action" checked={cta} onChange={setCta} />
          <Toggle label="Hashtags" checked={hashtags} onChange={setHashtags} />
        </div>
        <Button onClick={generate} disabled={!topic.trim()}>
          <Sparkles className="mr-1.5 h-4 w-4" /> Generate captions
        </Button>

        {captions.length > 0 ? (
          <div className="space-y-3">
            {captions.map((caption, i) => (
              <div
                key={i}
                className="rounded-lg border border-slate-200 p-3 dark:border-slate-700"
              >
                <p className="whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-200">
                  {caption}
                </p>
                <button
                  type="button"
                  onClick={() => copy(caption, `cap-${i}`)}
                  className="focus-ring mt-2 inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-brand-600 hover:text-brand-700 dark:text-brand-300"
                >
                  {copied === `cap-${i}` ? (
                    <Check className="h-3.5 w-3.5 text-green-500" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                  {copied === `cap-${i}` ? 'Copied' : 'Copy'}
                </button>
              </div>
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function EngagementTool() {
  const [followers, setFollowers] = useState('');
  const [likes, setLikes] = useState('');
  const [comments, setComments] = useState('');

  const result = useMemo(
    () =>
      computeEngagement({
        followers: Number(followers),
        avgLikes: Number(likes),
        avgComments: Number(comments),
      }),
    [followers, likes, comments],
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Engagement rate calculator</CardTitle>
        <CardDescription>
          Engagement rate = (avg likes + avg comments) ÷ followers × 100. Enter your averages to
          see how you stack up.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <Label htmlFor="er-followers">Followers</Label>
            <Input
              id="er-followers"
              type="number"
              min={0}
              inputMode="numeric"
              placeholder="10000"
              value={followers}
              onChange={(e) => setFollowers(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="er-likes">Avg likes / post</Label>
            <Input
              id="er-likes"
              type="number"
              min={0}
              inputMode="numeric"
              placeholder="350"
              value={likes}
              onChange={(e) => setLikes(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="er-comments">Avg comments / post</Label>
            <Input
              id="er-comments"
              type="number"
              min={0}
              inputMode="numeric"
              placeholder="20"
              value={comments}
              onChange={(e) => setComments(e.target.value)}
            />
          </div>
        </div>

        {result ? (
          <div className={`rounded-xl border p-4 ${RATING_STYLES[result.rating]}`}>
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="text-4xl font-bold">{result.rate}%</p>
                <p className="text-sm font-medium">{result.label}</p>
              </div>
              <p className="text-right text-xs opacity-80">
                {result.interactionsPerPost.toLocaleString()} interactions / post
              </p>
            </div>
            <p className="mt-3 text-sm opacity-90">{result.summary}</p>
          </div>
        ) : (
          <p className="text-sm text-slate-400">Enter your follower count to calculate.</p>
        )}
      </CardContent>
    </Card>
  );
}

const RATING_STYLES: Record<EngagementRating, string> = {
  low: 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200',
  average:
    'border-slate-200 bg-slate-50 text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100',
  good: 'border-brand-200 bg-brand-50 text-brand-900 dark:border-brand-900 dark:bg-brand-950 dark:text-brand-200',
  excellent:
    'border-green-200 bg-green-50 text-green-900 dark:border-green-900 dark:bg-green-950 dark:text-green-200',
};

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
      />
      {label}
    </label>
  );
}
