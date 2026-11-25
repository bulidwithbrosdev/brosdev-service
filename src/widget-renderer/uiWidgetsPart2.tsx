import React, { useState } from 'react';
import {
  X,
  ArrowUp,
  ThumbsUp,
  ThumbsDown,
  Copy,
  Check,
  List,
  Image as ImageIcon,
} from 'lucide-react';
import type { WidgetPartProps } from './uiWidgetsPart1';
import { sanitizeCssColor, sanitizeWidgetUrl } from '../widgets/security';

export const UiWidgetsPart2: React.FC<WidgetPartProps> = ({ type, config, onEvent, onDismiss }) => {
  const c = config.content || {};
  const s = config.style;
  const v = config.visibility;

  const [feedbackVote, setFeedbackVote] = useState<'up' | 'down' | null>(null);
  const [feedbackComment, setFeedbackComment] = useState('');
  const [feedbackSent, setFeedbackSent] = useState(false);

  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);
  const [splitPct, setSplitPct] = useState<number>(() =>
    Math.min(90, Math.max(10, Number(c.initialPosition || 50)))
  );

  const [nlEmail, setNlEmail] = useState('');
  const [nlStatus, setNlStatus] = useState<'idle' | 'submitting' | 'done' | 'error'>('idle');
  const [nlMessage, setNlMessage] = useState('');

  const [copiedCoupon, setCopiedCoupon] = useState(false);

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

  if (type === 'toast_notification') {
    const ctaHref = sanitizeWidgetUrl(c.ctaUrl);
    return (
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1 flex-1 min-w-0">
          <div className="text-sm font-bold">{String(c.title || 'Notification')}</div>
          <p className="text-xs opacity-80 leading-relaxed">{String(c.message || '')}</p>
          {Boolean(c.ctaLabel) && (
            <a
              href={ctaHref || '#'}
              target={ctaHref.startsWith('http') ? '_blank' : undefined}
              rel="noopener noreferrer"
              onClick={(e) => {
                if (!ctaHref) e.preventDefault();
                onEvent?.('cta_click', 'toast_cta');
              }}
              className="inline-block pt-1 text-xs font-semibold hover:underline"
              style={{ color: s.accentColor }}
            >
              {String(c.ctaLabel)} &rarr;
            </a>
          )}
        </div>
        {v.dismissible && (
          <button
            type="button"
            aria-label="Close notification"
            onClick={() => {
              onEvent?.('popup_close', 'toast_dismiss');
              onDismiss?.();
            }}
            className="p-1 opacity-60 hover:opacity-100 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
    );
  }

  if (type === 'back_to_top') {
    return (
      <div className="flex justify-center">
        <button
          type="button"
          onClick={() => {
            if (typeof window !== 'undefined') {
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }
            onEvent?.('click', 'back_to_top');
          }}
          style={{
            backgroundColor: s.backgroundColor,
            color: s.textColor,
            borderRadius: s.borderRadiusPx,
          }}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold cursor-pointer"
        >
          <ArrowUp className="w-4 h-4" style={{ color: s.accentColor }} />
          {c.showLabel !== false && <span>{String(c.label || 'Top')}</span>}
        </button>
      </div>
    );
  }

  if (type === 'reading_progress') {
    const heightPx = Math.min(14, Math.max(2, Number(c.barHeightPx || 4)));
    const pct = Math.min(100, Math.max(0, Number(c.previewPercent ?? 64)));
    const trackColor = sanitizeCssColor(c.trackColor, '#E5E5E5');
    return (
      <div className="space-y-2">
        <div
          className="w-full overflow-hidden"
          style={{ height: heightPx, backgroundColor: trackColor, borderRadius: heightPx }}
        >
          <div
            style={{
              width: `${pct}%`,
              height: '100%',
              backgroundColor: s.accentColor,
              transition: 'width 180ms ease-out',
            }}
          />
        </div>
        {c.showPercentageLabel !== false && (
          <div className="flex items-center justify-between text-[11px] opacity-70 font-mono tabular-nums px-1">
            <span>Reading progress</span>
            <span>{pct}%</span>
          </div>
        )}
      </div>
    );
  }

  if (type === 'sticky_cta') {
    const ctaHref = sanitizeWidgetUrl(c.ctaUrl);
    return (
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold">{String(c.headline || 'Ready to start?')}</div>
          {Boolean(c.subtext) && <div className="text-xs opacity-75 mt-0.5">{String(c.subtext)}</div>}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {Boolean(c.ctaLabel) && (
            <a
              href={ctaHref || '#'}
              target={ctaHref.startsWith('http') ? '_blank' : undefined}
              rel="noopener noreferrer"
              onClick={(e) => {
                if (!ctaHref) e.preventDefault();
                onEvent?.('cta_click', 'sticky_cta');
              }}
              style={btnStyle}
              className="px-4 py-2 text-xs font-semibold whitespace-nowrap hover:opacity-90"
            >
              {String(c.ctaLabel)}
            </a>
          )}
          {v.dismissible && (
            <button
              type="button"
              aria-label="Close sticky CTA"
              onClick={() => {
                onEvent?.('popup_close', 'sticky_cta_dismiss');
                onDismiss?.();
              }}
              className="p-1 opacity-60 hover:opacity-100 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    );
  }

  if (type === 'feedback_widget') {
    if (feedbackSent) {
      return (
        <div className="flex items-center gap-2 text-xs font-semibold">
          <Check className="w-4 h-4" style={{ color: s.accentColor }} />
          <span>{String(c.thankYouMessage || 'Thanks for your feedback!')}</span>
        </div>
      );
    }
    return (
      <div className="space-y-3">
        <div className="text-sm font-bold">{String(c.prompt || 'Was this helpful?')}</div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              setFeedbackVote('up');
              onEvent?.('click', 'feedback_positive');
            }}
            style={feedbackVote === 'up' ? btnStyle : secondaryBtnStyle}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold cursor-pointer ${
              feedbackVote === 'up' ? '' : 'border'
            }`}
          >
            <ThumbsUp className="w-3.5 h-3.5" />
            <span>{String(c.positiveLabel || 'Yes')}</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setFeedbackVote('down');
              onEvent?.('click', 'feedback_negative');
            }}
            style={feedbackVote === 'down' ? btnStyle : secondaryBtnStyle}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold cursor-pointer ${
              feedbackVote === 'down' ? '' : 'border'
            }`}
          >
            <ThumbsDown className="w-3.5 h-3.5" />
            <span>{String(c.negativeLabel || 'No')}</span>
          </button>
        </div>
        {feedbackVote && (
          <div className="space-y-2 pt-1">
            <textarea
              rows={2}
              value={feedbackComment}
              onChange={(e) => setFeedbackComment(e.target.value)}
              placeholder={String(c.commentPlaceholder || 'Optional note...')}
              className="w-full p-2 text-xs border rounded bg-transparent"
              style={{ borderColor: s.borderColor, color: s.textColor }}
            />
            <button
              type="button"
              onClick={() => {
                setFeedbackSent(true);
                onEvent?.('cta_click', `feedback_submit_${feedbackVote}`);
              }}
              style={btnStyle}
              className="px-3.5 py-1.5 text-xs font-semibold cursor-pointer"
            >
              {String(c.submitLabel || 'Send Feedback')}
            </button>
          </div>
        )}
      </div>
    );
  }

  if (type === 'image_gallery') {
    const items = Array.isArray(c.items) ? (c.items as Array<Record<string, any>>) : [];
    const cols = Math.min(4, Math.max(2, Number(c.columns || 3)));
    const gridClass = cols === 2 ? 'sm:grid-cols-2' : cols === 4 ? 'sm:grid-cols-4' : 'sm:grid-cols-3';
    const activeItem = lightboxIdx !== null ? items[lightboxIdx] : null;
    return (
      <div className="space-y-4">
        {Boolean(c.heading) && <h3 className="text-base font-bold">{String(c.heading)}</h3>}
        <div className={`grid grid-cols-1 ${gridClass} gap-3`}>
          {items.map((item, idx) => {
            const imgSrc = sanitizeWidgetUrl(item.imageUrl, false);
            const fallbackBg = sanitizeCssColor(item.accentBg, '#111111');
            return (
              <button
                key={idx}
                type="button"
                onClick={() => {
                  setLightboxIdx(idx);
                  onEvent?.('click', `gallery_open_${idx}`);
                }}
                className="text-left overflow-hidden border transition-opacity hover:opacity-90 cursor-pointer"
                style={{ borderColor: s.borderColor, borderRadius: Math.max(4, s.borderRadiusPx - 2) }}
              >
                {imgSrc ? (
                  <img
                    src={imgSrc}
                    alt={String(item.title || `Item ${idx + 1}`)}
                    referrerPolicy="no-referrer"
                    className="w-full h-32 object-cover"
                  />
                ) : (
                  <div
                    className="w-full h-32 flex flex-col items-center justify-center text-white p-3 text-center"
                    style={{ backgroundColor: fallbackBg }}
                  >
                    <ImageIcon className="w-5 h-5 opacity-80 mb-1.5" />
                    <span className="text-xs font-semibold">{String(item.title || 'Visual Tile')}</span>
                  </div>
                )}
                <div className="p-2.5">
                  <div className="text-xs font-bold truncate">{String(item.title || '')}</div>
                  {Boolean(item.caption) && (
                    <div className="text-[11px] opacity-70 truncate mt-0.5">{String(item.caption)}</div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
        {activeItem && (
          <div
            className="p-4 border flex items-center justify-between gap-4"
            style={{ borderColor: s.accentColor, borderRadius: Math.max(4, s.borderRadiusPx - 2) }}
          >
            <div>
              <div className="text-xs font-bold">{String(activeItem.title || '')}</div>
              <div className="text-xs opacity-75">{String(activeItem.caption || '')}</div>
            </div>
            <button
              type="button"
              onClick={() => setLightboxIdx(null)}
              style={secondaryBtnStyle}
              className="px-2.5 py-1 text-xs border cursor-pointer"
            >
              Close Preview
            </button>
          </div>
        )}
      </div>
    );
  }

  if (type === 'before_after_slider') {
    const beforeImg = sanitizeWidgetUrl(c.beforeImageUrl, false);
    const afterImg = sanitizeWidgetUrl(c.afterImageUrl, false);
    const beforeBg = sanitizeCssColor(c.beforeColor, '#262626');
    const afterBg = sanitizeCssColor(c.afterColor, '#A90706');
    return (
      <div className="space-y-3">
        {Boolean(c.title) && <h3 className="text-sm font-bold">{String(c.title)}</h3>}
        <div
          className="relative w-full h-52 overflow-hidden select-none border"
          style={{ borderColor: s.borderColor, borderRadius: Math.max(4, s.borderRadiusPx - 2) }}
        >
          {/* After layer (full background) */}
          <div
            className="absolute inset-0 flex items-center justify-end pr-6 text-white font-bold text-sm"
            style={{ backgroundColor: afterBg }}
          >
            {afterImg ? (
              <img
                src={afterImg}
                alt={String(c.afterLabel || 'After')}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
            ) : (
              <span>{String(c.afterLabel || 'After')}</span>
            )}
          </div>
          {/* Before layer (clipped by splitPct) */}
          <div
            className="absolute inset-y-0 left-0 overflow-hidden flex items-center pl-6 text-white font-bold text-sm"
            style={{ width: `${splitPct}%`, backgroundColor: beforeBg }}
          >
            {beforeImg ? (
              <img
                src={beforeImg}
                alt={String(c.beforeLabel || 'Before')}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
            ) : (
              <span className="whitespace-nowrap">{String(c.beforeLabel || 'Before')}</span>
            )}
          </div>
          {/* Divider line */}
          <div
            className="absolute inset-y-0 w-0.5 bg-white shadow"
            style={{ left: `${splitPct}%` }}
          />
          <div className="absolute top-2.5 left-2.5 bg-black/70 text-white text-[11px] font-semibold px-2 py-0.5 rounded">
            {String(c.beforeLabel || 'Before')}
          </div>
          <div className="absolute top-2.5 right-2.5 bg-black/70 text-white text-[11px] font-semibold px-2 py-0.5 rounded">
            {String(c.afterLabel || 'After')}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={5}
            max={95}
            value={splitPct}
            aria-label="Before and after split percentage"
            onChange={(e) => {
              setSplitPct(Number(e.target.value));
              onEvent?.('click', 'slider_move');
            }}
            className="w-full cursor-pointer"
          />
          <span className="text-xs font-mono tabular-nums opacity-70 w-10 text-right">
            {splitPct}%
          </span>
        </div>
      </div>
    );
  }

  if (type === 'table_of_contents') {
    const items = Array.isArray(c.items) ? (c.items as Array<{ label: string; anchor: string }>) : [];
    return (
      <nav aria-label="Table of contents" className="space-y-2.5">
        <div className="flex items-center gap-2 text-xs font-bold">
          <List className="w-3.5 h-3.5" style={{ color: s.accentColor }} />
          <span>{String(c.heading || 'On This Page')}</span>
        </div>
        <ul className="space-y-1.5 text-xs">
          {items.map((item, idx) => (
            <li key={idx}>
              <a
                href={sanitizeWidgetUrl(item.anchor) || '#'}
                onClick={(e) => {
                  e.preventDefault();
                  onEvent?.('click', `toc_${idx}`);
                }}
                className="block py-0.5 opacity-80 hover:opacity-100 hover:underline"
              >
                {item.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    );
  }

  if (type === 'newsletter_popup') {
    const endpoint = sanitizeWidgetUrl(c.newsletterEndpoint, false);
    const handleSubscribe = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!nlEmail.trim() || !nlEmail.includes('@')) return;
      onEvent?.('cta_click', 'newsletter_subscribe');
      if (endpoint) {
        setNlStatus('submitting');
        try {
          const resp = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({ email: nlEmail.trim() }),
          });
          const data = await resp.json().catch(() => ({}));
          if (!resp.ok) throw new Error(data.error || 'Subscription failed.');
          setNlStatus('done');
          setNlMessage(String(data.message || c.successMessage || 'Subscribed successfully!'));
          setNlEmail('');
        } catch (err: any) {
          setNlStatus('error');
          setNlMessage(err?.message || 'Unable to reach newsletter endpoint.');
        }
      } else {
        setNlStatus('done');
        setNlMessage(String(c.successMessage || 'Subscribed successfully!'));
        setNlEmail('');
      }
    };

    return (
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-lg font-bold">{String(c.title || 'Subscribe')}</h3>
          {v.dismissible && (
            <button
              type="button"
              aria-label="Close newsletter modal"
              onClick={() => {
                onEvent?.('popup_close', 'newsletter_close');
                onDismiss?.();
              }}
              className="p-1 opacity-60 hover:opacity-100 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        <p className="text-xs opacity-80 leading-relaxed">{String(c.description || '')}</p>
        {nlStatus === 'done' ? (
          <div className="p-3 text-xs font-semibold border rounded" style={{ borderColor: s.accentColor }}>
            {nlMessage}
          </div>
        ) : (
          <form onSubmit={handleSubscribe} className="flex flex-col sm:flex-row gap-2">
            <input
              type="email"
              required
              value={nlEmail}
              onChange={(e) => setNlEmail(e.target.value)}
              placeholder={String(c.placeholder || 'you@company.com')}
              className="flex-1 px-3 py-2 text-xs border rounded bg-transparent"
              style={{ borderColor: s.borderColor, color: s.textColor }}
            />
            <button
              type="submit"
              disabled={nlStatus === 'submitting'}
              style={btnStyle}
              className="px-4 py-2 text-xs font-semibold whitespace-nowrap cursor-pointer disabled:opacity-60"
            >
              {nlStatus === 'submitting' ? 'Subscribing...' : String(c.ctaLabel || 'Subscribe')}
            </button>
          </form>
        )}
        {nlStatus === 'error' && <div className="text-xs text-[#A90706]">{nlMessage}</div>}
      </div>
    );
  }

  // exit_intent_popup
  const coupon = String(c.couponCode || 'SAVE15');
  const ctaHref = sanitizeWidgetUrl(c.ctaUrl);
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-lg font-bold leading-snug">{String(c.title || 'Before You Go')}</h3>
        {v.dismissible && (
          <button
            type="button"
            aria-label="Dismiss exit popup"
            onClick={() => {
              onEvent?.('popup_close', 'exit_close');
              onDismiss?.();
            }}
            className="p-1 opacity-60 hover:opacity-100 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
      <p className="text-xs opacity-80 leading-relaxed">{String(c.description || '')}</p>
      {coupon && (
        <div
          className="flex items-center justify-between gap-2 px-3 py-2 border border-dashed"
          style={{ borderColor: s.accentColor, borderRadius: Math.max(4, s.borderRadiusPx - 2) }}
        >
          <span className="font-mono text-sm font-bold tracking-wider">{coupon}</span>
          <button
            type="button"
            onClick={() => {
              navigator.clipboard?.writeText(coupon).catch(() => {});
              setCopiedCoupon(true);
              setTimeout(() => setCopiedCoupon(false), 1800);
              onEvent?.('click', 'copy_coupon');
            }}
            className="inline-flex items-center gap-1 text-xs font-semibold cursor-pointer"
            style={{ color: s.accentColor }}
          >
            {copiedCoupon ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copiedCoupon ? 'Copied' : 'Copy Code'}</span>
          </button>
        </div>
      )}
      <div className="flex flex-col gap-2">
        <a
          href={ctaHref || '#'}
          target={ctaHref.startsWith('http') ? '_blank' : undefined}
          rel="noopener noreferrer"
          onClick={(e) => {
            if (!ctaHref) e.preventDefault();
            onEvent?.('cta_click', 'exit_intent_cta');
          }}
          style={btnStyle}
          className="text-center px-4 py-2.5 text-xs font-semibold hover:opacity-90"
        >
          {String(c.ctaLabel || 'Apply Discount')}
        </a>
        {Boolean(c.dismissLabel) && (
          <button
            type="button"
            onClick={() => {
              onEvent?.('popup_close', 'exit_dismiss_link');
              onDismiss?.();
            }}
            className="text-xs opacity-65 hover:opacity-100 cursor-pointer"
          >
            {String(c.dismissLabel)}
          </button>
        )}
      </div>
    </div>
  );
};
