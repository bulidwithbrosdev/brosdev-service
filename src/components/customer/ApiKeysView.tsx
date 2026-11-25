import React, { useCallback, useEffect, useState } from 'react';
import {
  KeyRound,
  Plus,
  Copy,
  Check,
  RotateCw,
  Ban,
  Trash2,
  ShieldAlert,
  RefreshCw,
  Lock,
} from 'lucide-react';
import {
  createApiKey,
  deleteApiKey,
  listApiKeys,
  listProjects,
  revokeApiKey,
  rotateApiKey,
} from '../../lib/devServicesApi';
import { hasPlanFeature, type PlanLockKey } from '../../lib/planLimits';
import type { ApiKeyRecord, DeveloperProductId, ProjectRecord, WorkspaceMe } from '../../types';

const PERMISSION_SCOPES = ['read', 'write', 'webhooks', 'admin'];
const PRODUCT_SCOPES: Array<{ id: DeveloperProductId; label: string }> = [
  { id: 'forms', label: 'Forms API' },
  { id: 'email', label: 'Email' },
  { id: 'webhooks', label: 'Webhooks' },
  { id: 'newsletter', label: 'Newsletter' },
  { id: 'url_shortener', label: 'URL Shortener' },
  { id: 'qr_generator', label: 'QR Code' },
  { id: 'pdf_generator', label: 'PDF' },
];

interface ApiKeysViewProps {
  workspace: WorkspaceMe;
  onRequestUpgrade: (key: PlanLockKey) => void;
}

export const ApiKeysView: React.FC<ApiKeysViewProps> = ({ workspace, onRequestUpgrade }) => {
  const [keys, setKeys] = useState<ApiKeyRecord[]>([]);
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const maxApiKeys = workspace.limits.maxApiKeys ?? 1;
  const activeKeyCount = keys.filter((k) => k.status === 'active').length;
  const keyLimitReached = activeKeyCount >= maxApiKeys;
  const canUseScopedKeys = hasPlanFeature(workspace, 'scopedApiKeys');

  const [name, setName] = useState('');
  const [projectKey, setProjectKey] = useState('');
  const [permissions, setPermissions] = useState<string[]>(['read', 'write']);
  const [products, setProducts] = useState<DeveloperProductId[]>(['forms', 'newsletter']);
  const [creating, setCreating] = useState(false);

  // Full secret is shown ONLY once immediately after creation/rotation
  const [revealedSecret, setRevealedSecret] = useState<{ label: string; secret: string } | null>(
    null
  );
  const [copiedSecret, setCopiedSecret] = useState(false);
  const [busyDocId, setBusyDocId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [keyList, projectList] = await Promise.all([listApiKeys(), listProjects()]);
      setKeys(keyList);
      setProjects(projectList);
    } catch (err: any) {
      setError(err?.message || 'Unable to load API keys.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const togglePermission = (perm: string) => {
    setPermissions((prev) => (prev.includes(perm) ? prev.filter((p) => p !== perm) : [...prev, perm]));
  };

  const toggleProduct = (prod: DeveloperProductId) => {
    setProducts((prev) => (prev.includes(prod) ? prev.filter((p) => p !== prod) : [...prev, prod]));
  };

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (keyLimitReached) {
      onRequestUpgrade('apiKeysLimit');
      return;
    }
    setError('');
    setCreating(true);
    try {
      const res = await createApiKey({
        name,
        projectKey: canUseScopedKeys ? projectKey : '',
        permissions: permissions.length > 0 ? permissions : ['read'],
        products: products.length > 0 ? products : ['forms'],
      });
      setName('');
      setRevealedSecret({ label: res.record.name, secret: res.rawSecret });
      setCopiedSecret(false);
      await load();
    } catch (err: any) {
      setError(err?.message || 'Failed to generate API key.');
    } finally {
      setCreating(false);
    }
  };

  const handleRotate = async (key: ApiKeyRecord) => {
    if (!canUseScopedKeys) {
      onRequestUpgrade('scopedApiKeys');
      return;
    }
    setBusyDocId(key.docId);
    setError('');
    try {
      const res = await rotateApiKey(key.docId);
      setRevealedSecret({ label: `${key.name} (Rotated)`, secret: res.rawSecret });
      setCopiedSecret(false);
      await load();
    } catch (err: any) {
      setError(err?.message || 'Failed to rotate API key.');
    } finally {
      setBusyDocId(null);
    }
  };

  const handleRevoke = async (key: ApiKeyRecord) => {
    setBusyDocId(key.docId);
    setError('');
    try {
      await revokeApiKey(key.docId);
      await load();
    } catch (err: any) {
      setError(err?.message || 'Failed to revoke key.');
    } finally {
      setBusyDocId(null);
    }
  };

  const handleDelete = async (key: ApiKeyRecord) => {
    setBusyDocId(key.docId);
    setError('');
    try {
      await deleteApiKey(key.docId);
      await load();
    } catch (err: any) {
      setError(err?.message || 'Failed to delete key.');
    } finally {
      setBusyDocId(null);
    }
  };

  const copyOnce = () => {
    if (!revealedSecret) return;
    navigator.clipboard.writeText(revealedSecret.secret);
    setCopiedSecret(true);
    setTimeout(() => setCopiedSecret(false), 2000);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#111111]">API Key Management</h1>
          <p className="mt-1 text-sm text-[#525252]">
            Generate server-side API keys scoped by project and product. Only SHA-256 hashes are persisted—never place secret keys in browser-side JavaScript.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-md border border-[#D4D4D4] bg-white px-3 py-2 text-xs font-semibold text-[#111111] hover:bg-[#FAFAFA] cursor-pointer disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="rounded-md border border-[#A90706]/30 bg-[#FEF2F2] px-4 py-3 text-xs font-medium text-[#A90706]">
          {error}
        </div>
      )}

      {/* One-time Secret Reveal Banner */}
      {revealedSecret && (
        <div className="rounded-lg border border-[#111111] bg-[#FAFAFA] p-5 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <ShieldAlert className="mt-0.5 h-4 w-4 text-[#A90706] shrink-0" />
              <div>
                <div className="text-sm font-bold text-[#111111]">
                  Save Your Secret Key Now — Shown Only Once ({revealedSecret.label})
                </div>
                <p className="mt-0.5 text-xs text-[#525252]">
                  For your security, BrosDev stores only a SHA-256 hash. You will not be able to view this key again after dismissing.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setRevealedSecret(null)}
              className="text-xs font-semibold text-[#737373] hover:text-[#111111] cursor-pointer"
            >
              Dismiss
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <code className="flex-1 overflow-x-auto rounded border border-[#D4D4D4] bg-white px-3 py-2 font-mono text-xs text-[#111111]">
              {revealedSecret.secret}
            </code>
            <button
              type="button"
              onClick={copyOnce}
              className="inline-flex items-center gap-1.5 rounded bg-[#A90706] px-4 py-2 text-xs font-semibold text-white hover:bg-[#8C0605] cursor-pointer"
            >
              {copiedSecret ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copiedSecret ? 'Copied Secret' : 'Copy Secret'}
            </button>
          </div>
        </div>
      )}

      {/* Create Key Form */}
      <section className="rounded-lg border border-[#E5E5E5] bg-white">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E5E5E5] px-6 py-4">
          <div className="flex items-center gap-2">
            <Plus className="h-4 w-4 text-[#A90706]" />
            <h2 className="text-sm font-bold text-[#111111]">Generate New API Key</h2>
          </div>
          <div className="flex items-center gap-3">
            <span className="font-mono text-xs tabular-nums text-[#525252]">
              {activeKeyCount} / {maxApiKeys} active keys ({workspace.plan?.name || 'Free'})
            </span>
            {keyLimitReached && (
              <button
                type="button"
                onClick={() => onRequestUpgrade('apiKeysLimit')}
                className="inline-flex items-center gap-1 rounded bg-[#A90706] px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-[#8C0605] cursor-pointer"
              >
                <Lock className="h-3 w-3" />
                Upgrade Limit
              </button>
            )}
          </div>
        </div>
        {keyLimitReached && (
          <div className="mx-6 mt-5 flex flex-wrap items-center justify-between gap-3 rounded-md border border-[#111111] bg-[#FAFAFA] px-4 py-3 text-xs">
            <div className="flex items-center gap-2 text-[#111111]">
              <Lock className="h-3.5 w-3.5 text-[#A90706] shrink-0" />
              <span>
                API key limit reached ({activeKeyCount}/{maxApiKeys}) on your{' '}
                <strong>{workspace.plan?.name || 'Free'}</strong> plan. Revoke an unused key or upgrade for more keys.
              </span>
            </div>
            <button
              type="button"
              onClick={() => onRequestUpgrade('apiKeysLimit')}
              className="font-semibold text-[#A90706] hover:underline cursor-pointer"
            >
              Upgrade Plan
            </button>
          </div>
        )}
        <form onSubmit={handleGenerate} className="grid grid-cols-1 gap-4 p-6 md:grid-cols-12">
          <div className="md:col-span-5">
            <label className="mb-1.5 block text-xs font-semibold text-[#111111]">Key Name</label>
            <input
              type="text"
              required
              disabled={keyLimitReached}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Backend Server Integration"
              className="w-full rounded-md border border-[#D4D4D4] px-3 py-2 text-sm text-[#111111] focus:border-[#111111] focus:outline-none disabled:bg-[#F5F5F5] disabled:text-[#737373]"
            />
          </div>
          <div className="md:col-span-4">
            <div className="mb-1.5 flex items-center justify-between">
              <label className="text-xs font-semibold text-[#111111]">
                Project Scope (Optional)
              </label>
              {!canUseScopedKeys && (
                <button
                  type="button"
                  onClick={() => onRequestUpgrade('scopedApiKeys')}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#A90706] hover:underline cursor-pointer"
                >
                  <Lock className="h-3 w-3" />
                  Starter+
                </button>
              )}
            </div>
            <select
              value={canUseScopedKeys ? projectKey : ''}
              disabled={keyLimitReached || !canUseScopedKeys}
              onChange={(e) => setProjectKey(e.target.value)}
              className="w-full rounded-md border border-[#D4D4D4] bg-white px-3 py-2 text-sm text-[#111111] focus:border-[#111111] focus:outline-none disabled:bg-[#F5F5F5] disabled:text-[#737373]"
            >
              <option value="">All Workspace Projects</option>
              {projects.map((p) => (
                <option key={p.docId} value={p.projectKey}>
                  {p.name} ({p.projectKey})
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end md:col-span-3">
            {keyLimitReached ? (
              <button
                type="button"
                onClick={() => onRequestUpgrade('apiKeysLimit')}
                className="inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-[#D4D4D4] bg-[#F5F5F5] px-4 py-2 text-xs font-semibold text-[#525252] hover:border-[#A90706] hover:text-[#A90706] cursor-pointer"
              >
                <Lock className="h-3.5 w-3.5" />
                Key Limit Reached
              </button>
            ) : (
              <button
                type="submit"
                disabled={creating}
                className="w-full rounded-md bg-[#A90706] px-4 py-2 text-xs font-semibold text-white hover:bg-[#8C0605] cursor-pointer disabled:opacity-50"
              >
                {creating ? 'Generating...' : 'Generate Secret Key'}
              </button>
            )}
          </div>

          <div className="md:col-span-5">
            <div className="mb-1.5 text-xs font-semibold text-[#111111]">Permissions</div>
            <div className="flex flex-wrap gap-1.5">
              {PERMISSION_SCOPES.map((perm) => {
                const active = permissions.includes(perm);
                return (
                  <button
                    key={perm}
                    type="button"
                    onClick={() => togglePermission(perm)}
                    className={`rounded border px-2.5 py-1 font-mono text-xs cursor-pointer ${
                      active
                        ? 'border-[#111111] bg-[#111111] text-white'
                        : 'border-[#D4D4D4] bg-white text-[#525252]'
                    }`}
                  >
                    {perm}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="md:col-span-7">
            <div className="mb-1.5 text-xs font-semibold text-[#111111]">Product Access</div>
            <div className="flex flex-wrap gap-1.5">
              {PRODUCT_SCOPES.map((prod) => {
                const active = products.includes(prod.id);
                return (
                  <button
                    key={prod.id}
                    type="button"
                    onClick={() => toggleProduct(prod.id)}
                    className={`rounded border px-2.5 py-1 text-xs font-medium cursor-pointer ${
                      active
                        ? 'border-[#111111] bg-[#FAFAFA] text-[#111111]'
                        : 'border-[#E5E5E5] bg-white text-[#737373]'
                    }`}
                  >
                    {active ? '✓ ' : '+ '}
                    {prod.label}
                  </button>
                );
              })}
            </div>
          </div>
        </form>
      </section>

      {/* Keys Table */}
      <section className="overflow-hidden rounded-lg border border-[#E5E5E5] bg-white">
        <div className="flex items-center justify-between border-b border-[#E5E5E5] px-6 py-4">
          <div className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-[#111111]" />
            <h2 className="text-sm font-bold text-[#111111]">Workspace API Keys</h2>
          </div>
          <span className="text-xs tabular-nums text-[#737373]">{keys.length} total</span>
        </div>

        {loading ? (
          <div className="p-8 text-center text-xs text-[#737373]">Loading API keys...</div>
        ) : keys.length === 0 ? (
          <div className="p-8 text-center text-xs text-[#737373]">
            No API keys generated yet. Create a key above for server-to-server requests.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-[#E5E5E5] bg-[#FAFAFA] text-[#525252]">
                <tr>
                  <th className="px-5 py-3">Key Name &amp; Prefix</th>
                  <th className="px-5 py-3">Scope</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Created</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EFEFEF]">
                {keys.map((k) => (
                  <tr key={k.docId} className="hover:bg-[#FAFAFA]">
                    <td className="px-5 py-3.5">
                      <div className="font-semibold text-[#111111]">{k.name}</div>
                      <div className="font-mono text-[11px] text-[#737373]">{k.keyPrefix}</div>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="font-mono text-[11px] text-[#111111]">
                        {k.permissions.join(', ')} · {k.products.join(', ')}
                      </div>
                      {k.projectKey && (
                        <div className="font-mono text-[11px] text-[#737373]">
                          Project: {k.projectKey}
                        </div>
                      )}
                    </td>
                    <td className="px-5 py-3.5">
                      <span
                        className={`font-semibold capitalize ${
                          k.status === 'active' ? 'text-[#16A34A]' : 'text-[#A90706]'
                        }`}
                      >
                        {k.status}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 font-mono text-[11px] text-[#737373]">
                      {new Date(k.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          disabled={busyDocId === k.docId}
                          onClick={() => handleRotate(k)}
                          title={canUseScopedKeys ? 'Rotate secret key' : 'Requires Starter plan'}
                          className={`inline-flex items-center gap-1 rounded border px-2.5 py-1 text-xs font-medium cursor-pointer ${
                            canUseScopedKeys
                              ? 'border-[#D4D4D4] text-[#111111] hover:bg-[#FAFAFA]'
                              : 'border-[#E5E5E5] bg-[#F5F5F5] text-[#737373] hover:border-[#A90706] hover:text-[#A90706]'
                          }`}
                        >
                          {canUseScopedKeys ? (
                            <RotateCw className="h-3 w-3" />
                          ) : (
                            <Lock className="h-3 w-3" />
                          )}
                          Rotate
                        </button>
                        {k.status === 'active' && (
                          <button
                            type="button"
                            disabled={busyDocId === k.docId}
                            onClick={() => handleRevoke(k)}
                            className="inline-flex items-center gap-1 rounded border border-[#D4D4D4] px-2.5 py-1 text-xs font-medium text-[#525252] hover:text-[#A90706] cursor-pointer"
                          >
                            <Ban className="h-3 w-3" />
                            Revoke
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={busyDocId === k.docId}
                          onClick={() => handleDelete(k)}
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
