import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  ArrowUp,
  ArrowDown,
  Trash2,
  GripVertical,
  Eye,
  Save,
  Code2,
  Mail,
  Settings2,
  Sliders,
  Plus,
  X,
  CheckCircle2,
  Send,
} from 'lucide-react';
import { apiRequest } from '../../lib/api';
import { FieldType, FormFieldConfig, FormRecord } from '../../types';
import { useAuth } from '../../context/AuthContext';

const FIELD_PALETTE: Array<{ type: FieldType; label: string; category: string }> = [
  { type: 'short_text', label: 'Short Text', category: 'Inputs' },
  { type: 'long_text', label: 'Long Text', category: 'Inputs' },
  { type: 'email', label: 'Email', category: 'Inputs' },
  { type: 'phone', label: 'Phone', category: 'Inputs' },
  { type: 'number', label: 'Number', category: 'Inputs' },
  { type: 'url', label: 'URL', category: 'Inputs' },
  { type: 'date', label: 'Date', category: 'Inputs' },
  { type: 'dropdown', label: 'Dropdown', category: 'Choices' },
  { type: 'radio', label: 'Radio Buttons', category: 'Choices' },
  { type: 'checkbox', label: 'Checkboxes', category: 'Choices' },
  { type: 'file', label: 'File Upload', category: 'Special' },
  { type: 'hidden', label: 'Hidden Field', category: 'Special' },
  { type: 'heading', label: 'Section Heading', category: 'Layout' },
  { type: 'divider', label: 'Divider', category: 'Layout' },
  { type: 'submit', label: 'Submit Button', category: 'Layout' },
];

function createDefaultField(type: FieldType): FormFieldConfig {
  const uid = `fld_${Math.random().toString(36).slice(2, 8)}`;
  const meta = FIELD_PALETTE.find((f) => f.type === type);
  const baseName = `${type}_${uid.slice(-4)}`;

  if (type === 'submit') {
    return { id: uid, type, name: 'submit', label: 'Submit Form', width: 'full' };
  }
  if (type === 'heading') {
    return { id: uid, type, name: baseName, label: 'Section Title', width: 'full' };
  }
  if (type === 'divider') {
    return { id: uid, type, name: baseName, label: 'Divider', width: 'full' };
  }
  if (type === 'dropdown' || type === 'radio' || type === 'checkbox') {
    return {
      id: uid,
      type,
      name: baseName,
      label: meta?.label || 'Selection',
      required: false,
      width: 'full',
      options: ['Option 1', 'Option 2', 'Option 3'],
    };
  }
  return {
    id: uid,
    type,
    name: type === 'email' ? 'email' : baseName,
    label: meta?.label || 'Field',
    placeholder: type === 'email' ? 'you@company.com' : `Enter ${meta?.label?.toLowerCase()}`,
    required: type === 'email',
    width: 'full',
  };
}

export const FormBuilderView: React.FC<{
  formId: number;
  onBack: () => void;
  onOpenIntegration: (form: FormRecord) => void;
}> = ({ formId, onBack, onOpenIntegration }) => {
  const { workspace } = useAuth();
  const [form, setForm] = useState<FormRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedToast, setSavedToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [rightTab, setRightTab] = useState<'field' | 'email' | 'settings'>('field');
  const [previewMode, setPreviewMode] = useState(false);
  const [showEmailPreview, setShowEmailPreview] = useState(false);

  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [newRecipient, setNewRecipient] = useState('');
  const [newDomain, setNewDomain] = useState('');

  // Interactive Live Preview submission test state
  const [previewValues, setPreviewValues] = useState<Record<string, any>>({});
  const [previewSubmitResult, setPreviewSubmitResult] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);
  const [previewSubmitting, setPreviewSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    apiRequest<{ form: FormRecord }>(`/api/forms/${formId}`)
      .then((res) => {
        if (!active) return;
        setForm(res.form);
        if (res.form.fields?.[0]) setSelectedFieldId(res.form.fields[0].id);
      })
      .catch((err) => {
        if (active) setError(err.message || 'Failed to load form');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [formId]);

  const handleSave = async (overrideStatus?: 'draft' | 'published' | 'inactive') => {
    if (!form) return;
    setSaving(true);
    setError(null);
    setSavedToast(null);
    try {
      const nextStatus = overrideStatus || (form.status === 'suspended' ? 'inactive' : form.status);
      const res = await apiRequest<{ form: FormRecord }>(`/api/forms/${form.id}`, {
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
      setForm(res.form);
      setSavedToast(overrideStatus === 'published' ? 'Form saved and published' : 'Changes saved');
      setTimeout(() => setSavedToast(null), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to save form');
    } finally {
      setSaving(false);
    }
  };

  const addField = (type: FieldType) => {
    if (!form) return;
    const field = createDefaultField(type);
    const nextFields = [...form.fields];
    const submitIdx = nextFields.findIndex((f) => f.type === 'submit');
    if (type !== 'submit' && submitIdx !== -1) {
      nextFields.splice(submitIdx, 0, field);
    } else {
      nextFields.push(field);
    }
    setForm({ ...form, fields: nextFields });
    setSelectedFieldId(field.id);
    setRightTab('field');
  };

  const updateField = (id: string, patch: Partial<FormFieldConfig>) => {
    if (!form) return;
    setForm({
      ...form,
      fields: form.fields.map((f) => (f.id === id ? { ...f, ...patch } : f)),
    });
  };

  const removeField = (id: string) => {
    if (!form) return;
    const next = form.fields.filter((f) => f.id !== id);
    setForm({ ...form, fields: next });
    if (selectedFieldId === id) {
      setSelectedFieldId(next[0]?.id || null);
    }
  };

  const moveField = (fromIdx: number, toIdx: number) => {
    if (!form || toIdx < 0 || toIdx >= form.fields.length || fromIdx === toIdx) return;
    const next = [...form.fields];
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved);
    setForm({ ...form, fields: next });
  };

  const handlePreviewSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;
    setPreviewSubmitting(true);
    setPreviewSubmitResult(null);
    try {
      const res = await fetch(`/api/submit/${form.formKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(previewValues),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        setPreviewSubmitResult({
          ok: true,
          message: `${json.message || form.successMessage} (Email status: ${json.emailDeliveryStatus || 'processed'})`,
        });
        setPreviewValues({});
      } else {
        setPreviewSubmitResult({
          ok: false,
          message: json.error || 'Submission rejected',
        });
      }
    } catch {
      setPreviewSubmitResult({ ok: false, message: 'Network error sending test submission' });
    } finally {
      setPreviewSubmitting(false);
    }
  };

  if (loading || !form) {
    return (
      <div className="bg-white border border-[#E5E5E5] rounded-lg p-12 text-center text-sm text-[#525252]">
        {error || 'Loading form builder...'}
      </div>
    );
  }

  const selectedField = form.fields.find((f) => f.id === selectedFieldId) || null;
  const emailCapableFields = form.fields.filter(
    (f) => f.type === 'email' || f.type === 'short_text'
  );
  const verifiedSender = workspace?.platformEmailSender?.defaultSenderEmail || 'forms@brosdev.xyz';

  return (
    <div className="space-y-4">
      {/* Builder Top Action Bar */}
      <div className="bg-white border border-[#E5E5E5] rounded-lg px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={onBack}
            className="p-2 text-[#525252] hover:text-[#111111] hover:bg-[#F5F5F5] rounded-md cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="min-w-0">
            <div className="font-bold text-sm text-[#111111] truncate">{form.title}</div>
            <div className="text-xs text-[#737373] font-mono">
              {form.formKey} · <span className="capitalize">{form.status}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {savedToast && (
            <span className="text-xs font-semibold text-[#16A34A] mr-2 inline-flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" />
              {savedToast}
            </span>
          )}
          <button
            onClick={() => {
              setPreviewMode(!previewMode);
              setPreviewSubmitResult(null);
            }}
            className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-md border transition-colors whitespace-nowrap cursor-pointer ${
              previewMode
                ? 'bg-[#111111] text-white border-[#111111]'
                : 'bg-white text-[#111111] border-[#D4D4D4] hover:bg-[#F5F5F5]'
            }`}
          >
            <Eye className="w-3.5 h-3.5" />
            {previewMode ? 'Back to Editor' : 'Live Preview'}
          </button>
          <button
            onClick={() => onOpenIntegration(form)}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-[#111111] bg-white border border-[#D4D4D4] hover:bg-[#F5F5F5] rounded-md whitespace-nowrap cursor-pointer"
          >
            <Code2 className="w-3.5 h-3.5" />
            Integration Code
          </button>
          <button
            onClick={() => handleSave()}
            disabled={saving}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-[#111111] bg-[#F5F5F5] hover:bg-[#E5E5E5] rounded-md whitespace-nowrap cursor-pointer"
          >
            <Save className="w-3.5 h-3.5" />
            {saving ? 'Saving...' : 'Save'}
          </button>
          <button
            onClick={() => handleSave('published')}
            disabled={saving}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#A90706] hover:bg-[#8C0605] rounded-md whitespace-nowrap cursor-pointer"
          >
            Save & Publish
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3.5 bg-[#FEF2F2] border border-[#FECACA] rounded-lg text-sm text-[#A90706]">
          {error}
        </div>
      )}

      {previewMode ? (
        /* Interactive Live Preview */
        <div className="bg-white border border-[#E5E5E5] rounded-lg p-6 md:p-10 max-w-2xl mx-auto">
          <div className="pb-5 mb-6 border-b border-[#E5E5E5]">
            <h2 className="text-xl font-bold text-[#111111]">{form.title}</h2>
            {form.description && <p className="text-sm text-[#525252] mt-1">{form.description}</p>}
            <p className="text-xs text-[#737373] mt-2">
              Live interactive preview — submitting sends a real request to{' '}
              <code className="font-mono">/api/submit/{form.formKey}</code>
            </p>
          </div>

          <form onSubmit={handlePreviewSubmit} className="grid grid-cols-12 gap-4">
            {form.fields.map((field) => {
              const colSpan = field.width === 'half' ? 'col-span-12 sm:col-span-6' : 'col-span-12';
              if (field.type === 'divider') {
                return <hr key={field.id} className="col-span-12 border-[#E5E5E5] my-2" />;
              }
              if (field.type === 'heading') {
                return (
                  <h3 key={field.id} className="col-span-12 text-base font-bold text-[#111111] pt-2">
                    {field.label}
                  </h3>
                );
              }
              if (field.type === 'hidden') {
                return (
                  <div key={field.id} className="col-span-12 text-xs font-mono text-[#737373]">
                    Hidden field: {field.name} = "{field.defaultValue || ''}"
                  </div>
                );
              }
              if (field.type === 'submit') {
                return (
                  <div key={field.id} className="col-span-12 pt-2">
                    <button
                      type="submit"
                      disabled={previewSubmitting}
                      className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-[#A90706] hover:bg-[#8C0605] rounded-lg cursor-pointer"
                    >
                      <Send className="w-4 h-4" />
                      {previewSubmitting ? 'Submitting...' : field.label || 'Submit'}
                    </button>
                  </div>
                );
              }

              return (
                <div key={field.id} className={colSpan}>
                  <label className="block text-xs font-semibold text-[#111111] mb-1.5">
                    {field.label}
                    {field.required && <span className="text-[#A90706] ml-0.5">*</span>}
                  </label>
                  {field.type === 'long_text' ? (
                    <textarea
                      rows={4}
                      required={field.required}
                      placeholder={field.placeholder}
                      value={previewValues[field.name] ?? field.defaultValue ?? ''}
                      onChange={(e) =>
                        setPreviewValues({ ...previewValues, [field.name]: e.target.value })
                      }
                      className="w-full px-3 py-2 text-sm border border-[#D4D4D4] rounded-lg focus:outline-none focus:border-[#111111]"
                    />
                  ) : field.type === 'dropdown' ? (
                    <select
                      required={field.required}
                      value={previewValues[field.name] ?? field.defaultValue ?? ''}
                      onChange={(e) =>
                        setPreviewValues({ ...previewValues, [field.name]: e.target.value })
                      }
                      className="w-full px-3 py-2 text-sm border border-[#D4D4D4] rounded-lg bg-white focus:outline-none focus:border-[#111111]"
                    >
                      <option value="">Select an option...</option>
                      {(field.options || []).map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                  ) : field.type === 'radio' ? (
                    <div className="space-y-1.5 pt-1">
                      {(field.options || []).map((opt) => (
                        <label key={opt} className="flex items-center gap-2 text-sm text-[#333333]">
                          <input
                            type="radio"
                            name={field.name}
                            value={opt}
                            checked={previewValues[field.name] === opt}
                            onChange={(e) =>
                              setPreviewValues({ ...previewValues, [field.name]: e.target.value })
                            }
                          />
                          {opt}
                        </label>
                      ))}
                    </div>
                  ) : field.type === 'checkbox' ? (
                    <div className="space-y-1.5 pt-1">
                      {(field.options || []).map((opt) => {
                        const selected: string[] = Array.isArray(previewValues[field.name])
                          ? previewValues[field.name]
                          : [];
                        return (
                          <label key={opt} className="flex items-center gap-2 text-sm text-[#333333]">
                            <input
                              type="checkbox"
                              checked={selected.includes(opt)}
                              onChange={(e) => {
                                const next = e.target.checked
                                  ? [...selected, opt]
                                  : selected.filter((item) => item !== opt);
                                setPreviewValues({ ...previewValues, [field.name]: next });
                              }}
                            />
                            {opt}
                          </label>
                        );
                      })}
                    </div>
                  ) : (
                    <input
                      type={
                        field.type === 'short_text'
                          ? 'text'
                          : field.type === 'phone'
                            ? 'tel'
                            : field.type
                      }
                      required={field.required}
                      placeholder={field.placeholder}
                      value={
                        field.type === 'file'
                          ? undefined
                          : previewValues[field.name] ?? field.defaultValue ?? ''
                      }
                      onChange={(e) =>
                        setPreviewValues({ ...previewValues, [field.name]: e.target.value })
                      }
                      className="w-full px-3 py-2 text-sm border border-[#D4D4D4] rounded-lg focus:outline-none focus:border-[#111111]"
                    />
                  )}
                </div>
              );
            })}
          </form>

          {previewSubmitResult && (
            <div
              className={`mt-5 p-3.5 rounded-lg text-sm border ${
                previewSubmitResult.ok
                  ? 'bg-[#F0FDF4] border-[#BBF7D0] text-[#15803D]'
                  : 'bg-[#FEF2F2] border-[#FECACA] text-[#A90706]'
              }`}
            >
              {previewSubmitResult.message}
            </div>
          )}
        </div>
      ) : (
        /* 3-Column Visual Drag-and-Drop Builder */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
          {/* Left Field Palette */}
          <div className="lg:col-span-3 bg-white border border-[#E5E5E5] rounded-lg p-4">
            <h3 className="text-xs font-bold text-[#111111] mb-3">Field Library</h3>
            <p className="text-xs text-[#737373] mb-4">
              Click or drag any field onto the form canvas.
            </p>
            <div className="grid grid-cols-2 lg:grid-cols-1 gap-1.5">
              {FIELD_PALETTE.map((item) => (
                <button
                  key={item.type}
                  type="button"
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData('application/x-brosdev-new', item.type)}
                  onClick={() => addField(item.type)}
                  className="flex items-center justify-between px-3 py-2 text-xs font-medium text-[#111111] bg-[#FAFAFA] hover:bg-[#F5F5F5] border border-[#E5E5E5] rounded-md transition-colors text-left cursor-pointer"
                >
                  <span>{item.label}</span>
                  <Plus className="w-3.5 h-3.5 text-[#737373]" />
                </button>
              ))}
            </div>
          </div>

          {/* Center Form Canvas */}
          <div
            className="lg:col-span-5 bg-white border border-[#E5E5E5] rounded-lg p-6 min-h-[540px]"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const newType = e.dataTransfer.getData('application/x-brosdev-new') as FieldType;
              if (newType) addField(newType);
            }}
          >
            {/* Title & Description Inline Editor */}
            <div className="pb-5 mb-5 border-b border-[#E5E5E5] space-y-2">
              <input
                type="text"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                className="w-full text-xl font-bold text-[#111111] bg-transparent focus:outline-none border-b border-transparent focus:border-[#D4D4D4] pb-1"
                placeholder="Form Title"
              />
              <input
                type="text"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="w-full text-sm text-[#525252] bg-transparent focus:outline-none border-b border-transparent focus:border-[#D4D4D4] pb-1"
                placeholder="Add a brief description for respondents..."
              />
            </div>

            {form.fields.length === 0 ? (
              <div className="border border-dashed border-[#D4D4D4] rounded-lg p-12 text-center text-sm text-[#737373]">
                Drag or click fields from the Field Library to construct your form.
              </div>
            ) : (
              <div className="grid grid-cols-12 gap-3">
                {form.fields.map((field, index) => {
                  const isSelected = field.id === selectedFieldId;
                  const colSpan =
                    field.width === 'half' ? 'col-span-12 sm:col-span-6' : 'col-span-12';
                  return (
                    <div
                      key={field.id}
                      draggable
                      onDragStart={() => setDragIndex(index)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const newType = e.dataTransfer.getData('application/x-brosdev-new') as FieldType;
                        if (newType) {
                          const created = createDefaultField(newType);
                          const next = [...form.fields];
                          next.splice(index, 0, created);
                          setForm({ ...form, fields: next });
                          setSelectedFieldId(created.id);
                          setRightTab('field');
                        } else if (dragIndex !== null) {
                          moveField(dragIndex, index);
                          setDragIndex(null);
                        }
                      }}
                      onClick={() => {
                        setSelectedFieldId(field.id);
                        setRightTab('field');
                      }}
                      className={`${colSpan} group rounded-lg p-3.5 border transition-colors cursor-pointer ${
                        isSelected
                          ? 'border-[#A90706] bg-[#FEF2F2]/30'
                          : 'border-[#E5E5E5] bg-white hover:border-[#BDBDBD]'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <GripVertical className="w-3.5 h-3.5 text-[#A3A3A3] shrink-0" />
                          <span className="text-xs font-semibold text-[#111111] truncate">
                            {field.label}
                            {field.required && <span className="text-[#A90706] ml-0.5">*</span>}
                          </span>
                          <span className="text-[11px] font-mono text-[#737373]">
                            · {field.type}
                          </span>
                        </div>
                        <div className="flex items-center gap-0.5 opacity-80 group-hover:opacity-100 shrink-0">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              moveField(index, index - 1);
                            }}
                            className="p-1 text-[#737373] hover:text-[#111111] cursor-pointer"
                            title="Move up"
                          >
                            <ArrowUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              moveField(index, index + 1);
                            }}
                            className="p-1 text-[#737373] hover:text-[#111111] cursor-pointer"
                            title="Move down"
                          >
                            <ArrowDown className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              removeField(field.id);
                            }}
                            className="p-1 text-[#737373] hover:text-[#A90706] cursor-pointer"
                            title="Remove field"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Visual Field Preview Stub */}
                      {field.type === 'divider' ? (
                        <hr className="border-[#E5E5E5] my-1" />
                      ) : field.type === 'heading' ? (
                        <div className="text-sm font-bold text-[#111111]">{field.label}</div>
                      ) : field.type === 'submit' ? (
                        <div className="inline-block px-4 py-1.5 text-xs font-semibold bg-[#A90706] text-white rounded-md">
                          {field.label}
                        </div>
                      ) : field.type === 'long_text' ? (
                        <div className="h-14 bg-[#FAFAFA] border border-[#E5E5E5] rounded px-2.5 py-2 text-xs text-[#A3A3A3]">
                          {field.placeholder || 'Multi-line response...'}
                        </div>
                      ) : (
                        <div className="h-9 bg-[#FAFAFA] border border-[#E5E5E5] rounded px-2.5 flex items-center text-xs text-[#A3A3A3]">
                          {field.placeholder || field.options?.join(' / ') || field.defaultValue || field.name}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right Inspector: Field Properties / Email Routing / Form Settings */}
          <div className="lg:col-span-4 bg-white border border-[#E5E5E5] rounded-lg overflow-hidden">
            <div className="grid grid-cols-3 border-b border-[#E5E5E5] bg-[#FAFAFA] text-xs font-semibold">
              <button
                onClick={() => setRightTab('field')}
                className={`py-3 flex items-center justify-center gap-1.5 border-b-2 transition-colors cursor-pointer ${
                  rightTab === 'field'
                    ? 'border-[#A90706] text-[#111111] bg-white'
                    : 'border-transparent text-[#525252] hover:text-[#111111]'
                }`}
              >
                <Sliders className="w-3.5 h-3.5" />
                Field
              </button>
              <button
                onClick={() => setRightTab('email')}
                className={`py-3 flex items-center justify-center gap-1.5 border-b-2 transition-colors cursor-pointer ${
                  rightTab === 'email'
                    ? 'border-[#A90706] text-[#111111] bg-white'
                    : 'border-transparent text-[#525252] hover:text-[#111111]'
                }`}
              >
                <Mail className="w-3.5 h-3.5" />
                Email
              </button>
              <button
                onClick={() => setRightTab('settings')}
                className={`py-3 flex items-center justify-center gap-1.5 border-b-2 transition-colors cursor-pointer ${
                  rightTab === 'settings'
                    ? 'border-[#A90706] text-[#111111] bg-white'
                    : 'border-transparent text-[#525252] hover:text-[#111111]'
                }`}
              >
                <Settings2 className="w-3.5 h-3.5" />
                Settings
              </button>
            </div>

            <div className="p-5 max-h-[680px] overflow-y-auto space-y-4">
              {rightTab === 'field' && (
                <>
                  {!selectedField ? (
                    <p className="text-xs text-[#737373]">
                      Select any field on the canvas to configure its label, validation, width, and
                      error message.
                    </p>
                  ) : (
                    <div className="space-y-4">
                      <div>
                        <label className="block text-xs font-semibold text-[#111111] mb-1">
                          Field Label
                        </label>
                        <input
                          type="text"
                          value={selectedField.label}
                          onChange={(e) => updateField(selectedField.id, { label: e.target.value })}
                          className="w-full px-3 py-2 text-sm border border-[#D4D4D4] rounded-md"
                        />
                      </div>

                      {selectedField.type !== 'heading' &&
                        selectedField.type !== 'divider' &&
                        selectedField.type !== 'submit' && (
                          <>
                            <div>
                              <label className="block text-xs font-semibold text-[#111111] mb-1">
                                Field Key / HTML Name
                              </label>
                              <input
                                type="text"
                                value={selectedField.name}
                                onChange={(e) =>
                                  updateField(selectedField.id, {
                                    name: e.target.value.replace(/[^a-zA-Z0-9_-]/g, '_'),
                                  })
                                }
                                className="w-full px-3 py-2 text-xs font-mono border border-[#D4D4D4] rounded-md"
                              />
                            </div>

                            <div>
                              <label className="block text-xs font-semibold text-[#111111] mb-1">
                                Placeholder
                              </label>
                              <input
                                type="text"
                                value={selectedField.placeholder || ''}
                                onChange={(e) =>
                                  updateField(selectedField.id, { placeholder: e.target.value })
                                }
                                className="w-full px-3 py-2 text-sm border border-[#D4D4D4] rounded-md"
                              />
                            </div>

                            <div>
                              <label className="block text-xs font-semibold text-[#111111] mb-1">
                                Default Value
                              </label>
                              <input
                                type="text"
                                value={selectedField.defaultValue || ''}
                                onChange={(e) =>
                                  updateField(selectedField.id, { defaultValue: e.target.value })
                                }
                                className="w-full px-3 py-2 text-sm border border-[#D4D4D4] rounded-md"
                              />
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className="block text-xs font-semibold text-[#111111] mb-1">
                                  Field Width
                                </label>
                                <select
                                  value={selectedField.width || 'full'}
                                  onChange={(e) =>
                                    updateField(selectedField.id, {
                                      width: e.target.value as 'full' | 'half',
                                    })
                                  }
                                  className="w-full px-2.5 py-2 text-xs border border-[#D4D4D4] rounded-md bg-white"
                                >
                                  <option value="full">Full width (100%)</option>
                                  <option value="half">Half width (50%)</option>
                                </select>
                              </div>
                              <div className="flex items-end pb-2">
                                <label className="flex items-center gap-2 text-xs font-semibold text-[#111111] cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={Boolean(selectedField.required)}
                                    onChange={(e) =>
                                      updateField(selectedField.id, { required: e.target.checked })
                                    }
                                  />
                                  Required field
                                </label>
                              </div>
                            </div>

                            {(selectedField.type === 'dropdown' ||
                              selectedField.type === 'radio' ||
                              selectedField.type === 'checkbox') && (
                              <div>
                                <label className="block text-xs font-semibold text-[#111111] mb-1">
                                  Options (one per line)
                                </label>
                                <textarea
                                  rows={4}
                                  value={(selectedField.options || []).join('\n')}
                                  onChange={(e) =>
                                    updateField(selectedField.id, {
                                      options: e.target.value
                                        .split('\n')
                                        .map((s) => s.trim())
                                        .filter(Boolean),
                                    })
                                  }
                                  className="w-full px-3 py-2 text-xs font-mono border border-[#D4D4D4] rounded-md"
                                />
                              </div>
                            )}

                            {(selectedField.type === 'short_text' ||
                              selectedField.type === 'long_text') && (
                              <div className="grid grid-cols-2 gap-3">
                                <div>
                                  <label className="block text-xs font-semibold text-[#111111] mb-1">
                                    Min Length
                                  </label>
                                  <input
                                    type="number"
                                    min={0}
                                    value={selectedField.validation?.minLength ?? ''}
                                    onChange={(e) =>
                                      updateField(selectedField.id, {
                                        validation: {
                                          ...selectedField.validation,
                                          minLength: e.target.value ? Number(e.target.value) : undefined,
                                        },
                                      })
                                    }
                                    className="w-full px-2.5 py-1.5 text-xs border border-[#D4D4D4] rounded-md"
                                  />
                                </div>
                                <div>
                                  <label className="block text-xs font-semibold text-[#111111] mb-1">
                                    Max Length
                                  </label>
                                  <input
                                    type="number"
                                    min={1}
                                    value={selectedField.validation?.maxLength ?? ''}
                                    onChange={(e) =>
                                      updateField(selectedField.id, {
                                        validation: {
                                          ...selectedField.validation,
                                          maxLength: e.target.value ? Number(e.target.value) : undefined,
                                        },
                                      })
                                    }
                                    className="w-full px-2.5 py-1.5 text-xs border border-[#D4D4D4] rounded-md"
                                  />
                                </div>
                              </div>
                            )}

                            {selectedField.type === 'number' && (
                              <div className="grid grid-cols-2 gap-3">
                                <div>
                                  <label className="block text-xs font-semibold text-[#111111] mb-1">
                                    Min Value
                                  </label>
                                  <input
                                    type="number"
                                    value={selectedField.validation?.min ?? ''}
                                    onChange={(e) =>
                                      updateField(selectedField.id, {
                                        validation: {
                                          ...selectedField.validation,
                                          min: e.target.value ? Number(e.target.value) : undefined,
                                        },
                                      })
                                    }
                                    className="w-full px-2.5 py-1.5 text-xs border border-[#D4D4D4] rounded-md"
                                  />
                                </div>
                                <div>
                                  <label className="block text-xs font-semibold text-[#111111] mb-1">
                                    Max Value
                                  </label>
                                  <input
                                    type="number"
                                    value={selectedField.validation?.max ?? ''}
                                    onChange={(e) =>
                                      updateField(selectedField.id, {
                                        validation: {
                                          ...selectedField.validation,
                                          max: e.target.value ? Number(e.target.value) : undefined,
                                        },
                                      })
                                    }
                                    className="w-full px-2.5 py-1.5 text-xs border border-[#D4D4D4] rounded-md"
                                  />
                                </div>
                              </div>
                            )}

                            <div>
                              <label className="block text-xs font-semibold text-[#111111] mb-1">
                                Custom Validation Error Message
                              </label>
                              <input
                                type="text"
                                value={selectedField.errorMessage || ''}
                                onChange={(e) =>
                                  updateField(selectedField.id, { errorMessage: e.target.value })
                                }
                                placeholder="e.g., Please enter a valid company email."
                                className="w-full px-3 py-2 text-xs border border-[#D4D4D4] rounded-md"
                              />
                            </div>
                          </>
                        )}
                    </div>
                  )}
                </>
              )}

              {rightTab === 'email' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-[#E5E5E5]">
                    <div>
                      <div className="text-xs font-bold text-[#111111]">Email Notifications</div>
                      <div className="text-[11px] text-[#737373]">
                        Sent via verified platform Resend sender
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={form.emailConfig.notificationsEnabled}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          emailConfig: {
                            ...form.emailConfig,
                            notificationsEnabled: e.target.checked,
                          },
                        })
                      }
                      className="w-4 h-4 accent-[#A90706]"
                    />
                  </div>

                  {/* Recipients */}
                  <div>
                    <label className="block text-xs font-semibold text-[#111111] mb-1">
                      Recipient Email Address(es)
                    </label>
                    <div className="flex gap-2 mb-2">
                      <input
                        type="email"
                        value={newRecipient}
                        onChange={(e) => setNewRecipient(e.target.value)}
                        placeholder="team@company.com"
                        className="flex-1 px-2.5 py-1.5 text-xs border border-[#D4D4D4] rounded-md"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const trimmed = newRecipient.trim().toLowerCase();
                          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return;
                          if (!form.emailConfig.recipients.includes(trimmed)) {
                            setForm({
                              ...form,
                              emailConfig: {
                                ...form.emailConfig,
                                recipients: [...form.emailConfig.recipients, trimmed],
                              },
                            });
                          }
                          setNewRecipient('');
                        }}
                        className="px-3 py-1.5 text-xs font-semibold bg-[#111111] text-white rounded-md cursor-pointer"
                      >
                        Add
                      </button>
                    </div>
                    <div className="space-y-1">
                      {form.emailConfig.recipients.map((rcpt) => (
                        <div
                          key={rcpt}
                          className="flex items-center justify-between px-2.5 py-1.5 bg-[#F5F5F5] rounded text-xs"
                        >
                          <span className="font-mono text-[#111111]">{rcpt}</span>
                          <button
                            type="button"
                            onClick={() =>
                              setForm({
                                ...form,
                                emailConfig: {
                                  ...form.emailConfig,
                                  recipients: form.emailConfig.recipients.filter((r) => r !== rcpt),
                                },
                              })
                            }
                            className="text-[#737373] hover:text-[#A90706] cursor-pointer"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[#111111] mb-1">
                      Sender Display Name
                    </label>
                    <input
                      type="text"
                      value={form.emailConfig.senderDisplayName}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          emailConfig: { ...form.emailConfig, senderDisplayName: e.target.value },
                        })
                      }
                      className="w-full px-3 py-2 text-xs border border-[#D4D4D4] rounded-md"
                    />
                    <p className="text-[11px] text-[#737373] mt-1 font-mono">
                      From: {form.emailConfig.senderDisplayName || 'BrosDev Forms'} &lt;
                      {verifiedSender}&gt;
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[#111111] mb-1">
                      Email Subject
                    </label>
                    <input
                      type="text"
                      value={form.emailConfig.subject}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          emailConfig: { ...form.emailConfig, subject: e.target.value },
                        })
                      }
                      className="w-full px-3 py-2 text-xs border border-[#D4D4D4] rounded-md"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[#111111] mb-1">
                      Reply-To Field Mapping
                    </label>
                    <select
                      value={form.emailConfig.replyToField}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          emailConfig: { ...form.emailConfig, replyToField: e.target.value },
                        })
                      }
                      className="w-full px-2.5 py-2 text-xs border border-[#D4D4D4] rounded-md bg-white"
                    >
                      <option value="">Use platform default reply-to</option>
                      {emailCapableFields.map((f) => (
                        <option key={f.id} value={f.name}>
                          {f.label} ({f.name})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-semibold text-[#111111]">
                        Notification Template
                      </label>
                      <button
                        type="button"
                        onClick={() => setShowEmailPreview(!showEmailPreview)}
                        className="text-[11px] font-semibold text-[#A90706] hover:underline cursor-pointer"
                      >
                        {showEmailPreview ? 'Edit Template' : 'Preview Email'}
                      </button>
                    </div>
                    {showEmailPreview ? (
                      <div className="p-3 bg-[#F5F5F5] border border-[#E5E5E5] rounded-md text-xs space-y-2">
                        <div className="font-semibold text-[#111111]">
                          Subject: {form.emailConfig.subject.replace('{{form_title}}', form.title)}
                        </div>
                        <div className="text-[11px] text-[#525252] font-mono">
                          From: {form.emailConfig.senderDisplayName} &lt;{verifiedSender}&gt;
                        </div>
                        <div className="p-3 bg-white border border-[#E5E5E5] rounded whitespace-pre-wrap text-[#333333]">
                          {form.emailConfig.notificationTemplate
                            .replace('{{form_title}}', form.title)
                            .replace(
                              '{{submission_table}}',
                              form.fields
                                .filter((f) => !['submit', 'heading', 'divider'].includes(f.type))
                                .map((f) => `${f.label}: [Submitted value]`)
                                .join('\n')
                            )}
                        </div>
                      </div>
                    ) : (
                      <textarea
                        rows={4}
                        value={form.emailConfig.notificationTemplate}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            emailConfig: {
                              ...form.emailConfig,
                              notificationTemplate: e.target.value,
                            },
                          })
                        }
                        className="w-full px-3 py-2 text-xs font-mono border border-[#D4D4D4] rounded-md"
                      />
                    )}
                    <p className="text-[11px] text-[#737373] mt-1">
                      Tokens: {'{{form_title}}'}, {'{{submission_table}}'}, {'{{submitted_at}}'}
                    </p>
                  </div>

                  {/* Auto-reply to submitter */}
                  <div className="pt-3 border-t border-[#E5E5E5] space-y-3">
                    <label className="flex items-center justify-between text-xs font-bold text-[#111111] cursor-pointer">
                      <span>Auto-Reply Confirmation to Submitter</span>
                      <input
                        type="checkbox"
                        checked={form.emailConfig.confirmationEnabled}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            emailConfig: {
                              ...form.emailConfig,
                              confirmationEnabled: e.target.checked,
                            },
                          })
                        }
                        className="w-4 h-4 accent-[#A90706]"
                      />
                    </label>
                    {form.emailConfig.confirmationEnabled && (
                      <>
                        <div>
                          <label className="block text-xs font-semibold text-[#111111] mb-1">
                            Submitter Email Field
                          </label>
                          <select
                            value={form.emailConfig.autoReplyEmailField}
                            onChange={(e) =>
                              setForm({
                                ...form,
                                emailConfig: {
                                  ...form.emailConfig,
                                  autoReplyEmailField: e.target.value,
                                },
                              })
                            }
                            className="w-full px-2.5 py-2 text-xs border border-[#D4D4D4] rounded-md bg-white"
                          >
                            {emailCapableFields.map((f) => (
                              <option key={f.id} value={f.name}>
                                {f.label} ({f.name})
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-[#111111] mb-1">
                            Auto-Reply Subject
                          </label>
                          <input
                            type="text"
                            value={form.emailConfig.autoReplySubject}
                            onChange={(e) =>
                              setForm({
                                ...form,
                                emailConfig: {
                                  ...form.emailConfig,
                                  autoReplySubject: e.target.value,
                                },
                              })
                            }
                            className="w-full px-3 py-2 text-xs border border-[#D4D4D4] rounded-md"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-[#111111] mb-1">
                            Auto-Reply Message
                          </label>
                          <textarea
                            rows={3}
                            value={form.emailConfig.autoReplyBody}
                            onChange={(e) =>
                              setForm({
                                ...form,
                                emailConfig: {
                                  ...form.emailConfig,
                                  autoReplyBody: e.target.value,
                                },
                              })
                            }
                            className="w-full px-3 py-2 text-xs border border-[#D4D4D4] rounded-md"
                          />
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}

              {rightTab === 'settings' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-[#111111] mb-1">
                      Form Status
                    </label>
                    <select
                      value={form.status}
                      disabled={form.status === 'suspended'}
                      onChange={(e) =>
                        setForm({ ...form, status: e.target.value as FormRecord['status'] })
                      }
                      className="w-full px-3 py-2 text-xs border border-[#D4D4D4] rounded-md bg-white"
                    >
                      <option value="published">Published (Accepting submissions)</option>
                      <option value="draft">Draft</option>
                      <option value="inactive">Inactive</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[#111111] mb-1">
                      Custom Success Message
                    </label>
                    <textarea
                      rows={2}
                      value={form.successMessage}
                      onChange={(e) => setForm({ ...form, successMessage: e.target.value })}
                      className="w-full px-3 py-2 text-xs border border-[#D4D4D4] rounded-md"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[#111111] mb-1">
                      Custom Redirect URL (optional, https://)
                    </label>
                    <input
                      type="url"
                      value={form.redirectUrl}
                      onChange={(e) => setForm({ ...form, redirectUrl: e.target.value })}
                      placeholder="https://yoursite.com/thank-you"
                      className="w-full px-3 py-2 text-xs border border-[#D4D4D4] rounded-md"
                    />
                  </div>

                  {/* Allowed Domains */}
                  <div className="pt-3 border-t border-[#E5E5E5]">
                    <label className="block text-xs font-semibold text-[#111111] mb-1">
                      Allowed Origin Domains (leave empty for any)
                    </label>
                    <div className="flex gap-2 mb-2">
                      <input
                        type="text"
                        value={newDomain}
                        onChange={(e) => setNewDomain(e.target.value)}
                        placeholder="example.com or *.example.com"
                        className="flex-1 px-2.5 py-1.5 text-xs border border-[#D4D4D4] rounded-md"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const d = newDomain.trim().toLowerCase();
                          if (!d) return;
                          if (!form.allowedDomains.includes(d)) {
                            setForm({ ...form, allowedDomains: [...form.allowedDomains, d] });
                          }
                          setNewDomain('');
                        }}
                        className="px-3 py-1.5 text-xs font-semibold bg-[#111111] text-white rounded-md cursor-pointer"
                      >
                        Add
                      </button>
                    </div>
                    <div className="space-y-1">
                      {form.allowedDomains.map((dom) => (
                        <div
                          key={dom}
                          className="flex items-center justify-between px-2.5 py-1.5 bg-[#F5F5F5] rounded text-xs"
                        >
                          <span className="font-mono">{dom}</span>
                          <button
                            type="button"
                            onClick={() =>
                              setForm({
                                ...form,
                                allowedDomains: form.allowedDomains.filter((item) => item !== dom),
                              })
                            }
                            className="text-[#737373] hover:text-[#A90706] cursor-pointer"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Spam Protection */}
                  <div className="pt-3 border-t border-[#E5E5E5] space-y-3">
                    <div className="text-xs font-bold text-[#111111]">Spam & API Security</div>
                    <label className="flex items-center justify-between text-xs text-[#333333]">
                      <span>Honeypot Bot Trap</span>
                      <input
                        type="checkbox"
                        checked={form.spamProtection.honeypotEnabled}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            spamProtection: {
                              ...form.spamProtection,
                              honeypotEnabled: e.target.checked,
                            },
                          })
                        }
                        className="accent-[#A90706]"
                      />
                    </label>
                    {form.spamProtection.honeypotEnabled && (
                      <div>
                        <label className="block text-xs text-[#525252] mb-1">
                          Honeypot Field Name
                        </label>
                        <input
                          type="text"
                          value={form.spamProtection.honeypotField}
                          onChange={(e) =>
                            setForm({
                              ...form,
                              spamProtection: {
                                ...form.spamProtection,
                                honeypotField: e.target.value,
                              },
                            })
                          }
                          className="w-full px-2.5 py-1.5 text-xs font-mono border border-[#D4D4D4] rounded-md"
                        />
                      </div>
                    )}
                    <div>
                      <label className="block text-xs text-[#525252] mb-1">
                        Rate Limit (requests per minute)
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={600}
                        value={form.spamProtection.rateLimitPerMin}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            spamProtection: {
                              ...form.spamProtection,
                              rateLimitPerMin: Number(e.target.value || 30),
                            },
                          })
                        }
                        className="w-full px-2.5 py-1.5 text-xs font-mono border border-[#D4D4D4] rounded-md"
                      />
                    </div>
                    <label className="flex items-center justify-between text-xs text-[#333333]">
                      <span>Require Secret X-API-Key Header</span>
                      <input
                        type="checkbox"
                        checked={form.spamProtection.requireSecretKey}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            spamProtection: {
                              ...form.spamProtection,
                              requireSecretKey: e.target.checked,
                            },
                          })
                        }
                        className="accent-[#A90706]"
                      />
                    </label>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
