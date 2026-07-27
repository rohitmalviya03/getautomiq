import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BarChart3,
  Bot,
  Check,
  Infinity as InfinityIcon,
  LayoutGrid,
  Link2,
  Lock,
  Mail,
  MessageSquare,
  Moon,
  Send,
  ShieldCheck,
  Sparkles,
  Sun,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { useThemeStore } from '@/stores/theme-store';
import { useAuthStore } from '@/stores/auth-store';
import { PLANS, DM_ADDONS, SALES_EMAIL } from '@/lib/plans';
import { useSeo, faqJsonLd } from '@/lib/use-seo';

const FEATURES: { icon: LucideIcon; title: string; desc: string; tags: string[] }[] = [
  {
    icon: MessageSquare,
    title: 'Comment → DM automations',
    desc: 'When someone comments your keyword, Automiq auto-replies publicly and slides your link straight into their DMs.',
    tags: ['Keyword match', 'Public reply', 'Auto DM'],
  },
  {
    icon: Send,
    title: 'DM & story-reply triggers',
    desc: 'Respond to direct-message keywords and story replies too — one rule can listen to several sources at once.',
    tags: ['DM keyword', 'Story reply', 'Multi-trigger'],
  },
  {
    icon: LayoutGrid,
    title: 'Run it on a specific post',
    desc: 'Pick any post or reel from a visual grid and bind an automation to just that piece of content.',
    tags: ['Post picker', 'Reels & posts', 'Per-media rules'],
  },
  {
    icon: Mail,
    title: 'Lead capture on autopilot',
    desc: 'Ask for an email in the DM flow and Automiq validates it, saves it to a contact, and sends your thank-you — hands-free.',
    tags: ['Email collection', 'Auto-validate', 'Follow-up DM'],
  },
  {
    icon: Users,
    title: 'Contacts & CRM',
    desc: 'Everyone who engages becomes a lead automatically — with name, email, tags and last interaction. Export anytime.',
    tags: ['Auto-captured', 'Tags', 'CSV export'],
  },
  {
    icon: BarChart3,
    title: 'Analytics that matter',
    desc: 'See comments processed, match rate, DMs delivered and your best-performing rules — updated live.',
    tags: ['Match rate', 'DMs / day', 'Top rules'],
  },
  {
    icon: Link2,
    title: 'Trackable links',
    desc: 'Create short links, drop them in DMs and bio, and watch total & unique clicks, daily trends and referrers.',
    tags: ['Short links', 'Click stats', 'Referrers'],
  },
  {
    icon: Sparkles,
    title: 'Ready-made templates',
    desc: 'Launch a proven flow in one click — “Comment → DM a link”, lead magnets, price responders and more.',
    tags: ['6 presets', 'Pre-filled', 'Editable'],
  },
  {
    icon: Lock,
    title: 'Team & enterprise-grade security',
    desc: 'Invite teammates with roles, connect multiple accounts, and rest easy — tokens are encrypted, never exposed.',
    tags: ['Roles & permissions', 'Encrypted tokens', 'Multi-account'],
  },
];

const FAQS = [
  {
    q: 'How does the free trial work?',
    a: 'Start on any paid plan free — no credit card required. You get full access during the trial; cancel any time before it ends and you won’t be charged.',
  },
  {
    q: 'Do you charge based on contacts?',
    a: 'Never. Automiq is not contact-based billing. Paid plans include unlimited contacts — you only ever pay for your plan and any DM top-ups you choose.',
  },
  {
    q: 'Can I cancel anytime?',
    a: 'Yes. Cancel with one click from your billing page — no emails, no retention hoops. You keep access until the end of your current period.',
  },
  {
    q: 'Can I connect multiple Instagram accounts?',
    a: 'Yes. Starter connects 2 accounts, Growth 5, and Agency 15 — all managed from a single dashboard with per-account automations.',
  },
  {
    q: 'Are my Instagram tokens secure?',
    a: 'Absolutely. We connect through the official Meta Graph API and store access tokens with AES-256 encryption — they never leave our servers.',
  },
];

export function LandingPage() {
  const theme = useThemeStore((s) => s.theme);
  const toggleTheme = useThemeStore((s) => s.toggle);
  const authed = useAuthStore((s) => s.status === 'authenticated');
  const [yearly, setYearly] = useState(false);

  useSeo(
    'Automiq — Instagram Automation Tool | Comment-to-DM Auto-Reply',
    'Automiq automates Instagram: auto-reply to comments, DM your links, and capture leads on autopilot. Comment-to-DM, story replies & keyword automation. Start free — no card, no Facebook Page.',
    faqJsonLd(FAQS),
  );

  const primaryCta = authed
    ? { label: 'Go to dashboard', to: '/dashboard' }
    : { label: 'Start free — no card', to: '/register' };

  return (
    <div className="aql">
      {/* eslint-disable-next-line react/no-danger */}
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      <nav className="aql-nav">
        <div className="aql-wrap aql-nav-in">
          <Link className="aql-brand" to="/">
            <span className="aql-mark" aria-hidden="true">
              <Bot />
            </span>
            Automiq
          </Link>
          <div className="aql-nav-links">
            <a className="aql-navlink" href="#features">
              Features
            </a>
            <a className="aql-navlink" href="#how">
              How it works
            </a>
            <a className="aql-navlink" href="#tools">
              Free tools
            </a>
            <a className="aql-navlink" href="#pricing">
              Pricing
            </a>
            <Link className="aql-navlink" to="/waitlist">
              Waitlist
            </Link>
          </div>
          <div className="aql-nav-actions">
            <button
              className="aql-icon-btn"
              onClick={toggleTheme}
              aria-label="Toggle dark mode"
              type="button"
            >
              {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            {authed ? (
              <Link className="aql-btn aql-btn-primary" to="/dashboard">
                Dashboard
              </Link>
            ) : (
              <>
                <Link className="aql-btn aql-btn-ghost" to="/login">
                  Log in
                </Link>
                <Link className="aql-btn aql-btn-primary" to="/register">
                  Start free
                </Link>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* HERO */}
      <header className="aql-hero">
        <div className="aql-wrap aql-hero-grid">
          <div>
            <span className="aql-pill">
              <span className="aql-dot" /> Instagram DM automation, done right
            </span>
            <h1 className="aql-hero-h">
              Turn every <span className="aql-grad-text">comment</span> into a customer.
            </h1>
            <p className="aql-hero-sub">
              Automiq replies to comments, DMs and story replies the moment they land — sending your
              link, capturing emails, and filling your CRM while you sleep.
            </p>
            <div className="aql-hero-cta">
              <Link className="aql-btn aql-btn-primary aql-btn-lg" to={primaryCta.to}>
                {primaryCta.label}
              </Link>
              <a className="aql-btn aql-btn-ghost aql-btn-lg" href="#how">
                See how it works
              </a>
            </div>
            <div className="aql-hero-note">
              <span>
                <Check className="aql-tick" size={15} /> Connect in 2 minutes
              </span>
              <span>
                <Check className="aql-tick" size={15} /> No Facebook Page needed
              </span>
              <span>
                <Check className="aql-tick" size={15} /> Works on posts, reels & stories
              </span>
            </div>
          </div>

          <div className="aql-demo" aria-label="Example: a comment becomes an automatic DM">
            <div className="aql-demo-head">
              <span className="aql-avatar">A</span>
              <div>
                <div className="aql-handle">@yourbrand</div>
                <div className="aql-meta">New reel · just now</div>
              </div>
            </div>
            <div className="aql-demo-photo" role="img" aria-label="Your post" />
            <div className="aql-bubble aql-b-comment aql-b1">
              <span className="aql-who">arjun.k</span>drop the link please 👀
            </div>
            <div className="aql-flow-tag">⚡ Automiq matched “link”</div>
            <div className="aql-bubble aql-b-reply aql-b2">
              <span className="aql-who">@yourbrand replied</span>Just sent you a DM! 📩
            </div>
            <div className="aql-bubble aql-b-dm aql-b3">
              <span className="aql-who">Direct message</span>Hey Arjun! Here’s the link you asked for
              👉 automiq.link/guide
            </div>
          </div>
        </div>
      </header>

      <div className="aql-wrap">
        <div className="aql-strip">
          <div className="aql-stat">
            <div className="aql-num aql-grad-text">&lt; 5s</div>
            <div className="aql-lbl">Reply time</div>
          </div>
          <div className="aql-stat">
            <div className="aql-num aql-grad-text">3</div>
            <div className="aql-lbl">Trigger types</div>
          </div>
          <div className="aql-stat">
            <div className="aql-num aql-grad-text">24/7</div>
            <div className="aql-lbl">Always on</div>
          </div>
          <div className="aql-stat">
            <div className="aql-num aql-grad-text">1-click</div>
            <div className="aql-lbl">Templates</div>
          </div>
        </div>
      </div>

      {/* FEATURES */}
      <section id="features" className="aql-section">
        <div className="aql-wrap">
          <div className="aql-sec-head">
            <span className="aql-eyebrow">Everything in one place</span>
            <h2>Built to turn attention into action</h2>
            <p>
              From the first comment to a booked customer — every step is automated, tracked, and
              yours to control.
            </p>
          </div>
          <div className="aql-feat-grid">
            {FEATURES.map(({ icon: Icon, title, desc, tags }) => (
              <div className="aql-fcard" key={title}>
                <div className="aql-ficon">
                  <Icon size={21} />
                </div>
                <h3>{title}</h3>
                <p>{desc}</p>
                <ul>
                  {tags.map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* HOW */}
      <section id="how" className="aql-section aql-pt0">
        <div className="aql-wrap">
          <div className="aql-sec-head">
            <span className="aql-eyebrow">Live in minutes</span>
            <h2>Three steps from comment to customer</h2>
          </div>
          <div className="aql-steps">
            <div className="aql-step">
              <div className="aql-n">1</div>
              <h3>They engage</h3>
              <p>
                A follower comments your keyword, DMs you, or replies to your story — the moment that
                used to get lost.
              </p>
            </div>
            <div className="aql-step">
              <div className="aql-n">2</div>
              <h3>Automiq matches</h3>
              <p>
                Your rule fires instantly: it recognises the keyword, replies publicly, and captures
                the person as a lead.
              </p>
            </div>
            <div className="aql-step">
              <div className="aql-n">3</div>
              <h3>The DM lands</h3>
              <p>
                Your link, offer or email-ask is delivered privately — every conversation tracked in
                your dashboard.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* TOOLS */}
      <section id="tools" className="aql-section aql-pt0">
        <div className="aql-wrap">
          <div className="aql-sec-head">
            <span className="aql-eyebrow">On the house</span>
            <h2>Free creator tools, no login</h2>
            <p>Handy utilities that run instantly in your browser — a taste of what Automiq is about.</p>
          </div>
          <div className="aql-tools">
            <Link to="/tools/instagram-hashtag-generator" className="aql-tool">
              <span className="aql-free">FREE</span>
              <div className="aql-k">Reach</div>
              <h3>Hashtag generator</h3>
              <p>Turn a topic into a balanced mix of broad, niche and long-tail hashtags built to get found.</p>
            </Link>
            <Link to="/tools/instagram-caption-generator" className="aql-tool">
              <span className="aql-free">FREE</span>
              <div className="aql-k">Copy</div>
              <h3>Caption generator</h3>
              <p>Pick a tone, toggle emojis and CTAs, and get scroll-stopping caption ideas in a click.</p>
            </Link>
            <Link to="/tools/engagement-rate-calculator" className="aql-tool">
              <span className="aql-free">FREE</span>
              <div className="aql-k">Insight</div>
              <h3>Engagement calculator</h3>
              <p>Enter your numbers and see your engagement rate against real industry benchmarks.</p>
            </Link>
          </div>
          <p style={{ textAlign: 'center', marginTop: '18px' }}>
            <Link to="/tools" className="aql-navlink" style={{ fontWeight: 600 }}>
              Browse all free tools →
            </Link>
          </p>
        </div>
      </section>

      {/* PRICING */}
      <section id="pricing" className="aql-section aql-pt0">
        <div className="aql-wrap">
          <div className="aql-sec-head">
            <span className="aql-eyebrow">Pricing</span>
            <h2>Simple, transparent pricing.</h2>
            <p>No hidden charges. No contact-based billing. Cancel anytime.</p>
          </div>

          <div className="aql-trust">
            <span>
              <ShieldCheck size={16} /> Official Meta Graph API
            </span>
            <span>
              <InfinityIcon size={16} /> Unlimited Contacts
            </span>
            <span>
              <Lock size={16} /> Secure Token Encryption
            </span>
          </div>

          <div className="aql-toggle-wrap">
            <div className="aql-toggle" role="group" aria-label="Billing period">
              <button className={yearly ? '' : 'on'} onClick={() => setYearly(false)} type="button">
                Monthly
              </button>
              <button className={yearly ? 'on' : ''} onClick={() => setYearly(true)} type="button">
                Yearly <span className="aql-save">Save 20%</span>
              </button>
            </div>
            <span className={`aql-2mo${yearly ? ' show' : ''}`}>🎉 2 months free</span>
          </div>

          <div className="aql-price-grid">
            {PLANS.map((p) => {
              const free = p.priceMonthly === '₹0';
              return (
                <div className={`aql-plan${p.popular ? ' pop' : ''}`} key={p.tag}>
                  {p.popular ? <span className="aql-badge-pop">Most Popular</span> : null}
                  <div className="aql-plan-top">
                    <span className="aql-plan-tag">{p.tag}</span>
                    {p.bestValue ? <span className="aql-bestvalue">🔥 Best Value</span> : null}
                  </div>
                  <p className="aql-plan-sub">{p.subtitle}</p>

                  {p.contactSales ? (
                    <>
                      <div className="aql-price">
                        <span className="aql-amt" style={{ fontSize: '30px' }}>
                          Let’s talk
                        </span>
                      </div>
                      <div className="aql-bill">Custom pricing &amp; limits</div>
                      <a
                        className="aql-btn aql-btn-primary aql-plan-cta"
                        href={`mailto:${SALES_EMAIL}?subject=Automiq%20Agency%20plan`}
                      >
                        {p.cta}
                      </a>
                      <p className="aql-plan-note">
                        Everything in Growth, tailored to your agency — white-label reports,
                        unlimited team &amp; workspaces, and premium support.
                      </p>
                    </>
                  ) : (
                    <>
                      <div className="aql-price">
                        <span className="aql-amt">{yearly ? p.priceYearly : p.priceMonthly}</span>
                        <span className="aql-per">{free ? '' : yearly ? '/year' : '/month'}</span>
                      </div>
                      <div className="aql-bill">
                        {free
                          ? 'Free forever'
                          : yearly
                            ? '2 months free · billed annually'
                            : 'Billed monthly'}
                      </div>
                      <Link
                        className={`aql-btn ${p.popular ? 'aql-btn-primary' : 'aql-btn-ghost'} aql-plan-cta`}
                        to={authed ? '/dashboard' : `/register?plan=${p.key}`}
                      >
                        {p.cta}
                      </Link>
                      <ul>
                        {p.inherits ? (
                          <li className="aql-inherit">
                            <Check size={16} />
                            {p.inherits}
                          </li>
                        ) : null}
                        {p.features.map((f) => (
                          <li key={f}>
                            <Check size={16} />
                            {f}
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </div>
              );
            })}
          </div>

          <div className="aql-pricefoot">
            <span>
              <Check size={15} /> No credit card required
            </span>
            <span>
              <Check size={15} /> Cancel anytime
            </span>
            <span>
              <Check size={15} /> Secure payments
            </span>
            <span>
              <Check size={15} /> Official Instagram API
            </span>
          </div>

          {/* Pay-as-you-go DM top-ups */}
          <div className="aql-addons">
            <div className="aql-addons-head">
              <h3>Need more DMs? Top up any time.</h3>
              <p>One-time DM packs that stack on your plan and never expire.</p>
            </div>
            <div className="aql-addon-grid">
              {DM_ADDONS.map((a) => (
                <div className="aql-addon" key={a.dms}>
                  <span className="aql-addon-dms">{a.dms}</span>
                  <span className="aql-addon-lbl">DMs</span>
                  <span className="aql-addon-price">{a.price}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="aql-section aql-pt0">
        <div className="aql-wrap">
          <div className="aql-sec-head">
            <span className="aql-eyebrow">Good to know</span>
            <h2>Questions, answered</h2>
          </div>
          <div className="aql-faq">
            {FAQS.map((f, i) => (
              <details key={f.q} open={i === 0}>
                <summary>
                  {f.q} <span className="aql-chev">+</span>
                </summary>
                <p>{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section id="cta" className="aql-section">
        <div className="aql-wrap">
          <div className="aql-cta">
            <h2>Your next customer is already in your comments.</h2>
            <p>Set up your first automation in minutes and never miss a “drop the link” again.</p>
            <Link className="aql-btn aql-btn-primary aql-btn-lg" to={primaryCta.to}>
              {primaryCta.label}
            </Link>
          </div>
        </div>
      </section>

      <footer className="aql-footer">
        <div className="aql-wrap aql-foot">
          <Link className="aql-brand aql-brand-sm" to="/">
            <span className="aql-mark aql-mark-sm" aria-hidden="true">
              <Bot />
            </span>
            Automiq
          </Link>
          <div className="aql-foot-links">
            <a href="#features">Features</a>
            <a href="#pricing">Pricing</a>
            <Link to="/waitlist">Waitlist</Link>
            <Link to="/tools">Free tools</Link>
            <Link to="/privacy">Privacy</Link>
            <Link to="/terms">Terms</Link>
          </div>
          <div className="aql-muted">© 2026 Automiq · Automate Instagram conversations</div>
        </div>
      </footer>
    </div>
  );
}

const CSS = `
.aql {
  --violet: #7c3aed; --magenta: #c4249f; --orange: #f77737;
  --grad: linear-gradient(135deg, #7c3aed 0%, #c4249f 48%, #f77737 100%);
  --grad-soft: linear-gradient(135deg, #8b46ef 0%, #c4249f 55%, #fb8c3a 100%);
  --bg: #fbf8fd; --glass: rgba(255,255,255,0.66); --glass-brd: rgba(124,58,237,0.14);
  --text: #1b1327; --muted: #6c6478; --border: rgba(27,19,39,0.10);
  --card: #ffffff; --card-2: #f6f0fb;
  --shadow: 0 20px 50px -24px rgba(124,58,237,0.35);
  --glow: 0 12px 34px -8px rgba(146,80,230,0.5);
  --ffd: "Space Grotesk","Segoe UI",system-ui,-apple-system,sans-serif;
  --ffb: "Inter",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
  --maxw: 1140px;
  font-family: var(--ffb); color: var(--text); line-height: 1.6;
}
:root.dark .aql {
  --bg: #0b0713; --glass: rgba(24,16,36,0.6); --glass-brd: rgba(255,255,255,0.09);
  --text: #f4eefb; --muted: #a89cb8; --border: rgba(255,255,255,0.10);
  --card: rgba(255,255,255,0.035); --card-2: rgba(255,255,255,0.05);
  --shadow: 0 24px 60px -28px rgba(0,0,0,0.8);
  --glow: 0 14px 40px -8px rgba(196,36,159,0.5);
}
.aql * { box-sizing: border-box; }
.aql h1, .aql h2, .aql h3 { font-family: var(--ffd); letter-spacing: -0.03em; text-wrap: balance; margin: 0; font-weight: 700; }
.aql p { margin: 0; }
.aql a { color: inherit; text-decoration: none; }
.aql-wrap { max-width: var(--maxw); margin: 0 auto; padding: 0 24px; }
.aql-grad-text { background: var(--grad); -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; color: transparent; }
.aql-eyebrow { font-size: 12px; font-weight: 700; letter-spacing: 0.16em; text-transform: uppercase; color: var(--magenta); }

.aql-btn { display: inline-flex; align-items: center; gap: 8px; font-family: var(--ffb); font-weight: 600; font-size: 15px; padding: 12px 22px; border-radius: 999px; border: 0; cursor: pointer; transition: transform .18s ease, box-shadow .18s ease; white-space: nowrap; }
.aql-btn-primary { background: var(--grad); color: #fff; box-shadow: var(--glow); }
.aql-btn-primary:hover { transform: translateY(-2px); box-shadow: 0 18px 44px -8px rgba(196,36,159,.6); }
.aql-btn-ghost { background: transparent; color: var(--text); border: 1px solid var(--border); }
.aql-btn-ghost:hover { transform: translateY(-2px); border-color: color-mix(in srgb, var(--violet) 45%, var(--border)); }
.aql-btn-lg { padding: 15px 28px; font-size: 16px; }
.aql-soon { opacity: .55; cursor: not-allowed; }
.aql-soon:hover { transform: none; }

.aql-nav { position: sticky; top: 0; z-index: 50; backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); background: var(--glass); border-bottom: 1px solid var(--glass-brd); }
.aql-nav-in { display: flex; align-items: center; justify-content: space-between; height: 66px; }
.aql-brand { display: flex; align-items: center; gap: 10px; font-family: var(--ffd); font-weight: 700; font-size: 21px; letter-spacing: -0.02em; color: var(--text); }
.aql-mark { width: 34px; height: 34px; border-radius: 10px; background: var(--grad); display: grid; place-items: center; box-shadow: var(--glow); color: #fff; }
.aql-mark svg { width: 19px; height: 19px; }
.aql-nav-links { display: flex; align-items: center; gap: 28px; }
.aql-navlink { font-size: 14.5px; font-weight: 500; color: var(--muted); }
.aql-navlink:hover { color: var(--text); }
.aql-nav-actions { display: flex; align-items: center; gap: 12px; }
.aql-icon-btn { width: 38px; height: 38px; border-radius: 999px; border: 1px solid var(--border); background: transparent; color: var(--text); cursor: pointer; display: grid; place-items: center; }
.aql-icon-btn:hover { border-color: color-mix(in srgb, var(--violet) 40%, var(--border)); }
@media (max-width: 860px) { .aql-nav-links { display: none; } }

.aql-hero { padding: 74px 0 40px; }
.aql-hero-grid { display: grid; grid-template-columns: 1.05fr 0.95fr; gap: 54px; align-items: center; }
@media (max-width: 940px) { .aql-hero-grid { grid-template-columns: 1fr; gap: 40px; } }
.aql-pill { display: inline-flex; align-items: center; gap: 8px; padding: 6px 14px; border-radius: 999px; font-size: 13px; font-weight: 600; background: var(--card-2); border: 1px solid var(--border); color: var(--muted); margin-bottom: 22px; }
.aql-dot { width: 8px; height: 8px; border-radius: 99px; background: var(--grad); }
.aql-hero-h { font-size: clamp(38px, 6vw, 62px); line-height: 1.02; font-weight: 700; }
.aql-hero-sub { margin-top: 22px; font-size: clamp(16px, 2.2vw, 19px); color: var(--muted); max-width: 34em; }
.aql-hero-cta { margin-top: 30px; display: flex; gap: 14px; flex-wrap: wrap; }
.aql-hero-note { margin-top: 18px; font-size: 13.5px; color: var(--muted); display: flex; gap: 18px; flex-wrap: wrap; }
.aql-hero-note span { display: inline-flex; align-items: center; gap: 6px; }
.aql-tick { color: var(--violet); }

.aql-demo { position: relative; background: var(--card); border: 1px solid var(--glass-brd); border-radius: 26px; padding: 20px; box-shadow: var(--shadow); }
.aql-demo::before { content: ""; position: absolute; inset: -1px; border-radius: 26px; padding: 1px; background: var(--grad); -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); -webkit-mask-composite: xor; mask-composite: exclude; opacity: .5; pointer-events: none; }
.aql-demo-head { display: flex; align-items: center; gap: 10px; padding: 2px 4px 14px; }
.aql-avatar { width: 34px; height: 34px; border-radius: 999px; background: var(--grad-soft); display: grid; place-items: center; color: #fff; font-weight: 700; font-size: 14px; font-family: var(--ffd); }
.aql-handle { font-weight: 600; font-size: 14px; }
.aql-meta { font-size: 12px; color: var(--muted); }
.aql-demo-photo { height: 132px; border-radius: 16px; margin-bottom: 14px; background: var(--grad); position: relative; overflow: hidden; display: grid; place-items: center; }
.aql-demo-photo::after { content: "☕ new drop"; color: rgba(255,255,255,.92); font-family: var(--ffd); font-weight: 600; }
.aql-bubble { border-radius: 14px; padding: 10px 13px; font-size: 13.5px; margin-bottom: 10px; opacity: 0; transform: translateY(8px); animation: aqlrise .5s ease forwards; }
.aql-who { font-weight: 700; font-size: 12px; display: block; margin-bottom: 2px; }
.aql-b-comment { background: var(--card-2); border: 1px solid var(--border); }
.aql-b-comment .aql-who { color: var(--muted); }
.aql-b-reply { background: color-mix(in srgb, var(--violet) 12%, transparent); border: 1px solid color-mix(in srgb, var(--violet) 30%, transparent); }
.aql-b-reply .aql-who { color: var(--violet); }
.aql-b-dm { background: var(--grad); color: #fff; }
.aql-b-dm .aql-who { color: rgba(255,255,255,.85); }
.aql-b1 { animation-delay: .2s; } .aql-b2 { animation-delay: 1s; } .aql-b3 { animation-delay: 1.7s; }
.aql-flow-tag { display: inline-flex; align-items: center; gap: 6px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .1em; color: var(--magenta); margin: 2px 0 10px 2px; opacity: 0; animation: aqlrise .5s ease forwards; animation-delay: .7s; }
@keyframes aqlrise { to { opacity: 1; transform: translateY(0); } }

.aql-section { padding: 68px 0; }
.aql-pt0 { padding-top: 20px; }
.aql-sec-head { max-width: 40em; margin: 0 auto 44px; text-align: center; }
.aql-sec-head h2 { font-size: clamp(28px, 4vw, 42px); line-height: 1.08; }
.aql-sec-head p { margin-top: 14px; color: var(--muted); font-size: 17px; }

.aql-strip { display: flex; flex-wrap: wrap; justify-content: center; gap: 14px 40px; padding: 26px 0; border-top: 1px solid var(--border); border-bottom: 1px solid var(--border); }
.aql-stat { text-align: center; }
.aql-num { font-family: var(--ffd); font-weight: 700; font-size: 26px; }
.aql-lbl { font-size: 12.5px; color: var(--muted); letter-spacing: .04em; }

.aql-feat-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px; }
@media (max-width: 900px) { .aql-feat-grid { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 620px) { .aql-feat-grid { grid-template-columns: 1fr; } }
.aql-fcard { background: var(--card); border: 1px solid var(--border); border-radius: 18px; padding: 22px; transition: transform .2s ease, box-shadow .2s ease, border-color .2s ease; }
.aql-fcard:hover { transform: translateY(-4px); box-shadow: var(--shadow); border-color: var(--glass-brd); }
.aql-ficon { width: 42px; height: 42px; border-radius: 12px; background: var(--grad); display: grid; place-items: center; margin-bottom: 15px; box-shadow: var(--glow); color: #fff; }
.aql-fcard h3 { font-size: 17px; margin-bottom: 7px; }
.aql-fcard p { font-size: 14px; color: var(--muted); }
.aql-fcard ul { margin: 12px 0 0; padding: 0; list-style: none; display: flex; flex-wrap: wrap; gap: 7px; }
.aql-fcard li { font-size: 12px; font-weight: 600; padding: 4px 10px; border-radius: 999px; background: var(--card-2); color: var(--text); border: 1px solid var(--border); }

.aql-steps { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; }
@media (max-width: 780px) { .aql-steps { grid-template-columns: 1fr; } }
.aql-step { background: var(--card); border: 1px solid var(--border); border-radius: 18px; padding: 26px 24px; }
.aql-n { font-family: var(--ffd); font-weight: 700; font-size: 15px; width: 34px; height: 34px; border-radius: 10px; display: grid; place-items: center; background: var(--grad); color: #fff; margin-bottom: 16px; }
.aql-step h3 { font-size: 18px; margin-bottom: 8px; }
.aql-step p { font-size: 14.5px; color: var(--muted); }

.aql-tools { display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px; }
@media (max-width: 780px) { .aql-tools { grid-template-columns: 1fr; } }
.aql-tool { border-radius: 18px; padding: 24px; color: #fff; background: var(--grad); box-shadow: var(--shadow); position: relative; overflow: hidden; }
.aql-tool:nth-child(2) { background: linear-gradient(135deg, #c4249f, #f77737); }
.aql-tool:nth-child(3) { background: linear-gradient(135deg, #8b46ef, #c4249f); }
.aql-k { font-size: 12px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; opacity: .85; }
.aql-tool h3 { color: #fff; font-size: 20px; margin: 10px 0 8px; }
.aql-tool p { font-size: 14px; opacity: .92; }
.aql-free { position: absolute; top: 16px; right: 16px; font-size: 11px; font-weight: 800; letter-spacing: .08em; background: rgba(255,255,255,.22); padding: 4px 10px; border-radius: 999px; }

/* trust badges above pricing */
.aql-trust { display: flex; flex-wrap: wrap; justify-content: center; gap: 10px 14px; margin: -18px auto 26px; }
.aql-trust span { display: inline-flex; align-items: center; gap: 7px; font-size: 13px; font-weight: 600; color: var(--text); background: var(--card-2); border: 1px solid var(--border); padding: 7px 14px; border-radius: 999px; }
.aql-trust svg { color: var(--violet); }

.aql-toggle-wrap { display: flex; flex-direction: column; align-items: center; gap: 10px; margin-bottom: 44px; }
.aql-toggle { display: inline-flex; align-items: center; gap: 4px; background: var(--card-2); border: 1px solid var(--border); border-radius: 999px; padding: 5px; }
.aql-toggle button { border: 0; background: transparent; cursor: pointer; font-family: var(--ffb); font-weight: 600; font-size: 14px; color: var(--muted); padding: 9px 20px; border-radius: 999px; transition: all .2s ease; display: inline-flex; align-items: center; gap: 8px; }
.aql-toggle button.on { background: var(--grad); color: #fff; box-shadow: var(--glow); }
.aql-save { font-size: 10.5px; font-weight: 800; letter-spacing: .04em; padding: 2px 7px; border-radius: 999px; background: rgba(255,255,255,.22); }
.aql-toggle button:not(.on) .aql-save { background: color-mix(in srgb, var(--orange) 18%, transparent); color: var(--orange); }
.aql-2mo { font-size: 12.5px; font-weight: 600; color: var(--orange); opacity: 0; transition: opacity .2s ease; height: 16px; }
.aql-2mo.show { opacity: 1; }

.aql-price-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 18px; align-items: stretch; }
@media (max-width: 1040px) { .aql-price-grid { grid-template-columns: repeat(2, 1fr); gap: 16px; } }
@media (max-width: 560px) { .aql-price-grid { grid-template-columns: 1fr; } }
.aql-plan { position: relative; background: var(--card); border: 1px solid var(--border); border-radius: 22px; padding: 28px 24px; display: flex; flex-direction: column; transition: transform .22s ease, box-shadow .22s ease, border-color .22s ease; }
.aql-plan:hover { transform: translateY(-6px); box-shadow: var(--shadow); border-color: var(--glass-brd); }
/* Growth — larger, elevated, gradient border + glow. */
.aql-plan.pop { border: 0; box-shadow: var(--glow), var(--shadow); transform: scale(1.045); z-index: 2; }
.aql-plan.pop:hover { transform: scale(1.045) translateY(-6px); }
.aql-plan.pop::before { content: ""; position: absolute; inset: 0; border-radius: 22px; padding: 2px; background: var(--grad); -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); -webkit-mask-composite: xor; mask-composite: exclude; pointer-events: none; }
@media (max-width: 1040px) { .aql-plan.pop, .aql-plan.pop:hover { transform: none; } .aql-plan.pop:hover { transform: translateY(-6px); } }

.aql-badge-pop { position: absolute; top: -13px; left: 50%; transform: translateX(-50%); background: var(--grad); color: #fff; font-size: 11px; font-weight: 800; letter-spacing: .06em; padding: 6px 16px; border-radius: 999px; box-shadow: var(--glow); white-space: nowrap; }
.aql-soon-badge { position: absolute; top: 16px; right: 16px; font-size: 10px; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; color: var(--muted); background: var(--card-2); border: 1px solid var(--border); padding: 4px 9px; border-radius: 999px; }
.aql-plan-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 4px; }
.aql-plan-tag { font-family: var(--ffd); font-weight: 700; font-size: 17px; }
.aql-bestvalue { font-size: 10.5px; font-weight: 800; letter-spacing: .02em; padding: 4px 9px; border-radius: 999px; background: color-mix(in srgb, var(--orange) 16%, transparent); color: var(--orange); white-space: nowrap; }
.aql-plan-sub { margin-top: 6px; font-size: 13px; color: var(--muted); min-height: 38px; }
.aql-plan-note { margin-top: 16px; font-size: 13px; line-height: 1.5; color: var(--muted); }
.aql-price { font-family: var(--ffd); font-weight: 700; letter-spacing: -0.03em; margin: 16px 0 2px; display: flex; align-items: baseline; gap: 5px; }
.aql-amt { font-size: 38px; }
.aql-per { font-size: 14px; color: var(--muted); font-family: var(--ffb); font-weight: 500; }
.aql-bill { font-size: 12.5px; color: var(--muted); min-height: 18px; }
.aql-plan-cta { width: 100%; justify-content: center; margin: 20px 0; }
.aql-plan ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 11px; }
.aql-plan li { font-size: 13.5px; display: flex; gap: 9px; align-items: flex-start; color: var(--text); }
.aql-plan li svg { flex-shrink: 0; margin-top: 2px; color: var(--violet); }
.aql-plan li.aql-inherit { font-weight: 700; }

.aql-pricefoot { display: flex; flex-wrap: wrap; justify-content: center; gap: 12px 26px; margin-top: 34px; padding-top: 26px; border-top: 1px solid var(--border); }
.aql-pricefoot span { display: inline-flex; align-items: center; gap: 7px; font-size: 13.5px; font-weight: 500; color: var(--muted); }
.aql-pricefoot svg { color: var(--violet); }

.aql-addons { margin-top: 34px; border-radius: 20px; border: 1px solid var(--glass-brd); background: var(--card); padding: 26px; }
.aql-addons-head { text-align: center; margin-bottom: 20px; }
.aql-addons-head h3 { font-size: 20px; }
.aql-addons-head p { margin-top: 6px; font-size: 14px; color: var(--muted); }
.aql-addon-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
@media (max-width: 620px) { .aql-addon-grid { grid-template-columns: repeat(2, 1fr); } }
.aql-addon { border: 1px solid var(--border); border-radius: 14px; padding: 16px; text-align: center; background: var(--card-2); }
.aql-addon-dms { display: block; font-family: var(--ffd); font-weight: 700; font-size: 22px; color: var(--text); }
.aql-addon-lbl { display: block; font-size: 11px; text-transform: uppercase; letter-spacing: .1em; color: var(--muted); margin-bottom: 8px; }
.aql-addon-price { display: inline-block; font-weight: 700; font-size: 16px; }
.aql-addon-price { background: var(--grad); -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; }

.aql-faq { max-width: 780px; margin: 0 auto; display: flex; flex-direction: column; gap: 12px; }
.aql-faq details { background: var(--card); border: 1px solid var(--border); border-radius: 14px; padding: 4px 20px; }
.aql-faq details[open] { border-color: var(--glass-brd); }
.aql-faq summary { cursor: pointer; list-style: none; padding: 16px 0; font-weight: 600; font-size: 16px; display: flex; justify-content: space-between; align-items: center; gap: 12px; }
.aql-faq summary::-webkit-details-marker { display: none; }
.aql-chev { transition: transform .2s ease; color: var(--magenta); font-weight: 700; font-size: 20px; }
.aql-faq details[open] .aql-chev { transform: rotate(45deg); }
.aql-faq p { padding: 0 0 18px; color: var(--muted); font-size: 15px; }

.aql-cta { text-align: center; border-radius: 30px; padding: 60px 30px; background: var(--grad); color: #fff; box-shadow: var(--shadow); }
.aql-cta h2 { color: #fff; font-size: clamp(28px, 4.5vw, 44px); }
.aql-cta p { margin: 14px auto 28px; max-width: 30em; opacity: .94; font-size: 17px; }
.aql-cta .aql-btn-primary { background: #fff; color: var(--violet); box-shadow: 0 14px 40px -8px rgba(0,0,0,.35); }

.aql-footer { padding: 46px 0 40px; border-top: 1px solid var(--border); margin-top: 20px; }
.aql-foot { display: flex; justify-content: space-between; align-items: center; gap: 20px; flex-wrap: wrap; }
.aql-brand-sm { font-size: 18px; }
.aql-mark-sm { width: 28px; height: 28px; }
.aql-mark-sm svg { width: 15px; height: 15px; }
.aql-foot .aql-muted { color: var(--muted); font-size: 13.5px; }
.aql-foot-links { display: flex; gap: 22px; font-size: 13.5px; color: var(--muted); }
.aql-foot-links a:hover { color: var(--text); }

@media (prefers-reduced-motion: reduce) {
  .aql *, .aql *::before, .aql *::after { animation: none !important; transition: none !important; }
}
`;
