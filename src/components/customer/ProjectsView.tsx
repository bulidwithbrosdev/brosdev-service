import React, { useCallback, useEffect, useState } from 'react';
import {
  FolderKanban,
  Plus,
  Globe,
  CheckCircle2,
  Copy,
  Check,
  Trash2,
  RefreshCw,
  Lock,
} from 'lucide-react';
import {
  createProject,
  deleteProject,
  listProjects,
  updateProject,
} from '../../lib/devServicesApi';
import type { PlanLockKey } from '../../lib/planLimits';
import type { DeveloperProductId, ProjectRecord, WorkspaceMe } from '../../types';

const PRODUCT_OPTIONS: Array<{ id: DeveloperProductId; label: string }> = [
  { id: 'forms', label: 'Forms API' },
  { id: 'email', label: 'Email Alerts' },
  { id: 'webhooks', label: 'Webhooks' },
  { id: 'newsletter', label: 'Newsletter' },
  { id: 'qr_generator', label: 'QR Code' },
  { id: 'url_shortener', label: 'URL Shortener' },
  { id: 'pdf_generator', label: 'PDF Generator' },
];

interface ProjectsViewProps {
  workspace: WorkspaceMe;
  onRequestUpgrade: (key: PlanLockKey) => void;
}

export const ProjectsView: React.FC<ProjectsViewProps> = ({ workspace, onRequestUpgrade }) => {
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const maxProjects = workspace.limits.maxProjects ?? 1;
  const projectLimitReached = projects.length >= maxProjects;

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [domainsInput, setDomainsInput] = useState('');
  const [selectedProducts, setSelectedProducts] = useState<DeveloperProductId[]>([
    'forms',
    'email',
    'webhooks',
    'newsletter',
  ]);
  const [creating, setCreating] = useState(false);

  const [domainDrafts, setDomainDrafts] = useState<Record<string, string>>({});
  const [busyDocId, setBusyDocId] = useState<string | null>(null);
  const [copiedText, setCopiedText] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const list = await listProjects();
      setProjects(list);
    } catch (err: any) {
      setError(err?.message || 'Unable to load projects.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const copyText = (val: string) => {
    navigator.clipboard.writeText(val);
    setCopiedText(val);
    setTimeout(() => setCopiedText(null), 1800);
  };

  const toggleCreateProduct = (id: DeveloperProductId) => {
    setSelectedProducts((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (projectLimitReached) {
      onRequestUpgrade('projectsLimit');
      return;
    }
    setError('');
    setNotice('');
    setCreating(true);
    try {
      const domains = domainsInput
        .split(/[\n,]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      const created = await createProject({
        name,
        description,
        allowedDomains: domains,
        enabledProducts: selectedProducts.length > 0 ? selectedProducts : ['forms'],
      });
      setName('');
      setDescription('');
      setDomainsInput('');
      setNotice(`Project "${created.name}" (${created.projectKey}) created.`);
      await load();
    } catch (err: any) {
      setError(err?.message || 'Failed to create project.');
    } finally {
      setCreating(false);
    }
  };

  const handleAddDomain = async (project: ProjectRecord) => {
    const raw = (domainDrafts[project.docId] || '').trim();
    if (!raw) return;
    setBusyDocId(project.docId);
    setError('');
    try {
      await updateProject(project.docId, {
        allowedDomains: [...project.allowedDomains, raw],
      });
      setDomainDrafts((prev) => ({ ...prev, [project.docId]: '' }));
      await load();
    } catch (err: any) {
      setError(err?.message || 'Failed to add domain.');
    } finally {
      setBusyDocId(null);
    }
  };

  const handleVerifyDomain = async (project: ProjectRecord, domain: string) => {
    setBusyDocId(project.docId);
    setError('');
    try {
      const nextVerified = project.verifiedDomains.includes(domain)
        ? project.verifiedDomains
        : [...project.verifiedDomains, domain];
      await updateProject(project.docId, { verifiedDomains: nextVerified });
      setNotice(`Marked ${domain} as verified for ${project.name}.`);
      await load();
    } catch (err: any) {
      setError(err?.message || 'Failed to verify domain.');
    } finally {
      setBusyDocId(null);
    }
  };

  const handleRemoveDomain = async (project: ProjectRecord, domain: string) => {
    setBusyDocId(project.docId);
    setError('');
    try {
      await updateProject(project.docId, {
        allowedDomains: project.allowedDomains.filter((d) => d !== domain),
        verifiedDomains: project.verifiedDomains.filter((d) => d !== domain),
      });
      await load();
    } catch (err: any) {
      setError(err?.message || 'Failed to remove domain.');
    } finally {
      setBusyDocId(null);
    }
  };

  const handleToggleProjectProduct = async (
    project: ProjectRecord,
    prodId: DeveloperProductId
  ) => {
    setBusyDocId(project.docId);
    setError('');
    try {
      const has = project.enabledProducts.includes(prodId);
      const next = has
        ? project.enabledProducts.filter((p) => p !== prodId)
        : [...project.enabledProducts, prodId];
      await updateProject(project.docId, {
        enabledProducts: next.length > 0 ? next : ['forms'],
      });
      await load();
    } catch (err: any) {
      setError(err?.message || 'Failed to update project products.');
    } finally {
      setBusyDocId(null);
    }
  };

  const handleDelete = async (project: ProjectRecord) => {
    setBusyDocId(project.docId);
    setError('');
    try {
      await deleteProject(project.docId);
      setNotice(`Deleted project "${project.name}".`);
      await load();
    } catch (err: any) {
      setError(err?.message || 'Failed to delete project.');
    } finally {
      setBusyDocId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#111111]">
            Projects &amp; Website Domains
          </h1>
          <p className="mt-1 text-sm text-[#525252]">
            Organize apps by project, manage allowed website domains, verify DNS ownership, and toggle active BrosDev services.
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
      {notice && (
        <div className="rounded-md border border-[#16A34A]/30 bg-[#F0FDF4] px-4 py-3 text-xs font-medium text-[#15803D]">
          {notice}
        </div>
      )}

      {/* Create Project Form */}
      <section className="rounded-lg border border-[#E5E5E5] bg-white">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E5E5E5] px-6 py-4">
          <div className="flex items-center gap-2">
            <Plus className="h-4 w-4 text-[#A90706]" />
            <h2 className="text-sm font-bold text-[#111111]">Create New Project</h2>
          </div>
          <div className="flex items-center gap-3">
            <span className="font-mono text-xs tabular-nums text-[#525252]">
              {projects.length} / {maxProjects} projects used ({workspace.plan?.name || 'Free'})
            </span>
            {projectLimitReached && (
              <button
                type="button"
                onClick={() => onRequestUpgrade('projectsLimit')}
                className="inline-flex items-center gap-1 rounded bg-[#A90706] px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-[#8C0605] cursor-pointer"
              >
                <Lock className="h-3 w-3" />
                Upgrade Limit
              </button>
            )}
          </div>
        </div>
        {projectLimitReached && (
          <div className="mx-6 mt-5 flex flex-wrap items-center justify-between gap-3 rounded-md border border-[#111111] bg-[#FAFAFA] px-4 py-3 text-xs">
            <div className="flex items-center gap-2 text-[#111111]">
              <Lock className="h-3.5 w-3.5 text-[#A90706] shrink-0" />
              <span>
                Project limit reached ({projects.length}/{maxProjects}) on your{' '}
                <strong>{workspace.plan?.name || 'Free'}</strong> plan. Upgrade to create additional projects.
              </span>
            </div>
            <button
              type="button"
              onClick={() => onRequestUpgrade('projectsLimit')}
              className="font-semibold text-[#A90706] hover:underline cursor-pointer"
            >
              View Upgrade Options
            </button>
          </div>
        )}
        <form onSubmit={handleCreate} className="grid grid-cols-1 gap-4 p-6 md:grid-cols-12">
          <div className="md:col-span-4">
            <label className="mb-1.5 block text-xs font-semibold text-[#111111]">Project Name</label>
            <input
              type="text"
              required
              disabled={projectLimitReached}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Marketing Website"
              className="w-full rounded-md border border-[#D4D4D4] bg-white px-3 py-2 text-sm text-[#111111] focus:border-[#111111] focus:outline-none disabled:bg-[#F5F5F5] disabled:text-[#737373]"
            />
          </div>
          <div className="md:col-span-4">
            <label className="mb-1.5 block text-xs font-semibold text-[#111111]">
              Allowed Website Domains (comma separated)
            </label>
            <input
              type="text"
              disabled={projectLimitReached}
              value={domainsInput}
              onChange={(e) => setDomainsInput(e.target.value)}
              placeholder="brosdev.info, app.brosdev.info"
              className="w-full rounded-md border border-[#D4D4D4] bg-white px-3 py-2 font-mono text-xs text-[#111111] focus:border-[#111111] focus:outline-none disabled:bg-[#F5F5F5] disabled:text-[#737373]"
            />
          </div>
          <div className="md:col-span-4">
            <label className="mb-1.5 block text-xs font-semibold text-[#111111]">Description</label>
            <input
              type="text"
              disabled={projectLimitReached}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Production customer-facing web apps"
              className="w-full rounded-md border border-[#D4D4D4] bg-white px-3 py-2 text-sm text-[#111111] focus:border-[#111111] focus:outline-none disabled:bg-[#F5F5F5] disabled:text-[#737373]"
            />
          </div>

          <div className="md:col-span-9">
            <div className="mb-1.5 text-xs font-semibold text-[#111111]">Enabled Products</div>
            <div className="flex flex-wrap gap-2">
              {PRODUCT_OPTIONS.map((opt) => {
                const active = selectedProducts.includes(opt.id);
                return (
                  <button
                    key={opt.id}
                    type="button"
                    disabled={projectLimitReached}
                    onClick={() => toggleCreateProduct(opt.id)}
                    className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                      active
                        ? 'border-[#111111] bg-[#111111] text-white'
                        : 'border-[#D4D4D4] bg-white text-[#525252] hover:border-[#111111]'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-end md:col-span-3">
            {projectLimitReached ? (
              <button
                type="button"
                onClick={() => onRequestUpgrade('projectsLimit')}
                className="inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-[#D4D4D4] bg-[#F5F5F5] px-4 py-2 text-xs font-semibold text-[#525252] hover:border-[#A90706] hover:text-[#A90706] cursor-pointer"
              >
                <Lock className="h-3.5 w-3.5" />
                Project Limit Reached
              </button>
            ) : (
              <button
                type="submit"
                disabled={creating}
                className="w-full rounded-md bg-[#A90706] px-4 py-2 text-xs font-semibold text-white hover:bg-[#8C0605] cursor-pointer disabled:opacity-50"
              >
                {creating ? 'Creating...' : 'Create Project'}
              </button>
            )}
          </div>
        </form>
      </section>

      {/* Projects List */}
      {loading ? (
        <div className="rounded-lg border border-[#E5E5E5] bg-white p-8 text-center text-xs text-[#737373]">
          Loading workspace projects...
        </div>
      ) : projects.length === 0 ? (
        <div className="rounded-lg border border-[#E5E5E5] bg-white p-10 text-center">
          <FolderKanban className="mx-auto h-8 w-8 text-[#A3A3A3]" />
          <h3 className="mt-3 text-sm font-bold text-[#111111]">No Projects Yet</h3>
          <p className="mt-1 text-xs text-[#737373]">
            Create your first project above to group forms, API keys, webhooks, and verified domains.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {projects.map((project) => (
            <section
              key={project.docId}
              className="rounded-lg border border-[#E5E5E5] bg-white p-6 space-y-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#EFEFEF] pb-4">
                <div>
                  <div className="flex items-center gap-2.5">
                    <h3 className="text-base font-bold text-[#111111]">{project.name}</h3>
                    <span className="font-mono text-xs text-[#737373]">· {project.projectKey}</span>
                  </div>
                  {project.description && (
                    <p className="mt-1 text-xs text-[#525252]">{project.description}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => copyText(project.projectKey)}
                    className="inline-flex items-center gap-1 rounded border border-[#D4D4D4] bg-white px-2.5 py-1.5 text-xs font-medium text-[#111111] hover:bg-[#FAFAFA] cursor-pointer"
                  >
                    {copiedText === project.projectKey ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-[#16A34A]" />
                        Copied ID
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" />
                        Copy Project ID
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    disabled={busyDocId === project.docId}
                    onClick={() => handleDelete(project)}
                    className="inline-flex items-center gap-1 rounded border border-[#E5E5E5] bg-white px-2.5 py-1.5 text-xs font-medium text-[#737373] hover:border-[#A90706] hover:text-[#A90706] cursor-pointer disabled:opacity-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete
                  </button>
                </div>
              </div>

              {/* Enabled Products */}
              <div>
                <div className="mb-2 text-xs font-semibold text-[#525252]">Enabled Services</div>
                <div className="flex flex-wrap gap-2">
                  {PRODUCT_OPTIONS.map((opt) => {
                    const enabled = project.enabledProducts.includes(opt.id);
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        disabled={busyDocId === project.docId}
                        onClick={() => handleToggleProjectProduct(project, opt.id)}
                        className={`rounded border px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer disabled:opacity-50 ${
                          enabled
                            ? 'border-[#111111] bg-[#FAFAFA] text-[#111111]'
                            : 'border-[#E5E5E5] bg-white text-[#A3A3A3]'
                        }`}
                      >
                        {enabled ? '✓ ' : '+ '}
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Allowed & Verified Website Domains */}
              <div className="space-y-3 border-t border-[#EFEFEF] pt-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-[#111111]">
                    <Globe className="h-3.5 w-3.5 text-[#525252]" />
                    Website Domains &amp; DNS TXT Verification
                  </div>
                  <button
                    type="button"
                    onClick={() => copyText(project.verificationToken)}
                    className="inline-flex items-center gap-1.5 font-mono text-[11px] text-[#525252] hover:text-[#111111] cursor-pointer"
                  >
                    TXT: {project.verificationToken}
                    {copiedText === project.verificationToken ? (
                      <Check className="h-3 w-3 text-[#16A34A]" />
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
                  </button>
                </div>

                <div className="flex gap-2">
                  <input
                    type="text"
                    value={domainDrafts[project.docId] || ''}
                    onChange={(e) =>
                      setDomainDrafts((prev) => ({ ...prev, [project.docId]: e.target.value }))
                    }
                    placeholder="Add domain (e.g. client-site.com)"
                    className="flex-1 rounded-md border border-[#D4D4D4] px-3 py-1.5 font-mono text-xs text-[#111111] focus:border-[#111111] focus:outline-none"
                  />
                  <button
                    type="button"
                    disabled={busyDocId === project.docId}
                    onClick={() => handleAddDomain(project)}
                    className="rounded-md bg-[#111111] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-[#262626] cursor-pointer disabled:opacity-50"
                  >
                    Add Domain
                  </button>
                </div>

                {project.allowedDomains.length > 0 && (
                  <div className="divide-y divide-[#F0F0F0] rounded-md border border-[#E5E5E5]">
                    {project.allowedDomains.map((domain) => {
                      const verified = project.verifiedDomains.includes(domain);
                      return (
                        <div
                          key={domain}
                          className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 text-xs"
                        >
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-medium text-[#111111]">{domain}</span>
                            <span className="text-[#D4D4D4]">·</span>
                            {verified ? (
                              <span className="inline-flex items-center gap-1 font-semibold text-[#16A34A]">
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                Verified
                              </span>
                            ) : (
                              <span className="text-[#B45309]">Pending TXT record</span>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            {!verified && (
                              <button
                                type="button"
                                disabled={busyDocId === project.docId}
                                onClick={() => handleVerifyDomain(project, domain)}
                                className="rounded border border-[#D4D4D4] px-2.5 py-1 text-xs font-semibold text-[#111111] hover:bg-[#FAFAFA] cursor-pointer"
                              >
                                Mark Verified
                              </button>
                            )}
                            <button
                              type="button"
                              disabled={busyDocId === project.docId}
                              onClick={() => handleRemoveDomain(project, domain)}
                              className="text-xs text-[#737373] hover:text-[#A90706] cursor-pointer"
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
};
