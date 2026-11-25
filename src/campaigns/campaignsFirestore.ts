import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type Timestamp,
} from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from '../lib/firebase';
import { buildApiUrl } from '../lib/api';
import { compileEmailHtml, compileEmailText } from './emailRenderer';
import { STARTER_EMAIL_TEMPLATES } from './starterTemplates';
import type {
  AutomationActionType,
  AutomationTriggerType,
  EmailAudienceType,
  EmailAutomationRecord,
  EmailAutomationStepRecord,
  EmailBlock,
  EmailCampaignRecord,
  EmailCampaignStatus,
  EmailCampaignType,
  EmailCampaignUsageRecord,
  EmailCampaignVersionRecord,
  EmailDeliveryEventRecord,
  EmailDesignSettings,
  EmailListRecord,
  EmailScheduledJobRecord,
  EmailSegmentRecord,
  EmailSenderDomainRecord,
  EmailSenderSettingsRecord,
  EmailSubscriberRecord,
  EmailSubscriberStatus,
  EmailSuppressionRecord,
  EmailTemplateCategory,
  EmailTemplateRecord,
  EmailWebhookEventRecord,
  SegmentRule,
} from './types';
import { DEFAULT_DESIGN_SETTINGS, EMPTY_CAMPAIGN_STATS } from './types';

function requireUid(): string {
  const user = auth.currentUser;
  if (!user) throw new Error('Please sign in to continue.');
  return user.uid;
}

async function getBearerToken(): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new Error('Please sign in to continue.');
  return user.getIdToken();
}

function makeDocId(prefix: string): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const arr = new Uint8Array(12);
  crypto.getRandomValues(arr);
  const rand = Array.from(arr, (b) => chars[b % chars.length]).join('');
  return `${prefix}_${Date.now().toString(36)}_${rand}`;
}

function tsToIso(val: unknown): string {
  if (!val) return new Date().toISOString();
  if (typeof val === 'string') return val;
  if (typeof (val as Timestamp)?.toDate === 'function') {
    return (val as Timestamp).toDate().toISOString();
  }
  return new Date().toISOString();
}

export function currentMonthKey(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function normalizeEmail(raw: string): string {
  return String(raw || '').trim().toLowerCase().slice(0, 254);
}

export function isValidEmailFormat(raw: string): boolean {
  const e = normalizeEmail(raw);
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);
}

// ============================================================================
// DYNAMIC SEGMENT EVALUATOR & AUDIENCE RESOLUTION
// ============================================================================

export function evaluateSegmentRule(sub: EmailSubscriberRecord, rule: SegmentRule): boolean {
  const val = String(rule.value || '').trim().toLowerCase();
  if (!val) return true;

  let actual = '';
  let listCheck: string[] | null = null;
  if (rule.field === 'listId') {
    listCheck = (sub.listIds || []).map((x) => x.toLowerCase());
  } else if (rule.field === 'tag') {
    listCheck = (sub.tags || []).map((x) => x.toLowerCase());
  } else if (rule.field === 'status') {
    actual = String(sub.status || '').toLowerCase();
  } else if (rule.field === 'source') {
    actual = String(sub.source || '').toLowerCase();
  } else if (rule.field === 'emailDomain') {
    actual = String(sub.email.split('@')[1] || '').toLowerCase();
  } else if (rule.field === 'customField') {
    const key = String(rule.customKey || '').trim();
    actual = String(sub.customFields?.[key] || '').toLowerCase();
  }

  if (listCheck !== null) {
    if (rule.operator === 'equals') return listCheck.includes(val);
    if (rule.operator === 'not_equals') return !listCheck.includes(val);
    return listCheck.some((item) => item.includes(val));
  }

  if (rule.operator === 'equals') return actual === val;
  if (rule.operator === 'not_equals') return actual !== val;
  return actual.includes(val);
}

export function filterSubscribersBySegment(
  subscribers: EmailSubscriberRecord[],
  segment: Pick<EmailSegmentRecord, 'matchType' | 'rules'>
): EmailSubscriberRecord[] {
  if (!segment.rules || segment.rules.length === 0) return subscribers;
  return subscribers.filter((sub) => {
    if (segment.matchType === 'any') {
      return segment.rules.some((r) => evaluateSegmentRule(sub, r));
    }
    return segment.rules.every((r) => evaluateSegmentRule(sub, r));
  });
}

export function resolveEligibleRecipients(params: {
  audienceType: EmailAudienceType;
  listIds: string[];
  segmentId?: string;
  subscribers: EmailSubscriberRecord[];
  segments: EmailSegmentRecord[];
  suppressions: EmailSuppressionRecord[];
}): {
  eligible: EmailSubscriberRecord[];
  excludedSuppressed: number;
  excludedStatus: number;
} {
  const suppressedSet = new Set(params.suppressions.map((s) => normalizeEmail(s.email)));
  let pool: EmailSubscriberRecord[] = [];

  if (params.audienceType === 'all_subscribed') {
    pool = [...params.subscribers];
  } else if (params.audienceType === 'list') {
    const targetLists = new Set(params.listIds || []);
    pool = params.subscribers.filter((s) => (s.listIds || []).some((id) => targetLists.has(id)));
  } else if (params.audienceType === 'segment') {
    const seg = params.segments.find((s) => s.id === params.segmentId);
    pool = seg ? filterSubscribersBySegment(params.subscribers, seg) : [];
  }

  const seenEmails = new Set<string>();
  const eligible: EmailSubscriberRecord[] = [];
  let excludedSuppressed = 0;
  let excludedStatus = 0;

  for (const sub of pool) {
    const email = normalizeEmail(sub.email);
    if (!email || seenEmails.has(email)) continue;
    seenEmails.add(email);
    if (suppressedSet.has(email)) {
      excludedSuppressed += 1;
      continue;
    }
    if (sub.status !== 'subscribed') {
      excludedStatus += 1;
      continue;
    }
    eligible.push(sub);
  }

  return { eligible, excludedSuppressed, excludedStatus };
}

// ============================================================================
// 1. SENDER SETTINGS & DOMAINS
// ============================================================================

export async function getSenderSettings(
  fallbackEmail: string,
  fallbackName: string
): Promise<EmailSenderSettingsRecord> {
  const uid = requireUid();
  try {
    const ref = doc(db, 'email_sender_settings', uid);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const d = snap.data();
      return {
        ownerUid: uid,
        senderName: String(d.senderName || fallbackName || 'BrosDev Studio'),
        senderEmail: String(d.senderEmail || fallbackEmail || ''),
        replyTo: String(d.replyTo || ''),
        companyName: String(d.companyName || 'BrosDev IT Engineering Studio'),
        companyWebsite: String(d.companyWebsite || 'https://forms.brosdev.info'),
        companyLogoUrl: String(d.companyLogoUrl || ''),
        companyAddress: String(d.companyAddress || '548 Market Street, San Francisco, CA 94104'),
        defaultFooter: String(
          d.defaultFooter || 'You are receiving this email because you subscribed to updates.'
        ),
        additionalIdentities: Array.isArray(d.additionalIdentities) ? d.additionalIdentities : [],
        doubleOptInDefault: Boolean(d.doubleOptInDefault),
        campaignSuspended: Boolean(d.campaignSuspended),
        suspensionReason: String(d.suspensionReason || ''),
        updatedAt: tsToIso(d.updatedAt),
      };
    }
    return {
      ownerUid: uid,
      senderName: fallbackName || 'BrosDev Studio',
      senderEmail: fallbackEmail || '',
      replyTo: '',
      companyName: fallbackName || 'BrosDev Developer Services',
      companyWebsite: 'https://forms.brosdev.info',
      companyLogoUrl: '',
      companyAddress: '548 Market Street, San Francisco, CA 94104',
      defaultFooter: 'You are receiving this email because you subscribed to our updates.',
      additionalIdentities: [],
      doubleOptInDefault: true,
      campaignSuspended: false,
      suspensionReason: '',
      updatedAt: new Date().toISOString(),
    };
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, `email_sender_settings/${uid}`);
  }
}

export async function saveSenderSettings(
  input: Omit<EmailSenderSettingsRecord, 'ownerUid' | 'updatedAt' | 'campaignSuspended' | 'suspensionReason'>
): Promise<EmailSenderSettingsRecord> {
  const uid = requireUid();
  const ref = doc(db, 'email_sender_settings', uid);
  const existing = await getDoc(ref);
  const payload = {
    ownerUid: uid,
    senderName: String(input.senderName || '').trim().slice(0, 120),
    senderEmail: String(input.senderEmail || '').trim().slice(0, 254),
    replyTo: String(input.replyTo || '').trim().slice(0, 254),
    companyName: String(input.companyName || '').trim().slice(0, 160),
    companyWebsite: String(input.companyWebsite || '').trim().slice(0, 300),
    companyLogoUrl: String(input.companyLogoUrl || '').trim().slice(0, 500),
    companyAddress: String(input.companyAddress || '').trim().slice(0, 300),
    defaultFooter: String(input.defaultFooter || '').trim().slice(0, 600),
    additionalIdentities: (input.additionalIdentities || []).slice(0, 20),
    doubleOptInDefault: Boolean(input.doubleOptInDefault),
    campaignSuspended: existing.exists() ? Boolean(existing.data().campaignSuspended) : false,
    updatedAt: serverTimestamp(),
  };

  try {
    if (existing.exists()) {
      await updateDoc(ref, {
        senderName: payload.senderName,
        senderEmail: payload.senderEmail,
        replyTo: payload.replyTo,
        companyName: payload.companyName,
        companyWebsite: payload.companyWebsite,
        companyLogoUrl: payload.companyLogoUrl,
        companyAddress: payload.companyAddress,
        defaultFooter: payload.defaultFooter,
        additionalIdentities: payload.additionalIdentities,
        doubleOptInDefault: payload.doubleOptInDefault,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(ref, payload);
    }
    return {
      ...payload,
      suspensionReason: existing.exists() ? String(existing.data().suspensionReason || '') : '',
      updatedAt: new Date().toISOString(),
    };
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `email_sender_settings/${uid}`);
  }
}

export async function listSenderDomains(): Promise<EmailSenderDomainRecord[]> {
  const uid = requireUid();
  try {
    const snap = await getDocs(
      query(collection(db, 'email_sender_domains'), where('ownerUid', '==', uid), limit(50))
    );
    return snap.docs.map((d) => {
      const x = d.data();
      return {
        id: String(x.id || d.id),
        ownerUid: String(x.ownerUid || uid),
        domain: String(x.domain || ''),
        resendDomainId: String(x.resendDomainId || ''),
        status: (x.status || 'pending') as EmailSenderDomainRecord['status'],
        region: String(x.region || 'us-east-1'),
        dnsRecords: Array.isArray(x.dnsRecords) ? x.dnsRecords : [],
        lastCheckedAt: String(x.lastCheckedAt || ''),
        createdAt: tsToIso(x.createdAt),
        updatedAt: tsToIso(x.updatedAt),
      };
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'email_sender_domains');
  }
}

export async function syncSenderDomainsFromResend(
  action: 'list' | 'create' | 'verify' = 'list',
  domainName?: string,
  resendDomainId?: string
): Promise<{
  providerConfigured: boolean;
  domains: EmailSenderDomainRecord[];
  message: string;
}> {
  const uid = requireUid();
  const token = await getBearerToken();
  const resp = await fetch(buildApiUrl('/api/campaigns/domains'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ action, domain: domainName, resendDomainId }),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error(data?.error || 'Failed to sync Resend domain verification status.');
  }

  const remoteDomains: Array<{
    domain: string;
    resendDomainId: string;
    status: EmailSenderDomainRecord['status'];
    region: string;
    dnsRecords: EmailSenderDomainRecord['dnsRecords'];
  }> = Array.isArray(data.domains) ? data.domains : [];

  const existing = await listSenderDomains();
  const existingByDomain = new Map(existing.map((d) => [d.domain.toLowerCase(), d]));
  const nowIso = new Date().toISOString();

  for (const r of remoteDomains) {
    const cleanDom = String(r.domain || '').trim().toLowerCase();
    if (!cleanDom) continue;
    const match = existingByDomain.get(cleanDom);
    if (match) {
      await updateDoc(doc(db, 'email_sender_domains', match.id), {
        resendDomainId: String(r.resendDomainId || '').slice(0, 128),
        status: r.status || 'pending',
        region: String(r.region || 'us-east-1').slice(0, 40),
        dnsRecords: (r.dnsRecords || []).slice(0, 20),
        lastCheckedAt: nowIso,
        updatedAt: serverTimestamp(),
      });
    } else {
      const id = makeDocId('dom');
      await setDoc(doc(db, 'email_sender_domains', id), {
        id,
        ownerUid: uid,
        domain: cleanDom.slice(0, 160),
        resendDomainId: String(r.resendDomainId || '').slice(0, 128),
        status: r.status || 'pending',
        region: String(r.region || 'us-east-1').slice(0, 40),
        dnsRecords: (r.dnsRecords || []).slice(0, 20),
        lastCheckedAt: nowIso,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  }

  const updated = await listSenderDomains();
  return {
    providerConfigured: Boolean(data.providerConfigured),
    domains: updated,
    message: String(data.message || 'Synced with Resend.'),
  };
}

export async function deleteSenderDomainRecord(id: string): Promise<void> {
  requireUid();
  await deleteDoc(doc(db, 'email_sender_domains', id));
}

// ============================================================================
// 2. AUDIENCE LISTS, SUBSCRIBERS, SEGMENTS & SUPPRESSIONS
// ============================================================================

async function syncEmailListToPublicProjection(list: {
  id: string;
  ownerUid: string;
  name: string;
  status: EmailListRecord['status'];
}): Promise<void> {
  try {
    const pubStatus = list.status === 'active' ? 'active' : 'paused';
    const pubRef = doc(db, 'publicNewsletterLists', list.id);
    const snap = await getDoc(pubRef);
    if (!snap.exists()) {
      await setDoc(pubRef, {
        listKey: list.id,
        listId: 0,
        ownerUid: list.ownerUid,
        name: list.name.slice(0, 120) || 'Audience List',
        status: pubStatus,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      const cur = snap.data();
      if (cur?.status !== pubStatus || cur?.name !== list.name.slice(0, 120)) {
        await updateDoc(pubRef, {
          name: list.name.slice(0, 120) || 'Audience List',
          status: pubStatus,
          updatedAt: serverTimestamp(),
        });
      }
    }
  } catch {
    // Non-blocking best-effort sync
  }
}

export async function listEmailLists(): Promise<EmailListRecord[]> {
  const uid = requireUid();
  try {
    const snap = await getDocs(
      query(collection(db, 'email_lists'), where('ownerUid', '==', uid), limit(250))
    );
    const lists = snap.docs
      .map((d) => {
        const x = d.data();
        return {
          id: String(x.id || d.id),
          ownerUid: String(x.ownerUid || uid),
          name: String(x.name || ''),
          description: String(x.description || ''),
          doubleOptIn: Boolean(x.doubleOptIn),
          defaultSenderEmail: String(x.defaultSenderEmail || ''),
          status: (x.status || 'active') as EmailListRecord['status'],
          createdAt: tsToIso(x.createdAt),
          updatedAt: tsToIso(x.updatedAt),
        };
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    void Promise.all(lists.map((l) => syncEmailListToPublicProjection(l)));
    return lists;
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'email_lists');
  }
}

export async function createEmailList(input: {
  name: string;
  description?: string;
  doubleOptIn?: boolean;
  defaultSenderEmail?: string;
}): Promise<EmailListRecord> {
  const uid = requireUid();
  const name = String(input.name || '').trim().slice(0, 120);
  if (!name) throw new Error('List name is required.');
  const id = makeDocId('lst');
  const payload = {
    id,
    ownerUid: uid,
    name,
    description: String(input.description || '').trim().slice(0, 500),
    doubleOptIn: Boolean(input.doubleOptIn),
    defaultSenderEmail: String(input.defaultSenderEmail || '').trim().slice(0, 254),
    status: 'active' as const,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  await setDoc(doc(db, 'email_lists', id), payload);
  await syncEmailListToPublicProjection({ id, ownerUid: uid, name, status: 'active' });
  const now = new Date().toISOString();
  return { ...payload, createdAt: now, updatedAt: now };
}

export async function updateEmailList(
  id: string,
  patch: Partial<Pick<EmailListRecord, 'name' | 'description' | 'doubleOptIn' | 'defaultSenderEmail' | 'status'>>
): Promise<void> {
  const uid = requireUid();
  const clean: Record<string, unknown> = { updatedAt: serverTimestamp() };
  if (patch.name !== undefined) clean.name = String(patch.name).trim().slice(0, 120);
  if (patch.description !== undefined) clean.description = String(patch.description).trim().slice(0, 500);
  if (patch.doubleOptIn !== undefined) clean.doubleOptIn = Boolean(patch.doubleOptIn);
  if (patch.defaultSenderEmail !== undefined) {
    clean.defaultSenderEmail = String(patch.defaultSenderEmail).trim().slice(0, 254);
  }
  if (patch.status !== undefined) clean.status = patch.status;
  await updateDoc(doc(db, 'email_lists', id), clean);
  if (patch.name !== undefined || patch.status !== undefined) {
    await syncEmailListToPublicProjection({
      id,
      ownerUid: uid,
      name: String(patch.name || 'Audience List'),
      status: patch.status || 'active',
    });
  }
}

export async function deleteEmailList(id: string): Promise<void> {
  requireUid();
  await deleteDoc(doc(db, 'email_lists', id));
  await deleteDoc(doc(db, 'publicNewsletterLists', id)).catch(() => {});
}

export async function listEmailSubscribers(maxCount = 1000): Promise<EmailSubscriberRecord[]> {
  const uid = requireUid();
  try {
    const snap = await getDocs(
      query(collection(db, 'email_subscribers'), where('ownerUid', '==', uid), limit(maxCount))
    );
    return snap.docs
      .map((d) => {
        const x = d.data();
        return {
          id: String(x.id || d.id),
          ownerUid: String(x.ownerUid || uid),
          email: String(x.email || ''),
          firstName: String(x.firstName || ''),
          lastName: String(x.lastName || ''),
          status: (x.status || 'subscribed') as EmailSubscriberStatus,
          listIds: Array.isArray(x.listIds) ? x.listIds.map(String) : [],
          tags: Array.isArray(x.tags) ? x.tags.map(String) : [],
          customFields:
            x.customFields && typeof x.customFields === 'object'
              ? (x.customFields as Record<string, string>)
              : {},
          source: String(x.source || 'manual'),
          consentConfirmed: Boolean(x.consentConfirmed),
          consentNote: String(x.consentNote || ''),
          subscribedAt: String(x.subscribedAt || tsToIso(x.createdAt)),
          unsubscribedAt: String(x.unsubscribedAt || ''),
          lastActivityAt: String(x.lastActivityAt || ''),
          createdAt: tsToIso(x.createdAt),
          updatedAt: tsToIso(x.updatedAt),
        };
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'email_subscribers');
  }
}

export async function listEmailSuppressions(): Promise<EmailSuppressionRecord[]> {
  const uid = requireUid();
  try {
    const snap = await getDocs(
      query(collection(db, 'email_suppressions'), where('ownerUid', '==', uid), limit(1000))
    );
    return snap.docs
      .map((d) => {
        const x = d.data();
        return {
          id: String(x.id || d.id),
          ownerUid: String(x.ownerUid || uid),
          email: String(x.email || ''),
          reason: (x.reason || 'unsubscribed') as EmailSuppressionRecord['reason'],
          source: String(x.source || 'manual'),
          campaignId: String(x.campaignId || ''),
          createdAt: tsToIso(x.createdAt),
        };
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'email_suppressions');
  }
}

export async function addEmailSuppression(input: {
  email: string;
  reason: EmailSuppressionRecord['reason'];
  source?: string;
  campaignId?: string;
}): Promise<EmailSuppressionRecord> {
  const uid = requireUid();
  const email = normalizeEmail(input.email);
  if (!isValidEmailFormat(email)) throw new Error('Valid email address is required.');
  const id = makeDocId('sup');
  const payload: Record<string, unknown> = {
    id,
    ownerUid: uid,
    email,
    reason: input.reason,
    source: String(input.source || 'manual').slice(0, 80),
    createdAt: serverTimestamp(),
  };
  if (input.campaignId) payload.campaignId = String(input.campaignId).slice(0, 128);
  await setDoc(doc(db, 'email_suppressions', id), payload);
  return {
    id,
    ownerUid: uid,
    email,
    reason: input.reason,
    source: String(payload.source),
    campaignId: input.campaignId,
    createdAt: new Date().toISOString(),
  };
}

export async function removeEmailSuppression(id: string): Promise<void> {
  requireUid();
  await deleteDoc(doc(db, 'email_suppressions', id));
}

export async function upsertEmailSubscriber(input: {
  email: string;
  firstName?: string;
  lastName?: string;
  listIds?: string[];
  tags?: string[];
  customFields?: Record<string, string>;
  source?: string;
  status?: EmailSubscriberStatus;
  consentConfirmed: boolean;
  consentNote?: string;
}): Promise<{ subscriber: EmailSubscriberRecord; isNew: boolean }> {
  const uid = requireUid();
  const email = normalizeEmail(input.email);
  if (!isValidEmailFormat(email)) throw new Error('Please provide a valid email address.');
  if (!input.consentConfirmed) {
    throw new Error('Explicit subscriber consent confirmation is required before adding contacts.');
  }

  const existing = await listEmailSubscribers(1000);
  const found = existing.find((s) => normalizeEmail(s.email) === email);
  const nowIso = new Date().toISOString();

  if (found) {
    const mergedLists = Array.from(new Set([...found.listIds, ...(input.listIds || [])])).slice(0, 30);
    const mergedTags = Array.from(new Set([...found.tags, ...(input.tags || [])])).slice(0, 25);
    const mergedFields = { ...found.customFields, ...(input.customFields || {}) };
    const nextStatus =
      found.status === 'complained' || found.status === 'bounced'
        ? found.status
        : input.status || found.status;
    await updateDoc(doc(db, 'email_subscribers', found.id), {
      firstName: String(input.firstName ?? found.firstName).trim().slice(0, 100),
      lastName: String(input.lastName ?? found.lastName).trim().slice(0, 100),
      listIds: mergedLists,
      tags: mergedTags,
      customFields: mergedFields,
      status: nextStatus,
      consentConfirmed: true,
      consentNote: String(input.consentNote ?? found.consentNote ?? '').slice(0, 240),
      lastActivityAt: nowIso,
      updatedAt: serverTimestamp(),
    });
    return {
      isNew: false,
      subscriber: {
        ...found,
        firstName: String(input.firstName ?? found.firstName).trim().slice(0, 100),
        lastName: String(input.lastName ?? found.lastName).trim().slice(0, 100),
        listIds: mergedLists,
        tags: mergedTags,
        customFields: mergedFields,
        status: nextStatus,
        updatedAt: nowIso,
      },
    };
  }

  const id = makeDocId('sub');
  const payload = {
    id,
    ownerUid: uid,
    email,
    firstName: String(input.firstName || '').trim().slice(0, 100),
    lastName: String(input.lastName || '').trim().slice(0, 100),
    status: (input.status || 'subscribed') as EmailSubscriberStatus,
    listIds: Array.from(new Set(input.listIds || [])).slice(0, 30),
    tags: Array.from(new Set((input.tags || []).map((t) => t.trim()).filter(Boolean))).slice(0, 25),
    customFields: input.customFields || {},
    source: String(input.source || 'manual').trim().slice(0, 80),
    consentConfirmed: true,
    consentNote: String(input.consentNote || 'Explicitly confirmed by workspace owner').slice(0, 240),
    subscribedAt: nowIso,
    unsubscribedAt: '',
    lastActivityAt: nowIso,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  await setDoc(doc(db, 'email_subscribers', id), payload);
  return {
    isNew: true,
    subscriber: { ...payload, createdAt: nowIso, updatedAt: nowIso },
  };
}

export async function updateEmailSubscriber(
  id: string,
  patch: Partial<
    Pick<
      EmailSubscriberRecord,
      'firstName' | 'lastName' | 'status' | 'listIds' | 'tags' | 'customFields' | 'consentNote'
    >
  >
): Promise<void> {
  requireUid();
  const clean: Record<string, unknown> = {
    lastActivityAt: new Date().toISOString(),
    updatedAt: serverTimestamp(),
  };
  if (patch.firstName !== undefined) clean.firstName = String(patch.firstName).trim().slice(0, 100);
  if (patch.lastName !== undefined) clean.lastName = String(patch.lastName).trim().slice(0, 100);
  if (patch.status !== undefined) {
    clean.status = patch.status;
    if (patch.status === 'unsubscribed') {
      clean.unsubscribedAt = new Date().toISOString();
    }
  }
  if (patch.listIds !== undefined) clean.listIds = Array.from(new Set(patch.listIds)).slice(0, 30);
  if (patch.tags !== undefined) {
    clean.tags = Array.from(new Set(patch.tags.map((t) => t.trim()).filter(Boolean))).slice(0, 25);
  }
  if (patch.customFields !== undefined) clean.customFields = patch.customFields;
  if (patch.consentNote !== undefined) clean.consentNote = String(patch.consentNote).slice(0, 240);
  await updateDoc(doc(db, 'email_subscribers', id), clean);
}

export async function deleteEmailSubscriber(id: string): Promise<void> {
  requireUid();
  await deleteDoc(doc(db, 'email_subscribers', id));
}

export async function listEmailSegments(): Promise<EmailSegmentRecord[]> {
  const uid = requireUid();
  try {
    const snap = await getDocs(
      query(collection(db, 'email_segments'), where('ownerUid', '==', uid), limit(100))
    );
    return snap.docs
      .map((d) => {
        const x = d.data();
        return {
          id: String(x.id || d.id),
          ownerUid: String(x.ownerUid || uid),
          name: String(x.name || ''),
          description: String(x.description || ''),
          matchType: (x.matchType === 'any' ? 'any' : 'all') as 'all' | 'any',
          rules: Array.isArray(x.rules) ? (x.rules as SegmentRule[]) : [],
          createdAt: tsToIso(x.createdAt),
          updatedAt: tsToIso(x.updatedAt),
        };
      })
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'email_segments');
  }
}

export async function saveEmailSegment(input: {
  id?: string;
  name: string;
  description?: string;
  matchType: 'all' | 'any';
  rules: SegmentRule[];
}): Promise<EmailSegmentRecord> {
  const uid = requireUid();
  const name = String(input.name || '').trim().slice(0, 120);
  if (!name) throw new Error('Segment name is required.');
  const now = new Date().toISOString();

  if (input.id) {
    await updateDoc(doc(db, 'email_segments', input.id), {
      name,
      description: String(input.description || '').trim().slice(0, 400),
      matchType: input.matchType,
      rules: (input.rules || []).slice(0, 20),
      updatedAt: serverTimestamp(),
    });
    return {
      id: input.id,
      ownerUid: uid,
      name,
      description: String(input.description || '').trim(),
      matchType: input.matchType,
      rules: input.rules,
      createdAt: now,
      updatedAt: now,
    };
  }

  const id = makeDocId('seg');
  const payload = {
    id,
    ownerUid: uid,
    name,
    description: String(input.description || '').trim().slice(0, 400),
    matchType: input.matchType,
    rules: (input.rules || []).slice(0, 20),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  await setDoc(doc(db, 'email_segments', id), payload);
  return { ...payload, createdAt: now, updatedAt: now };
}

export async function deleteEmailSegment(id: string): Promise<void> {
  requireUid();
  await deleteDoc(doc(db, 'email_segments', id));
}

// ============================================================================
// 3. CAMPAIGNS & VERSIONS
// ============================================================================

export async function listEmailCampaigns(): Promise<EmailCampaignRecord[]> {
  const uid = requireUid();
  try {
    const snap = await getDocs(
      query(collection(db, 'email_campaigns'), where('ownerUid', '==', uid), limit(200))
    );
    return snap.docs
      .map((d) => {
        const x = d.data();
        return {
          id: String(x.id || d.id),
          ownerUid: String(x.ownerUid || uid),
          projectKey: String(x.projectKey || ''),
          name: String(x.name || 'Untitled Campaign'),
          campaignType: (x.campaignType || 'newsletter') as EmailCampaignType,
          status: (x.status || 'draft') as EmailCampaignStatus,
          subject: String(x.subject || ''),
          previewText: String(x.previewText || ''),
          senderName: String(x.senderName || ''),
          senderEmail: String(x.senderEmail || ''),
          replyTo: String(x.replyTo || ''),
          audienceType: (x.audienceType || 'all_subscribed') as EmailAudienceType,
          listIds: Array.isArray(x.listIds) ? x.listIds.map(String) : [],
          segmentId: String(x.segmentId || ''),
          templateId: String(x.templateId || ''),
          blocks: Array.isArray(x.blocks) ? (x.blocks as EmailBlock[]) : [],
          designSettings: {
            ...DEFAULT_DESIGN_SETTINGS,
            ...(x.designSettings || {}),
          },
          compiledHtml: String(x.compiledHtml || ''),
          compiledText: String(x.compiledText || ''),
          scheduledAt: String(x.scheduledAt || ''),
          timezone: String(x.timezone || 'UTC'),
          sentAt: String(x.sentAt || ''),
          recipientCount: Number(x.recipientCount || 0),
          stats: { ...EMPTY_CAMPAIGN_STATS, ...(x.stats || {}) },
          removeBranding: Boolean(x.removeBranding),
          abuseSuspended: Boolean(x.abuseSuspended),
          createdAt: tsToIso(x.createdAt),
          updatedAt: tsToIso(x.updatedAt),
        };
      })
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'email_campaigns');
  }
}

export async function saveEmailCampaign(
  input: Partial<EmailCampaignRecord> & {
    name: string;
    campaignType: EmailCampaignType;
    subject: string;
    blocks: EmailBlock[];
  },
  senderSettings?: EmailSenderSettingsRecord | null
): Promise<EmailCampaignRecord> {
  const uid = requireUid();
  const design: EmailDesignSettings = {
    ...DEFAULT_DESIGN_SETTINGS,
    ...(input.designSettings || {}),
  };
  const compiledHtml = compileEmailHtml({
    subject: input.subject,
    previewText: input.previewText,
    blocks: input.blocks,
    design,
    senderSettings,
    removeBranding: Boolean(input.removeBranding),
  }).slice(0, 195000);
  const compiledText = compileEmailText({
    subject: input.subject,
    previewText: input.previewText,
    blocks: input.blocks,
    design,
    senderSettings,
    removeBranding: Boolean(input.removeBranding),
  }).slice(0, 58000);

  const now = new Date().toISOString();

  if (input.id) {
    const patch = {
      name: String(input.name || 'Untitled Campaign').trim().slice(0, 160),
      campaignType: input.campaignType,
      status: input.status || 'draft',
      subject: String(input.subject || '').slice(0, 240),
      previewText: String(input.previewText || '').slice(0, 300),
      senderName: String(input.senderName || senderSettings?.senderName || '').slice(0, 120),
      senderEmail: String(input.senderEmail || senderSettings?.senderEmail || '').slice(0, 254),
      replyTo: String(input.replyTo || senderSettings?.replyTo || '').slice(0, 254),
      audienceType: input.audienceType || 'all_subscribed',
      listIds: (input.listIds || []).slice(0, 30),
      segmentId: String(input.segmentId || '').slice(0, 128),
      templateId: String(input.templateId || '').slice(0, 128),
      blocks: (input.blocks || []).slice(0, 60),
      designSettings: design,
      compiledHtml,
      compiledText,
      scheduledAt: String(input.scheduledAt || '').slice(0, 64),
      timezone: String(input.timezone || 'UTC').slice(0, 64),
      recipientCount: Number(input.recipientCount || 0),
      removeBranding: Boolean(input.removeBranding),
      updatedAt: serverTimestamp(),
    };
    await updateDoc(doc(db, 'email_campaigns', input.id), patch);
    return {
      ...patch,
      id: input.id,
      ownerUid: uid,
      stats: input.stats || { ...EMPTY_CAMPAIGN_STATS },
      abuseSuspended: Boolean(input.abuseSuspended),
      sentAt: input.sentAt || '',
      createdAt: input.createdAt || now,
      updatedAt: now,
    };
  }

  const id = makeDocId('cmp');
  const payload = {
    id,
    ownerUid: uid,
    projectKey: String(input.projectKey || '').slice(0, 64),
    name: String(input.name || 'Untitled Campaign').trim().slice(0, 160),
    campaignType: input.campaignType,
    status: (input.status || 'draft') as EmailCampaignStatus,
    subject: String(input.subject || '').slice(0, 240),
    previewText: String(input.previewText || '').slice(0, 300),
    senderName: String(input.senderName || senderSettings?.senderName || 'BrosDev Studio').slice(0, 120),
    senderEmail: String(input.senderEmail || senderSettings?.senderEmail || '').slice(0, 254),
    replyTo: String(input.replyTo || senderSettings?.replyTo || '').slice(0, 254),
    audienceType: (input.audienceType || 'all_subscribed') as EmailAudienceType,
    listIds: (input.listIds || []).slice(0, 30),
    segmentId: String(input.segmentId || '').slice(0, 128),
    templateId: String(input.templateId || '').slice(0, 128),
    blocks: (input.blocks || []).slice(0, 60),
    designSettings: design,
    compiledHtml,
    compiledText,
    scheduledAt: String(input.scheduledAt || '').slice(0, 64),
    timezone: String(input.timezone || 'UTC').slice(0, 64),
    sentAt: '',
    recipientCount: Number(input.recipientCount || 0),
    stats: { ...EMPTY_CAMPAIGN_STATS },
    removeBranding: Boolean(input.removeBranding),
    abuseSuspended: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  await setDoc(doc(db, 'email_campaigns', id), payload);
  return { ...payload, createdAt: now, updatedAt: now };
}

export async function duplicateEmailCampaign(source: EmailCampaignRecord): Promise<EmailCampaignRecord> {
  return saveEmailCampaign({
    ...source,
    id: undefined,
    name: `${source.name} (Copy)`.slice(0, 160),
    status: 'draft',
    scheduledAt: '',
    sentAt: '',
    stats: { ...EMPTY_CAMPAIGN_STATS },
  });
}

export async function deleteEmailCampaign(id: string): Promise<void> {
  requireUid();
  await deleteDoc(doc(db, 'email_campaigns', id));
}

export async function createCampaignVersionSnapshot(
  campaign: EmailCampaignRecord,
  versionNum: number
): Promise<EmailCampaignVersionRecord> {
  const uid = requireUid();
  const id = makeDocId('ver');
  const payload = {
    id,
    campaignId: campaign.id,
    ownerUid: uid,
    version: Math.max(1, versionNum),
    subject: campaign.subject.slice(0, 240),
    blocks: campaign.blocks.slice(0, 60),
    designSettings: campaign.designSettings,
    createdAt: serverTimestamp(),
  };
  await setDoc(doc(db, 'email_campaign_versions', id), payload);
  return { ...payload, createdAt: new Date().toISOString() };
}

// ============================================================================
// 4. SERVER-SIDE TEST SEND, IMMEDIATE SEND & DURABLE SCHEDULING
// ============================================================================

export async function sendCampaignTestEmail(params: {
  campaignId: string;
  toEmail: string;
  subject: string;
  previewText: string;
  senderName: string;
  senderEmail: string;
  replyTo?: string;
  html: string;
  text: string;
}): Promise<{ ok: boolean; providerMessageId: string; message: string }> {
  const token = await getBearerToken();
  const resp = await fetch(buildApiUrl(`/api/campaigns/${encodeURIComponent(params.campaignId)}/test`), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(params),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error(data?.error || 'Test email failed via Resend.');
  }
  return {
    ok: true,
    providerMessageId: String(data.providerMessageId || ''),
    message: String(data.message || 'Test email accepted by Resend.'),
  };
}

export async function dispatchCampaignNow(params: {
  campaign: EmailCampaignRecord;
  recipients: EmailSubscriberRecord[];
  maxMonthlyQuota: number;
  usedThisMonth: number;
}): Promise<{
  sent: number;
  failed: number;
  skipped: number;
  providerMessageIds: string[];
  errors: string[];
}> {
  const uid = requireUid();
  const token = await getBearerToken();
  const resp = await fetch(
    buildApiUrl(`/api/campaigns/${encodeURIComponent(params.campaign.id)}/send`),
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        campaignId: params.campaign.id,
        subject: params.campaign.subject,
        previewText: params.campaign.previewText,
        senderName: params.campaign.senderName,
        senderEmail: params.campaign.senderEmail,
        replyTo: params.campaign.replyTo,
        compiledHtml: params.campaign.compiledHtml,
        compiledText: params.campaign.compiledText,
        maxMonthlyQuota: params.maxMonthlyQuota,
        usedThisMonth: params.usedThisMonth,
        recipients: params.recipients.map((r) => ({
          id: r.id,
          email: r.email,
          firstName: r.firstName,
          lastName: r.lastName,
        })),
      }),
    }
  );
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error(data?.error || 'Campaign dispatch failed.');
  }

  // Persist authoritative stats & usage counter under the authenticated owner
  const nowIso = new Date().toISOString();
  const sentCount = Number(data.sent || 0);
  const failedCount = Number(data.failed || 0);
  const nextStatus: EmailCampaignStatus =
    sentCount > 0 ? 'sent' : failedCount > 0 ? 'failed' : 'sent';

  await updateDoc(doc(db, 'email_campaigns', params.campaign.id), {
    status: nextStatus,
    sentAt: nowIso,
    recipientCount: params.recipients.length,
    stats: {
      ...EMPTY_CAMPAIGN_STATS,
      ...params.campaign.stats,
      totalRecipients: params.recipients.length,
      sent: sentCount,
      failed: failedCount,
    },
    updatedAt: serverTimestamp(),
  });

  await incrementMonthlyCampaignUsage(uid, sentCount, 1);

  return {
    sent: sentCount,
    failed: failedCount,
    skipped: Number(data.skipped || 0),
    providerMessageIds: Array.isArray(data.providerMessageIds) ? data.providerMessageIds : [],
    errors: Array.isArray(data.errors) ? data.errors : [],
  };
}

export async function scheduleCampaignDelivery(params: {
  campaign: EmailCampaignRecord;
  scheduledAtIso: string;
  timezone: string;
  recipientCount: number;
}): Promise<EmailScheduledJobRecord> {
  const uid = requireUid();
  const jobId = makeDocId('job');
  const idempotencyKey = `cmp_${params.campaign.id}_${Date.parse(params.scheduledAtIso) || Date.now()}`;
  const jobPayload = {
    id: jobId,
    ownerUid: uid,
    jobType: 'campaign_send' as const,
    campaignId: params.campaign.id,
    status: 'queued' as const,
    scheduledAt: params.scheduledAtIso.slice(0, 64),
    timezone: String(params.timezone || 'UTC').slice(0, 64),
    attempts: 0,
    maxAttempts: 3,
    idempotencyKey,
    processedCount: 0,
    failedCount: 0,
    lastError: '',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  await setDoc(doc(db, 'email_scheduled_jobs', jobId), jobPayload);
  await updateDoc(doc(db, 'email_campaigns', params.campaign.id), {
    status: 'scheduled',
    scheduledAt: params.scheduledAtIso.slice(0, 64),
    timezone: String(params.timezone || 'UTC').slice(0, 64),
    recipientCount: params.recipientCount,
    updatedAt: serverTimestamp(),
  });

  const now = new Date().toISOString();
  return { ...jobPayload, createdAt: now, updatedAt: now };
}

export async function updateScheduledCampaignStatus(
  campaignId: string,
  jobId: string | undefined,
  action: 'pause' | 'resume' | 'cancel'
): Promise<void> {
  requireUid();
  const nextCampaignStatus: EmailCampaignStatus =
    action === 'pause' ? 'paused' : action === 'resume' ? 'scheduled' : 'canceled';
  const nextJobStatus: EmailScheduledJobRecord['status'] =
    action === 'pause' ? 'paused' : action === 'resume' ? 'queued' : 'canceled';

  await updateDoc(doc(db, 'email_campaigns', campaignId), {
    status: nextCampaignStatus,
    updatedAt: serverTimestamp(),
  });
  if (jobId) {
    await updateDoc(doc(db, 'email_scheduled_jobs', jobId), {
      status: nextJobStatus,
      updatedAt: serverTimestamp(),
    });
  }
}

export async function listScheduledJobs(): Promise<EmailScheduledJobRecord[]> {
  const uid = requireUid();
  try {
    const snap = await getDocs(
      query(collection(db, 'email_scheduled_jobs'), where('ownerUid', '==', uid), limit(150))
    );
    return snap.docs
      .map((d) => {
        const x = d.data();
        return {
          id: String(x.id || d.id),
          ownerUid: String(x.ownerUid || uid),
          jobType: (x.jobType || 'campaign_send') as EmailScheduledJobRecord['jobType'],
          campaignId: String(x.campaignId || ''),
          automationId: String(x.automationId || ''),
          stepId: String(x.stepId || ''),
          subscriberEmail: String(x.subscriberEmail || ''),
          status: (x.status || 'queued') as EmailScheduledJobRecord['status'],
          scheduledAt: String(x.scheduledAt || ''),
          timezone: String(x.timezone || 'UTC'),
          attempts: Number(x.attempts || 0),
          maxAttempts: Number(x.maxAttempts || 3),
          idempotencyKey: String(x.idempotencyKey || ''),
          processedCount: Number(x.processedCount || 0),
          failedCount: Number(x.failedCount || 0),
          lastError: String(x.lastError || ''),
          startedAt: String(x.startedAt || ''),
          completedAt: String(x.completedAt || ''),
          createdAt: tsToIso(x.createdAt),
          updatedAt: tsToIso(x.updatedAt),
        };
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'email_scheduled_jobs');
  }
}

// ============================================================================
// 5. TEMPLATES, AUTOMATIONS & ANALYTICS
// ============================================================================

export async function listEmailTemplates(): Promise<EmailTemplateRecord[]> {
  const uid = requireUid();
  try {
    const snap = await getDocs(
      query(collection(db, 'email_templates'), where('ownerUid', '==', uid), limit(100))
    );
    const custom: EmailTemplateRecord[] = snap.docs.map((d) => {
      const x = d.data();
      return {
        id: String(x.id || d.id),
        ownerUid: String(x.ownerUid || uid),
        name: String(x.name || 'Custom Template'),
        category: (x.category || 'newsletter') as EmailTemplateCategory,
        description: String(x.description || ''),
        subject: String(x.subject || ''),
        previewText: String(x.previewText || ''),
        blocks: Array.isArray(x.blocks) ? (x.blocks as EmailBlock[]) : [],
        designSettings: { ...DEFAULT_DESIGN_SETTINGS, ...(x.designSettings || {}) },
        isBuiltIn: false,
        createdAt: tsToIso(x.createdAt),
        updatedAt: tsToIso(x.updatedAt),
      };
    });
    return [...custom, ...STARTER_EMAIL_TEMPLATES];
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'email_templates');
  }
}

export async function saveCustomEmailTemplate(input: {
  id?: string;
  name: string;
  category: EmailTemplateCategory;
  description: string;
  subject: string;
  previewText: string;
  blocks: EmailBlock[];
  designSettings: EmailDesignSettings;
}): Promise<EmailTemplateRecord> {
  const uid = requireUid();
  const now = new Date().toISOString();
  if (input.id && !input.id.startsWith('tpl_')) {
    await updateDoc(doc(db, 'email_templates', input.id), {
      name: input.name.trim().slice(0, 120),
      category: input.category,
      description: input.description.trim().slice(0, 400),
      subject: input.subject.slice(0, 240),
      previewText: input.previewText.slice(0, 300),
      blocks: input.blocks.slice(0, 60),
      designSettings: input.designSettings,
      updatedAt: serverTimestamp(),
    });
    return {
      ...input,
      id: input.id,
      ownerUid: uid,
      isBuiltIn: false,
      createdAt: now,
      updatedAt: now,
    };
  }
  const id = makeDocId('etp');
  const payload = {
    id,
    ownerUid: uid,
    name: input.name.trim().slice(0, 120),
    category: input.category,
    description: input.description.trim().slice(0, 400),
    subject: input.subject.slice(0, 240),
    previewText: input.previewText.slice(0, 300),
    blocks: input.blocks.slice(0, 60),
    designSettings: input.designSettings,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  await setDoc(doc(db, 'email_templates', id), payload);
  return { ...payload, isBuiltIn: false, createdAt: now, updatedAt: now };
}

export async function deleteCustomEmailTemplate(id: string): Promise<void> {
  requireUid();
  await deleteDoc(doc(db, 'email_templates', id));
}

export async function listEmailAutomations(): Promise<{
  automations: EmailAutomationRecord[];
  steps: EmailAutomationStepRecord[];
}> {
  const uid = requireUid();
  try {
    const [autoSnap, stepSnap] = await Promise.all([
      getDocs(query(collection(db, 'email_automations'), where('ownerUid', '==', uid), limit(100))),
      getDocs(
        query(collection(db, 'email_automation_steps'), where('ownerUid', '==', uid), limit(300))
      ),
    ]);
    const automations = autoSnap.docs
      .map((d) => {
        const x = d.data();
        return {
          id: String(x.id || d.id),
          ownerUid: String(x.ownerUid || uid),
          name: String(x.name || ''),
          description: String(x.description || ''),
          triggerType: (x.triggerType || 'new_subscriber') as AutomationTriggerType,
          targetListId: String(x.targetListId || ''),
          status: (x.status || 'draft') as EmailAutomationRecord['status'],
          triggeredCount: Number(x.triggeredCount || 0),
          sentCount: Number(x.sentCount || 0),
          createdAt: tsToIso(x.createdAt),
          updatedAt: tsToIso(x.updatedAt),
        };
      })
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

    const steps = stepSnap.docs
      .map((d) => {
        const x = d.data();
        return {
          id: String(x.id || d.id),
          automationId: String(x.automationId || ''),
          ownerUid: String(x.ownerUid || uid),
          stepOrder: Number(x.stepOrder || 1),
          actionType: (x.actionType || 'send_welcome') as AutomationActionType,
          delayMinutes: Number(x.delayMinutes || 0),
          subject: String(x.subject || ''),
          templateId: String(x.templateId || ''),
          tagValue: String(x.tagValue || ''),
          statusValue: String(x.statusValue || ''),
          blocks: Array.isArray(x.blocks) ? (x.blocks as EmailBlock[]) : undefined,
          createdAt: tsToIso(x.createdAt),
          updatedAt: tsToIso(x.updatedAt),
        };
      })
      .sort((a, b) => a.stepOrder - b.stepOrder);

    return { automations, steps };
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'email_automations');
  }
}

export async function createEmailAutomation(input: {
  name: string;
  description: string;
  triggerType: AutomationTriggerType;
  targetListId?: string;
  steps: Array<{
    actionType: AutomationActionType;
    delayMinutes: number;
    subject: string;
    templateId?: string;
    tagValue?: string;
    statusValue?: string;
  }>;
}): Promise<EmailAutomationRecord> {
  const uid = requireUid();
  const id = makeDocId('aut');
  const payload = {
    id,
    ownerUid: uid,
    name: input.name.trim().slice(0, 140),
    description: input.description.trim().slice(0, 400),
    triggerType: input.triggerType,
    targetListId: String(input.targetListId || '').slice(0, 128),
    status: 'active' as const,
    triggeredCount: 0,
    sentCount: 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  await setDoc(doc(db, 'email_automations', id), payload);

  for (let i = 0; i < Math.min(input.steps.length, 15); i += 1) {
    const s = input.steps[i];
    const stepId = makeDocId('stp');
    await setDoc(doc(db, 'email_automation_steps', stepId), {
      id: stepId,
      automationId: id,
      ownerUid: uid,
      stepOrder: i + 1,
      actionType: s.actionType,
      delayMinutes: Math.max(0, Math.min(525600, Number(s.delayMinutes || 0))),
      subject: String(s.subject || '').slice(0, 240),
      templateId: String(s.templateId || '').slice(0, 128),
      tagValue: String(s.tagValue || '').slice(0, 64),
      statusValue: String(s.statusValue || '').slice(0, 40),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  const now = new Date().toISOString();
  return { ...payload, createdAt: now, updatedAt: now };
}

export async function toggleAutomationStatus(
  id: string,
  status: 'active' | 'paused'
): Promise<void> {
  requireUid();
  await updateDoc(doc(db, 'email_automations', id), {
    status,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteEmailAutomation(id: string, stepIds: string[]): Promise<void> {
  requireUid();
  await Promise.all([
    deleteDoc(doc(db, 'email_automations', id)),
    ...stepIds.map((sid) => deleteDoc(doc(db, 'email_automation_steps', sid))),
  ]);
}

export async function enqueueAutomationForSubscriber(
  automation: EmailAutomationRecord,
  steps: EmailAutomationStepRecord[],
  subscriberEmail: string
): Promise<number> {
  const uid = requireUid();
  const cleanEmail = normalizeEmail(subscriberEmail);
  if (!isValidEmailFormat(cleanEmail)) return 0;

  let queued = 0;
  for (const step of steps) {
    const jobId = makeDocId('ajb');
    const due = new Date(Date.now() + step.delayMinutes * 60 * 1000).toISOString();
    await setDoc(doc(db, 'email_scheduled_jobs', jobId), {
      id: jobId,
      ownerUid: uid,
      jobType: 'automation_step',
      automationId: automation.id,
      stepId: step.id,
      subscriberEmail: cleanEmail,
      status: 'queued',
      scheduledAt: due,
      timezone: 'UTC',
      attempts: 0,
      maxAttempts: 3,
      idempotencyKey: `aut_${automation.id}_${step.id}_${cleanEmail.replace(/[^a-z0-9]/g, '').slice(0, 24)}_${Date.now()}`,
      processedCount: 0,
      failedCount: 0,
      lastError: '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    queued += 1;
  }

  await updateDoc(doc(db, 'email_automations', automation.id), {
    triggeredCount: (automation.triggeredCount || 0) + 1,
    updatedAt: serverTimestamp(),
  });
  return queued;
}

export async function listEmailDeliveryEvents(maxCount = 500): Promise<EmailDeliveryEventRecord[]> {
  const uid = requireUid();
  try {
    const snap = await getDocs(
      query(collection(db, 'email_delivery_events'), where('ownerUid', '==', uid), limit(maxCount))
    );
    return snap.docs
      .map((d) => {
        const x = d.data();
        return {
          id: String(x.id || d.id),
          ownerUid: String(x.ownerUid || uid),
          campaignId: String(x.campaignId || ''),
          subscriberEmail: String(x.subscriberEmail || ''),
          providerMessageId: String(x.providerMessageId || ''),
          eventType: (x.eventType || 'sent') as EmailDeliveryEventRecord['eventType'],
          linkUrl: String(x.linkUrl || ''),
          errorMessage: String(x.errorMessage || ''),
          occurredAt: String(x.occurredAt || tsToIso(x.createdAt)),
          createdAt: tsToIso(x.createdAt),
        };
      })
      .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'email_delivery_events');
  }
}

export async function getMonthlyCampaignUsage(): Promise<EmailCampaignUsageRecord> {
  const uid = requireUid();
  const monthKey = currentMonthKey();
  const docId = `${uid}_${monthKey.replace('-', '')}`;
  try {
    const snap = await getDoc(doc(db, 'email_campaign_usage', docId));
    if (snap.exists()) {
      const x = snap.data();
      return {
        id: docId,
        ownerUid: uid,
        monthKey,
        emailsSent: Number(x.emailsSent || 0),
        campaignsSent: Number(x.campaignsSent || 0),
        bounces: Number(x.bounces || 0),
        complaints: Number(x.complaints || 0),
        updatedAt: tsToIso(x.updatedAt),
      };
    }
    return {
      id: docId,
      ownerUid: uid,
      monthKey,
      emailsSent: 0,
      campaignsSent: 0,
      bounces: 0,
      complaints: 0,
      updatedAt: new Date().toISOString(),
    };
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, `email_campaign_usage/${docId}`);
  }
}

async function incrementMonthlyCampaignUsage(
  uid: string,
  emailsDelta: number,
  campaignsDelta: number
): Promise<void> {
  const monthKey = currentMonthKey();
  const docId = `${uid}_${monthKey.replace('-', '')}`;
  const ref = doc(db, 'email_campaign_usage', docId);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    const x = snap.data();
    await updateDoc(ref, {
      emailsSent: Number(x.emailsSent || 0) + Math.max(0, emailsDelta),
      campaignsSent: Number(x.campaignsSent || 0) + Math.max(0, campaignsDelta),
      updatedAt: serverTimestamp(),
    });
  } else {
    await setDoc(ref, {
      id: docId,
      ownerUid: uid,
      monthKey,
      emailsSent: Math.max(0, emailsDelta),
      campaignsSent: Math.max(0, campaignsDelta),
      bounces: 0,
      complaints: 0,
      updatedAt: serverTimestamp(),
    });
  }
}

// ============================================================================
// 6. SUPER ADMIN CAMPAIGNS OVERSIGHT
// ============================================================================

export interface AdminCampaignOverview {
  campaigns: EmailCampaignRecord[];
  subscriberCountByOwner: Record<string, number>;
  webhookEvents: EmailWebhookEventRecord[];
  suppressionsCount: number;
  failedDeliveriesCount: number;
  suspendedOwnerUids: string[];
}

export async function adminFetchCampaignOverview(): Promise<AdminCampaignOverview> {
  requireUid();
  const [cmpSnap, subSnap, whSnap, supSnap, evtSnap, setSnap] = await Promise.all([
    getDocs(query(collection(db, 'email_campaigns'), limit(200))),
    getDocs(query(collection(db, 'email_subscribers'), limit(1000))),
    getDocs(query(collection(db, 'email_webhook_events'), limit(100))),
    getDocs(query(collection(db, 'email_suppressions'), limit(500))),
    getDocs(query(collection(db, 'email_delivery_events'), limit(500))),
    getDocs(query(collection(db, 'email_sender_settings'), limit(200))),
  ]);

  const campaigns: EmailCampaignRecord[] = cmpSnap.docs
    .map((d) => {
      const x = d.data();
      return {
        id: String(x.id || d.id),
        ownerUid: String(x.ownerUid || ''),
        name: String(x.name || 'Untitled'),
        campaignType: (x.campaignType || 'newsletter') as EmailCampaignType,
        status: (x.status || 'draft') as EmailCampaignStatus,
        subject: String(x.subject || ''),
        previewText: String(x.previewText || ''),
        senderName: String(x.senderName || ''),
        senderEmail: String(x.senderEmail || ''),
        replyTo: String(x.replyTo || ''),
        audienceType: (x.audienceType || 'all_subscribed') as EmailAudienceType,
        listIds: Array.isArray(x.listIds) ? x.listIds.map(String) : [],
        blocks: [],
        designSettings: { ...DEFAULT_DESIGN_SETTINGS },
        recipientCount: Number(x.recipientCount || 0),
        stats: { ...EMPTY_CAMPAIGN_STATS, ...(x.stats || {}) },
        removeBranding: Boolean(x.removeBranding),
        abuseSuspended: Boolean(x.abuseSuspended),
        sentAt: String(x.sentAt || ''),
        scheduledAt: String(x.scheduledAt || ''),
        createdAt: tsToIso(x.createdAt),
        updatedAt: tsToIso(x.updatedAt),
      };
    })
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  const subscriberCountByOwner: Record<string, number> = {};
  subSnap.docs.forEach((d) => {
    const uid = String(d.data().ownerUid || '');
    if (uid) subscriberCountByOwner[uid] = (subscriberCountByOwner[uid] || 0) + 1;
  });

  const webhookEvents: EmailWebhookEventRecord[] = whSnap.docs
    .map((d) => {
      const x = d.data();
      return {
        id: String(x.id || d.id),
        ownerUid: String(x.ownerUid || ''),
        campaignId: String(x.campaignId || ''),
        provider: 'resend' as const,
        eventType: String(x.eventType || ''),
        providerMessageId: String(x.providerMessageId || ''),
        recipientEmail: String(x.recipientEmail || ''),
        status: (x.status || 'processed') as EmailWebhookEventRecord['status'],
        receivedAt: String(x.receivedAt || tsToIso(x.createdAt)),
        createdAt: tsToIso(x.createdAt),
      };
    })
    .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));

  const failedDeliveriesCount = evtSnap.docs.filter((d) =>
    ['failed', 'bounced', 'complained'].includes(String(d.data().eventType || ''))
  ).length;

  const suspendedOwnerUids = setSnap.docs
    .filter((d) => Boolean(d.data().campaignSuspended))
    .map((d) => d.id);

  return {
    campaigns,
    subscriberCountByOwner,
    webhookEvents,
    suppressionsCount: supSnap.size,
    failedDeliveriesCount,
    suspendedOwnerUids,
  };
}

export async function adminToggleCampaignAccountSuspension(
  targetOwnerUid: string,
  suspend: boolean,
  reason = 'Suspended by administrator for abuse/compliance review'
): Promise<void> {
  requireUid();
  const ref = doc(db, 'email_sender_settings', targetOwnerUid);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    await updateDoc(ref, {
      campaignSuspended: suspend,
      suspensionReason: suspend ? reason.slice(0, 400) : '',
      updatedAt: serverTimestamp(),
    });
  } else {
    await setDoc(ref, {
      ownerUid: targetOwnerUid,
      senderName: 'Suspended Account',
      senderEmail: '',
      replyTo: '',
      companyName: '',
      companyWebsite: '',
      companyLogoUrl: '',
      companyAddress: '',
      defaultFooter: '',
      doubleOptInDefault: true,
      campaignSuspended: suspend,
      suspensionReason: suspend ? reason.slice(0, 400) : '',
      updatedAt: serverTimestamp(),
    });
  }
}

export async function adminToggleCampaignAbuseFlag(
  campaignId: string,
  abuseSuspended: boolean
): Promise<void> {
  requireUid();
  await updateDoc(doc(db, 'email_campaigns', campaignId), {
    abuseSuspended,
    status: abuseSuspended ? 'paused' : 'draft',
    updatedAt: serverTimestamp(),
  });
}
