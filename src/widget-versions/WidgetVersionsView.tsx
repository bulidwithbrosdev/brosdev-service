import React, { useEffect, useState } from 'react';
import { Copy, History, RotateCcw } from 'lucide-react';
import {
  createWidget,
  listWidgetVersions,
  restoreWidgetVersion,
} from '../widget-api/widgetsFirestore';
import { hasPlanFeature } from '../lib/planLimits';
import type { WorkspaceMe } from '../types';
import type { WidgetRecord, WidgetVersionRecord } from '../widgets/types';

export const WidgetVersionsView: React.FC<{
  workspace: WorkspaceMe;
  widgets: WidgetRecord[];
  onWidgetUpdated: (updated: WidgetRecord) => void;
  onOpenBuilder: (widget: WidgetRecord) => void;
}> = ({ workspace, widgets, onWidgetUpdated, onOpenBuilder }) => {
  const [selectedWidgetId, setSelectedWidgetId] = useState<number>(widgets[0]?.id || 0);
  const [versions, setVersions] = useState<WidgetVersionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  const canRemoveBranding = hasPlanFeature(workspace, 'removeBranding');

  useEffect(() => {
    if (!selectedWidgetId && widgets[0]) {
      setSelectedWidgetId(widgets[0].id);
    }
  }, [widgets, selectedWidgetId]);

  const selectedWidget = widgets.find((w) => w.id === selectedWidgetId) || null;

  const loadVersions = async (widgetId: number) => {
    if (!widgetId) {
      setVersions([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const list = await listWidgetVersions(widgetId);
      setVersions(list);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadVersions(selectedWidgetId);
  }, [selectedWidgetId]);

  const handleRestore = async (ver: WidgetVersionRecord) => {
    if (!selectedWidget) return;
    setBusyId(ver.docId);
    setFeedback(null);
    try {
      const updated = await restoreWidgetVersion(selectedWidget, ver);
      onWidgetUpdated(updated);
      await loadVersions(selectedWidget.id);
      setFeedback({
        kind: 'success',
        text: `Restored v${ver.version} into your draft (v${updated.version}). Live published embed was not disrupted until you re-publish.`,
      });
    } catch (err: any) {
      setFeedback({ kind: 'error', text: err.message || 'Restore failed.' });
    } finally {
      setBusyId(null);
    }
  };

  const handleDuplicateVersion = async (ver: WidgetVersionRecord) => {
    if (!selectedWidget) return;
    setBusyId(`dup_${ver.docId}`);
    setFeedback(null);
    try {
      const cloned = await createWidget({
        type: selectedWidget.type,
        name: `${selectedWidget.name} (from v${ver.version})`,
        projectKey: selectedWidget.projectKey,
        configuration: ver.configuration,
        allowRemoveBranding: canRemoveBranding,
      });
      onWidgetUpdated(cloned);
      onOpenBuilder(cloned);
    } catch (err: any) {
      setFeedback({ kind: 'error', text: err.message || 'Could not duplicate version.' });
    } finally {
      setBusyId(null);
    }
  };

  if (widgets.length === 0) {
    return (
      <div className="rounded-lg border border-[#E5E5E5] bg-white p-10 text-center space-y-2">
        <History className="w-7 h-7 text-[#737373] mx-auto" />
        <div className="text-sm font-bold text-[#111111]">No version history yet</div>
        <p className="text-xs text-[#525252]">
          Publish a widget from the Visual Builder to record immutable version snapshots.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-[#E5E5E5] bg-white p-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-[#111111]">Component Versions &amp; Rollback</h2>
          <p className="text-xs text-[#525252] mt-0.5">
            Every publish creates an immutable snapshot. Restoring updates your draft safely without breaking live embeds.
          </p>
        </div>
        <select
          value={selectedWidgetId}
          onChange={(e) => setSelectedWidgetId(Number(e.target.value))}
          className="rounded-md border border-[#D4D4D4] bg-white px-3 py-2 text-xs font-semibold text-[#111111] min-w-[240px]"
        >
          {widgets.map((w) => (
            <option key={w.docId} value={w.id}>
              {w.name} (Draft v{w.version} · Live v{w.publishedVersion})
            </option>
          ))}
        </select>
      </div>

      {feedback && (
        <div
          className={`rounded-lg border px-4 py-2.5 text-xs ${
            feedback.kind === 'error'
              ? 'border-[#A90706]/30 bg-[#FEF2F2] text-[#A90706]'
              : 'border-[#15803D]/30 bg-[#F0FDF4] text-[#166534]'
          }`}
        >
          {feedback.text}
        </div>
      )}

      <div className="rounded-lg border border-[#E5E5E5] bg-white overflow-hidden">
        <div className="px-4 py-3 border-b border-[#E5E5E5] flex items-center justify-between text-xs">
          <span className="font-bold text-[#111111]">
            Saved Snapshots ({versions.length})
          </span>
          {selectedWidget && (
            <button
              type="button"
              onClick={() => onOpenBuilder(selectedWidget)}
              className="font-semibold text-[#A90706] hover:underline cursor-pointer"
            >
              Open current draft in Builder →
            </button>
          )}
        </div>

        {loading ? (
          <div className="p-8 text-center text-xs text-[#737373]">Loading version snapshots...</div>
        ) : versions.length === 0 ? (
          <div className="p-8 text-center text-xs text-[#737373]">
            No published snapshots for this component yet. Publish once in the Widget Builder to create v1.
          </div>
        ) : (
          <div className="divide-y divide-[#F0F0F0]">
            {versions.map((ver) => {
              const isLive = selectedWidget?.publishedVersion === ver.version && ver.action === 'publish';
              return (
                <div
                  key={ver.docId}
                  className="p-4 flex flex-wrap items-center justify-between gap-3 hover:bg-[#FAFAFA]"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="font-mono font-bold text-[#111111]">v{ver.version}</span>
                      <span className="font-semibold text-[#111111]">{ver.label}</span>
                      {isLive && (
                        <span className="font-semibold text-[#15803D]">· Active Live Embed</span>
                      )}
                    </div>
                    <div className="text-[11px] text-[#737373] font-mono">
                      {new Date(ver.createdAt).toLocaleString()} · Schema v
                      {ver.configuration?.schemaVersion || 1} · Action: {ver.action}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={busyId === ver.docId}
                      onClick={() => void handleRestore(ver)}
                      className="inline-flex items-center gap-1.5 rounded-md border border-[#111111] bg-white px-3 py-1.5 text-xs font-semibold text-[#111111] hover:bg-[#111111] hover:text-white transition-colors cursor-pointer disabled:opacity-50"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      {busyId === ver.docId ? 'Restoring...' : 'Restore to Draft'}
                    </button>
                    <button
                      type="button"
                      disabled={busyId === `dup_${ver.docId}`}
                      onClick={() => void handleDuplicateVersion(ver)}
                      className="inline-flex items-center gap-1.5 rounded-md border border-[#D4D4D4] bg-white px-3 py-1.5 text-xs font-semibold text-[#525252] hover:text-[#111111] cursor-pointer disabled:opacity-50"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      Duplicate
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
