import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Newspaper,
  Plus,
  Copy,
  Check,
  Download,
  Trash2,
  UserPlus,
  Search,
  RefreshCw,
  Code2,
  Power,
  Lock,
} from 'lucide-react';
import {
  addNewsletterSubscriber,
  createNewsletterList,
  deleteNewsletterList,
  deleteNewsletterSubscriber,
  listNewsletterLists,
  listNewsletterSubscribers,
  toggleNewsletterListStatus,
  updateSubscriberStatus,
} from '../../lib/devServicesApi';
import { hasPlanFeature, type PlanLockKey } from '../../lib/planLimits';
import type { NewsletterListRecord, NewsletterSubscriberRecord, WorkspaceMe } from '../../types';

interface NewsletterViewProps {
  workspace: WorkspaceMe;
  onRequestUpgrade: (key: PlanLockKey) => void;
}

export const NewsletterView: React.FC<NewsletterViewProps> = ({ workspace, onRequestUpgrade }) => {
  const canUseNewsletter = hasPlanFeature(workspace, 'newsletterApi');
  const canExportCsv = hasPlanFeature(workspace, 'advancedAnalytics');
  const maxLists = workspace.limits.maxNewsletterLists ?? 0;
  const maxSubscribers = workspace.limits.maxSubscribers ?? 0;

  const [lists, setLists] = useState<NewsletterListRecord[]>([]);
  const [subscribers, setSubscribers] = useState<NewsletterSubscriberRecord[]>([]);
  const [selectedListKey, setSelectedListKey] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'subscribed' | 'unsubscribed'>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const listLimitReached = canUseNewsletter && lists.length >= maxLists;
  const subscriberLimitReached = canUseNewsletter && subscribers.length >= maxSubscribers;

  // Create List Form
  const [listName, setListName] = useState('');
  const [listDesc, setListDesc] = useState('');
  const [creatingList, setCreatingList] = useState(false);

  // Add Subscriber Form
  const [subEmail, setSubEmail] = useState('');
  const [subName, setSubName] = useState('');
  const [addingSub, setAddingSub] = useState(false);

  // Code Integration Tab
  const [codeTab, setCodeTab] = useState<'html' | 'fetch' | 'rest'>('html');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [listDocs, subDocs] = await Promise.all([
        listNewsletterLists(),
        listNewsletterSubscribers(),
      ]);
      setLists(listDocs);
      setSubscribers(subDocs);
      if (selectedListKey === 'all' && listDocs.length > 0) {
        setSelectedListKey(listDocs[0].listKey);
      }
    } catch (err: any) {
      setError(err?.message || 'Unable to load newsletter data.');
    } finally {
      setLoading(false);
    }
  }, [selectedListKey]);

  useEffect(() => {
    void load();
  }, [load]);

  const activeList = useMemo(
    () => lists.find((l) => l.listKey === selectedListKey) || lists[0] || null,
    [lists, selectedListKey]
  );

  const filteredSubscribers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return subscribers.filter((s) => {
      if (selectedListKey !== 'all' && s.listKey !== selectedListKey) return false;
      if (statusFilter !== 'all' && s.status !== statusFilter) return false;
      if (q && !s.email.toLowerCase().includes(q) && !s.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [subscribers, selectedListKey, statusFilter, searchQuery]);

  const apiBase = (
    workspace.publicApiBaseUrl ||
    (typeof window !== 'undefined' ? window.location.origin : 'https://forms.brosdev.info')
  ).replace(/\/+$/, '');

  const subscribeEndpoint = activeList
    ? `${apiBase}/api/newsletter/${activeList.listKey}/subscribe`
    : `${apiBase}/api/newsletter/YOUR_LIST_KEY/subscribe`;

  const htmlSnippet = `<form action="${subscribeEndpoint}" method="POST">
  <input type="text" name="name" placeholder="Your name" />
  <input type="email" name="email" placeholder="you@company.com" required />
  <button type="submit">Subscribe</button>
</form>`;

  const fetchSnippet = `const res = await fetch("${subscribeEndpoint}", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Accept": "application/json"
  },
  body: JSON.stringify({
    email: "developer@company.com",
    name: "Alex Morgan"
  })
});
const data = await res.json();
console.log(data);`;

  const restSnippet = `curl -X POST "${subscribeEndpoint}" \\
  -H "Content-Type: application/json" \\
  -H "Accept: application/json" \\
  -d '{"email":"developer@company.com","name":"Alex Morgan"}'`;

  const handleCreateList = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canUseNewsletter) {
      onRequestUpgrade('newsletterApi');
      return;
    }
    if (listLimitReached) {
      onRequestUpgrade('newsletterLimit');
      return;
    }
    setError('');
    setNotice('');
    setCreatingList(true);
    try {
      const created = await createNewsletterList({ name: listName, description: listDesc });
      setListName('');
      setListDesc('');
      setSelectedListKey(created.listKey);
      setNotice(`Newsletter list "${created.name}" (${created.listKey}) created.`);
      await load();
    } catch (err: any) {
      setError(err?.message || 'Failed to create newsletter list.');
    } finally {
      setCreatingList(false);
    }
  };

  const handleAddSubscriber = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canUseNewsletter) {
      onRequestUpgrade('newsletterApi');
      return;
    }
    if (subscriberLimitReached) {
      onRequestUpgrade('newsletterLimit');
      return;
    }
    if (!activeList) {
      setError('Create a newsletter list first.');
      return;
    }
    setError('');
    setNotice('');
    setAddingSub(true);
    try {
      await addNewsletterSubscriber(activeList, subEmail, subName);
      setSubEmail('');
      setSubName('');
      setNotice(`Added subscriber to "${activeList.name}".`);
      await load();
    } catch (err: any) {
      setError(err?.message || 'Failed to add subscriber.');
    } finally {
      setAddingSub(false);
    }
  };

  const handleExportCsv = () => {
    if (!canExportCsv) {
      onRequestUpgrade('newsletterExport');
      return;
    }
    const header = ['Email', 'Name', 'List Key', 'Status', 'Source', 'Subscribed At'];
    const rows = filteredSubscribers.map((s) =>
      [s.email, s.name, s.listKey, s.status, s.source, s.createdAt]
        .map((v) => `"${String(v || '').replace(/"/g, '""')}"`)
        .join(',')
    );
    const csv = [header.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `brosdev-subscribers-${selectedListKey}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const copyText = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1800);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#111111]">
            Newsletter Subscription API
          </h1>
          <p className="mt-1 text-sm text-[#525252]">
            Manage subscriber lists with automatic deduplication, public HTML/Fetch/REST endpoints, and CSV export.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-md border border-[#D4D4D4] bg-white px-3 py-2 text-xs font-semibold text-[#111111] hover:bg-[#FAFAFA] cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            type="button"
            onClick={handleExportCsv}
            disabled={canExportCsv && filteredSubscribers.length === 0}
            className={`inline-flex items-center gap-1.5 rounded-md px-3.5 py-2 text-xs font-semibold cursor-pointer ${
              canExportCsv
                ? 'bg-[#111111] text-white hover:bg-[#262626] disabled:opacity-40'
                : 'border border-[#D4D4D4] bg-[#F5F5F5] text-[#525252] hover:border-[#A90706] hover:text-[#A90706]'
            }`}
          >
            {canExportCsv ? <Download className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
            {canExportCsv ? `Export CSV (${filteredSubscribers.length})` : 'Export CSV (Pro+)'}
          </button>
        </div>
      </div>

      {!canUseNewsletter && (
        <div className="flex flex-col items-start justify-between gap-4 rounded-lg border border-[#111111] bg-[#FAFAFA] p-5 sm:flex-row sm:items-center">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded border border-[#E5E5E5] bg-white text-[#A90706]">
              <Lock className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm font-bold text-[#111111]">
                Newsletter Subscription API Requires Starter Plan or Higher
              </p>
              <p className="mt-0.5 text-xs text-[#525252]">
                Your current <span className="font-semibold text-[#111111]">{workspace.plan?.name || 'Free'}</span> plan
                locks audience lists and public subscribe endpoints. Upgrade to Starter ($19/mo) for 3 lists and 2,500 subscribers.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onRequestUpgrade('newsletterApi')}
            className="shrink-0 rounded-md bg-[#A90706] px-4 py-2 text-xs font-semibold text-white hover:bg-[#8C0605] cursor-pointer"
          >
            Unlock Newsletter API
          </button>
        </div>
      )}

      {error && (
        <div className="rounded-md border border-[#A90706]/30 bg-[#FEF2F2] px-4 py-3 text-xs font-medium text-[#A90706]">
          {error}
        </div>
      )}
      {notice && (
        <div className="rounded-md border border-[#16A34A]/30 bg-[#F0FDF4] px-4 py-3 text-xs font-medium text-[#15803D]">
          {notice}
        </div>
      )}

      {/* Create List + List Selector */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <section className="rounded-lg border border-[#E5E5E5] bg-white p-5 lg:col-span-5 space-y-4">
          <div className="flex items-center justify-between gap-2 border-b border-[#EFEFEF] pb-3">
            <div className="flex items-center gap-2">
              <Plus className="h-4 w-4 text-[#A90706]" />
              <h2 className="text-sm font-bold text-[#111111]">Create Subscriber List</h2>
            </div>
            <span className="font-mono text-[11px] tabular-nums text-[#737373]">
              {canUseNewsletter ? `${lists.length} / ${maxLists} lists` : 'Starter+'}
            </span>
          </div>
          <form onSubmit={handleCreateList} className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-[#111111]">List Name</label>
              <input
                type="text"
                required
                disabled={!canUseNewsletter || listLimitReached}
                value={listName}
                onChange={(e) => setListName(e.target.value)}
                placeholder="Product Changelog & Releases"
                className="w-full rounded-md border border-[#D4D4D4] px-3 py-2 text-sm text-[#111111] focus:border-[#111111] focus:outline-none disabled:bg-[#F5F5F5] disabled:text-[#737373]"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-[#111111]">Description</label>
              <input
                type="text"
                disabled={!canUseNewsletter || listLimitReached}
                value={listDesc}
                onChange={(e) => setListDesc(e.target.value)}
                placeholder="Monthly engineering updates"
                className="w-full rounded-md border border-[#D4D4D4] px-3 py-2 text-sm text-[#111111] focus:border-[#111111] focus:outline-none disabled:bg-[#F5F5F5] disabled:text-[#737373]"
              />
            </div>
            {!canUseNewsletter || listLimitReached ? (
              <button
                type="button"
                onClick={() => onRequestUpgrade(!canUseNewsletter ? 'newsletterApi' : 'newsletterLimit')}
                className="inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-[#D4D4D4] bg-[#F5F5F5] px-4 py-2 text-xs font-semibold text-[#525252] hover:border-[#A90706] hover:text-[#A90706] cursor-pointer"
              >
                <Lock className="h-3.5 w-3.5" />
                {!canUseNewsletter ? 'Locked on Free Plan — Upgrade' : 'List Quota Reached — Upgrade'}
              </button>
            ) : (
              <button
                type="submit"
                disabled={creatingList}
                className="w-full rounded-md bg-[#A90706] px-4 py-2 text-xs font-semibold text-white hover:bg-[#8C0605] cursor-pointer disabled:opacity-50"
              >
                {creatingList ? 'Creating List...' : 'Create List'}
              </button>
            )}
          </form>

          {lists.length > 0 && (
            <div className="space-y-2 border-t border-[#EFEFEF] pt-4">
              <div className="text-xs font-semibold text-[#525252]">Your Lists</div>
              <div className="divide-y divide-[#F0F0F0] rounded-md border border-[#E5E5E5]">
                {lists.map((l) => {
                  const count = subscribers.filter(
                    (s) => s.listKey === l.listKey && s.status === 'subscribed'
                  ).length;
                  const selected = activeList?.listKey === l.listKey;
                  return (
                    <div
                      key={l.docId}
                      onClick={() => setSelectedListKey(l.listKey)}
                      className={`flex items-center justify-between gap-2 px-3.5 py-2.5 text-xs cursor-pointer ${
                        selected ? 'bg-[#FEF2F2]' : 'hover:bg-[#FAFAFA]'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="font-semibold text-[#111111] truncate">{l.name}</div>
                        <div className="font-mono text-[11px] text-[#737373]">
                          {l.listKey} · {count} active ·{' '}
                          <span className={l.status === 'active' ? 'text-[#16A34A]' : 'text-[#B45309]'}>
                            {l.status}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          disabled={busyId === l.docId}
                          onClick={async () => {
                            setBusyId(l.docId);
                            try {
                              await toggleNewsletterListStatus(l);
                              await load();
                            } finally {
                              setBusyId(null);
                            }
                          }}
                          title={l.status === 'active' ? 'Pause list' : 'Activate list'}
                          className="rounded border border-[#E5E5E5] bg-white p-1.5 text-[#525252] hover:text-[#111111] cursor-pointer"
                        >
                          <Power className="h-3 w-3" />
                        </button>
                        <button
                          type="button"
                          disabled={busyId === l.docId}
                          onClick={async () => {
                            setBusyId(l.docId);
                            try {
                              await deleteNewsletterList(l);
                              setSelectedListKey('all');
                              await load();
                            } finally {
                              setBusyId(null);
                            }
                          }}
                          title="Delete list"
                          className="rounded border border-[#E5E5E5] bg-white p-1.5 text-[#737373] hover:text-[#A90706] cursor-pointer"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </section>

        {/* Live Integration Code Generator */}
        <section className="rounded-lg border border-[#E5E5E5] bg-white p-5 lg:col-span-7 flex flex-col justify-between space-y-4">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#EFEFEF] pb-3">
              <div className="flex items-center gap-2">
                <Code2 className="h-4 w-4 text-[#111111]" />
                <h2 className="text-sm font-bold text-[#111111]">
                  Subscribe Endpoint Integration{activeList ? ` · ${activeList.name}` : ''}
                </h2>
              </div>
              <div className="flex items-center gap-1 rounded-md bg-[#F5F5F5] p-1">
                {(['html', 'fetch', 'rest'] as const).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setCodeTab(tab)}
                    className={`rounded px-2.5 py-1 text-xs font-semibold uppercase cursor-pointer ${
                      codeTab === tab ? 'bg-white text-[#111111] shadow-xs' : 'text-[#525252]'
                    }`}
                  >
                    {tab === 'html' ? 'HTML' : tab === 'fetch' ? 'JS Fetch' : 'REST cURL'}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 rounded border border-[#E5E5E5] bg-[#FAFAFA] px-3 py-2">
              <code className="truncate font-mono text-xs text-[#111111]">
                POST {subscribeEndpoint}
              </code>
              <button
                type="button"
                onClick={() => copyText('endpoint', subscribeEndpoint)}
                className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-[#111111] hover:text-[#A90706] cursor-pointer"
              >
                {copiedId === 'endpoint' ? <Check className="h-3.5 w-3.5 text-[#16A34A]" /> : <Copy className="h-3.5 w-3.5" />}
                {copiedId === 'endpoint' ? 'Copied' : 'Copy URL'}
              </button>
            </div>

            <div className="relative">
              <pre className="overflow-x-auto rounded-md bg-[#111111] p-4 font-mono text-xs text-[#F5F5F5]">
                {codeTab === 'html'
                  ? htmlSnippet
                  : codeTab === 'fetch'
                    ? fetchSnippet
                    : restSnippet}
              </pre>
              <button
                type="button"
                onClick={() =>
                  copyText(
                    'snippet',
                    codeTab === 'html' ? htmlSnippet : codeTab === 'fetch' ? fetchSnippet : restSnippet
                  )
                }
                className="absolute right-3 top-3 inline-flex items-center gap-1 rounded bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-white/20 cursor-pointer"
              >
                {copiedId === 'snippet' ? <Check className="h-3 w-3 text-[#4ADE80]" /> : <Copy className="h-3 w-3" />}
                {copiedId === 'snippet' ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>

          {/* Quick Add Subscriber */}
          <form
            onSubmit={handleAddSubscriber}
            className="grid grid-cols-1 gap-2 border-t border-[#EFEFEF] pt-4 sm:grid-cols-12"
          >
            <input
              type="email"
              required
              disabled={!canUseNewsletter || subscriberLimitReached}
              value={subEmail}
              onChange={(e) => setSubEmail(e.target.value)}
              placeholder="Add subscriber email..."
              className="rounded-md border border-[#D4D4D4] px-3 py-2 text-xs text-[#111111] focus:border-[#111111] focus:outline-none disabled:bg-[#F5F5F5] sm:col-span-5"
            />
            <input
              type="text"
              disabled={!canUseNewsletter || subscriberLimitReached}
              value={subName}
              onChange={(e) => setSubName(e.target.value)}
              placeholder="Name (optional)"
              className="rounded-md border border-[#D4D4D4] px-3 py-2 text-xs text-[#111111] focus:border-[#111111] focus:outline-none disabled:bg-[#F5F5F5] sm:col-span-4"
            />
            {!canUseNewsletter || subscriberLimitReached ? (
              <button
                type="button"
                onClick={() => onRequestUpgrade(!canUseNewsletter ? 'newsletterApi' : 'newsletterLimit')}
                className="inline-flex items-center justify-center gap-1.5 rounded-md border border-[#D4D4D4] bg-[#F5F5F5] px-3 py-2 text-xs font-semibold text-[#525252] hover:border-[#A90706] hover:text-[#A90706] cursor-pointer sm:col-span-3"
              >
                <Lock className="h-3.5 w-3.5" />
                Upgrade
              </button>
            ) : (
              <button
                type="submit"
                disabled={addingSub || !activeList}
                className="inline-flex items-center justify-center gap-1.5 rounded-md bg-[#111111] px-3 py-2 text-xs font-semibold text-white hover:bg-[#262626] cursor-pointer disabled:opacity-40 sm:col-span-3"
              >
                <UserPlus className="h-3.5 w-3.5" />
                {addingSub ? 'Adding...' : 'Add'}
              </button>
            )}
          </form>
        </section>
      </div>

      {/* Subscribers Table */}
      <section className="overflow-hidden rounded-lg border border-[#E5E5E5] bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E5E5E5] px-6 py-4">
          <div className="flex items-center gap-2">
            <Newspaper className="h-4 w-4 text-[#111111]" />
            <h2 className="text-sm font-bold text-[#111111]">Subscribers</h2>
            <span className="text-xs tabular-nums text-[#737373]">
              · {filteredSubscribers.length} shown
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#737373]" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search email or name..."
                className="rounded-md border border-[#D4D4D4] py-1.5 pl-8 pr-3 text-xs text-[#111111] focus:border-[#111111] focus:outline-none"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="rounded-md border border-[#D4D4D4] bg-white px-2.5 py-1.5 text-xs text-[#111111]"
            >
              <option value="all">All statuses</option>
              <option value="subscribed">Subscribed</option>
              <option value="unsubscribed">Unsubscribed</option>
            </select>
          </div>
        </div>

        {filteredSubscribers.length === 0 ? (
          <div className="p-8 text-center text-xs text-[#737373]">
            No subscribers match your filter yet. Add one above or submit to the public Subscribe API endpoint.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-[#E5E5E5] bg-[#FAFAFA] text-[#525252]">
                <tr>
                  <th className="px-5 py-3">Subscriber</th>
                  <th className="px-5 py-3">List</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Source</th>
                  <th className="px-5 py-3">Joined</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EFEFEF]">
                {filteredSubscribers.map((sub) => (
                  <tr key={sub.docId} className="hover:bg-[#FAFAFA]">
                    <td className="px-5 py-3">
                      <div className="font-semibold text-[#111111]">{sub.email}</div>
                      {sub.name && <div className="text-[11px] text-[#737373]">{sub.name}</div>}
                    </td>
                    <td className="px-5 py-3 font-mono text-[11px] text-[#525252]">{sub.listKey}</td>
                    <td className="px-5 py-3">
                      <span
                        className={`font-semibold capitalize ${
                          sub.status === 'subscribed' ? 'text-[#16A34A]' : 'text-[#737373]'
                        }`}
                      >
                        {sub.status}
                      </span>
                    </td>
                    <td className="px-5 py-3 font-mono text-[11px] text-[#737373]">{sub.source}</td>
                    <td className="px-5 py-3 font-mono text-[11px] text-[#737373]">
                      {new Date(sub.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          disabled={busyId === sub.docId}
                          onClick={async () => {
                            setBusyId(sub.docId);
                            try {
                              await updateSubscriberStatus(
                                sub.docId,
                                sub.status === 'subscribed' ? 'unsubscribed' : 'subscribed'
                              );
                              await load();
                            } finally {
                              setBusyId(null);
                            }
                          }}
                          className="rounded border border-[#D4D4D4] px-2.5 py-1 text-xs font-medium text-[#111111] hover:bg-[#FAFAFA] cursor-pointer"
                        >
                          {sub.status === 'subscribed' ? 'Unsubscribe' : 'Resubscribe'}
                        </button>
                        <button
                          type="button"
                          disabled={busyId === sub.docId}
                          onClick={async () => {
                            setBusyId(sub.docId);
                            try {
                              await deleteNewsletterSubscriber(sub.docId);
                              await load();
                            } finally {
                              setBusyId(null);
                            }
                          }}
                          className="rounded border border-[#E5E5E5] p-1 text-[#737373] hover:border-[#A90706] hover:text-[#A90706] cursor-pointer"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};
