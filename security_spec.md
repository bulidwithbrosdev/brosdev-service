# BrosDev Forms Firestore Security Specification

## 1. Data Invariants
1. **Default Deny**: All unmatched paths are denied for read and write.
2. **PII Isolation**: `users/{userId}`, `forms/{formId}` (contains recipient emails), `submissions/{submissionId}`, `emailLogs/{logId}`, `payments/{paymentId}`, and `invoices/{invoiceId}` are strictly readable only by their owning `ownerUid` / `userId` or a verified Admin. Public form verification uses the non-PII `publicForms/{formKey}` projection.
3. **Anti-Privilege-Escalation**: Non-admin users cannot create or modify documents in `admins/{uid}`, `plans/{planId}`, `settings/{settingKey}`, or `auditLogs/{logId}`, nor can they self-assign suspended/quota-override fields in `users/{userId}`.
4. **Master Gate & Global Consistency**: Every public `submissions/{submissionId}` create MUST verify `exists(/databases/$(database)/documents/publicForms/$(incoming().formKey))` and match its `ownerUid`, `formId`, and `status == 'published'`.
5. **Temporal Integrity & Immutability**: `createdAt == request.time` on create; `updatedAt == request.time` on update; `ownerUid`, `uid`, `formKey`, and `createdAt` are immutable after create.
6. **Verified Admin Identity**: Bootstrapped owner admin access checks both `request.auth.token.email == 'gajjars614@gmail.com'` AND `request.auth.token.email_verified == true`.
7. **Terminal State Locking**: Refunded payments (`refundStatus == 'refunded'`) and voided invoices (`status == 'void'`) cannot be mutated by non-admins.
8. **Secure List Queries**: Every `allow list` rule evaluates `resource.data.ownerUid == request.auth.uid` (or `resource.data.isActive == true` for plans) or `isAdmin()`.

## 2. The "Dirty Dozen" Adversarial Payloads (Must All Return PERMISSION_DENIED)
1. **Shadow Field Injection on User Create**: Creating `/users/{uid}` with extra field `{ "isAdmin": true }`.
2. **Self-Assigned Admin Role**: Non-admin creating `/admins/{uid}` with `{ "roleSlug": "super_admin" }`.
3. **Email Spoofing Admin Bypass**: Authenticated user with `email: "gajjars614@gmail.com"` and `email_verified: false` reading `/auditLogs/1`.
4. **Cross-Tenant PII Read**: User B calling `get` on `/users/userA` or `/forms/formOwnedByA`.
5. **Blanket Collection Scrape**: Non-admin running unconstrained `list` on `/submissions` without `where('ownerUid', '==', uid)`.
6. **Owner UID Spoofing on Form Create**: User B creating `/forms/f1` with `ownerUid: "userA"`.
7. **Immutable Field Tampering on Form Update**: User A updating `/forms/f1` to change `ownerUid` or `createdAt`.
8. **Client Timestamp Forgery**: Creating `/forms/f1` with a client-supplied past timestamp instead of `request.time`.
9. **ID Poisoning**: Creating `/forms/${'a'.repeat(200)}` with a 200-char document ID.
10. **Orphaned Public Submission**: Unauthenticated client creating `/submissions/s1` referencing a non-existent `formKey`.
11. **Value Poisoning on Update**: User A updating `/submissions/s1` with `{ "isRead": "not-a-boolean", "updatedAt": request.time }`.
12. **Audit Log Tampering**: Even an admin attempting to `update` or `delete` an immutable `/auditLogs/log1` document.
