import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  CalendarClock,
  CheckCircle2,
  Copy,
  Globe,
  LayoutTemplate,
  Mail,
  Megaphone,
  Newspaper,
  Pause,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Search,
  Send,
  Trash2,
  Users,
  XCircle,
} from 'lucide-react';
import type { WorkspaceMe } from '../types';
import type { PlanLockKey } from '../lib/planLimits';
import {
  deleteEmailCampaign,
  duplicateEmailCampaign,
  getMonthlyCampaignUsage,
  getSenderSettings,
  listEmailAutomations,
  listEmailCampaigns,
  listEmailDeliveryEvents,
  listEmailLists,
  listEmailSegments,
  listEmailSubscribers,
  listEmailSuppressions,
  listEmailTemplates,
  listScheduledJobs,
  listSenderDomains,
  updateScheduledCampaignStatus,
} from './campaignsFirestore';
import { CampaignBuilderView } from './CampaignBuilderView';
import { SubscribersAndListsView } from './SubscribersAndListsView';
import { TemplatesAndAutomationsView } from './TemplatesAndAutomationsView';
import { CampaignAnalyticsView } from './CampaignAnalyticsView';
import { SenderSettingsView } from './SenderSettingsView';
import type {
  EmailAutomationRecord,
  EmailAutomationStepRecord,
  EmailCampaignRecord,
  EmailCampaignStatus,
  EmailCampaignType,
  EmailDeliveryEventRecord,
  EmailListRecord,
  EmailScheduledJobRecord,
  EmailSegmentRecord,
  EmailSenderDomainRecord,
  EmailSenderSettingsRecord,
  EmailSubscriberRecord,
  EmailSuppressionRecord,
  EmailTemplateRecord,
} from './types';

export type CampaignsHubSection =
  | 'overview'
  | 'campaigns'
  | 'newsletters'
  | 'announcements'
  | 'scheduled'
  | 'subscribers'
  | 'templates'
  | 'analytics'
  | 'settings';

interface Props {
  workspace: WorkspaceMe;
  initialSection?: CampaignsHubSection;
  onRequireUpgrade: (lockKey: PlanLockKey) => void;
}

const STATUS_STYLES: Record<EmailCampaignStatus, string> = {
  draft: 'text-[#525252] bg-[#F5F5F5]',
  scheduled: 'text-[#1D4ED8] bg-[#EFF6FF]',
  sending: 'text-[#B45309] bg-[#FFFBEB]',
  sent: 'text-[#15803D] bg-[#F0FDF4]',
  paused: 'text-[#B45309] bg-[#FEF3C7]',
  canceled: 'text-[#737373] bg-[#F5F5F5]',
  failed: 'text-[#A90706] bg-[#FEF2F2]',
};

export function CampaignsHubView({
  workspace,
  initialSection = 'overview',
  onRequireUpgrade,
}: Props) {
  const [section, setSection] = useState<CampaignsHubSection>(initialSection);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [campaigns, setCampaigns] = useState<EmailCampaignRecord[]>([]);
  const [lists, setLists] = useState<EmailListRecord[]>([]);
  const [subscribers, setSubscribers] = useState<EmailSubscriberRecord[]>([]);
  const [segments, setSegments] = useState<EmailSegmentRecord[]>([]);
  const [suppressions, setSuppressions] = useState<EmailSuppressionRecord[]>([]);
  const [templates, setTemplates] = useState<EmailTemplateRecord[]>([]);
  const [automations, setAutomations] = useState<EmailAutomationRecord[]>([]);
  const [automationSteps, setAutomationSteps] = useState<EmailAutomationStepRecord[]>([]);
  const [scheduledJobs, setScheduledJobs] = useState<EmailScheduledJobRecord[]>([]);
  const [deliveryEvents, setDeliveryEvents] = useState<EmailDeliveryEventRecord[]>([]);
  const [senderDomains, setSenderDomains] = useState<EmailSenderDomainRecord[]>([]);
  const [monthlyUsed, setMonthlyUsed] = useState<number>(0);
  const [senderSettings, setSenderSettings] = useState<EmailSenderSettingsRecord>({
    ownerUid: workspace.user.uid,
    senderName: workspace.user.displayName || 'BrosDev Team',
    senderEmail: workspace.user.senderEmail,
    replyTo: workspace.user.email,
    companyName: workspace.user.displayName || 'BrosDev Studio',
    companyWebsite: '',
    companyLogoUrl: '',
    companyAddress: '',
    defaultFooter: 'You are receiving this email because you subscribed to updates.',
    additionalIdentities: [],
    doubleOptInDefault: false,
    campaignSuspended: false,
    updatedAt: new Date().toISOString(),
  });

  // Search & list filter
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | EmailCampaignStatus>('all');
  const [busyId, setBusyId] = useState<string | null>(null);

  // Active builder state
  const [builderState, setBuilderState] = useState<{
    open: boolean;
    campaign: EmailCampaignRecord | null;
    initialType: EmailCampaignType;
    initialTemplate: EmailTemplateRecord | null;
  }>({
    open: false,
    campaign: null,
    initialType: 'newsletter',
    initialTemplate: null,
  });

  useEffect(() => {
    setSection(initialSection);
    setBuilderState((prev) => (prev.open ? { ...prev, open: false } : prev));
  }, [initialSection]);

  const loadAll = useCallback(
    async (silent = false) => {
      if (silent) setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        const [
          cList,
          lList,
          sList,
          segList,
          supList,
          tplList,
          autoBundle,
          jobList,
          evList,
          domList,
          settingsRec,
          usageRec,
        ] = await Promise.all([
          listEmailCampaigns().catch(() => []),
          listEmailLists().catch(() => []),
          listEmailSubscribers(1000).catch(() => []),
          listEmailSegments().catch(() => []),
          listEmailSuppressions().catch(() => []),
          listEmailTemplates().catch(() => []),
          listEmailAutomations().catch(() => ({ automations: [], steps: [] })),
          listScheduledJobs().catch(() => []),
          listEmailDeliveryEvents(500).catch(() => []),
          listSenderDomains().catch(() => []),
          getSenderSettings(
            workspace.user.senderEmail,
            workspace.user.displayName || 'BrosDev Team'
          ).catch(() => null),
          getMonthlyCampaignUsage().catch(() => null),
        ]);

        setCampaigns(cList);
        setLists(lList);
        setSubscribers(sList);
        setSegments(segList);
        setSuppressions(supList);
        setTemplates(tplList);
        setAutomations(autoBundle.automations);
        setAutomationSteps(autoBundle.steps);
        setScheduledJobs(jobList);
        setDeliveryEvents(evList);
        setSenderDomains(domList);
        if (settingsRec) setSenderSettings(settingsRec);
        if (usageRec) setMonthlyUsed(usageRec.emailsSent || 0);
      } catch (err: any) {
        setError(err?.message || 'Unable to load Email Campaigns Studio.');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [workspace.user]
  );

  useEffect(() => {
    loadAll(false);
  }, [loadAll]);

  const stats = useMemo(() => {
    let draft = 0;
    let scheduled = 0;
    let sent = 0;
    for (const c of campaigns) {
      if (c.status === 'draft') draft += 1;
      else if (c.status === 'scheduled' || c.status === 'paused') scheduled += 1;
      else if (c.status === 'sent' || c.status === 'sending') sent += 1;
    }

    let evSent = 0;
    let evDelivered = 0;
    let evOpened = 0;
    let evClicked = 0;
    let evBounced = 0;
    let evUnsub = 0;
    for (const e of deliveryEvents) {
      if (e.eventType === 'sent') evSent += 1;
      else if (e.eventType === 'delivered') evDelivered += 1;
      else if (e.eventType === 'opened') evOpened += 1;
      else if (e.eventType === 'clicked') evClicked += 1;
      else if (e.eventType === 'bounced') evBounced += 1;
      else if (e.eventType === 'unsubscribed') evUnsub += 1;
    }

    const activeSubscribers = subscribers.filter((s) => s.status === 'subscribed').length;
    const denom = Math.max(1, evDelivered || evSent);
    const hasVolume = evDelivered > 0 || evSent > 0;

    return {
      totalCampaigns: campaigns.length,
      draft,
      scheduled,
      sent,
      activeSubscribers,
      totalSubscribers: subscribers.length,
      delivered: evDelivered,
      sentEvents: evSent,
      openRate: hasVolume ? ((evOpened / denom) * 100).toFixed(1) : '0.0',
      clickRate: hasVolume ? ((evClicked / denom) * 100).toFixed(1) : '0.0',
      bounceRate: evSent > 0 ? ((evBounced / evSent) * 100).toFixed(1) : '0.0',
      unsubRate: hasVolume ? ((evUnsub / denom) * 100).toFixed(1) : '0.0',
    };
  }, [campaigns, deliveryEvents, subscribers]);

  const monthlyQuota = workspace.limits.maxCampaignEmailsPerMonth ?? 500;
  const quotaPct = monthlyQuota > 0 ? Math.min(100, Math.round((monthlyUsed / monthlyQuota) * 100)) : 0;

  const openNewCampaign = (type: EmailCampaignType, template: EmailTemplateRecord | null = null) => {
    setBuilderState({
      open: true,
      campaign: null,
      initialType: type,
      initialTemplate: template,
    });
  };

  const openEditCampaign = (campaign: EmailCampaignRecord) => {
    setBuilderState({
      open: true,
      campaign,
      initialType: campaign.campaignType,
      initialTemplate: null,
    });
  };

  const handleDuplicate = async (campaign: EmailCampaignRecord) => {
    setBusyId(campaign.id);
    setNotice(null);
    setError(null);
    try {
      const copy = await duplicateEmailCampaign(campaign);
      setNotice(`Duplicated "${campaign.name}" as a new draft.`);
      await loadAll(true);
      openEditCampaign(copy);
    } catch (err: any) {
      setError(err?.message || 'Failed to duplicate campaign.');
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (campaign: EmailCampaignRecord) => {
    setBusyId(campaign.id);
    setNotice(null);
    setError(null);
    try {
      await deleteEmailCampaign(campaign.id);
      setNotice(`Deleted campaign "${campaign.name}".`);
      await loadAll(true);
    } catch (err: any) {
      setError(err?.message || 'Failed to delete campaign.');
    } finally {
      setBusyId(null);
    }
  };

  const handleScheduleAction = async (
    campaignId: string,
    jobId: string | undefined,
    action: 'pause' | 'resume' | 'cancel'
  ) => {
    setBusyId(campaignId);
    setNotice(null);
    setError(null);
    try {
      await updateScheduledCampaignStatus(campaignId, jobId, action);
      setNotice(
        action === 'pause'
          ? 'Scheduled campaign paused.'
          : action === 'resume'
            ? 'Scheduled campaign resumed.'
            : 'Scheduled campaign canceled.'
      );
      await loadAll(true);
    } catch (err: any) {
      setError(err?.message || 'Unable to update schedule status.');
    } finally {
      setBusyId(null);
    }
  };

  const filteredCampaigns = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return campaigns.filter((c) => {
      if (section === 'newsletters' && c.campaignType !== 'newsletter') return false;
      if (section === 'announcements' && c.campaignType !== 'announcement') return false;
      if (section === 'scheduled' && c.status !== 'scheduled' && c.status !== 'paused') {
        return false;
      }
      if (statusFilter !== 'all' && c.status !== statusFilter) return false;
      if (q) {
        const hay = `${c.name} ${c.subject} ${c.campaignType} ${c.status}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [campaigns, section, statusFilter, searchQuery]);

  if (builderState.open) {
    return (
      <CampaignBuilderView
        workspace={workspace}
        initialCampaign={builderState.campaign}
        initialType={builderState.initialType}
        initialTemplate={builderState.initialTemplate}
        lists={lists}
        segments={segments}
        subscribers={subscribers}
        suppressions={suppressions}
        templates={templates}
        senderSettings={senderSettings}
        monthlyUsed={monthlyUsed}
        onBack={() => {
          setBuilderState((prev) => ({ ...prev, open: false }));
          loadAll(true);
        }}
        onSaved={() => {
          loadAll(true);
        }}
        onRequireUpgrade={onRequireUpgrade}
      />
    );
  }

  const navTabs: Array<{
    id: CampaignsHubSection;
    label: string;
    icon: React.FC<{ className?: string }>;
  }> = [
    { id: 'overview', label: 'Overview', icon: Mail },
    { id: 'campaigns', label: `All Campaigns (${campaigns.length})`, icon: Send },
    { id: 'newsletters', label: 'Newsletters', icon: Newspaper },
    { id: 'announcements', label: 'Announcements', icon: Megaphone },
    { id: 'scheduled', label: `Scheduled (${stats.scheduled})`, icon: CalendarClock },
    { id: 'subscribers', label: `Subscribers & Lists (${stats.activeSubscribers})`, icon: Users },
    { id: 'templates', label: 'Templates & Automations', icon: LayoutTemplate },
    { id: 'analytics', label: 'Analytics', icon: BarChart3 },
    { id: 'settings', label: 'Sender & Domains', icon: Globe },
  ];

  const renderCampaignTable = (rows: EmailCampaignRecord[], emptyMsg: string) => {
    if (rows.length === 0) {
      return (
        <div className="rounded-lg border border-[#E5E5E5] bg-white p-10 text-center space-y-3">
          <div className="text-sm font-semibold text-[#111111]">{emptyMsg}</div>
          <p className="text-xs text-[#737373]">
            Build responsive newsletters or product announcements with live desktop/mobile previews and Resend delivery.
          </p>
          <div className="flex items-center justify-center gap-2 pt-1">
            <button
              type="button"
              onClick={() => openNewCampaign('newsletter')}
              className="inline-flex items-center gap-1.5 rounded-md bg-[#A90706] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#8C0605] cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              New Newsletter
            </button>
            <button
              type="button"
              onClick={() => openNewCampaign('announcement')}
              className="inline-flex items-center gap-1.5 rounded-md border border-[#111111] bg-white px-3.5 py-2 text-xs font-semibold text-[#111111] hover:bg-[#111111] hover:text-white cursor-pointer"
            >
              <Megaphone className="w-3.5 h-3.5" />
              New Announcement
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="overflow-hidden rounded-lg border border-[#E5E5E5] bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-[#FAFAFA] border-b border-[#E5E5E5] text-[#525252] font-semibold">
              <tr>
                <th className="py-3 px-4">Campaign</th>
                <th className="py-3 px-4">Type</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Delivery Stats</th>
                <th className="py-3 px-4">Updated / Scheduled</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EFEFEF]">
              {rows.map((c) => {
                const job = scheduledJobs.find(
                  (j) => j.campaignId === c.id && (j.status === 'queued' || j.status === 'paused')
                );
                const isBusy = busyId === c.id;
                return (
                  <tr key={c.id} className="hover:bg-[#FAFAFA]">
                    <td className="py-3 px-4">
                      <button
                        type="button"
                        onClick={() => openEditCampaign(c)}
                        className="text-left group cursor-pointer"
                      >
                        <div className="font-semibold text-[#111111] group-hover:text-[#A90706]">
                          {c.name}
                        </div>
                        <div className="text-[11px] text-[#737373] truncate max-w-[300px]">
                          {c.subject || 'No subject set'}
                        </div>
                      </button>
                    </td>
                    <td className="py-3 px-4 capitalize text-[#525252]">{c.campaignType}</td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-[11px] font-semibold capitalize ${
                          STATUS_STYLES[c.status] || STATUS_STYLES.draft
                        }`}
                      >
                        {c.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-mono tabular-nums text-[#333333]">
                      {c.stats?.sent || 0} sent · {c.stats?.delivered || 0} deliv ·{' '}
                      {c.stats?.opened || 0} open · {c.stats?.clicked || 0} click
                    </td>
                    <td className="py-3 px-4 font-mono text-[11px] text-[#737373] whitespace-nowrap">
                      {c.status === 'scheduled' && c.scheduledAt
                        ? `Sched: ${new Date(c.scheduledAt).toLocaleString()}`
                        : c.sentAt
                          ? `Sent: ${new Date(c.sentAt).toLocaleDateString()}`
                          : new Date(c.updatedAt).toLocaleDateString()}
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => openEditCampaign(c)}
                          disabled={isBusy}
                          title="Edit in Builder"
                          className="p-1.5 rounded text-[#525252] hover:bg-[#F5F5F5] hover:text-[#111111] cursor-pointer"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDuplicate(c)}
                          disabled={isBusy}
                          title="Duplicate campaign"
                          className="p-1.5 rounded text-[#525252] hover:bg-[#F5F5F5] hover:text-[#111111] cursor-pointer"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                        {c.status === 'scheduled' && (
                          <button
                            type="button"
                            onClick={() => handleScheduleAction(c.id, job?.id, 'pause')}
                            disabled={isBusy}
                            title="Pause schedule"
                            className="p-1.5 rounded text-[#B45309] hover:bg-[#FFFBEB] cursor-pointer"
                          >
                            <Pause className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {c.status === 'paused' && (
                          <button
                            type="button"
                            onClick={() => handleScheduleAction(c.id, job?.id, 'resume')}
                            disabled={isBusy}
                            title="Resume schedule"
                            className="p-1.5 rounded text-[#15803D] hover:bg-[#F0FDF4] cursor-pointer"
                          >
                            <Play className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {(c.status === 'scheduled' || c.status === 'paused') && (
                          <button
                            type="button"
                            onClick={() => handleScheduleAction(c.id, job?.id, 'cancel')}
                            disabled={isBusy}
                            title="Cancel scheduled send"
                            className="p-1.5 rounded text-[#A90706] hover:bg-[#FEF2F2] cursor-pointer"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleDelete(c)}
                          disabled={isBusy}
                          title="Delete campaign"
                          className="p-1.5 rounded text-[#737373] hover:bg-[#FEF2F2] hover:text-[#A90706] cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Studio Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#111111]">
            Newsletter &amp; Email Campaign Studio
          </h1>
          <p className="mt-1 text-sm text-[#525252]">
            Design responsive newsletters &amp; product announcements, manage subscriber lists &amp; segments, and deliver via Resend.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => loadAll(true)}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 rounded-md border border-[#D4D4D4] bg-white px-3 py-2 text-xs font-semibold text-[#111111] hover:bg-[#FAFAFA] cursor-pointer whitespace-nowrap disabled:opacity-60"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            type="button"
            onClick={() => openNewCampaign('announcement')}
            className="inline-flex items-center gap-1.5 rounded-md border border-[#111111] bg-white px-3.5 py-2 text-xs font-semibold text-[#111111] hover:bg-[#111111] hover:text-white cursor-pointer whitespace-nowrap"
          >
            <Megaphone className="w-3.5 h-3.5" />
            Create Announcement
          </button>
          <button
            type="button"
            onClick={() => openNewCampaign('newsletter')}
            className="inline-flex items-center gap-1.5 rounded-md bg-[#A90706] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#8C0605] cursor-pointer whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" />
            Create Newsletter
          </button>
        </div>
      </div>

      {/* Horizontal Studio Section Bar */}
      <div className="flex items-center gap-1 overflow-x-auto border-b border-[#E5E5E5] pb-2">
        {navTabs.map((tab) => {
          const Icon = tab.icon;
          const active = section === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setSection(tab.id)}
              className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                active
                  ? 'bg-[#111111] text-white'
                  : 'text-[#525252] hover:bg-white hover:text-[#111111]'
              }`}
            >
              <Icon className="w-3.5 h-3.5 shrink-0" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {notice && (
        <div className="rounded-md border border-[#BBF7D0] bg-[#F0FDF4] px-4 py-3 text-xs text-[#15803D] flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            {notice}
          </span>
          <button
            type="button"
            onClick={() => setNotice(null)}
            className="font-semibold underline cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {error && (
        <div className="rounded-md border border-[#FECACA] bg-[#FEF2F2] px-4 py-3 text-xs text-[#A90706]">
          {error}
        </div>
      )}

      {loading ? (
        <div className="rounded-lg border border-[#E5E5E5] bg-white p-12 text-center text-sm text-[#737373]">
          Loading campaigns, subscribers, and Resend delivery metrics...
        </div>
      ) : (
        <>
          {/* OVERVIEW */}
          {section === 'overview' && (
            <div className="space-y-6">
              {/* Primary KPI Strip */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                {[
                  {
                    label: 'Total Campaigns',
                    value: stats.totalCampaigns.toLocaleString(),
                    sub: `${stats.draft} draft · ${stats.scheduled} scheduled · ${stats.sent} sent`,
                  },
                  {
                    label: 'Active Subscribers',
                    value: stats.activeSubscribers.toLocaleString(),
                    sub: `${lists.length} list(s) · ${suppressions.length} suppressed`,
                  },
                  {
                    label: 'Emails Delivered',
                    value: stats.delivered.toLocaleString(),
                    sub: `${stats.sentEvents.toLocaleString()} sent events logged`,
                  },
                  {
                    label: 'Open / Click Rate',
                    value: `${stats.openRate}% / ${stats.clickRate}%`,
                    sub: 'Tracked via Resend webhooks',
                  },
                  {
                    label: 'Bounce / Unsub Rate',
                    value: `${stats.bounceRate}% / ${stats.unsubRate}%`,
                    sub: 'Auto-suppressed on hard bounce',
                  },
                ].map((k) => (
                  <div
                    key={k.label}
                    className="rounded-lg border border-[#E5E5E5] bg-white p-4 space-y-1"
                  >
                    <div className="text-[11px] font-semibold text-[#737373]">{k.label}</div>
                    <div className="text-xl font-bold font-mono tabular-nums text-[#111111]">
                      {k.value}
                    </div>
                    <div className="text-[11px] text-[#737373] truncate">{k.sub}</div>
                  </div>
                ))}
              </div>

              {/* Monthly Campaign Quota Meter */}
              <div className="rounded-lg border border-[#E5E5E5] bg-white p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1 flex-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-[#111111]">
                      Monthly Campaign Email Quota ({workspace.plan?.name || 'Free'} Plan)
                    </span>
                    <span className="font-mono font-semibold tabular-nums text-[#111111]">
                      {monthlyUsed.toLocaleString()} / {monthlyQuota.toLocaleString()} emails
                    </span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-[#EFEFEF] overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        quotaPct >= 90 ? 'bg-[#A90706]' : 'bg-[#111111]'
                      }`}
                      style={{ width: `${quotaPct}%` }}
                    />
                  </div>
                  <div className="text-[11px] text-[#737373]">
                    Sender identity: <code className="font-mono text-[#111111]">{senderSettings.senderEmail}</code> ·{' '}
                    {senderDomains.filter((d) => d.status === 'verified').length} verified custom domain(s)
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onRequireUpgrade('campaignQuotaLimit')}
                  className="rounded-md border border-[#D4D4D4] bg-white px-3.5 py-2 text-xs font-semibold text-[#111111] hover:border-[#A90706] hover:text-[#A90706] cursor-pointer whitespace-nowrap"
                >
                  Increase Quota
                </button>
              </div>

              {/* Recent Campaigns */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-bold text-[#111111]">Recent Campaigns</h2>
                  <button
                    type="button"
                    onClick={() => setSection('campaigns')}
                    className="text-xs font-semibold text-[#A90706] hover:underline cursor-pointer"
                  >
                    View all campaigns
                  </button>
                </div>
                {renderCampaignTable(
                  campaigns.slice(0, 8),
                  'No email campaigns created yet.'
                )}
              </div>
            </div>
          )}

          {/* ALL CAMPAIGNS / NEWSLETTERS / ANNOUNCEMENTS / SCHEDULED */}
          {(section === 'campaigns' ||
            section === 'newsletters' ||
            section === 'announcements' ||
            section === 'scheduled') && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[240px]">
                  <div className="relative flex-1 max-w-sm">
                    <Search className="w-3.5 h-3.5 text-[#737373] absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search campaigns by name or subject..."
                      className="w-full rounded-md border border-[#D4D4D4] bg-white pl-8 pr-3 py-2 text-xs text-[#111111]"
                    />
                  </div>
                  {section !== 'scheduled' && (
                    <select
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value as any)}
                      className="rounded-md border border-[#D4D4D4] bg-white px-3 py-2 text-xs text-[#111111]"
                    >
                      <option value="all">All statuses</option>
                      <option value="draft">Draft</option>
                      <option value="scheduled">Scheduled</option>
                      <option value="paused">Paused</option>
                      <option value="sending">Sending</option>
                      <option value="sent">Sent</option>
                      <option value="canceled">Canceled</option>
                      <option value="failed">Failed</option>
                    </select>
                  )}
                </div>

                {section === 'announcements' ? (
                  <button
                    type="button"
                    onClick={() => openNewCampaign('announcement')}
                    className="inline-flex items-center gap-1.5 rounded-md bg-[#A90706] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#8C0605] cursor-pointer"
                  >
                    <Megaphone className="w-3.5 h-3.5" />
                    New Announcement
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => openNewCampaign('newsletter')}
                    className="inline-flex items-center gap-1.5 rounded-md bg-[#A90706] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#8C0605] cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    New Campaign
                  </button>
                )}
              </div>

              {renderCampaignTable(
                filteredCampaigns,
                section === 'scheduled'
                  ? 'No scheduled campaigns in queue.'
                  : section === 'announcements'
                    ? 'No announcement campaigns yet.'
                    : section === 'newsletters'
                      ? 'No newsletter campaigns yet.'
                      : 'No campaigns match your filters.'
              )}

              {/* Scheduled Jobs Queue Table when on Scheduled view */}
              {section === 'scheduled' && scheduledJobs.length > 0 && (
                <div className="rounded-lg border border-[#E5E5E5] bg-white overflow-hidden">
                  <div className="px-4 py-3 border-b border-[#E5E5E5] flex items-center justify-between">
                    <div>
                      <h3 className="text-xs font-bold text-[#111111]">
                        Durable Job Queue (Vercel Cron · Daily at 09:00 UTC)
                      </h3>
                      <p className="text-[11px] text-[#737373]">
                        Scheduled campaign sends and automation sequence steps persisted in Firestore.
                      </p>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="bg-[#FAFAFA] border-b border-[#E5E5E5] text-[#525252]">
                        <tr>
                          <th className="py-2.5 px-4">Job Type</th>
                          <th className="py-2.5 px-4">Target</th>
                          <th className="py-2.5 px-4">Status</th>
                          <th className="py-2.5 px-4">Scheduled At</th>
                          <th className="py-2.5 px-4">Attempts</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#EFEFEF]">
                        {scheduledJobs.map((j) => (
                          <tr key={j.id}>
                            <td className="py-2.5 px-4 font-mono text-[11px]">{j.jobType}</td>
                            <td className="py-2.5 px-4 font-mono text-[11px] text-[#525252]">
                              {j.campaignId || j.subscriberEmail || j.automationId}
                            </td>
                            <td className="py-2.5 px-4 capitalize font-semibold">{j.status}</td>
                            <td className="py-2.5 px-4 font-mono text-[11px] text-[#737373]">
                              {j.scheduledAt ? new Date(j.scheduledAt).toLocaleString() : '—'}
                            </td>
                            <td className="py-2.5 px-4 font-mono tabular-nums">{j.attempts || 0}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* SUBSCRIBERS, LISTS, SEGMENTS, SUPPRESSIONS */}
          {section === 'subscribers' && (
            <SubscribersAndListsView
              workspace={workspace}
              lists={lists}
              subscribers={subscribers}
              segments={segments}
              suppressions={suppressions}
              onRefresh={() => loadAll(true)}
              onRequireUpgrade={onRequireUpgrade}
            />
          )}

          {/* TEMPLATES & AUTOMATIONS */}
          {section === 'templates' && (
            <TemplatesAndAutomationsView
              workspace={workspace}
              templates={templates}
              automations={automations}
              automationSteps={automationSteps}
              lists={lists}
              scheduledJobs={scheduledJobs}
              senderSettings={senderSettings}
              onUseTemplate={(tpl) => {
                const type: EmailCampaignType =
                  tpl.category === 'newsletter' || tpl.category === 'weekly_digest'
                    ? 'newsletter'
                    : tpl.category === 'promotional_campaign'
                      ? 'promotional'
                      : 'announcement';
                openNewCampaign(type, tpl);
              }}
              onRefresh={() => loadAll(true)}
              onRequireUpgrade={onRequireUpgrade}
            />
          )}

          {/* ANALYTICS */}
          {section === 'analytics' && (
            <CampaignAnalyticsView
              campaigns={campaigns}
              deliveryEvents={deliveryEvents}
              scheduledJobs={scheduledJobs}
            />
          )}

          {/* SENDER DOMAINS & SETTINGS */}
          {section === 'settings' && (
            <SenderSettingsView
              workspace={workspace}
              senderSettings={senderSettings}
              domains={senderDomains}
              onRefresh={() => loadAll(true)}
              onRequireUpgrade={onRequireUpgrade}
            />
          )}
        </>
      )}
    </div>
  );
}
