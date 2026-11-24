/**
 * Phase 0 Security Rules Verification Suite (Dirty Dozen Test Cases).
 * Documents the 12 adversarial payloads that firestore.rules MUST reject with PERMISSION_DENIED.
 */

export interface DirtyDozenCase {
  id: number;
  name: string;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  path: string;
  auth: { uid: string; email?: string; email_verified?: boolean } | null;
  payload?: Record<string, unknown>;
  expected: 'PERMISSION_DENIED';
}

export const DIRTY_DOZEN_CASES: DirtyDozenCase[] = [
  {
    id: 1,
    name: 'Shadow Field Injection on User Create',
    operation: 'create',
    path: '/users/userA',
    auth: { uid: 'userA', email: 'a@example.com', email_verified: true },
    payload: { uid: 'userA', email: 'a@example.com', isAdmin: true },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 2,
    name: 'Self-Assigned Admin Role',
    operation: 'create',
    path: '/admins/userA',
    auth: { uid: 'userA', email: 'a@example.com', email_verified: true },
    payload: { uid: 'userA', email: 'a@example.com', roleSlug: 'super_admin', isActive: true },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 3,
    name: 'Unverified Email Spoofing Admin Bypass',
    operation: 'get',
    path: '/auditLogs/log1',
    auth: { uid: 'spoofUid', email: 'gajjars614@gmail.com', email_verified: false },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 4,
    name: 'Cross-Tenant User PII Read',
    operation: 'get',
    path: '/users/userA',
    auth: { uid: 'userB', email: 'b@example.com', email_verified: true },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 5,
    name: 'Unscoped Submissions Collection Scrape',
    operation: 'list',
    path: '/submissions',
    auth: { uid: 'userB', email: 'b@example.com', email_verified: true },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 6,
    name: 'Owner UID Spoofing on Form Create',
    operation: 'create',
    path: '/forms/form1',
    auth: { uid: 'userB', email: 'b@example.com', email_verified: true },
    payload: { ownerUid: 'userA', title: 'Hijacked Form' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 7,
    name: 'Immutable ownerUid Tampering on Form Update',
    operation: 'update',
    path: '/forms/form1',
    auth: { uid: 'userA', email: 'a@example.com', email_verified: true },
    payload: { ownerUid: 'userB' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 8,
    name: 'Client Timestamp Forgery on Form Create',
    operation: 'create',
    path: '/forms/form2',
    auth: { uid: 'userA', email: 'a@example.com', email_verified: true },
    payload: { ownerUid: 'userA', createdAt: '2020-01-01T00:00:00Z' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 9,
    name: 'ID Poisoning (>128 char Document ID)',
    operation: 'create',
    path: `/forms/${'a'.repeat(200)}`,
    auth: { uid: 'userA', email: 'a@example.com', email_verified: true },
    payload: { ownerUid: 'userA', title: 'Long ID' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 10,
    name: 'Orphaned Public Submission for Missing Form',
    operation: 'create',
    path: '/submissions/sub_orphan',
    auth: null,
    payload: { formKey: 'nonexistent_key', ownerUid: 'userA', status: 'received', isRead: false },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 11,
    name: 'Value Poisoning on Submission Update',
    operation: 'update',
    path: '/submissions/sub1',
    auth: { uid: 'userA', email: 'a@example.com', email_verified: true },
    payload: { isRead: 'yes_string_invalid' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 12,
    name: 'Immutable Audit Log Modification',
    operation: 'delete',
    path: '/auditLogs/log1',
    auth: { uid: 'adminUid', email: 'gajjars614@gmail.com', email_verified: true },
    expected: 'PERMISSION_DENIED',
  },
];
