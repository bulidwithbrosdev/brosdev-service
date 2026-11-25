import React, { useEffect, useState } from 'react';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  X,
  Star,
  Phone,
  Mail,
  ExternalLink,
  Copy,
  Check,
  MessageCircle,
  Shield,
} from 'lucide-react';
import type { WidgetConfiguration, WidgetEventType, WidgetType } from '../widgets/types';
import { sanitizeWidgetUrl } from '../widgets/security';

export interface WidgetPartProps {
  type: WidgetType;
  config: WidgetConfiguration;
  onEvent?: (eventType: WidgetEventType, detail?: string) => void;
  onDismiss?: () => void;
}

export const UiWidgetsPart1: React.FC<WidgetPartProps> = ({ type, config, onEvent, onDismiss }) => {
  const c = config.content || {};
  const s = config.style;
  const v = config.visibility;

  // Interactive local states for part 1 widgets
  const [openFaqIndices, setOpenFaqIndices] = useState<number[]>([0]);
  const [slideIdx, setSlideIdx] = useState(0);
  const [contactOpen, setContactOpen] = useState(true);
  const [showPrefs, setShowPrefs] = useState(false);
  const [consentChoice, setConsentChoice] = useState<string | null>(null);
  const [selectedCats, setSelectedCats] = useState<Record<string, boolean>>({
    essential: true,
    analytics: true,
    marketing: false,
  });
  const [copiedShare, setCopiedShare] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (type !== 'countdown_timer') return;
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [type]);

  const btnStyle: React.CSSProperties = {
    backgroundColor: s.accentColor,
    color: s.buttonTextColor,
    borderRadius: Math.min(s.borderRadiusPx, 10),
  };

  const secondaryBtnStyle: React.CSSProperties = {
    borderColor: s.borderColor,
    color: s.textColor,
    borderRadius: Math.min(s.borderRadiusPx, 10),
  };

  if (type === 'announcement_bar') {
    const ctaHref = sanitizeWidgetUrl(c.ctaUrl);
    return (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 min-w-0 flex-1">
          <span className="font-bold">{String(c.title || 'Announcement')}</span>
          {Boolean(c.description) && (
            <span className="opacity-85 text-[0.92em]">{String(c.description)}</span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {Boolean(c.ctaLabel) && (
            <a
              href={ctaHref || '#'}
              target={ctaHref.startsWith('http') ? '_blank' : undefined}
              rel="noopener noreferrer"
              onClick={(e) => {
                if (!ctaHref) e.preventDefault();
                onEvent?.('cta_click', String(c.ctaLabel));
              }}
              style={btnStyle}
              className="px-3.5 py-1.5 text-xs font-semibold whitespace-nowrap transition-opacity hover:opacity-90"
            >
              {String(c.ctaLabel)}
            </a>
          )}
          {v.dismissible && (
            <button
              type="button"
              aria-label="Dismiss announcement"
              onClick={() => {
                onEvent?.('popup_close', 'dismiss');
                onDismiss?.();
              }}
              className="p-1 opacity-70 hover:opacity-100 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    );
  }

  if (type === 'popup_modal') {
    const imgSrc = sanitizeWidgetUrl(c.imageUrl, false);
    const ctaHref = sanitizeWidgetUrl(c.ctaUrl);
    return (
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            {Boolean(c.badge) && (
              <div className="text-xs font-semibold mb-1" style={{ color: s.accentColor }}>
                {String(c.badge)}
              </div>
            )}
            <h3 className="text-lg font-bold leading-snug">{String(c.title || 'Special Offer')}</h3>
          </div>
          {v.dismissible && (
            <button
              type="button"
              aria-label="Close modal"
              onClick={() => {
                onEvent?.('popup_close', 'close_btn');
                onDismiss?.();
              }}
              className="p-1 opacity-60 hover:opacity-100 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        {imgSrc && (
          <img
            src={imgSrc}
            alt={String(c.title || 'Modal visual')}
            referrerPolicy="no-referrer"
            className="w-full h-40 object-cover rounded-lg border"
            style={{ borderColor: s.borderColor }}
          />
        )}
        <p className="text-[0.95em] leading-relaxed opacity-85">{String(c.description || '')}</p>
        <div className="flex flex-wrap items-center gap-2.5 pt-1">
          {Boolean(c.ctaLabel) && (
            <a
              href={ctaHref || '#'}
              target={ctaHref.startsWith('http') ? '_blank' : undefined}
              rel="noopener noreferrer"
              onClick={(e) => {
                if (!ctaHref) e.preventDefault();
                onEvent?.('cta_click', String(c.ctaLabel));
              }}
              style={btnStyle}
              className="px-4 py-2 text-xs font-semibold whitespace-nowrap hover:opacity-90"
            >
              {String(c.ctaLabel)}
            </a>
          )}
          {Boolean(c.secondaryLabel) && (
            <button
              type="button"
              onClick={() => {
                onEvent?.('popup_close', 'secondary');
                onDismiss?.();
              }}
              style={secondaryBtnStyle}
              className="px-3.5 py-2 text-xs font-semibold border whitespace-nowrap cursor-pointer"
            >
              {String(c.secondaryLabel)}
            </button>
          )}
        </div>
      </div>
    );
  }

  if (type === 'cookie_consent') {
    const policyHref = sanitizeWidgetUrl(c.policyUrl);
    const categories = Array.isArray(c.categories)
      ? (c.categories as Array<{ id: string; name: string; description: string; required?: boolean }>)
      : [];

    return (
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1 flex-1 min-w-0">
            <div className="flex items-center gap-2 font-bold">
              <Shield className="w-4 h-4 shrink-0" style={{ color: s.accentColor }} />
              <span>{String(c.title || 'Cookie Preferences')}</span>
            </div>
            <p className="text-[0.9em] opacity-80 leading-relaxed">
              {String(c.bannerText || '')}{' '}
              {policyHref && (
                <a
                  href={policyHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => onEvent?.('click', 'policy_link')}
                  className="underline font-medium"
                  style={{ color: s.accentColor }}
                >
                  {String(c.policyLabel || 'Privacy Policy')}
                </a>
              )}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                setShowPrefs((prev) => !prev);
                onEvent?.('click', 'toggle_preferences');
              }}
              style={secondaryBtnStyle}
              className="px-3 py-2 text-xs font-semibold border whitespace-nowrap cursor-pointer"
            >
              {String(c.preferencesLabel || 'Preferences')}
            </button>
            <button
              type="button"
              onClick={() => {
                setConsentChoice('Rejected optional cookies');
                onEvent?.('consent_reject', 'reject_all');
              }}
              style={secondaryBtnStyle}
              className="px-3 py-2 text-xs font-semibold border whitespace-nowrap cursor-pointer"
            >
              {String(c.rejectLabel || 'Reject')}
            </button>
            <button
              type="button"
              onClick={() => {
                setConsentChoice('Accepted all cookies');
                onEvent?.('consent_accept', 'accept_all');
              }}
              style={btnStyle}
              className="px-3.5 py-2 text-xs font-semibold whitespace-nowrap cursor-pointer hover:opacity-90"
            >
              {String(c.acceptLabel || 'Accept All')}
            </button>
          </div>
        </div>

        {showPrefs && categories.length > 0 && (
          <div className="pt-3 border-t space-y-2" style={{ borderColor: s.borderColor }}>
            {categories.map((cat) => (
              <label
                key={cat.id}
                className="flex items-start justify-between gap-3 text-xs p-2 rounded border"
                style={{ borderColor: s.borderColor }}
              >
                <div>
                  <div className="font-semibold">{cat.name}</div>
                  <div className="opacity-75">{cat.description}</div>
                </div>
                <input
                  type="checkbox"
                  checked={cat.required ? true : Boolean(selectedCats[cat.id])}
                  disabled={Boolean(cat.required)}
                  onChange={(e) =>
                    setSelectedCats((prev) => ({ ...prev, [cat.id]: e.target.checked }))
                  }
                  className="mt-0.5"
                />
              </label>
            ))}
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setShowPrefs(false);
                  setConsentChoice('Saved custom cookie preferences');
                  onEvent?.('consent_accept', 'save_preferences');
                }}
                style={btnStyle}
                className="px-3.5 py-1.5 text-xs font-semibold cursor-pointer"
              >
                Save Preferences
              </button>
            </div>
          </div>
        )}

        {consentChoice && (
          <div className="text-xs font-medium opacity-80">
            Status: {consentChoice} (expires in {Number(c.consentExpiryDays || 180)} days)
          </div>
        )}
      </div>
    );
  }

  if (type === 'pricing_table') {
    const tiers = Array.isArray(c.tiers) ? (c.tiers as Array<Record<string, any>>) : [];
    return (
      <div className="space-y-5">
        <div className="space-y-1">
          <h3 className="text-xl font-bold">{String(c.heading || 'Pricing')}</h3>
          {Boolean(c.subheading) && <p className="text-xs opacity-75">{String(c.subheading)}</p>}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-left">
          {tiers.map((tier, i) => {
            const highlighted = Boolean(tier.highlighted);
            const featureLines = String(tier.features || '')
              .split('\n')
              .map((l) => l.trim())
              .filter(Boolean);
            const href = sanitizeWidgetUrl(tier.ctaUrl);
            return (
              <div
                key={i}
                className="p-4 flex flex-col justify-between border"
                style={{
                  borderRadius: Math.max(4, s.borderRadiusPx - 2),
                  borderColor: highlighted ? s.accentColor : s.borderColor,
                  borderWidth: highlighted ? 2 : 1,
                }}
              >
                <div className="space-y-3">
                  <div>
                    <div className="text-sm font-bold">{String(tier.name || `Tier ${i + 1}`)}</div>
                    <div className="text-xs opacity-70 mt-0.5">{String(tier.description || '')}</div>
                  </div>
                  <div className="flex items-baseline gap-1 font-mono tabular-nums">
                    <span className="text-2xl font-bold">{String(tier.price || '$0')}</span>
                    <span className="text-xs opacity-70">{String(tier.period || '/mo')}</span>
                  </div>
                  <ul className="space-y-1.5 text-xs">
                    {featureLines.map((line, j) => (
                      <li key={j} className="flex items-start gap-2">
                        <Check className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color: s.accentColor }} />
                        <span>{line}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <a
                  href={href || '#'}
                  target={href.startsWith('http') ? '_blank' : undefined}
                  rel="noopener noreferrer"
                  onClick={(e) => {
                    if (!href) e.preventDefault();
                    onEvent?.('cta_click', `pricing_${String(tier.name || i)}`);
                  }}
                  style={highlighted ? btnStyle : secondaryBtnStyle}
                  className={`mt-5 block text-center px-3.5 py-2 text-xs font-semibold ${
                    highlighted ? '' : 'border'
                  }`}
                >
                  {String(tier.ctaLabel || 'Choose Plan')}
                </a>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  if (type === 'faq_accordion') {
    const items = Array.isArray(c.items) ? (c.items as Array<{ question: string; answer: string }>) : [];
    const allowMulti = Boolean(c.allowMultipleOpen);
    const toggle = (idx: number) => {
      onEvent?.('click', `faq_${idx}`);
      setOpenFaqIndices((prev) => {
        if (prev.includes(idx)) return prev.filter((x) => x !== idx);
        return allowMulti ? [...prev, idx] : [idx];
      });
    };
    return (
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-bold">{String(c.heading || 'FAQ')}</h3>
          {Boolean(c.subheading) && <p className="text-xs opacity-75 mt-1">{String(c.subheading)}</p>}
        </div>
        <div className="divide-y" style={{ borderColor: s.borderColor }}>
          {items.map((item, idx) => {
            const isOpen = openFaqIndices.includes(idx);
            return (
              <div key={idx} className="py-3" style={{ borderColor: s.borderColor }}>
                <button
                  type="button"
                  onClick={() => toggle(idx)}
                  className="w-full flex items-center justify-between gap-3 text-left font-semibold text-sm cursor-pointer"
                >
                  <span>{item.question}</span>
                  <ChevronDown
                    className={`w-4 h-4 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                    style={{ color: s.accentColor }}
                  />
                </button>
                {isOpen && (
                  <p className="mt-2 text-[0.92em] leading-relaxed opacity-80">{item.answer}</p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  if (type === 'testimonial_slider') {
    const items = Array.isArray(c.items)
      ? (c.items as Array<{ quote: string; author: string; role: string; rating?: number }>)
      : [];
    const safeIdx = items.length > 0 ? slideIdx % items.length : 0;
    const current = items[safeIdx];
    return (
      <div className="space-y-4">
        {Boolean(c.heading) && <div className="text-xs font-semibold opacity-70">{String(c.heading)}</div>}
        {current ? (
          <>
            <div className="flex items-center justify-center gap-1">
              {Array.from({ length: Math.min(5, Math.max(1, Number(current.rating || 5))) }).map((_, i) => (
                <Star
                  key={i}
                  className="w-4 h-4 fill-current"
                  style={{ color: s.accentColor }}
                />
              ))}
            </div>
            <blockquote className="text-base font-medium leading-relaxed">
              &ldquo;{current.quote}&rdquo;
            </blockquote>
            <div className="text-xs">
              <div className="font-bold">{current.author}</div>
              <div className="opacity-70">{current.role}</div>
            </div>
          </>
        ) : (
          <div className="text-xs opacity-70">Add testimonials in the Content panel.</div>
        )}
        {items.length > 1 && (
          <div className="flex items-center justify-center gap-3 pt-1">
            <button
              type="button"
              aria-label="Previous testimonial"
              onClick={() => {
                setSlideIdx((safeIdx - 1 + items.length) % items.length);
                onEvent?.('click', 'slide_prev');
              }}
              style={secondaryBtnStyle}
              className="p-1.5 border cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-xs font-mono tabular-nums opacity-70">
              {safeIdx + 1} / {items.length}
            </span>
            <button
              type="button"
              aria-label="Next testimonial"
              onClick={() => {
                setSlideIdx((safeIdx + 1) % items.length);
                onEvent?.('click', 'slide_next');
              }}
              style={secondaryBtnStyle}
              className="p-1.5 border cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    );
  }

  if (type === 'countdown_timer') {
    const targetMs = new Date(String(c.targetDate || '')).getTime();
    const diffMs = Number.isFinite(targetMs) ? Math.max(0, targetMs - nowMs) : 0;
    const expired = Number.isFinite(targetMs) && diffMs <= 0;
    const days = Math.floor(diffMs / 86400000);
    const hours = Math.floor((diffMs % 86400000) / 3600000);
    const mins = Math.floor((diffMs % 3600000) / 60000);
    const secs = Math.floor((diffMs % 60000) / 1000);
    const ctaHref = sanitizeWidgetUrl(c.ctaUrl);

    return (
      <div className="space-y-4">
        <div className="space-y-1">
          <h3 className="text-lg font-bold">{String(c.title || 'Countdown')}</h3>
          {Boolean(c.subtitle) && <p className="text-xs opacity-80">{String(c.subtitle)}</p>}
        </div>
        {expired ? (
          <div className="text-sm font-semibold opacity-80">{String(c.expiredText || 'Offer expired.')}</div>
        ) : (
          <div className="grid grid-cols-4 gap-2 max-w-sm mx-auto">
            {[
              { label: 'Days', val: days },
              { label: 'Hours', val: hours },
              { label: 'Min', val: mins },
              { label: 'Sec', val: secs },
            ].map((u) => (
              <div
                key={u.label}
                className="p-2.5 border text-center"
                style={{ borderColor: s.borderColor, borderRadius: Math.max(4, s.borderRadiusPx - 2) }}
              >
                <div className="text-xl font-bold font-mono tabular-nums">
                  {String(u.val).padStart(2, '0')}
                </div>
                <div className="text-[11px] opacity-70">{u.label}</div>
              </div>
            ))}
          </div>
        )}
        {Boolean(c.ctaLabel) && (
          <div className="pt-1">
            <a
              href={ctaHref || '#'}
              target={ctaHref.startsWith('http') ? '_blank' : undefined}
              rel="noopener noreferrer"
              onClick={(e) => {
                if (!ctaHref) e.preventDefault();
                onEvent?.('cta_click', String(c.ctaLabel));
              }}
              style={btnStyle}
              className="inline-block px-5 py-2 text-xs font-semibold hover:opacity-90"
            >
              {String(c.ctaLabel)}
            </a>
          </div>
        )}
      </div>
    );
  }

  if (type === 'floating_contact') {
    const supportHref = sanitizeWidgetUrl(c.supportUrl);
    return (
      <div className="space-y-3">
        {contactOpen && (
          <div className="space-y-2.5 pb-2 border-b" style={{ borderColor: s.borderColor }}>
            <div className="text-xs opacity-80">{String(c.greeting || '')}</div>
            <div className="space-y-1.5 text-xs">
              {Boolean(c.email) && (
                <a
                  href={`mailto:${String(c.email)}`}
                  onClick={() => onEvent?.('cta_click', 'email')}
                  className="flex items-center gap-2 font-medium hover:underline"
                >
                  <Mail className="w-3.5 h-3.5" style={{ color: s.accentColor }} />
                  <span>{String(c.email)}</span>
                </a>
              )}
              {Boolean(c.phone) && (
                <a
                  href={`tel:${String(c.phone)}`}
                  onClick={() => onEvent?.('cta_click', 'phone')}
                  className="flex items-center gap-2 font-medium hover:underline"
                >
                  <Phone className="w-3.5 h-3.5" style={{ color: s.accentColor }} />
                  <span>{String(c.phone)}</span>
                </a>
              )}
              {supportHref && (
                <a
                  href={supportHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => onEvent?.('cta_click', 'support_url')}
                  className="flex items-center gap-2 font-medium hover:underline"
                  style={{ color: s.accentColor }}
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>{String(c.supportLabel || 'Help Center')}</span>
                </a>
              )}
            </div>
          </div>
        )}
        <button
          type="button"
          onClick={() => {
            setContactOpen((o) => !o);
            onEvent?.(contactOpen ? 'popup_close' : 'popup_open', 'floating_contact_toggle');
          }}
          style={btnStyle}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold cursor-pointer"
        >
          <MessageCircle className="w-3.5 h-3.5" />
          <span>{String(c.buttonLabel || 'Contact Us')}</span>
        </button>
      </div>
    );
  }

  if (type === 'review_widget') {
    const rating = Math.min(5, Math.max(0, Number(c.averageRating || 4.9)));
    const count = Number(c.totalReviews || 0);
    const ctaHref = sanitizeWidgetUrl(c.ctaUrl);
    return (
      <div className="space-y-2.5">
        <div className="flex items-center justify-between gap-3">
          <div className="text-xs font-bold">{String(c.platformName || 'Verified Reviews')}</div>
          <div className="flex items-center gap-0.5">
            {Array.from({ length: 5 }).map((_, i) => (
              <Star
                key={i}
                className={`w-3.5 h-3.5 ${i < Math.round(rating) ? 'fill-current' : 'opacity-30'}`}
                style={{ color: s.accentColor }}
              />
            ))}
          </div>
        </div>
        <div className="flex items-baseline gap-2 font-mono tabular-nums">
          <span className="text-2xl font-bold">{rating.toFixed(1)}</span>
          <span className="text-xs opacity-70">/ 5.0 · {count.toLocaleString()} reviews</span>
        </div>
        <p className="text-xs opacity-80">{String(c.summaryText || '')}</p>
        {Boolean(c.ctaLabel) && (
          <a
            href={ctaHref || '#'}
            target={ctaHref.startsWith('http') ? '_blank' : undefined}
            rel="noopener noreferrer"
            onClick={(e) => {
              if (!ctaHref) e.preventDefault();
              onEvent?.('cta_click', 'read_reviews');
            }}
            className="inline-flex items-center gap-1 text-xs font-semibold hover:underline"
            style={{ color: s.accentColor }}
          >
            <span>{String(c.ctaLabel)}</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        )}
      </div>
    );
  }

  // social_share
  const targetUrl =
    sanitizeWidgetUrl(c.shareUrl, false) ||
    (typeof window !== 'undefined' ? window.location.href : 'https://brosdev.site');
  const shareText = encodeURIComponent(String(c.shareText || ''));
  const encUrl = encodeURIComponent(targetUrl);

  const shareButtons = [
    c.showX !== false && {
      id: 'x',
      label: 'X / Twitter',
      href: `https://twitter.com/intent/tweet?text=${shareText}&url=${encUrl}`,
    },
    c.showLinkedIn !== false && {
      id: 'linkedin',
      label: 'LinkedIn',
      href: `https://www.linkedin.com/sharing/share-offsite/?url=${encUrl}`,
    },
    c.showWhatsApp !== false && {
      id: 'whatsapp',
      label: 'WhatsApp',
      href: `https://wa.me/?text=${shareText}%20${encUrl}`,
    },
    c.showEmail !== false && {
      id: 'email',
      label: 'Email',
      href: `mailto:?subject=${shareText}&body=${encUrl}`,
    },
  ].filter(Boolean) as Array<{ id: string; label: string; href: string }>;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <span className="text-xs font-bold">{String(c.label || 'Share')}</span>
      <div className="flex flex-wrap items-center gap-2">
        {shareButtons.map((btn) => (
          <a
            key={btn.id}
            href={btn.href}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => onEvent?.('cta_click', `share_${btn.id}`)}
            style={secondaryBtnStyle}
            className="px-3 py-1.5 text-xs font-semibold border hover:opacity-80"
          >
            {btn.label}
          </a>
        ))}
        {c.showCopyLink !== false && (
          <button
            type="button"
            onClick={() => {
              navigator.clipboard?.writeText(targetUrl).catch(() => {});
              setCopiedShare(true);
              setTimeout(() => setCopiedShare(false), 1800);
              onEvent?.('click', 'share_copy_link');
            }}
            style={btnStyle}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold cursor-pointer"
          >
            {copiedShare ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copiedShare ? 'Copied' : 'Copy Link'}</span>
          </button>
        )}
      </div>
    </div>
  );
};
