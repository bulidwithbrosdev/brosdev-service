import React, { useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  CalendarClock,
  CheckCircle2,
  Columns,
  Copy,
  Eye,
  GripVertical,
  Image as ImageIcon,
  LayoutTemplate,
  Link2,
  Lock,
  Mail,
  Minus,
  Monitor,
  MousePointerClick,
  Plus,
  Save,
  Send,
  Share2,
  Smartphone,
  Space,
  Trash2,
  Type,
  AlertTriangle,
} from 'lucide-react';
import type { WorkspaceMe } from '../types';
import type { PlanLockKey } from '../lib/planLimits';
import { hasPlanFeature } from '../lib/planLimits';
import { compileEmailHtml, compileEmailText } from './emailRenderer';
import {
  createCampaignVersionSnapshot,
  dispatchCampaignNow,
  duplicateEmailCampaign,
  resolveEligibleRecipients,
  saveCustomEmailTemplate,
  saveEmailCampaign,
  scheduleCampaignDelivery,
  sendCampaignTestEmail,
} from './campaignsFirestore';
import type {
  EmailAudienceType,
  EmailBlock,
  EmailBlockType,
  EmailCampaignRecord,
  EmailCampaignType,
  EmailDesignSettings,
  EmailListRecord,
  EmailSegmentRecord,
  EmailSenderSettingsRecord,
  EmailSubscriberRecord,
  EmailSuppressionRecord,
  EmailTemplateRecord,
} from './types';
import { DEFAULT_DESIGN_SETTINGS } from './types';

interface Props {
  workspace: WorkspaceMe;
  initialCampaign: EmailCampaignRecord | null;
  initialType?: EmailCampaignType;
  initialTemplate?: EmailTemplateRecord | null;
  lists: EmailListRecord[];
  segments: EmailSegmentRecord[];
  subscribers: EmailSubscriberRecord[];
  suppressions: EmailSuppressionRecord[];
  templates: EmailTemplateRecord[];
  senderSettings: EmailSenderSettingsRecord;
  monthlyUsed: number;
  onBack: () => void;
  onSaved: (campaign: EmailCampaignRecord) => void;
  onRequireUpgrade: (lockKey: PlanLockKey) => void;
}

const BLOCK_CATALOG: Array<{
  type: EmailBlockType;
  label: string;
  icon: React.FC<{ className?: string }>;
}> = [
  { type: 'header', label: 'Header / Logo', icon: LayoutTemplate },
  { type: 'heading', label: 'Heading', icon: Type },
  { type: 'text', label: 'Text Paragraph', icon: Mail },
  { type: 'button', label: 'CTA Button', icon: MousePointerClick },
  { type: 'image', label: 'Image', icon: ImageIcon },
  { type: 'gallery', label: '2-Col Gallery', icon: Columns },
  { type: 'divider', label: 'Divider', icon: Minus },
  { type: 'spacer', label: 'Spacer', icon: Space },
  { type: 'social', label: 'Social Links', icon: Share2 },
  { type: 'footer', label: 'Footer & Unsub', icon: Link2 },
];

function createDefaultBlock(
  type: EmailBlockType,
  senderSettings: EmailSenderSettingsRecord
): EmailBlock {
  const id = `blk_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  switch (type) {
    case 'header':
      return {
        id,
        type,
        brandName: senderSettings.companyName || 'BrosDev Developer Services',
        tagline: 'BUILD. CONNECT. GROW.',
        logoUrl: senderSettings.companyLogoUrl || '',
        backgroundColor: '#111111',
        textColor: '#FFFFFF',
        align: 'left',
        paddingY: 20,
      };
    case 'heading':
      return {
        id,
        type,
        headingLevel: 'h1',
        title: 'New Announcement Title',
        align: 'left',
        paddingY: 16,
      };
    case 'text':
      return {
        id,
        type,
        body: 'Hi {{first_name}},\n\nWrite your newsletter story, release highlight, or company update here. Keep paragraphs concise for mobile readers.',
        align: 'left',
        paddingY: 12,
      };
    case 'button':
      return {
        id,
        type,
        buttonLabel: 'Explore Update',
        buttonUrl: senderSettings.companyWebsite || 'https://forms.brosdev.info',
        buttonColor: '#A90706',
        buttonTextColor: '#FFFFFF',
        buttonRadius: 6,
        align: 'left',
        paddingY: 16,
      };
    case 'image':
      return {
        id,
        type,
        imageUrl: '',
        imageAlt: 'Feature visual',
        caption: '',
        imageLink: '',
        align: 'center',
        paddingY: 12,
      };
    case 'gallery':
      return {
        id,
        type,
        galleryItems: [
          { imageUrl: '', alt: 'Left visual', caption: 'Highlight 1', linkUrl: '' },
          { imageUrl: '', alt: 'Right visual', caption: 'Highlight 2', linkUrl: '' },
        ],
        paddingY: 12,
      };
    case 'divider':
      return { id, type, dividerColor: '#E5E7EB', paddingY: 12 };
    case 'spacer':
      return { id, type, spacerHeight: 24 };
    case 'social':
      return {
        id,
        type,
        align: 'center',
        paddingY: 14,
        socialLinks: [
          { label: 'Website', url: senderSettings.companyWebsite || 'https://forms.brosdev.info' },
          { label: 'GitHub', url: 'https://github.com' },
          { label: 'X', url: 'https://x.com' },
        ],
      };
    case 'footer':
      return {
        id,
        type,
        companyName: senderSettings.companyName || 'BrosDev IT Engineering Studio',
        companyAddress: senderSettings.companyAddress || '548 Market Street, San Francisco, CA 94104',
        footerNote:
          senderSettings.defaultFooter ||
          'You received this email because you subscribed to our mailing list.',
        unsubscribeLabel: 'Unsubscribe',
      };
  }
}

export function CampaignBuilderView({
  workspace,
  initialCampaign,
  initialType = 'newsletter',
  initialTemplate,
  lists,
  segments,
  subscribers,
  suppressions,
  templates,
  senderSettings,
  monthlyUsed,
  onBack,
  onSaved,
  onRequireUpgrade,
}: Props) {
  const canRemoveBranding = hasPlanFeature(workspace, 'removeBranding');
  const canCustomTemplates = hasPlanFeature(workspace, 'campaignCustomTemplates');
  const canSchedule = hasPlanFeature(workspace, 'campaignScheduling');
  const canSegment = hasPlanFeature(workspace, 'campaignSegmentation');
  const maxCampaignEmails = workspace.limits.maxCampaignEmailsPerMonth || 500;

  const [campaignId, setCampaignId] = useState<string | undefined>(initialCampaign?.id);
  const [name, setName] = useState(
    initialCampaign?.name || initialTemplate?.name || 'New Email Campaign'
  );
  const [campaignType, setCampaignType] = useState<EmailCampaignType>(
    initialCampaign?.campaignType || initialType
  );
  const [subject, setSubject] = useState(
    initialCampaign?.subject || initialTemplate?.subject || 'Monthly Product Update'
  );
  const [previewText, setPreviewText] = useState(
    initialCampaign?.previewText ||
      initialTemplate?.previewText ||
      'Key highlights and engineering updates from our team.'
  );
  const [senderName, setSenderName] = useState(
    initialCampaign?.senderName || senderSettings.senderName || workspace.user.displayName || 'BrosDev Studio'
  );
  const [senderEmail, setSenderEmail] = useState(
    initialCampaign?.senderEmail || senderSettings.senderEmail || workspace.user.senderEmail
  );
  const [replyTo, setReplyTo] = useState(initialCampaign?.replyTo || senderSettings.replyTo || '');
  const [audienceType, setAudienceType] = useState<EmailAudienceType>(
    initialCampaign?.audienceType || (lists.length > 0 ? 'list' : 'all_subscribed')
  );
  const [listIds, setListIds] = useState<string[]>(
    initialCampaign?.listIds?.length
      ? initialCampaign.listIds
      : lists[0]?.id
        ? [lists[0].id]
        : []
  );
  const [segmentId, setSegmentId] = useState<string>(initialCampaign?.segmentId || segments[0]?.id || '');
  const [removeBranding, setRemoveBranding] = useState<boolean>(
    Boolean(initialCampaign?.removeBranding && canRemoveBranding)
  );

  const [blocks, setBlocks] = useState<EmailBlock[]>(() => {
    if (initialCampaign?.blocks?.length) return initialCampaign.blocks;
    if (initialTemplate?.blocks?.length) return initialTemplate.blocks.map((b) => ({ ...b }));
    return [
      createDefaultBlock('header', senderSettings),
      createDefaultBlock('heading', senderSettings),
      createDefaultBlock('text', senderSettings),
      createDefaultBlock('button', senderSettings),
      createDefaultBlock('footer', senderSettings),
    ];
  });

  const [design, setDesign] = useState<EmailDesignSettings>({
    ...DEFAULT_DESIGN_SETTINGS,
    ...(initialTemplate?.designSettings || {}),
    ...(initialCampaign?.designSettings || {}),
  });

  const [selectedBlockId, setSelectedBlockId] = useState<string>(blocks[0]?.id || '');
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [leftTab, setLeftTab] = useState<'blocks' | 'templates' | 'design'>('blocks');
  const [rightTab, setRightTab] = useState<'block' | 'settings'>('settings');
  const [previewMode, setPreviewMode] = useState<'desktop' | 'mobile'>('desktop');
  const [canvasView, setCanvasView] = useState<'editor' | 'preview'>('preview');

  const [saving, setSaving] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);
  const [testEmail, setTestEmail] = useState(workspace.user.email || '');
  const [showTestModal, setShowTestModal] = useState(false);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [showSendConfirm, setShowSendConfirm] = useState(false);
  const [scheduleDate, setScheduleDate] = useState(() => {
    const dt = new Date(Date.now() + 3600 * 1000);
    return dt.toISOString().slice(0, 16);
  });
  const [scheduleTz, setScheduleTz] = useState(
    Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  );
  const [dispatching, setDispatching] = useState(false);
  const [banner, setBanner] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  const selectedBlock = blocks.find((b) => b.id === selectedBlockId) || null;

  const audienceStats = useMemo(
    () =>
      resolveEligibleRecipients({
        audienceType,
        listIds,
        segmentId,
        subscribers,
        segments,
        suppressions,
      }),
    [audienceType, listIds, segmentId, subscribers, segments, suppressions]
  );

  const compiledHtml = useMemo(
    () =>
      compileEmailHtml({
        subject,
        previewText,
        blocks,
        design,
        senderSettings,
        removeBranding: canRemoveBranding && removeBranding,
        personalization: {
          first_name: 'Alex',
          last_name: 'Rivera',
          email: 'alex@example.com',
        },
        unsubscribeUrl: '#unsubscribe-preview',
      }),
    [subject, previewText, blocks, design, senderSettings, canRemoveBranding, removeBranding]
  );

  const productionHtml = useMemo(
    () =>
      compileEmailHtml({
        subject,
        previewText,
        blocks,
        design,
        senderSettings,
        removeBranding: canRemoveBranding && removeBranding,
      }),
    [subject, previewText, blocks, design, senderSettings, canRemoveBranding, removeBranding]
  );

  const productionText = useMemo(
    () =>
      compileEmailText({
        subject,
        previewText,
        blocks,
        design,
        senderSettings,
        removeBranding: canRemoveBranding && removeBranding,
      }),
    [subject, previewText, blocks, design, senderSettings, canRemoveBranding, removeBranding]
  );

  function addBlock(type: EmailBlockType) {
    const next = createDefaultBlock(type, senderSettings);
    setBlocks((prev) => {
      const footerIdx = prev.findIndex((b) => b.type === 'footer');
      if (footerIdx >= 0 && type !== 'footer') {
        const copy = [...prev];
        copy.splice(footerIdx, 0, next);
        return copy;
      }
      return [...prev, next];
    });
    setSelectedBlockId(next.id);
    setRightTab('block');
  }

  function updateBlock(id: string, patch: Partial<EmailBlock>) {
    setBlocks((prev) => prev.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  }

  function moveBlock(index: number, delta: -1 | 1) {
    const target = index + delta;
    if (target < 0 || target >= blocks.length) return;
    setBlocks((prev) => {
      const copy = [...prev];
      const [item] = copy.splice(index, 1);
      copy.splice(target, 0, item);
      return copy;
    });
  }

  function removeBlock(id: string) {
    setBlocks((prev) => prev.filter((b) => b.id !== id));
    if (selectedBlockId === id) setSelectedBlockId('');
  }

  function handleDrop(targetIndex: number) {
    if (dragIndex === null || dragIndex === targetIndex) {
      setDragIndex(null);
      return;
    }
    setBlocks((prev) => {
      const copy = [...prev];
      const [moved] = copy.splice(dragIndex, 1);
      copy.splice(targetIndex, 0, moved);
      return copy;
    });
    setDragIndex(null);
  }

  function applyTemplate(tpl: EmailTemplateRecord) {
    setSubject(tpl.subject);
    setPreviewText(tpl.previewText);
    setBlocks(tpl.blocks.map((b) => ({ ...b, id: `${b.id}_${Math.random().toString(36).slice(2, 5)}` })));
    setDesign({ ...DEFAULT_DESIGN_SETTINGS, ...tpl.designSettings });
    setBanner({ kind: 'success', text: `Loaded template "${tpl.name}".` });
  }

  async function persistCampaign(statusOverride?: EmailCampaignRecord['status']): Promise<EmailCampaignRecord> {
    const saved = await saveEmailCampaign(
      {
        id: campaignId,
        name: name.trim() || 'Untitled Campaign',
        campaignType,
        status: statusOverride || initialCampaign?.status || 'draft',
        subject: subject.trim() || 'Campaign Update',
        previewText,
        senderName,
        senderEmail,
        replyTo,
        audienceType,
        listIds,
        segmentId,
        blocks,
        designSettings: design,
        recipientCount: audienceStats.eligible.length,
        removeBranding: canRemoveBranding && removeBranding,
        stats: initialCampaign?.stats,
        createdAt: initialCampaign?.createdAt,
      },
      senderSettings
    );
    setCampaignId(saved.id);
    onSaved(saved);
    return saved;
  }

  async function handleSaveDraft() {
    setSaving(true);
    setBanner(null);
    try {
      const saved = await persistCampaign('draft');
      await createCampaignVersionSnapshot(saved, Date.now() % 10000);
      setBanner({ kind: 'success', text: 'Campaign draft and version snapshot saved.' });
    } catch (err) {
      setBanner({ kind: 'error', text: err instanceof Error ? err.message : 'Failed to save draft.' });
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveAsTemplate() {
    if (!canCustomTemplates) {
      onRequireUpgrade('campaignCustomTemplates');
      return;
    }
    setSaving(true);
    setBanner(null);
    try {
      await saveCustomEmailTemplate({
        name: `${name} Template`,
        category: campaignType === 'announcement' ? 'product_announcement' : 'newsletter',
        description: previewText || 'Saved custom workspace template',
        subject,
        previewText,
        blocks,
        designSettings: design,
      });
      setBanner({ kind: 'success', text: 'Saved as a reusable template in your Templates library.' });
    } catch (err) {
      setBanner({ kind: 'error', text: err instanceof Error ? err.message : 'Could not save template.' });
    } finally {
      setSaving(false);
    }
  }

  async function handleDuplicate() {
    setSaving(true);
    setBanner(null);
    try {
      const saved = await persistCampaign();
      const copy = await duplicateEmailCampaign(saved);
      setCampaignId(copy.id);
      setName(copy.name);
      onSaved(copy);
      setBanner({ kind: 'success', text: `Duplicated into "${copy.name}".` });
    } catch (err) {
      setBanner({ kind: 'error', text: err instanceof Error ? err.message : 'Duplicate failed.' });
    } finally {
      setSaving(false);
    }
  }

  async function handleSendTest() {
    setSendingTest(true);
    setBanner(null);
    try {
      const saved = await persistCampaign();
      const res = await sendCampaignTestEmail({
        campaignId: saved.id,
        toEmail: testEmail.trim(),
        subject,
        previewText,
        senderName,
        senderEmail,
        replyTo,
        html: productionHtml,
        text: productionText,
      });
      setShowTestModal(false);
      setBanner({ kind: 'success', text: res.message });
    } catch (err) {
      setBanner({ kind: 'error', text: err instanceof Error ? err.message : 'Test send failed.' });
    } finally {
      setSendingTest(false);
    }
  }

  async function handleSendNow() {
    if (senderSettings.campaignSuspended) {
      setBanner({
        kind: 'error',
        text: senderSettings.suspensionReason || 'Campaign sending is suspended for this workspace.',
      });
      return;
    }
    if (audienceStats.eligible.length === 0) {
      setBanner({
        kind: 'error',
        text: 'No eligible subscribed recipients match the selected audience. Add subscribed contacts first.',
      });
      return;
    }
    if (monthlyUsed + audienceStats.eligible.length > maxCampaignEmails) {
      setShowSendConfirm(false);
      onRequireUpgrade('campaignQuotaLimit');
      return;
    }

    setDispatching(true);
    setBanner(null);
    try {
      const saved = await persistCampaign('sending');
      const result = await dispatchCampaignNow({
        campaign: { ...saved, compiledHtml: productionHtml, compiledText: productionText },
        recipients: audienceStats.eligible,
        maxMonthlyQuota: maxCampaignEmails,
        usedThisMonth: monthlyUsed,
      });
      setShowSendConfirm(false);
      onSaved({ ...saved, status: result.sent > 0 ? 'sent' : 'failed' });
      setBanner({
        kind: result.failed > 0 && result.sent === 0 ? 'error' : 'success',
        text:
          result.sent > 0
            ? `Resend accepted ${result.sent} email(s)${result.failed > 0 ? ` (${result.failed} failed)` : ''}${result.skipped > 0 ? `, ${result.skipped} suppressed/skipped` : ''}.`
            : `Dispatch failed: ${result.errors[0] || 'Check RESEND_API_KEY and verified sender domain.'}`,
      });
    } catch (err) {
      setBanner({ kind: 'error', text: err instanceof Error ? err.message : 'Campaign send failed.' });
    } finally {
      setDispatching(false);
    }
  }

  async function handleConfirmSchedule() {
    if (!canSchedule) {
      setShowScheduleModal(false);
      onRequireUpgrade('campaignScheduling');
      return;
    }
    const iso = new Date(scheduleDate).toISOString();
    if (!iso || Number.isNaN(Date.parse(iso)) || Date.parse(iso) <= Date.now()) {
      setBanner({ kind: 'error', text: 'Select a valid future date and time.' });
      return;
    }
    setDispatching(true);
    setBanner(null);
    try {
      const saved = await persistCampaign('scheduled');
      await scheduleCampaignDelivery({
        campaign: saved,
        scheduledAtIso: iso,
        timezone: scheduleTz,
        recipientCount: audienceStats.eligible.length,
      });
      setShowScheduleModal(false);
      onSaved({ ...saved, status: 'scheduled', scheduledAt: iso, timezone: scheduleTz });
      setBanner({
        kind: 'success',
        text: `Scheduled durable delivery job for ${new Date(iso).toLocaleString()} (${scheduleTz}).`,
      });
    } catch (err) {
      setBanner({ kind: 'error', text: err instanceof Error ? err.message : 'Scheduling failed.' });
    } finally {
      setDispatching(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Top Action Bar */}
      <div className="bg-white border border-neutral-200 rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-neutral-700 bg-neutral-100 hover:bg-neutral-200 rounded-lg"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back
          </button>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Campaign name"
            className="text-sm font-bold text-[#111111] bg-transparent border border-transparent hover:border-neutral-200 focus:border-[#A90706] focus:outline-none rounded-md px-2 py-1 w-56 sm:w-72"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleSaveDraft}
            disabled={saving}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border border-neutral-200 bg-white hover:bg-neutral-50 text-[#111111] rounded-lg whitespace-nowrap"
          >
            <Save className="w-3.5 h-3.5" /> {saving ? 'Saving...' : 'Save Draft'}
          </button>
          <button
            type="button"
            onClick={handleDuplicate}
            disabled={saving}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border border-neutral-200 bg-white hover:bg-neutral-50 text-neutral-700 rounded-lg whitespace-nowrap"
          >
            <Copy className="w-3.5 h-3.5" /> Duplicate
          </button>
          <button
            type="button"
            onClick={handleSaveAsTemplate}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border border-neutral-200 bg-white hover:bg-neutral-50 text-neutral-700 rounded-lg whitespace-nowrap"
          >
            {!canCustomTemplates && <Lock className="w-3 h-3 text-amber-600" />}
            Save Template
          </button>
          <button
            type="button"
            onClick={() => setShowTestModal(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border border-neutral-200 bg-white hover:bg-neutral-50 text-[#111111] rounded-lg whitespace-nowrap"
          >
            <Mail className="w-3.5 h-3.5" /> Send Test
          </button>
          <button
            type="button"
            onClick={() => {
              if (!canSchedule) {
                onRequireUpgrade('campaignScheduling');
              } else {
                setShowScheduleModal(true);
              }
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border border-neutral-300 bg-[#111111] hover:bg-neutral-800 text-white rounded-lg whitespace-nowrap"
          >
            {!canSchedule && <Lock className="w-3 h-3 text-amber-400" />}
            <CalendarClock className="w-3.5 h-3.5" /> Schedule
          </button>
          <button
            type="button"
            onClick={() => setShowSendConfirm(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold bg-[#A90706] hover:bg-[#8D0505] text-white rounded-lg whitespace-nowrap"
          >
            <Send className="w-3.5 h-3.5" /> Send Campaign
          </button>
        </div>
      </div>

      {banner && (
        <div
          className={`px-4 py-3 rounded-xl border text-xs font-medium flex items-center gap-2 ${
            banner.kind === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-red-50 border-red-200 text-[#A90706]'
          }`}
        >
          {banner.kind === 'success' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 shrink-0" />
          )}
          <span>{banner.text}</span>
        </div>
      )}

      {/* Three-Panel Visual Email Editor */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
        {/* LEFT PANEL: Content Blocks, Templates & Global Theme */}
        <div className="xl:col-span-3 bg-white border border-neutral-200 rounded-xl overflow-hidden">
          <div className="grid grid-cols-3 border-b border-neutral-200 text-xs font-semibold">
            {(['blocks', 'templates', 'design'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setLeftTab(tab)}
                className={`py-2.5 capitalize border-b-2 transition-colors ${
                  leftTab === tab
                    ? 'border-[#A90706] text-[#111111] bg-neutral-50'
                    : 'border-transparent text-neutral-500 hover:text-[#111111]'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          <div className="p-3.5 space-y-3 max-h-[680px] overflow-y-auto">
            {leftTab === 'blocks' && (
              <>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
                  Add Content Blocks
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {BLOCK_CATALOG.map((item) => {
                    const Icon = item.icon;
                    return (
                      <button
                        key={item.type}
                        type="button"
                        onClick={() => addBlock(item.type)}
                        className="flex items-center gap-2 p-2.5 border border-neutral-200 hover:border-[#A90706] hover:bg-red-50/30 rounded-lg text-left transition-colors"
                      >
                        <Icon className="w-4 h-4 text-[#A90706] shrink-0" />
                        <span className="text-xs font-medium text-[#111111] truncate">
                          {item.label}
                        </span>
                      </button>
                    );
                  })}
                </div>

                <div className="pt-2 border-t border-neutral-200">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
                      Block Order ({blocks.length})
                    </span>
                    <span className="text-[11px] text-neutral-400">Drag to reorder</span>
                  </div>
                  <div className="space-y-1.5">
                    {blocks.map((blk, idx) => (
                      <div
                        key={blk.id}
                        draggable
                        onDragStart={() => setDragIndex(idx)}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={() => handleDrop(idx)}
                        onClick={() => {
                          setSelectedBlockId(blk.id);
                          setRightTab('block');
                        }}
                        className={`flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg border text-xs cursor-pointer transition-colors ${
                          selectedBlockId === blk.id
                            ? 'border-[#A90706] bg-red-50/40 text-[#111111] font-semibold'
                            : 'border-neutral-200 hover:bg-neutral-50 text-neutral-700'
                        }`}
                      >
                        <div className="flex items-center gap-1.5 min-w-0">
                          <GripVertical className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
                          <span className="capitalize truncate">
                            {blk.type}
                            {blk.title ? `: ${blk.title.slice(0, 16)}` : ''}
                            {blk.buttonLabel ? `: ${blk.buttonLabel.slice(0, 16)}` : ''}
                          </span>
                        </div>
                        <div className="flex items-center gap-0.5 shrink-0">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              moveBlock(idx, -1);
                            }}
                            disabled={idx === 0}
                            className="p-1 text-neutral-400 hover:text-[#111111] disabled:opacity-30"
                            title="Move up"
                          >
                            <ArrowUp className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              moveBlock(idx, 1);
                            }}
                            disabled={idx === blocks.length - 1}
                            className="p-1 text-neutral-400 hover:text-[#111111] disabled:opacity-30"
                            title="Move down"
                          >
                            <ArrowDown className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              removeBlock(blk.id);
                            }}
                            className="p-1 text-neutral-400 hover:text-[#A90706]"
                            title="Delete block"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            {leftTab === 'templates' && (
              <div className="space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
                  Switch Starter or Custom Template
                </p>
                {templates.map((tpl) => (
                  <button
                    key={tpl.id}
                    type="button"
                    onClick={() => applyTemplate(tpl)}
                    className="w-full text-left p-2.5 border border-neutral-200 hover:border-[#A90706] rounded-lg transition-colors"
                  >
                    <div className="text-xs font-semibold text-[#111111]">{tpl.name}</div>
                    <div className="text-[11px] text-neutral-500 line-clamp-2 mt-0.5">
                      {tpl.description}
                    </div>
                  </button>
                ))}
              </div>
            )}

            {leftTab === 'design' && (
              <div className="space-y-3 text-xs">
                <div>
                  <label className="block font-semibold text-neutral-700 mb-1">
                    Canvas Background
                  </label>
                  <input
                    type="color"
                    value={design.backgroundColor}
                    onChange={(e) => setDesign({ ...design, backgroundColor: e.target.value })}
                    className="w-full h-9 rounded border border-neutral-200 cursor-pointer"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-neutral-700 mb-1">
                    Email Container Background
                  </label>
                  <input
                    type="color"
                    value={design.contentBackgroundColor}
                    onChange={(e) =>
                      setDesign({ ...design, contentBackgroundColor: e.target.value })
                    }
                    className="w-full h-9 rounded border border-neutral-200 cursor-pointer"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-neutral-700 mb-1">
                    Primary Brand Accent
                  </label>
                  <input
                    type="color"
                    value={design.primaryColor}
                    onChange={(e) => setDesign({ ...design, primaryColor: e.target.value })}
                    className="w-full h-9 rounded border border-neutral-200 cursor-pointer"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-neutral-700 mb-1">
                    Email-Safe Font Stack
                  </label>
                  <select
                    value={design.fontFamily}
                    onChange={(e) => setDesign({ ...design, fontFamily: e.target.value })}
                    className="w-full border border-neutral-200 rounded-lg px-2.5 py-2"
                  >
                    <option value="Arial, Helvetica, sans-serif">Arial / Helvetica</option>
                    <option value="Georgia, Times New Roman, serif">Georgia / Serif</option>
                    <option value="Verdana, Geneva, sans-serif">Verdana</option>
                    <option value="Tahoma, Geneva, sans-serif">Tahoma</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-neutral-700 mb-1">
                    Max Width ({design.maxWidth}px)
                  </label>
                  <input
                    type="range"
                    min={500}
                    max={680}
                    step={20}
                    value={design.maxWidth}
                    onChange={(e) => setDesign({ ...design, maxWidth: Number(e.target.value) })}
                    className="w-full"
                  />
                </div>
                <label className="flex items-center justify-between pt-2 border-t border-neutral-200">
                  <span className="font-medium text-neutral-700 flex items-center gap-1.5">
                    {!canRemoveBranding && <Lock className="w-3.5 h-3.5 text-amber-600" />}
                    Remove BrosDev Footer
                  </span>
                  <input
                    type="checkbox"
                    checked={canRemoveBranding && removeBranding}
                    onChange={(e) => {
                      if (!canRemoveBranding) {
                        onRequireUpgrade('removeBranding');
                        return;
                      }
                      setRemoveBranding(e.target.checked);
                    }}
                  />
                </label>
              </div>
            )}
          </div>
        </div>

        {/* CENTER PANEL: Live Email-Client Compatible Preview */}
        <div className="xl:col-span-5 bg-white border border-neutral-200 rounded-xl overflow-hidden flex flex-col">
          <div className="px-4 py-2.5 border-b border-neutral-200 flex items-center justify-between gap-2 bg-neutral-50">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setPreviewMode('desktop')}
                className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-md ${
                  previewMode === 'desktop'
                    ? 'bg-[#111111] text-white'
                    : 'text-neutral-600 hover:bg-neutral-200'
                }`}
              >
                <Monitor className="w-3.5 h-3.5" /> Desktop
              </button>
              <button
                type="button"
                onClick={() => setPreviewMode('mobile')}
                className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-md ${
                  previewMode === 'mobile'
                    ? 'bg-[#111111] text-white'
                    : 'text-neutral-600 hover:bg-neutral-200'
                }`}
              >
                <Smartphone className="w-3.5 h-3.5" /> Mobile
              </button>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setCanvasView('preview')}
                className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-md ${
                  canvasView === 'preview'
                    ? 'bg-white border border-neutral-300 text-[#111111]'
                    : 'text-neutral-500'
                }`}
              >
                <Eye className="w-3.5 h-3.5" /> Live Render
              </button>
              <button
                type="button"
                onClick={() => setCanvasView('editor')}
                className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-md ${
                  canvasView === 'editor'
                    ? 'bg-white border border-neutral-300 text-[#111111]'
                    : 'text-neutral-500'
                }`}
              >
                HTML Output
              </button>
            </div>
          </div>

          {/* Inbox Envelope Summary */}
          <div className="px-4 py-2.5 border-b border-neutral-200 bg-white text-xs space-y-0.5">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold text-[#111111] truncate">{subject || '(No subject)'}</span>
              <span className="text-[11px] font-mono text-neutral-400 shrink-0">
                Table HTML • Inline CSS
              </span>
            </div>
            <div className="text-neutral-500 truncate">
              From: {senderName} &lt;{senderEmail || 'configure-sender@domain'}&gt; — {previewText}
            </div>
          </div>

          <div className="p-4 bg-[#F5F5F5] flex justify-center min-h-[580px]">
            {canvasView === 'preview' ? (
              <iframe
                title="Live Email Preview"
                srcDoc={compiledHtml}
                sandbox="allow-popups"
                style={{
                  width: previewMode === 'mobile' ? '375px' : '100%',
                  maxWidth: '640px',
                  height: '580px',
                }}
                className="bg-white border border-neutral-300 rounded-lg transition-all"
              />
            ) : (
              <pre className="w-full h-[580px] overflow-auto bg-[#111111] text-neutral-100 p-4 rounded-lg text-[11px] font-mono leading-relaxed">
                {productionHtml}
              </pre>
            )}
          </div>
        </div>

        {/* RIGHT PANEL: Campaign Settings & Block Inspector */}
        <div className="xl:col-span-4 bg-white border border-neutral-200 rounded-xl overflow-hidden">
          <div className="grid grid-cols-2 border-b border-neutral-200 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setRightTab('settings')}
              className={`py-2.5 border-b-2 ${
                rightTab === 'settings'
                  ? 'border-[#A90706] text-[#111111] bg-neutral-50'
                  : 'border-transparent text-neutral-500'
              }`}
            >
              Campaign & Audience
            </button>
            <button
              type="button"
              onClick={() => setRightTab('block')}
              className={`py-2.5 border-b-2 ${
                rightTab === 'block'
                  ? 'border-[#A90706] text-[#111111] bg-neutral-50'
                  : 'border-transparent text-neutral-500'
              }`}
            >
              Selected Block
            </button>
          </div>

          <div className="p-4 space-y-3.5 max-h-[680px] overflow-y-auto text-xs">
            {rightTab === 'settings' ? (
              <>
                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block font-semibold text-neutral-700 mb-1">Campaign Type</label>
                    <select
                      value={campaignType}
                      onChange={(e) => setCampaignType(e.target.value as EmailCampaignType)}
                      className="w-full border border-neutral-200 rounded-lg px-2.5 py-2"
                    >
                      <option value="newsletter">Newsletter</option>
                      <option value="announcement">Product Announcement</option>
                      <option value="promotional">Promotional</option>
                      <option value="transactional_update">Service Update</option>
                    </select>
                  </div>
                  <div>
                    <label className="block font-semibold text-neutral-700 mb-1">Reply-To Email</label>
                    <input
                      value={replyTo}
                      onChange={(e) => setReplyTo(e.target.value)}
                      placeholder="reply@yourdomain.com"
                      className="w-full border border-neutral-200 rounded-lg px-2.5 py-2"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-semibold text-neutral-700 mb-1">Email Subject Line</label>
                  <input
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="Supports {{first_name}} personalization"
                    className="w-full border border-neutral-200 rounded-lg px-2.5 py-2"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-neutral-700 mb-1">Inbox Preview Text</label>
                  <input
                    value={previewText}
                    onChange={(e) => setPreviewText(e.target.value)}
                    placeholder="Short summary shown next to the subject line"
                    className="w-full border border-neutral-200 rounded-lg px-2.5 py-2"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block font-semibold text-neutral-700 mb-1">Sender Name</label>
                    <input
                      value={senderName}
                      onChange={(e) => setSenderName(e.target.value)}
                      className="w-full border border-neutral-200 rounded-lg px-2.5 py-2"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-neutral-700 mb-1">Sender Email</label>
                    <input
                      value={senderEmail}
                      onChange={(e) => setSenderEmail(e.target.value)}
                      className="w-full border border-neutral-200 rounded-lg px-2.5 py-2 font-mono text-[11px]"
                    />
                  </div>
                </div>

                <div className="pt-3 border-t border-neutral-200 space-y-2.5">
                  <label className="block font-semibold text-neutral-700">Target Audience</label>
                  <div className="grid grid-cols-3 gap-1.5">
                    {(
                      [
                        { id: 'all_subscribed', label: 'All Subscribed' },
                        { id: 'list', label: 'Audience Lists' },
                        { id: 'segment', label: 'Segment' },
                      ] as const
                    ).map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => {
                          if (opt.id === 'segment' && !canSegment) {
                            onRequireUpgrade('campaignSegmentation');
                            return;
                          }
                          setAudienceType(opt.id);
                        }}
                        className={`py-2 px-2 rounded-lg border text-[11px] font-semibold flex items-center justify-center gap-1 ${
                          audienceType === opt.id
                            ? 'border-[#A90706] bg-red-50/40 text-[#111111]'
                            : 'border-neutral-200 text-neutral-600'
                        }`}
                      >
                        {opt.id === 'segment' && !canSegment && (
                          <Lock className="w-3 h-3 text-amber-600" />
                        )}
                        {opt.label}
                      </button>
                    ))}
                  </div>

                  {audienceType === 'list' && (
                    <div className="space-y-1.5 border border-neutral-200 rounded-lg p-2.5 max-h-36 overflow-y-auto">
                      {lists.length === 0 ? (
                        <p className="text-neutral-500">
                          No audience lists yet. Create a list under Subscribers &amp; Lists or select All Subscribed.
                        </p>
                      ) : (
                        lists.map((lst) => (
                          <label key={lst.id} className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={listIds.includes(lst.id)}
                              onChange={(e) =>
                                setListIds((prev) =>
                                  e.target.checked
                                    ? [...prev, lst.id]
                                    : prev.filter((id) => id !== lst.id)
                                )
                              }
                            />
                            <span className="text-[#111111] font-medium">{lst.name}</span>
                          </label>
                        ))
                      )}
                    </div>
                  )}

                  {audienceType === 'segment' && (
                    <select
                      value={segmentId}
                      onChange={(e) => setSegmentId(e.target.value)}
                      className="w-full border border-neutral-200 rounded-lg px-2.5 py-2"
                    >
                      <option value="">Select a segment...</option>
                      {segments.map((seg) => (
                        <option key={seg.id} value={seg.id}>
                          {seg.name}
                        </option>
                      ))}
                    </select>
                  )}

                  <div className="p-3 bg-neutral-50 border border-neutral-200 rounded-lg space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-neutral-600">Eligible recipients</span>
                      <span className="font-mono font-bold text-[#111111] tabular-nums">
                        {audienceStats.eligible.length.toLocaleString()}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-neutral-500">
                      <span>Excluded (suppressed / unsubscribed)</span>
                      <span className="font-mono tabular-nums">
                        {(audienceStats.excludedSuppressed + audienceStats.excludedStatus).toLocaleString()}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-neutral-500">
                      <span>Monthly campaign quota</span>
                      <span className="font-mono tabular-nums">
                        {monthlyUsed.toLocaleString()} / {maxCampaignEmails.toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>
              </>
            ) : selectedBlock ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-neutral-200">
                  <span className="font-bold text-[#111111] capitalize">
                    {selectedBlock.type} Block
                  </span>
                  <button
                    type="button"
                    onClick={() => removeBlock(selectedBlock.id)}
                    className="text-[#A90706] hover:underline font-semibold"
                  >
                    Remove
                  </button>
                </div>

                {selectedBlock.type === 'header' && (
                  <>
                    <div>
                      <label className="block font-semibold mb-1">Brand Name</label>
                      <input
                        value={selectedBlock.brandName || ''}
                        onChange={(e) => updateBlock(selectedBlock.id, { brandName: e.target.value })}
                        className="w-full border border-neutral-200 rounded-lg px-2.5 py-2"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold mb-1">Tagline</label>
                      <input
                        value={selectedBlock.tagline || ''}
                        onChange={(e) => updateBlock(selectedBlock.id, { tagline: e.target.value })}
                        className="w-full border border-neutral-200 rounded-lg px-2.5 py-2"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold mb-1">Logo Image URL (HTTPS)</label>
                      <input
                        value={selectedBlock.logoUrl || ''}
                        onChange={(e) => updateBlock(selectedBlock.id, { logoUrl: e.target.value })}
                        placeholder="https://..."
                        className="w-full border border-neutral-200 rounded-lg px-2.5 py-2"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block font-semibold mb-1">Header Background</label>
                        <input
                          type="color"
                          value={selectedBlock.backgroundColor || '#111111'}
                          onChange={(e) =>
                            updateBlock(selectedBlock.id, { backgroundColor: e.target.value })
                          }
                          className="w-full h-8 rounded border border-neutral-200"
                        />
                      </div>
                      <div>
                        <label className="block font-semibold mb-1">Header Text</label>
                        <input
                          type="color"
                          value={selectedBlock.textColor || '#FFFFFF'}
                          onChange={(e) =>
                            updateBlock(selectedBlock.id, { textColor: e.target.value })
                          }
                          className="w-full h-8 rounded border border-neutral-200"
                        />
                      </div>
                    </div>
                  </>
                )}

                {selectedBlock.type === 'heading' && (
                  <>
                    <div>
                      <label className="block font-semibold mb-1">Heading Text</label>
                      <input
                        value={selectedBlock.title || ''}
                        onChange={(e) => updateBlock(selectedBlock.id, { title: e.target.value })}
                        className="w-full border border-neutral-200 rounded-lg px-2.5 py-2"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold mb-1">Heading Size</label>
                      <select
                        value={selectedBlock.headingLevel || 'h1'}
                        onChange={(e) =>
                          updateBlock(selectedBlock.id, {
                            headingLevel: e.target.value as 'h1' | 'h2' | 'h3',
                          })
                        }
                        className="w-full border border-neutral-200 rounded-lg px-2.5 py-2"
                      >
                        <option value="h1">H1 — Large Title (26px)</option>
                        <option value="h2">H2 — Section Heading (20px)</option>
                        <option value="h3">H3 — Subheading (16px)</option>
                      </select>
                    </div>
                  </>
                )}

                {selectedBlock.type === 'text' && (
                  <div>
                    <label className="block font-semibold mb-1">
                      Body Copy (supports {'{{first_name}}'})
                    </label>
                    <textarea
                      rows={6}
                      value={selectedBlock.body || ''}
                      onChange={(e) => updateBlock(selectedBlock.id, { body: e.target.value })}
                      className="w-full border border-neutral-200 rounded-lg px-2.5 py-2"
                    />
                  </div>
                )}

                {selectedBlock.type === 'button' && (
                  <>
                    <div>
                      <label className="block font-semibold mb-1">Button Label</label>
                      <input
                        value={selectedBlock.buttonLabel || ''}
                        onChange={(e) =>
                          updateBlock(selectedBlock.id, { buttonLabel: e.target.value })
                        }
                        className="w-full border border-neutral-200 rounded-lg px-2.5 py-2"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold mb-1">Destination URL (HTTPS)</label>
                      <input
                        value={selectedBlock.buttonUrl || ''}
                        onChange={(e) =>
                          updateBlock(selectedBlock.id, { buttonUrl: e.target.value })
                        }
                        placeholder="https://..."
                        className="w-full border border-neutral-200 rounded-lg px-2.5 py-2"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block font-semibold mb-1">Button Color</label>
                        <input
                          type="color"
                          value={selectedBlock.buttonColor || '#A90706'}
                          onChange={(e) =>
                            updateBlock(selectedBlock.id, { buttonColor: e.target.value })
                          }
                          className="w-full h-8 rounded border border-neutral-200"
                        />
                      </div>
                      <div>
                        <label className="block font-semibold mb-1">Text Color</label>
                        <input
                          type="color"
                          value={selectedBlock.buttonTextColor || '#FFFFFF'}
                          onChange={(e) =>
                            updateBlock(selectedBlock.id, { buttonTextColor: e.target.value })
                          }
                          className="w-full h-8 rounded border border-neutral-200"
                        />
                      </div>
                    </div>
                  </>
                )}

                {selectedBlock.type === 'image' && (
                  <>
                    <div>
                      <label className="block font-semibold mb-1">Image URL (HTTPS)</label>
                      <input
                        value={selectedBlock.imageUrl || ''}
                        onChange={(e) => updateBlock(selectedBlock.id, { imageUrl: e.target.value })}
                        placeholder="https://..."
                        className="w-full border border-neutral-200 rounded-lg px-2.5 py-2"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold mb-1">Alt Text</label>
                      <input
                        value={selectedBlock.imageAlt || ''}
                        onChange={(e) => updateBlock(selectedBlock.id, { imageAlt: e.target.value })}
                        className="w-full border border-neutral-200 rounded-lg px-2.5 py-2"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold mb-1">Caption</label>
                      <input
                        value={selectedBlock.caption || ''}
                        onChange={(e) => updateBlock(selectedBlock.id, { caption: e.target.value })}
                        className="w-full border border-neutral-200 rounded-lg px-2.5 py-2"
                      />
                    </div>
                  </>
                )}

                {selectedBlock.type === 'gallery' && (
                  <div className="space-y-3">
                    {(selectedBlock.galleryItems || []).map((item, gIdx) => (
                      <div key={gIdx} className="p-2.5 border border-neutral-200 rounded-lg space-y-2">
                        <div className="font-semibold text-neutral-600">Column {gIdx + 1}</div>
                        <input
                          value={item.imageUrl}
                          onChange={(e) => {
                            const next = [...(selectedBlock.galleryItems || [])];
                            next[gIdx] = { ...item, imageUrl: e.target.value };
                            updateBlock(selectedBlock.id, { galleryItems: next });
                          }}
                          placeholder="https://image-url..."
                          className="w-full border border-neutral-200 rounded px-2 py-1.5"
                        />
                        <input
                          value={item.caption}
                          onChange={(e) => {
                            const next = [...(selectedBlock.galleryItems || [])];
                            next[gIdx] = { ...item, caption: e.target.value };
                            updateBlock(selectedBlock.id, { galleryItems: next });
                          }}
                          placeholder="Caption"
                          className="w-full border border-neutral-200 rounded px-2 py-1.5"
                        />
                      </div>
                    ))}
                  </div>
                )}

                {selectedBlock.type === 'spacer' && (
                  <div>
                    <label className="block font-semibold mb-1">
                      Height ({selectedBlock.spacerHeight || 24}px)
                    </label>
                    <input
                      type="range"
                      min={8}
                      max={64}
                      value={selectedBlock.spacerHeight || 24}
                      onChange={(e) =>
                        updateBlock(selectedBlock.id, { spacerHeight: Number(e.target.value) })
                      }
                      className="w-full"
                    />
                  </div>
                )}

                {selectedBlock.type === 'social' && (
                  <div className="space-y-2">
                    {(selectedBlock.socialLinks || []).map((lnk, sIdx) => (
                      <div key={sIdx} className="grid grid-cols-5 gap-1.5">
                        <input
                          value={lnk.label}
                          onChange={(e) => {
                            const next = [...(selectedBlock.socialLinks || [])];
                            next[sIdx] = { ...lnk, label: e.target.value };
                            updateBlock(selectedBlock.id, { socialLinks: next });
                          }}
                          placeholder="Label"
                          className="col-span-2 border border-neutral-200 rounded px-2 py-1.5"
                        />
                        <input
                          value={lnk.url}
                          onChange={(e) => {
                            const next = [...(selectedBlock.socialLinks || [])];
                            next[sIdx] = { ...lnk, url: e.target.value };
                            updateBlock(selectedBlock.id, { socialLinks: next });
                          }}
                          placeholder="https://..."
                          className="col-span-3 border border-neutral-200 rounded px-2 py-1.5"
                        />
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() =>
                        updateBlock(selectedBlock.id, {
                          socialLinks: [
                            ...(selectedBlock.socialLinks || []),
                            { label: 'LinkedIn', url: 'https://linkedin.com' },
                          ],
                        })
                      }
                      className="inline-flex items-center gap-1 text-[#A90706] font-semibold"
                    >
                      <Plus className="w-3.5 h-3.5" /> Add Social Link
                    </button>
                  </div>
                )}

                {selectedBlock.type === 'footer' && (
                  <>
                    <div>
                      <label className="block font-semibold mb-1">Company Name</label>
                      <input
                        value={selectedBlock.companyName || ''}
                        onChange={(e) =>
                          updateBlock(selectedBlock.id, { companyName: e.target.value })
                        }
                        className="w-full border border-neutral-200 rounded-lg px-2.5 py-2"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold mb-1">Physical Mailing Address</label>
                      <input
                        value={selectedBlock.companyAddress || ''}
                        onChange={(e) =>
                          updateBlock(selectedBlock.id, { companyAddress: e.target.value })
                        }
                        className="w-full border border-neutral-200 rounded-lg px-2.5 py-2"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold mb-1">Permission Reminder</label>
                      <textarea
                        rows={2}
                        value={selectedBlock.footerNote || ''}
                        onChange={(e) =>
                          updateBlock(selectedBlock.id, { footerNote: e.target.value })
                        }
                        className="w-full border border-neutral-200 rounded-lg px-2.5 py-2"
                      />
                    </div>
                  </>
                )}

                {['header', 'heading', 'text', 'button', 'image', 'social'].includes(
                  selectedBlock.type
                ) && (
                  <div>
                    <label className="block font-semibold mb-1">Alignment</label>
                    <div className="grid grid-cols-3 gap-1.5">
                      {(['left', 'center', 'right'] as const).map((a) => (
                        <button
                          key={a}
                          type="button"
                          onClick={() => updateBlock(selectedBlock.id, { align: a })}
                          className={`py-1.5 rounded border capitalize font-medium ${
                            (selectedBlock.align || 'left') === a
                              ? 'border-[#A90706] bg-red-50/40 text-[#111111]'
                              : 'border-neutral-200 text-neutral-600'
                          }`}
                        >
                          {a}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-neutral-500 py-8 text-center">
                Select any block on the left to customize its content and styling.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Test Email Modal */}
      {showTestModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white border border-neutral-200 rounded-xl w-full max-w-md p-5 space-y-4">
            <h3 className="text-sm font-bold text-[#111111]">Send Test Email via Resend</h3>
            <p className="text-xs text-neutral-600">
              Dispatches a real preview email with a live signed unsubscribe link using your server
              Resend configuration.
            </p>
            <div>
              <label className="block text-xs font-semibold text-neutral-700 mb-1">
                Recipient Email
              </label>
              <input
                type="email"
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
                placeholder="you@yourdomain.com"
                className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowTestModal(false)}
                className="px-3 py-1.5 text-xs font-semibold border border-neutral-200 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSendTest}
                disabled={sendingTest || !testEmail.trim()}
                className="px-4 py-1.5 text-xs font-semibold bg-[#A90706] text-white rounded-lg disabled:opacity-50"
              >
                {sendingTest ? 'Sending...' : 'Send Test Email'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Schedule Modal */}
      {showScheduleModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white border border-neutral-200 rounded-xl w-full max-w-md p-5 space-y-4">
            <h3 className="text-sm font-bold text-[#111111]">Schedule Campaign Delivery</h3>
            <p className="text-xs text-neutral-600">
              Creates a durable Firestore job executed by Vercel Cron (<code className="font-mono">/api/cron/campaigns</code>).
              You can pause or cancel before dispatch.
            </p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1">
                  Send Date &amp; Time
                </label>
                <input
                  type="datetime-local"
                  value={scheduleDate}
                  onChange={(e) => setScheduleDate(e.target.value)}
                  className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1">
                  Timezone
                </label>
                <input
                  value={scheduleTz}
                  onChange={(e) => setScheduleTz(e.target.value)}
                  className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm font-mono"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowScheduleModal(false)}
                className="px-3 py-1.5 text-xs font-semibold border border-neutral-200 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmSchedule}
                disabled={dispatching}
                className="px-4 py-1.5 text-xs font-semibold bg-[#111111] text-white rounded-lg disabled:opacity-50"
              >
                {dispatching ? 'Scheduling...' : 'Confirm Schedule'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Send Now Confirmation Modal */}
      {showSendConfirm && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white border border-neutral-200 rounded-xl w-full max-w-md p-5 space-y-4">
            <h3 className="text-sm font-bold text-[#111111]">Confirm Campaign Dispatch</h3>
            <div className="p-3 bg-neutral-50 border border-neutral-200 rounded-lg text-xs space-y-1.5">
              <div className="flex justify-between">
                <span className="text-neutral-500">Subject</span>
                <span className="font-semibold text-[#111111] truncate max-w-[240px]">{subject}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-500">From</span>
                <span className="font-mono text-[#111111]">{senderEmail}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-500">Eligible Subscribers</span>
                <span className="font-mono font-bold text-[#111111] tabular-nums">
                  {audienceStats.eligible.length.toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-500">Suppressed / Unsubscribed Skipped</span>
                <span className="font-mono text-neutral-700 tabular-nums">
                  {(audienceStats.excludedSuppressed + audienceStats.excludedStatus).toLocaleString()}
                </span>
              </div>
            </div>
            <p className="text-xs text-neutral-600">
              Every message includes a signed RFC-8058 one-click unsubscribe header and server-side
              suppression check before Resend transmission.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowSendConfirm(false)}
                className="px-3 py-1.5 text-xs font-semibold border border-neutral-200 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSendNow}
                disabled={dispatching}
                className="px-4 py-1.5 text-xs font-semibold bg-[#A90706] hover:bg-[#8E0605] text-white rounded-lg disabled:opacity-50"
              >
                {dispatching ? 'Dispatching via Resend...' : 'Send Now'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
