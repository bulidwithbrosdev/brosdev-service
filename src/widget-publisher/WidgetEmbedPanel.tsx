import React, { useState } from 'react';
import { Check, Code2, Copy, ExternalLink, Globe, ShieldCheck } from 'lucide-react';
import { getWidgetDefinition } from '../widgets/catalog';
import type { WidgetRecord } from '../widgets/types';

type GuidePlatform = 'html' | 'wordpress' | 'react' | 'webflow';

export const WidgetEmbedPanel: React.FC<{
  widget: WidgetRecord;
  onOpenDomains?: () => void;
}> = ({ widget, onOpenDomains }) => {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [platform, setPlatform] = useState<GuidePlatform>('html');

  const origin =
    typeof window !== 'undefined' && window.location.origin
      ? window.location.origin
      : 'https://widgets.brosdev.site';

  const embedScript = `<script\n  src="${origin}/embed.js"\n  data-widget-id="${widget.publicId}"\n  async\n></script>`;
  const inlineMountSnippet = `<div data-brosdev-widget="${widget.publicId}"></div>\n<script src="${origin}/embed.js" async></script>`;
  const hostedUrl = `${origin}/w/${widget.publicId}`;
  const previewUrl = `${origin}/w/${widget.publicId}?preview=1`;
  const def = getWidgetDefinition(widget.type);

  const copyText = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 1800);
    } catch {
      // Clipboard fallback ignored
    }
  };

  const platformSnippets: Record<GuidePlatform, { title: string; steps: string[]; code: string }> = {
    html: {
      title: 'Standard HTML / Static Website',
      steps: [
        'Paste the script tag before the closing </body> tag for floating/overlay widgets, or use the inline mount container where you want inline widgets to appear.',
        'Shadow DOM isolation prevents your site CSS from clashing with the widget.',
      ],
      code:
        widget.configuration.style.position === 'inline'
          ? inlineMountSnippet
          : embedScript,
    },
    wordpress: {
      title: 'WordPress / Elementor / WooCommerce',
      steps: [
        'In WordPress Admin, open Appearance → Theme File Editor or install "WPCode / Insert Headers and Footers".',
        'Paste the script snippet into the Footer section (or inside a Custom HTML Gutenberg block for inline placement) and save.',
      ],
      code:
        widget.configuration.style.position === 'inline'
          ? inlineMountSnippet
          : embedScript,
    },
    react: {
      title: 'React / Next.js / Vite SPA',
      steps: [
        'Load the script once in a useEffect hook or Next.js <Script strategy="afterInteractive" /> component.',
        'The embed loader automatically guards against duplicate initialization on route transitions.',
      ],
      code: `import { useEffect } from 'react';\n\nexport function BrosDevWidgetEmbed() {\n  useEffect(() => {\n    if (document.querySelector('script[data-widget-id="${widget.publicId}"]')) return;\n    const s = document.createElement('script');\n    s.src = '${origin}/embed.js';\n    s.dataset.widgetId = '${widget.publicId}';\n    s.async = true;\n    document.body.appendChild(s);\n  }, []);\n\n  return <div data-brosdev-widget="${widget.publicId}" />;\n}`,
    },
    webflow: {
      title: 'Webflow / Shopify / Squarespace',
      steps: [
        'Open Project Settings → Custom Code → Footer Code (or drop an Embed element directly on the page for inline components).',
        'Paste the snippet below and publish your site.',
      ],
      code:
        widget.configuration.style.position === 'inline'
          ? inlineMountSnippet
          : embedScript,
    },
  };

  const activeGuide = platformSnippets[platform];

  return (
    <div className="space-y-5">
      {widget.status !== 'published' && (
        <div className="rounded-lg border border-[#F59E0B]/40 bg-[#FFFBEB] p-3.5 text-xs text-[#92400E]">
          This widget is currently in <span className="font-semibold uppercase">{widget.status}</span>{' '}
          status. Publish it first so the live embed script and public hosted URL serve it to visitors.
        </div>
      )}

      {/* Primary Script Embed */}
      <div className="rounded-lg border border-[#E5E5E5] bg-white p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-[#111111]">Embed Script (Shadow DOM Isolated)</h3>
            <p className="text-xs text-[#525252] mt-0.5">
              Public ID: <span className="font-mono font-semibold text-[#111111]">{widget.publicId}</span> ·
              v{widget.publishedVersion || widget.version}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void copyText('script', embedScript)}
            className="inline-flex items-center gap-1.5 rounded-md bg-[#A90706] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#8C0605] cursor-pointer"
          >
            {copiedKey === 'script' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            {copiedKey === 'script' ? 'Copied' : 'Copy Embed Code'}
          </button>
        </div>

        <pre className="rounded-md bg-[#111111] text-[#F5F5F5] p-3.5 text-xs font-mono overflow-x-auto leading-relaxed">
          <code>{embedScript}</code>
        </pre>

        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#525252] pt-1">
          <span>Supports multiple widgets per page and prevents duplicate initialization.</span>
          {onOpenDomains && (
            <button
              type="button"
              onClick={onOpenDomains}
              className="inline-flex items-center gap-1 font-semibold text-[#A90706] hover:underline cursor-pointer"
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              {widget.domainRestrictionEnabled
                ? `Domain lock active (${widget.allowedDomains.length} allowed)`
                : 'Configure allowed domains'}
            </button>
          )}
        </div>
      </div>

      {/* Hosted URL & Preview URL */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-lg border border-[#E5E5E5] bg-white p-4 space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs font-bold text-[#111111]">
              <Globe className="w-3.5 h-3.5 text-[#A90706]" />
              Hosted Component URL
            </div>
            <a
              href={hostedUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#A90706] hover:underline"
            >
              Open <ExternalLink className="w-3 h-3" />
            </a>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              readOnly
              value={hostedUrl}
              className="flex-1 rounded-md border border-[#D4D4D4] bg-[#FAFAFA] px-2.5 py-1.5 font-mono text-xs text-[#111111]"
            />
            <button
              type="button"
              onClick={() => void copyText('hosted', hostedUrl)}
              className="inline-flex items-center gap-1 rounded-md border border-[#D4D4D4] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#111111] hover:bg-[#F5F5F5] cursor-pointer"
            >
              {copiedKey === 'hosted' ? <Check className="w-3.5 h-3.5 text-[#15803D]" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>
          <p className="text-[11px] text-[#737373]">
            Share directly as a standalone responsive page or embed inside an iframe.
          </p>
        </div>

        <div className="rounded-lg border border-[#E5E5E5] bg-white p-4 space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs font-bold text-[#111111]">
              <Code2 className="w-3.5 h-3.5 text-[#525252]" />
              Hosted Preview URL
            </div>
            <a
              href={previewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#111111] hover:underline"
            >
              Preview <ExternalLink className="w-3 h-3" />
            </a>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              readOnly
              value={previewUrl}
              className="flex-1 rounded-md border border-[#D4D4D4] bg-[#FAFAFA] px-2.5 py-1.5 font-mono text-xs text-[#111111]"
            />
            <button
              type="button"
              onClick={() => void copyText('preview', previewUrl)}
              className="inline-flex items-center gap-1 rounded-md border border-[#D4D4D4] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#111111] hover:bg-[#F5F5F5] cursor-pointer"
            >
              {copiedKey === 'preview' ? <Check className="w-3.5 h-3.5 text-[#15803D]" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>
          <p className="text-[11px] text-[#737373]">
            Safe QA preview link — does not count toward visitor analytics.
          </p>
        </div>
      </div>

      {/* Platform Integration Guide */}
      <div className="rounded-lg border border-[#E5E5E5] bg-white p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E5E5E5] pb-3">
          <div>
            <h4 className="text-sm font-bold text-[#111111]">
              Integration Guide · {def.name}
            </h4>
            <p className="text-xs text-[#525252] mt-0.5">{def.useCase}</p>
          </div>
          <div className="flex items-center gap-1 rounded-md border border-[#E5E5E5] bg-[#FAFAFA] p-0.5">
            {(['html', 'wordpress', 'react', 'webflow'] as GuidePlatform[]).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPlatform(p)}
                className={`px-2.5 py-1 rounded text-xs font-semibold capitalize transition-colors cursor-pointer ${
                  platform === p
                    ? 'bg-[#111111] text-white'
                    : 'text-[#525252] hover:text-[#111111]'
                }`}
              >
                {p === 'html' ? 'HTML' : p === 'react' ? 'React / Next' : p}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <div className="text-xs font-semibold text-[#111111]">{activeGuide.title}</div>
          <ol className="list-decimal list-inside space-y-1 text-xs text-[#525252]">
            {activeGuide.steps.map((step, idx) => (
              <li key={idx}>{step}</li>
            ))}
          </ol>
        </div>

        <div className="relative">
          <pre className="rounded-md bg-[#111111] text-[#F5F5F5] p-3.5 text-xs font-mono overflow-x-auto leading-relaxed">
            <code>{activeGuide.code}</code>
          </pre>
          <button
            type="button"
            onClick={() => void copyText(`guide_${platform}`, activeGuide.code)}
            className="absolute top-2.5 right-2.5 inline-flex items-center gap-1 rounded bg-white/10 px-2 py-1 text-[11px] font-semibold text-white hover:bg-white/20 cursor-pointer"
          >
            {copiedKey === `guide_${platform}` ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
            {copiedKey === `guide_${platform}` ? 'Copied' : 'Copy'}
          </button>
        </div>

        {def.integrationTips.length > 0 && (
          <div className="rounded-md border border-[#E5E5E5] bg-[#FAFAFA] p-3 space-y-1">
            <div className="text-[11px] font-semibold text-[#111111]">Component Best Practices</div>
            <ul className="list-disc list-inside space-y-0.5 text-xs text-[#525252]">
              {def.integrationTips.map((tip, i) => (
                <li key={i}>{tip}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
};
