import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type Timestamp,
} from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from './firebase';
import { buildApiUrl } from './api';
import type {
  ApiKeyRecord,
  DeveloperProductId,
  DevServicesSummary,
  NewsletterListRecord,
  NewsletterSubscriberRecord,
  ProjectRecord,
  ShortLinkRecord,
  UtilityRecord,
  WebhookDeliveryRecord,
  WebhookEventType,
  WebhookRecord,
} from '../types';

function requireUid(): string {
  const user = auth.currentUser;
  if (!user) throw new Error('Please sign in to continue.');
  return user.uid;
}

function nowNumericId(): number {
  return Date.now() * 1000 + Math.floor(Math.random() * 1000);
}

function randomToken(len = 24): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const arr = new Uint8Array(len);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => chars[b % chars.length]).join('');
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function tsToIso(val: unknown): string {
  if (!val) return new Date().toISOString();
  if (typeof val === 'string') return val;
  if (typeof (val as Timestamp)?.toDate === 'function') {
    return (val as Timestamp).toDate().toISOString();
  }
  return new Date().toISOString();
}

function normalizeDomain(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .replace(/:\d+$/, '')
    .slice(0, 120);
}

export function isValidPublicHttpsUrl(raw: string): boolean {
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== 'https:') return false;
    const h = u.hostname.toLowerCase();
    if (
      !h ||
      h === 'localhost' ||
      h.endsWith('.local') ||
      h.endsWith('.internal') ||
      h === '::1' ||
      h.startsWith('[') ||
      /^127\./.test(h) ||
      /^10\./.test(h) ||
      /^0\./.test(h) ||
      /^192\.168\./.test(h) ||
      /^169\.254\./.test(h) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(h)
    ) {
      return false;
    }
    return h.includes('.');
  } catch {
    return false;
  }
}

export function isValidHttpUrl(raw: string): boolean {
  try {
    const u = new URL(raw.trim());
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

// ============================================================================
// 1. PROJECTS & DOMAIN MANAGEMENT
// ============================================================================

export async function listProjects(): Promise<ProjectRecord[]> {
  const uid = requireUid();
  try {
    const snap = await getDocs(query(collection(db, 'projects'), where('ownerUid', '==', uid)));
    return snap.docs
      .map((d) => {
        const x = d.data();
        return {
          id: Number(x.id || 0),
          docId: d.id,
          projectKey: String(x.projectKey || d.id),
          ownerUid: String(x.ownerUid || uid),
          name: String(x.name || ''),
          description: String(x.description || ''),
          allowedDomains: Array.isArray(x.allowedDomains) ? x.allowedDomains.map(String) : [],
          verifiedDomains: Array.isArray(x.verifiedDomains) ? x.verifiedDomains.map(String) : [],
          verificationToken: String(x.verificationToken || ''),
          enabledProducts: Array.isArray(x.enabledProducts)
            ? (x.enabledProducts as DeveloperProductId[])
            : ['forms', 'email'],
          status: x.status === 'archived' ? 'archived' : 'active',
          createdAt: tsToIso(x.createdAt),
          updatedAt: tsToIso(x.updatedAt),
        } satisfies ProjectRecord;
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'projects');
  }
}

export async function createProject(input: {
  name: string;
  description?: string;
  allowedDomains?: string[];
  enabledProducts?: DeveloperProductId[];
}): Promise<ProjectRecord> {
  const uid = requireUid();
  const name = input.name.trim().slice(0, 120);
  if (!name) throw new Error('Project name is required.');

  const id = nowNumericId();
  const projectKey = `prj_${randomToken(12)}`;
  const verificationToken = `brosdev-verify=${randomToken(20)}`;
  const allowedDomains = Array.from(
    new Set((input.allowedDomains || []).map(normalizeDomain).filter(Boolean))
  ).slice(0, 30);
  const enabledProducts: DeveloperProductId[] =
    input.enabledProducts && input.enabledProducts.length > 0
      ? input.enabledProducts
      : ['forms', 'email', 'webhooks', 'newsletter'];

  const docId = `prj_${id}`;
  try {
    await setDoc(doc(db, 'projects', docId), {
      id,
      projectKey,
      ownerUid: uid,
      name,
      description: String(input.description || '').trim().slice(0, 500),
      allowedDomains,
      verifiedDomains: [],
      verificationToken,
      enabledProducts,
      status: 'active',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `projects/${docId}`);
  }

  const now = new Date().toISOString();
  return {
    id,
    docId,
    projectKey,
    ownerUid: uid,
    name,
    description: String(input.description || '').trim().slice(0, 500),
    allowedDomains,
    verifiedDomains: [],
    verificationToken,
    enabledProducts,
    status: 'active',
    createdAt: now,
    updatedAt: now,
  };
}

export async function updateProject(
  docId: string,
  patch: {
    name?: string;
    description?: string;
    allowedDomains?: string[];
    verifiedDomains?: string[];
    enabledProducts?: DeveloperProductId[];
    status?: 'active' | 'archived';
  }
): Promise<void> {
  requireUid();
  const updateData: Record<string, unknown> = { updatedAt: serverTimestamp() };
  if (patch.name !== undefined) {
    const clean = patch.name.trim().slice(0, 120);
    if (!clean) throw new Error('Project name cannot be empty.');
    updateData.name = clean;
  }
  if (patch.description !== undefined) {
    updateData.description = patch.description.trim().slice(0, 500);
  }
  if (patch.allowedDomains !== undefined) {
    updateData.allowedDomains = Array.from(
      new Set(patch.allowedDomains.map(normalizeDomain).filter(Boolean))
    ).slice(0, 30);
  }
  if (patch.verifiedDomains !== undefined) {
    updateData.verifiedDomains = Array.from(
      new Set(patch.verifiedDomains.map(normalizeDomain).filter(Boolean))
    ).slice(0, 30);
  }
  if (patch.enabledProducts !== undefined) {
    updateData.enabledProducts = patch.enabledProducts.slice(0, 20);
  }
  if (patch.status !== undefined) {
    updateData.status = patch.status;
  }

  try {
    await updateDoc(doc(db, 'projects', docId), updateData);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `projects/${docId}`);
  }
}

export async function deleteProject(docId: string): Promise<void> {
  requireUid();
  try {
    await deleteDoc(doc(db, 'projects', docId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `projects/${docId}`);
  }
}

// ============================================================================
// 2. WEBHOOK SERVICE (HMAC-SHA256 SIGNED + DURABLE DELIVERY LOGS)
// ============================================================================

export async function listWebhooks(): Promise<WebhookRecord[]> {
  const uid = requireUid();
  try {
    const snap = await getDocs(query(collection(db, 'webhooks'), where('ownerUid', '==', uid)));
    return snap.docs
      .map((d) => {
        const x = d.data();
        return {
          id: Number(x.id || 0),
          docId: d.id,
          ownerUid: String(x.ownerUid || uid),
          projectKey: String(x.projectKey || ''),
          name: String(x.name || ''),
          url: String(x.url || ''),
          events: Array.isArray(x.events) ? (x.events as WebhookEventType[]) : ['form.submission.created'],
          signingSecret: String(x.signingSecret || ''),
          isActive: Boolean(x.isActive),
          lastDeliveryStatus:
            x.lastDeliveryStatus === 'succeeded' || x.lastDeliveryStatus === 'failed'
              ? x.lastDeliveryStatus
              : 'idle',
          lastDeliveryAt: String(x.lastDeliveryAt || ''),
          createdAt: tsToIso(x.createdAt),
          updatedAt: tsToIso(x.updatedAt),
        } satisfies WebhookRecord;
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'webhooks');
  }
}

export async function createWebhook(input: {
  name: string;
  url: string;
  events: WebhookEventType[];
  projectKey?: string;
}): Promise<WebhookRecord> {
  const uid = requireUid();
  const name = input.name.trim().slice(0, 120);
  const url = input.url.trim().slice(0, 500);
  if (!name) throw new Error('Webhook name is required.');
  if (!isValidPublicHttpsUrl(url)) {
    throw new Error('Webhook URL must be a valid public HTTPS endpoint (private/local hosts are blocked).');
  }
  const events: WebhookEventType[] =
    input.events.length > 0 ? input.events.slice(0, 15) : ['form.submission.created'];

  const id = nowNumericId();
  const docId = `whk_${id}`;
  const signingSecret = `whsec_${randomToken(32)}`;
  const projectKey = String(input.projectKey || '').trim().slice(0, 64);

  try {
    await setDoc(doc(db, 'webhooks', docId), {
      id,
      ownerUid: uid,
      projectKey,
      name,
      url,
      events,
      signingSecret,
      isActive: true,
      lastDeliveryStatus: 'idle',
      lastDeliveryAt: '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `webhooks/${docId}`);
  }

  const now = new Date().toISOString();
  return {
    id,
    docId,
    ownerUid: uid,
    projectKey,
    name,
    url,
    events,
    signingSecret,
    isActive: true,
    lastDeliveryStatus: 'idle',
    lastDeliveryAt: '',
    createdAt: now,
    updatedAt: now,
  };
}

export async function updateWebhook(
  docId: string,
  patch: {
    name?: string;
    url?: string;
    events?: WebhookEventType[];
    isActive?: boolean;
    projectKey?: string;
  }
): Promise<void> {
  requireUid();
  const updateData: Record<string, unknown> = { updatedAt: serverTimestamp() };
  if (patch.name !== undefined) {
    const clean = patch.name.trim().slice(0, 120);
    if (!clean) throw new Error('Webhook name cannot be empty.');
    updateData.name = clean;
  }
  if (patch.url !== undefined) {
    if (!isValidPublicHttpsUrl(patch.url)) {
      throw new Error('Webhook URL must be a valid public HTTPS endpoint.');
    }
    updateData.url = patch.url.trim().slice(0, 500);
  }
  if (patch.events !== undefined) {
    if (patch.events.length === 0) throw new Error('Select at least one event.');
    updateData.events = patch.events.slice(0, 15);
  }
  if (patch.isActive !== undefined) updateData.isActive = patch.isActive;
  if (patch.projectKey !== undefined) updateData.projectKey = patch.projectKey.trim().slice(0, 64);

  try {
    await updateDoc(doc(db, 'webhooks', docId), updateData);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `webhooks/${docId}`);
  }
}

export async function rotateWebhookSecret(docId: string): Promise<string> {
  requireUid();
  const signingSecret = `whsec_${randomToken(32)}`;
  try {
    await updateDoc(doc(db, 'webhooks', docId), {
      signingSecret,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `webhooks/${docId}`);
  }
  return signingSecret;
}

export async function deleteWebhook(docId: string): Promise<void> {
  requireUid();
  try {
    await deleteDoc(doc(db, 'webhooks', docId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `webhooks/${docId}`);
  }
}

export async function listWebhookDeliveries(): Promise<WebhookDeliveryRecord[]> {
  const uid = requireUid();
  try {
    const snap = await getDocs(
      query(collection(db, 'webhookDeliveries'), where('ownerUid', '==', uid))
    );
    return snap.docs
      .map((d) => {
        const x = d.data();
        return {
          id: Number(x.id || 0),
          docId: d.id,
          deliveryId: String(x.deliveryId || d.id),
          ownerUid: String(x.ownerUid || uid),
          webhookId: Number(x.webhookId || 0),
          webhookName: String(x.webhookName || ''),
          targetUrl: String(x.targetUrl || ''),
          eventType: String(x.eventType || ''),
          status: x.status === 'succeeded' ? 'succeeded' : 'failed',
          httpStatus: Number(x.httpStatus || 0),
          durationMs: Number(x.durationMs || 0),
          attemptCount: Number(x.attemptCount || 1),
          signature: String(x.signature || ''),
          responseSnippet: String(x.responseSnippet || ''),
          payloadSnippet: String(x.payloadSnippet || ''),
          createdAt: tsToIso(x.createdAt),
          updatedAt: tsToIso(x.updatedAt),
        } satisfies WebhookDeliveryRecord;
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 100);
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'webhookDeliveries');
  }
}

export async function dispatchWebhookEvent(
  webhook: WebhookRecord,
  eventType: WebhookEventType,
  payload: Record<string, unknown>,
  existingDelivery?: WebhookDeliveryRecord
): Promise<WebhookDeliveryRecord> {
  const uid = requireUid();
  const idToken = await auth.currentUser?.getIdToken();
  if (!idToken) throw new Error('Authentication session expired. Please sign in again.');

  const resp = await fetch(buildApiUrl('/api/webhooks/dispatch'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({
      url: webhook.url,
      signingSecret: webhook.signingSecret,
      eventType,
      deliveryId: existingDelivery?.deliveryId,
      payload,
    }),
  });

  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error(data?.error || `Webhook dispatch failed (${resp.status}).`);
  }

  const status: 'succeeded' | 'failed' = data.ok ? 'succeeded' : 'failed';
  const nowIso = new Date().toISOString();

  // Persist or update delivery record in Firestore
  let deliveryRecord: WebhookDeliveryRecord;
  if (existingDelivery) {
    const attemptCount = existingDelivery.attemptCount + 1;
    try {
      await updateDoc(doc(db, 'webhookDeliveries', existingDelivery.docId), {
        status,
        httpStatus: Number(data.httpStatus || 0),
        durationMs: Number(data.durationMs || 0),
        attemptCount,
        signature: String(data.signature || '').slice(0, 200),
        responseSnippet: String(data.responseSnippet || '').slice(0, 500),
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `webhookDeliveries/${existingDelivery.docId}`);
    }
    deliveryRecord = {
      ...existingDelivery,
      status,
      httpStatus: Number(data.httpStatus || 0),
      durationMs: Number(data.durationMs || 0),
      attemptCount,
      signature: String(data.signature || ''),
      responseSnippet: String(data.responseSnippet || ''),
      updatedAt: nowIso,
    };
  } else {
    const id = nowNumericId();
    const docId = `whd_${id}`;
    const deliveryId = String(data.deliveryId || docId).slice(0, 64);
    try {
      await setDoc(doc(db, 'webhookDeliveries', docId), {
        id,
        deliveryId,
        ownerUid: uid,
        webhookId: webhook.id,
        webhookName: webhook.name.slice(0, 120),
        targetUrl: webhook.url.slice(0, 500),
        eventType: eventType.slice(0, 80),
        status,
        httpStatus: Number(data.httpStatus || 0),
        durationMs: Number(data.durationMs || 0),
        attemptCount: 1,
        signature: String(data.signature || '').slice(0, 200),
        responseSnippet: String(data.responseSnippet || '').slice(0, 500),
        payloadSnippet: String(data.payloadSnippet || '').slice(0, 2000),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `webhookDeliveries/${docId}`);
    }
    deliveryRecord = {
      id,
      docId,
      deliveryId,
      ownerUid: uid,
      webhookId: webhook.id,
      webhookName: webhook.name,
      targetUrl: webhook.url,
      eventType,
      status,
      httpStatus: Number(data.httpStatus || 0),
      durationMs: Number(data.durationMs || 0),
      attemptCount: 1,
      signature: String(data.signature || ''),
      responseSnippet: String(data.responseSnippet || ''),
      payloadSnippet: String(data.payloadSnippet || ''),
      createdAt: nowIso,
      updatedAt: nowIso,
    };
  }

  // Update webhook last status
  try {
    await updateDoc(doc(db, 'webhooks', webhook.docId), {
      lastDeliveryStatus: status,
      lastDeliveryAt: nowIso,
      updatedAt: serverTimestamp(),
    });
  } catch {
    // Non-blocking status sync
  }

  return deliveryRecord;
}

// ============================================================================
// 3. API KEY MANAGEMENT (HASHED AT REST — FULL SECRET SHOWN ONCE)
// ============================================================================

export async function listApiKeys(): Promise<ApiKeyRecord[]> {
  const uid = requireUid();
  try {
    const snap = await getDocs(query(collection(db, 'apiKeys'), where('ownerUid', '==', uid)));
    return snap.docs
      .map((d) => {
        const x = d.data();
        return {
          id: Number(x.id || 0),
          docId: d.id,
          ownerUid: String(x.ownerUid || uid),
          projectKey: String(x.projectKey || ''),
          name: String(x.name || ''),
          keyPrefix: String(x.keyPrefix || ''),
          permissions: Array.isArray(x.permissions) ? x.permissions.map(String) : ['read', 'write'],
          products: Array.isArray(x.products) ? (x.products as DeveloperProductId[]) : ['forms'],
          status: x.status === 'revoked' ? 'revoked' : 'active',
          lastUsedAt: String(x.lastUsedAt || ''),
          createdAt: tsToIso(x.createdAt),
          updatedAt: tsToIso(x.updatedAt),
        } satisfies ApiKeyRecord;
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'apiKeys');
  }
}

export async function createApiKey(input: {
  name: string;
  projectKey?: string;
  permissions: string[];
  products: DeveloperProductId[];
}): Promise<{ record: ApiKeyRecord; rawSecret: string }> {
  const uid = requireUid();
  const name = input.name.trim().slice(0, 120);
  if (!name) throw new Error('API key name is required.');
  const permissions = input.permissions.length > 0 ? input.permissions.slice(0, 10) : ['read', 'write'];
  const products: DeveloperProductId[] =
    input.products.length > 0 ? input.products.slice(0, 15) : ['forms'];

  const rawSecret = `bd_live_${randomToken(32)}`;
  const keyPrefix = `${rawSecret.slice(0, 15)}...`;
  const keyHash = await sha256Hex(rawSecret);

  const id = nowNumericId();
  const docId = `key_${id}`;
  const projectKey = String(input.projectKey || '').trim().slice(0, 64);

  try {
    await setDoc(doc(db, 'apiKeys', docId), {
      id,
      ownerUid: uid,
      projectKey,
      name,
      keyPrefix,
      keyHash,
      permissions,
      products,
      status: 'active',
      lastUsedAt: '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `apiKeys/${docId}`);
  }

  const now = new Date().toISOString();
  return {
    rawSecret,
    record: {
      id,
      docId,
      ownerUid: uid,
      projectKey,
      name,
      keyPrefix,
      permissions,
      products,
      status: 'active',
      lastUsedAt: '',
      createdAt: now,
      updatedAt: now,
    },
  };
}

export async function rotateApiKey(docId: string): Promise<{ rawSecret: string; keyPrefix: string }> {
  requireUid();
  const rawSecret = `bd_live_${randomToken(32)}`;
  const keyPrefix = `${rawSecret.slice(0, 15)}...`;
  const keyHash = await sha256Hex(rawSecret);
  try {
    await updateDoc(doc(db, 'apiKeys', docId), {
      keyPrefix,
      keyHash,
      status: 'active',
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `apiKeys/${docId}`);
  }
  return { rawSecret, keyPrefix };
}

export async function revokeApiKey(docId: string): Promise<void> {
  requireUid();
  try {
    await updateDoc(doc(db, 'apiKeys', docId), {
      status: 'revoked',
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `apiKeys/${docId}`);
  }
}

export async function deleteApiKey(docId: string): Promise<void> {
  requireUid();
  try {
    await deleteDoc(doc(db, 'apiKeys', docId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `apiKeys/${docId}`);
  }
}

// ============================================================================
// 4. NEWSLETTER SUBSCRIPTION API (LISTS + PUBLIC PROJECTION + SUBSCRIBERS)
// ============================================================================

async function ensurePublicNewsletterProjection(list: {
  id: number;
  listKey: string;
  ownerUid: string;
  name: string;
  status: 'active' | 'paused';
}): Promise<void> {
  if (!list.listKey) return;
  try {
    const pubRef = doc(db, 'publicNewsletterLists', list.listKey);
    const pubSnap = await getDoc(pubRef);
    if (!pubSnap.exists()) {
      await setDoc(pubRef, {
        listKey: list.listKey,
        listId: Number(list.id || 0),
        ownerUid: list.ownerUid,
        name: list.name.slice(0, 120) || 'Newsletter',
        status: list.status === 'paused' ? 'paused' : 'active',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      const existingStatus = pubSnap.data()?.status;
      if (existingStatus !== list.status) {
        await updateDoc(pubRef, {
          name: list.name.slice(0, 120) || 'Newsletter',
          status: list.status === 'paused' ? 'paused' : 'active',
          updatedAt: serverTimestamp(),
        });
      }
    }
  } catch {
    // Non-blocking best-effort projection repair
  }
}

export async function listNewsletterLists(): Promise<NewsletterListRecord[]> {
  const uid = requireUid();
  try {
    const snap = await getDocs(
      query(collection(db, 'newsletterLists'), where('ownerUid', '==', uid))
    );
    const lists = snap.docs
      .map((d) => {
        const x = d.data();
        return {
          id: Number(x.id || 0),
          docId: d.id,
          listKey: String(x.listKey || ''),
          ownerUid: String(x.ownerUid || uid),
          projectKey: String(x.projectKey || ''),
          name: String(x.name || ''),
          description: String(x.description || ''),
          doubleOptIn: Boolean(x.doubleOptIn),
          welcomeEmailEnabled: Boolean(x.welcomeEmailEnabled),
          status: x.status === 'paused' ? 'paused' : 'active',
          createdAt: tsToIso(x.createdAt),
          updatedAt: tsToIso(x.updatedAt),
        } satisfies NewsletterListRecord;
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    // Auto-heal any older lists whose publicNewsletterLists projection was missing
    void Promise.all(lists.map((item) => ensurePublicNewsletterProjection(item)));
    return lists;
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'newsletterLists');
  }
}

export async function createNewsletterList(input: {
  name: string;
  description?: string;
  projectKey?: string;
  doubleOptIn?: boolean;
  welcomeEmailEnabled?: boolean;
}): Promise<NewsletterListRecord> {
  const uid = requireUid();
  const name = input.name.trim().slice(0, 120);
  if (!name) throw new Error('Newsletter list name is required.');

  const id = nowNumericId();
  const docId = `nwl_${id}`;
  const listKey = `nwl_${randomToken(12)}`;
  const projectKey = String(input.projectKey || '').trim().slice(0, 64);

  try {
    await setDoc(doc(db, 'newsletterLists', docId), {
      id,
      listKey,
      ownerUid: uid,
      projectKey,
      name,
      description: String(input.description || '').trim().slice(0, 500),
      doubleOptIn: Boolean(input.doubleOptIn),
      welcomeEmailEnabled: Boolean(input.welcomeEmailEnabled),
      status: 'active',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await setDoc(doc(db, 'publicNewsletterLists', listKey), {
      listKey,
      listId: id,
      ownerUid: uid,
      name,
      status: 'active',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `newsletterLists/${docId}`);
  }

  const now = new Date().toISOString();
  return {
    id,
    docId,
    listKey,
    ownerUid: uid,
    projectKey,
    name,
    description: String(input.description || '').trim().slice(0, 500),
    doubleOptIn: Boolean(input.doubleOptIn),
    welcomeEmailEnabled: Boolean(input.welcomeEmailEnabled),
    status: 'active',
    createdAt: now,
    updatedAt: now,
  };
}

export async function toggleNewsletterListStatus(list: NewsletterListRecord): Promise<'active' | 'paused'> {
  requireUid();
  const nextStatus = list.status === 'active' ? 'paused' : 'active';
  try {
    await updateDoc(doc(db, 'newsletterLists', list.docId), {
      status: nextStatus,
      updatedAt: serverTimestamp(),
    });
    const pubRef = doc(db, 'publicNewsletterLists', list.listKey);
    const pubSnap = await getDoc(pubRef);
    if (pubSnap.exists()) {
      await updateDoc(pubRef, {
        status: nextStatus,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(pubRef, {
        listKey: list.listKey,
        listId: Number(list.id || 0),
        ownerUid: list.ownerUid,
        name: list.name.slice(0, 120) || 'Newsletter',
        status: nextStatus,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `newsletterLists/${list.docId}`);
  }
  return nextStatus;
}

export async function deleteNewsletterList(list: NewsletterListRecord): Promise<void> {
  requireUid();
  try {
    await deleteDoc(doc(db, 'newsletterLists', list.docId));
    await deleteDoc(doc(db, 'publicNewsletterLists', list.listKey)).catch(() => {});
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `newsletterLists/${list.docId}`);
  }
}

export async function listNewsletterSubscribers(): Promise<NewsletterSubscriberRecord[]> {
  const uid = requireUid();
  try {
    const snap = await getDocs(
      query(collection(db, 'newsletterSubscribers'), where('ownerUid', '==', uid))
    );
    return snap.docs
      .map((d) => {
        const x = d.data();
        return {
          id: Number(x.id || 0),
          docId: d.id,
          ownerUid: String(x.ownerUid || uid),
          listId: Number(x.listId || 0),
          listKey: String(x.listKey || ''),
          email: String(x.email || ''),
          name: String(x.name || ''),
          status:
            x.status === 'unsubscribed' || x.status === 'pending' ? x.status : 'subscribed',
          source: String(x.source || 'dashboard'),
          unsubscribeToken: String(x.unsubscribeToken || ''),
          createdAt: tsToIso(x.createdAt),
          updatedAt: tsToIso(x.updatedAt),
        } satisfies NewsletterSubscriberRecord;
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'newsletterSubscribers');
  }
}

export async function addNewsletterSubscriber(
  list: NewsletterListRecord,
  emailRaw: string,
  nameRaw = ''
): Promise<NewsletterSubscriberRecord> {
  const uid = requireUid();
  const email = emailRaw.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    throw new Error('Please enter a valid subscriber email address.');
  }

  const dedupHash = (await sha256Hex(`${list.listKey}:${email}`)).slice(0, 16);
  const docId = `nsub_${list.listKey.slice(0, 16)}_${dedupHash}`;
  const existingSnap = await getDoc(doc(db, 'newsletterSubscribers', docId));
  if (existingSnap.exists()) {
    throw new Error(`${email} is already in "${list.name}".`);
  }

  const id = nowNumericId();
  const unsubscribeToken = `unsub_${randomToken(20)}`;
  const name = nameRaw.trim().slice(0, 120);

  try {
    await setDoc(doc(db, 'newsletterSubscribers', docId), {
      id,
      ownerUid: uid,
      listId: list.id,
      listKey: list.listKey,
      email,
      name,
      status: 'subscribed',
      source: 'dashboard',
      unsubscribeToken,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `newsletterSubscribers/${docId}`);
  }

  const now = new Date().toISOString();
  return {
    id,
    docId,
    ownerUid: uid,
    listId: list.id,
    listKey: list.listKey,
    email,
    name,
    status: 'subscribed',
    source: 'dashboard',
    unsubscribeToken,
    createdAt: now,
    updatedAt: now,
  };
}

export async function updateSubscriberStatus(
  docId: string,
  status: 'subscribed' | 'unsubscribed'
): Promise<void> {
  requireUid();
  try {
    await updateDoc(doc(db, 'newsletterSubscribers', docId), {
      status,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `newsletterSubscribers/${docId}`);
  }
}

export async function deleteNewsletterSubscriber(docId: string): Promise<void> {
  requireUid();
  try {
    await deleteDoc(doc(db, 'newsletterSubscribers', docId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `newsletterSubscribers/${docId}`);
  }
}

// ============================================================================
// 5. URL SHORTENER LINKS
// ============================================================================

export async function listShortLinks(): Promise<ShortLinkRecord[]> {
  const uid = requireUid();
  try {
    const snap = await getDocs(query(collection(db, 'shortLinks'), where('ownerUid', '==', uid)));
    return snap.docs
      .map((d) => {
        const x = d.data();
        return {
          id: Number(x.id || 0),
          slug: String(x.slug || d.id),
          ownerUid: String(x.ownerUid || uid),
          title: String(x.title || ''),
          targetUrl: String(x.targetUrl || ''),
          clicks: Number(x.clicks || 0),
          isActive: Boolean(x.isActive),
          expiresAt: String(x.expiresAt || ''),
          createdAt: tsToIso(x.createdAt),
          updatedAt: tsToIso(x.updatedAt),
        } satisfies ShortLinkRecord;
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'shortLinks');
  }
}

export async function createShortLink(input: {
  targetUrl: string;
  customSlug?: string;
  title?: string;
  expiresAt?: string;
}): Promise<ShortLinkRecord> {
  const uid = requireUid();
  const targetUrl = input.targetUrl.trim().slice(0, 1000);
  if (!isValidHttpUrl(targetUrl)) {
    throw new Error('Destination URL must start with http:// or https://.');
  }

  const rawSlug = (input.customSlug || '').trim();
  const slug = rawSlug ? rawSlug.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48) : randomToken(7);
  if (slug.length < 2) {
    throw new Error('Custom slug must be at least 2 alphanumeric characters.');
  }

  const existing = await getDoc(doc(db, 'shortLinks', slug));
  if (existing.exists()) {
    throw new Error(`Short slug "${slug}" is already taken. Choose another slug.`);
  }

  const id = nowNumericId();
  const title = (input.title || '').trim().slice(0, 140) || new URL(targetUrl).hostname;
  const expiresAt = (input.expiresAt || '').trim().slice(0, 64);

  try {
    await setDoc(doc(db, 'shortLinks', slug), {
      id,
      slug,
      ownerUid: uid,
      title,
      targetUrl,
      clicks: 0,
      isActive: true,
      expiresAt,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `shortLinks/${slug}`);
  }

  const now = new Date().toISOString();
  return {
    id,
    slug,
    ownerUid: uid,
    title,
    targetUrl,
    clicks: 0,
    isActive: true,
    expiresAt,
    createdAt: now,
    updatedAt: now,
  };
}

export async function toggleShortLink(link: ShortLinkRecord): Promise<boolean> {
  requireUid();
  const next = !link.isActive;
  try {
    await updateDoc(doc(db, 'shortLinks', link.slug), {
      isActive: next,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `shortLinks/${link.slug}`);
  }
  return next;
}

export async function deleteShortLink(slug: string): Promise<void> {
  requireUid();
  try {
    await deleteDoc(doc(db, 'shortLinks', slug));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `shortLinks/${slug}`);
  }
}

// ============================================================================
// 6. DEVELOPER UTILITIES HISTORY (QR CODE & PDF GENERATOR)
// ============================================================================

export async function listUtilityRecords(): Promise<UtilityRecord[]> {
  const uid = requireUid();
  try {
    const snap = await getDocs(
      query(collection(db, 'utilityRecords'), where('ownerUid', '==', uid))
    );
    return snap.docs
      .map((d) => {
        const x = d.data();
        return {
          id: Number(x.id || 0),
          docId: d.id,
          ownerUid: String(x.ownerUid || uid),
          kind: x.kind === 'pdf' ? 'pdf' : 'qr',
          title: String(x.title || ''),
          summary: String(x.summary || ''),
          config: (x.config && typeof x.config === 'object' ? x.config : {}) as Record<
            string,
            unknown
          >,
          createdAt: tsToIso(x.createdAt),
          updatedAt: tsToIso(x.updatedAt),
        } satisfies UtilityRecord;
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 50);
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'utilityRecords');
  }
}

export async function saveUtilityRecord(input: {
  kind: 'qr' | 'pdf';
  title: string;
  summary: string;
  config: Record<string, unknown>;
}): Promise<UtilityRecord> {
  const uid = requireUid();
  const id = nowNumericId();
  const docId = `utl_${id}`;
  const title = input.title.trim().slice(0, 140) || (input.kind === 'qr' ? 'QR Code' : 'PDF Document');
  const summary = input.summary.trim().slice(0, 400);

  try {
    await setDoc(doc(db, 'utilityRecords', docId), {
      id,
      ownerUid: uid,
      kind: input.kind,
      title,
      summary,
      config: input.config,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `utilityRecords/${docId}`);
  }

  const now = new Date().toISOString();
  return {
    id,
    docId,
    ownerUid: uid,
    kind: input.kind,
    title,
    summary,
    config: input.config,
    createdAt: now,
    updatedAt: now,
  };
}

export async function deleteUtilityRecord(docId: string): Promise<void> {
  requireUid();
  try {
    await deleteDoc(doc(db, 'utilityRecords', docId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `utilityRecords/${docId}`);
  }
}

// ============================================================================
// 7. SUMMARY COUNTS FOR PRODUCT HUB
// ============================================================================

export async function getDevServicesSummary(): Promise<DevServicesSummary> {
  const uid = auth.currentUser?.uid;
  const [
    projects,
    webhooks,
    deliveries,
    apiKeys,
    lists,
    subscribers,
    links,
    utilities,
    widgetsSnap,
    campaignsSnap,
  ] = await Promise.all([
    listProjects().catch(() => []),
    listWebhooks().catch(() => []),
    listWebhookDeliveries().catch(() => []),
    listApiKeys().catch(() => []),
    listNewsletterLists().catch(() => []),
    listNewsletterSubscribers().catch(() => []),
    listShortLinks().catch(() => []),
    listUtilityRecords().catch(() => []),
    uid
      ? getDocs(query(collection(db, 'widgets'), where('ownerUid', '==', uid))).catch(() => null)
      : Promise.resolve(null),
    uid
      ? getDocs(query(collection(db, 'email_campaigns'), where('ownerUid', '==', uid))).catch(
          () => null
        )
      : Promise.resolve(null),
  ]);

  const widgetDocs = widgetsSnap ? widgetsSnap.docs.map((d) => d.data()) : [];

  return {
    projectsCount: projects.length,
    webhooksCount: webhooks.length,
    webhookDeliveriesCount: deliveries.length,
    apiKeysCount: apiKeys.filter((k) => k.status === 'active').length,
    newsletterListsCount: lists.length,
    subscribersCount: subscribers.filter((s) => s.status === 'subscribed').length,
    shortLinksCount: links.length,
    shortLinkClicks: links.reduce((sum, l) => sum + l.clicks, 0),
    utilityRecordsCount: utilities.length,
    widgetsCount: widgetDocs.length,
    publishedWidgetsCount: widgetDocs.filter((w) => w.status === 'published').length,
    campaignsCount: campaignsSnap ? campaignsSnap.size : 0,
  };
}
