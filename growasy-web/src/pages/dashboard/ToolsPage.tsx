import { useState } from 'react';
import { Calculator, Hash, Wand2 } from 'lucide-react';
import { PageTransition } from '@/components/ui/PageTransition';
import { HashtagTool, CaptionTool, EngagementTool } from '@/components/tools/tool-widgets';

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
