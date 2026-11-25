/**
 * Security utilities for BrosDev Phase 2 Website Components & Widgets:
 * - Safe URL validation (blocks javascript:, data:, vbscript:)
 * - Safe Custom CSS validation, dangerous-pattern rejection, and widget scoping
 * - Domain normalization and subdomain matching
 */

export const MAX_CUSTOM_CSS_BYTES = 8192;

export interface CssValidationResult {
  valid: boolean;
  errors: string[];
  sanitizedCss: string;
  scopedCss: string;
}

const FORBIDDEN_CSS_PATTERNS: Array<{ regex: RegExp; reason: string }> = [
  { regex: /@import\b/i, reason: '@import rules are blocked for security and performance.' },
  { regex: /expression\s*\(/i, reason: 'Legacy CSS expression() calls are not allowed.' },
  { regex: /javascript\s*:/i, reason: 'javascript: URLs are strictly prohibited in CSS.' },
  { regex: /vbscript\s*:/i, reason: 'vbscript: URLs are strictly prohibited in CSS.' },
  { regex: /data\s*:\s*text\/html/i, reason: 'HTML data URIs are not allowed in CSS.' },
  { regex: /behavior\s*:/i, reason: 'CSS behavior properties are not allowed.' },
  { regex: /-moz-binding\s*:/i, reason: '-moz-binding properties are not allowed.' },
  { regex: /<\s*\/?\s*style/i, reason: 'HTML style tags cannot appear inside custom CSS.' },
  { regex: /<\s*script/i, reason: 'Script tags cannot appear inside custom CSS.' },
  { regex: /@charset\b/i, reason: '@charset rules are not allowed inside scoped widget CSS.' },
  {
    regex: /position\s*:\s*fixed\s*;\s*(inset\s*:\s*0|width\s*:\s*100vw)/i,
    reason: 'Fullscreen host-hijacking overlays via custom CSS are restricted.',
  },
];

export function sanitizeWidgetUrl(raw: unknown, allowMailtoTel = true): string {
  if (typeof raw !== 'string') return '';
  const trimmed = raw.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('#') || trimmed.startsWith('/')) {
    return trimmed.slice(0, 500);
  }
  try {
    const parsed = new URL(trimmed);
    const proto = parsed.protocol.toLowerCase();
    if (proto === 'https:' || proto === 'http:') {
      return parsed.toString().slice(0, 1000);
    }
    if (allowMailtoTel && (proto === 'mailto:' || proto === 'tel:')) {
      return trimmed.slice(0, 300);
    }
    return '';
  } catch {
    return '';
  }
}

export function sanitizeCssColor(raw: unknown, fallback = '#111111'): string {
  if (typeof raw !== 'string') return fallback;
  const trimmed = raw.trim();
  if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(trimmed)) {
    return trimmed;
  }
  if (/^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}(\s*,\s*(0|1|0?\.\d+))?\s*\)$/.test(trimmed)) {
    return trimmed;
  }
  if (trimmed === 'transparent') return trimmed;
  return fallback;
}

export function validateAndScopeCustomCss(
  rawCss: string,
  scopeSelector = '.bd-widget-scope'
): CssValidationResult {
  const input = String(rawCss || '').trim();
  if (!input) {
    return { valid: true, errors: [], sanitizedCss: '', scopedCss: '' };
  }

  const errors: string[] = [];

  if (input.length > MAX_CUSTOM_CSS_BYTES) {
    errors.push(`Custom CSS exceeds maximum size of ${MAX_CUSTOM_CSS_BYTES} characters.`);
  }

  for (const rule of FORBIDDEN_CSS_PATTERNS) {
    if (rule.regex.test(input)) {
      errors.push(rule.reason);
    }
  }

  // Strip block comments before brace-balance validation
  const withoutComments = input.replace(/\/\*[\s\S]*?\*\//g, '');
  let depth = 0;
  for (let i = 0; i < withoutComments.length; i += 1) {
    const ch = withoutComments[i];
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth < 0) {
        errors.push('Unmatched closing brace "}" detected in Custom CSS.');
        break;
      }
    }
  }
  if (depth > 0) {
    errors.push('Unclosed CSS block "{" detected in Custom CSS.');
  }

  if (errors.length > 0) {
    return {
      valid: false,
      errors,
      sanitizedCss: input,
      scopedCss: '',
    };
  }

  // Scope selectors safely so host page elements (body, html, *, nav, etc.) can never be modified
  const scopedCss = scopeCssBlocks(withoutComments, scopeSelector);
  return {
    valid: true,
    errors: [],
    sanitizedCss: input,
    scopedCss,
  };
}

function scopeCssBlocks(css: string, scopeSelector: string): string {
  // Handle simple @media blocks + top-level rule blocks
  const out: string[] = [];
  let i = 0;
  const len = css.length;

  while (i < len) {
    while (i < len && /\s/.test(css[i])) i += 1;
    if (i >= len) break;

    const openIdx = css.indexOf('{', i);
    if (openIdx === -1) break;
    const prelude = css.slice(i, openIdx).trim();

    // Find matching closing brace
    let depth = 1;
    let cursor = openIdx + 1;
    while (cursor < len && depth > 0) {
      if (css[cursor] === '{') depth += 1;
      else if (css[cursor] === '}') depth -= 1;
      cursor += 1;
    }
    const body = css.slice(openIdx + 1, cursor - 1).trim();
    i = cursor;

    if (!prelude || !body) continue;

    if (prelude.startsWith('@media') || prelude.startsWith('@supports')) {
      out.push(`${prelude} { ${scopeCssBlocks(body, scopeSelector)} }`);
    } else if (prelude.startsWith('@keyframes')) {
      out.push(`${prelude} { ${body} }`);
    } else if (prelude.startsWith('@')) {
      // Skip unsupported at-rules
      continue;
    } else {
      const selectors = prelude
        .split(',')
        .map((sel) => sel.trim())
        .filter(Boolean)
        .map((sel) => {
          if (sel === ':host' || sel === ':root' || sel === 'body' || sel === 'html') {
            return scopeSelector;
          }
          if (sel.startsWith(scopeSelector)) return sel;
          return `${scopeSelector} ${sel}`;
        });
      if (selectors.length > 0) {
        out.push(`${selectors.join(', ')} { ${body} }`);
      }
    }
  }

  return out.join('\n');
}

export function normalizeWidgetDomain(raw: string): string {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .replace(/:\d+$/, '')
    .replace(/^\*\./, '')
    .replace(/[^a-z0-9.-]/g, '')
    .slice(0, 160);
}

export function isValidDomainName(domain: string): boolean {
  const clean = normalizeWidgetDomain(domain);
  if (!clean) return false;
  if (clean === 'localhost') return true;
  return /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/.test(clean);
}

export function isHostPermitted(
  hostname: string,
  allowedDomains: string[],
  allowSubdomains: boolean
): boolean {
  if (!allowedDomains || allowedDomains.length === 0) return true;
  const host = normalizeWidgetDomain(hostname);
  if (!host) return false;
  for (const raw of allowedDomains) {
    const allowed = normalizeWidgetDomain(raw);
    if (!allowed) continue;
    if (host === allowed) return true;
    if (allowSubdomains && host.endsWith(`.${allowed}`)) return true;
  }
  return false;
}
