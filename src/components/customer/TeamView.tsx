import React, { useCallback, useEffect, useState } from 'react';
import {
  Users,
  UserPlus,
  Lock,
  Copy,
  Check,
  Trash2,
  ShieldCheck,
  Mail,
  RefreshCw,
  CheckCircle2,
  Ban,
  RotateCcw,
} from 'lucide-react';
import { apiRequest } from '../../lib/api';
import { BUSINESS_TEAM_SEATS, hasPlanFeature, type PlanLockKey } from '../../lib/planLimits';
import type { TeamMemberRecord, TeamMemberRole, TeamWorkspacePayload, WorkspaceMe } from '../../types';

interface TeamViewProps {
  workspace: WorkspaceMe;
  onRequestUpgrade: (key: PlanLockKey) => void;
}

const ROLE_DESCRIPTIONS: Record<TeamMemberRole, string> = {
  admin: 'Manage forms, submissions, integrations, and team seats',
  editor: 'Create and edit forms, routing rules, and view submissions',
  viewer: 'Read-only access to forms, analytics, and submission inbox',
};

const PERMISSION_ROWS = [
  { capability: 'Create, edit & publish forms', owner: true, admin: true, editor: true, viewer: false },
  { capability: 'View & manage submissions', owner: true, admin: true, editor: true, viewer: true },
  { capability: 'Configure email routing & webhooks', owner: true, admin: true, editor: true, viewer: false },
  { capability: 'Invite & manage team members', owner: true, admin: true, editor: false, viewer: false },
  { capability: 'Billing, invoices & plan changes', owner: true, admin: false, editor: false, viewer: false },
];

export const TeamView: React.FC<TeamViewProps> = ({ workspace, onRequestUpgrade }) => {
  const canManageTeam = hasPlanFeature(workspace, 'teamMembers');
  const [data, setData] = useState<TeamWorkspacePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [inviteName, setInviteName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<TeamMemberRole>('editor');
  const [inviting, setInviting] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);

  const loadTeam = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await apiRequest<TeamWorkspacePayload>('/api/team');
      setData(res);
    } catch (err: any) {
      setError(err?.message || 'Unable to load team workspace.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTeam();
  }, [loadTeam]);

  const handleInviteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManageTeam) {
      onRequestUpgrade('teamMembers');
      return;
    }
    setError('');
    setNotice('');
    setInviting(true);
    try {
      const res = await apiRequest<{ member: TeamMemberRecord; emailSent: boolean }>('/api/team/invite', {
        method: 'POST',
        body: {
          displayName: inviteName.trim(),
          email: inviteEmail.trim(),
          role: inviteRole,
        },
      });
      setInviteName('');
      setInviteEmail('');
      setInviteRole('editor');
      setNotice(
        res.emailSent
          ? `Invitation sent to ${res.member.email} from ${workspace.user.senderEmail}.`
          : `Invitation created for ${res.member.email}. Copy the invite code below to share directly.`
      );
      await loadTeam();
    } catch (err: any) {
      setError(err?.message || 'Failed to invite team member.');
    } finally {
      setInviting(false);
    }
  };

  const handleRoleChange = async (member: TeamMemberRecord, role: TeamMemberRole) => {
    if (!canManageTeam) {
      onRequestUpgrade('teamMembers');
      return;
    }
    setBusyId(member.id);
    setError('');
    try {
      await apiRequest(`/api/team/${member.id}`, {
        method: 'PATCH',
        body: { role },
      });
      await loadTeam();
    } catch (err: any) {
      setError(err?.message || 'Failed to update role.');
    } finally {
      setBusyId(null);
    }
  };

  const handleToggleStatus = async (member: TeamMemberRecord) => {
    if (!canManageTeam) {
      onRequestUpgrade('teamMembers');
      return;
    }
    const nextStatus = member.status === 'revoked' ? 'active' : 'revoked';
    setBusyId(member.id);
    setError('');
    try {
      await apiRequest(`/api/team/${member.id}`, {
        method: 'PATCH',
        body: { status: nextStatus },
      });
      await loadTeam();
    } catch (err: any) {
      setError(err?.message || 'Failed to update member status.');
    } finally {
      setBusyId(null);
    }
  };

  const handleRemoveMember = async (member: TeamMemberRecord) => {
    if (!canManageTeam) {
      onRequestUpgrade('teamMembers');
      return;
    }
    setBusyId(member.id);
    setError('');
    try {
      await apiRequest(`/api/team/${member.id}`, { method: 'DELETE' });
      setNotice(`Removed ${member.email} from your team.`);
      await loadTeam();
    } catch (err: any) {
      setError(err?.message || 'Failed to remove member.');
    } finally {
      setBusyId(null);
    }
  };

  const handleAcceptInvite = async (invite: TeamMemberRecord) => {
    setBusyId(invite.id);
    setError('');
    try {
      await apiRequest(`/api/team/${invite.id}/accept`, { method: 'POST' });
      setNotice(`Joined workspace ${invite.ownerAccountId} as ${invite.role}.`);
      await loadTeam();
    } catch (err: any) {
      setError(err?.message || 'Failed to accept invitation.');
    } finally {
      setBusyId(null);
    }
  };

  const copyInviteCode = (member: TeamMemberRecord) => {
    navigator.clipboard.writeText(member.inviteCode);
    setCopiedId(member.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const members = data?.members || [];
  const incomingInvites = data?.incomingInvites || [];
  const usedSeats = data?.usedSeats ?? 0;
  const pendingCount = members.filter((m) => m.status === 'invited').length;
  const activeCount = members.filter((m) => m.status === 'active').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#111111]">Team Collaboration</h1>
          <p className="mt-1 text-sm text-[#525252]">
            Manage shared workspace seats, role permissions, and invitations for Account{' '}
            <span className="font-mono font-semibold text-[#111111]">{workspace.user.accountId}</span>
            {' · '}
            <span className="font-mono text-xs text-[#525252]">{workspace.user.senderEmail}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={loadTeam}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded border border-[#D4D4D4] bg-white px-3 py-2 text-xs font-semibold text-[#111111] hover:bg-[#FAFAFA] disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          {!canManageTeam && (
            <button
              type="button"
              onClick={() => onRequestUpgrade('teamMembers')}
              className="inline-flex items-center gap-1.5 rounded bg-[#A90706] px-4 py-2 text-xs font-semibold text-white hover:bg-[#8A0505]"
            >
              <Lock className="h-3.5 w-3.5" />
              Unlock Business Team
            </button>
          )}
        </div>
      </div>

      {/* Locked Plan Banner for Free / Starter / Professional */}
      {!canManageTeam && (
        <div className="flex flex-col items-start justify-between gap-4 rounded-md border border-[#111111] bg-[#FAFAFA] p-5 sm:flex-row sm:items-center">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded border border-[#E5E5E5] bg-white text-[#A90706]">
              <Lock className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm font-bold text-[#111111]">
                Team Collaboration is a Business Plan Feature
              </p>
              <p className="mt-0.5 text-xs text-[#525252]">
                Your current <span className="font-semibold text-[#111111]">{workspace.plan?.name || 'Free'}</span> plan
                is limited to a single owner seat. Upgrade to Business ($129/mo) to invite up to {BUSINESS_TEAM_SEATS}{' '}
                teammates with Admin, Editor, and Viewer roles.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onRequestUpgrade('teamMembers')}
            className="shrink-0 rounded bg-[#A90706] px-4 py-2 text-xs font-semibold text-white hover:bg-[#8A0505]"
          >
            View Business Plan
          </button>
        </div>
      )}

      {error && (
        <div className="rounded border border-[#A90706]/30 bg-[#FEF2F2] px-4 py-3 text-xs font-medium text-[#A90706]">
          {error}
        </div>
      )}
      {notice && (
        <div className="rounded border border-[#16A34A]/30 bg-[#F0FDF4] px-4 py-3 text-xs font-medium text-[#15803D]">
          {notice}
        </div>
      )}

      {/* KPI Strip */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-md border border-[#E5E5E5] bg-white p-5">
          <p className="text-xs font-medium text-[#737373]">Team Seats Used</p>
          <p className="mt-1.5 text-2xl font-bold tabular-nums text-[#111111]">
            {canManageTeam ? `${usedSeats} / ${BUSINESS_TEAM_SEATS}` : '1 / 1'}
          </p>
          <p className="mt-1 text-xs text-[#737373]">
            {canManageTeam
              ? `${activeCount} active · ${pendingCount} pending invites`
              : 'Owner seat only · Business unlocks 15 seats'}
          </p>
        </div>
        <div className="rounded-md border border-[#E5E5E5] bg-white p-5">
          <p className="text-xs font-medium text-[#737373]">Workspace Account ID</p>
          <p className="mt-1.5 font-mono text-xl font-bold text-[#111111]">
            {workspace.user.accountId}
          </p>
          <p className="mt-1 text-xs text-[#737373]">Unique identifier for your organization</p>
        </div>
        <div className="rounded-md border border-[#E5E5E5] bg-white p-5">
          <p className="text-xs font-medium text-[#737373]">Dedicated Invite & Form Sender</p>
          <p className="mt-1.5 truncate font-mono text-sm font-bold text-[#111111]">
            {workspace.user.senderEmail}
          </p>
          <p className="mt-1 text-xs text-[#737373]">All team & form emails route via this address</p>
        </div>
      </div>

      {/* Invite Form (Visibly Disabled + Upgrade Popup when not on Business) */}
      <section className="rounded-md border border-[#E5E5E5] bg-white">
        <div className="flex items-center justify-between border-b border-[#E5E5E5] px-6 py-4">
          <div className="flex items-center gap-2">
            <UserPlus className="h-4 w-4 text-[#111111]" />
            <h2 className="text-sm font-bold text-[#111111]">Invite Team Member</h2>
          </div>
          {!canManageTeam && (
            <button
              type="button"
              onClick={() => onRequestUpgrade('teamMembers')}
              className="inline-flex items-center gap-1 text-xs font-semibold text-[#A90706] hover:underline"
            >
              <Lock className="h-3 w-3" />
              Requires Business Plan
            </button>
          )}
        </div>
        <form
          onSubmit={handleInviteSubmit}
          noValidate={!canManageTeam}
          onClick={() => {
            if (!canManageTeam) onRequestUpgrade('teamMembers');
          }}
          className={`grid grid-cols-1 gap-4 p-6 md:grid-cols-12 ${!canManageTeam ? 'cursor-pointer opacity-60' : ''}`}
        >
          <div className="md:col-span-3">
            <label className="mb-1.5 block text-xs font-semibold text-[#111111]">Full Name</label>
            <input
              type="text"
              value={inviteName}
              onChange={(e) => setInviteName(e.target.value)}
              disabled={!canManageTeam || inviting}
              placeholder="Alex Morgan"
              className="w-full rounded border border-[#D4D4D4] bg-white px-3 py-2 text-sm text-[#111111] focus:border-[#111111] focus:outline-none disabled:cursor-not-allowed disabled:bg-[#F5F5F5]"
            />
          </div>
          <div className="md:col-span-4">
            <label className="mb-1.5 block text-xs font-semibold text-[#111111]">Work Email</label>
            <input
              type="email"
              required
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              disabled={!canManageTeam || inviting}
              placeholder="alex@company.com"
              className="w-full rounded border border-[#D4D4D4] bg-white px-3 py-2 text-sm text-[#111111] focus:border-[#111111] focus:outline-none disabled:cursor-not-allowed disabled:bg-[#F5F5F5]"
            />
          </div>
          <div className="md:col-span-3">
            <label className="mb-1.5 block text-xs font-semibold text-[#111111]">Workspace Role</label>
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as TeamMemberRole)}
              disabled={!canManageTeam || inviting}
              className="w-full rounded border border-[#D4D4D4] bg-white px-3 py-2 text-sm text-[#111111] focus:border-[#111111] focus:outline-none disabled:cursor-not-allowed disabled:bg-[#F5F5F5]"
            >
              <option value="admin">Admin</option>
              <option value="editor">Editor</option>
              <option value="viewer">Viewer</option>
            </select>
          </div>
          <div className="flex items-end md:col-span-2">
            <button
              type="submit"
              disabled={inviting}
              className={`inline-flex w-full items-center justify-center gap-1.5 rounded px-4 py-2 text-sm font-semibold transition-colors ${
                canManageTeam
                  ? 'bg-[#A90706] text-white hover:bg-[#8A0505] disabled:opacity-50'
                  : 'border border-[#D4D4D4] bg-[#F5F5F5] text-[#737373]'
              }`}
            >
              {canManageTeam ? (
                <>
                  <Mail className="h-3.5 w-3.5" />
                  {inviting ? 'Sending...' : 'Send Invite'}
                </>
              ) : (
                <>
                  <Lock className="h-3.5 w-3.5" />
                  Locked
                </>
              )}
            </button>
          </div>
          <p className="text-xs text-[#737373] md:col-span-12">
            {ROLE_DESCRIPTIONS[inviteRole]}
          </p>
        </form>
      </section>

      {/* Incoming Invitations (available to any user invited by a Business workspace) */}
      {incomingInvites.length > 0 && (
        <section className="rounded-md border border-[#E5E5E5] bg-white">
          <div className="border-b border-[#E5E5E5] px-6 py-4">
            <h2 className="text-sm font-bold text-[#111111]">Workspaces You Were Invited To</h2>
          </div>
          <div className="divide-y divide-[#E5E5E5]">
            {incomingInvites.map((inv) => (
              <div key={inv.id} className="flex flex-wrap items-center justify-between gap-4 px-6 py-4">
                <div>
                  <p className="text-sm font-semibold text-[#111111]">
                    Workspace <span className="font-mono">{inv.ownerAccountId}</span>
                  </p>
                  <p className="text-xs text-[#737373]">
                    Invited by {inv.invitedByEmail} · Role: <span className="uppercase">{inv.role}</span> · Status:{' '}
                    <span className="capitalize">{inv.status}</span>
                  </p>
                </div>
                {inv.status === 'invited' ? (
                  <button
                    type="button"
                    disabled={busyId === inv.id}
                    onClick={() => handleAcceptInvite(inv)}
                    className="inline-flex items-center gap-1.5 rounded bg-[#111111] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#262626] disabled:opacity-50"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Accept Invitation
                  </button>
                ) : (
                  <span className="text-xs font-semibold text-[#16A34A]">Active Member</span>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Workspace Members Table */}
      <section className="overflow-hidden rounded-md border border-[#E5E5E5] bg-white">
        <div className="flex items-center justify-between border-b border-[#E5E5E5] px-6 py-4">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-[#111111]" />
            <h2 className="text-sm font-bold text-[#111111]">Workspace Members</h2>
          </div>
          <span className="text-xs tabular-nums text-[#737373]">{members.length + 1} total</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[#E5E5E5] bg-[#FAFAFA] text-[11px] font-semibold uppercase tracking-wider text-[#737373]">
                <th className="px-6 py-3">Member</th>
                <th className="px-6 py-3">Role</th>
                <th className="px-6 py-3">Status</th>
                <th className="px-6 py-3">Added</th>
                <th className="px-6 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5E5E5]">
              {/* Workspace Owner Row */}
              <tr>
                <td className="px-6 py-4">
                  <div className="font-semibold text-[#111111]">
                    {workspace.user.displayName || 'Workspace Owner'} (You)
                  </div>
                  <div className="text-xs text-[#737373]">{workspace.user.email}</div>
                </td>
                <td className="px-6 py-4">
                  <span className="text-xs font-bold uppercase tracking-wide text-[#111111]">Owner</span>
                </td>
                <td className="px-6 py-4">
                  <span className="text-xs font-semibold text-[#16A34A]">Active</span>
                </td>
                <td className="px-6 py-4 text-xs tabular-nums text-[#737373]">
                  {new Date(workspace.user.createdAt).toLocaleDateString()}
                </td>
                <td className="px-6 py-4 text-right text-xs text-[#737373]">Account Owner</td>
              </tr>

              {/* Invited & Active Team Members */}
              {members.map((member) => (
                <tr key={member.id} className="hover:bg-[#FAFAFA]">
                  <td className="px-6 py-4">
                    <div className="font-semibold text-[#111111]">{member.displayName}</div>
                    <div className="text-xs text-[#737373]">{member.email}</div>
                  </td>
                  <td className="px-6 py-4">
                    <select
                      value={member.role}
                      disabled={!canManageTeam || busyId === member.id}
                      onChange={(e) => handleRoleChange(member, e.target.value as TeamMemberRole)}
                      className="rounded border border-[#D4D4D4] bg-white px-2.5 py-1 text-xs font-semibold text-[#111111] focus:border-[#111111] focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <option value="admin">Admin</option>
                      <option value="editor">Editor</option>
                      <option value="viewer">Viewer</option>
                    </select>
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`text-xs font-semibold capitalize ${
                        member.status === 'active'
                          ? 'text-[#16A34A]'
                          : member.status === 'revoked'
                            ? 'text-[#A90706]'
                            : 'text-[#B45309]'
                      }`}
                    >
                      {member.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-xs tabular-nums text-[#737373]">
                    {new Date(member.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="inline-flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => copyInviteCode(member)}
                        title="Copy invite code"
                        className="inline-flex items-center gap-1 rounded border border-[#E5E5E5] bg-white px-2.5 py-1 text-xs font-medium text-[#111111] hover:bg-[#F5F5F5]"
                      >
                        {copiedId === member.id ? (
                          <>
                            <Check className="h-3 w-3 text-[#16A34A]" />
                            Copied
                          </>
                        ) : (
                          <>
                            <Copy className="h-3 w-3" />
                            Code
                          </>
                        )}
                      </button>
                      <button
                        type="button"
                        disabled={!canManageTeam || busyId === member.id}
                        onClick={() => handleToggleStatus(member)}
                        title={member.status === 'revoked' ? 'Restore seat' : 'Revoke access'}
                        className="inline-flex items-center gap-1 rounded border border-[#E5E5E5] bg-white px-2.5 py-1 text-xs font-medium text-[#525252] hover:bg-[#F5F5F5] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {member.status === 'revoked' ? (
                          <>
                            <RotateCcw className="h-3 w-3" />
                            Restore
                          </>
                        ) : (
                          <>
                            <Ban className="h-3 w-3" />
                            Revoke
                          </>
                        )}
                      </button>
                      <button
                        type="button"
                        disabled={!canManageTeam || busyId === member.id}
                        onClick={() => handleRemoveMember(member)}
                        title="Remove member"
                        className="inline-flex items-center rounded border border-[#E5E5E5] bg-white p-1.5 text-[#737373] hover:border-[#A90706] hover:text-[#A90706] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}

              {members.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-xs text-[#737373]">
                    {canManageTeam
                      ? 'No teammates invited yet. Use the form above to invite up to 15 collaborators.'
                      : 'Upgrade to the Business plan to add collaborators to this workspace.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Role Permissions Matrix */}
      <section className="overflow-hidden rounded-md border border-[#E5E5E5] bg-white">
        <div className="flex items-center gap-2 border-b border-[#E5E5E5] px-6 py-4">
          <ShieldCheck className="h-4 w-4 text-[#111111]" />
          <h2 className="text-sm font-bold text-[#111111]">Role Permissions Matrix</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-[#E5E5E5] bg-[#FAFAFA] text-[11px] font-semibold uppercase tracking-wider text-[#737373]">
                <th className="px-6 py-3">Capability</th>
                <th className="px-4 py-3 text-center">Owner</th>
                <th className="px-4 py-3 text-center">Admin</th>
                <th className="px-4 py-3 text-center">Editor</th>
                <th className="px-4 py-3 text-center">Viewer</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5E5E5]">
              {PERMISSION_ROWS.map((row) => (
                <tr key={row.capability}>
                  <td className="px-6 py-3 font-medium text-[#111111]">{row.capability}</td>
                  {[row.owner, row.admin, row.editor, row.viewer].map((allowed, idx) => (
                    <td key={idx} className="px-4 py-3 text-center">
                      {allowed ? (
                        <Check className="mx-auto h-4 w-4 text-[#16A34A]" />
                      ) : (
                        <span className="text-[#D4D4D4]">—</span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
