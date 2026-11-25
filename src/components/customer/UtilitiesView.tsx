import React, { useCallback, useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { jsPDF } from 'jspdf';
import {
  QrCode,
  Link2,
  FileDown,
  Copy,
  Check,
  Download,
  Trash2,
  ExternalLink,
  Power,
  RefreshCw,
  Lock,
} from 'lucide-react';
import {
  createShortLink,
  deleteShortLink,
  deleteUtilityRecord,
  listShortLinks,
  listUtilityRecords,
  saveUtilityRecord,
  toggleShortLink,
} from '../../lib/devServicesApi';
import { hasPlanFeature, type PlanLockKey } from '../../lib/planLimits';
import type { ShortLinkRecord, UtilityRecord, WorkspaceMe } from '../../types';

interface UtilitiesViewProps {
  workspace: WorkspaceMe;
  initialTab?: 'qr' | 'shortener' | 'pdf';
  onRequestUpgrade: (key: PlanLockKey) => void;
}

export const UtilitiesView: React.FC<UtilitiesViewProps> = ({
  workspace,
  initialTab = 'qr',
  onRequestUpgrade,
}) => {
  const canExportSvgQr = hasPlanFeature(workspace, 'svgQrExport');
  const canUseCustomSlugs = hasPlanFeature(workspace, 'customShortSlugs');
  const canUsePdf = hasPlanFeature(workspace, 'pdfGenerator');
  const maxShortLinks = workspace.limits.maxShortLinks ?? 5;

  const [tab, setTab] = useState<'qr' | 'shortener' | 'pdf'>(initialTab);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // QR Code State
  const [qrInput, setQrInput] = useState('https://forms.brosdev.info');
  const [qrTitle, setQrTitle] = useState('BrosDev Portal QR');
  const [qrSize, setQrSize] = useState(320);
  const [qrEcLevel, setQrEcLevel] = useState<'L' | 'M' | 'Q' | 'H'>('M');
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [qrSvgString, setQrSvgString] = useState('');

  // Shortener State
  const [links, setLinks] = useState<ShortLinkRecord[]>([]);
  const [targetUrl, setTargetUrl] = useState('');
  const [customSlug, setCustomSlug] = useState('');
  const [linkTitle, setLinkTitle] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [creatingLink, setCreatingLink] = useState(false);
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);

  // PDF Generator State
  const [pdfTemplate, setPdfTemplate] = useState<'invoice' | 'report' | 'summary'>('invoice');
  const [pdfTitle, setPdfTitle] = useState('BrosDev Services Statement');
  const [pdfRecipient, setPdfRecipient] = useState(workspace.user.displayName || workspace.user.email);
  const [pdfBody, setPdfBody] = useState(
    'Item: BrosDev Forms Production License — $49.00\nItem: Signed Webhooks & Custom Routing — Included\nNotes: Thank you for building with BrosDev Developer Services.'
  );
  const [savingUtil, setSavingUtil] = useState(false);

  // Saved Utility History
  const [history, setHistory] = useState<UtilityRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [linkList, utilList] = await Promise.all([listShortLinks(), listUtilityRecords()]);
      setLinks(linkList);
      setHistory(utilList);
    } catch (err: any) {
      setError(err?.message || 'Unable to load utility records.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Live QR Code Rendering
  useEffect(() => {
    let active = true;
    const text = qrInput.trim() || 'https://forms.brosdev.info';
    Promise.all([
      QRCode.toDataURL(text, {
        width: qrSize,
        margin: 2,
        errorCorrectionLevel: qrEcLevel,
        color: { dark: '#111111', light: '#FFFFFF' },
      }),
      QRCode.toString(text, {
        type: 'svg',
        width: qrSize,
        margin: 2,
        errorCorrectionLevel: qrEcLevel,
        color: { dark: '#111111', light: '#FFFFFF' },
      }),
    ])
      .then(([png, svg]) => {
        if (!active) return;
        setQrDataUrl(png);
        setQrSvgString(svg);
      })
      .catch(() => {
        // Ignore transient invalid input
      });
    return () => {
      active = false;
    };
  }, [qrInput, qrSize, qrEcLevel]);

  const origin = (
    workspace.publicApiBaseUrl ||
    (typeof window !== 'undefined' ? window.location.origin : 'https://forms.brosdev.info')
  ).replace(/\/+$/, '');

  const downloadQrPng = async () => {
    if (!qrDataUrl) return;
    const a = document.createElement('a');
    a.href = qrDataUrl;
    a.download = `${(qrTitle || 'brosdev-qr').toLowerCase().replace(/[^a-z0-9]+/g, '-')}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    try {
      await saveUtilityRecord({
        kind: 'qr',
        title: qrTitle || 'QR Code',
        summary: `${qrInput.slice(0, 120)} · ${qrSize}px PNG`,
        config: { content: qrInput, size: qrSize, ecLevel: qrEcLevel },
      });
      await loadData();
    } catch {
      // Non-blocking save
    }
  };

  const shortLinkLimitReached = links.length >= maxShortLinks;

  const downloadQrSvg = async () => {
    if (!canExportSvgQr) {
      onRequestUpgrade('pdfGenerator');
      return;
    }
    if (!qrSvgString) return;
    const blob = new Blob([qrSvgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(qrTitle || 'brosdev-qr').toLowerCase().replace(/[^a-z0-9]+/g, '-')}.svg`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const handleCreateShortLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (shortLinkLimitReached) {
      onRequestUpgrade('shortLinksLimit');
      return;
    }
    if (!canUseCustomSlugs && (customSlug.trim() || expiresAt.trim())) {
      onRequestUpgrade('customShortSlugs');
      return;
    }
    setError('');
    setNotice('');
    setCreatingLink(true);
    try {
      const created = await createShortLink({
        targetUrl,
        customSlug: canUseCustomSlugs && customSlug ? customSlug : undefined,
        title: linkTitle || undefined,
        expiresAt: canUseCustomSlugs && expiresAt ? expiresAt : undefined,
      });
      setTargetUrl('');
      setCustomSlug('');
      setLinkTitle('');
      setExpiresAt('');
      setNotice(`Short link created: ${origin}/r/${created.slug}`);
      await loadData();
    } catch (err: any) {
      setError(err?.message || 'Failed to create short link.');
    } finally {
      setCreatingLink(false);
    }
  };

  const handleGeneratePdf = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canUsePdf) {
      onRequestUpgrade('pdfGenerator');
      return;
    }
    setError('');
    setNotice('');
    setSavingUtil(true);
    try {
      const pdf = new jsPDF({ unit: 'pt', format: 'a4' });
      // Crisp BrosDev Header
      pdf.setFillColor(169, 7, 6);
      pdf.rect(0, 0, 595, 8, 'F');
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(18);
      pdf.setTextColor(17, 17, 17);
      pdf.text(pdfTitle || 'BrosDev Document', 48, 56);

      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(10);
      pdf.setTextColor(115, 115, 115);
      pdf.text(
        `Template: ${pdfTemplate.toUpperCase()}  |  Account: ${workspace.user.accountId}  |  Generated: ${new Date().toLocaleString()}`,
        48,
        76
      );

      pdf.setDrawColor(229, 229, 229);
      pdf.line(48, 92, 547, 92);

      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(11);
      pdf.setTextColor(17, 17, 17);
      pdf.text(`Prepared For: ${pdfRecipient || workspace.user.email}`, 48, 118);

      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(11);
      pdf.setTextColor(51, 51, 51);
      const wrappedLines = pdf.splitTextToSize(pdfBody || '', 495);
      pdf.text(wrappedLines, 48, 148, { lineHeightFactor: 1.55 });

      pdf.setFontSize(9);
      pdf.setTextColor(130, 130, 130);
      pdf.text(
        `Generated via BrosDev Developer Services · ${workspace.user.senderEmail}`,
        48,
        800
      );

      const safeFilename = `${(pdfTitle || 'brosdev-document')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')}.pdf`;
      pdf.save(safeFilename);

      await saveUtilityRecord({
        kind: 'pdf',
        title: pdfTitle || 'PDF Document',
        summary: `${pdfTemplate.toUpperCase()} · For ${pdfRecipient || workspace.user.email}`,
        config: { template: pdfTemplate, recipient: pdfRecipient },
      });
      setNotice(`Generated and downloaded ${safeFilename}.`);
      await loadData();
    } catch (err: any) {
      setError(err?.message || 'Failed to generate PDF.');
    } finally {
      setSavingUtil(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#111111]">Developer Utilities</h1>
          <p className="mt-1 text-sm text-[#525252]">
            Production-ready QR Code Generator, URL Shortener with live redirects, and structured PDF Generator.
          </p>
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-[#E5E5E5] bg-white p-1">
          {[
            { id: 'qr', label: 'QR Code', icon: QrCode, locked: false },
            { id: 'shortener', label: 'URL Shortener', icon: Link2, locked: false },
            { id: 'pdf', label: 'PDF Generator', icon: FileDown, locked: !canUsePdf },
          ].map((item) => {
            const Icon = item.icon;
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id as any)}
                className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                  active ? 'bg-[#111111] text-white' : 'text-[#525252] hover:text-[#111111]'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {item.label}
                {item.locked && <Lock className="h-3 w-3 opacity-75" />}
              </button>
            );
          })}
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-[#A90706]/30 bg-[#FEF2F2] px-4 py-3 text-xs font-medium text-[#A90706]">
          {error}
        </div>
      )}
      {notice && (
        <div className="rounded-md border border-[#16A34A]/30 bg-[#F0FDF4] px-4 py-3 text-xs font-medium text-[#15803D]">
          {notice}
        </div>
      )}

      {/* TAB 1: QR CODE GENERATOR */}
      {tab === 'qr' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <section className="rounded-lg border border-[#E5E5E5] bg-white p-6 lg:col-span-7 space-y-4">
            <h2 className="text-sm font-bold text-[#111111]">QR Code Configuration</h2>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-[#111111]">Label</label>
              <input
                type="text"
                value={qrTitle}
                onChange={(e) => setQrTitle(e.target.value)}
                className="w-full rounded-md border border-[#D4D4D4] px-3 py-2 text-sm text-[#111111] focus:border-[#111111] focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-[#111111]">
                URL or Text Payload
              </label>
              <textarea
                rows={3}
                value={qrInput}
                onChange={(e) => setQrInput(e.target.value)}
                placeholder="https://forms.brosdev.info"
                className="w-full rounded-md border border-[#D4D4D4] px-3 py-2 font-mono text-xs text-[#111111] focus:border-[#111111] focus:outline-none"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-[#111111]">
                  Output Size ({qrSize}px)
                </label>
                <input
                  type="range"
                  min={160}
                  max={640}
                  step={32}
                  value={qrSize}
                  onChange={(e) => setQrSize(Number(e.target.value))}
                  className="w-full accent-[#A90706]"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-[#111111]">
                  Error Correction
                </label>
                <select
                  value={qrEcLevel}
                  onChange={(e) => setQrEcLevel(e.target.value as any)}
                  className="w-full rounded-md border border-[#D4D4D4] bg-white px-3 py-2 text-xs text-[#111111]"
                >
                  <option value="L">Low (7%)</option>
                  <option value="M">Medium (15%)</option>
                  <option value="Q">Quartile (25%)</option>
                  <option value="H">High (30%)</option>
                </select>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 pt-2">
              <button
                type="button"
                onClick={downloadQrPng}
                className="inline-flex items-center gap-1.5 rounded-md bg-[#A90706] px-4 py-2 text-xs font-semibold text-white hover:bg-[#8C0605] cursor-pointer"
              >
                <Download className="h-3.5 w-3.5" />
                Download PNG
              </button>
              <button
                type="button"
                onClick={downloadQrSvg}
                className={`inline-flex items-center gap-1.5 rounded-md border px-4 py-2 text-xs font-semibold cursor-pointer ${
                  canExportSvgQr
                    ? 'border-[#111111] bg-white text-[#111111] hover:bg-[#111111] hover:text-white'
                    : 'border-[#D4D4D4] bg-[#F5F5F5] text-[#525252] hover:border-[#A90706] hover:text-[#A90706]'
                }`}
              >
                {canExportSvgQr ? <Download className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
                {canExportSvgQr ? 'Download SVG' : 'Download SVG (Starter+)'}
              </button>
            </div>
          </section>

          <section className="flex flex-col items-center justify-center rounded-lg border border-[#E5E5E5] bg-white p-6 lg:col-span-5">
            {qrDataUrl ? (
              <img
                src={qrDataUrl}
                alt="Generated QR Code"
                className="h-56 w-56 rounded border border-[#EFEFEF] bg-white p-2 object-contain"
              />
            ) : (
              <div className="flex h-56 w-56 items-center justify-center rounded border border-[#EFEFEF] text-xs text-[#737373]">
                Rendering QR...
              </div>
            )}
            <div className="mt-4 text-center">
              <div className="text-xs font-bold text-[#111111]">{qrTitle || 'QR Preview'}</div>
              <div className="mt-0.5 max-w-xs truncate font-mono text-[11px] text-[#737373]">
                {qrInput}
              </div>
            </div>
          </section>
        </div>
      )}

      {/* TAB 2: URL SHORTENER */}
      {tab === 'shortener' && (
        <div className="space-y-6">
          <section className="rounded-lg border border-[#E5E5E5] bg-white">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E5E5E5] px-6 py-4">
              <div className="flex items-center gap-3">
                <h2 className="text-sm font-bold text-[#111111]">Create Short Link</h2>
                <span className="font-mono text-xs tabular-nums text-[#737373]">
                  {links.length} / {maxShortLinks} links ({workspace.plan?.name || 'Free'})
                </span>
              </div>
              <button
                type="button"
                onClick={loadData}
                className="inline-flex items-center gap-1 text-xs font-semibold text-[#525252] hover:text-[#111111] cursor-pointer"
              >
                <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
                Refresh Clicks
              </button>
            </div>
            {shortLinkLimitReached && (
              <div className="mx-6 mt-5 flex flex-wrap items-center justify-between gap-3 rounded-md border border-[#111111] bg-[#FAFAFA] px-4 py-3 text-xs">
                <div className="flex items-center gap-2 text-[#111111]">
                  <Lock className="h-3.5 w-3.5 text-[#A90706] shrink-0" />
                  <span>
                    Short link quota reached ({links.length}/{maxShortLinks}). Delete an older link or upgrade for up to 1,000 short links.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => onRequestUpgrade('shortLinksLimit')}
                  className="font-semibold text-[#A90706] hover:underline cursor-pointer"
                >
                  Upgrade Plan
                </button>
              </div>
            )}
            <form onSubmit={handleCreateShortLink} className="grid grid-cols-1 gap-4 p-6 md:grid-cols-12">
              <div className="md:col-span-5">
                <label className="mb-1.5 block text-xs font-semibold text-[#111111]">
                  Destination URL
                </label>
                <input
                  type="url"
                  required
                  disabled={shortLinkLimitReached}
                  value={targetUrl}
                  onChange={(e) => setTargetUrl(e.target.value)}
                  placeholder="https://brosdev.info/pricing"
                  className="w-full rounded-md border border-[#D4D4D4] px-3 py-2 font-mono text-xs text-[#111111] focus:border-[#111111] focus:outline-none disabled:bg-[#F5F5F5]"
                />
              </div>
              <div className="md:col-span-3">
                <div className="mb-1.5 flex items-center justify-between">
                  <label className="text-xs font-semibold text-[#111111]">
                    Custom Slug
                  </label>
                  {!canUseCustomSlugs && (
                    <button
                      type="button"
                      onClick={() => onRequestUpgrade('customShortSlugs')}
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#A90706] hover:underline cursor-pointer"
                    >
                      <Lock className="h-3 w-3" />
                      Starter+
                    </button>
                  )}
                </div>
                <input
                  type="text"
                  disabled={shortLinkLimitReached || !canUseCustomSlugs}
                  value={canUseCustomSlugs ? customSlug : ''}
                  onChange={(e) => setCustomSlug(e.target.value)}
                  placeholder={canUseCustomSlugs ? 'launch-2026' : 'Auto random slug on Free'}
                  className="w-full rounded-md border border-[#D4D4D4] px-3 py-2 font-mono text-xs text-[#111111] focus:border-[#111111] focus:outline-none disabled:bg-[#F5F5F5] disabled:text-[#737373]"
                />
              </div>
              <div className="md:col-span-2">
                <div className="mb-1.5 flex items-center justify-between">
                  <label className="text-xs font-semibold text-[#111111]">
                    Expires On
                  </label>
                  {!canUseCustomSlugs && (
                    <Lock className="h-3 w-3 text-[#A3A3A3]" />
                  )}
                </div>
                <input
                  type="date"
                  disabled={shortLinkLimitReached || !canUseCustomSlugs}
                  value={canUseCustomSlugs ? expiresAt : ''}
                  onChange={(e) => setExpiresAt(e.target.value)}
                  className="w-full rounded-md border border-[#D4D4D4] px-2.5 py-2 text-xs text-[#111111] focus:border-[#111111] focus:outline-none disabled:bg-[#F5F5F5] disabled:text-[#737373]"
                />
              </div>
              <div className="flex items-end md:col-span-2">
                {shortLinkLimitReached ? (
                  <button
                    type="button"
                    onClick={() => onRequestUpgrade('shortLinksLimit')}
                    className="inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-[#D4D4D4] bg-[#F5F5F5] px-4 py-2 text-xs font-semibold text-[#525252] hover:border-[#A90706] hover:text-[#A90706] cursor-pointer"
                  >
                    <Lock className="h-3.5 w-3.5" />
                    Limit Reached
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={creatingLink}
                    className="w-full rounded-md bg-[#A90706] px-4 py-2 text-xs font-semibold text-white hover:bg-[#8C0605] cursor-pointer disabled:opacity-50"
                  >
                    {creatingLink ? 'Saving...' : 'Shorten URL'}
                  </button>
                )}
              </div>
            </form>
          </section>

          <section className="overflow-hidden rounded-lg border border-[#E5E5E5] bg-white">
            <div className="flex items-center justify-between border-b border-[#E5E5E5] px-6 py-4">
              <h2 className="text-sm font-bold text-[#111111]">Active Short Links</h2>
              <span className="text-xs tabular-nums text-[#737373]">{links.length} links</span>
            </div>
            {links.length === 0 ? (
              <div className="p-8 text-center text-xs text-[#737373]">
                No short links created yet. Shorten any HTTP/HTTPS URL above to track real redirects and clicks.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-[#E5E5E5] bg-[#FAFAFA] text-[#525252]">
                    <tr>
                      <th className="px-5 py-3">Short URL</th>
                      <th className="px-5 py-3">Target</th>
                      <th className="px-5 py-3 text-right">Clicks</th>
                      <th className="px-5 py-3">Status</th>
                      <th className="px-5 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#EFEFEF]">
                    {links.map((l) => {
                      const shortUrl = `${origin}/r/${l.slug}`;
                      return (
                        <tr key={l.slug} className="hover:bg-[#FAFAFA]">
                          <td className="px-5 py-3.5">
                            <div className="font-mono font-semibold text-[#111111]">/r/{l.slug}</div>
                            {l.expiresAt && (
                              <div className="text-[11px] text-[#737373]">
                                Expires {l.expiresAt}
                              </div>
                            )}
                          </td>
                          <td className="max-w-[260px] truncate px-5 py-3.5 font-mono text-[11px] text-[#525252]">
                            {l.targetUrl}
                          </td>
                          <td className="px-5 py-3.5 text-right font-mono font-bold tabular-nums text-[#111111]">
                            {l.clicks.toLocaleString()}
                          </td>
                          <td className="px-5 py-3.5">
                            <span
                              className={`font-semibold ${
                                l.isActive ? 'text-[#16A34A]' : 'text-[#737373]'
                              }`}
                            >
                              {l.isActive ? 'Active' : 'Paused'}
                            </span>
                          </td>
                          <td className="px-5 py-3.5 text-right">
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => {
                                  navigator.clipboard.writeText(shortUrl);
                                  setCopiedSlug(l.slug);
                                  setTimeout(() => setCopiedSlug(null), 1800);
                                }}
                                className="inline-flex items-center gap-1 rounded border border-[#D4D4D4] px-2.5 py-1 text-xs font-medium text-[#111111] hover:bg-[#FAFAFA] cursor-pointer"
                              >
                                {copiedSlug === l.slug ? (
                                  <Check className="h-3 w-3 text-[#16A34A]" />
                                ) : (
                                  <Copy className="h-3 w-3" />
                                )}
                                {copiedSlug === l.slug ? 'Copied' : 'Copy'}
                              </button>
                              <a
                                href={shortUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center rounded border border-[#D4D4D4] p-1 text-[#525252] hover:text-[#111111]"
                                title="Open short link"
                              >
                                <ExternalLink className="h-3.5 w-3.5" />
                              </a>
                              <button
                                type="button"
                                onClick={async () => {
                                  await toggleShortLink(l);
                                  await loadData();
                                }}
                                title={l.isActive ? 'Pause' : 'Activate'}
                                className="rounded border border-[#D4D4D4] p-1 text-[#525252] hover:text-[#111111] cursor-pointer"
                              >
                                <Power className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={async () => {
                                  await deleteShortLink(l.slug);
                                  await loadData();
                                }}
                                className="rounded border border-[#E5E5E5] p-1 text-[#737373] hover:border-[#A90706] hover:text-[#A90706] cursor-pointer"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}

      {/* TAB 3: PDF GENERATOR */}
      {tab === 'pdf' && (
        <section className="rounded-lg border border-[#E5E5E5] bg-white p-6 space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-[#111111]">Structured PDF Generator</h2>
              <p className="mt-1 text-xs text-[#525252]">
                Generate crisp A4 PDF documents directly in the browser with BrosDev header styling and automatic history logging.
              </p>
            </div>
            {!canUsePdf && (
              <button
                type="button"
                onClick={() => onRequestUpgrade('pdfGenerator')}
                className="inline-flex items-center gap-1.5 rounded-md bg-[#A90706] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#8C0605] cursor-pointer"
              >
                <Lock className="h-3.5 w-3.5" />
                Unlock PDF Studio
              </button>
            )}
          </div>

          {!canUsePdf && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-[#111111] bg-[#FAFAFA] px-4 py-3 text-xs">
              <div className="flex items-center gap-2 text-[#111111]">
                <Lock className="h-4 w-4 text-[#A90706] shrink-0" />
                <span>
                  PDF Document Studio &amp; Vector SVG QR exports require the{' '}
                  <strong>Starter</strong> plan ($19/mo) or higher.
                </span>
              </div>
              <button
                type="button"
                onClick={() => onRequestUpgrade('pdfGenerator')}
                className="font-semibold text-[#A90706] hover:underline cursor-pointer"
              >
                View Starter Plan
              </button>
            </div>
          )}

          <form onSubmit={handleGeneratePdf} className="grid grid-cols-1 gap-4 md:grid-cols-12">
            <div className="md:col-span-4">
              <label className="mb-1.5 block text-xs font-semibold text-[#111111]">Template</label>
              <select
                disabled={!canUsePdf}
                value={pdfTemplate}
                onChange={(e) => setPdfTemplate(e.target.value as any)}
                className="w-full rounded-md border border-[#D4D4D4] bg-white px-3 py-2 text-sm text-[#111111] disabled:bg-[#F5F5F5] disabled:text-[#737373]"
              >
                <option value="invoice">Invoice / Receipt</option>
                <option value="report">Technical Report</option>
                <option value="summary">Submission Summary</option>
              </select>
            </div>
            <div className="md:col-span-4">
              <label className="mb-1.5 block text-xs font-semibold text-[#111111]">Document Title</label>
              <input
                type="text"
                required
                disabled={!canUsePdf}
                value={pdfTitle}
                onChange={(e) => setPdfTitle(e.target.value)}
                className="w-full rounded-md border border-[#D4D4D4] px-3 py-2 text-sm text-[#111111] focus:border-[#111111] focus:outline-none disabled:bg-[#F5F5F5] disabled:text-[#737373]"
              />
            </div>
            <div className="md:col-span-4">
              <label className="mb-1.5 block text-xs font-semibold text-[#111111]">Prepared For</label>
              <input
                type="text"
                disabled={!canUsePdf}
                value={pdfRecipient}
                onChange={(e) => setPdfRecipient(e.target.value)}
                className="w-full rounded-md border border-[#D4D4D4] px-3 py-2 text-sm text-[#111111] focus:border-[#111111] focus:outline-none disabled:bg-[#F5F5F5] disabled:text-[#737373]"
              />
            </div>
            <div className="md:col-span-12">
              <label className="mb-1.5 block text-xs font-semibold text-[#111111]">
                Document Body Content
              </label>
              <textarea
                rows={6}
                required
                disabled={!canUsePdf}
                value={pdfBody}
                onChange={(e) => setPdfBody(e.target.value)}
                className="w-full rounded-md border border-[#D4D4D4] px-3 py-2 font-mono text-xs text-[#111111] focus:border-[#111111] focus:outline-none disabled:bg-[#F5F5F5] disabled:text-[#737373]"
              />
            </div>
            <div className="md:col-span-12">
              {!canUsePdf ? (
                <button
                  type="button"
                  onClick={() => onRequestUpgrade('pdfGenerator')}
                  className="inline-flex items-center gap-1.5 rounded-md border border-[#D4D4D4] bg-[#F5F5F5] px-5 py-2.5 text-xs font-semibold text-[#525252] hover:border-[#A90706] hover:text-[#A90706] cursor-pointer"
                >
                  <Lock className="h-3.5 w-3.5" />
                  Locked on Free Plan — Upgrade to Starter
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={savingUtil}
                  className="inline-flex items-center gap-1.5 rounded-md bg-[#A90706] px-5 py-2.5 text-xs font-semibold text-white hover:bg-[#8C0605] cursor-pointer disabled:opacity-50"
                >
                  <FileDown className="h-4 w-4" />
                  {savingUtil ? 'Generating PDF...' : 'Generate & Download PDF'}
                </button>
              )}
            </div>
          </form>
        </section>
      )}

      {/* Saved Utility History (QR + PDF) */}
      {history.length > 0 && (
        <section className="overflow-hidden rounded-lg border border-[#E5E5E5] bg-white">
          <div className="border-b border-[#E5E5E5] px-6 py-3.5">
            <h2 className="text-sm font-bold text-[#111111]">Saved QR &amp; PDF History</h2>
          </div>
          <div className="divide-y divide-[#EFEFEF]">
            {history.slice(0, 10).map((item) => (
              <div
                key={item.docId}
                className="flex items-center justify-between gap-4 px-6 py-3 text-xs"
              >
                <div className="min-w-0">
                  <div className="font-semibold text-[#111111]">
                    {item.title}{' '}
                    <span className="font-mono text-[11px] uppercase text-[#737373]">
                      · {item.kind}
                    </span>
                  </div>
                  <div className="truncate text-[11px] text-[#737373]">{item.summary}</div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="font-mono text-[11px] text-[#737373]">
                    {new Date(item.createdAt).toLocaleDateString()}
                  </span>
                  <button
                    type="button"
                    onClick={async () => {
                      await deleteUtilityRecord(item.docId);
                      await loadData();
                    }}
                    className="text-[#737373] hover:text-[#A90706] cursor-pointer"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};
