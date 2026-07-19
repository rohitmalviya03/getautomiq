import { useEffect, useMemo, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Bot, Film, Image as ImageIcon, Instagram, ExternalLink, Zap } from 'lucide-react';
import { PageTransition } from '@/components/ui/PageTransition';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { instagramApi } from '@/lib/instagram-api';
import { automationsApi } from '@/lib/automations-api';
import type { InstagramMedia } from '@/types/api';

export function ContentPage() {
  const navigate = useNavigate();
  const accountsQuery = useQuery({
    queryKey: ['instagram', 'accounts'],
    queryFn: instagramApi.listAccounts,
  });
  const accounts = useMemo(() => accountsQuery.data ?? [], [accountsQuery.data]);
  const connectable = useMemo(
    () => accounts.filter((a) => a.status === 'CONNECTED' || a.status === 'NEEDS_RECONNECT'),
    [accounts],
  );

  const [accountId, setAccountId] = useState('');
  useEffect(() => {
    if (!accountId && connectable.length > 0) setAccountId(connectable[0].id);
  }, [connectable, accountId]);

  const mediaQuery = useQuery({
    queryKey: ['instagram', 'media', accountId],
    queryFn: () => instagramApi.listMedia(accountId),
    enabled: Boolean(accountId),
    staleTime: 5 * 60 * 1000,
  });
  const rulesQuery = useQuery({ queryKey: ['automations', 'rules'], queryFn: () => automationsApi.list() });

  // How many automations already target each post/reel (by mediaId).
  const rulesByMedia = useMemo(() => {
    const map = new Map<string, number>();
    for (const rule of rulesQuery.data ?? []) {
      if (rule.mediaId) map.set(rule.mediaId, (map.get(rule.mediaId) ?? 0) + 1);
    }
    return map;
  }, [rulesQuery.data]);

  const media = mediaQuery.data ?? [];

  const createFor = (m: InstagramMedia) =>
    navigate(
      `/automations?template=comment-to-dm-link&accountId=${encodeURIComponent(
        accountId,
      )}&mediaId=${encodeURIComponent(m.id)}`,
    );

  const isReel = (m: InstagramMedia) => m.mediaProductType === 'REELS' || m.mediaType === 'VIDEO';

  return (
    <PageTransition>
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Content</h1>
            <p className="mt-1 text-slate-500 dark:text-slate-400">
              Pick a post or reel and build an automation that runs on it.
            </p>
          </div>
          {connectable.length > 1 ? (
            <select
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              className="focus-ring rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
            >
              {connectable.map((a) => (
                <option key={a.id} value={a.id}>
                  @{a.username}
                </option>
              ))}
            </select>
          ) : null}
        </div>

        {!accountsQuery.isLoading && connectable.length === 0 ? (
          <EmptyState
            icon={Instagram}
            title="Connect an Instagram account first"
            description="Your posts and reels show up here once an Instagram business account is connected."
            action={
              <Link to="/instagram/accounts">
                <Button>
                  <Instagram className="h-4 w-4" />
                  Go to Instagram accounts
                </Button>
              </Link>
            }
          />
        ) : mediaQuery.isLoading ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
              <Skeleton key={i} className="aspect-square w-full rounded-xl" />
            ))}
          </div>
        ) : mediaQuery.isError ? (
          <EmptyState
            icon={ImageIcon}
            title="Couldn't load your content"
            description="Try syncing this account from the Instagram page, then come back."
          />
        ) : media.length === 0 ? (
          <EmptyState
            icon={ImageIcon}
            title="No posts or reels yet"
            description="Once this account has posts, they'll appear here ready to automate."
          />
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {media.map((m) => {
              const count = rulesByMedia.get(m.id) ?? 0;
              return (
                <Card key={m.id} className="overflow-hidden">
                  <div className="relative aspect-square bg-slate-100 dark:bg-slate-800">
                    {m.thumbnailUrl ? (
                      <img
                        src={m.thumbnailUrl}
                        alt=""
                        loading="lazy"
                        referrerPolicy="no-referrer"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-slate-400">
                        <ImageIcon className="h-8 w-8" />
                      </div>
                    )}
                    <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-md bg-black/60 px-1.5 py-0.5 text-[11px] font-medium text-white">
                      {isReel(m) ? <Film className="h-3 w-3" /> : <ImageIcon className="h-3 w-3" />}
                      {isReel(m) ? 'Reel' : 'Post'}
                    </span>
                    {count > 0 ? (
                      <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-md bg-brand-600 px-1.5 py-0.5 text-[11px] font-medium text-white">
                        <Zap className="h-3 w-3" />
                        {count}
                      </span>
                    ) : null}
                  </div>
                  <CardContent className="space-y-2 p-3">
                    <p className="line-clamp-2 min-h-[2.5rem] text-xs text-slate-600 dark:text-slate-300">
                      {m.caption?.trim() || <span className="text-slate-400">No caption</span>}
                    </p>
                    <div className="flex items-center gap-2">
                      <Button size="sm" className="flex-1" onClick={() => createFor(m)}>
                        <Bot className="h-3.5 w-3.5" />
                        Automate
                      </Button>
                      {m.permalink ? (
                        <a
                          href={m.permalink}
                          target="_blank"
                          rel="noreferrer"
                          className="focus-ring rounded-md p-2 text-slate-400 hover:text-brand-600"
                          aria-label="Open on Instagram"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      ) : null}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </PageTransition>
  );
}
