import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Clock,
  Eye,
  LayoutTemplate,
  Lock,
  Pause,
  Play,
  Plus,
  Trash2,
  Workflow,
  X,
  Zap,
} from 'lucide-react';
import type { WorkspaceMe } from '../types';
import type { PlanLockKey } from '../lib/planLimits';
import { hasPlanFeature } from '../lib/planLimits';
import { compileEmailHtml } from './emailRenderer';
import { TEMPLATE_CATEGORY_LABELS } from './starterTemplates';
import {
  createEmailAutomation,
  deleteCustomEmailTemplate,
  deleteEmailAutomation,
  enqueueAutomationForSubscriber,
  toggleAutomationStatus,
} from './campaignsFirestore';
import type {
  AutomationActionType,
  AutomationTriggerType,
  EmailAutomationRecord,
  EmailAutomationStepRecord,
  EmailListRecord,
  EmailScheduledJobRecord,
  EmailSenderSettingsRecord,
  EmailTemplateCategory,
  EmailTemplateRecord,
} from './types';

interface Props {
  workspace: WorkspaceMe;
  initialTab?: 'templates' | 'automations';
  templates: EmailTemplateRecord[];
  automations: EmailAutomationRecord[];
  automationSteps: EmailAutomationStepRecord[];
  lists: EmailListRecord[];
  scheduledJobs: EmailScheduledJobRecord[];
  senderSettings: EmailSenderSettingsRecord;
  onUseTemplate: (tpl: EmailTemplateRecord) => void;
  onRefresh: () => Promise<void>;
  onRequireUpgrade: (lockKey: PlanLockKey) => void;
}

const TRIGGER_LABELS: Record<AutomationTriggerType, string> = {
  new_subscriber: 'New Subscriber Added',
  subscriber_confirmed: 'Subscriber Double Opt-In Confirmed',
  added_to_list: 'Added to Audience List',
  new_customer: 'New Customer Created',
  product_announcement: 'Product Announcement Triggered',
  scheduled_newsletter: 'Scheduled Newsletter Sequence',
};

const ACTION_LABELS: Record<AutomationActionType, string> = {
  send_welcome: 'Send Welcome Email',
  send_confirmation: 'Send Confirmation Email',
  send_announcement: 'Send Product Announcement',
  send_followup: 'Send Follow-Up Email',
  add_tag: 'Add Subscriber Tag',
  update_status: 'Update Subscriber Status',
};

export function TemplatesAndAutomationsView({
  workspace,
  initialTab = 'templates',
  templates,
  automations,
  automationSteps,
  lists,
  scheduledJobs,
  senderSettings,
  onUseTemplate,
  onRefresh,
  onRequireUpgrade,
}: Props) {
  const [tab, setTab] = useState<'templates' | 'automations'>(initialTab);
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [previewTpl, setPreviewTpl] = useState<EmailTemplateRecord | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  // Automation creation form
  const [autoName, setAutoName] = useState('');
  const [autoDesc, setAutoDesc] = useState('');
  const [autoTrigger, setAutoTrigger] = useState<AutomationTriggerType>('new_subscriber');
  const [autoListId, setAutoListId] = useState('');
  const [stepsDraft, setStepsDraft] = useState<
    Array<{
      actionType: AutomationActionType;
      delayMinutes: number;
      subject: string;
      templateId: string;
      tagValue: string;
    }>
  >([
    {
      actionType: 'send_welcome',
      delayMinutes: 0,
      subject: 'Welcome to our engineering newsletter',
      templateId: 'tpl_welcome_email',
      tagValue: '',
    },
    {
      actionType: 'send_followup',
      delayMinutes: 4320,
      subject: 'Getting started checklist & top guides',
      templateId: 'tpl_weekly_digest',
      tagValue: '',
    },
  ]);

  const [testRunEmail, setTestRunEmail] = useState(workspace.user.email || '');

  const canAutomate = hasPlanFeature(workspace, 'campaignAutomation');

  const filteredTemplates = useMemo(
    () =>
      templates.filter((t) =>
        categoryFilter === 'all' ? true : t.category === (categoryFilter as EmailTemplateCategory)
      ),
    [templates, categoryFilter]
  );

  const automationJobs = useMemo(
    () => scheduledJobs.filter((j) => j.jobType === 'automation_step'),
    [scheduledJobs]
  );

  async function handleCreateAutomation(e: React.FormEvent) {
    e.preventDefault();
    if (!canAutomate) {
      onRequireUpgrade('campaignAutomation');
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      await createEmailAutomation({
        name: autoName,
        description: autoDesc,
        triggerType: autoTrigger,
        targetListId: autoListId,
        steps: stepsDraft,
      });
      setAutoName('');
      setAutoDesc('');
      await onRefresh();
      setNotice({ kind: 'ok', text: 'Email automation sequence created and activated.' });
    } catch (err) {
      setNotice({
        kind: 'err',
        text: err instanceof Error ? err.message : 'Failed to create automation.',
      });
    } finally {
      setBusy(false);
    }
  }

  async function handleEnqueueTestRun(auto: EmailAutomationRecord) {
    if (!canAutomate) {
      onRequireUpgrade('campaignAutomation');
      return;
    }
    const steps = automationSteps.filter((s) => s.automationId === auto.id);
    if (steps.length === 0) return;
    setBusy(true);
    setNotice(null);
    try {
      const count = await enqueueAutomationForSubscriber(auto, steps, testRunEmail);
      await onRefresh();
      setNotice({
        kind: 'ok',
        text: `Queued ${count} durable automation step job(s) for ${testRunEmail}.`,
      });
    } catch (err) {
      setNotice({ kind: 'err', text: err instanceof Error ? err.message : 'Could not enqueue.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="bg-white border border-neutral-200 rounded-xl px-4 py-2.5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setTab('templates')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg ${
              tab === 'templates'
                ? 'bg-[#111111] text-white'
                : 'text-neutral-600 hover:bg-neutral-100'
            }`}
          >
            <LayoutTemplate className="w-3.5 h-3.5" /> Email Templates ({templates.length})
          </button>
          <button
            type="button"
            onClick={() => setTab('automations')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg ${
              tab === 'automations'
                ? 'bg-[#111111] text-white'
                : 'text-neutral-600 hover:bg-neutral-100'
            }`}
          >
            {!canAutomate && <Lock className="w-3 h-3 text-amber-500" />}
            <Workflow className="w-3.5 h-3.5" /> Automations ({automations.length})
          </button>
        </div>

        {tab === 'templates' && (
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="text-xs border border-neutral-200 rounded-lg px-2.5 py-1.5"
          >
            <option value="all">All 10 Categories</option>
            {Object.entries(TEMPLATE_CATEGORY_LABELS).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
        )}
      </div>

      {notice && (
        <div
          className={`px-4 py-2.5 rounded-xl border text-xs font-medium flex items-center gap-2 ${
            notice.kind === 'ok'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-red-50 border-red-200 text-[#A90706]'
          }`}
        >
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{notice.text}</span>
        </div>
      )}

      {/* TEMPLATES GALLERY */}
      {tab === 'templates' && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredTemplates.map((tpl) => (
            <div
              key={tpl.id}
              className="bg-white border border-neutral-200 rounded-xl p-4 flex flex-col justify-between gap-3"
            >
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-mono uppercase tracking-wider text-[#A90706] font-semibold">
                    {TEMPLATE_CATEGORY_LABELS[tpl.category] || tpl.category}
                  </span>
                  <span className="text-[11px] text-neutral-400">
                    {tpl.isBuiltIn ? 'Starter' : 'Custom'}
                  </span>
                </div>
                <h3 className="text-sm font-bold text-[#111111]">{tpl.name}</h3>
                <p className="text-xs text-neutral-600 line-clamp-2">{tpl.description}</p>
                <div className="text-[11px] text-neutral-500 bg-neutral-50 border border-neutral-200 rounded-md px-2.5 py-1.5 truncate">
                  Subject: <span className="text-[#111111] font-medium">{tpl.subject}</span>
                </div>
              </div>

              <div className="flex items-center justify-between gap-2 pt-2 border-t border-neutral-100">
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setPreviewTpl(tpl)}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold border border-neutral-200 rounded-lg hover:bg-neutral-50"
                  >
                    <Eye className="w-3.5 h-3.5" /> Preview
                  </button>
                  {!tpl.isBuiltIn && (
                    <button
                      type="button"
                      onClick={async () => {
                        await deleteCustomEmailTemplate(tpl.id);
                        await onRefresh();
                      }}
                      className="p-1.5 text-neutral-400 hover:text-[#A90706]"
                      title="Delete custom template"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => onUseTemplate(tpl)}
                  className="px-3 py-1.5 text-xs font-semibold bg-[#A90706] hover:bg-[#8E0605] text-white rounded-lg"
                >
                  Use Template
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* AUTOMATIONS STUDIO */}
      {tab === 'automations' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
          <form
            onSubmit={handleCreateAutomation}
            className="lg:col-span-5 bg-white border border-neutral-200 rounded-xl p-4 space-y-3 text-xs"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-bold text-sm text-[#111111]">
                <Zap className="w-4 h-4 text-[#A90706]" /> Create Automation Sequence
              </div>
              {!canAutomate && (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700">
                  <Lock className="w-3 h-3" /> Professional+
                </span>
              )}
            </div>

            <input
              required
              value={autoName}
              onChange={(e) => setAutoName(e.target.value)}
              placeholder="Sequence name (e.g. New Subscriber Welcome Series)"
              className="w-full border border-neutral-200 rounded-lg px-2.5 py-2"
            />
            <input
              value={autoDesc}
              onChange={(e) => setAutoDesc(e.target.value)}
              placeholder="Short description"
              className="w-full border border-neutral-200 rounded-lg px-2.5 py-2"
            />

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block font-semibold text-neutral-700 mb-1">Trigger Event</label>
                <select
                  value={autoTrigger}
                  onChange={(e) => setAutoTrigger(e.target.value as AutomationTriggerType)}
                  className="w-full border border-neutral-200 rounded-lg px-2 py-2"
                >
                  {Object.entries(TRIGGER_LABELS).map(([k, label]) => (
                    <option key={k} value={k}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-semibold text-neutral-700 mb-1">
                  Target List (Optional)
                </label>
                <select
                  value={autoListId}
                  onChange={(e) => setAutoListId(e.target.value)}
                  className="w-full border border-neutral-200 rounded-lg px-2 py-2"
                >
                  <option value="">Any list</option>
                  {lists.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-2 pt-2 border-t border-neutral-200">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-neutral-700">
                  Sequence Steps ({stepsDraft.length})
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setStepsDraft((prev) => [
                      ...prev,
                      {
                        actionType: 'send_followup',
                        delayMinutes: 1440,
                        subject: 'Follow-up update',
                        templateId: 'tpl_newsletter_classic',
                        tagValue: '',
                      },
                    ])
                  }
                  className="inline-flex items-center gap-1 text-[#A90706] font-semibold"
                >
                  <Plus className="w-3.5 h-3.5" /> Add Step
                </button>
              </div>

              {stepsDraft.map((step, idx) => (
                <div
                  key={idx}
                  className="p-2.5 bg-neutral-50 border border-neutral-200 rounded-lg space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-neutral-600">Step {idx + 1}</span>
                    {stepsDraft.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setStepsDraft((p) => p.filter((_, i) => i !== idx))}
                        className="text-neutral-400 hover:text-[#A90706]"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      value={step.actionType}
                      onChange={(e) => {
                        const next = [...stepsDraft];
                        next[idx] = {
                          ...step,
                          actionType: e.target.value as AutomationActionType,
                        };
                        setStepsDraft(next);
                      }}
                      className="border border-neutral-200 bg-white rounded px-2 py-1.5"
                    >
                      {Object.entries(ACTION_LABELS).map(([k, label]) => (
                        <option key={k} value={k}>
                          {label}
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min={0}
                      value={step.delayMinutes}
                      onChange={(e) => {
                        const next = [...stepsDraft];
                        next[idx] = { ...step, delayMinutes: Number(e.target.value) };
                        setStepsDraft(next);
                      }}
                      placeholder="Delay (minutes)"
                      className="border border-neutral-200 bg-white rounded px-2 py-1.5 font-mono"
                    />
                  </div>
                  {step.actionType === 'add_tag' ? (
                    <input
                      value={step.tagValue}
                      onChange={(e) => {
                        const next = [...stepsDraft];
                        next[idx] = { ...step, tagValue: e.target.value };
                        setStepsDraft(next);
                      }}
                      placeholder="Tag name to add"
                      className="w-full border border-neutral-200 bg-white rounded px-2 py-1.5"
                    />
                  ) : (
                    <input
                      value={step.subject}
                      onChange={(e) => {
                        const next = [...stepsDraft];
                        next[idx] = { ...step, subject: e.target.value };
                        setStepsDraft(next);
                      }}
                      placeholder="Email subject line"
                      className="w-full border border-neutral-200 bg-white rounded px-2 py-1.5"
                    />
                  )}
                </div>
              ))}
            </div>

            <button
              type="submit"
              disabled={busy}
              className="w-full py-2 bg-[#A90706] hover:bg-[#8E0605] text-white font-semibold rounded-lg"
            >
              Create Automation
            </button>
          </form>

          <div className="lg:col-span-7 space-y-4">
            <div className="bg-white border border-neutral-200 rounded-xl p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-bold text-[#111111]">Active &amp; Paused Sequences</h3>
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-neutral-500">Test subscriber:</span>
                  <input
                    value={testRunEmail}
                    onChange={(e) => setTestRunEmail(e.target.value)}
                    className="border border-neutral-200 rounded px-2 py-1 font-mono text-[11px] w-48"
                  />
                </div>
              </div>

              {automations.length === 0 ? (
                <p className="text-xs text-neutral-500 py-6 text-center">
                  No automation workflows configured yet. Build a welcome or onboarding drip on the
                  left.
                </p>
              ) : (
                <div className="space-y-2.5">
                  {automations.map((auto) => {
                    const steps = automationSteps.filter((s) => s.automationId === auto.id);
                    return (
                      <div
                        key={auto.id}
                        className="border border-neutral-200 rounded-lg p-3.5 text-xs space-y-2"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="font-bold text-[#111111] flex items-center gap-2">
                              <span>{auto.name}</span>
                              <span
                                className={`text-[10px] font-mono uppercase px-1.5 py-0.5 rounded ${
                                  auto.status === 'active'
                                    ? 'bg-emerald-50 text-emerald-700'
                                    : 'bg-neutral-100 text-neutral-600'
                                }`}
                              >
                                {auto.status}
                              </span>
                            </div>
                            <div className="text-[11px] text-neutral-500 mt-0.5">
                              Trigger: {TRIGGER_LABELS[auto.triggerType]} &middot; {steps.length}{' '}
                              step(s) &middot; {auto.triggeredCount} triggered
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleEnqueueTestRun(auto)}
                              className="px-2.5 py-1 border border-neutral-200 hover:bg-neutral-50 rounded font-semibold"
                            >
                              Queue Test
                            </button>
                            <button
                              type="button"
                              onClick={async () => {
                                await toggleAutomationStatus(
                                  auto.id,
                                  auto.status === 'active' ? 'paused' : 'active'
                                );
                                await onRefresh();
                              }}
                              className="p-1.5 border border-neutral-200 rounded hover:bg-neutral-50"
                              title={auto.status === 'active' ? 'Pause' : 'Activate'}
                            >
                              {auto.status === 'active' ? (
                                <Pause className="w-3.5 h-3.5" />
                              ) : (
                                <Play className="w-3.5 h-3.5" />
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={async () => {
                                await deleteEmailAutomation(
                                  auto.id,
                                  steps.map((s) => s.id)
                                );
                                await onRefresh();
                              }}
                              className="p-1.5 text-neutral-400 hover:text-[#A90706]"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          {steps.map((s) => (
                            <span
                              key={s.id}
                              className="inline-flex items-center gap-1 bg-neutral-50 border border-neutral-200 rounded px-2 py-0.5 text-[11px] text-neutral-700"
                            >
                              <Clock className="w-3 h-3 text-neutral-400" />
                              {s.delayMinutes === 0 ? 'Immediate' : `+${s.delayMinutes}m`}:{' '}
                              {ACTION_LABELS[s.actionType]}
                            </span>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {automationJobs.length > 0 && (
              <div className="bg-white border border-neutral-200 rounded-xl p-4 space-y-2 text-xs">
                <h4 className="font-bold text-[#111111]">
                  Durable Automation Job Queue ({automationJobs.length})
                </h4>
                <div className="divide-y divide-neutral-100">
                  {automationJobs.slice(0, 8).map((job) => (
                    <div key={job.id} className="py-2 flex items-center justify-between gap-2">
                      <div className="font-mono text-[11px] text-neutral-700 truncate">
                        {job.subscriberEmail || job.automationId}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[11px] text-neutral-500">
                          {new Date(job.scheduledAt).toLocaleString()}
                        </span>
                        <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-neutral-100 text-neutral-700">
                          {job.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Template HTML Preview Modal */}
      {previewTpl && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white border border-neutral-200 rounded-xl w-full max-w-2xl overflow-hidden">
            <div className="px-4 py-3 border-b border-neutral-200 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-[#111111]">{previewTpl.name}</h3>
                <p className="text-xs text-neutral-500">Subject: {previewTpl.subject}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const chosen = previewTpl;
                    setPreviewTpl(null);
                    onUseTemplate(chosen);
                  }}
                  className="px-3 py-1.5 text-xs font-semibold bg-[#A90706] text-white rounded-lg"
                >
                  Use Template
                </button>
                <button type="button" onClick={() => setPreviewTpl(null)}>
                  <X className="w-4 h-4 text-neutral-400" />
                </button>
              </div>
            </div>
            <div className="p-4 bg-[#F5F5F5]">
              <iframe
                title={previewTpl.name}
                sandbox="allow-popups"
                srcDoc={compileEmailHtml({
                  subject: previewTpl.subject,
                  previewText: previewTpl.previewText,
                  blocks: previewTpl.blocks,
                  design: previewTpl.designSettings,
                  senderSettings,
                  personalization: { first_name: 'Alex', last_name: 'Rivera' },
                })}
                className="w-full h-[460px] bg-white border border-neutral-200 rounded-lg"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
