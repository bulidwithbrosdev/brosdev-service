import React, { useState } from 'react';
import {
  MessageCircle,
  Clock,
  MapPin,
  Calendar,
  Star,
  Mail,
  Phone,
  Globe,
  Download,
  ExternalLink,
  X,
  Check,
} from 'lucide-react';
import type { WidgetPartProps } from './uiWidgetsPart1';
import { sanitizeWidgetUrl } from '../widgets/security';

export const BusinessWidgets: React.FC<WidgetPartProps> = ({ type, config, onEvent, onDismiss }) => {
  const c = config.content || {};
  const s = config.style;
  const v = config.visibility;

  // Contact / Lead form states
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [extra, setExtra] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [formError, setFormError] = useState('');

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

  const handleEndpointSubmit = async (
    e: React.FormEvent,
    endpointRaw: unknown,
    eventLabel: string,
    payload: Record<string, string>
  ) => {
    e.preventDefault();
    setFormError('');
    onEvent?.('cta_click', eventLabel);
    const endpoint = sanitizeWidgetUrl(endpointRaw, false);
    if (!endpoint) {
      setSubmitted(true);
      setName('');
      setEmail('');
      setExtra('');
      return;
    }
    setSubmitting(true);
    try {
      const resp = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(json.error || 'Submission failed.');
      setSubmitted(true);
      setName('');
      setEmail('');
      setExtra('');
    } catch (err: any) {
      setFormError(err?.message || 'Unable to submit form.');
    } finally {
      setSubmitting(false);
    }
  };

  if (type === 'whatsapp_chat') {
    const cleanPhone = String(c.phoneNumber || '').replace(/[^\d]/g, '');
    const prefill = encodeURIComponent(String(c.prefillMessage || 'Hello!'));
    const waUrl = cleanPhone ? `https://wa.me/${cleanPhone}?text=${prefill}` : 'https://wa.me/';
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-3 pb-2.5 border-b" style={{ borderColor: s.borderColor }}>
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center text-white shrink-0"
            style={{ backgroundColor: s.accentColor }}
          >
            <MessageCircle className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-bold truncate">{String(c.agentName || 'WhatsApp Support')}</div>
            <div className="text-[11px] opacity-70 truncate">{String(c.agentRole || '')}</div>
          </div>
        </div>
        <div
          className="p-3 text-xs leading-relaxed border"
          style={{ borderColor: s.borderColor, borderRadius: Math.max(4, s.borderRadiusPx - 2) }}
        >
          {String(c.welcomeMessage || 'Hi! How can we help?')}
        </div>
        <a
          href={waUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => onEvent?.('cta_click', 'whatsapp_open')}
          style={btnStyle}
          className="flex items-center justify-center gap-2 w-full py-2.5 text-xs font-semibold hover:opacity-90"
        >
          <MessageCircle className="w-4 h-4" />
          <span>{String(c.buttonLabel || 'Chat on WhatsApp')}</span>
        </a>
      </div>
    );
  }

  if (type === 'contact_widget') {
    return (
      <div className="space-y-3">
        <div>
          <h3 className="text-base font-bold">{String(c.title || 'Contact Us')}</h3>
          {Boolean(c.subtitle) && <p className="text-xs opacity-75 mt-0.5">{String(c.subtitle)}</p>}
        </div>
        {submitted ? (
          <div className="p-3 text-xs font-semibold border rounded flex items-center gap-2" style={{ borderColor: s.accentColor }}>
            <Check className="w-4 h-4 shrink-0" style={{ color: s.accentColor }} />
            <span>{String(c.successMessage || 'Message sent!')}</span>
          </div>
        ) : (
          <form
            onSubmit={(e) =>
              handleEndpointSubmit(e, c.formEndpoint, 'contact_widget_submit', {
                name,
                email,
                message: extra,
              })
            }
            className="space-y-2.5"
          >
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={String(c.namePlaceholder || 'Your name')}
              className="w-full px-3 py-2 text-xs border rounded bg-transparent"
              style={{ borderColor: s.borderColor, color: s.textColor }}
            />
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={String(c.emailPlaceholder || 'Email address')}
              className="w-full px-3 py-2 text-xs border rounded bg-transparent"
              style={{ borderColor: s.borderColor, color: s.textColor }}
            />
            <textarea
              rows={3}
              required
              value={extra}
              onChange={(e) => setExtra(e.target.value)}
              placeholder={String(c.messagePlaceholder || 'How can we help?')}
              className="w-full px-3 py-2 text-xs border rounded bg-transparent"
              style={{ borderColor: s.borderColor, color: s.textColor }}
            />
            {formError && <div className="text-xs text-[#A90706]">{formError}</div>}
            <button
              type="submit"
              disabled={submitting}
              style={btnStyle}
              className="w-full py-2 text-xs font-semibold cursor-pointer disabled:opacity-60"
            >
              {submitting ? 'Sending...' : String(c.submitLabel || 'Send Inquiry')}
            </button>
          </form>
        )}
      </div>
    );
  }

  if (type === 'business_hours') {
    const schedule = Array.isArray(c.schedule)
      ? (c.schedule as Array<{ day: string; hours: string }>)
      : [];
    return (
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-1.5 font-bold text-sm">
              <Clock className="w-4 h-4" style={{ color: s.accentColor }} />
              <span>{String(c.businessName || 'Business Hours')}</span>
            </div>
            {Boolean(c.timezoneLabel) && (
              <div className="text-[11px] opacity-70 mt-0.5">{String(c.timezoneLabel)}</div>
            )}
          </div>
          {Boolean(c.currentStatusText) && (
            <span className="text-xs font-semibold shrink-0" style={{ color: s.accentColor }}>
              {String(c.currentStatusText)}
            </span>
          )}
        </div>
        <div className="divide-y text-xs" style={{ borderColor: s.borderColor }}>
          {schedule.map((row, idx) => (
            <div
              key={idx}
              className="py-1.5 flex items-center justify-between gap-3"
              style={{ borderColor: s.borderColor }}
            >
              <span className="font-medium">{row.day}</span>
              <span className="font-mono tabular-nums opacity-80">{row.hours}</span>
            </div>
          ))}
        </div>
        {Boolean(c.phone) && (
          <a
            href={`tel:${String(c.phone)}`}
            onClick={() => onEvent?.('cta_click', 'hours_phone')}
            className="inline-flex items-center gap-1.5 text-xs font-semibold hover:underline"
            style={{ color: s.accentColor }}
          >
            <Phone className="w-3.5 h-3.5" />
            <span>{String(c.phone)}</span>
          </a>
        )}
      </div>
    );
  }

  if (type === 'google_maps_embed') {
    const queryStr = encodeURIComponent(String(c.mapQuery || c.address || 'San Francisco, CA'));
    const embedUrl = `https://maps.google.com/maps?q=${queryStr}&t=&z=14&ie=UTF8&iwloc=&output=embed`;
    const externalUrl = `https://www.google.com/maps/search/?api=1&query=${queryStr}`;
    const mapHeight = Math.min(520, Math.max(160, Number(c.mapHeightPx || 240)));

    return (
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-1.5 font-bold text-sm">
              <MapPin className="w-4 h-4" style={{ color: s.accentColor }} />
              <span>{String(c.locationName || 'Our Location')}</span>
            </div>
            <div className="text-xs opacity-75 mt-0.5">{String(c.address || '')}</div>
          </div>
          <a
            href={externalUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => onEvent?.('cta_click', 'maps_directions')}
            style={btnStyle}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold whitespace-nowrap"
          >
            <span>{String(c.directionsLabel || 'Directions')}</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
        <iframe
          title={String(c.locationName || 'Location map')}
          src={embedUrl}
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          className="w-full border"
          style={{
            height: mapHeight,
            borderColor: s.borderColor,
            borderRadius: Math.max(4, s.borderRadiusPx - 2),
          }}
        />
      </div>
    );
  }

  if (type === 'appointment_cta') {
    const bookingHref = sanitizeWidgetUrl(c.bookingUrl);
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-xs font-semibold" style={{ color: s.accentColor }}>
          <Calendar className="w-4 h-4" />
          <span>{String(c.durationLabel || '30 min · Free Consultation')}</span>
        </div>
        <h3 className="text-lg font-bold leading-snug">{String(c.title || 'Book an Appointment')}</h3>
        <p className="text-xs opacity-80 leading-relaxed">{String(c.description || '')}</p>
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <span className="text-xs opacity-70">{String(c.availabilityNote || '')}</span>
          <a
            href={bookingHref || '#'}
            target={bookingHref.startsWith('http') ? '_blank' : undefined}
            rel="noopener noreferrer"
            onClick={(e) => {
              if (!bookingHref) e.preventDefault();
              onEvent?.('cta_click', 'appointment_book');
            }}
            style={btnStyle}
            className="px-4 py-2 text-xs font-semibold whitespace-nowrap hover:opacity-90"
          >
            {String(c.ctaLabel || 'Book Now')}
          </a>
        </div>
      </div>
    );
  }

  if (type === 'customer_review_display') {
    const reviews = Array.isArray(c.reviews) ? (c.reviews as Array<Record<string, any>>) : [];
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-base font-bold">{String(c.heading || 'Customer Reviews')}</h3>
          {Boolean(c.averageScore) && (
            <span className="font-mono text-xs font-bold tabular-nums" style={{ color: s.accentColor }}>
              {String(c.averageScore)}
            </span>
          )}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {reviews.map((rev, idx) => (
            <div
              key={idx}
              className="p-3.5 border space-y-2 flex flex-col justify-between"
              style={{ borderColor: s.borderColor, borderRadius: Math.max(4, s.borderRadiusPx - 2) }}
            >
              <div className="space-y-2">
                <div className="flex items-center gap-0.5">
                  {Array.from({ length: Math.min(5, Math.max(1, Number(rev.rating || 5))) }).map((_, j) => (
                    <Star
                      key={j}
                      className="w-3.5 h-3.5 fill-current"
                      style={{ color: s.accentColor }}
                    />
                  ))}
                </div>
                <p className="text-xs leading-relaxed opacity-85">&ldquo;{String(rev.comment || '')}&rdquo;</p>
              </div>
              <div className="text-[11px] pt-2 border-t" style={{ borderColor: s.borderColor }}>
                <div className="font-bold">{String(rev.author || '')}</div>
                <div className="opacity-70">
                  {String(rev.company || '')} {rev.date ? `· ${String(rev.date)}` : ''}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (type === 'lead_capture_popup') {
    return (
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="text-lg font-bold">{String(c.title || 'Request Proposal')}</h3>
            {Boolean(c.subtitle) && <p className="text-xs opacity-80 mt-0.5">{String(c.subtitle)}</p>}
          </div>
          {v.dismissible && (
            <button
              type="button"
              aria-label="Close lead modal"
              onClick={() => {
                onEvent?.('popup_close', 'lead_popup_close');
                onDismiss?.();
              }}
              className="p-1 opacity-60 hover:opacity-100 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        {submitted ? (
          <div className="p-3 text-xs font-semibold border rounded" style={{ borderColor: s.accentColor }}>
            {String(c.successMessage || 'Request submitted!')}
          </div>
        ) : (
          <form
            onSubmit={(e) =>
              handleEndpointSubmit(e, c.formEndpoint, 'lead_capture_submit', {
                name,
                email,
                company: extra,
              })
            }
            className="space-y-2.5"
          >
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Full Name"
              className="w-full px-3 py-2 text-xs border rounded bg-transparent"
              style={{ borderColor: s.borderColor, color: s.textColor }}
            />
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Work Email"
              className="w-full px-3 py-2 text-xs border rounded bg-transparent"
              style={{ borderColor: s.borderColor, color: s.textColor }}
            />
            <input
              type="text"
              value={extra}
              onChange={(e) => setExtra(e.target.value)}
              placeholder="Company / Website URL"
              className="w-full px-3 py-2 text-xs border rounded bg-transparent"
              style={{ borderColor: s.borderColor, color: s.textColor }}
            />
            {formError && <div className="text-xs text-[#A90706]">{formError}</div>}
            <button
              type="submit"
              disabled={submitting}
              style={btnStyle}
              className="w-full py-2.5 text-xs font-semibold cursor-pointer disabled:opacity-60"
            >
              {submitting ? 'Submitting...' : String(c.ctaLabel || 'Request Proposal')}
            </button>
          </form>
        )}
      </div>
    );
  }

  // digital_business_card
  const websiteHref = sanitizeWidgetUrl(c.website);
  const linkedinHref = sanitizeWidgetUrl(c.linkedinUrl);
  const fullName = String(c.fullName || 'Founder Name');
  const initials = fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() || '')
    .join('');

  const downloadVcard = () => {
    onEvent?.('cta_click', 'download_vcard');
    const lines = [
      'BEGIN:VCARD',
      'VERSION:3.0',
      `FN:${fullName}`,
      c.company ? `ORG:${String(c.company)}` : '',
      c.role ? `TITLE:${String(c.role)}` : '',
      c.phone ? `TEL:${String(c.phone)}` : '',
      c.email ? `EMAIL:${String(c.email)}` : '',
      websiteHref ? `URL:${websiteHref}` : '',
      'END:VCARD',
    ].filter(Boolean);
    const blob = new Blob([lines.join('\r\n')], { type: 'text/vcard;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${fullName.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'contact'}.vcf`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col items-center text-center space-y-2">
        <div
          className="w-14 h-14 rounded-full flex items-center justify-center text-base font-bold text-white"
          style={{ backgroundColor: s.accentColor }}
        >
          {initials || 'BD'}
        </div>
        <div>
          <h3 className="text-base font-bold">{fullName}</h3>
          <div className="text-xs opacity-75">
            {String(c.role || '')}
            {c.company ? ` · ${String(c.company)}` : ''}
          </div>
        </div>
        {Boolean(c.bio) && <p className="text-xs opacity-80 leading-relaxed max-w-xs">{String(c.bio)}</p>}
      </div>

      <div className="space-y-1.5 text-xs text-left border-t pt-3" style={{ borderColor: s.borderColor }}>
        {Boolean(c.email) && (
          <a
            href={`mailto:${String(c.email)}`}
            onClick={() => onEvent?.('click', 'vcard_email')}
            className="flex items-center gap-2 py-1 hover:underline"
          >
            <Mail className="w-3.5 h-3.5 shrink-0" style={{ color: s.accentColor }} />
            <span className="truncate">{String(c.email)}</span>
          </a>
        )}
        {Boolean(c.phone) && (
          <a
            href={`tel:${String(c.phone)}`}
            onClick={() => onEvent?.('click', 'vcard_phone')}
            className="flex items-center gap-2 py-1 hover:underline"
          >
            <Phone className="w-3.5 h-3.5 shrink-0" style={{ color: s.accentColor }} />
            <span>{String(c.phone)}</span>
          </a>
        )}
        {websiteHref && (
          <a
            href={websiteHref}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => onEvent?.('click', 'vcard_website')}
            className="flex items-center gap-2 py-1 hover:underline"
          >
            <Globe className="w-3.5 h-3.5 shrink-0" style={{ color: s.accentColor }} />
            <span className="truncate">{websiteHref}</span>
          </a>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={downloadVcard}
          style={btnStyle}
          className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 px-3 text-xs font-semibold cursor-pointer"
        >
          <Download className="w-3.5 h-3.5" />
          <span>{String(c.saveVcardLabel || 'Save Contact')}</span>
        </button>
        {linkedinHref && (
          <a
            href={linkedinHref}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => onEvent?.('click', 'vcard_linkedin')}
            style={secondaryBtnStyle}
            className="inline-flex items-center justify-center gap-1 py-2 px-3 text-xs font-semibold border"
          >
            <span>Profile</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        )}
      </div>
    </div>
  );
};
