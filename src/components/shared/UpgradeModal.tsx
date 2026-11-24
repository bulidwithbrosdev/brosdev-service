import React from 'react';
import { Lock, ArrowRight, Check, X } from 'lucide-react';
import { PLAN_LOCK_CATALOG, type PlanLockKey } from '../../lib/planLimits';
import type { WorkspaceMe } from '../../types';

interface UpgradeModalProps {
  lockKey: PlanLockKey | null;
  workspace: WorkspaceMe;
  onClose: () => void;
  onUpgrade: (targetPlanSlug: 'starter' | 'professional' | 'business') => void;
}

export const UpgradeModal: React.FC<UpgradeModalProps> = ({
  lockKey,
  workspace,
  onClose,
  onUpgrade,
}) => {
  if (!lockKey) return null;

  const info = PLAN_LOCK_CATALOG[lockKey];
  const currentPlanName = workspace.plan?.name || 'Free';
  const currentPrice =
    workspace.plan && workspace.plan.monthlyPriceCents > 0
      ? `$${(workspace.plan.monthlyPriceCents / 100).toFixed(0)}/mo`
      : '$0/mo';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="upgrade-modal-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-md border border-[#E5E5E5] bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-[#E5E5E5] px-6 py-5">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded border border-[#E5E5E5] bg-[#FAFAFA] text-[#A90706]">
              <Lock className="h-4 w-4" />
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-[#A90706]">
                {info.requiredPlan} Plan Feature
              </p>
              <h2
                id="upgrade-modal-title"
                className="mt-0.5 text-base font-bold text-[#111111]"
              >
                {info.title}
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close upgrade dialog"
            className="rounded p-1.5 text-[#737373] transition-colors hover:bg-[#F5F5F5] hover:text-[#111111]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="space-y-5 px-6 py-5">
          <p className="text-sm leading-relaxed text-[#525252]">{info.description}</p>

          {/* Current Plan vs Required Plan Comparison */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded border border-[#E5E5E5] bg-[#FAFAFA] p-4">
              <div className="flex items-center justify-between border-b border-[#E5E5E5] pb-2">
                <span className="text-xs font-bold text-[#111111]">
                  Your Plan: {currentPlanName}
                </span>
                <span className="text-xs font-semibold tabular-nums text-[#737373]">
                  {currentPrice}
                </span>
              </div>
              <ul className="mt-3 space-y-2">
                {info.currentPlanLimits.map((item) => (
                  <li key={item} className="flex items-start gap-2 text-xs text-[#525252]">
                    <Lock className="mt-0.5 h-3 w-3 shrink-0 text-[#A3A3A3]" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded border border-[#111111] bg-white p-4">
              <div className="flex items-center justify-between border-b border-[#E5E5E5] pb-2">
                <span className="text-xs font-bold text-[#111111]">
                  {info.requiredPlan} Plan
                </span>
                <span className="text-xs font-bold tabular-nums text-[#A90706]">
                  {info.requiredPriceLabel}
                </span>
              </div>
              <ul className="mt-3 space-y-2">
                {info.unlockedBenefits.map((item) => (
                  <li key={item} className="flex items-start gap-2 text-xs text-[#111111]">
                    <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#16A34A]" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <p className="text-xs text-[#737373]">{info.freeSummary}</p>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 border-t border-[#E5E5E5] bg-[#FAFAFA] px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-[#D4D4D4] bg-white px-4 py-2 text-xs font-semibold text-[#111111] hover:bg-[#F5F5F5]"
          >
            Stay on {currentPlanName}
          </button>
          <button
            type="button"
            onClick={() => onUpgrade(info.requiredPlanSlug)}
            className="inline-flex items-center gap-2 rounded bg-[#A90706] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#8A0505]"
          >
            Upgrade to {info.requiredPlan}
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
