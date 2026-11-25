import type { EmailBlock, EmailDesignSettings, EmailSenderSettingsRecord } from './types';
import { DEFAULT_DESIGN_SETTINGS } from './types';

export function escapeHtml(input: unknown): string {
  return String(input ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function sanitizeEmailUrl(raw: unknown, fallback = '#'): string {
  const val = String(raw ?? '').trim();
  if (!val) return fallback;
  if (val === '{{unsubscribe_url}}') return val;
  if (/^https?:\/\//i.test(val) || /^mailto:/i.test(val)) {
    try {
      const parsed = new URL(val);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:' || parsed.protocol === 'mailto:') {
        return parsed.toString();
      }
    } catch {
      return fallback;
    }
  }
  return fallback;
}

export function sanitizeHexColor(raw: unknown, fallback: string): string {
  const val = String(raw ?? '').trim();
  if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(val)) return val;
  return fallback;
}

function renderMultilineHtml(text: string): string {
  return escapeHtml(text).replace(/\r?\n/g, '<br />');
}

export interface CompileEmailOptions {
  subject: string;
  previewText?: string;
  blocks: EmailBlock[];
  design?: Partial<EmailDesignSettings>;
  senderSettings?: Partial<EmailSenderSettingsRecord> | null;
  unsubscribeUrl?: string;
  removeBranding?: boolean;
  personalization?: Record<string, string>;
}

export function interpolatePersonalization(
  input: string,
  vars?: Record<string, string>
): string {
  if (!vars) return input;
  return input.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (match, key) => {
    const k = String(key);
    if (k === 'unsubscribe_url') return match;
    return Object.prototype.hasOwnProperty.call(vars, k) ? vars[k] : '';
  });
}

function renderBlockHtml(
  block: EmailBlock,
  design: EmailDesignSettings,
  unsubscribeUrl: string,
  senderSettings?: Partial<EmailSenderSettingsRecord> | null,
  vars?: Record<string, string>
): string {
  const align = block.align === 'center' || block.align === 'right' ? block.align : 'left';
  const py = Math.max(4, Math.min(64, Number(block.paddingY ?? 16)));
  const bg = block.backgroundColor ? sanitizeHexColor(block.backgroundColor, 'transparent') : 'transparent';
  const textColor = sanitizeHexColor(block.textColor, design.textColor);
  const interp = (s?: string) => interpolatePersonalization(String(s || ''), vars);

  switch (block.type) {
    case 'header': {
      const logoUrl = sanitizeEmailUrl(block.logoUrl || senderSettings?.companyLogoUrl, '');
      const brand = escapeHtml(interp(block.brandName || senderSettings?.companyName || 'BrosDev Studio'));
      const tagline = escapeHtml(interp(block.tagline || ''));
      const headerBg = sanitizeHexColor(block.backgroundColor, '#111111');
      const headerText = sanitizeHexColor(block.textColor, '#FFFFFF');
      return `
        <tr>
          <td align="${align}" style="background-color:${headerBg};padding:${py}px 28px;color:${headerText};font-family:${design.fontFamily};">
            ${
              logoUrl && logoUrl !== '#'
                ? `<img src="${escapeHtml(logoUrl)}" alt="${brand}" height="32" style="display:inline-block;height:32px;max-width:180px;border:0;margin-bottom:8px;" />`
                : ''
            }
            <div style="font-size:18px;font-weight:700;letter-spacing:-0.01em;color:${headerText};">${brand}</div>
            ${tagline ? `<div style="font-size:12px;color:${headerText};opacity:0.82;margin-top:4px;">${tagline}</div>` : ''}
          </td>
        </tr>`;
    }

    case 'heading': {
      const level = block.headingLevel || 'h1';
      const fontSize = level === 'h1' ? 26 : level === 'h2' ? 20 : 16;
      const lineHeight = level === 'h1' ? '34px' : level === 'h2' ? '28px' : '24px';
      return `
        <tr>
          <td align="${align}" style="background-color:${bg};padding:${py}px 28px 8px 28px;font-family:${design.fontFamily};">
            <div style="margin:0;font-size:${fontSize}px;line-height:${lineHeight};font-weight:700;color:${textColor};letter-spacing:-0.02em;">
              ${escapeHtml(interp(block.title || 'Campaign Heading'))}
            </div>
          </td>
        </tr>`;
    }

    case 'text': {
      return `
        <tr>
          <td align="${align}" style="background-color:${bg};padding:${py}px 28px;font-family:${design.fontFamily};font-size:15px;line-height:24px;color:${textColor};">
            ${renderMultilineHtml(interp(block.body || ''))}
          </td>
        </tr>`;
    }

    case 'button': {
      const btnBg = sanitizeHexColor(block.buttonColor, design.primaryColor);
      const btnText = sanitizeHexColor(block.buttonTextColor, '#FFFFFF');
      const radius = Math.max(0, Math.min(32, Number(block.buttonRadius ?? 6)));
      const href = sanitizeEmailUrl(block.buttonUrl, 'https://forms.brosdev.info');
      const label = escapeHtml(interp(block.buttonLabel || 'Learn More'));
      return `
        <tr>
          <td align="${align}" style="background-color:${bg};padding:${py}px 28px;font-family:${design.fontFamily};">
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="${align === 'center' ? 'center' : align === 'right' ? 'right' : 'left'}">
              <tr>
                <td align="center" bgcolor="${btnBg}" style="border-radius:${radius}px;">
                  <a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:12px 24px;font-family:${design.fontFamily};font-size:14px;font-weight:700;color:${btnText};text-decoration:none;border-radius:${radius}px;background-color:${btnBg};">
                    ${label}
                  </a>
                </td>
              </tr>
            </table>
          </td>
        </tr>`;
    }

    case 'image': {
      const imgUrl = sanitizeEmailUrl(block.imageUrl, '');
      const alt = escapeHtml(interp(block.imageAlt || 'Campaign visual'));
      const caption = escapeHtml(interp(block.caption || ''));
      const link = sanitizeEmailUrl(block.imageLink, '');
      if (!imgUrl || imgUrl === '#') {
        return `
          <tr>
            <td align="center" style="background-color:${bg};padding:${py}px 28px;font-family:${design.fontFamily};">
              <div style="border:1px dashed #D4D4D8;background-color:#FAFAFA;padding:28px;border-radius:8px;color:#71717A;font-size:13px;">
                Add an HTTPS image URL in the block settings
              </div>
            </td>
          </tr>`;
      }
      const imgTag = `<img src="${escapeHtml(imgUrl)}" alt="${alt}" width="544" style="display:block;width:100%;max-width:544px;height:auto;border:0;border-radius:6px;" />`;
      return `
        <tr>
          <td align="${align}" style="background-color:${bg};padding:${py}px 28px;font-family:${design.fontFamily};">
            ${link && link !== '#' ? `<a href="${escapeHtml(link)}" target="_blank" rel="noopener noreferrer">${imgTag}</a>` : imgTag}
            ${caption ? `<div style="font-size:12px;color:${design.mutedTextColor};margin-top:8px;">${caption}</div>` : ''}
          </td>
        </tr>`;
    }

    case 'gallery': {
      const items = (block.galleryItems || []).slice(0, 4);
      if (items.length === 0) return '';
      const cells = items.slice(0, 2).map((item) => {
        const src = sanitizeEmailUrl(item.imageUrl, '');
        const link = sanitizeEmailUrl(item.linkUrl, '');
        const alt = escapeHtml(interp(item.alt || 'Gallery item'));
        const cap = escapeHtml(interp(item.caption || ''));
        const inner =
          src && src !== '#'
            ? `<img src="${escapeHtml(src)}" alt="${alt}" width="260" style="display:block;width:100%;max-width:260px;height:auto;border:0;border-radius:6px;" />`
            : `<div style="border:1px dashed #D4D4D8;background:#FAFAFA;padding:20px;text-align:center;color:#71717A;font-size:12px;border-radius:6px;">Image URL</div>`;
        return `
          <td width="50%" valign="top" style="padding:6px;">
            ${link && link !== '#' ? `<a href="${escapeHtml(link)}" target="_blank" rel="noopener noreferrer">${inner}</a>` : inner}
            ${cap ? `<div style="font-size:12px;color:${design.mutedTextColor};margin-top:6px;">${cap}</div>` : ''}
          </td>`;
      });
      return `
        <tr>
          <td style="background-color:${bg};padding:${py}px 22px;font-family:${design.fontFamily};">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
              <tr>${cells.join('')}</tr>
            </table>
          </td>
        </tr>`;
    }

    case 'divider': {
      const lineColor = sanitizeHexColor(block.dividerColor, '#E5E7EB');
      return `
        <tr>
          <td style="background-color:${bg};padding:${py}px 28px;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
              <tr>
                <td style="border-top:1px solid ${lineColor};font-size:1px;line-height:1px;">&nbsp;</td>
              </tr>
            </table>
          </td>
        </tr>`;
    }

    case 'spacer': {
      const h = Math.max(8, Math.min(80, Number(block.spacerHeight ?? 20)));
      return `
        <tr>
          <td height="${h}" style="font-size:1px;line-height:${h}px;">&nbsp;</td>
        </tr>`;
    }

    case 'social': {
      const links = (block.socialLinks || []).filter((l) => l.label && l.url).slice(0, 6);
      if (links.length === 0) return '';
      const anchors = links
        .map((l) => {
          const href = sanitizeEmailUrl(l.url, '#');
          return `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer" style="display:inline-block;margin:0 8px;font-family:${design.fontFamily};font-size:13px;font-weight:600;color:${design.primaryColor};text-decoration:none;">${escapeHtml(l.label)}</a>`;
        })
        .join(' &middot; ');
      return `
        <tr>
          <td align="${align}" style="background-color:${bg};padding:${py}px 28px;font-family:${design.fontFamily};">
            ${anchors}
          </td>
        </tr>`;
    }

    case 'footer': {
      const company = escapeHtml(
        interp(block.companyName || senderSettings?.companyName || 'BrosDev Developer Services')
      );
      const address = escapeHtml(
        interp(block.companyAddress || senderSettings?.companyAddress || '548 Market Street, San Francisco, CA 94104')
      );
      const note = escapeHtml(
        interp(
          block.footerNote ||
            senderSettings?.defaultFooter ||
            'You are receiving this email because you subscribed to updates.'
        )
      );
      const unsubLabel = escapeHtml(block.unsubscribeLabel || 'Unsubscribe');
      return `
        <tr>
          <td align="center" style="background-color:#FAFAFA;border-top:1px solid #E5E7EB;padding:20px 28px;font-family:${design.fontFamily};font-size:12px;line-height:19px;color:${design.mutedTextColor};">
            <div style="font-weight:700;color:#111111;margin-bottom:4px;">${company}</div>
            <div>${address}</div>
            <div style="margin-top:6px;">${note}</div>
            <div style="margin-top:10px;">
              <a href="${escapeHtml(unsubscribeUrl)}" style="color:${design.primaryColor};text-decoration:underline;">${unsubLabel}</a>
            </div>
          </td>
        </tr>`;
    }

    default:
      return '';
  }
}

export function compileEmailHtml(options: CompileEmailOptions): string {
  const design: EmailDesignSettings = {
    ...DEFAULT_DESIGN_SETTINGS,
    ...(options.design || {}),
  };
  const unsubscribeUrl = options.unsubscribeUrl || '{{unsubscribe_url}}';
  const safeBg = sanitizeHexColor(design.backgroundColor, '#F5F5F5');
  const safeContentBg = sanitizeHexColor(design.contentBackgroundColor, '#FFFFFF');
  const maxWidth = Math.max(480, Math.min(700, Number(design.maxWidth || 600)));
  const radius = Math.max(0, Math.min(20, Number(design.borderRadius ?? 10)));

  const hasFooter = options.blocks.some((b) => b.type === 'footer');
  const blocksToRender: EmailBlock[] = hasFooter
    ? options.blocks
    : [
        ...options.blocks,
        {
          id: 'auto-compliance-footer',
          type: 'footer',
          companyName: options.senderSettings?.companyName || 'BrosDev Developer Services',
          companyAddress: options.senderSettings?.companyAddress || '',
          footerNote:
            options.senderSettings?.defaultFooter ||
            'You received this email because you opted in to receive updates.',
          unsubscribeLabel: 'Unsubscribe from future marketing emails',
        },
      ];

  const rowsHtml = blocksToRender
    .map((b) => renderBlockHtml(b, design, unsubscribeUrl, options.senderSettings, options.personalization))
    .join('\n');

  const brandingRow = options.removeBranding
    ? ''
    : `
      <tr>
        <td align="center" style="padding:14px 20px;font-family:${design.fontFamily};font-size:11px;color:#71717A;">
          Sent via <strong style="color:#111111;">BrosDev Developer Services</strong> &mdash; Build. Connect. Grow.
        </td>
      </tr>`;

  const previewHidden = options.previewText
    ? `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:${safeBg};">${escapeHtml(
        interpolatePersonalization(options.previewText, options.personalization)
      )}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(interpolatePersonalization(options.subject || 'Campaign Preview', options.personalization))}</title>
</head>
<body style="margin:0;padding:0;background-color:${safeBg};-webkit-font-smoothing:antialiased;">
  ${previewHidden}
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:${safeBg};padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:${maxWidth}px;background-color:${safeContentBg};border:1px solid #E5E7EB;border-radius:${radius}px;overflow:hidden;">
          ${rowsHtml}
        </table>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:${maxWidth}px;">
          ${brandingRow}
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function compileEmailText(options: CompileEmailOptions): string {
  const parts: string[] = [];
  const interp = (s?: string) => interpolatePersonalization(String(s || ''), options.personalization);
  for (const b of options.blocks) {
    if (b.type === 'header') {
      parts.push(interp(b.brandName || options.senderSettings?.companyName || ''));
      if (b.tagline) parts.push(interp(b.tagline));
    } else if (b.type === 'heading' && b.title) {
      parts.push(`\n${interp(b.title).toUpperCase()}\n`);
    } else if (b.type === 'text' && b.body) {
      parts.push(interp(b.body));
    } else if (b.type === 'button') {
      const url = sanitizeEmailUrl(b.buttonUrl, '');
      parts.push(`${interp(b.buttonLabel || 'Open link')}: ${url}`);
    } else if (b.type === 'divider') {
      parts.push('----------------------------------------');
    } else if (b.type === 'social' && b.socialLinks) {
      parts.push(b.socialLinks.map((l) => `${l.label}: ${sanitizeEmailUrl(l.url, '')}`).join(' | '));
    } else if (b.type === 'footer') {
      parts.push(
        `\n${interp(b.companyName || options.senderSettings?.companyName || '')}\n${interp(
          b.companyAddress || options.senderSettings?.companyAddress || ''
        )}\n${interp(b.footerNote || '')}`
      );
    }
  }
  const unsub = options.unsubscribeUrl || '{{unsubscribe_url}}';
  parts.push(`\nUnsubscribe: ${unsub}`);
  return parts.filter(Boolean).join('\n\n').slice(0, 58000);
}

/**
 * Neutralizes CSV formula injection (=, +, -, @, tab, CR) before RFC-4180 quoting.
 */
export function escapeCsvCell(raw: unknown): string {
  let str = String(raw ?? '');
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export interface ParsedCsvResult {
  headers: string[];
  rows: Record<string, string>[];
}

export function parseSubscribersCsv(csvText: string, maxRows = 5000): ParsedCsvResult {
  const cleaned = String(csvText || '').replace(/^\uFEFF/, '');
  const lines: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < cleaned.length; i += 1) {
    const ch = cleaned[i];
    const next = cleaned[i + 1];
    if (inQuotes) {
      if (ch === '"' && next === '"') {
        field += '"';
        i += 1;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field.trim());
      field = '';
    } else if (ch === '\r' && next === '\n') {
      row.push(field.trim());
      if (row.some((cell) => cell !== '')) lines.push(row);
      row = [];
      field = '';
      i += 1;
    } else if (ch === '\n' || ch === '\r') {
      row.push(field.trim());
      if (row.some((cell) => cell !== '')) lines.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field.trim());
    if (row.some((cell) => cell !== '')) lines.push(row);
  }

  if (lines.length < 2) {
    return { headers: lines[0] || [], rows: [] };
  }

  const headers = lines[0].map((h) => h.trim());
  const rows: Record<string, string>[] = [];
  for (let r = 1; r < Math.min(lines.length, maxRows + 1); r += 1) {
    const record: Record<string, string> = {};
    for (let c = 0; c < headers.length; c += 1) {
      if (headers[c]) {
        record[headers[c]] = String(lines[r][c] || '').trim();
      }
    }
    rows.push(record);
  }
  return { headers, rows };
}
