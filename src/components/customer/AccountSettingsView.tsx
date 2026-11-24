import React, { useEffect, useState } from 'react';
import {
  User,
  Lock,
  ShieldCheck,
  CheckCircle2,
  Eye,
  EyeOff,
  CreditCard,
  LogOut,
  Save,
  Copy,
  Check,
  Mail,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { apiRequest } from '../../lib/api';

function getPasswordStrength(pw: string): { label: string; color: string; pct: number } {
  if (!pw) return { label: '', color: '#E5E5E5', pct: 0 };
  let score = 0;
  if (pw.length >= 8) score += 1;
  if (pw.length >= 12) score += 1;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score += 1;
  if (/\d/.test(pw)) score += 1;
  if (/[^A-Za-z0-9]/.test(pw)) score += 1;
  if (score <= 2) return { label: 'Fair', color: '#D97706', pct: 40 };
  if (score <= 3) return { label: 'Good', color: '#2563EB', pct: 70 };
  return { label: 'Strong', color: '#16A34A', pct: 100 };
}

export const AccountSettingsView: React.FC<{ onOpenBilling: () => void }> = ({ onOpenBilling }) => {
  const { workspace, refreshWorkspace, logout } = useAuth();
  const user = workspace?.user;

  // Profile form state
  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [email, setEmail] = useState(user?.email || '');
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileNotice, setProfileNotice] = useState<{ ok: boolean; text: string } | null>(null);

  // Password form state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPasswords, setShowPasswords] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordNotice, setPasswordNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [copiedField, setCopiedField] = useState<'accountId' | 'senderEmail' | null>(null);

  const handleCopyIdentity = (field: 'accountId' | 'senderEmail', value: string) => {
    navigator.clipboard.writeText(value);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  useEffect(() => {
    if (user) {
      setDisplayName(user.displayName || '');
      setEmail(user.email || '');
    }
  }, [user]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileNotice(null);
    setSavingProfile(true);
    try {
      await apiRequest('/api/account/profile', {
        method: 'PATCH',
        body: {
          displayName: displayName.trim(),
          email: email.trim(),
        },
      });
      await refreshWorkspace();
      setProfileNotice({ ok: true, text: 'Profile details updated successfully.' });
    } catch (err: any) {
      setProfileNotice({ ok: false, text: err.message || 'Unable to update profile.' });
    } finally {
      setSavingProfile(false);
    }
  };

  const handleSavePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordNotice(null);

    if (newPassword.length < 8) {
      setPasswordNotice({ ok: false, text: 'New password must be at least 8 characters.' });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordNotice({ ok: false, text: 'New password and confirmation do not match.' });
      return;
    }

    setSavingPassword(true);
    try {
      const res = await apiRequest<{ message: string }>('/api/account/password', {
        method: 'POST',
        body: {
          currentPassword: user?.hasPassword ? currentPassword : undefined,
          newPassword,
        },
      });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      await refreshWorkspace();
      setPasswordNotice({ ok: true, text: res.message || 'Password updated.' });
    } catch (err: any) {
      setPasswordNotice({ ok: false, text: err.message || 'Unable to update password.' });
    } finally {
      setSavingPassword(false);
    }
  };

  if (!user || !workspace) return null;

  const initials = (user.displayName || user.email)
    .split(/\s+/)
    .map((s) => s[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const strength = getPasswordStrength(newPassword);

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-white border border-[#E5E5E5] rounded-lg p-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-lg bg-[#111111] text-white font-bold text-base flex items-center justify-center shrink-0">
            {initials}
          </div>
          <div>
            <h1 className="text-lg font-bold text-[#111111]">{user.displayName || user.email}</h1>
            <div className="text-xs text-[#525252] flex flex-wrap items-center gap-2 mt-0.5">
              <span className="font-mono">{user.email}</span>
              <span>·</span>
              <span>
                Member since {new Date(user.createdAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
              </span>
              <span>·</span>
              <span className="font-semibold text-[#16A34A] capitalize">{user.status}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onOpenBilling}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-[#111111] bg-[#F5F5F5] hover:bg-[#E5E5E5] rounded-md cursor-pointer"
          >
            <CreditCard className="w-3.5 h-3.5" />
            Billing &amp; Invoices
          </button>
          <button
            type="button"
            onClick={logout}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-[#A90706] bg-[#FEF2F2] hover:bg-[#FEE2E2] rounded-md cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sign Out
          </button>
        </div>
      </div>

      {/* Account ID & Dedicated Sender Email */}
      <div className="bg-white border border-[#E5E5E5] rounded-lg p-6">
        <div className="flex items-start justify-between gap-4 pb-4 border-b border-[#EFEFEF]">
          <div className="flex items-center gap-2">
            <Mail className="w-4 h-4 text-[#A90706]" />
            <div>
              <h2 className="text-sm font-bold text-[#111111]">
                Account ID &amp; Dedicated Sender Email
              </h2>
              <p className="text-xs text-[#525252]">
                Every account receives a unique identifier and dedicated outbound Resend address for
                form notifications, auto-replies, and team invitations.
              </p>
            </div>
          </div>
          <span className="text-xs font-semibold text-[#111111] whitespace-nowrap">
            Domain: <span className="font-mono">{workspace.platformEmailSender.sendingDomain}</span>
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4">
          <div className="p-4 bg-[#FAFAFA] border border-[#E5E5E5] rounded-md flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-[#737373]">
                Unique Account ID
              </div>
              <div className="mt-1 font-mono text-sm font-bold text-[#111111] truncate">
                {user.accountId}
              </div>
            </div>
            <button
              type="button"
              onClick={() => handleCopyIdentity('accountId', user.accountId)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border border-[#D4D4D4] bg-white hover:bg-[#F5F5F5] text-[#111111] rounded cursor-pointer shrink-0"
            >
              {copiedField === 'accountId' ? (
                <>
                  <Check className="w-3.5 h-3.5 text-[#16A34A]" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  Copy ID
                </>
              )}
            </button>
          </div>

          <div className="p-4 bg-[#FAFAFA] border border-[#E5E5E5] rounded-md flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-[#737373]">
                Dedicated Form Sender Email
              </div>
              <div className="mt-1 font-mono text-sm font-bold text-[#111111] truncate">
                {user.senderEmail}
              </div>
            </div>
            <button
              type="button"
              onClick={() => handleCopyIdentity('senderEmail', user.senderEmail)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border border-[#D4D4D4] bg-white hover:bg-[#F5F5F5] text-[#111111] rounded cursor-pointer shrink-0"
            >
              {copiedField === 'senderEmail' ? (
                <>
                  <Check className="w-3.5 h-3.5 text-[#16A34A]" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  Copy Email
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Profile Details */}
        <form
          onSubmit={handleSaveProfile}
          className="lg:col-span-6 bg-white border border-[#E5E5E5] rounded-lg p-6 space-y-5 flex flex-col justify-between"
        >
          <div className="space-y-4">
            <div className="flex items-center gap-2 pb-3 border-b border-[#E5E5E5]">
              <User className="w-4 h-4 text-[#A90706]" />
              <div>
                <h2 className="text-sm font-bold text-[#111111]">Profile Information</h2>
                <p className="text-xs text-[#525252]">
                  Manage your display name and primary workspace email address.
                </p>
              </div>
            </div>

            {profileNotice && (
              <div
                className={`p-3 rounded-lg text-xs border flex items-center gap-2 ${
                  profileNotice.ok
                    ? 'bg-[#F0FDF4] border-[#BBF7D0] text-[#15803D]'
                    : 'bg-[#FEF2F2] border-[#FECACA] text-[#A90706]'
                }`}
              >
                {profileNotice.ok && <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />}
                <span>{profileNotice.text}</span>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-[#111111] mb-1">Full Name</label>
              <input
                type="text"
                required
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Your full name"
                className="w-full px-3.5 py-2.5 text-sm border border-[#D4D4D4] rounded-lg focus:outline-none focus:border-[#111111]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#111111] mb-1">
                Email Address
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm font-mono border border-[#D4D4D4] rounded-lg focus:outline-none focus:border-[#111111]"
              />
              <p className="text-[11px] text-[#737373] mt-1">
                Used for email/password sign-in, invoices, and default form notifications.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2">
              <div className="p-3 bg-[#FAFAFA] border border-[#EFEFEF] rounded-lg">
                <div className="text-[11px] text-[#737373]">Account ID</div>
                <div className="text-xs font-mono font-semibold text-[#111111] mt-0.5">
                  {user.accountId}
                </div>
              </div>
              <div className="p-3 bg-[#FAFAFA] border border-[#EFEFEF] rounded-lg">
                <div className="text-[11px] text-[#737373]">Sign-In Methods</div>
                <div className="text-xs font-semibold text-[#111111] mt-0.5">
                  {user.hasPassword
                    ? user.authProvider === 'google'
                      ? 'Google + Password'
                      : 'Email & Password'
                    : 'Google Sign-In'}
                </div>
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-[#EFEFEF] flex justify-end">
            <button
              type="submit"
              disabled={savingProfile}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#A90706] hover:bg-[#8C0605] rounded-md cursor-pointer disabled:opacity-60"
            >
              <Save className="w-3.5 h-3.5" />
              {savingProfile ? 'Saving...' : 'Save Profile'}
            </button>
          </div>
        </form>

        {/* Right Column: Password & Security */}
        <form
          onSubmit={handleSavePassword}
          className="lg:col-span-6 bg-white border border-[#E5E5E5] rounded-lg p-6 space-y-5 flex flex-col justify-between"
        >
          <div className="space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#E5E5E5]">
              <div className="flex items-center gap-2">
                <Lock className="w-4 h-4 text-[#A90706]" />
                <div>
                  <h2 className="text-sm font-bold text-[#111111]">
                    {user.hasPassword ? 'Change Password' : 'Set Account Password'}
                  </h2>
                  <p className="text-xs text-[#525252]">
                    {user.hasPassword
                      ? 'Verify your current password before setting a new one.'
                      : 'Add a password so you can sign in directly with your email address.'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowPasswords((v) => !v)}
                className="p-1.5 text-[#525252] hover:text-[#111111] cursor-pointer"
                title={showPasswords ? 'Hide passwords' : 'Show passwords'}
              >
                {showPasswords ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            {passwordNotice && (
              <div
                className={`p-3 rounded-lg text-xs border flex items-center gap-2 ${
                  passwordNotice.ok
                    ? 'bg-[#F0FDF4] border-[#BBF7D0] text-[#15803D]'
                    : 'bg-[#FEF2F2] border-[#FECACA] text-[#A90706]'
                }`}
              >
                {passwordNotice.ok && <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />}
                <span>{passwordNotice.text}</span>
              </div>
            )}

            {user.hasPassword && (
              <div>
                <label className="block text-xs font-semibold text-[#111111] mb-1">
                  Current Password
                </label>
                <input
                  type={showPasswords ? 'text' : 'password'}
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  autoComplete="current-password"
                  placeholder="Enter your current password"
                  className="w-full px-3.5 py-2.5 text-sm border border-[#D4D4D4] rounded-lg focus:outline-none focus:border-[#111111]"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-[#111111] mb-1">
                New Password
              </label>
              <input
                type={showPasswords ? 'text' : 'password'}
                required
                minLength={8}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
                placeholder="Minimum 8 characters"
                className="w-full px-3.5 py-2.5 text-sm border border-[#D4D4D4] rounded-lg focus:outline-none focus:border-[#111111]"
              />
              {newPassword && (
                <div className="mt-2 space-y-1">
                  <div className="h-1.5 bg-[#EFEFEF] rounded-full overflow-hidden">
                    <div
                      className="h-full transition-all"
                      style={{ width: `${strength.pct}%`, backgroundColor: strength.color }}
                    />
                  </div>
                  <div className="text-[11px] font-medium" style={{ color: strength.color }}>
                    Password strength: {strength.label}
                  </div>
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#111111] mb-1">
                Confirm New Password
              </label>
              <input
                type={showPasswords ? 'text' : 'password'}
                required
                minLength={8}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                placeholder="Re-enter new password"
                className="w-full px-3.5 py-2.5 text-sm border border-[#D4D4D4] rounded-lg focus:outline-none focus:border-[#111111]"
              />
            </div>
          </div>

          <div className="pt-4 border-t border-[#EFEFEF] flex items-center justify-between gap-3">
            <span className="inline-flex items-center gap-1.5 text-[11px] text-[#737373]">
              <ShieldCheck className="w-3.5 h-3.5 text-[#16A34A]" />
              Stored with salted scrypt hashing
            </span>
            <button
              type="submit"
              disabled={savingPassword}
              className="px-4 py-2 text-xs font-semibold text-white bg-[#111111] hover:bg-[#262626] rounded-md cursor-pointer disabled:opacity-60"
            >
              {savingPassword
                ? 'Updating...'
                : user.hasPassword
                  ? 'Update Password'
                  : 'Create Password'}
            </button>
          </div>
        </form>
      </div>

      {/* Plan & Workspace Summary */}
      <div className="bg-white border border-[#E5E5E5] rounded-lg p-6">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-[#EFEFEF]">
          <div>
            <h3 className="text-sm font-bold text-[#111111]">Workspace Plan &amp; Quotas</h3>
            <p className="text-xs text-[#525252]">
              Active tier: <strong>{workspace.plan?.name || 'Free'}</strong> · API Endpoint:{' '}
              <span className="font-mono">{workspace.publicApiBaseUrl}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={onOpenBilling}
            className="text-xs font-semibold text-[#A90706] hover:underline cursor-pointer"
          >
            Upgrade Plan or View Invoices →
          </button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 text-xs">
          <div>
            <div className="text-[#737373]">Forms</div>
            <div className="font-mono font-bold text-sm text-[#111111] mt-1 tabular-nums">
              {workspace.usage.formsCreated} / {workspace.limits.maxForms}
            </div>
          </div>
          <div>
            <div className="text-[#737373]">Submissions (Month)</div>
            <div className="font-mono font-bold text-sm text-[#111111] mt-1 tabular-nums">
              {workspace.usage.submissionsCount.toLocaleString()} /{' '}
              {workspace.limits.maxSubmissions.toLocaleString()}
            </div>
          </div>
          <div>
            <div className="text-[#737373]">Emails Sent (Month)</div>
            <div className="font-mono font-bold text-sm text-[#111111] mt-1 tabular-nums">
              {workspace.usage.emailsSentCount.toLocaleString()} /{' '}
              {workspace.limits.maxEmails.toLocaleString()}
            </div>
          </div>
          <div>
            <div className="text-[#737373]">API Rate Limit</div>
            <div className="font-mono font-bold text-sm text-[#111111] mt-1 tabular-nums">
              {workspace.limits.maxApiRequestsPerMin} req/min
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
