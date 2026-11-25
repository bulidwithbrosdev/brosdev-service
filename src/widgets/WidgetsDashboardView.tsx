import React, { useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  Code2,
  Copy,
  ExternalLink,
  Globe,
  History,
  LayoutGrid,
  Paintbrush,
  Plus,
  Search,
  Send,
  Trash2,
  X,
} from 'lucide-react';
import {
  WIDGET_CATALOG,
  WIDGET_CATEGORIES,
  getWidgetDefinition,
} from './catalog';
import {
  createWidget,
  deleteWidget,
  duplicateWidget,
  listWidgets,
  publishWidget,
  unpublishWidget,
} from '../widget-api/widgetsFirestore';
import { WidgetBuilderView } from '../widget-builder/WidgetBuilderView';
import { WidgetEmbedPanel } from '../widget-publisher/WidgetEmbedPanel';
import { WidgetDomainsView } from '../widget-domains/WidgetDomainsView';
import { WidgetVersionsView } from '../widget-versions/WidgetVersionsView';
import { WidgetAnalyticsView } from '../widget-analytics/WidgetAnalyticsView';
import { hasPlanFeature, type PlanLockKey } from '../lib/planLimits';
import type { WorkspaceMe } from '../types';
import type { WidgetCategoryId, WidgetRecord, WidgetType } from './types';

export type WidgetsHubTab =
  | 'all'
  | 'published'
  | 'drafts'
  | 'library'
  | 'embeds'
  | 'domains'
  | 'versions'
  | 'analytics';

export const WidgetsDashboardView: React.FC<{
  workspace: WorkspaceMe;
  initialTab?: WidgetsHubTab;
  startInBuilder?: boolean;
  onRequestUpgrade: (key: PlanLockKey) => void;
}> = ({ workspace, initialTab = 'all', startInBuilder = false, onRequestUpgrade }) => {
  const [widgets, setWidgets] = useState<WidgetRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<WidgetsHubTab>(initialTab);
  const [activeBuilderWidget, setActiveBuilderWidget] = useState<WidgetRecord | null>(null);
  const [embedWidget, setEmbedWidget] = useState<WidgetRecord | null>(null);
  const [domainInitialPublicId, setDomainInitialPublicId] = useState<string | undefined>(undefined);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'all' | WidgetCategoryId>('all');
  const [groupFilter, setGroupFilter] = useState<'all' | 'ui' | 'business'>('all');
  const [creatingType, setCreatingType] = useState<WidgetType | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  const maxWidgets = workspace.limits.maxWidgets ?? 2;
  const canCustomCss = hasPlanFeature(workspace, 'widgetCustomCss');
  const canRemoveBranding = hasPlanFeature(workspace, 'removeBranding');

  useEffect(() => {
    setTab(initialTab);
    if (!startInBuilder) {
      setActiveBuilderWidget(null);
    }
  }, [initialTab, startInBuilder]);

  const loadAllWidgets = async () => {
    setLoading(true);
    try {
      const list = await listWidgets();
      setWidgets(list);
      if (startInBuilder && !activeBuilderWidget) {
        if (list.length > 0) {
          setActiveBuilderWidget(list[0]);
        } else {
          const starter = await createWidget({
            type: 'announcement_bar',
            name: 'Launch Announcement Bar',
            allowRemoveBranding: canRemoveBranding,
          });
          setWidgets([starter]);
          setActiveBuilderWidget(starter);
        }
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadAllWidgets();
  }, []);

  const publishedCount = useMemo(
    () => widgets.filter((w) => w.status === 'published').length,
    [widgets]
  );

  const handleCreateComponent = async (type: WidgetType) => {
    setCreatingType(type);
    setNotice(null);
    try {
      const created = await createWidget({
        type,
        allowRemoveBranding: canRemoveBranding,
      });
      setWidgets((prev) => [created, ...prev]);
      setActiveBuilderWidget(created);
    } catch (err: any) {
      setNotice({ kind: 'error', text: err.message || 'Could not create widget.' });
    } finally {
      setCreatingType(null);
    }
  };

  const handleQuickPublishToggle = async (w: WidgetRecord) => {
    setBusyId(w.docId);
    setNotice(null);
    try {
      if (w.status === 'published') {
        await unpublishWidget(w);
        setWidgets((prev) =>
          prev.map((item) => (item.docId === w.docId ? { ...item, status: 'draft' } : item))
        );
        setNotice({ kind: 'success', text: `Unpublished "${w.name}" back to draft.` });
      } else {
        const updated = await publishWidget(w, {
          configuration: w.configuration,
          maxPublishedWidgets: maxWidgets,
          allowCustomCss: canCustomCss,
          allowRemoveBranding: canRemoveBranding,
        });
        setWidgets((prev) => prev.map((item) => (item.docId === w.docId ? updated : item)));
        setNotice({ kind: 'success', text: `Published "${updated.name}" (v${updated.publishedVersion}).` });
      }
    } catch (err: any) {
      const msg = String(err.message || 'Failed to update status.');
      if (msg.toLowerCase().includes('plan allows up to')) {
        onRequestUpgrade('widgetsLimit');
      }
      setNotice({ kind: 'error', text: msg });
    } finally {
      setBusyId(null);
    }
  };

  const handleDuplicate = async (w: WidgetRecord) => {
    setBusyId(w.docId);
    setNotice(null);
    try {
      const copy = await duplicateWidget(w, canRemoveBranding);
      setWidgets((prev) => [copy, ...prev]);
      setNotice({ kind: 'success', text: `Created copy "${copy.name}".` });
    } catch (err: any) {
      setNotice({ kind: 'error', text: err.message || 'Duplicate failed.' });
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (w: WidgetRecord) => {
    setBusyId(w.docId);
    setNotice(null);
    try {
      await deleteWidget(w);
      setWidgets((prev) => prev.filter((item) => item.docId !== w.docId));
      setNotice({ kind: 'success', text: `Deleted "${w.name}".` });
    } catch (err: any) {
      setNotice({ kind: 'error', text: err.message || 'Delete failed.' });
    } finally {
      setBusyId(null);
    }
  };

  const upsertWidgetLocal = (updated: WidgetRecord) => {
    setWidgets((prev) => {
      const exists = prev.some((w) => w.docId === updated.docId);
      return exists
        ? prev.map((w) => (w.docId === updated.docId ? updated : w))
        : [updated, ...prev];
    });
  };

  // Visual Widget Builder Full-Screen Workspace
  if (activeBuilderWidget) {
    return (
      <WidgetBuilderView
        workspace={workspace}
        initialWidget={activeBuilderWidget}
        onBack={() => setActiveBuilderWidget(null)}
        onWidgetSaved={(updated) => {
          upsertWidgetLocal(updated);
          setActiveBuilderWidget(updated);
        }}
        onWidgetDeleted={(docId) => {
          setWidgets((prev) => prev.filter((w) => w.docId !== docId));
          setActiveBuilderWidget(null);
        }}
        onOpenDomains={(pubId) => {
          setDomainInitialPublicId(pubId);
          setActiveBuilderWidget(null);
          setTab('domains');
        }}
        onRequestUpgrade={onRequestUpgrade}
      />
    );
  }

  const filteredWidgets = widgets.filter((w) => {
    if (tab === 'published' && w.status !== 'published') return false;
    if (tab === 'drafts' && w.status !== 'draft') return false;
    if (groupFilter !== 'all' && w.group !== groupFilter) return false;
    if (categoryFilter !== 'all' && w.category !== categoryFilter) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      w.name.toLowerCase().includes(q) ||
      w.publicId.toLowerCase().includes(q) ||
      w.type.toLowerCase().includes(q)
    );
  });

  const filteredLibrary = WIDGET_CATALOG.filter((item) => {
    if (groupFilter !== 'all' && item.group !== groupFilter) return false;
    if (categoryFilter !== 'all' && item.category !== categoryFilter) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      item.name.toLowerCase().includes(q) ||
      item.shortDescription.toLowerCase().includes(q) ||
      item.useCase.toLowerCase().includes(q)
    );
  });

  const navTabs: Array<{ id: WidgetsHubTab; label: string; icon: React.ComponentType<any>; count?: number }> = [
    { id: 'all', label: 'All Components', icon: LayoutGrid, count: widgets.length },
    { id: 'published', label: 'Published', icon: Send, count: publishedCount },
    { id: 'drafts', label: 'Drafts', icon: Paintbrush, count: widgets.filter((w) => w.status === 'draft').length },
    { id: 'library', label: 'Component Library (28)', icon: Plus },
    { id: 'embeds', label: 'Embed Codes & URLs', icon: Code2 },
    { id: 'domains', label: 'Domains', icon: Globe },
    { id: 'versions', label: 'Versions', icon: History },
    { id: 'analytics', label: 'Analytics', icon: BarChart3 },
  ];

  const activeEmbedTarget = embedWidget || widgets[0] || null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#111111]">
            Website Components &amp; Widgets
          </h1>
          <p className="text-sm text-[#525252] mt-1">
            Build, customize, publish, and embed 28 Shadow-DOM isolated website components and business widgets.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="rounded-md border border-[#E5E5E5] bg-white px-3 py-1.5 text-xs">
            <span className="text-[#737373]">Published Quota: </span>
            <span className="font-mono font-bold tabular-nums text-[#111111]">
              {publishedCount} / {maxWidgets}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setTab('library')}
            className="inline-flex items-center gap-1.5 rounded-md bg-[#A90706] px-4 py-2 text-xs font-semibold text-white hover:bg-[#8C0605] cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            Create Component
          </button>
        </div>
      </div>

      {/* Sub-navigation tabs */}
      <div className="border-b border-[#E5E5E5] flex items-center gap-1 overflow-x-auto">
        {navTabs.map((item) => {
          const Icon = item.icon;
          const active = tab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
                active
                  ? 'border-[#A90706] text-[#A90706]'
                  : 'border-transparent text-[#525252] hover:text-[#111111]'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{item.label}</span>
              {typeof item.count === 'number' && (
                <span className="font-mono text-[11px] opacity-70">({item.count})</span>
              )}
            </button>
          );
        })}
      </div>

      {notice && (
        <div
          className={`rounded-lg border px-4 py-2.5 text-xs flex items-center justify-between ${
            notice.kind === 'error'
              ? 'border-[#A90706]/30 bg-[#FEF2F2] text-[#A90706]'
              : 'border-[#15803D]/30 bg-[#F0FDF4] text-[#166534]'
          }`}
        >
          <span>{notice.text}</span>
          <button type="button" onClick={() => setNotice(null)} className="cursor-pointer">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* TAB: ALL / PUBLISHED / DRAFTS */}
      {(tab === 'all' || tab === 'published' || tab === 'drafts') && (
        <div className="space-y-4">
          <div className="rounded-lg border border-[#E5E5E5] bg-white p-3.5 flex flex-wrap items-center justify-between gap-3">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="w-3.5 h-3.5 text-[#737373] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search components by name or ID..."
                className="w-full rounded-md border border-[#D4D4D4] pl-8 pr-3 py-1.5 text-xs focus:border-[#A90706] focus:outline-none"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <select
                value={groupFilter}
                onChange={(e) => setGroupFilter(e.target.value as any)}
                className="rounded-md border border-[#D4D4D4] bg-white px-2.5 py-1.5 text-xs"
              >
                <option value="all">All Groups</option>
                <option value="ui">Website UI (20)</option>
                <option value="business">Business Widgets (8)</option>
              </select>

              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value as any)}
                className="rounded-md border border-[#D4D4D4] bg-white px-2.5 py-1.5 text-xs"
              >
                <option value="all">All Categories</option>
                {WIDGET_CATEGORIES.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {loading ? (
            <div className="rounded-lg border border-[#E5E5E5] bg-white p-10 text-center text-xs text-[#737373]">
              Loading your website components...
            </div>
          ) : filteredWidgets.length === 0 ? (
            <div className="rounded-lg border border-[#E5E5E5] bg-white p-10 text-center space-y-3">
              <div className="text-sm font-bold text-[#111111]">
                {widgets.length === 0
                  ? 'Create your first website component'
                  : 'No components match your current filter'}
              </div>
              <p className="text-xs text-[#525252] max-w-md mx-auto">
                Choose from 20 UI components and 8 business widgets — Announcement Bars, Cookie Banners, Pricing Tables, WhatsApp Chat, Digital Business Cards, and more.
              </p>
              <button
                type="button"
                onClick={() => setTab('library')}
                className="inline-flex items-center gap-1.5 rounded-md bg-[#A90706] px-4 py-2 text-xs font-semibold text-white hover:bg-[#8C0605] cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                Browse 28 Components
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {filteredWidgets.map((w) => {
                const def = getWidgetDefinition(w.type);
                const isBusy = busyId === w.docId;
                return (
                  <div
                    key={w.docId}
                    className="rounded-lg border border-[#E5E5E5] bg-white p-4 flex flex-col justify-between gap-4"
                  >
                    <div className="space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h3 className="text-sm font-bold text-[#111111] truncate">{w.name}</h3>
                          <div className="text-[11px] text-[#737373] truncate">
                            {def.name} ·{' '}
                            <span className="font-mono">{w.publicId}</span>
                          </div>
                        </div>
                        <span
                          className={`text-[11px] font-semibold capitalize shrink-0 ${
                            w.status === 'published'
                              ? 'text-[#15803D]'
                              : w.status === 'disabled'
                                ? 'text-[#A90706]'
                                : 'text-[#737373]'
                          }`}
                        >
                          {w.status === 'published' ? `Live v${w.publishedVersion}` : w.status}
                        </span>
                      </div>

                      <div className="grid grid-cols-3 gap-2 pt-2 border-t border-[#F0F0F0] text-[11px]">
                        <div>
                          <div className="text-[#737373]">Views</div>
                          <div className="font-mono font-bold tabular-nums text-[#111111]">
                            {w.totalViews.toLocaleString()}
                          </div>
                        </div>
                        <div>
                          <div className="text-[#737373]">Clicks</div>
                          <div className="font-mono font-bold tabular-nums text-[#111111]">
                            {w.totalClicks.toLocaleString()}
                          </div>
                        </div>
                        <div>
                          <div className="text-[#737373]">Domains</div>
                          <div className="font-mono font-bold text-[#111111]">
                            {w.domainRestrictionEnabled
                              ? `${w.allowedDomains.length} locked`
                              : 'Any origin'}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-[#F0F0F0]">
                      <button
                        type="button"
                        onClick={() => setActiveBuilderWidget(w)}
                        className="flex-1 inline-flex items-center justify-center gap-1 rounded-md bg-[#111111] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#262626] cursor-pointer"
                      >
                        <Paintbrush className="w-3.5 h-3.5" />
                        Customize
                      </button>
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => void handleQuickPublishToggle(w)}
                        className={`rounded-md border px-2.5 py-1.5 text-xs font-semibold cursor-pointer ${
                          w.status === 'published'
                            ? 'border-[#D4D4D4] bg-white text-[#525252] hover:text-[#111111]'
                            : 'border-[#A90706] bg-[#FEF2F2] text-[#A90706] hover:bg-[#A90706] hover:text-white'
                        }`}
                      >
                        {w.status === 'published' ? 'Unpublish' : 'Publish'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEmbedWidget(w);
                          setTab('embeds');
                        }}
                        title="Embed code & Hosted URL"
                        className="p-1.5 rounded-md border border-[#D4D4D4] text-[#525252] hover:text-[#111111] cursor-pointer"
                      >
                        <Code2 className="w-3.5 h-3.5" />
                      </button>
                      <a
                        href={`/w/${w.publicId}${w.status !== 'published' ? '?preview=1' : ''}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Open hosted page"
                        className="p-1.5 rounded-md border border-[#D4D4D4] text-[#525252] hover:text-[#111111]"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => void handleDuplicate(w)}
                        title="Duplicate"
                        className="p-1.5 rounded-md border border-[#D4D4D4] text-[#525252] hover:text-[#111111] cursor-pointer"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => void handleDelete(w)}
                        title="Delete"
                        className="p-1.5 rounded-md border border-[#D4D4D4] text-[#737373] hover:text-[#A90706] cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB: COMPONENT LIBRARY (28 MODULES) */}
      {tab === 'library' && (
        <div className="space-y-4">
          <div className="rounded-lg border border-[#E5E5E5] bg-white p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="relative flex-1 min-w-[220px] max-w-md">
              <Search className="w-3.5 h-3.5 text-[#737373] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search 20 UI components + 8 Business widgets..."
                className="w-full rounded-md border border-[#D4D4D4] pl-8 pr-3 py-1.5 text-xs focus:border-[#A90706] focus:outline-none"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center rounded-md border border-[#D4D4D4] bg-[#FAFAFA] p-0.5 text-xs">
                {(
                  [
                    ['all', 'All (28)'],
                    ['ui', 'Website UI (20)'],
                    ['business', 'Business (8)'],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setGroupFilter(id)}
                    className={`px-2.5 py-1 rounded font-semibold cursor-pointer ${
                      groupFilter === id
                        ? 'bg-[#111111] text-white'
                        : 'text-[#525252] hover:text-[#111111]'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value as any)}
                className="rounded-md border border-[#D4D4D4] bg-white px-2.5 py-1.5 text-xs"
              >
                <option value="all">All Categories</option>
                {WIDGET_CATEGORIES.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredLibrary.map((item) => {
              const cat = WIDGET_CATEGORIES.find((c) => c.id === item.category)?.label;
              const isCreating = creatingType === item.type;
              return (
                <div
                  key={item.type}
                  className="rounded-lg border border-[#E5E5E5] bg-white p-4 flex flex-col justify-between gap-4 hover:border-[#111111] transition-colors"
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2 text-[11px]">
                      <span className="font-semibold text-[#A90706]">
                        {item.group === 'business' ? 'Business Widget' : 'UI Component'}
                      </span>
                      <span className="text-[#737373] truncate">{cat}</span>
                    </div>
                    <h3 className="text-sm font-bold text-[#111111]">{item.name}</h3>
                    <p className="text-xs text-[#525252] leading-relaxed">
                      {item.shortDescription}
                    </p>
                  </div>

                  <button
                    type="button"
                    disabled={isCreating}
                    onClick={() => void handleCreateComponent(item.type)}
                    className="w-full inline-flex items-center justify-center gap-1.5 rounded-md bg-[#111111] px-3 py-2 text-xs font-semibold text-white hover:bg-[#A90706] transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    {isCreating ? 'Creating...' : 'Use Component'}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB: EMBED CODES & HOSTED URLS */}
      {tab === 'embeds' && (
        <div className="space-y-4">
          {widgets.length === 0 ? (
            <div className="rounded-lg border border-[#E5E5E5] bg-white p-10 text-center text-xs text-[#525252]">
              Create a component from the Component Library first to generate its embed script and hosted URL.
            </div>
          ) : (
            <>
              <div className="rounded-lg border border-[#E5E5E5] bg-white p-4 flex flex-wrap items-center justify-between gap-3">
                <span className="text-xs font-bold text-[#111111]">Select Component</span>
                <select
                  value={activeEmbedTarget?.docId || ''}
                  onChange={(e) => {
                    const found = widgets.find((w) => w.docId === e.target.value) || null;
                    setEmbedWidget(found);
                  }}
                  className="rounded-md border border-[#D4D4D4] bg-white px-3 py-1.5 text-xs font-semibold min-w-[240px]"
                >
                  {widgets.map((w) => (
                    <option key={w.docId} value={w.docId}>
                      {w.name} ({w.publicId}) — {w.status}
                    </option>
                  ))}
                </select>
              </div>
              {activeEmbedTarget && (
                <WidgetEmbedPanel
                  widget={activeEmbedTarget}
                  onOpenDomains={() => {
                    setDomainInitialPublicId(activeEmbedTarget.publicId);
                    setTab('domains');
                  }}
                />
              )}
            </>
          )}
        </div>
      )}

      {/* TAB: DOMAINS */}
      {tab === 'domains' && (
        <WidgetDomainsView
          workspace={workspace}
          widgets={widgets}
          initialPublicId={domainInitialPublicId}
          onWidgetUpdated={upsertWidgetLocal}
          onRequestUpgrade={onRequestUpgrade}
        />
      )}

      {/* TAB: VERSIONS */}
      {tab === 'versions' && (
        <WidgetVersionsView
          workspace={workspace}
          widgets={widgets}
          onWidgetUpdated={upsertWidgetLocal}
          onOpenBuilder={(w) => setActiveBuilderWidget(w)}
        />
      )}

      {/* TAB: ANALYTICS */}
      {tab === 'analytics' && <WidgetAnalyticsView widgets={widgets} />}
    </div>
  );
};
