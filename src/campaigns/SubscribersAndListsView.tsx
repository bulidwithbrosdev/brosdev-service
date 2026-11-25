import React, { useMemo, useState } from 'react';
import {
  Ban,
  CheckCircle2,
  Download,
  Filter,
  FolderPlus,
  Lock,
  Plus,
  Search,
  ShieldAlert,
  Trash2,
  Upload,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import type { WorkspaceMe } from '../types';
import type { PlanLockKey } from '../lib/planLimits';
import { hasPlanFeature } from '../lib/planLimits';
import { escapeCsvCell, parseSubscribersCsv } from './emailRenderer';
import {
  addEmailSuppression,
  createEmailList,
  deleteEmailList,
  deleteEmailSegment,
  deleteEmailSubscriber,
  filterSubscribersBySegment,
  isValidEmailFormat,
  removeEmailSuppression,
  saveEmailSegment,
  updateEmailList,
  updateEmailSubscriber,
  upsertEmailSubscriber,
} from './campaignsFirestore';
import type {
  EmailListRecord,
  EmailSegmentRecord,
  EmailSubscriberRecord,
  EmailSubscriberStatus,
  EmailSuppressionRecord,
  SegmentRule,
  SegmentRuleField,
  SegmentRuleOperator,
} from './types';

interface Props {
  workspace: WorkspaceMe;
  initialSubTab?: 'subscribers' | 'lists' | 'segments' | 'suppressions';
  lists: EmailListRecord[];
  subscribers: EmailSubscriberRecord[];
  segments: EmailSegmentRecord[];
  suppressions: EmailSuppressionRecord[];
  onRefresh: () => Promise<void>;
  onRequireUpgrade: (lockKey: PlanLockKey) => void;
}

export function SubscribersAndListsView({
  workspace,
  initialSubTab = 'subscribers',
  lists,
  subscribers,
  segments,
  suppressions,
  onRefresh,
  onRequireUpgrade,
}: Props) {
  const [tab, setTab] = useState<'subscribers' | 'lists' | 'segments' | 'suppressions'>(
    initialSubTab
  );
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [listFilter, setListFilter] = useState<string>('all');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  // Add subscriber modal
  const [showAddSub, setShowAddSub] = useState(false);
  const [subEmail, setSubEmail] = useState('');
  const [subFirst, setSubFirst] = useState('');
  const [subLast, setSubLast] = useState('');
  const [subTags, setSubTags] = useState('');
  const [subLists, setSubLists] = useState<string[]>([]);
  const [subConsent, setSubConsent] = useState(false);

  // CSV Import modal
  const [showImport, setShowImport] = useState(false);
  const [csvRaw, setCsvRaw] = useState('');
  const [importListId, setImportListId] = useState('');
  const [importConsent, setImportConsent] = useState(false);
  const [importSummary, setImportSummary] = useState('');

  // Selected subscriber profile drawer
  const [activeSub, setActiveSub] = useState<EmailSubscriberRecord | null>(null);
  const [editTags, setEditTags] = useState('');

  // New List state
  const [newListName, setNewListName] = useState('');
  const [newListDesc, setNewListDesc] = useState('');
  const [newListDoubleOptIn, setNewListDoubleOptIn] = useState(true);

  // Segment editor state
  const [segName, setSegName] = useState('');
  const [segDesc, setSegDesc] = useState('');
  const [segMatch, setSegMatch] = useState<'all' | 'any'>('all');
  const [segRules, setSegRules] = useState<SegmentRule[]>([
    { id: 'r1', field: 'status', operator: 'equals', value: 'subscribed' },
  ]);

  // Manual suppression
  const [supEmail, setSupEmail] = useState('');
  const [supReason, setSupReason] = useState<EmailSuppressionRecord['reason']>('manual');

  const maxLists = Math.max(1, workspace.limits.maxNewsletterLists || 1);
  const maxSubscribers = Math.max(500, workspace.limits.maxSubscribers || 500);
  const canSegment = hasPlanFeature(workspace, 'campaignSegmentation');

  const filteredSubs = useMemo(() => {
    const q = search.trim().toLowerCase();
    return subscribers.filter((s) => {
      if (statusFilter !== 'all' && s.status !== statusFilter) return false;
      if (listFilter !== 'all' && !s.listIds.includes(listFilter)) return false;
      if (!q) return true;
      return (
        s.email.toLowerCase().includes(q) ||
        s.firstName.toLowerCase().includes(q) ||
        s.lastName.toLowerCase().includes(q) ||
        s.tags.some((t) => t.toLowerCase().includes(q))
      );
    });
  }, [subscribers, search, statusFilter, listFilter]);

  const listNameById = useMemo(
    () => new Map(lists.map((l) => [l.id, l.name])),
    [lists]
  );

  const previewSegmentCount = useMemo(
    () => filterSubscribersBySegment(subscribers, { matchType: segMatch, rules: segRules }).length,
    [subscribers, segMatch, segRules]
  );

  async function handleAddSubscriber(e: React.FormEvent) {
    e.preventDefault();
    if (subscribers.length >= maxSubscribers) {
      setShowAddSub(false);
      onRequireUpgrade('campaignQuotaLimit');
      return;
    }
    setBusy(true);
    setFeedback(null);
    try {
      const res = await upsertEmailSubscriber({
        email: subEmail,
        firstName: subFirst,
        lastName: subLast,
        listIds: subLists,
        tags: subTags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
        source: 'manual',
        consentConfirmed: subConsent,
      });
      setShowAddSub(false);
      setSubEmail('');
      setSubFirst('');
      setSubLast('');
      setSubTags('');
      setSubConsent(false);
      await onRefresh();
      setFeedback({
        kind: 'ok',
        text: res.isNew
          ? `Added subscriber ${res.subscriber.email}.`
          : `Updated existing subscriber ${res.subscriber.email}.`,
      });
    } catch (err) {
      setFeedback({ kind: 'err', text: err instanceof Error ? err.message : 'Failed to add subscriber.' });
    } finally {
      setBusy(false);
    }
  }

  async function handleCsvImport(e: React.FormEvent) {
    e.preventDefault();
    if (!importConsent) {
      setFeedback({
        kind: 'err',
        text: 'You must confirm explicit opt-in permission before importing subscribers.',
      });
      return;
    }
    const parsed = parseSubscribersCsv(csvRaw, 500);
    if (parsed.rows.length === 0) {
      setFeedback({ kind: 'err', text: 'No valid CSV rows found. Include a header row with an "email" column.' });
      return;
    }
    if (subscribers.length + parsed.rows.length > maxSubscribers) {
      onRequireUpgrade('campaignQuotaLimit');
      return;
    }

    setBusy(true);
    setFeedback(null);
    let added = 0;
    let updated = 0;
    let skipped = 0;
    try {
      for (const row of parsed.rows) {
        const emailKey = Object.keys(row).find((k) => k.toLowerCase().includes('email'));
        const emailVal = emailKey ? row[emailKey] : '';
        if (!isValidEmailFormat(emailVal)) {
          skipped += 1;
          continue;
        }
        const firstKey = Object.keys(row).find(
          (k) => k.toLowerCase() === 'first_name' || k.toLowerCase() === 'firstname' || k.toLowerCase() === 'name'
        );
        const lastKey = Object.keys(row).find(
          (k) => k.toLowerCase() === 'last_name' || k.toLowerCase() === 'lastname'
        );
        const tagsKey = Object.keys(row).find((k) => k.toLowerCase().includes('tag'));

        const res = await upsertEmailSubscriber({
          email: emailVal,
          firstName: firstKey ? row[firstKey] : '',
          lastName: lastKey ? row[lastKey] : '',
          listIds: importListId ? [importListId] : [],
          tags: tagsKey
            ? row[tagsKey]
                .split(/[;|,]/)
                .map((x) => x.trim())
                .filter(Boolean)
            : [],
          source: 'csv_import',
          consentConfirmed: true,
          consentNote: 'CSV import with explicit opt-in attestation',
        });
        if (res.isNew) added += 1;
        else updated += 1;
      }
      setImportSummary(`Imported ${added} new, updated ${updated}, skipped ${skipped} invalid rows.`);
      await onRefresh();
      setFeedback({
        kind: 'ok',
        text: `CSV import complete: ${added} added, ${updated} updated, ${skipped} skipped.`,
      });
      setShowImport(false);
      setCsvRaw('');
      setImportConsent(false);
    } catch (err) {
      setFeedback({ kind: 'err', text: err instanceof Error ? err.message : 'CSV import failed.' });
    } finally {
      setBusy(false);
    }
  }

  function handleExportCsv() {
    const header = ['email', 'first_name', 'last_name', 'status', 'lists', 'tags', 'source', 'subscribed_at'];
    const lines = [
      header.join(','),
      ...filteredSubs.map((s) =>
        [
          escapeCsvCell(s.email),
          escapeCsvCell(s.firstName),
          escapeCsvCell(s.lastName),
          escapeCsvCell(s.status),
          escapeCsvCell(s.listIds.map((id) => listNameById.get(id) || id).join('; ')),
          escapeCsvCell(s.tags.join('; ')),
          escapeCsvCell(s.source),
          escapeCsvCell(s.subscribedAt),
        ].join(',')
      ),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `brosdev-subscribers-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleCreateList(e: React.FormEvent) {
    e.preventDefault();
    if (lists.length >= maxLists) {
      onRequireUpgrade('campaignQuotaLimit');
      return;
    }
    setBusy(true);
    setFeedback(null);
    try {
      await createEmailList({
        name: newListName,
        description: newListDesc,
        doubleOptIn: newListDoubleOptIn,
      });
      setNewListName('');
      setNewListDesc('');
      await onRefresh();
      setFeedback({ kind: 'ok', text: 'Audience list created.' });
    } catch (err) {
      setFeedback({ kind: 'err', text: err instanceof Error ? err.message : 'Failed to create list.' });
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveSegment(e: React.FormEvent) {
    e.preventDefault();
    if (!canSegment) {
      onRequireUpgrade('campaignSegmentation');
      return;
    }
    setBusy(true);
    setFeedback(null);
    try {
      await saveEmailSegment({
        name: segName,
        description: segDesc,
        matchType: segMatch,
        rules: segRules,
      });
      setSegName('');
      setSegDesc('');
      await onRefresh();
      setFeedback({ kind: 'ok', text: 'Dynamic segment saved.' });
    } catch (err) {
      setFeedback({ kind: 'err', text: err instanceof Error ? err.message : 'Failed to save segment.' });
    } finally {
      setBusy(false);
    }
  }

  async function handleAddSuppression(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setFeedback(null);
    try {
      await addEmailSuppression({ email: supEmail, reason: supReason, source: 'dashboard_manual' });
      const matchingSub = subscribers.find(
        (s) => s.email.toLowerCase() === supEmail.trim().toLowerCase()
      );
      if (matchingSub) {
        await updateEmailSubscriber(matchingSub.id, { status: 'suppressed' });
      }
      setSupEmail('');
      await onRefresh();
      setFeedback({ kind: 'ok', text: 'Email added to global marketing suppression list.' });
    } catch (err) {
      setFeedback({ kind: 'err', text: err instanceof Error ? err.message : 'Failed to suppress email.' });
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveSubscriberProfile() {
    if (!activeSub) return;
    setBusy(true);
    try {
      await updateEmailSubscriber(activeSub.id, {
        firstName: activeSub.firstName,
        lastName: activeSub.lastName,
        status: activeSub.status,
        listIds: activeSub.listIds,
        tags: editTags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
      });
      if (activeSub.status === 'unsubscribed' || activeSub.status === 'suppressed') {
        await addEmailSuppression({
          email: activeSub.email,
          reason: activeSub.status === 'unsubscribed' ? 'unsubscribed' : 'manual',
          source: 'profile_update',
        });
      }
      setActiveSub(null);
      await onRefresh();
      setFeedback({ kind: 'ok', text: 'Subscriber profile updated.' });
    } catch (err) {
      setFeedback({ kind: 'err', text: err instanceof Error ? err.message : 'Update failed.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Sub-navigation bar */}
      <div className="bg-white border border-neutral-200 rounded-xl px-4 py-2.5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          {(
            [
              { id: 'subscribers', label: `Subscribers (${subscribers.length})` },
              { id: 'lists', label: `Audience Lists (${lists.length}/${maxLists})` },
              { id: 'segments', label: `Segments (${segments.length})` },
              { id: 'suppressions', label: `Suppressions (${suppressions.length})` },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                tab === item.id
                  ? 'bg-[#111111] text-white'
                  : 'text-neutral-600 hover:bg-neutral-100'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowImport(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border border-neutral-200 bg-white hover:bg-neutral-50 rounded-lg"
          >
            <Upload className="w-3.5 h-3.5" /> Import CSV
          </button>
          <button
            type="button"
            onClick={handleExportCsv}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border border-neutral-200 bg-white hover:bg-neutral-50 rounded-lg"
          >
            <Download className="w-3.5 h-3.5" /> Export CSV
          </button>
          <button
            type="button"
            onClick={() => setShowAddSub(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-[#A90706] hover:bg-[#8E0605] text-white rounded-lg"
          >
            <UserPlus className="w-3.5 h-3.5" /> Add Subscriber
          </button>
        </div>
      </div>

      {feedback && (
        <div
          className={`px-4 py-2.5 rounded-xl border text-xs font-medium flex items-center gap-2 ${
            feedback.kind === 'ok'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-red-50 border-red-200 text-[#A90706]'
          }`}
        >
          {feedback.kind === 'ok' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          ) : (
            <ShieldAlert className="w-4 h-4 shrink-0" />
          )}
          <span>{feedback.text}</span>
        </div>
      )}

      {/* SUBSCRIBERS TAB */}
      {tab === 'subscribers' && (
        <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
          <div className="p-3.5 border-b border-neutral-200 flex flex-wrap items-center gap-2.5">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search email, name, or tag..."
                className="w-full pl-8 pr-3 py-1.5 text-xs border border-neutral-200 rounded-lg"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="text-xs border border-neutral-200 rounded-lg px-2.5 py-1.5"
            >
              <option value="all">All Statuses</option>
              <option value="subscribed">Subscribed</option>
              <option value="pending">Pending Confirmation</option>
              <option value="unsubscribed">Unsubscribed</option>
              <option value="bounced">Bounced</option>
              <option value="complained">Complained</option>
              <option value="suppressed">Suppressed</option>
            </select>
            <select
              value={listFilter}
              onChange={(e) => setListFilter(e.target.value)}
              className="text-xs border border-neutral-200 rounded-lg px-2.5 py-1.5"
            >
              <option value="all">All Lists</option>
              {lists.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
            <span className="text-xs font-mono text-neutral-500 tabular-nums">
              {subscribers.length.toLocaleString()} / {maxSubscribers.toLocaleString()} plan cap
            </span>
          </div>

          {filteredSubs.length === 0 ? (
            <div className="p-10 text-center space-y-2">
              <Users className="w-8 h-8 text-neutral-300 mx-auto" />
              <p className="text-sm font-semibold text-[#111111]">No subscribers match your filter</p>
              <p className="text-xs text-neutral-500">
                Add consented contacts manually or import a CSV with opt-in confirmation.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-neutral-50 border-b border-neutral-200 text-neutral-500 uppercase text-[11px]">
                    <th className="py-2.5 px-4 font-semibold">Email &amp; Name</th>
                    <th className="py-2.5 px-4 font-semibold">Status</th>
                    <th className="py-2.5 px-4 font-semibold">Lists</th>
                    <th className="py-2.5 px-4 font-semibold">Tags</th>
                    <th className="py-2.5 px-4 font-semibold">Source</th>
                    <th className="py-2.5 px-4 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {filteredSubs.map((sub) => (
                    <tr key={sub.id} className="hover:bg-neutral-50">
                      <td className="py-2.5 px-4">
                        <div className="font-mono font-medium text-[#111111]">{sub.email}</div>
                        {(sub.firstName || sub.lastName) && (
                          <div className="text-[11px] text-neutral-500">
                            {sub.firstName} {sub.lastName}
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 px-4">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-[11px] font-semibold capitalize ${
                            sub.status === 'subscribed'
                              ? 'bg-emerald-50 text-emerald-700'
                              : sub.status === 'pending'
                                ? 'bg-amber-50 text-amber-700'
                                : 'bg-red-50 text-[#A90706]'
                          }`}
                        >
                          {sub.status}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-neutral-600">
                        {sub.listIds.length
                          ? sub.listIds.map((id) => listNameById.get(id) || id).join(', ')
                          : '—'}
                      </td>
                      <td className="py-2.5 px-4 text-neutral-600">
                        {sub.tags.length ? sub.tags.join(', ') : '—'}
                      </td>
                      <td className="py-2.5 px-4 text-neutral-500 font-mono text-[11px]">
                        {sub.source}
                      </td>
                      <td className="py-2.5 px-4 text-right space-x-2 whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => {
                            setActiveSub(sub);
                            setEditTags(sub.tags.join(', '));
                          }}
                          className="text-xs font-semibold text-[#111111] hover:text-[#A90706]"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            await deleteEmailSubscriber(sub.id);
                            await onRefresh();
                          }}
                          className="text-neutral-400 hover:text-[#A90706]"
                          title="Delete subscriber"
                        >
                          <Trash2 className="w-3.5 h-3.5 inline" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* AUDIENCE LISTS TAB */}
      {tab === 'lists' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
          <form
            onSubmit={handleCreateList}
            className="bg-white border border-neutral-200 rounded-xl p-4 space-y-3 text-xs"
          >
            <div className="flex items-center gap-2 font-bold text-sm text-[#111111]">
              <FolderPlus className="w-4 h-4 text-[#A90706]" /> Create Audience List
            </div>
            <div>
              <label className="block font-semibold text-neutral-700 mb-1">List Name</label>
              <input
                required
                value={newListName}
                onChange={(e) => setNewListName(e.target.value)}
                placeholder="e.g. Weekly Engineering Newsletter"
                className="w-full border border-neutral-200 rounded-lg px-2.5 py-2"
              />
            </div>
            <div>
              <label className="block font-semibold text-neutral-700 mb-1">Description</label>
              <textarea
                rows={2}
                value={newListDesc}
                onChange={(e) => setNewListDesc(e.target.value)}
                placeholder="Who subscribes to this list?"
                className="w-full border border-neutral-200 rounded-lg px-2.5 py-2"
              />
            </div>
            <label className="flex items-center gap-2 text-neutral-700">
              <input
                type="checkbox"
                checked={newListDoubleOptIn}
                onChange={(e) => setNewListDoubleOptIn(e.target.checked)}
              />
              Enable double opt-in confirmation
            </label>
            <button
              type="submit"
              disabled={busy}
              className="w-full py-2 bg-[#A90706] hover:bg-[#8E0605] text-white font-semibold rounded-lg"
            >
              Create List ({lists.length}/{maxLists})
            </button>
          </form>

          <div className="lg:col-span-2 bg-white border border-neutral-200 rounded-xl overflow-hidden">
            {lists.length === 0 ? (
              <div className="p-8 text-center text-xs text-neutral-500">
                No audience lists yet. Create your first list on the left.
              </div>
            ) : (
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-neutral-50 border-b border-neutral-200 text-neutral-500 uppercase text-[11px]">
                    <th className="py-2.5 px-4 font-semibold">List Name</th>
                    <th className="py-2.5 px-4 font-semibold">Double Opt-In</th>
                    <th className="py-2.5 px-4 font-semibold text-right">Subscribers</th>
                    <th className="py-2.5 px-4 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {lists.map((lst) => {
                    const count = subscribers.filter((s) => s.listIds.includes(lst.id)).length;
                    return (
                      <tr key={lst.id} className="hover:bg-neutral-50">
                        <td className="py-3 px-4">
                          <div className="font-semibold text-[#111111]">{lst.name}</div>
                          {lst.description && (
                            <div className="text-[11px] text-neutral-500">{lst.description}</div>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <button
                            type="button"
                            onClick={async () => {
                              await updateEmailList(lst.id, { doubleOptIn: !lst.doubleOptIn });
                              await onRefresh();
                            }}
                            className="text-xs font-medium text-neutral-700 underline"
                          >
                            {lst.doubleOptIn ? 'Enabled' : 'Disabled'}
                          </button>
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-semibold tabular-nums">
                          {count.toLocaleString()}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <button
                            type="button"
                            onClick={async () => {
                              await deleteEmailList(lst.id);
                              await onRefresh();
                            }}
                            className="text-neutral-400 hover:text-[#A90706]"
                          >
                            <Trash2 className="w-3.5 h-3.5 inline" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* SEGMENTS TAB */}
      {tab === 'segments' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
          <form
            onSubmit={handleSaveSegment}
            className="lg:col-span-5 bg-white border border-neutral-200 rounded-xl p-4 space-y-3 text-xs"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-bold text-sm text-[#111111]">
                <Filter className="w-4 h-4 text-[#A90706]" /> Dynamic Segment Builder
              </div>
              {!canSegment && (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700">
                  <Lock className="w-3 h-3" /> Pro+
                </span>
              )}
            </div>
            <input
              required
              value={segName}
              onChange={(e) => setSegName(e.target.value)}
              placeholder="Segment name (e.g. Enterprise Changelog Readers)"
              className="w-full border border-neutral-200 rounded-lg px-2.5 py-2"
            />
            <input
              value={segDesc}
              onChange={(e) => setSegDesc(e.target.value)}
              placeholder="Optional description"
              className="w-full border border-neutral-200 rounded-lg px-2.5 py-2"
            />
            <div className="flex items-center gap-2">
              <span className="font-semibold text-neutral-700">Match</span>
              <select
                value={segMatch}
                onChange={(e) => setSegMatch(e.target.value as 'all' | 'any')}
                className="border border-neutral-200 rounded px-2 py-1"
              >
                <option value="all">ALL conditions (AND)</option>
                <option value="any">ANY condition (OR)</option>
              </select>
            </div>

            <div className="space-y-2">
              {segRules.map((rule, idx) => (
                <div key={rule.id} className="grid grid-cols-12 gap-1.5 items-center">
                  <select
                    value={rule.field}
                    onChange={(e) => {
                      const next = [...segRules];
                      next[idx] = { ...rule, field: e.target.value as SegmentRuleField };
                      setSegRules(next);
                    }}
                    className="col-span-4 border border-neutral-200 rounded px-1.5 py-1.5"
                  >
                    <option value="status">Status</option>
                    <option value="listId">List ID</option>
                    <option value="tag">Tag</option>
                    <option value="source">Source</option>
                    <option value="emailDomain">Email Domain</option>
                  </select>
                  <select
                    value={rule.operator}
                    onChange={(e) => {
                      const next = [...segRules];
                      next[idx] = { ...rule, operator: e.target.value as SegmentRuleOperator };
                      setSegRules(next);
                    }}
                    className="col-span-3 border border-neutral-200 rounded px-1.5 py-1.5"
                  >
                    <option value="equals">is</option>
                    <option value="not_equals">is not</option>
                    <option value="contains">contains</option>
                  </select>
                  <input
                    value={rule.value}
                    onChange={(e) => {
                      const next = [...segRules];
                      next[idx] = { ...rule, value: e.target.value };
                      setSegRules(next);
                    }}
                    placeholder="Value"
                    className="col-span-4 border border-neutral-200 rounded px-2 py-1.5"
                  />
                  <button
                    type="button"
                    onClick={() => setSegRules((prev) => prev.filter((_, i) => i !== idx))}
                    className="col-span-1 text-neutral-400 hover:text-[#A90706]"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() =>
                  setSegRules((prev) => [
                    ...prev,
                    { id: `r_${Date.now()}`, field: 'tag', operator: 'equals', value: '' },
                  ])
                }
                className="inline-flex items-center gap-1 text-[#A90706] font-semibold"
              >
                <Plus className="w-3.5 h-3.5" /> Add Condition
              </button>
            </div>

            <div className="p-2.5 bg-neutral-50 border border-neutral-200 rounded-lg flex items-center justify-between">
              <span className="text-neutral-600">Live matching subscribers</span>
              <span className="font-mono font-bold text-[#111111] tabular-nums">
                {previewSegmentCount.toLocaleString()}
              </span>
            </div>

            <button
              type="submit"
              disabled={busy}
              className="w-full py-2 bg-[#111111] hover:bg-neutral-800 text-white font-semibold rounded-lg"
            >
              Save Segment
            </button>
          </form>

          <div className="lg:col-span-7 bg-white border border-neutral-200 rounded-xl overflow-hidden">
            {segments.length === 0 ? (
              <div className="p-8 text-center text-xs text-neutral-500">
                No saved segments yet. Create reusable audience filters on the left.
              </div>
            ) : (
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-neutral-50 border-b border-neutral-200 text-neutral-500 uppercase text-[11px]">
                    <th className="py-2.5 px-4 font-semibold">Segment</th>
                    <th className="py-2.5 px-4 font-semibold">Rules</th>
                    <th className="py-2.5 px-4 font-semibold text-right">Matching</th>
                    <th className="py-2.5 px-4 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {segments.map((seg) => (
                    <tr key={seg.id} className="hover:bg-neutral-50">
                      <td className="py-3 px-4">
                        <div className="font-semibold text-[#111111]">{seg.name}</div>
                        {seg.description && (
                          <div className="text-[11px] text-neutral-500">{seg.description}</div>
                        )}
                      </td>
                      <td className="py-3 px-4 text-neutral-600 font-mono text-[11px]">
                        {seg.rules.map((r) => `${r.field} ${r.operator} "${r.value}"`).join(seg.matchType === 'all' ? ' AND ' : ' OR ')}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold tabular-nums">
                        {filterSubscribersBySegment(subscribers, seg).length.toLocaleString()}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          type="button"
                          onClick={async () => {
                            await deleteEmailSegment(seg.id);
                            await onRefresh();
                          }}
                          className="text-neutral-400 hover:text-[#A90706]"
                        >
                          <Trash2 className="w-3.5 h-3.5 inline" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* GLOBAL SUPPRESSIONS TAB */}
      {tab === 'suppressions' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
          <form
            onSubmit={handleAddSuppression}
            className="bg-white border border-neutral-200 rounded-xl p-4 space-y-3 text-xs"
          >
            <div className="flex items-center gap-2 font-bold text-sm text-[#111111]">
              <Ban className="w-4 h-4 text-[#A90706]" /> Add to Suppression List
            </div>
            <p className="text-neutral-500">
              Suppressed addresses are automatically blocked on the server before every marketing
              campaign send. Transactional emails are unaffected.
            </p>
            <input
              type="email"
              required
              value={supEmail}
              onChange={(e) => setSupEmail(e.target.value)}
              placeholder="contact@example.com"
              className="w-full border border-neutral-200 rounded-lg px-2.5 py-2"
            />
            <select
              value={supReason}
              onChange={(e) => setSupReason(e.target.value as EmailSuppressionRecord['reason'])}
              className="w-full border border-neutral-200 rounded-lg px-2.5 py-2"
            >
              <option value="manual">Manual Suppression</option>
              <option value="unsubscribed">Unsubscribed</option>
              <option value="hard_bounce">Hard Bounce</option>
              <option value="spam_complaint">Spam Complaint</option>
            </select>
            <button
              type="submit"
              disabled={busy}
              className="w-full py-2 bg-[#111111] text-white font-semibold rounded-lg"
            >
              Suppress Address
            </button>
          </form>

          <div className="lg:col-span-2 bg-white border border-neutral-200 rounded-xl overflow-hidden">
            {suppressions.length === 0 ? (
              <div className="p-8 text-center text-xs text-neutral-500">
                No suppressed addresses. Unsubscribes, hard bounces, and spam complaints appear here
                automatically.
              </div>
            ) : (
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-neutral-50 border-b border-neutral-200 text-neutral-500 uppercase text-[11px]">
                    <th className="py-2.5 px-4 font-semibold">Email</th>
                    <th className="py-2.5 px-4 font-semibold">Reason</th>
                    <th className="py-2.5 px-4 font-semibold">Source</th>
                    <th className="py-2.5 px-4 font-semibold text-right">Remove</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {suppressions.map((sup) => (
                    <tr key={sup.id}>
                      <td className="py-2.5 px-4 font-mono text-[#111111]">{sup.email}</td>
                      <td className="py-2.5 px-4 capitalize text-[#A90706] font-semibold">
                        {sup.reason.replace('_', ' ')}
                      </td>
                      <td className="py-2.5 px-4 text-neutral-500 font-mono text-[11px]">
                        {sup.source}
                      </td>
                      <td className="py-2.5 px-4 text-right">
                        <button
                          type="button"
                          onClick={async () => {
                            await removeEmailSuppression(sup.id);
                            await onRefresh();
                          }}
                          className="text-neutral-400 hover:text-[#111111]"
                          title="Remove suppression"
                        >
                          <Trash2 className="w-3.5 h-3.5 inline" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ADD SUBSCRIBER MODAL */}
      {showAddSub && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <form
            onSubmit={handleAddSubscriber}
            className="bg-white border border-neutral-200 rounded-xl w-full max-w-md p-5 space-y-3.5 text-xs"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-[#111111]">Add Subscriber</h3>
              <button type="button" onClick={() => setShowAddSub(false)}>
                <X className="w-4 h-4 text-neutral-400" />
              </button>
            </div>
            <div>
              <label className="block font-semibold text-neutral-700 mb-1">Email Address</label>
              <input
                type="email"
                required
                value={subEmail}
                onChange={(e) => setSubEmail(e.target.value)}
                placeholder="developer@company.com"
                className="w-full border border-neutral-200 rounded-lg px-3 py-2"
              />
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block font-semibold text-neutral-700 mb-1">First Name</label>
                <input
                  value={subFirst}
                  onChange={(e) => setSubFirst(e.target.value)}
                  className="w-full border border-neutral-200 rounded-lg px-3 py-2"
                />
              </div>
              <div>
                <label className="block font-semibold text-neutral-700 mb-1">Last Name</label>
                <input
                  value={subLast}
                  onChange={(e) => setSubLast(e.target.value)}
                  className="w-full border border-neutral-200 rounded-lg px-3 py-2"
                />
              </div>
            </div>
            <div>
              <label className="block font-semibold text-neutral-700 mb-1">
                Tags (comma-separated)
              </label>
              <input
                value={subTags}
                onChange={(e) => setSubTags(e.target.value)}
                placeholder="beta, changelog, enterprise"
                className="w-full border border-neutral-200 rounded-lg px-3 py-2"
              />
            </div>
            {lists.length > 0 && (
              <div>
                <label className="block font-semibold text-neutral-700 mb-1">Assign to Lists</label>
                <div className="space-y-1 max-h-24 overflow-y-auto border border-neutral-200 rounded-lg p-2">
                  {lists.map((l) => (
                    <label key={l.id} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={subLists.includes(l.id)}
                        onChange={(e) =>
                          setSubLists((prev) =>
                            e.target.checked ? [...prev, l.id] : prev.filter((x) => x !== l.id)
                          )
                        }
                      />
                      <span>{l.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
            <label className="flex items-start gap-2 p-2.5 bg-neutral-50 border border-neutral-200 rounded-lg">
              <input
                type="checkbox"
                required
                checked={subConsent}
                onChange={(e) => setSubConsent(e.target.checked)}
                className="mt-0.5"
              />
              <span className="text-neutral-700">
                I confirm this contact explicitly opted in to receive marketing/newsletter emails.
              </span>
            </label>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowAddSub(false)}
                className="px-3 py-1.5 border border-neutral-200 rounded-lg font-semibold"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy || !subConsent}
                className="px-4 py-1.5 bg-[#A90706] text-white rounded-lg font-semibold disabled:opacity-50"
              >
                {busy ? 'Saving...' : 'Save Subscriber'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* CSV IMPORT MODAL */}
      {showImport && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <form
            onSubmit={handleCsvImport}
            className="bg-white border border-neutral-200 rounded-xl w-full max-w-lg p-5 space-y-3.5 text-xs"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-[#111111]">Import Subscribers from CSV</h3>
              <button type="button" onClick={() => setShowImport(false)}>
                <X className="w-4 h-4 text-neutral-400" />
              </button>
            </div>
            <p className="text-neutral-600">
              Upload a CSV file or paste rows below. Required header: <code className="font-mono">email</code>.
              Optional headers: <code className="font-mono">first_name, last_name, tags</code>.
            </p>
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                file.text().then((txt) => setCsvRaw(txt));
              }}
              className="block w-full text-xs"
            />
            <textarea
              rows={6}
              value={csvRaw}
              onChange={(e) => setCsvRaw(e.target.value)}
              placeholder={'email,first_name,last_name,tags\nalex@example.com,Alex,Rivera,newsletter;beta'}
              className="w-full border border-neutral-200 rounded-lg p-2.5 font-mono text-[11px]"
            />
            {lists.length > 0 && (
              <div>
                <label className="block font-semibold text-neutral-700 mb-1">
                  Add Imported Contacts to List (Optional)
                </label>
                <select
                  value={importListId}
                  onChange={(e) => setImportListId(e.target.value)}
                  className="w-full border border-neutral-200 rounded-lg px-2.5 py-2"
                >
                  <option value="">No specific list</option>
                  {lists.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <label className="flex items-start gap-2 p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-amber-900">
              <input
                type="checkbox"
                required
                checked={importConsent}
                onChange={(e) => setImportConsent(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                <strong>Compliance Attestation:</strong> I confirm every email address in this CSV
                explicitly opted in to receive communications from our organization (no purchased or
                scraped lists).
              </span>
            </label>
            {importSummary && <p className="text-emerald-700 font-medium">{importSummary}</p>}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowImport(false)}
                className="px-3 py-1.5 border border-neutral-200 rounded-lg font-semibold"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy || !importConsent || !csvRaw.trim()}
                className="px-4 py-1.5 bg-[#A90706] text-white rounded-lg font-semibold disabled:opacity-50"
              >
                {busy ? 'Importing...' : 'Run Verified Import'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* SUBSCRIBER PROFILE EDIT MODAL */}
      {activeSub && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white border border-neutral-200 rounded-xl w-full max-w-md p-5 space-y-3.5 text-xs">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-[#111111]">Subscriber Profile</h3>
              <button type="button" onClick={() => setActiveSub(null)}>
                <X className="w-4 h-4 text-neutral-400" />
              </button>
            </div>
            <div className="p-2.5 bg-neutral-50 border border-neutral-200 rounded-lg font-mono">
              {activeSub.email}
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block font-semibold mb-1">First Name</label>
                <input
                  value={activeSub.firstName}
                  onChange={(e) => setActiveSub({ ...activeSub, firstName: e.target.value })}
                  className="w-full border border-neutral-200 rounded-lg px-2.5 py-2"
                />
              </div>
              <div>
                <label className="block font-semibold mb-1">Last Name</label>
                <input
                  value={activeSub.lastName}
                  onChange={(e) => setActiveSub({ ...activeSub, lastName: e.target.value })}
                  className="w-full border border-neutral-200 rounded-lg px-2.5 py-2"
                />
              </div>
            </div>
            <div>
              <label className="block font-semibold mb-1">Status</label>
              <select
                value={activeSub.status}
                onChange={(e) =>
                  setActiveSub({
                    ...activeSub,
                    status: e.target.value as EmailSubscriberStatus,
                  })
                }
                className="w-full border border-neutral-200 rounded-lg px-2.5 py-2"
              >
                <option value="subscribed">Subscribed</option>
                <option value="pending">Pending</option>
                <option value="unsubscribed">Unsubscribed</option>
                <option value="bounced">Bounced</option>
                <option value="complained">Complained</option>
                <option value="suppressed">Suppressed</option>
              </select>
            </div>
            <div>
              <label className="block font-semibold mb-1">Tags (comma-separated)</label>
              <input
                value={editTags}
                onChange={(e) => setEditTags(e.target.value)}
                className="w-full border border-neutral-200 rounded-lg px-2.5 py-2"
              />
            </div>
            {lists.length > 0 && (
              <div>
                <label className="block font-semibold mb-1">Lists</label>
                <div className="space-y-1 max-h-24 overflow-y-auto border border-neutral-200 rounded-lg p-2">
                  {lists.map((l) => (
                    <label key={l.id} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={activeSub.listIds.includes(l.id)}
                        onChange={(e) =>
                          setActiveSub({
                            ...activeSub,
                            listIds: e.target.checked
                              ? [...activeSub.listIds, l.id]
                              : activeSub.listIds.filter((id) => id !== l.id),
                          })
                        }
                      />
                      <span>{l.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setActiveSub(null)}
                className="px-3 py-1.5 border border-neutral-200 rounded-lg font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveSubscriberProfile}
                disabled={busy}
                className="px-4 py-1.5 bg-[#111111] text-white rounded-lg font-semibold"
              >
                {busy ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
