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
import { auth, db, handleFirestoreError, OperationType } from '../lib/firebase';
import {
  cloneDefaultConfiguration,
  getWidgetDefinition,
  hydrateWidgetConfiguration,
} from '../widgets/catalog';
import {
  isValidDomainName,
  normalizeWidgetDomain,
  validateAndScopeCustomCss,
} from '../widgets/security';
import type {
  WidgetAnalyticsOverview,
  WidgetConfiguration,
  WidgetDailyStatRecord,
  WidgetDeviceType,
  WidgetDomainRecord,
  WidgetEventType,
  WidgetRecord,
  WidgetStatus,
  WidgetType,
  WidgetVersionRecord,
} from '../widgets/types';

function requireUid(): string {
  const user = auth.currentUser;
  if (!user) throw new Error('Please sign in to continue.');
  return user.uid;
}

function nowNumericId(): number {
  return Date.now() * 1000 + Math.floor(Math.random() * 1000);
}

function randomToken(len = 14): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const arr = new Uint8Array(len);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => chars[b % chars.length]).join('');
}

function tsToIso(val: unknown): string {
  if (!val) return new Date().toISOString();
  if (typeof val === 'string') return val;
  if (typeof (val as Timestamp)?.toDate === 'function') {
    return (val as Timestamp).toDate().toISOString();
  }
  return new Date().toISOString();
}

function todayDateKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function mapWidgetDoc(docId: string, x: Record<string, any>): WidgetRecord {
  const type = (String(x.type || 'announcement_bar') as WidgetType);
  const def = getWidgetDefinition(type);
  const configuration = hydrateWidgetConfiguration(type, x.configuration);
  const publishedConfiguration = x.publishedConfiguration
    ? hydrateWidgetConfiguration(type, x.publishedConfiguration)
    : null;

  return {
    id: Number(x.id || 0),
    docId,
    publicId: String(x.publicId || docId),
    ownerUid: String(x.ownerUid || ''),
    projectKey: String(x.projectKey || ''),
    name: String(x.name || def.name),
    type,
    group: x.group === 'business' ? 'business' : def.group,
    category: (x.category || def.category) as WidgetRecord['category'],
    status: (x.status === 'published' || x.status === 'disabled' ? x.status : 'draft') as WidgetStatus,
    version: Number(x.version || 1),
    publishedVersion: Number(x.publishedVersion || 0),
    configuration,
    publishedConfiguration,
    domainRestrictionEnabled: Boolean(x.domainRestrictionEnabled),
    allowedDomains: Array.isArray(x.allowedDomains) ? x.allowedDomains.map(String) : [],
    allowSubdomains: Boolean(x.allowSubdomains),
    totalViews: Number(x.totalViews || 0),
    totalClicks: Number(x.totalClicks || 0),
    lastLoadedAt: String(x.lastLoadedAt || ''),
    abuseFlagged: Boolean(x.abuseFlagged),
    abuseReason: String(x.abuseReason || ''),
    createdAt: tsToIso(x.createdAt),
    updatedAt: tsToIso(x.updatedAt),
    publishedAt: String(x.publishedAt || ''),
  };
}

// ============================================================================
// 1. WIDGET CRUD & SAFE PUBLISHING
// ============================================================================

export async function listWidgets(): Promise<WidgetRecord[]> {
  const uid = requireUid();
  try {
    const [widgetsSnap, publicSnap] = await Promise.all([
      getDocs(query(collection(db, 'widgets'), where('ownerUid', '==', uid))),
      getDocs(query(collection(db, 'publicWidgets'), where('ownerUid', '==', uid))),
    ]);

    const pubStats = new Map<string, { totalViews: number; totalClicks: number; lastLoadedAt: string }>();
    for (const d of publicSnap.docs) {
      const p = d.data();
      pubStats.set(String(p.publicId || d.id), {
        totalViews: Number(p.totalViews || 0),
        totalClicks: Number(p.totalClicks || 0),
        lastLoadedAt: String(p.lastLoadedAt || ''),
      });
    }

    return widgetsSnap.docs
      .map((d) => {
        const w = mapWidgetDoc(d.id, d.data());
        const stats = pubStats.get(w.publicId);
        if (stats) {
          w.totalViews = stats.totalViews;
          w.totalClicks = stats.totalClicks;
          w.lastLoadedAt = stats.lastLoadedAt;
        }
        return w;
      })
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'widgets');
  }
}

export async function getWidget(docId: string): Promise<WidgetRecord | null> {
  requireUid();
  try {
    const snap = await getDoc(doc(db, 'widgets', docId));
    if (!snap.exists()) return null;
    const w = mapWidgetDoc(snap.id, snap.data());
    try {
      const pub = await getDoc(doc(db, 'publicWidgets', w.publicId));
      if (pub.exists()) {
        const p = pub.data();
        w.totalViews = Number(p.totalViews || 0);
        w.totalClicks = Number(p.totalClicks || 0);
        w.lastLoadedAt = String(p.lastLoadedAt || '');
      }
    } catch {
      // Optional public metrics read
    }
    return w;
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, `widgets/${docId}`);
  }
}

export async function getPublicWidgetForPage(publicId: string): Promise<{
  status: 'ok' | 'not_found' | 'disabled' | 'draft';
  widget?: {
    publicId: string;
    widgetId: number;
    ownerUid: string;
    name: string;
    type: WidgetType;
    publishedVersion: number;
    configuration: WidgetConfiguration;
    domainRestrictionEnabled: boolean;
    allowedDomains: string[];
    allowSubdomains: boolean;
  };
}> {
  const cleanId = String(publicId || '').trim();
  if (!/^[a-zA-Z0-9_-]{4,64}$/.test(cleanId)) return { status: 'not_found' };
  try {
    const snap = await getDoc(doc(db, 'publicWidgets', cleanId));
    if (!snap.exists()) return { status: 'not_found' };
    const x = snap.data();
    const status = String(x.status || 'draft');
    if (status === 'disabled') return { status: 'disabled' };
    const type = String(x.type || 'announcement_bar') as WidgetType;
    return {
      status: status === 'published' ? 'ok' : 'draft',
      widget: {
        publicId: String(x.publicId || cleanId),
        widgetId: Number(x.widgetId || 0),
        ownerUid: String(x.ownerUid || ''),
        name: String(x.name || ''),
        type,
        publishedVersion: Number(x.publishedVersion || 1),
        configuration: hydrateWidgetConfiguration(type, x.configuration),
        domainRestrictionEnabled: Boolean(x.domainRestrictionEnabled),
        allowedDomains: Array.isArray(x.allowedDomains) ? x.allowedDomains.map(String) : [],
        allowSubdomains: Boolean(x.allowSubdomains),
      },
    };
  } catch {
    return { status: 'not_found' };
  }
}

export async function createWidget(input: {
  type: WidgetType;
  name?: string;
  projectKey?: string;
  configuration?: WidgetConfiguration;
  allowRemoveBranding?: boolean;
}): Promise<WidgetRecord> {
  const uid = requireUid();
  const def = getWidgetDefinition(input.type);
  const id = nowNumericId();
  const docId = `wdg_${id}`;
  const publicId = `w_${randomToken(12)}`;
  const name = (input.name?.trim() || def.name).slice(0, 140);
  const baseConfig = input.configuration
    ? hydrateWidgetConfiguration(input.type, input.configuration)
    : cloneDefaultConfiguration(input.type);

  if (!input.allowRemoveBranding) {
    baseConfig.showBranding = true;
  }

  try {
    await setDoc(doc(db, 'widgets', docId), {
      id,
      publicId,
      ownerUid: uid,
      projectKey: String(input.projectKey || '').slice(0, 64),
      name,
      type: input.type,
      group: def.group,
      category: def.category,
      status: 'draft',
      version: 1,
      publishedVersion: 0,
      configuration: baseConfig,
      publishedConfiguration: null,
      domainRestrictionEnabled: false,
      allowedDomains: [],
      allowSubdomains: true,
      abuseFlagged: false,
      abuseReason: '',
      publishedAt: '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `widgets/${docId}`);
  }

  const now = new Date().toISOString();
  return {
    id,
    docId,
    publicId,
    ownerUid: uid,
    projectKey: String(input.projectKey || '').slice(0, 64),
    name,
    type: input.type,
    group: def.group,
    category: def.category,
    status: 'draft',
    version: 1,
    publishedVersion: 0,
    configuration: baseConfig,
    publishedConfiguration: null,
    domainRestrictionEnabled: false,
    allowedDomains: [],
    allowSubdomains: true,
    totalViews: 0,
    totalClicks: 0,
    lastLoadedAt: '',
    abuseFlagged: false,
    abuseReason: '',
    createdAt: now,
    updatedAt: now,
    publishedAt: '',
  };
}

export async function saveWidgetDraft(
  widget: WidgetRecord,
  patch: {
    name?: string;
    type?: WidgetType;
    projectKey?: string;
    configuration: WidgetConfiguration;
    allowCustomCss?: boolean;
    allowRemoveBranding?: boolean;
  }
): Promise<WidgetRecord> {
  requireUid();
  const nextType = patch.type || widget.type;
  const def = getWidgetDefinition(nextType);
  const cleanConfig = hydrateWidgetConfiguration(nextType, patch.configuration);

  if (!patch.allowCustomCss) {
    cleanConfig.customCss = '';
  } else if (cleanConfig.customCss.trim()) {
    const cssCheck = validateAndScopeCustomCss(cleanConfig.customCss);
    if (!cssCheck.valid) {
      throw new Error(cssCheck.errors[0] || 'Custom CSS contains disallowed rules.');
    }
  }

  if (!patch.allowRemoveBranding) {
    cleanConfig.showBranding = true;
  }

  const nextName = (patch.name !== undefined ? patch.name : widget.name).trim().slice(0, 140);
  if (!nextName) throw new Error('Widget name cannot be empty.');
  const nextVersion = widget.version + 1;

  try {
    await updateDoc(doc(db, 'widgets', widget.docId), {
      name: nextName,
      type: nextType,
      group: def.group,
      category: def.category,
      projectKey: patch.projectKey !== undefined ? patch.projectKey.slice(0, 64) : widget.projectKey,
      version: nextVersion,
      configuration: cleanConfig,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `widgets/${widget.docId}`);
  }

  return {
    ...widget,
    name: nextName,
    type: nextType,
    group: def.group,
    category: def.category,
    projectKey: patch.projectKey !== undefined ? patch.projectKey.slice(0, 64) : widget.projectKey,
    version: nextVersion,
    configuration: cleanConfig,
    updatedAt: new Date().toISOString(),
  };
}

export async function renameWidget(docId: string, name: string): Promise<void> {
  requireUid();
  const clean = name.trim().slice(0, 140);
  if (!clean) throw new Error('Widget name is required.');
  try {
    await updateDoc(doc(db, 'widgets', docId), {
      name: clean,
      updatedAt: serverTimestamp(),
    });
    const snap = await getDoc(doc(db, 'widgets', docId));
    if (snap.exists()) {
      const w = snap.data();
      const pubRef = doc(db, 'publicWidgets', String(w.publicId));
      const pubSnap = await getDoc(pubRef);
      if (pubSnap.exists()) {
        await updateDoc(pubRef, { name: clean, updatedAt: serverTimestamp() });
      }
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `widgets/${docId}`);
  }
}

export async function publishWidget(
  widget: WidgetRecord,
  options: {
    configuration: WidgetConfiguration;
    name?: string;
    label?: string;
    maxPublishedWidgets: number;
    allowCustomCss: boolean;
    allowRemoveBranding: boolean;
  }
): Promise<WidgetRecord> {
  const uid = requireUid();

  // Enforce published widget quota if transitioning from draft -> published
  if (widget.status !== 'published') {
    const allWidgets = await listWidgets();
    const publishedCount = allWidgets.filter((w) => w.status === 'published').length;
    if (publishedCount >= options.maxPublishedWidgets) {
      throw new Error(
        `Your plan allows up to ${options.maxPublishedWidgets} published widgets. Upgrade your plan or unpublish an existing widget.`
      );
    }
  }

  const cleanConfig = hydrateWidgetConfiguration(widget.type, options.configuration);
  if (!options.allowCustomCss) {
    cleanConfig.customCss = '';
  } else if (cleanConfig.customCss.trim()) {
    const cssCheck = validateAndScopeCustomCss(cleanConfig.customCss);
    if (!cssCheck.valid) {
      throw new Error(cssCheck.errors[0] || 'Fix Custom CSS errors before publishing.');
    }
  }
  if (!options.allowRemoveBranding) {
    cleanConfig.showBranding = true;
  }

  const nextName = (options.name?.trim() || widget.name).slice(0, 140);
  const nextPublishedVersion = widget.publishedVersion + 1;
  const nextVersion = Math.max(widget.version + 1, nextPublishedVersion);
  const publishedAtIso = new Date().toISOString();
  const def = getWidgetDefinition(widget.type);

  try {
    // 1. Update private widget document
    await updateDoc(doc(db, 'widgets', widget.docId), {
      name: nextName,
      status: 'published',
      version: nextVersion,
      publishedVersion: nextPublishedVersion,
      configuration: cleanConfig,
      publishedConfiguration: cleanConfig,
      publishedAt: publishedAtIso,
      updatedAt: serverTimestamp(),
    });

    // 2. Sync non-PII public projection
    const pubRef = doc(db, 'publicWidgets', widget.publicId);
    const pubSnap = await getDoc(pubRef);
    if (pubSnap.exists()) {
      await updateDoc(pubRef, {
        name: nextName,
        type: widget.type,
        group: def.group,
        category: def.category,
        status: 'published',
        publishedVersion: nextPublishedVersion,
        configuration: cleanConfig,
        domainRestrictionEnabled: widget.domainRestrictionEnabled,
        allowedDomains: widget.allowedDomains,
        allowSubdomains: widget.allowSubdomains,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(pubRef, {
        publicId: widget.publicId,
        widgetId: widget.id,
        widgetDocId: widget.docId,
        ownerUid: uid,
        name: nextName,
        type: widget.type,
        group: def.group,
        category: def.category,
        status: 'published',
        publishedVersion: nextPublishedVersion,
        configuration: cleanConfig,
        domainRestrictionEnabled: widget.domainRestrictionEnabled,
        allowedDomains: widget.allowedDomains,
        allowSubdomains: widget.allowSubdomains,
        totalViews: 0,
        totalClicks: 0,
        lastLoadedAt: '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    // 3. Create immutable version snapshot
    const verId = nowNumericId();
    const verDocId = `wver_${verId}`;
    await setDoc(doc(db, 'widgetVersions', verDocId), {
      id: verId,
      widgetId: widget.id,
      widgetDocId: widget.docId,
      publicId: widget.publicId,
      ownerUid: uid,
      version: nextPublishedVersion,
      label: (options.label?.trim() || `Published v${nextPublishedVersion}`).slice(0, 160),
      action: 'publish',
      configuration: cleanConfig,
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `widgets/${widget.docId}`);
  }

  return {
    ...widget,
    name: nextName,
    status: 'published',
    version: nextVersion,
    publishedVersion: nextPublishedVersion,
    configuration: cleanConfig,
    publishedConfiguration: cleanConfig,
    publishedAt: publishedAtIso,
    updatedAt: publishedAtIso,
  };
}

export async function unpublishWidget(widget: WidgetRecord): Promise<void> {
  requireUid();
  try {
    await updateDoc(doc(db, 'widgets', widget.docId), {
      status: 'draft',
      updatedAt: serverTimestamp(),
    });
    const pubRef = doc(db, 'publicWidgets', widget.publicId);
    const pubSnap = await getDoc(pubRef);
    if (pubSnap.exists()) {
      await updateDoc(pubRef, {
        status: 'draft',
        updatedAt: serverTimestamp(),
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `widgets/${widget.docId}`);
  }
}

export async function duplicateWidget(
  source: WidgetRecord,
  allowRemoveBranding = false
): Promise<WidgetRecord> {
  return createWidget({
    type: source.type,
    name: `${source.name} (Copy)`.slice(0, 140),
    projectKey: source.projectKey,
    configuration: JSON.parse(JSON.stringify(source.configuration)),
    allowRemoveBranding,
  });
}

export async function deleteWidget(widget: WidgetRecord): Promise<void> {
  requireUid();
  try {
    await deleteDoc(doc(db, 'widgets', widget.docId));
    try {
      await deleteDoc(doc(db, 'publicWidgets', widget.publicId));
    } catch {
      // Public projection may not exist for unpublished drafts
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `widgets/${widget.docId}`);
  }
}

// ============================================================================
// 2. COMPONENT VERSIONING
// ============================================================================

export async function listWidgetVersions(widgetId?: number): Promise<WidgetVersionRecord[]> {
  const uid = requireUid();
  try {
    const snap = await getDocs(query(collection(db, 'widgetVersions'), where('ownerUid', '==', uid)));
    return snap.docs
      .map((d) => {
        const x = d.data();
        return {
          id: Number(x.id || 0),
          docId: d.id,
          widgetId: Number(x.widgetId || 0),
          widgetDocId: String(x.widgetDocId || ''),
          publicId: String(x.publicId || ''),
          ownerUid: String(x.ownerUid || uid),
          version: Number(x.version || 1),
          label: String(x.label || `v${x.version || 1}`),
          action: (x.action || 'publish') as WidgetVersionRecord['action'],
          configuration: x.configuration as WidgetConfiguration,
          createdAt: tsToIso(x.createdAt),
        } satisfies WidgetVersionRecord;
      })
      .filter((v) => (widgetId ? v.widgetId === widgetId : true))
      .sort((a, b) => b.version - a.version || b.createdAt.localeCompare(a.createdAt));
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'widgetVersions');
  }
}

export async function restoreWidgetVersion(
  widget: WidgetRecord,
  versionRecord: WidgetVersionRecord
): Promise<WidgetRecord> {
  const uid = requireUid();
  const restoredConfig = hydrateWidgetConfiguration(widget.type, versionRecord.configuration);
  const nextVersion = widget.version + 1;

  try {
    await updateDoc(doc(db, 'widgets', widget.docId), {
      version: nextVersion,
      configuration: restoredConfig,
      updatedAt: serverTimestamp(),
    });

    const verId = nowNumericId();
    await setDoc(doc(db, 'widgetVersions', `wver_${verId}`), {
      id: verId,
      widgetId: widget.id,
      widgetDocId: widget.docId,
      publicId: widget.publicId,
      ownerUid: uid,
      version: nextVersion,
      label: `Restored draft from v${versionRecord.version}`,
      action: 'restore',
      configuration: restoredConfig,
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `widgets/${widget.docId}`);
  }

  return {
    ...widget,
    version: nextVersion,
    configuration: restoredConfig,
    updatedAt: new Date().toISOString(),
  };
}

// ============================================================================
// 3. DOMAIN MANAGEMENT & ACCESS CONTROL
// ============================================================================

export async function listWidgetDomains(publicId?: string): Promise<WidgetDomainRecord[]> {
  const uid = requireUid();
  try {
    const snap = await getDocs(query(collection(db, 'widgetDomains'), where('ownerUid', '==', uid)));
    return snap.docs
      .map((d) => {
        const x = d.data();
        return {
          id: Number(x.id || 0),
          docId: d.id,
          ownerUid: String(x.ownerUid || uid),
          widgetId: Number(x.widgetId || 0),
          publicId: String(x.publicId || ''),
          domain: String(x.domain || ''),
          allowSubdomains: Boolean(x.allowSubdomains),
          verified: Boolean(x.verified),
          verificationToken: String(x.verificationToken || ''),
          lastLoadedAt: String(x.lastLoadedAt || ''),
          status: (x.status || 'pending') as WidgetDomainRecord['status'],
          createdAt: tsToIso(x.createdAt),
          updatedAt: tsToIso(x.updatedAt),
        } satisfies WidgetDomainRecord;
      })
      .filter((d) => (publicId ? d.publicId === publicId : true))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'widgetDomains');
  }
}

async function syncWidgetDomainsToDocs(
  widget: WidgetRecord,
  allowedDomains: string[],
  domainRestrictionEnabled: boolean,
  allowSubdomains: boolean
): Promise<void> {
  const cleanList = Array.from(new Set(allowedDomains.map(normalizeWidgetDomain).filter(Boolean))).slice(0, 50);
  await updateDoc(doc(db, 'widgets', widget.docId), {
    allowedDomains: cleanList,
    domainRestrictionEnabled,
    allowSubdomains,
    updatedAt: serverTimestamp(),
  });
  const pubRef = doc(db, 'publicWidgets', widget.publicId);
  const pubSnap = await getDoc(pubRef);
  if (pubSnap.exists()) {
    await updateDoc(pubRef, {
      allowedDomains: cleanList,
      domainRestrictionEnabled,
      allowSubdomains,
      updatedAt: serverTimestamp(),
    });
  }
}

export async function addWidgetDomain(input: {
  widget: WidgetRecord;
  domain: string;
  allowSubdomains: boolean;
}): Promise<WidgetDomainRecord> {
  const uid = requireUid();
  const cleanDomain = normalizeWidgetDomain(input.domain);
  if (!isValidDomainName(cleanDomain)) {
    throw new Error('Please enter a valid domain name (for example: example.com or app.client.io).');
  }

  const id = nowNumericId();
  const docId = `wdom_${id}`;
  const verificationToken = `brosdev-widget-verify=${randomToken(18)}`;

  try {
    await setDoc(doc(db, 'widgetDomains', docId), {
      id,
      ownerUid: uid,
      widgetId: input.widget.id,
      publicId: input.widget.publicId,
      domain: cleanDomain,
      allowSubdomains: input.allowSubdomains,
      verified: false,
      verificationToken,
      lastLoadedAt: '',
      status: 'pending',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    const nextAllowed = Array.from(new Set([...input.widget.allowedDomains, cleanDomain]));
    await syncWidgetDomainsToDocs(
      input.widget,
      nextAllowed,
      input.widget.domainRestrictionEnabled,
      input.allowSubdomains || input.widget.allowSubdomains
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `widgetDomains/${docId}`);
  }

  const now = new Date().toISOString();
  return {
    id,
    docId,
    ownerUid: uid,
    widgetId: input.widget.id,
    publicId: input.widget.publicId,
    domain: cleanDomain,
    allowSubdomains: input.allowSubdomains,
    verified: false,
    verificationToken,
    lastLoadedAt: '',
    status: 'pending',
    createdAt: now,
    updatedAt: now,
  };
}

export async function verifyWidgetDomain(domainRecord: WidgetDomainRecord): Promise<void> {
  requireUid();
  try {
    await updateDoc(doc(db, 'widgetDomains', domainRecord.docId), {
      verified: true,
      status: 'active',
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `widgetDomains/${domainRecord.docId}`);
  }
}

export async function removeWidgetDomain(
  widget: WidgetRecord,
  domainRecord: WidgetDomainRecord
): Promise<void> {
  requireUid();
  try {
    await deleteDoc(doc(db, 'widgetDomains', domainRecord.docId));
    const remaining = widget.allowedDomains.filter((d) => normalizeWidgetDomain(d) !== domainRecord.domain);
    await syncWidgetDomainsToDocs(
      widget,
      remaining,
      widget.domainRestrictionEnabled,
      widget.allowSubdomains
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `widgetDomains/${domainRecord.docId}`);
  }
}

export async function updateWidgetDomainAccessSettings(
  widget: WidgetRecord,
  settings: {
    domainRestrictionEnabled: boolean;
    allowSubdomains: boolean;
  }
): Promise<void> {
  requireUid();
  try {
    await syncWidgetDomainsToDocs(
      widget,
      widget.allowedDomains,
      settings.domainRestrictionEnabled,
      settings.allowSubdomains
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `widgets/${widget.docId}`);
  }
}

// ============================================================================
// 4. PRIVACY-CONSCIOUS ANALYTICS (AGGREGATED DAILY STATS)
// ============================================================================

export async function recordWidgetEventClient(input: {
  publicId: string;
  eventType: WidgetEventType;
  device?: WidgetDeviceType;
}): Promise<void> {
  try {
    await fetch('/api/widgets/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        publicId: input.publicId,
        eventType: input.eventType,
        device: input.device || 'desktop',
        visitorHash: getPrivacySafeDailyVisitorHash(),
      }),
      keepalive: true,
    });
  } catch {
    // Non-blocking analytics beacon
  }
}

function getPrivacySafeDailyVisitorHash(): string {
  try {
    const key = `bd_anon_day_${todayDateKey()}`;
    let token = sessionStorage.getItem(key);
    if (!token) {
      token = `v_${randomToken(12)}`;
      sessionStorage.setItem(key, token);
    }
    return token;
  } catch {
    return `v_${randomToken(10)}`;
  }
}

export async function getWidgetAnalytics(
  days = 14,
  filterPublicId = 'all'
): Promise<WidgetAnalyticsOverview> {
  const uid = requireUid();
  const [widgets, statsSnap] = await Promise.all([
    listWidgets(),
    getDocs(query(collection(db, 'widgetDailyStats'), where('ownerUid', '==', uid))),
  ]);

  const cutoffDate = new Date(Date.now() - Math.max(1, days - 1) * 86400000).toISOString().slice(0, 10);

  const rawStats: WidgetDailyStatRecord[] = statsSnap.docs
    .map((d) => {
      const x = d.data();
      return {
        docId: d.id,
        publicId: String(x.publicId || ''),
        widgetId: Number(x.widgetId || 0),
        ownerUid: String(x.ownerUid || uid),
        dateKey: String(x.dateKey || ''),
        impressions: Number(x.impressions || 0),
        loads: Number(x.loads || 0),
        uniqueVisitors: Number(x.uniqueVisitors || 0),
        clicks: Number(x.clicks || 0),
        ctaClicks: Number(x.ctaClicks || 0),
        popupOpens: Number(x.popupOpens || 0),
        popupCloses: Number(x.popupCloses || 0),
        consentAccepts: Number(x.consentAccepts || 0),
        consentRejects: Number(x.consentRejects || 0),
        errors: Number(x.errors || 0),
        desktopCount: Number(x.desktopCount || 0),
        tabletCount: Number(x.tabletCount || 0),
        mobileCount: Number(x.mobileCount || 0),
        updatedAt: tsToIso(x.updatedAt),
      };
    })
    .filter((s) => s.dateKey >= cutoffDate && (filterPublicId === 'all' || s.publicId === filterPublicId));

  let totalViews = 0;
  let totalLoads = 0;
  let uniqueVisitors = 0;
  let totalClicks = 0;
  let ctaConversions = 0;
  let popupOpens = 0;
  let popupCloses = 0;
  let consentAccepts = 0;
  let consentRejects = 0;
  let errors = 0;
  let desktop = 0;
  let tablet = 0;
  let mobile = 0;

  const dayMap = new Map<string, { views: number; uniqueVisitors: number; clicks: number; conversions: number }>();
  for (let i = days - 1; i >= 0; i -= 1) {
    const dk = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    dayMap.set(dk, { views: 0, uniqueVisitors: 0, clicks: 0, conversions: 0 });
  }

  const perWidget = new Map<string, { views: number; clicks: number; conversions: number }>();

  for (const s of rawStats) {
    const viewsForDay = Math.max(s.impressions, s.loads);
    totalViews += viewsForDay;
    totalLoads += s.loads;
    uniqueVisitors += s.uniqueVisitors;
    totalClicks += s.clicks + s.ctaClicks;
    ctaConversions += s.ctaClicks;
    popupOpens += s.popupOpens;
    popupCloses += s.popupCloses;
    consentAccepts += s.consentAccepts;
    consentRejects += s.consentRejects;
    errors += s.errors;
    desktop += s.desktopCount;
    tablet += s.tabletCount;
    mobile += s.mobileCount;

    const bucket = dayMap.get(s.dateKey);
    if (bucket) {
      bucket.views += viewsForDay;
      bucket.uniqueVisitors += s.uniqueVisitors;
      bucket.clicks += s.clicks + s.ctaClicks;
      bucket.conversions += s.ctaClicks;
    }

    const agg = perWidget.get(s.publicId) || { views: 0, clicks: 0, conversions: 0 };
    agg.views += viewsForDay;
    agg.clicks += s.clicks + s.ctaClicks;
    agg.conversions += s.ctaClicks;
    perWidget.set(s.publicId, agg);
  }

  const engagementRate = totalViews > 0 ? Number(((totalClicks / totalViews) * 100).toFixed(1)) : 0;
  const conversionRate = totalViews > 0 ? Number(((ctaConversions / totalViews) * 100).toFixed(1)) : 0;

  const topWidgets = widgets
    .filter((w) => filterPublicId === 'all' || w.publicId === filterPublicId)
    .map((w) => {
      const m = perWidget.get(w.publicId) || { views: w.totalViews, clicks: w.totalClicks, conversions: 0 };
      const views = Math.max(m.views, 0);
      return {
        publicId: w.publicId,
        widgetId: w.id,
        name: w.name,
        type: w.type,
        status: w.status,
        views,
        clicks: m.clicks,
        conversions: m.conversions,
        engagementRate: views > 0 ? Number(((m.clicks / views) * 100).toFixed(1)) : 0,
      };
    })
    .sort((a, b) => b.views - a.views || b.clicks - a.clicks);

  return {
    totalViews,
    totalLoads,
    uniqueVisitors,
    totalClicks,
    ctaConversions,
    engagementRate,
    conversionRate,
    popupOpens,
    popupCloses,
    consentAccepts,
    consentRejects,
    errors,
    devices: { desktop, tablet, mobile },
    dailySeries: Array.from(dayMap.entries()).map(([date, v]) => ({
      date,
      ...v,
    })),
    topWidgets,
  };
}

// ============================================================================
// 5. ADMIN PANEL OPERATIONS (ALL WIDGETS, DISABLE/ENABLE, ABUSE REVIEW, AUDIT)
// ============================================================================

export async function adminListAllWidgets(): Promise<WidgetRecord[]> {
  requireUid();
  try {
    const [wSnap, pSnap] = await Promise.all([
      getDocs(collection(db, 'widgets')),
      getDocs(collection(db, 'publicWidgets')),
    ]);
    const pubStats = new Map<string, { totalViews: number; totalClicks: number; lastLoadedAt: string }>();
    for (const d of pSnap.docs) {
      const p = d.data();
      pubStats.set(String(p.publicId || d.id), {
        totalViews: Number(p.totalViews || 0),
        totalClicks: Number(p.totalClicks || 0),
        lastLoadedAt: String(p.lastLoadedAt || ''),
      });
    }
    return wSnap.docs
      .map((d) => {
        const w = mapWidgetDoc(d.id, d.data());
        const stats = pubStats.get(w.publicId);
        if (stats) {
          w.totalViews = stats.totalViews;
          w.totalClicks = stats.totalClicks;
          w.lastLoadedAt = stats.lastLoadedAt;
        }
        return w;
      })
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'widgets');
  }
}

export async function adminSetWidgetStatus(
  widget: WidgetRecord,
  nextStatus: WidgetStatus,
  abuseReason = ''
): Promise<void> {
  const uid = requireUid();
  const actorEmail = auth.currentUser?.email || 'admin';
  try {
    await updateDoc(doc(db, 'widgets', widget.docId), {
      status: nextStatus,
      abuseFlagged: nextStatus === 'disabled' && Boolean(abuseReason.trim()),
      abuseReason: nextStatus === 'disabled' ? abuseReason.trim().slice(0, 500) : '',
      updatedAt: serverTimestamp(),
    });

    const pubRef = doc(db, 'publicWidgets', widget.publicId);
    const pubSnap = await getDoc(pubRef);
    if (pubSnap.exists()) {
      await updateDoc(pubRef, {
        status: nextStatus,
        updatedAt: serverTimestamp(),
      });
    }

    // Write immutable audit log
    const auditId = nowNumericId();
    await setDoc(doc(db, 'auditLogs', `aud_${auditId}`), {
      id: auditId,
      actorUid: uid,
      actorEmail,
      action: `widget.status.${nextStatus}`,
      targetType: 'widget',
      targetId: widget.publicId,
      details: abuseReason.trim()
        ? `Set widget "${widget.name}" to ${nextStatus}: ${abuseReason.trim()}`
        : `Set widget "${widget.name}" (${widget.publicId}) status to ${nextStatus}`,
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `widgets/${widget.docId}`);
  }
}

export async function adminDeleteWidget(widget: WidgetRecord): Promise<void> {
  const uid = requireUid();
  const actorEmail = auth.currentUser?.email || 'admin';
  try {
    await deleteDoc(doc(db, 'widgets', widget.docId));
    try {
      await deleteDoc(doc(db, 'publicWidgets', widget.publicId));
    } catch {
      // ignore if draft never published
    }
    const auditId = nowNumericId();
    await setDoc(doc(db, 'auditLogs', `aud_${auditId}`), {
      id: auditId,
      actorUid: uid,
      actorEmail,
      action: 'widget.deleted',
      targetType: 'widget',
      targetId: widget.publicId,
      details: `Deleted widget "${widget.name}" (${widget.publicId}) owned by ${widget.ownerUid}`,
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `widgets/${widget.docId}`);
  }
}
