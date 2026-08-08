import { useState } from 'react';
import { Check, Facebook, Linkedin, Link2, Share2 } from 'lucide-react';

/**
 * Share controls for a blog post.
 *
 * Instagram has no web share URL — Meta provides share intents for Facebook and
 * Messenger but deliberately none for Instagram, so a link can't open an IG
 * composer from a browser. The native share button covers it instead: on mobile
 * `navigator.share` opens the OS sheet, which lists Instagram alongside
 * everything else the user has installed. That is the only route that actually
 * reaches Instagram, so it's shown first on devices that support it.
 */

/** lucide has no WhatsApp/X marks, so these two are inline. */
function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.149-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51l-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884a9.82 9.82 0 016.988 2.898 9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
    </svg>
  );
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

const btn =
  'focus-ring inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 text-slate-600 transition-colors hover:border-transparent hover:text-white dark:border-white/10 dark:text-slate-300';

export function ShareButtons({ url, title }: { url: string; title: string }) {
  const [copied, setCopied] = useState(false);
  // Feature-detected at render: on desktop Chrome there is no share sheet, so
  // showing the button there would promise something that doesn't happen.
  const canNativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  const encodedUrl = encodeURIComponent(url);
  const encodedTitle = encodeURIComponent(title);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked — the visible URL is still selectable */
    }
  };

  const nativeShare = async () => {
    try {
      await navigator.share({ title, url });
    } catch {
      /* user dismissed the sheet — nothing to do */
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="mr-1 text-sm font-medium text-slate-500 dark:text-slate-400">Share</span>

      {canNativeShare ? (
        <button
          type="button"
          onClick={nativeShare}
          aria-label="Share (includes Instagram and other installed apps)"
          title="Share to Instagram, Stories and more"
          className={`${btn} hover:bg-gradient-to-tr hover:from-amber-500 hover:via-pink-600 hover:to-purple-600`}
        >
          <Share2 className="h-4 w-4" />
        </button>
      ) : null}

      <a
        href={`https://wa.me/?text=${encodedTitle}%20${encodedUrl}`}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Share on WhatsApp"
        className={`${btn} hover:bg-[#25D366]`}
      >
        <WhatsAppIcon className="h-4 w-4" />
      </a>

      <a
        href={`https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Share on Facebook"
        className={`${btn} hover:bg-[#1877F2]`}
      >
        <Facebook className="h-4 w-4" />
      </a>

      <a
        href={`https://twitter.com/intent/tweet?text=${encodedTitle}&url=${encodedUrl}`}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Share on X"
        className={`${btn} hover:bg-black`}
      >
        <XIcon className="h-3.5 w-3.5" />
      </a>

      <a
        href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Share on LinkedIn"
        className={`${btn} hover:bg-[#0A66C2]`}
      >
        <Linkedin className="h-4 w-4" />
      </a>

      <button
        type="button"
        onClick={copy}
        aria-label={copied ? 'Link copied' : 'Copy link'}
        className={`${btn} ${copied ? 'border-transparent bg-emerald-500 text-white' : 'hover:bg-slate-700'}`}
      >
        {copied ? <Check className="h-4 w-4" /> : <Link2 className="h-4 w-4" />}
      </button>
    </div>
  );
}
