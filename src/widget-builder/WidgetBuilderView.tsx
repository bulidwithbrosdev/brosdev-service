import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Check,
  Code2,
  Copy,
  Globe,
  Lock,
  Monitor,
  Moon,
  Plus,
  Redo2,
  RotateCcw,
  Save,
  Search,
  Send,
  Smartphone,
  Sun,
  Tablet,
  Trash2,
  Undo2,
  X,
} from 'lucide-react';
import {
  WIDGET_CATALOG,
  WIDGET_CATEGORIES,
  cloneDefaultConfiguration,
  getWidgetDefinition,
} from '../widgets/catalog';
import { validateAndScopeCustomCss } from '../widgets/security';
import {
  createWidget,
  deleteWidget,
  duplicateWidget,
  publishWidget,
  saveWidgetDraft,
} from '../widget-api/widgetsFirestore';
import { WidgetRenderer } from '../widget-renderer/WidgetRenderer';
import { WidgetEmbedPanel } from '../widget-publisher/WidgetEmbedPanel';
import { hasPlanFeature, type PlanLockKey } from '../lib/planLimits';
import type { WorkspaceMe } from '../types';
import type {
  WidgetConfiguration,
  WidgetEventType,
  WidgetRecord,
  WidgetSchemaField,
  WidgetType,
} from '../widgets/types';

type RightTab = 'content' | 'design' | 'rules' | 'css';
type ViewportMode = 'desktop' | 'tablet' | 'mobile';
type LibraryFilter = 'all' | 'ui' | 'business' | 'recent';

const RECENT_KEY = 'brosdev_recent_widget_types_v1';

function readRecentTypes(): WidgetType[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return ['announcement_bar', 'cookie_consent', 'whatsapp_chat'];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.slice(0, 8) : [];
  } catch {
    return ['announcement_bar', 'cookie_consent', 'whatsapp_chat'];
  }
}

function pushRecentType(type: WidgetType): WidgetType[] {
  const next = [type, ...readRecentTypes().filter((t) => t !== type)].slice(0, 8);
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // ignore storage errors
  }
  return next;
}

function deepClone<T>(val: T): T {
  return JSON.parse(JSON.stringify(val));
}

export interface WidgetBuilderViewProps {
  workspace: WorkspaceMe;
  initialWidget: WidgetRecord;
  onBack: () => void;
  onWidgetSaved: (updated: WidgetRecord) => void;
  onWidgetDeleted: (docId: string) => void;
  onOpenDomains: (publicId: string) => void;
  onRequestUpgrade: (key: PlanLockKey) => void;
}

export const WidgetBuilderView: React.FC<WidgetBuilderViewProps> = ({
  workspace,
  initialWidget,
  onBack,
  onWidgetSaved,
  onWidgetDeleted,
  onOpenDomains,
  onRequestUpgrade,
}) => {
  const [widget, setWidget] = useState<WidgetRecord>(initialWidget);
  const [name, setName] = useState(initialWidget.name);
  const [config, setConfig] = useState<WidgetConfiguration>(() =>
    deepClone(initialWidget.configuration)
  );
  const [historyPast, setHistoryPast] = useState<WidgetConfiguration[]>([]);
  const [historyFuture, setHistoryFuture] = useState<WidgetConfiguration[]>([]);
  const [dirty, setDirty] = useState(false);

  // Left library panel state
  const [libFilter, setLibFilter] = useState<LibraryFilter>('all');
  const [libSearch, setLibSearch] = useState('');
  const [recentTypes, setRecentTypes] = useState<WidgetType[]>(() => readRecentTypes());

  // Center live preview state
  const [viewport, setViewport] = useState<ViewportMode>('desktop');
  const [previewTheme, setPreviewTheme] = useState<'light' | 'dark'>('light');
  const [previewKey, setPreviewKey] = useState(0);
  const [eventLog, setEventLog] = useState<Array<{ id: number; type: WidgetEventType; detail: string; time: string }>>([]);

  // Right settings panel state
  const [rightTab, setRightTab] = useState<RightTab>('content');
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showEmbedModal, setShowEmbedModal] = useState(false);
  const [banner, setBanner] = useState<{ kind: 'success' | 'error'; message: string } | null>(null);

  const canCustomCss = hasPlanFeature(workspace, 'widgetCustomCss');
  const canRemoveBranding = hasPlanFeature(workspace, 'removeBranding');
  const maxWidgets = workspace.limits.maxWidgets ?? 2;

  useEffect(() => {
    setWidget(initialWidget);
    setName(initialWidget.name);
    setConfig(deepClone(initialWidget.configuration));
    setHistoryPast([]);
    setHistoryFuture([]);
    setDirty(false);
    setRecentTypes(pushRecentType(initialWidget.type));
  }, [initialWidget.docId]);

  const def = useMemo(() => getWidgetDefinition(widget.type), [widget.type]);

  const cssValidation = useMemo(
    () => validateAndScopeCustomCss(config.customCss || ''),
    [config.customCss]
  );

  const pushConfig = (updater: (prev: WidgetConfiguration) => WidgetConfiguration) => {
    setConfig((prev) => {
      const next = updater(deepClone(prev));
      setHistoryPast((past) => [...past.slice(-29), deepClone(prev)]);
      setHistoryFuture([]);
      setDirty(true);
      return next;
    });
  };

  const handleUndo = () => {
    if (historyPast.length === 0) return;
    const previous = historyPast[historyPast.length - 1];
    setHistoryPast((p) => p.slice(0, -1));
    setHistoryFuture((f) => [deepClone(config), ...f.slice(0, 29)]);
    setConfig(deepClone(previous));
    setDirty(true);
  };

  const handleRedo = () => {
    if (historyFuture.length === 0) return;
    const next = historyFuture[0];
    setHistoryFuture((f) => f.slice(1));
    setHistoryPast((p) => [...p.slice(-29), deepClone(config)]);
    setConfig(deepClone(next));
    setDirty(true);
  };

  const handleResetDefault = () => {
    const fresh = cloneDefaultConfiguration(widget.type);
    if (!canRemoveBranding) fresh.showBranding = true;
    pushConfig(() => fresh);
    setPreviewKey((k) => k + 1);
    setBanner({ kind: 'success', message: 'Reset settings to default component template.' });
  };

  const handleSaveDraft = async () => {
    setBanner(null);
    setSaving(true);
    try {
      const updated = await saveWidgetDraft(widget, {
        name: name.trim() || widget.name,
        type: widget.type,
        configuration: config,
        allowCustomCss: canCustomCss,
        allowRemoveBranding: canRemoveBranding,
      });
      setWidget(updated);
      setName(updated.name);
      setConfig(deepClone(updated.configuration));
      setDirty(false);
      onWidgetSaved(updated);
      setBanner({ kind: 'success', message: `Draft saved (v${updated.version}).` });
    } catch (err: any) {
      setBanner({ kind: 'error', message: err.message || 'Failed to save draft.' });
    } finally {
      setSaving(false);
    }
  };

  const handlePublish = async () => {
    setBanner(null);
    if (config.customCss.trim() && !canCustomCss) {
      onRequestUpgrade('widgetCustomCss');
      return;
    }
    if (!config.showBranding && !canRemoveBranding) {
      onRequestUpgrade('removeBranding');
      return;
    }
    setPublishing(true);
    try {
      const updated = await publishWidget(widget, {
        name: name.trim() || widget.name,
        configuration: config,
        maxPublishedWidgets: maxWidgets,
        allowCustomCss: canCustomCss,
        allowRemoveBranding: canRemoveBranding,
      });
      setWidget(updated);
      setName(updated.name);
      setConfig(deepClone(updated.configuration));
      setDirty(false);
      onWidgetSaved(updated);
      setBanner({
        kind: 'success',
        message: `Published v${updated.publishedVersion}! Embed script & hosted URL are live.`,
      });
      setShowEmbedModal(true);
    } catch (err: any) {
      const msg = String(err.message || 'Failed to publish widget.');
      if (msg.toLowerCase().includes('plan allows up to')) {
        onRequestUpgrade('widgetsLimit');
      }
      setBanner({ kind: 'error', message: msg });
    } finally {
      setPublishing(false);
    }
  };

  const handleDuplicate = async () => {
    setDuplicating(true);
    setBanner(null);
    try {
      const copy = await duplicateWidget({ ...widget, name, configuration: config }, canRemoveBranding);
      onWidgetSaved(copy);
      setWidget(copy);
      setName(copy.name);
      setConfig(deepClone(copy.configuration));
      setHistoryPast([]);
      setHistoryFuture([]);
      setDirty(false);
      setBanner({ kind: 'success', message: `Duplicated as "${copy.name}".` });
    } catch (err: any) {
      setBanner({ kind: 'error', message: err.message || 'Could not duplicate component.' });
    } finally {
      setDuplicating(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteWidget(widget);
      onWidgetDeleted(widget.docId);
      onBack();
    } catch (err: any) {
      setBanner({ kind: 'error', message: err.message || 'Could not delete component.' });
      setDeleting(false);
    }
  };

  const handleSelectLibraryComponent = async (type: WidgetType) => {
    setRecentTypes(pushRecentType(type));
    if (type === widget.type) return;
    setBanner(null);
    try {
      const created = await createWidget({
        type,
        allowRemoveBranding: canRemoveBranding,
      });
      onWidgetSaved(created);
      setWidget(created);
      setName(created.name);
      setConfig(deepClone(created.configuration));
      setHistoryPast([]);
      setHistoryFuture([]);
      setDirty(false);
      setPreviewKey((k) => k + 1);
      setBanner({
        kind: 'success',
        message: `Created new ${getWidgetDefinition(type).name} draft in the builder.`,
      });
    } catch (err: any) {
      setBanner({ kind: 'error', message: err.message || 'Failed to switch component.' });
    }
  };

  const filteredCatalog = useMemo(() => {
    const q = libSearch.trim().toLowerCase();
    return WIDGET_CATALOG.filter((item) => {
      if (libFilter === 'ui' && item.group !== 'ui') return false;
      if (libFilter === 'business' && item.group !== 'business') return false;
      if (libFilter === 'recent' && !recentTypes.includes(item.type)) return false;
      if (!q) return true;
      return (
        item.name.toLowerCase().includes(q) ||
        item.shortDescription.toLowerCase().includes(q) ||
        item.type.toLowerCase().includes(q)
      );
    });
  }, [libFilter, libSearch, recentTypes]);

  const handlePreviewEvent = (eventType: WidgetEventType, detail?: string) => {
    setEventLog((prev) => [
      {
        id: Date.now() + Math.random(),
        type: eventType,
        detail: detail || eventType,
        time: new Date().toLocaleTimeString(),
      },
      ...prev.slice(0, 9),
    ]);
  };

  const viewportWidthClass =
    viewport === 'mobile' ? 'max-w-[375px]' : viewport === 'tablet' ? 'max-w-[768px]' : 'max-w-full';

  const renderContentField = (field: WidgetSchemaField) => {
    const val = config.content[field.key];
    const setContentVal = (nextVal: unknown) => {
      pushConfig((prev) => ({
        ...prev,
        content: { ...prev.content, [field.key]: nextVal },
      }));
    };

    if (field.type === 'boolean') {
      return (
        <label
          key={field.key}
          className="flex items-center justify-between gap-3 rounded-md border border-[#E5E5E5] bg-[#FAFAFA] px-3 py-2 cursor-pointer"
        >
          <span className="text-xs font-medium text-[#111111]">{field.label}</span>
          <input
            type="checkbox"
            checked={Boolean(val)}
            onChange={(e) => setContentVal(e.target.checked)}
            className="h-4 w-4 accent-[#A90706]"
          />
        </label>
      );
    }

    if (field.type === 'textarea') {
      return (
        <div key={field.key} className="space-y-1">
          <label className="block text-[11px] font-semibold text-[#333333]">{field.label}</label>
          <textarea
            rows={3}
            value={String(val ?? '')}
            placeholder={field.placeholder}
            onChange={(e) => setContentVal(e.target.value)}
            className="w-full rounded-md border border-[#D4D4D4] px-2.5 py-1.5 text-xs text-[#111111] focus:border-[#A90706] focus:outline-none"
          />
          {field.helpText && <p className="text-[11px] text-[#737373]">{field.helpText}</p>}
        </div>
      );
    }

    if (field.type === 'select') {
      return (
        <div key={field.key} className="space-y-1">
          <label className="block text-[11px] font-semibold text-[#333333]">{field.label}</label>
          <select
            value={String(val ?? '')}
            onChange={(e) => setContentVal(e.target.value)}
            className="w-full rounded-md border border-[#D4D4D4] bg-white px-2.5 py-1.5 text-xs text-[#111111] focus:border-[#A90706] focus:outline-none"
          >
            {(field.options || []).map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      );
    }

    if (field.type === 'number') {
      return (
        <div key={field.key} className="space-y-1">
          <label className="block text-[11px] font-semibold text-[#333333]">{field.label}</label>
          <input
            type="number"
            min={field.min}
            max={field.max}
            value={Number(val ?? 0)}
            onChange={(e) => setContentVal(Number(e.target.value))}
            className="w-full rounded-md border border-[#D4D4D4] px-2.5 py-1.5 text-xs tabular-nums text-[#111111] focus:border-[#A90706] focus:outline-none"
          />
        </div>
      );
    }

    if (field.type === 'string_list') {
      const list = Array.isArray(val) ? val.map(String) : [];
      return (
        <div key={field.key} className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-[11px] font-semibold text-[#333333]">{field.label}</label>
            <button
              type="button"
              onClick={() => setContentVal([...list, 'New item'])}
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#A90706] hover:underline cursor-pointer"
            >
              <Plus className="w-3 h-3" /> Add
            </button>
          </div>
          <div className="space-y-1.5">
            {list.map((entry, idx) => (
              <div key={idx} className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={entry}
                  onChange={(e) => {
                    const next = [...list];
                    next[idx] = e.target.value;
                    setContentVal(next);
                  }}
                  className="flex-1 rounded-md border border-[#D4D4D4] px-2.5 py-1 text-xs text-[#111111]"
                />
                <button
                  type="button"
                  onClick={() => setContentVal(list.filter((_, i) => i !== idx))}
                  className="p-1 text-[#737373] hover:text-[#A90706] cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      );
    }

    if (field.type === 'json_list' && field.itemShape) {
      const items = Array.isArray(val) ? (val as Array<Record<string, any>>) : [];
      const addEmptyRow = () => {
        const blank: Record<string, any> = {};
        for (const col of field.itemShape || []) {
          blank[col.key] = col.type === 'boolean' ? false : col.type === 'number' ? 5 : '';
        }
        setContentVal([...items, blank]);
      };
      return (
        <div key={field.key} className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-[11px] font-semibold text-[#333333]">{field.label}</label>
            <button
              type="button"
              onClick={addEmptyRow}
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#A90706] hover:underline cursor-pointer"
            >
              <Plus className="w-3 h-3" /> Add Row
            </button>
          </div>
          <div className="space-y-2">
            {items.map((row, idx) => (
              <div
                key={idx}
                className="rounded-md border border-[#E5E5E5] bg-[#FAFAFA] p-2.5 space-y-2"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-[#525252]">Item #{idx + 1}</span>
                  <button
                    type="button"
                    onClick={() => setContentVal(items.filter((_, i) => i !== idx))}
                    className="text-[#737373] hover:text-[#A90706] cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                {field.itemShape!.map((col) => (
                  <div key={col.key} className="space-y-0.5">
                    {col.type === 'boolean' ? (
                      <label className="flex items-center justify-between text-[11px] text-[#333333] cursor-pointer">
                        <span>{col.label}</span>
                        <input
                          type="checkbox"
                          checked={Boolean(row[col.key])}
                          onChange={(e) => {
                            const next = [...items];
                            next[idx] = { ...row, [col.key]: e.target.checked };
                            setContentVal(next);
                          }}
                          className="accent-[#A90706]"
                        />
                      </label>
                    ) : (
                      <>
                        <label className="block text-[10px] font-semibold text-[#525252]">
                          {col.label}
                        </label>
                        <input
                          type={col.type === 'number' ? 'number' : 'text'}
                          value={String(row[col.key] ?? '')}
                          onChange={(e) => {
                            const next = [...items];
                            next[idx] = {
                              ...row,
                              [col.key]:
                                col.type === 'number' ? Number(e.target.value) : e.target.value,
                            };
                            setContentVal(next);
                          }}
                          className="w-full rounded border border-[#D4D4D4] bg-white px-2 py-1 text-xs text-[#111111]"
                        />
                      </>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      );
    }

    return (
      <div key={field.key} className="space-y-1">
        <label className="block text-[11px] font-semibold text-[#333333]">{field.label}</label>
        <input
          type={field.type === 'url' ? 'url' : field.type === 'color' ? 'color' : 'text'}
          value={String(val ?? '')}
          placeholder={field.placeholder}
          onChange={(e) => setContentVal(e.target.value)}
          className="w-full rounded-md border border-[#D4D4D4] px-2.5 py-1.5 text-xs text-[#111111] focus:border-[#A90706] focus:outline-none"
        />
        {field.helpText && <p className="text-[11px] text-[#737373]">{field.helpText}</p>}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Top Toolbar */}
      <div className="rounded-lg border border-[#E5E5E5] bg-white px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 rounded-md border border-[#D4D4D4] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#111111] hover:bg-[#F5F5F5] cursor-pointer shrink-0"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Components
          </button>

          <div className="min-w-0 flex-1 max-w-xs">
            <input
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setDirty(true);
              }}
              aria-label="Widget name"
              className="w-full rounded-md border border-transparent hover:border-[#D4D4D4] focus:border-[#A90706] focus:bg-white bg-[#FAFAFA] px-2.5 py-1 text-sm font-bold text-[#111111] focus:outline-none"
            />
            <div className="px-2.5 text-[11px] text-[#737373] truncate">
              {def.name} ·{' '}
              <span
                className={
                  widget.status === 'published'
                    ? 'font-semibold text-[#15803D]'
                    : widget.status === 'disabled'
                      ? 'font-semibold text-[#A90706]'
                      : 'font-semibold text-[#525252]'
                }
              >
                {widget.status === 'published'
                  ? `Published v${widget.publishedVersion}`
                  : widget.status === 'disabled'
                    ? 'Disabled'
                    : `Draft v${widget.version}`}
              </span>
              {dirty && ' · Unsaved changes'}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={handleUndo}
            disabled={historyPast.length === 0}
            title="Undo"
            className="p-2 rounded-md border border-[#D4D4D4] bg-white text-[#111111] hover:bg-[#F5F5F5] disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
          >
            <Undo2 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={handleRedo}
            disabled={historyFuture.length === 0}
            title="Redo"
            className="p-2 rounded-md border border-[#D4D4D4] bg-white text-[#111111] hover:bg-[#F5F5F5] disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
          >
            <Redo2 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={handleResetDefault}
            title="Reset to default"
            className="inline-flex items-center gap-1 rounded-md border border-[#D4D4D4] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#525252] hover:text-[#111111] hover:bg-[#F5F5F5] cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset
          </button>
          <button
            type="button"
            onClick={() => void handleDuplicate()}
            disabled={duplicating}
            title="Duplicate component"
            className="inline-flex items-center gap-1 rounded-md border border-[#D4D4D4] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#525252] hover:text-[#111111] hover:bg-[#F5F5F5] cursor-pointer"
          >
            <Copy className="w-3.5 h-3.5" />
            Duplicate
          </button>
          <button
            type="button"
            onClick={() => setShowEmbedModal(true)}
            className="inline-flex items-center gap-1 rounded-md border border-[#D4D4D4] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#111111] hover:bg-[#F5F5F5] cursor-pointer"
          >
            <Code2 className="w-3.5 h-3.5" />
            Embed
          </button>
          <button
            type="button"
            onClick={() => void handleSaveDraft()}
            disabled={saving}
            className="inline-flex items-center gap-1 rounded-md border border-[#111111] bg-white px-3 py-1.5 text-xs font-semibold text-[#111111] hover:bg-[#111111] hover:text-white transition-colors cursor-pointer disabled:opacity-50"
          >
            <Save className="w-3.5 h-3.5" />
            {saving ? 'Saving...' : 'Save Draft'}
          </button>
          <button
            type="button"
            onClick={() => void handlePublish()}
            disabled={publishing}
            className="inline-flex items-center gap-1 rounded-md bg-[#A90706] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-[#8C0605] transition-colors cursor-pointer disabled:opacity-50"
          >
            <Send className="w-3.5 h-3.5" />
            {publishing ? 'Publishing...' : widget.status === 'published' ? 'Update Live' : 'Publish'}
          </button>
          <button
            type="button"
            onClick={() => void handleDelete()}
            disabled={deleting}
            title="Delete component"
            className="p-2 rounded-md border border-[#E5E5E5] text-[#737373] hover:border-[#A90706] hover:text-[#A90706] cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {banner && (
        <div
          className={`rounded-lg border px-4 py-2.5 text-xs flex items-center justify-between ${
            banner.kind === 'error'
              ? 'border-[#A90706]/30 bg-[#FEF2F2] text-[#A90706]'
              : 'border-[#15803D]/30 bg-[#F0FDF4] text-[#166534]'
          }`}
        >
          <span>{banner.message}</span>
          <button type="button" onClick={() => setBanner(null)} className="cursor-pointer">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Three-Panel Visual Builder */}
      <div className="grid grid-cols-1 xl:grid-cols-[260px_minmax(0,1fr)_340px] gap-4 items-start">
        {/* LEFT PANEL — Component Library */}
        <aside className="rounded-lg border border-[#E5E5E5] bg-white overflow-hidden">
          <div className="p-3 border-b border-[#E5E5E5] space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[#111111]">Component Library</span>
              <span className="font-mono text-[11px] text-[#737373]">{WIDGET_CATALOG.length}</span>
            </div>
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-[#737373] absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={libSearch}
                onChange={(e) => setLibSearch(e.target.value)}
                placeholder="Search 28 widgets..."
                className="w-full rounded-md border border-[#D4D4D4] pl-8 pr-2.5 py-1.5 text-xs focus:border-[#A90706] focus:outline-none"
              />
            </div>
            <div className="grid grid-cols-4 gap-1 text-[11px]">
              {(
                [
                  { id: 'all', label: 'All' },
                  { id: 'ui', label: 'UI (20)' },
                  { id: 'business', label: 'Biz (8)' },
                  { id: 'recent', label: 'Recent' },
                ] as Array<{ id: LibraryFilter; label: string }>
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setLibFilter(tab.id)}
                  className={`py-1 rounded font-semibold cursor-pointer ${
                    libFilter === tab.id
                      ? 'bg-[#111111] text-white'
                      : 'bg-[#F5F5F5] text-[#525252] hover:text-[#111111]'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="max-h-[680px] overflow-y-auto divide-y divide-[#F0F0F0]">
            {filteredCatalog.map((item) => {
              const active = item.type === widget.type;
              const catLabel =
                WIDGET_CATEGORIES.find((c) => c.id === item.category)?.label || item.category;
              return (
                <button
                  key={item.type}
                  type="button"
                  onClick={() => void handleSelectLibraryComponent(item.type)}
                  className={`w-full text-left p-3 transition-colors cursor-pointer ${
                    active ? 'bg-[#FEF2F2]' : 'hover:bg-[#FAFAFA]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`text-xs font-bold truncate ${
                        active ? 'text-[#A90706]' : 'text-[#111111]'
                      }`}
                    >
                      {item.name}
                    </span>
                    <span className="text-[10px] font-medium text-[#737373] shrink-0">
                      {item.group === 'business' ? 'Business' : 'UI'}
                    </span>
                  </div>
                  <p className="text-[11px] text-[#525252] line-clamp-2 mt-0.5 leading-snug">
                    {item.shortDescription}
                  </p>
                  <div className="mt-1 text-[10px] text-[#737373]">{catLabel}</div>
                </button>
              );
            })}
            {filteredCatalog.length === 0 && (
              <div className="p-6 text-center text-xs text-[#737373]">
                No components match "{libSearch}".
              </div>
            )}
          </div>
        </aside>

        {/* CENTER PANEL — Live Interactive Preview */}
        <section className="rounded-lg border border-[#E5E5E5] bg-white overflow-hidden flex flex-col">
          <div className="px-4 py-2.5 border-b border-[#E5E5E5] flex flex-wrap items-center justify-between gap-2 bg-[#FAFAFA]">
            <div className="flex items-center gap-1 rounded-md border border-[#E5E5E5] bg-white p-0.5">
              {(
                [
                  { id: 'desktop', icon: Monitor, label: 'Desktop' },
                  { id: 'tablet', icon: Tablet, label: 'Tablet' },
                  { id: 'mobile', icon: Smartphone, label: 'Mobile' },
                ] as const
              ).map((vp) => {
                const Icon = vp.icon;
                return (
                  <button
                    key={vp.id}
                    type="button"
                    onClick={() => setViewport(vp.id)}
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-semibold cursor-pointer ${
                      viewport === vp.id
                        ? 'bg-[#111111] text-white'
                        : 'text-[#525252] hover:text-[#111111]'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">{vp.label}</span>
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 rounded-md border border-[#E5E5E5] bg-white p-0.5">
                <button
                  type="button"
                  onClick={() => setPreviewTheme('light')}
                  className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-semibold cursor-pointer ${
                    previewTheme === 'light'
                      ? 'bg-[#F5F5F5] text-[#111111]'
                      : 'text-[#737373] hover:text-[#111111]'
                  }`}
                >
                  <Sun className="w-3.5 h-3.5" />
                  Light
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewTheme('dark')}
                  className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-semibold cursor-pointer ${
                    previewTheme === 'dark'
                      ? 'bg-[#111111] text-white'
                      : 'text-[#737373] hover:text-[#111111]'
                  }`}
                >
                  <Moon className="w-3.5 h-3.5" />
                  Dark
                </button>
              </div>
              <button
                type="button"
                onClick={() => {
                  setPreviewKey((k) => k + 1);
                  setEventLog([]);
                }}
                className="text-xs font-semibold text-[#525252] hover:text-[#111111] px-2 py-1 rounded border border-[#D4D4D4] bg-white cursor-pointer"
              >
                Reload Preview
              </button>
            </div>
          </div>

          {/* Interactive Canvas */}
          <div
            className={`min-h-[460px] p-6 flex items-center justify-center transition-colors ${
              previewTheme === 'dark' ? 'bg-[#111111]' : 'bg-[#F5F5F5]'
            }`}
          >
            <div className={`w-full mx-auto transition-all duration-200 ${viewportWidthClass}`}>
              <WidgetRenderer
                key={`${widget.docId}-${widget.type}-${previewKey}`}
                type={widget.type}
                config={config}
                scopeId={widget.publicId}
                previewTheme={previewTheme}
                onEvent={handlePreviewEvent}
              />
            </div>
          </div>

          {/* Live Interaction Event Tester */}
          <div className="border-t border-[#E5E5E5] bg-white px-4 py-3 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-[#111111]">Live Interaction Tester</span>
              <div className="flex items-center gap-3 text-[11px] text-[#737373]">
                <span>Position: {config.style.position}</span>
                <span>Animation: {config.style.animation}</span>
                {eventLog.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setEventLog([])}
                    className="font-semibold text-[#A90706] hover:underline cursor-pointer"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
            {eventLog.length === 0 ? (
              <p className="text-xs text-[#737373]">
                Click buttons, submit forms, toggle FAQs, or test consent controls in the preview above to verify events before publishing.
              </p>
            ) : (
              <div className="max-h-28 overflow-y-auto divide-y divide-[#F0F0F0] rounded-md border border-[#E5E5E5] bg-[#FAFAFA]">
                {eventLog.map((ev) => (
                  <div
                    key={ev.id}
                    className="px-2.5 py-1.5 flex items-center justify-between gap-2 text-[11px]"
                  >
                    <span className="font-mono font-semibold text-[#A90706]">{ev.type}</span>
                    <span className="text-[#333333] truncate flex-1">{ev.detail}</span>
                    <span className="font-mono text-[#737373] shrink-0">{ev.time}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* RIGHT PANEL — Customization Settings */}
        <aside className="rounded-lg border border-[#E5E5E5] bg-white overflow-hidden">
          <div className="grid grid-cols-4 border-b border-[#E5E5E5] bg-[#FAFAFA] text-xs font-semibold">
            {(
              [
                { id: 'content', label: 'Content' },
                { id: 'design', label: 'Design' },
                { id: 'rules', label: 'Rules' },
                { id: 'css', label: 'CSS' },
              ] as Array<{ id: RightTab; label: string }>
            ).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setRightTab(t.id)}
                className={`py-2.5 border-b-2 transition-colors cursor-pointer ${
                  rightTab === t.id
                    ? 'border-[#A90706] text-[#A90706] bg-white'
                    : 'border-transparent text-[#525252] hover:text-[#111111]'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="p-4 max-h-[680px] overflow-y-auto space-y-4">
            {/* TAB 1: CONTENT */}
            {rightTab === 'content' && (
              <div className="space-y-3.5">
                {def.contentFields.map((field) => renderContentField(field))}
              </div>
            )}

            {/* TAB 2: DESIGN */}
            {rightTab === 'design' && (
              <div className="space-y-3.5">
                <div className="space-y-1">
                  <label className="block text-[11px] font-semibold text-[#333333]">Theme Preset</label>
                  <select
                    value={config.style.theme}
                    onChange={(e) => {
                      const nextTheme = e.target.value as 'light' | 'dark' | 'custom';
                      pushConfig((prev) => ({
                        ...prev,
                        style: {
                          ...prev.style,
                          theme: nextTheme,
                          ...(nextTheme === 'dark'
                            ? {
                                backgroundColor: '#171717',
                                textColor: '#F5F5F5',
                                borderColor: '#2E2E2E',
                              }
                            : nextTheme === 'light'
                              ? {
                                  backgroundColor: '#FFFFFF',
                                  textColor: '#111111',
                                  borderColor: '#E5E5E5',
                                }
                              : {}),
                        },
                      }));
                    }}
                    className="w-full rounded-md border border-[#D4D4D4] bg-white px-2.5 py-1.5 text-xs"
                  >
                    <option value="light">Light</option>
                    <option value="dark">Dark</option>
                    <option value="custom">Custom Colors</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  {(
                    [
                      ['backgroundColor', 'Background'],
                      ['textColor', 'Text Color'],
                      ['accentColor', 'Accent / Button'],
                      ['buttonTextColor', 'Button Text'],
                      ['borderColor', 'Border Color'],
                    ] as const
                  ).map(([key, label]) => (
                    <div key={key} className="space-y-1">
                      <label className="block text-[11px] font-semibold text-[#333333]">{label}</label>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="color"
                          value={config.style[key]}
                          onChange={(e) =>
                            pushConfig((prev) => ({
                              ...prev,
                              style: { ...prev.style, [key]: e.target.value },
                            }))
                          }
                          className="h-7 w-8 rounded border border-[#D4D4D4] cursor-pointer"
                        />
                        <input
                          type="text"
                          value={config.style[key]}
                          onChange={(e) =>
                            pushConfig((prev) => ({
                              ...prev,
                              style: { ...prev.style, [key]: e.target.value },
                            }))
                          }
                          className="w-full rounded border border-[#D4D4D4] px-2 py-1 font-mono text-[11px]"
                        />
                      </div>
                    </div>
                  ))}
                </div>

                <div className="space-y-1">
                  <label className="block text-[11px] font-semibold text-[#333333]">Typography</label>
                  <select
                    value={config.style.fontFamily}
                    onChange={(e) =>
                      pushConfig((prev) => ({
                        ...prev,
                        style: { ...prev.style, fontFamily: e.target.value },
                      }))
                    }
                    className="w-full rounded-md border border-[#D4D4D4] bg-white px-2.5 py-1.5 text-xs"
                  >
                    <option value="Inter, system-ui, sans-serif">Inter / System Sans</option>
                    <option value="Georgia, serif">Editorial Serif</option>
                    <option value="'JetBrains Mono', ui-monospace, monospace">Monospace</option>
                    <option value="system-ui, -apple-system, sans-serif">Native System UI</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div className="space-y-1">
                    <label className="block text-[11px] font-semibold text-[#333333]">
                      Font Size ({config.style.fontSizePx}px)
                    </label>
                    <input
                      type="range"
                      min={11}
                      max={22}
                      value={config.style.fontSizePx}
                      onChange={(e) =>
                        pushConfig((prev) => ({
                          ...prev,
                          style: { ...prev.style, fontSizePx: Number(e.target.value) },
                        }))
                      }
                      className="w-full accent-[#A90706]"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-[11px] font-semibold text-[#333333]">
                      Border Radius ({config.style.borderRadiusPx}px)
                    </label>
                    <input
                      type="range"
                      min={0}
                      max={32}
                      value={config.style.borderRadiusPx}
                      onChange={(e) =>
                        pushConfig((prev) => ({
                          ...prev,
                          style: { ...prev.style, borderRadiusPx: Number(e.target.value) },
                        }))
                      }
                      className="w-full accent-[#A90706]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div className="space-y-1">
                    <label className="block text-[11px] font-semibold text-[#333333]">
                      Padding ({config.style.paddingPx}px)
                    </label>
                    <input
                      type="range"
                      min={6}
                      max={40}
                      value={config.style.paddingPx}
                      onChange={(e) =>
                        pushConfig((prev) => ({
                          ...prev,
                          style: { ...prev.style, paddingPx: Number(e.target.value) },
                        }))
                      }
                      className="w-full accent-[#A90706]"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-[11px] font-semibold text-[#333333]">
                      Margin ({config.style.marginPx}px)
                    </label>
                    <input
                      type="range"
                      min={0}
                      max={40}
                      value={config.style.marginPx}
                      onChange={(e) =>
                        pushConfig((prev) => ({
                          ...prev,
                          style: { ...prev.style, marginPx: Number(e.target.value) },
                        }))
                      }
                      className="w-full accent-[#A90706]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div className="space-y-1">
                    <label className="block text-[11px] font-semibold text-[#333333]">Max Width (px)</label>
                    <input
                      type="number"
                      min={220}
                      max={1400}
                      value={config.style.maxWidthPx}
                      onChange={(e) =>
                        pushConfig((prev) => ({
                          ...prev,
                          style: { ...prev.style, maxWidthPx: Number(e.target.value) || 640 },
                        }))
                      }
                      className="w-full rounded-md border border-[#D4D4D4] px-2.5 py-1.5 text-xs tabular-nums"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-[11px] font-semibold text-[#333333]">Height</label>
                    <input
                      type="text"
                      value={config.style.height}
                      placeholder="auto or 400px"
                      onChange={(e) =>
                        pushConfig((prev) => ({
                          ...prev,
                          style: { ...prev.style, height: e.target.value || 'auto' },
                        }))
                      }
                      className="w-full rounded-md border border-[#D4D4D4] px-2.5 py-1.5 text-xs"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div className="space-y-1">
                    <label className="block text-[11px] font-semibold text-[#333333]">Shadow</label>
                    <select
                      value={config.style.shadow}
                      onChange={(e) =>
                        pushConfig((prev) => ({
                          ...prev,
                          style: { ...prev.style, shadow: e.target.value as any },
                        }))
                      }
                      className="w-full rounded-md border border-[#D4D4D4] bg-white px-2.5 py-1.5 text-xs"
                    >
                      <option value="none">None</option>
                      <option value="sm">Subtle</option>
                      <option value="md">Medium</option>
                      <option value="lg">Elevated</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="block text-[11px] font-semibold text-[#333333]">Alignment</label>
                    <select
                      value={config.style.alignment}
                      onChange={(e) =>
                        pushConfig((prev) => ({
                          ...prev,
                          style: { ...prev.style, alignment: e.target.value as any },
                        }))
                      }
                      className="w-full rounded-md border border-[#D4D4D4] bg-white px-2.5 py-1.5 text-xs"
                    >
                      <option value="left">Left</option>
                      <option value="center">Center</option>
                      <option value="right">Right</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div className="space-y-1">
                    <label className="block text-[11px] font-semibold text-[#333333]">Embed Position</label>
                    <select
                      value={config.style.position}
                      onChange={(e) =>
                        pushConfig((prev) => ({
                          ...prev,
                          style: { ...prev.style, position: e.target.value as any },
                        }))
                      }
                      className="w-full rounded-md border border-[#D4D4D4] bg-white px-2.5 py-1.5 text-xs"
                    >
                      <option value="inline">Inline</option>
                      <option value="top">Top Bar</option>
                      <option value="bottom">Bottom Bar</option>
                      <option value="bottom-right">Bottom Right</option>
                      <option value="bottom-left">Bottom Left</option>
                      <option value="top-right">Top Right</option>
                      <option value="top-left">Top Left</option>
                      <option value="center">Center Modal</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="block text-[11px] font-semibold text-[#333333]">Animation</label>
                    <select
                      value={config.style.animation}
                      onChange={(e) =>
                        pushConfig((prev) => ({
                          ...prev,
                          style: { ...prev.style, animation: e.target.value as any },
                        }))
                      }
                      className="w-full rounded-md border border-[#D4D4D4] bg-white px-2.5 py-1.5 text-xs"
                    >
                      <option value="none">None</option>
                      <option value="fade">Fade</option>
                      <option value="slide">Slide</option>
                      <option value="scale">Scale</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 3: VISIBILITY & TRIGGER RULES */}
            {rightTab === 'rules' && (
              <div className="space-y-3.5">
                <div className="space-y-1.5">
                  <div className="text-[11px] font-semibold text-[#333333]">Responsive Visibility</div>
                  {(
                    [
                      ['showOnDesktop', 'Show on Desktop'],
                      ['showOnTablet', 'Show on Tablet'],
                      ['showOnMobile', 'Show on Mobile'],
                      ['dismissible', 'Allow Visitors to Dismiss'],
                    ] as const
                  ).map(([key, label]) => (
                    <label
                      key={key}
                      className="flex items-center justify-between rounded-md border border-[#E5E5E5] bg-[#FAFAFA] px-3 py-2 text-xs cursor-pointer"
                    >
                      <span>{label}</span>
                      <input
                        type="checkbox"
                        checked={Boolean(config.visibility[key])}
                        onChange={(e) =>
                          pushConfig((prev) => ({
                            ...prev,
                            visibility: { ...prev.visibility, [key]: e.target.checked },
                          }))
                        }
                        className="h-4 w-4 accent-[#A90706]"
                      />
                    </label>
                  ))}
                </div>

                <div className="space-y-1">
                  <label className="block text-[11px] font-semibold text-[#333333]">Display Frequency</label>
                  <select
                    value={config.visibility.displayFrequency}
                    onChange={(e) =>
                      pushConfig((prev) => ({
                        ...prev,
                        visibility: { ...prev.visibility, displayFrequency: e.target.value as any },
                      }))
                    }
                    className="w-full rounded-md border border-[#D4D4D4] bg-white px-2.5 py-1.5 text-xs"
                  >
                    <option value="always">Every Page Load</option>
                    <option value="once_per_session">Once Per Session</option>
                    <option value="once_per_day">Once Per Day</option>
                    <option value="once_ever">Once Per Visitor</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div className="space-y-1">
                    <label className="block text-[11px] font-semibold text-[#333333]">
                      Trigger Delay (sec)
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={120}
                      value={config.visibility.triggerDelaySec}
                      onChange={(e) =>
                        pushConfig((prev) => ({
                          ...prev,
                          visibility: {
                            ...prev.visibility,
                            triggerDelaySec: Math.max(0, Number(e.target.value) || 0),
                          },
                        }))
                      }
                      className="w-full rounded-md border border-[#D4D4D4] px-2.5 py-1.5 text-xs tabular-nums"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-[11px] font-semibold text-[#333333]">
                      Scroll Trigger (%)
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={config.visibility.scrollTriggerPct}
                      onChange={(e) =>
                        pushConfig((prev) => ({
                          ...prev,
                          visibility: {
                            ...prev.visibility,
                            scrollTriggerPct: Math.min(100, Math.max(0, Number(e.target.value) || 0)),
                          },
                        }))
                      }
                      className="w-full rounded-md border border-[#D4D4D4] px-2.5 py-1.5 text-xs tabular-nums"
                    />
                  </div>
                </div>

                <label className="flex items-center justify-between rounded-md border border-[#E5E5E5] bg-[#FAFAFA] px-3 py-2 text-xs cursor-pointer">
                  <span>Trigger on Exit Intent (Mouse Leave Top)</span>
                  <input
                    type="checkbox"
                    checked={Boolean(config.visibility.exitIntent)}
                    onChange={(e) =>
                      pushConfig((prev) => ({
                        ...prev,
                        visibility: { ...prev.visibility, exitIntent: e.target.checked },
                      }))
                    }
                    className="h-4 w-4 accent-[#A90706]"
                  />
                </label>

                <div className="grid grid-cols-2 gap-2.5">
                  <div className="space-y-1">
                    <label className="block text-[11px] font-semibold text-[#333333]">Start Date</label>
                    <input
                      type="date"
                      value={config.visibility.startDate}
                      onChange={(e) =>
                        pushConfig((prev) => ({
                          ...prev,
                          visibility: { ...prev.visibility, startDate: e.target.value },
                        }))
                      }
                      className="w-full rounded-md border border-[#D4D4D4] px-2 py-1.5 text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-[11px] font-semibold text-[#333333]">End Date</label>
                    <input
                      type="date"
                      value={config.visibility.endDate}
                      onChange={(e) =>
                        pushConfig((prev) => ({
                          ...prev,
                          visibility: { ...prev.visibility, endDate: e.target.value },
                        }))
                      }
                      className="w-full rounded-md border border-[#D4D4D4] px-2 py-1.5 text-xs"
                    />
                  </div>
                </div>

                <div className="pt-2 border-t border-[#E5E5E5]">
                  <label className="flex items-center justify-between gap-2 rounded-md border border-[#E5E5E5] bg-[#FAFAFA] px-3 py-2.5 text-xs cursor-pointer">
                    <div>
                      <div className="font-semibold text-[#111111]">Hide BrosDev Branding</div>
                      <div className="text-[11px] text-[#737373]">
                        {canRemoveBranding ? 'Included on your plan' : 'Requires Starter+ plan'}
                      </div>
                    </div>
                    {canRemoveBranding ? (
                      <input
                        type="checkbox"
                        checked={!config.showBranding}
                        onChange={(e) =>
                          pushConfig((prev) => ({ ...prev, showBranding: !e.target.checked }))
                        }
                        className="h-4 w-4 accent-[#A90706]"
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => onRequestUpgrade('removeBranding')}
                        className="inline-flex items-center gap-1 rounded border border-[#D4D4D4] bg-white px-2 py-1 text-[11px] font-semibold text-[#A90706] cursor-pointer"
                      >
                        <Lock className="w-3 h-3" /> Upgrade
                      </button>
                    )}
                  </label>
                </div>
              </div>
            )}

            {/* TAB 4: SCOPED CUSTOM CSS */}
            {rightTab === 'css' && (
              <div className="space-y-3">
                {!canCustomCss ? (
                  <div className="rounded-lg border border-dashed border-[#D4D4D4] bg-[#FAFAFA] p-4 space-y-3 text-center">
                    <Lock className="w-5 h-5 text-[#A90706] mx-auto" />
                    <div className="text-xs font-bold text-[#111111]">
                      Scoped Custom CSS (Pro &amp; Higher)
                    </div>
                    <p className="text-xs text-[#525252]">
                      Add custom scoped CSS rules to fine-tune typography, hover transitions, and borders safely inside the Shadow DOM.
                    </p>
                    <button
                      type="button"
                      onClick={() => onRequestUpgrade('widgetCustomCss')}
                      className="inline-flex items-center gap-1.5 rounded-md bg-[#A90706] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#8C0605] cursor-pointer"
                    >
                      Unlock Custom CSS
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-semibold text-[#333333]">
                        Scoped Custom CSS (.bd-widget-card)
                      </span>
                      {config.customCss && (
                        <button
                          type="button"
                          onClick={() => pushConfig((prev) => ({ ...prev, customCss: '' }))}
                          className="text-[11px] font-semibold text-[#A90706] hover:underline cursor-pointer"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                    <textarea
                      rows={10}
                      value={config.customCss}
                      onChange={(e) =>
                        pushConfig((prev) => ({ ...prev, customCss: e.target.value }))
                      }
                      placeholder={`.bd-widget-card {\n  letter-spacing: -0.01em;\n}`}
                      className="w-full rounded-md border border-[#D4D4D4] bg-[#111111] text-[#F5F5F5] p-3 font-mono text-xs leading-relaxed focus:border-[#A90706] focus:outline-none"
                    />
                    {!cssValidation.valid ? (
                      <div className="rounded-md border border-[#A90706]/30 bg-[#FEF2F2] p-2.5 text-xs text-[#A90706] space-y-1">
                        {cssValidation.errors.map((err, i) => (
                          <div key={i}>• {err}</div>
                        ))}
                      </div>
                    ) : config.customCss.trim() ? (
                      <div className="flex items-center gap-1.5 text-xs text-[#15803D]">
                        <Check className="w-3.5 h-3.5" /> Validated &amp; safely scoped to this widget.
                      </div>
                    ) : (
                      <p className="text-[11px] text-[#737373]">
                        External @import, javascript: URLs, and script tags are blocked automatically.
                      </p>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </aside>
      </div>

      {/* Embed & Hosted URL Modal */}
      {showEmbedModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-[#F5F5F5] border border-[#E5E5E5] rounded-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-[#E5E5E5] px-5 py-3.5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Globe className="w-4 h-4 text-[#A90706]" />
                <span className="text-sm font-bold text-[#111111]">
                  Publish &amp; Embed · {widget.name}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShowEmbedModal(false)}
                className="p-1 text-[#525252] hover:text-[#111111] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5">
              <WidgetEmbedPanel
                widget={widget}
                onOpenDomains={() => {
                  setShowEmbedModal(false);
                  onOpenDomains(widget.publicId);
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
