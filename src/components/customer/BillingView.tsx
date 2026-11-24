import React, { useEffect, useState } from 'react';
import { Check, CreditCard, Lock, ShieldCheck, X } from 'lucide-react';
import { apiRequest } from '../../lib/api';
import { PlanRecord } from '../../types';
import { useAuth } from '../../context/AuthContext';

interface BillingPayload {
  subscription: {
    id: number;
    planId: number;
    status: string;
    billingCycle: 'monthly' | 'yearly';
    provider: string;
    currentPeriodEnd: string;
    trialEndsAt: string | null;
  } | null;
  currentPlan: PlanRecord | null;
  usage: {
    periodMonth: string;
    submissionsCount: number;
    emailsSentCount: number;
    apiRequestsCount: number;
    storageBytes: number;
  } | null;
  currentFormCount: number;
  plans: PlanRecord[];
  payments: Array<{
    id: number;
    provider: string;
    providerPaymentId: string;
    amountCents: number;
    currency: string;
    status: string;
    refundStatus: string;
    metadata?: { cardBrand?: string; last4?: string; declineReason?: string };
    createdAt: string;
  }>;
  invoices: Array<{
    id: number;
    invoiceNumber: string;
    amountCents: number;
    currency: string;
    status: string;
    issuedAt: string;
  }>;
}

function formatCardNumber(input: string): string {
  const digits = input.replace(/\D/g, '').slice(0, 19);
  return digits.replace(/(\d{4})(?=\d)/g, '$1 ');
}

function detectBrandLabel(input: string): string {
  const digits = input.replace(/\D/g, '');
  if (/^4/.test(digits)) return 'Visa';
  if (/^(5[1-5]|2[2-7])/.test(digits)) return 'Mastercard';
  if (/^3[47]/.test(digits)) return 'Amex';
  return 'Card';
}

export const BillingView: React.FC = () => {
  const { workspace, refreshWorkspace } = useAuth();
  const [data, setData] = useState<BillingPayload | null>(null);
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly');
  const [busyPlanId, setBusyPlanId] = useState<number | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  // BrosDev Pay checkout modal state
  const [checkoutPlan, setCheckoutPlan] = useState<PlanRecord | null>(null);
  const [cardholderName, setCardholderName] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [expiry, setExpiry] = useState('');
  const [cvc, setCvc] = useState('');
  const [billingZip, setBillingZip] = useState('');
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [processingPayment, setProcessingPayment] = useState(false);

  const load = async () => {
    const res = await apiRequest<BillingPayload>('/api/billing');
    setData(res);
  };

  useEffect(() => {
    load();
  }, []);

  const handlePlanClick = async (plan: PlanRecord) => {
    const priceCents =
      billingCycle === 'yearly' ? plan.yearlyPriceCents : plan.monthlyPriceCents;

    if (priceCents === 0) {
      setBusyPlanId(plan.id);
      setNotice(null);
      try {
        const res = await apiRequest<{ message?: string }>('/api/billing/brosdev-pay/checkout', {
          method: 'POST',
          body: { planId: plan.id, billingCycle },
        });
        setNotice({ ok: true, text: res.message || `Switched to ${plan.name}.` });
        await Promise.all([load(), refreshWorkspace()]);
      } catch (err: any) {
        setNotice({ ok: false, text: err.message || 'Unable to switch plan.' });
      } finally {
        setBusyPlanId(null);
      }
      return;
    }

    setCardholderName(workspace?.user.displayName || '');
    setCardNumber('');
    setExpiry('');
    setCvc('');
    setBillingZip('');
    setCheckoutError(null);
    setCheckoutPlan(plan);
  };

  const handleBrosDevPaySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!checkoutPlan) return;
    setCheckoutError(null);

    const [expMonth = '', expYear = ''] = expiry.split('/').map((s) => s.trim());
    if (!expMonth || !expYear) {
      setCheckoutError('Enter expiration date in MM/YY format.');
      return;
    }

    setProcessingPayment(true);
    try {
      const res = await apiRequest<{ message: string; invoiceNumber?: string }>(
        '/api/billing/brosdev-pay/checkout',
        {
          method: 'POST',
          body: {
            planId: checkoutPlan.id,
            billingCycle,
            cardholderName: cardholderName.trim(),
            cardNumber: cardNumber.replace(/\s+/g, ''),
            expiryMonth: expMonth,
            expiryYear: expYear,
            cvc: cvc.trim(),
            billingZip: billingZip.trim(),
          },
        }
      );
      setCheckoutPlan(null);
      setNotice({
        ok: true,
        text: res.invoiceNumber ? `${res.message} Invoice ${res.invoiceNumber} issued.` : res.message,
      });
      await Promise.all([load(), refreshWorkspace()]);
    } catch (err: any) {
      setCheckoutError(err.message || 'Payment could not be authorized.');
      await load();
    } finally {
      setProcessingPayment(false);
    }
  };

  if (!data) {
    return (
      <div className="bg-white border border-[#E5E5E5] rounded-lg p-10 text-center text-sm text-[#737373]">
        Loading billing and subscription usage...
      </div>
    );
  }

  const checkoutAmountUsd = checkoutPlan
    ? (
        (billingCycle === 'yearly'
          ? checkoutPlan.yearlyPriceCents
          : checkoutPlan.monthlyPriceCents) / 100
      ).toFixed(2)
    : '0.00';

  return (
    <div className="space-y-6">
      {/* Current Plan & Usage Summary */}
      <div className="bg-white border border-[#E5E5E5] rounded-lg p-6">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-5 border-b border-[#E5E5E5]">
          <div>
            <div className="text-xs text-[#525252] font-medium">Current Subscription</div>
            <div className="text-xl font-bold text-[#111111] mt-1">
              {data.currentPlan?.name || 'Free'} Plan ·{' '}
              <span className="text-sm font-semibold capitalize text-[#16A34A]">
                {data.subscription?.status || 'active'}
              </span>
            </div>
            {data.subscription?.currentPeriodEnd && (
              <div className="text-xs text-[#737373] mt-1 font-mono">
                Renews {new Date(data.subscription.currentPeriodEnd).toLocaleDateString()} · Billing:{' '}
                {data.subscription.billingCycle} · Processor: BrosDev Pay
              </div>
            )}
          </div>

          <div className="flex items-center gap-1 p-1 bg-[#F5F5F5] rounded-lg">
            <button
              onClick={() => setBillingCycle('monthly')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md cursor-pointer ${
                billingCycle === 'monthly' ? 'bg-white text-[#111111] shadow-xs' : 'text-[#525252]'
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => setBillingCycle('yearly')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md cursor-pointer ${
                billingCycle === 'yearly' ? 'bg-white text-[#111111] shadow-xs' : 'text-[#525252]'
              }`}
            >
              Yearly
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 pt-5">
          <div>
            <div className="text-xs text-[#525252]">Forms Created</div>
            <div className="text-lg font-bold font-mono tabular-nums text-[#111111] mt-1">
              {data.currentFormCount} / {data.currentPlan?.maxForms ?? 2}
            </div>
          </div>
          <div>
            <div className="text-xs text-[#525252]">Submissions (This Month)</div>
            <div className="text-lg font-bold font-mono tabular-nums text-[#111111] mt-1">
              {(data.usage?.submissionsCount ?? 0).toLocaleString()} /{' '}
              {(data.currentPlan?.maxSubmissionsPerMonth ?? 100).toLocaleString()}
            </div>
          </div>
          <div>
            <div className="text-xs text-[#525252]">Emails Sent (This Month)</div>
            <div className="text-lg font-bold font-mono tabular-nums text-[#111111] mt-1">
              {(data.usage?.emailsSentCount ?? 0).toLocaleString()} /{' '}
              {(data.currentPlan?.maxEmailsPerMonth ?? 100).toLocaleString()}
            </div>
          </div>
          <div>
            <div className="text-xs text-[#525252]">Storage Used</div>
            <div className="text-lg font-bold font-mono tabular-nums text-[#111111] mt-1">
              {((data.usage?.storageBytes ?? 0) / (1024 * 1024)).toFixed(2)} MB /{' '}
              {data.currentPlan?.maxStorageMb ?? 25} MB
            </div>
          </div>
        </div>
      </div>

      {notice && (
        <div
          className={`p-4 rounded-lg text-sm border ${
            notice.ok
              ? 'bg-[#F0FDF4] border-[#BBF7D0] text-[#15803D]'
              : 'bg-[#FEF2F2] border-[#FECACA] text-[#A90706]'
          }`}
        >
          {notice.text}
        </div>
      )}

      {/* Plans Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {data.plans.map((plan) => {
          const isCurrent = data.currentPlan?.id === plan.id;
          const price =
            billingCycle === 'yearly'
              ? Math.round(plan.yearlyPriceCents / 100)
              : Math.round(plan.monthlyPriceCents / 100);
          return (
            <div
              key={plan.id}
              className={`bg-white border rounded-lg p-6 flex flex-col justify-between ${
                isCurrent ? 'border-[#A90706]' : 'border-[#E5E5E5]'
              }`}
            >
              <div>
                <div className="text-xs text-[#737373]">{plan.audienceLabel || 'SaaS Tier'}</div>
                <h3 className="text-lg font-bold text-[#111111] mt-1">{plan.name}</h3>
                <div className="mt-4 flex items-baseline gap-1">
                  <span className="text-3xl font-bold font-mono tabular-nums text-[#111111]">
                    ${price}
                  </span>
                  <span className="text-xs text-[#737373]">
                    /{billingCycle === 'yearly' ? 'year' : 'month'}
                  </span>
                </div>

                <ul className="mt-5 pt-5 border-t border-[#EFEFEF] space-y-2.5 text-xs text-[#333333]">
                  <li className="flex items-center gap-2">
                    <Check className="w-3.5 h-3.5 text-[#16A34A] shrink-0" />
                    <span className="tabular-nums">Up to {plan.maxForms} forms</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-3.5 h-3.5 text-[#16A34A] shrink-0" />
                    <span className="tabular-nums">
                      {plan.maxSubmissionsPerMonth.toLocaleString()} submissions/mo
                    </span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-3.5 h-3.5 text-[#16A34A] shrink-0" />
                    <span className="tabular-nums">
                      {plan.maxEmailsPerMonth.toLocaleString()} Resend emails/mo
                    </span>
                  </li>
                  {plan.features.multipleRecipients && (
                    <li className="flex items-center gap-2">
                      <Check className="w-3.5 h-3.5 text-[#16A34A] shrink-0" />
                      <span>Multiple email recipients</span>
                    </li>
                  )}
                  {plan.features.removeBranding && (
                    <li className="flex items-center gap-2">
                      <Check className="w-3.5 h-3.5 text-[#16A34A] shrink-0" />
                      <span>Remove BrosDev branding</span>
                    </li>
                  )}
                  {plan.features.webhooks && (
                    <li className="flex items-center gap-2">
                      <Check className="w-3.5 h-3.5 text-[#16A34A] shrink-0" />
                      <span>Webhooks &amp; priority API</span>
                    </li>
                  )}
                </ul>
              </div>

              <button
                onClick={() => handlePlanClick(plan)}
                disabled={isCurrent || busyPlanId === plan.id}
                className={`mt-6 w-full py-2.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                  isCurrent
                    ? 'bg-[#F5F5F5] text-[#737373] cursor-default'
                    : 'bg-[#A90706] hover:bg-[#8C0605] text-white'
                }`}
              >
                {isCurrent
                  ? 'Current Plan'
                  : busyPlanId === plan.id
                    ? 'Updating...'
                    : price === 0
                      ? 'Switch to Free'
                      : `Pay with BrosDev Pay`}
              </button>
            </div>
          );
        })}
      </div>

      {/* Payment History & Invoices */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border border-[#E5E5E5] rounded-lg overflow-hidden">
          <div className="px-5 py-3.5 border-b border-[#E5E5E5] font-bold text-sm text-[#111111]">
            Payment History
          </div>
          {data.payments.length === 0 ? (
            <div className="p-8 text-center text-xs text-[#737373]">No payments recorded yet.</div>
          ) : (
            <table className="w-full text-left text-xs">
              <thead className="bg-[#FAFAFA] border-b border-[#E5E5E5] text-[#525252]">
                <tr>
                  <th className="py-2.5 px-4">Method</th>
                  <th className="py-2.5 px-4">Amount</th>
                  <th className="py-2.5 px-4">Status</th>
                  <th className="py-2.5 px-4 text-right">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EFEFEF]">
                {data.payments.map((p) => (
                  <tr key={p.id}>
                    <td className="py-2.5 px-4 font-medium">
                      BrosDev Pay
                      {p.metadata?.last4 && (
                        <span className="text-[#737373] font-mono ml-1.5">
                          · {p.metadata.cardBrand || 'Card'} •••• {p.metadata.last4}
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-4 font-mono tabular-nums">
                      ${(p.amountCents / 100).toFixed(2)} {p.currency}
                    </td>
                    <td
                      className={`py-2.5 px-4 capitalize font-semibold ${
                        p.status === 'succeeded'
                          ? 'text-[#16A34A]'
                          : p.status === 'failed'
                            ? 'text-[#A90706]'
                            : 'text-[#737373]'
                      }`}
                    >
                      {p.status}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono text-[#737373]">
                      {new Date(p.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="bg-white border border-[#E5E5E5] rounded-lg overflow-hidden">
          <div className="px-5 py-3.5 border-b border-[#E5E5E5] font-bold text-sm text-[#111111]">
            Invoices
          </div>
          {data.invoices.length === 0 ? (
            <div className="p-8 text-center text-xs text-[#737373]">No invoices issued yet.</div>
          ) : (
            <table className="w-full text-left text-xs">
              <thead className="bg-[#FAFAFA] border-b border-[#E5E5E5] text-[#525252]">
                <tr>
                  <th className="py-2.5 px-4">Invoice #</th>
                  <th className="py-2.5 px-4">Amount</th>
                  <th className="py-2.5 px-4">Status</th>
                  <th className="py-2.5 px-4 text-right">Issued</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EFEFEF]">
                {data.invoices.map((inv) => (
                  <tr key={inv.id}>
                    <td className="py-2.5 px-4 font-mono font-medium">{inv.invoiceNumber}</td>
                    <td className="py-2.5 px-4 font-mono tabular-nums">
                      ${(inv.amountCents / 100).toFixed(2)} {inv.currency}
                    </td>
                    <td className="py-2.5 px-4 capitalize font-semibold text-[#16A34A]">
                      {inv.status}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono text-[#737373]">
                      {new Date(inv.issuedAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* BrosDev Pay Secure Card Checkout Modal */}
      {checkoutPlan && (
        <div className="fixed inset-0 bg-black/45 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white border border-[#E5E5E5] rounded-xl w-full max-w-lg overflow-hidden my-8">
            <div className="px-6 py-4 border-b border-[#E5E5E5] bg-[#FAFAFA] flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded bg-[#A90706] flex items-center justify-center text-white">
                  <CreditCard className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[#111111]">BrosDev Pay Checkout</h3>
                  <p className="text-[11px] text-[#525252]">Encrypted card authorization</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setCheckoutPlan(null)}
                className="p-1 text-[#737373] hover:text-[#111111] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleBrosDevPaySubmit} className="p-6 space-y-4">
              {/* Order Summary */}
              <div className="p-4 bg-[#F5F5F5] border border-[#E5E5E5] rounded-lg flex items-center justify-between">
                <div>
                  <div className="text-sm font-bold text-[#111111]">
                    BrosDev Forms — {checkoutPlan.name}
                  </div>
                  <div className="text-xs text-[#525252] capitalize">
                    {billingCycle} billing · {checkoutPlan.maxForms} forms ·{' '}
                    {checkoutPlan.maxSubmissionsPerMonth.toLocaleString()} submissions/mo
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-bold font-mono tabular-nums text-[#111111]">
                    ${checkoutAmountUsd}
                  </div>
                  <div className="text-[11px] text-[#737373]">USD</div>
                </div>
              </div>

              {checkoutError && (
                <div className="p-3 bg-[#FEF2F2] border border-[#FECACA] rounded-lg text-xs text-[#A90706]">
                  {checkoutError}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-[#111111] mb-1">
                  Cardholder Name
                </label>
                <input
                  type="text"
                  required
                  value={cardholderName}
                  onChange={(e) => setCardholderName(e.target.value)}
                  placeholder="Name as printed on card"
                  className="w-full px-3.5 py-2.5 text-sm border border-[#D4D4D4] rounded-lg focus:outline-none focus:border-[#111111]"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-[#111111]">Card Number</label>
                  <span className="text-[11px] font-mono text-[#737373]">
                    {cardNumber.replace(/\D/g, '').length > 0
                      ? detectBrandLabel(cardNumber)
                      : 'Visa · Mastercard · Amex'}
                  </span>
                </div>
                <input
                  type="text"
                  inputMode="numeric"
                  required
                  value={cardNumber}
                  onChange={(e) => setCardNumber(formatCardNumber(e.target.value))}
                  placeholder="0000 0000 0000 0000"
                  className="w-full px-3.5 py-2.5 text-sm font-mono tracking-wider border border-[#D4D4D4] rounded-lg focus:outline-none focus:border-[#111111]"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#111111] mb-1">
                    Expiry (MM/YY)
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={5}
                    value={expiry}
                    onChange={(e) => {
                      const clean = e.target.value.replace(/[^\d/]/g, '');
                      if (clean.length === 2 && !clean.includes('/') && expiry.length === 1) {
                        setExpiry(`${clean}/`);
                      } else {
                        setExpiry(clean);
                      }
                    }}
                    placeholder="12/29"
                    className="w-full px-3 py-2.5 text-sm font-mono border border-[#D4D4D4] rounded-lg focus:outline-none focus:border-[#111111]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#111111] mb-1">CVC</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    required
                    maxLength={4}
                    value={cvc}
                    onChange={(e) => setCvc(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    placeholder="123"
                    className="w-full px-3 py-2.5 text-sm font-mono border border-[#D4D4D4] rounded-lg focus:outline-none focus:border-[#111111]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#111111] mb-1">
                    Postal Code
                  </label>
                  <input
                    type="text"
                    value={billingZip}
                    onChange={(e) => setBillingZip(e.target.value)}
                    placeholder="10001"
                    className="w-full px-3 py-2.5 text-sm font-mono border border-[#D4D4D4] rounded-lg focus:outline-none focus:border-[#111111]"
                  />
                </div>
              </div>

              <div className="pt-2 flex items-center justify-between text-[11px] text-[#737373]">
                <span className="inline-flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5" />
                  Card details are never stored on disk
                </span>
                <span className="inline-flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5 text-[#16A34A]" />
                  BrosDev Pay
                </span>
              </div>

              <button
                type="submit"
                disabled={processingPayment}
                className="w-full py-3 text-sm font-semibold text-white bg-[#A90706] hover:bg-[#8C0605] rounded-lg transition-colors cursor-pointer disabled:opacity-60"
              >
                {processingPayment ? 'Authorizing Payment...' : `Pay $${checkoutAmountUsd} USD`}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
