import React, { useCallback, useEffect, useState } from 'react';
import {
  Plus,
  Code2,
  Copy,
  Trash2,
  KeyRound,
  Power,
  Pencil,
  Check,
  Search,
  Inbox,
  Lock,
} from 'lucide-react';
import { apiRequest } from '../../lib/api';
import { FormRecord } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { isFormLimitReached, type PlanLockKey } from '../../lib/planLimits';

export const FormsListView: React.FC<{
  onEditForm: (formId: number) => void;
  onOpenIntegration: (form: FormRecord, freshlyGeneratedSecret?: string) => void;
  onOpenSubmissions: (formId: number) => void;
  onRequestUpgrade: (key: PlanLockKey) => void;
}> = ({ onEditForm, onOpenIntegration, onOpenSubmissions, onRequestUpgrade }) => {
  const { workspace, refreshWorkspace } = useAuth();
  const [forms, setForms] = useState<FormRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [creating, setCreating] = useState(false);
  const [rotatedSecretModal, setRotatedSecretModal] = useState<{
    formTitle: string;
    secretKey: string;
  } | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);

  const loadForms = useCallback(async () => {
    try {
      setError(null);
      const res = await apiRequest<{ forms: FormRecord[] }>('/api/forms');
      setForms(res.forms);
    } catch (err: any) {
      setError(err.message || 'Failed to load forms');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadForms();
  }, [loadForms]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const res = await apiRequest<{ form: FormRecord; newSecretApiKey: string }>('/api/forms', {
        method: 'POST',
        body: { title: newTitle.trim(), description: newDesc.trim(), status: 'published' },
      });
      setShowCreateModal(false);
      setNewTitle('');
      setNewDesc('');
      await refreshWorkspace();
      onEditForm(res.form.id);
    } catch (err: any) {
      setError(err.message || 'Could not create form');
    } finally {
      setCreating(false);
    }
  };

  const limitReached = isFormLimitReached(workspace, forms.length);

  const handleDuplicate = async (formId: number) => {
    if (limitReached) {
      onRequestUpgrade('formsLimit');
      return;
    }
    try {
      setError(null);
      await apiRequest(`/api/forms/${formId}/duplicate`, { method: 'POST' });
      await Promise.all([loadForms(), refreshWorkspace()]);
    } catch (err: any) {
      setError(err.message || 'Duplicate failed');
    }
  };

  const handleToggleStatus = async (form: FormRecord) => {
    const nextStatus = form.status === 'published' ? 'inactive' : 'published';
    try {
      setError(null);
      await apiRequest(`/api/forms/${form.id}`, {
        method: 'PUT',
        body: {
          title: form.title,
          description: form.description,
          fields: form.fields,
          status: nextStatus,
          successMessage: form.successMessage,
          redirectUrl: form.redirectUrl,
          allowedDomains: form.allowedDomains,
          spamProtection: form.spamProtection,
          emailConfig: form.emailConfig,
        },
      });
      await loadForms();
    } catch (err: any) {
      setError(err.message || 'Failed to update status');
    }
  };

  const handleRotateKey = async (form: FormRecord) => {
    try {
      setError(null);
      const res = await apiRequest<{ form: FormRecord; newSecretApiKey: string }>(
        `/api/forms/${form.id}/rotate-key`,
        { method: 'POST' }
      );
      setRotatedSecretModal({ formTitle: form.title, secretKey: res.newSecretApiKey });
      setCopiedKey(false);
      await loadForms();
    } catch (err: any) {
      setError(err.message || 'Failed to rotate API key');
    }
  };

  const handleDelete = async (form: FormRecord) => {
    try {
      setError(null);
      await apiRequest(`/api/forms/${form.id}`, { method: 'DELETE' });
      await Promise.all([loadForms(), refreshWorkspace()]);
    } catch (err: any) {
      setError(err.message || 'Failed to delete form');
    }
  };

  const filtered = forms.filter(
    (f) =>
      f.title.toLowerCase().includes(search.toLowerCase()) ||
      f.formKey.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-[#737373] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search forms by name or Form ID..."
            className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-[#E5E5E5] rounded-lg focus:outline-none focus:border-[#111111]"
          />
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-xs font-mono tabular-nums text-[#737373]">
            {forms.length} / {workspace?.limits.maxForms ?? 2} forms
          </span>
          <button
            onClick={() => (limitReached ? onRequestUpgrade('formsLimit') : setShowCreateModal(true))}
            className={`inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              limitReached
                ? 'border border-[#D4D4D4] bg-[#F5F5F5] text-[#737373] hover:border-[#A90706] hover:text-[#A90706]'
                : 'text-white bg-[#A90706] hover:bg-[#8C0605]'
            }`}
          >
            {limitReached ? (
              <>
                <Lock className="w-4 h-4" />
                Form Limit Reached
              </>
            ) : (
              <>
                <Plus className="w-4 h-4" />
                Create Form
              </>
            )}
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-[#FEF2F2] border border-[#FECACA] rounded-lg text-sm text-[#A90706]">
          {error}
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 bg-white border border-[#E5E5E5] rounded-lg animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white border border-[#E5E5E5] rounded-lg p-12 text-center">
          <h3 className="text-base font-bold text-[#111111]">No forms created yet</h3>
          <p className="text-sm text-[#525252] mt-1 mb-6 max-w-md mx-auto">
            Create your first form to get a unique submission endpoint, email notification routing,
            and copy-ready HTML/JavaScript/REST integration code.
          </p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-[#A90706] hover:bg-[#8C0605] rounded-lg cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Create First Form
          </button>
        </div>
      ) : (
        <div className="bg-white border border-[#E5E5E5] rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#E5E5E5] bg-[#FAFAFA] text-xs font-semibold text-[#525252]">
                  <th className="py-3.5 px-6">Form</th>
                  <th className="py-3.5 px-4">Form ID</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4 text-right">Submissions</th>
                  <th className="py-3.5 px-4">Recipients</th>
                  <th className="py-3.5 px-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EFEFEF] text-sm">
                {filtered.map((form) => (
                  <tr key={form.id} className="hover:bg-[#FAFAFA] transition-colors">
                    <td className="py-4 px-6">
                      <button
                        onClick={() => onEditForm(form.id)}
                        className="font-semibold text-[#111111] hover:text-[#A90706] text-left cursor-pointer"
                      >
                        {form.title}
                      </button>
                      <div className="text-xs text-[#737373] mt-0.5">
                        {form.fields.length} fields · Updated{' '}
                        {new Date(form.updatedAt).toLocaleDateString()}
                      </div>
                    </td>
                    <td className="py-4 px-4 font-mono text-xs text-[#333333] whitespace-nowrap">
                      {form.formKey}
                    </td>
                    <td className="py-4 px-4 whitespace-nowrap">
                      <span
                        className={`text-xs font-semibold capitalize ${
                          form.status === 'published'
                            ? 'text-[#16A34A]'
                            : form.status === 'suspended'
                              ? 'text-[#A90706]'
                              : 'text-[#737373]'
                        }`}
                      >
                        {form.status}
                      </span>
                    </td>
                    <td className="py-4 px-4 text-right font-mono tabular-nums whitespace-nowrap">
                      <button
                        onClick={() => onOpenSubmissions(form.id)}
                        className="text-[#111111] hover:text-[#A90706] font-semibold cursor-pointer"
                      >
                        {form.submissionCount ?? 0}
                        {(form.unreadCount ?? 0) > 0 && (
                          <span className="ml-1.5 text-xs text-[#A90706]">
                            ({form.unreadCount} new)
                          </span>
                        )}
                      </button>
                    </td>
                    <td className="py-4 px-4 text-xs text-[#525252] max-w-[200px] truncate">
                      {form.emailConfig?.notificationsEnabled
                        ? (form.emailConfig.recipients || []).join(', ') || 'None configured'
                        : 'Paused'}
                    </td>
                    <td className="py-4 px-6 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1">
                        <button
                          onClick={() => onEditForm(form.id)}
                          title="Edit in Builder"
                          className="p-2 text-[#525252] hover:text-[#111111] hover:bg-[#EFEFEF] rounded-md cursor-pointer"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => onOpenIntegration(form)}
                          title="Integration Code"
                          className="p-2 text-[#525252] hover:text-[#A90706] hover:bg-[#FEF2F2] rounded-md cursor-pointer"
                        >
                          <Code2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => onOpenSubmissions(form.id)}
                          title="Submissions"
                          className="p-2 text-[#525252] hover:text-[#111111] hover:bg-[#EFEFEF] rounded-md cursor-pointer"
                        >
                          <Inbox className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDuplicate(form.id)}
                          title={limitReached ? 'Form limit reached — click to upgrade' : 'Duplicate Form'}
                          className={`p-2 rounded-md cursor-pointer ${
                            limitReached
                              ? 'text-[#A3A3A3] bg-[#FAFAFA] hover:text-[#A90706]'
                              : 'text-[#525252] hover:text-[#111111] hover:bg-[#EFEFEF]'
                          }`}
                        >
                          {limitReached ? <Lock className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                        </button>
                        <button
                          onClick={() => handleRotateKey(form)}
                          title="Rotate Secret API Key"
                          className="p-2 text-[#525252] hover:text-[#111111] hover:bg-[#EFEFEF] rounded-md cursor-pointer"
                        >
                          <KeyRound className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleToggleStatus(form)}
                          disabled={form.status === 'suspended'}
                          title={form.status === 'published' ? 'Deactivate Form' : 'Publish Form'}
                          className="p-2 text-[#525252] hover:text-[#111111] hover:bg-[#EFEFEF] rounded-md disabled:opacity-40 cursor-pointer"
                        >
                          <Power className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(form)}
                          title="Delete Form"
                          className="p-2 text-[#525252] hover:text-[#A90706] hover:bg-[#FEF2F2] rounded-md cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create Form Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-[#E5E5E5] rounded-xl w-full max-w-md p-6">
            <h3 className="text-lg font-bold text-[#111111]">Create New Form</h3>
            <p className="text-xs text-[#525252] mt-1 mb-5">
              Start with default contact fields that you can customize in the visual builder.
            </p>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#111111] mb-1.5">
                  Form Title
                </label>
                <input
                  type="text"
                  required
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="e.g., Sales Inquiry Form"
                  className="w-full px-3 py-2 text-sm border border-[#D4D4D4] rounded-lg focus:outline-none focus:border-[#111111]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#111111] mb-1.5">
                  Description (optional)
                </label>
                <textarea
                  rows={3}
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  placeholder="Short subtitle shown to respondents..."
                  className="w-full px-3 py-2 text-sm border border-[#D4D4D4] rounded-lg focus:outline-none focus:border-[#111111]"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 text-sm font-medium text-[#525252] hover:text-[#111111] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="px-4 py-2 text-sm font-semibold text-white bg-[#A90706] hover:bg-[#8C0605] rounded-lg disabled:opacity-60 cursor-pointer"
                >
                  {creating ? 'Creating...' : 'Create & Open Builder'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Rotated API Secret Key Modal */}
      {rotatedSecretModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-[#E5E5E5] rounded-xl w-full max-w-lg p-6">
            <h3 className="text-lg font-bold text-[#111111]">New Secret API Key Generated</h3>
            <p className="text-xs text-[#525252] mt-1 mb-4">
              Copy this secret key for <strong>{rotatedSecretModal.formTitle}</strong> now. For your
              security, it will not be displayed again in plaintext.
            </p>
            <div className="flex items-center gap-2 p-3 bg-[#F5F5F5] border border-[#E5E5E5] rounded-lg">
              <code className="text-xs font-mono text-[#111111] break-all flex-1">
                {rotatedSecretModal.secretKey}
              </code>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(rotatedSecretModal.secretKey);
                  setCopiedKey(true);
                }}
                className="px-3 py-1.5 text-xs font-semibold bg-[#111111] text-white rounded-md whitespace-nowrap cursor-pointer inline-flex items-center gap-1"
              >
                {copiedKey ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copiedKey ? 'Copied' : 'Copy'}
              </button>
            </div>
            <div className="flex justify-end mt-5">
              <button
                onClick={() => setRotatedSecretModal(null)}
                className="px-4 py-2 text-sm font-semibold text-white bg-[#A90706] rounded-lg cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
