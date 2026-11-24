import React from 'react';
import { Download, Printer, X, CheckCircle2, ShieldCheck } from 'lucide-react';
import { InvoiceDetailRecord } from '../../types';

function escapeHtml(val: string): string {
  return String(val ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatPaymentMethodLabel(payment: InvoiceDetailRecord['payment']): string {
  if (!payment) return 'BrosDev Pay';
  if (payment.paymentMethod === 'upi' && payment.upiId) {
    return `BrosDev Pay · UPI (${payment.upiId})`;
  }
  if (payment.paymentMethod === 'netbanking' && payment.bankName) {
    return `BrosDev Pay · NetBanking (${payment.bankName})`;
  }
  if (payment.cardBrand && payment.last4) {
    return `BrosDev Pay · ${payment.cardBrand} •••• ${payment.last4}`;
  }
  return 'BrosDev Pay';
}

function buildStandaloneInvoiceHtml(invoice: InvoiceDetailRecord): string {
  const tpl = invoice.template;
  const accent = /^#[0-9A-Fa-f]{6}$/.test(tpl.accentColor || '') ? tpl.accentColor : '#A90706';
  const totalUsd = invoice.amountCents / 100;
  const taxRate = Number(tpl.taxRatePct || 0);
  const subtotalUsd = taxRate > 0 ? totalUsd / (1 + taxRate / 100) : totalUsd;
  const taxUsd = totalUsd - subtotalUsd;
  const issuedDate = new Date(invoice.issuedAt).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const periodStr = `${new Date(invoice.periodStart).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })} – ${new Date(invoice.periodEnd).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })}`;
  const methodLabel = formatPaymentMethodLabel(invoice.payment);

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Invoice ${escapeHtml(invoice.invoiceNumber)} - ${escapeHtml(tpl.companyName)}</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #111; background: #f5f5f5; margin: 0; padding: 32px; }
  .sheet { max-width: 780px; margin: 0 auto; background: #fff; border: 1px solid #e5e5e5; border-radius: 10px; overflow: hidden; }
  .bar { height: 6px; background: ${accent}; }
  .inner { padding: 40px; }
  .row { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; }
  .brand { font-size: 22px; font-weight: 800; color: #111; margin: 0; }
  .muted { color: #525252; font-size: 13px; line-height: 1.5; }
  .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
  .badge { display: inline-block; padding: 4px 10px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; border-radius: 4px; background: #f0fdf4; color: #15803d; border: 1px solid #bbf7d0; }
  .divider { border-top: 1px solid #e5e5e5; margin: 28px 0; }
  table { width: 100%; border-collapse: collapse; margin-top: 16px; }
  th { text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #525252; padding: 10px 12px; background: #fafafa; border-bottom: 1px solid #e5e5e5; }
  td { padding: 14px 12px; border-bottom: 1px solid #efefef; font-size: 13px; }
  .right { text-align: right; }
  .totals { width: 280px; margin-left: auto; margin-top: 20px; font-size: 13px; }
  .totals-row { display: flex; justify-content: space-between; padding: 6px 0; color: #525252; }
  .totals-final { display: flex; justify-content: space-between; padding: 12px 0 0; margin-top: 8px; border-top: 2px solid #111; font-size: 16px; font-weight: 800; color: #111; }
  .footer { margin-top: 36px; padding-top: 20px; border-top: 1px solid #e5e5e5; font-size: 12px; color: #737373; line-height: 1.6; }
</style>
</head>
<body>
  <div class="sheet">
    <div class="bar"></div>
    <div class="inner">
      <div class="row">
        <div>
          <h1 class="brand">${escapeHtml(tpl.companyName)}</h1>
          ${tpl.companyTagline ? `<div class="muted">${escapeHtml(tpl.companyTagline)}</div>` : ''}
          ${tpl.companyAddress ? `<div class="muted" style="margin-top:8px;max-width:300px;">${escapeHtml(tpl.companyAddress)}</div>` : ''}
          ${tpl.taxId ? `<div class="muted mono" style="margin-top:4px;">Tax ID: ${escapeHtml(tpl.taxId)}</div>` : ''}
        </div>
        <div class="right">
          <div style="font-size:26px;font-weight:800;letter-spacing:-0.02em;">INVOICE</div>
          <div class="mono" style="font-size:14px;font-weight:700;margin-top:4px;">${escapeHtml(invoice.invoiceNumber)}</div>
          <div style="margin-top:10px;"><span class="badge">${escapeHtml(invoice.status)}</span></div>
        </div>
      </div>

      <div class="divider"></div>

      <div class="row">
        <div>
          <div style="font-size:11px;font-weight:700;text-transform:uppercase;color:#737373;letter-spacing:0.05em;">Billed To</div>
          <div style="font-weight:700;font-size:14px;margin-top:6px;">${escapeHtml(invoice.customer.displayName)}</div>
          <div class="muted">${escapeHtml(invoice.customer.email)}</div>
          ${invoice.payment?.billingZip ? `<div class="muted">Postal Code: ${escapeHtml(invoice.payment.billingZip)}</div>` : ''}
        </div>
        <div class="right" style="font-size:13px;line-height:1.8;">
          <div><span class="muted">Issued Date:</span> <strong>${escapeHtml(issuedDate)}</strong></div>
          <div><span class="muted">Billing Period:</span> <strong>${escapeHtml(periodStr)}</strong></div>
          <div><span class="muted">Payment Method:</span> <strong>${escapeHtml(methodLabel)}</strong></div>
          ${invoice.payment?.providerPaymentId ? `<div><span class="muted">Transaction ID:</span> <span class="mono">${escapeHtml(invoice.payment.providerPaymentId)}</span></div>` : ''}
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th>Description</th>
            <th class="right">Cycle</th>
            <th class="right">Qty</th>
            <th class="right">Amount</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <strong>${escapeHtml(tpl.companyName)} — ${escapeHtml(invoice.plan.name)} Plan</strong>
              <div class="muted" style="font-size:12px;margin-top:2px;">${escapeHtml(invoice.plan.description)} (${escapeHtml(periodStr)})</div>
            </td>
            <td class="right" style="text-transform:capitalize;">${escapeHtml(invoice.plan.billingCycle)}</td>
            <td class="right mono">1</td>
            <td class="right mono"><strong>$${subtotalUsd.toFixed(2)} ${escapeHtml(invoice.currency)}</strong></td>
          </tr>
        </tbody>
      </table>

      <div class="totals">
        <div class="totals-row"><span>Subtotal</span><span class="mono">$${subtotalUsd.toFixed(2)}</span></div>
        <div class="totals-row"><span>Tax (${taxRate.toFixed(2)}%)</span><span class="mono">$${taxUsd.toFixed(2)}</span></div>
        <div class="totals-final"><span>Total ${invoice.status === 'paid' ? 'Paid' : 'Due'}</span><span class="mono">$${totalUsd.toFixed(2)} ${escapeHtml(invoice.currency)}</span></div>
      </div>

      <div class="footer">
        <div><strong>Payment Terms:</strong> ${escapeHtml(tpl.paymentTerms)}</div>
        ${tpl.footerNotes ? `<div style="margin-top:6px;">${escapeHtml(tpl.footerNotes)}</div>` : ''}
        <div style="margin-top:8px;">${escapeHtml(tpl.supportEmail)}${tpl.website ? ` · ${escapeHtml(tpl.website)}` : ''}</div>
      </div>
    </div>
  </div>
</body>
</html>`;
}

export const InvoiceModal: React.FC<{
  invoice: InvoiceDetailRecord | null;
  loading?: boolean;
  onClose: () => void;
}> = ({ invoice, loading, onClose }) => {
  if (!invoice && !loading) return null;

  const handleDownloadHtml = () => {
    if (!invoice) return;
    const html = buildStandaloneInvoiceHtml(invoice);
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${invoice.invoiceNumber}.html`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const handlePrint = () => {
    window.print();
  };

  const tpl = invoice?.template;
  const accent =
    tpl && /^#[0-9A-Fa-f]{6}$/.test(tpl.accentColor || '') ? tpl.accentColor : '#A90706';

  const totalUsd = invoice ? invoice.amountCents / 100 : 0;
  const taxRate = Number(tpl?.taxRatePct || 0);
  const subtotalUsd = taxRate > 0 ? totalUsd / (1 + taxRate / 100) : totalUsd;
  const taxUsd = totalUsd - subtotalUsd;

  return (
    <div className="fixed inset-0 bg-black/55 z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white border border-[#E5E5E5] rounded-xl w-full max-w-3xl overflow-hidden my-8 shadow-2xl">
        {/* Top Action Bar (hidden when printing) */}
        <div className="no-print px-6 py-3.5 bg-[#FAFAFA] border-b border-[#E5E5E5] flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-[#111111]">
              {loading ? 'Loading Invoice...' : `Invoice ${invoice?.invoiceNumber}`}
            </span>
            {invoice && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold uppercase rounded bg-[#F0FDF4] text-[#15803D] border border-[#BBF7D0]">
                <CheckCircle2 className="w-3 h-3" />
                {invoice.status}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {invoice && (
              <>
                <button
                  type="button"
                  onClick={handleDownloadHtml}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#111111] bg-white border border-[#D4D4D4] hover:bg-[#F5F5F5] rounded-md cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download Receipt
                </button>
                <button
                  type="button"
                  onClick={handlePrint}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-[#111111] hover:bg-[#262626] rounded-md cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" />
                  Print / Save PDF
                </button>
              </>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-[#525252] hover:text-[#111111] rounded-md cursor-pointer"
              aria-label="Close invoice viewer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Printable Invoice Document */}
        {loading || !invoice || !tpl ? (
          <div className="p-14 text-center text-sm text-[#737373]">Loading invoice template...</div>
        ) : (
          <div className="invoice-printable-sheet bg-white">
            {/* Accent Top Rule */}
            <div className="h-1.5 w-full" style={{ backgroundColor: accent }} />

            <div className="p-8 md:p-10 space-y-8">
              {/* Header */}
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-6">
                <div>
                  <div className="flex items-center gap-2.5">
                    <div
                      className="w-8 h-8 rounded flex items-center justify-center text-white font-bold text-sm"
                      style={{ backgroundColor: accent }}
                    >
                      {tpl.companyName.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div className="text-lg font-bold text-[#111111] leading-tight">
                        {tpl.companyName}
                      </div>
                      {tpl.companyTagline && (
                        <div className="text-xs text-[#525252]">{tpl.companyTagline}</div>
                      )}
                    </div>
                  </div>
                  {tpl.companyAddress && (
                    <p className="text-xs text-[#525252] mt-3 max-w-xs leading-relaxed">
                      {tpl.companyAddress}
                    </p>
                  )}
                  <div className="text-xs text-[#737373] mt-1.5 space-y-0.5">
                    <div>{tpl.supportEmail}</div>
                    {tpl.website && <div>{tpl.website}</div>}
                    {tpl.taxId && <div className="font-mono text-[11px]">Tax ID: {tpl.taxId}</div>}
                  </div>
                </div>

                <div className="sm:text-right">
                  <div className="text-2xl font-bold tracking-tight text-[#111111]">INVOICE</div>
                  <div className="font-mono text-sm font-bold text-[#111111] mt-1">
                    {invoice.invoiceNumber}
                  </div>
                  <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1 text-xs font-bold uppercase tracking-wider rounded border bg-[#F0FDF4] text-[#15803D] border-[#BBF7D0]">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    {invoice.status}
                  </div>
                </div>
              </div>

              {/* Billing Info Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 py-6 border-y border-[#E5E5E5]">
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-wider text-[#737373]">
                    Billed To
                  </div>
                  <div className="text-sm font-bold text-[#111111] mt-1.5">
                    {invoice.payment?.cardholderName || invoice.customer.displayName}
                  </div>
                  <div className="text-xs text-[#525252] mt-0.5">{invoice.customer.email}</div>
                  {invoice.payment?.billingZip && (
                    <div className="text-xs text-[#737373] mt-0.5 font-mono">
                      Postal Code: {invoice.payment.billingZip}
                    </div>
                  )}
                </div>

                <div className="sm:text-right space-y-1.5 text-xs">
                  <div className="flex sm:justify-end gap-2">
                    <span className="text-[#737373]">Date of Issue:</span>
                    <span className="font-semibold text-[#111111]">
                      {new Date(invoice.issuedAt).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                      })}
                    </span>
                  </div>
                  <div className="flex sm:justify-end gap-2">
                    <span className="text-[#737373]">Service Period:</span>
                    <span className="font-semibold text-[#111111]">
                      {new Date(invoice.periodStart).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}{' '}
                      –{' '}
                      {new Date(invoice.periodEnd).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </span>
                  </div>
                  <div className="flex sm:justify-end gap-2">
                    <span className="text-[#737373]">Payment Method:</span>
                    <span className="font-semibold text-[#111111]">
                      {formatPaymentMethodLabel(invoice.payment)}
                    </span>
                  </div>
                  {invoice.payment?.providerPaymentId && (
                    <div className="flex sm:justify-end gap-2">
                      <span className="text-[#737373]">Transaction Ref:</span>
                      <span className="font-mono text-[#111111]">
                        {invoice.payment.providerPaymentId}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Line Items Table */}
              <div>
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-[#FAFAFA] border-y border-[#E5E5E5] text-[11px] font-bold uppercase tracking-wider text-[#525252]">
                      <th className="py-3 px-4">Item Description</th>
                      <th className="py-3 px-4 text-right">Billing Cycle</th>
                      <th className="py-3 px-4 text-right">Qty</th>
                      <th className="py-3 px-4 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#EFEFEF] text-xs">
                    <tr>
                      <td className="py-4 px-4">
                        <div className="font-bold text-sm text-[#111111]">
                          {tpl.companyName} — {invoice.plan.name} Plan
                        </div>
                        <div className="text-[#525252] mt-0.5">{invoice.plan.description}</div>
                      </td>
                      <td className="py-4 px-4 text-right capitalize text-[#525252]">
                        {invoice.plan.billingCycle}
                      </td>
                      <td className="py-4 px-4 text-right font-mono tabular-nums">1</td>
                      <td className="py-4 px-4 text-right font-mono font-semibold tabular-nums text-[#111111]">
                        ${subtotalUsd.toFixed(2)} {invoice.currency}
                      </td>
                    </tr>
                  </tbody>
                </table>

                {/* Totals Block */}
                <div className="mt-6 flex justify-end">
                  <div className="w-full sm:w-72 space-y-2 text-xs">
                    <div className="flex items-center justify-between text-[#525252]">
                      <span>Subtotal</span>
                      <span className="font-mono tabular-nums">${subtotalUsd.toFixed(2)}</span>
                    </div>
                    <div className="flex items-center justify-between text-[#525252]">
                      <span>Tax ({taxRate.toFixed(2)}%)</span>
                      <span className="font-mono tabular-nums">${taxUsd.toFixed(2)}</span>
                    </div>
                    <div className="pt-3 mt-2 border-t-2 border-[#111111] flex items-center justify-between text-base font-bold text-[#111111]">
                      <span>Total {invoice.status === 'paid' ? 'Paid' : 'Due'}</span>
                      <span className="font-mono tabular-nums">
                        ${totalUsd.toFixed(2)} {invoice.currency}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Footer & Terms */}
              <div className="pt-6 border-t border-[#E5E5E5] flex flex-col sm:flex-row sm:items-end justify-between gap-4 text-xs text-[#737373]">
                <div className="space-y-1 max-w-lg">
                  <div className="font-semibold text-[#111111]">
                    Payment Terms: <span className="font-normal text-[#525252]">{tpl.paymentTerms}</span>
                  </div>
                  {tpl.footerNotes && <p className="leading-relaxed">{tpl.footerNotes}</p>}
                </div>
                <div className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[#525252] shrink-0">
                  <ShieldCheck className="w-3.5 h-3.5 text-[#16A34A]" />
                  Verified Receipt · BrosDev Pay
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
