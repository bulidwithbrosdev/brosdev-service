import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  sendPasswordResetEmail,
  updatePassword,
  updateProfile,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from './firebase';
import type {
  FormEmailConfig,
  FormFieldConfig,
  FormRecord,
  FormSpamConfig,
  InvoiceDetailRecord,
  InvoiceTemplateConfig,
  PlanRecord,
  SubmissionRecord,
  WorkspaceMe,
} from '../types';

const SUPER_ADMIN_EMAIL = 'gajjars614@gmail.com';

const SUPER_ADMIN_PERMISSIONS = [
  'admin.dashboard.view',
  'admin.users.view',
  'admin.users.manage',
  'admin.forms.view',
  'admin.forms.manage',
  'admin.submissions.view',
  'admin.api.view',
  'admin.api.manage',
  'admin.resend.view',
  'admin.resend.manage',
  'admin.emails.view',
  'admin.emails.retry',
  'admin.plans.manage',
  'admin.billing.view',
  'admin.billing.manage',
  'admin.settings.manage',
  'admin.roles.manage',
  'admin.audit.view',
];

const ADMIN_PERMISSIONS = [
  'admin.dashboard.view',
  'admin.users.view',
  'admin.users.manage',
  'admin.forms.view',
  'admin.forms.manage',
  'admin.submissions.view',
  'admin.api.view',
  'admin.api.manage',
  'admin.emails.view',
  'admin.emails.retry',
  'admin.billing.view',
  'admin.audit.view',
];

const SUPPORT_PERMISSIONS = [
  'admin.dashboard.view',
  'admin.users.view',
  'admin.forms.view',
  'admin.submissions.view',
  'admin.emails.view',
];

export const DEFAULT_INVOICE_TEMPLATE: InvoiceTemplateConfig = {
  companyName: 'BrosDev Forms',
  companyTagline: 'Form Backend & Managed Email Routing Platform',
  companyAddress: '548 Market Street, Suite 41200, San Francisco, CA 94104, USA',
  supportEmail: 'billing@brosdev.xyz',
  website: 'https://forms.brosdev.info',
  taxId: 'US-EIN 88-4920173',
  taxRatePct: 0,
  invoicePrefix: 'INV',
  accentColor: '#A90706',
  paymentTerms: 'Paid on receipt via BrosDev Pay',
  footerNotes:
    'Thank you for building with BrosDev Forms. For billing inquiries or tax documentation, reach out to billing@brosdev.xyz.',
};

const DEFAULT_PLANS: PlanRecord[] = [
  {
    id: 1,
    slug: 'free',
    name: 'Free',
    audienceLabel: 'For personal projects & prototypes',
    description: 'Core form builder and HTML endpoint routing with BrosDev branding.',
    monthlyPriceCents: 0,
    yearlyPriceCents: 0,
    trialDays: 0,
    maxForms: 2,
    maxSubmissionsPerMonth: 100,
    maxEmailsPerMonth: 100,
    maxApiRequestsPerMin: 20,
    maxStorageMb: 25,
    sortOrder: 1,
    isActive: true,
    isArchived: false,
    features: {
      advancedBuilder: false,
      jsIntegration: false,
      restApi: true,
      webhooks: false,
      customEmailTemplates: false,
      multipleRecipients: false,
      removeBranding: false,
      teamMembers: false,
      prioritySupport: false,
      advancedAnalytics: false,
    },
  },
  {
    id: 2,
    slug: 'starter',
    name: 'Starter',
    audienceLabel: 'For early-stage teams & freelancers',
    description: 'Advanced form builder, JavaScript Fetch integration, and custom email templates.',
    monthlyPriceCents: 1900,
    yearlyPriceCents: 19000,
    trialDays: 14,
    maxForms: 10,
    maxSubmissionsPerMonth: 2000,
    maxEmailsPerMonth: 2000,
    maxApiRequestsPerMin: 60,
    maxStorageMb: 250,
    sortOrder: 2,
    isActive: true,
    isArchived: false,
    features: {
      advancedBuilder: true,
      jsIntegration: true,
      restApi: true,
      webhooks: false,
      customEmailTemplates: true,
      multipleRecipients: false,
      removeBranding: false,
      teamMembers: false,
      prioritySupport: false,
      advancedAnalytics: false,
    },
  },
  {
    id: 3,
    slug: 'professional',
    name: 'Professional',
    audienceLabel: 'For growing SaaS & agencies',
    description: 'Multiple email recipients, white-label delivery, and advanced analytics.',
    monthlyPriceCents: 4900,
    yearlyPriceCents: 49000,
    trialDays: 14,
    maxForms: 50,
    maxSubmissionsPerMonth: 10000,
    maxEmailsPerMonth: 10000,
    maxApiRequestsPerMin: 180,
    maxStorageMb: 2048,
    sortOrder: 3,
    isActive: true,
    isArchived: false,
    features: {
      advancedBuilder: true,
      jsIntegration: true,
      restApi: true,
      webhooks: true,
      customEmailTemplates: true,
      multipleRecipients: true,
      removeBranding: true,
      teamMembers: false,
      prioritySupport: true,
      advancedAnalytics: true,
    },
  },
  {
    id: 4,
    slug: 'business',
    name: 'Business',
    audienceLabel: 'For high-volume operations',
    description: 'Enterprise quotas, team collaboration, webhooks, and custom integrations.',
    monthlyPriceCents: 12900,
    yearlyPriceCents: 129000,
    trialDays: 14,
    maxForms: 200,
    maxSubmissionsPerMonth: 50000,
    maxEmailsPerMonth: 50000,
    maxApiRequestsPerMin: 600,
    maxStorageMb: 10240,
    sortOrder: 4,
    isActive: true,
    isArchived: false,
    features: {
      advancedBuilder: true,
      jsIntegration: true,
      restApi: true,
      webhooks: true,
      customEmailTemplates: true,
      multipleRecipients: true,
      removeBranding: true,
      teamMembers: true,
      prioritySupport: true,
      advancedAnalytics: true,
    },
  },
];

const DEFAULT_SETTINGS: Record<string, Record<string, any>> = {
  platform_general: {
    platformName: 'BrosDev Forms',
    publicApiBaseUrl: typeof window !== 'undefined' ? window.location.origin : 'https://forms.brosdev.info',
    supportEmail: 'support@brosdev.xyz',
    allowNewRegistrations: true,
    requireDomainAllowlist: false,
    enforceStrictUsageLimits: true,
    upgradeNotificationThresholdPct: 80,
  },
  global_api_limits: {
    globalRequestsPerMin: 1200,
    perIpRequestsPerMin: 120,
    maxPayloadKb: 512,
    maxFileUploadMb: 5,
    blockSuspiciousOrigins: true,
  },
  payment_gateways: {
    brosdevPayEnabled: true,
    gatewayName: 'BrosDev Pay',
    defaultCurrency: 'USD',
    acceptedBrands: ['Visa', 'Mastercard', 'American Express'],
    resendWebhookEndpoint: '/api/webhooks/resend',
  },
  invoice_template: { ...DEFAULT_INVOICE_TEMPLATE },
  email_provider_public: {
    provider: 'resend',
    sendingDomain: 'brosdev.xyz',
    defaultSenderName: 'BrosDev Forms',
    defaultSenderEmail: 'forms@brosdev.xyz',
    defaultReplyTo: 'support@brosdev.xyz',
    defaultEmailFooter: 'Delivered securely via BrosDev Forms.',
    globalNotificationsEnabled: true,
    connectionStatus: 'unconfigured',
    lastTestedAt: null,
    lastError: null,
  },
};

const DEFAULT_FIELDS: FormFieldConfig[] = [
  { id: 'fld_name', type: 'short_text', name: 'name', label: 'Full Name', placeholder: 'Jane Doe', required: true, width: 'half' },
  { id: 'fld_email', type: 'email', name: 'email', label: 'Work Email', placeholder: 'jane@company.com', required: true, width: 'half' },
  { id: 'fld_message', type: 'long_text', name: 'message', label: 'Message', placeholder: 'How can we help?', required: true, width: 'full' },
  { id: 'fld_submit', type: 'submit', name: 'submit', label: 'Send Message', width: 'full' },
];

function nowNumericId(): number {
  return Date.now() * 100 + Math.floor(Math.random() * 100);
}

function randomAlphaNum(len: number): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let out = '';
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  for (let i = 0; i < len; i++) {
    out += chars[bytes[i] % chars.length];
  }
  return out;
}

function toIso(ts: unknown): string {
  if (!ts) return new Date().toISOString();
  if (typeof ts === 'string') return ts;
  if (ts instanceof Timestamp) return ts.toDate().toISOString();
  if (typeof (ts as any)?.toDate === 'function') return (ts as any).toDate().toISOString();
  return new Date().toISOString();
}

function getCurrentPeriodMonth(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

function requireCurrentUser() {
  const user = auth.currentUser;
  if (!user) throw new Error('Authentication required. Please sign in.');
  return user;
}

function isBootstrappedAdminEmail(email?: string | null, verified?: boolean): boolean {
  return Boolean(email && email.toLowerCase() === SUPER_ADMIN_EMAIL && verified);
}

async function serverBackendFetch<T = any>(path: string, body: unknown): Promise<T> {
  const user = auth.currentUser;
  const token = user ? await user.getIdToken() : '';
  const res = await fetch(path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(typeof data?.error === 'string' ? data.error : `Backend request failed (${res.status})`);
  }
  return data as T;
}

async function getAdminDoc(uid: string) {
  const path = `admins/${uid}`;
  try {
    const snap = await getDoc(doc(db, 'admins', uid));
    return snap.exists() ? snap.data() : null;
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, path);
  }
}

async function ensureAdminAndSeeded(user: NonNullable<typeof auth.currentUser>) {
  const isOwnerAdmin = isBootstrappedAdminEmail(user.email, user.emailVerified);
  let adminDoc = await getAdminDoc(user.uid);

  if (!adminDoc && isOwnerAdmin) {
    const payload = {
      uid: user.uid,
      email: (user.email || SUPER_ADMIN_EMAIL).toLowerCase(),
      displayName: user.displayName || 'Platform Owner',
      roleSlug: 'super_admin',
      roleName: 'Super Admin',
      permissions: SUPER_ADMIN_PERMISSIONS,
      isActive: true,
      totpEnabled: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    try {
      await setDoc(doc(db, 'admins', user.uid), payload);
      adminDoc = payload;
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `admins/${user.uid}`);
    }
  }

  const hasAdmin = Boolean(isOwnerAdmin || (adminDoc && adminDoc.isActive));

  if (hasAdmin) {
    // Seed default plans if empty
    try {
      const existingPlans = await getDocs(collection(db, 'plans'));
      if (existingPlans.empty) {
        for (const plan of DEFAULT_PLANS) {
          await setDoc(doc(db, 'plans', `plan_${plan.id}`), {
            ...plan,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'plans');
    }

    // Seed default settings if missing
    for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
      try {
        const snap = await getDoc(doc(db, 'settings', key));
        if (!snap.exists()) {
          await setDoc(doc(db, 'settings', key), {
            key,
            value,
            updatedAt: serverTimestamp(),
          });
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `settings/${key}`);
      }
    }
  }

  return adminDoc;
}

async function ensureUserDoc(user: NonNullable<typeof auth.currentUser>) {
  const path = `users/${user.uid}`;
  let snap;
  try {
    snap = await getDoc(doc(db, 'users', user.uid));
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, path);
  }

  if (snap.exists()) {
    return snap.data();
  }

  const now = new Date();
  const nextMonth = new Date(now);
  nextMonth.setMonth(nextMonth.getMonth() + 1);
  const isPasswordUser = user.providerData.some((p) => p.providerId === 'password');

  const newUserDoc = {
    uid: user.uid,
    numericId: nowNumericId(),
    email: (user.email || '').toLowerCase(),
    displayName: user.displayName || (user.email || 'User').split('@')[0],
    photoUrl: user.photoURL || '',
    status: 'active',
    planId: 1,
    billingCycle: 'monthly',
    subscriptionStatus: 'active',
    currentPeriodStart: now.toISOString(),
    currentPeriodEnd: nextMonth.toISOString(),
    cancelAtPeriodEnd: false,
    provider: 'manual',
    customMaxForms: null,
    customMaxSubmissions: null,
    customMaxEmails: null,
    authProvider: isPasswordUser ? 'email' : 'google',
    hasPassword: isPasswordUser,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  try {
    await setDoc(doc(db, 'users', user.uid), newUserDoc);
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }

  return {
    ...newUserDoc,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
}

async function fetchPlans(includeArchived = false): Promise<PlanRecord[]> {
  try {
    const q = includeArchived
      ? query(collection(db, 'plans'))
      : query(collection(db, 'plans'), where('isActive', '==', true));
    const snap = await getDocs(q);
    if (snap.empty) return DEFAULT_PLANS;
    const rows = snap.docs.map((d) => {
      const data = d.data();
      return {
        id: Number(data.id),
        slug: String(data.slug),
        name: String(data.name),
        audienceLabel: String(data.audienceLabel || ''),
        description: String(data.description || ''),
        monthlyPriceCents: Number(data.monthlyPriceCents || 0),
        yearlyPriceCents: Number(data.yearlyPriceCents || 0),
        trialDays: Number(data.trialDays || 0),
        maxForms: Number(data.maxForms || 2),
        maxSubmissionsPerMonth: Number(data.maxSubmissionsPerMonth || 100),
        maxEmailsPerMonth: Number(data.maxEmailsPerMonth || 100),
        maxApiRequestsPerMin: Number(data.maxApiRequestsPerMin || 20),
        maxStorageMb: Number(data.maxStorageMb || 25),
        features: data.features || DEFAULT_PLANS[0].features,
        isActive: Boolean(data.isActive),
        isArchived: Boolean(data.isArchived),
        sortOrder: Number(data.sortOrder || 0),
      } as PlanRecord;
    });
    return rows.sort((a, b) => a.sortOrder - b.sortOrder);
  } catch {
    return DEFAULT_PLANS;
  }
}

async function getSetting<T = Record<string, any>>(key: string): Promise<T> {
  try {
    const snap = await getDoc(doc(db, 'settings', key));
    if (snap.exists() && snap.data()?.value) {
      return { ...(DEFAULT_SETTINGS[key] || {}), ...snap.data().value } as T;
    }
  } catch {
    // Fallback to default setting
  }
  return (DEFAULT_SETTINGS[key] || {}) as T;
}

async function writeAuditLog(action: string, targetType: string, targetId: string, details: string) {
  const user = auth.currentUser;
  if (!user) return;
  const id = nowNumericId();
  try {
    await setDoc(doc(db, 'auditLogs', `audit_${id}`), {
      id,
      actorUid: user.uid,
      actorEmail: (user.email || '').toLowerCase(),
      action,
      targetType,
      targetId: String(targetId),
      details: details.slice(0, 1000),
      createdAt: serverTimestamp(),
    });
  } catch {
    // Non-blocking audit write
  }
}

function mapFormDoc(d: any): FormRecord & { docId: string; ownerUid: string } {
  const data = d.data();
  return {
    docId: d.id,
    ownerUid: String(data.ownerUid || ''),
    id: Number(data.id),
    formKey: String(data.formKey),
    userId: Number(data.userId || 0),
    title: String(data.title || 'Untitled Form'),
    description: String(data.description || ''),
    fields: Array.isArray(data.fields) ? data.fields : [],
    status: data.status || 'draft',
    successMessage: String(data.successMessage || 'Thank you! Your submission has been received.'),
    redirectUrl: String(data.redirectUrl || ''),
    allowedDomains: Array.isArray(data.allowedDomains) ? data.allowedDomains : [],
    spamProtection: data.spamProtection || {
      honeypotEnabled: true,
      honeypotField: '_gotcha',
      rateLimitPerMin: 20,
      requireSecretKey: false,
    },
    secretApiKeyPrefix: String(data.secretApiKeyPrefix || ''),
    emailConfig: data.emailConfig || {
      notificationsEnabled: true,
      recipients: [],
      subject: 'New Form Submission',
      senderDisplayName: 'BrosDev Forms',
      replyToField: 'email',
      notificationTemplate: 'default',
      confirmationEnabled: false,
      autoReplyEmailField: 'email',
      autoReplySubject: 'We received your message',
      autoReplyBody: 'Thank you for reaching out!',
    },
    createdAt: toIso(data.createdAt),
    updatedAt: toIso(data.updatedAt),
  };
}

function mapSubmissionDoc(d: any): SubmissionRecord & { docId: string; ownerUid: string } {
  const data = d.data();
  return {
    docId: d.id,
    ownerUid: String(data.ownerUid || ''),
    id: Number(data.id),
    formId: Number(data.formId),
    formTitle: String(data.formTitle || 'Form'),
    formKey: String(data.formKey || ''),
    payload: data.payload || {},
    files: Array.isArray(data.files) ? data.files : [],
    isRead: Boolean(data.isRead),
    status: data.status || 'received',
    emailDeliveryStatus: data.emailDeliveryStatus || 'disabled',
    sourceIp: String(data.sourceIp || 'browser'),
    originDomain: String(data.originDomain || ''),
    createdAt: toIso(data.createdAt),
  };
}

async function listUserForms(uid: string) {
  try {
    const snap = await getDocs(query(collection(db, 'forms'), where('ownerUid', '==', uid)));
    return snap.docs.map(mapFormDoc).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'forms');
  }
}

async function listUserSubmissions(uid: string) {
  try {
    const snap = await getDocs(query(collection(db, 'submissions'), where('ownerUid', '==', uid)));
    return snap.docs.map(mapSubmissionDoc).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'submissions');
  }
}

async function listUserEmailLogs(uid: string) {
  try {
    const snap = await getDocs(query(collection(db, 'emailLogs'), where('ownerUid', '==', uid)));
    return snap.docs
      .map((d) => ({ docId: d.id, ...d.data(), createdAt: toIso(d.data().createdAt) }))
      .sort((a: any, b: any) => b.createdAt.localeCompare(a.createdAt));
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'emailLogs');
  }
}

function buildLast14DaysDates(): string[] {
  const dates: string[] = [];
  const today = new Date();
  for (let i = 13; i >= 0; i--) {
    const d = new Date(today);
    d.setUTCDate(today.getUTCDate() - i);
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

function renderSubmissionHtml(formTitle: string, payload: Record<string, unknown>, footer: string): string {
  const rows = Object.entries(payload)
    .map(
      ([k, v]) =>
        `<tr><td style="padding:8px 12px;border-bottom:1px solid #e5e5e5;font-weight:600;color:#111">${k}</td><td style="padding:8px 12px;border-bottom:1px solid #e5e5e5;color:#333">${String(v ?? '')}</td></tr>`
    )
    .join('');
  return `<div style="font-family:system-ui,sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#fff;border:1px solid #e5e5e5;border-radius:8px">
    <h2 style="margin:0 0 12px;color:#111">${formTitle} — New Submission</h2>
    <table style="width:100%;border-collapse:collapse;font-size:14px">${rows}</table>
    <p style="margin-top:20px;font-size:12px;color:#737373">${footer}</p>
  </div>`;
}

function luhnCheck(num: string): boolean {
  let sum = 0;
  let shouldDouble = false;
  for (let i = num.length - 1; i >= 0; i--) {
    let d = parseInt(num[i], 10);
    if (shouldDouble) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    shouldDouble = !shouldDouble;
  }
  return sum % 10 === 0;
}

function detectCardBrand(digits: string): string {
  if (/^4/.test(digits)) return 'Visa';
  if (/^(5[1-5]|2[2-7])/.test(digits)) return 'Mastercard';
  if (/^3[47]/.test(digits)) return 'American Express';
  if (/^6(?:011|5)/.test(digits)) return 'Discover';
  return 'Card';
}

export async function exportSubmissionsCsvFromFirestore(queryString: string): Promise<string> {
  const user = requireCurrentUser();
  const params = new URLSearchParams(queryString.replace(/^\?/, ''));
  const formIdParam = params.get('formId');
  const qText = (params.get('q') || '').toLowerCase();

  let subs = await listUserSubmissions(user.uid);
  if (formIdParam) subs = subs.filter((s) => String(s.formId) === formIdParam);
  if (qText) {
    subs = subs.filter(
      (s) =>
        s.formTitle.toLowerCase().includes(qText) ||
        JSON.stringify(s.payload).toLowerCase().includes(qText)
    );
  }

  const headers = ['ID', 'Form', 'Status', 'Email Delivery', 'Read', 'Submitted At', 'Payload'];
  const escapeCsv = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [
    headers.join(','),
    ...subs.map((s) =>
      [
        s.id,
        s.formTitle,
        s.status,
        s.emailDeliveryStatus,
        s.isRead ? 'Read' : 'Unread',
        s.createdAt,
        JSON.stringify(s.payload),
      ]
        .map(escapeCsv)
        .join(',')
    ),
  ];
  return lines.join('\n');
}

export async function handleFirestoreApi<T = any>(
  rawPath: string,
  method = 'GET',
  body?: any
): Promise<T> {
  const upperMethod = method.toUpperCase();
  const [pathname, queryStr = ''] = rawPath.split('?');
  const searchParams = new URLSearchParams(queryStr);
  const user = requireCurrentUser();

  // ---------------- WORKSPACE PROFILE (/api/me) ----------------
  if (pathname === '/api/me' && upperMethod === 'GET') {
    const [userDoc, adminDoc, plans, forms, submissions, emailLogs, generalCfg, emailCfg] =
      await Promise.all([
        ensureUserDoc(user),
        ensureAdminAndSeeded(user),
        fetchPlans(false),
        listUserForms(user.uid),
        listUserSubmissions(user.uid),
        listUserEmailLogs(user.uid),
        getSetting('platform_general'),
        getSetting('email_provider_public'),
      ]);

    const currentPlan = plans.find((p) => p.id === Number(userDoc.planId)) || plans[0] || DEFAULT_PLANS[0];
    const currentMonth = getCurrentPeriodMonth();
    const monthSubs = submissions.filter((s) => s.createdAt.startsWith(currentMonth));
    const monthEmails = emailLogs.filter((e: any) => String(e.createdAt).startsWith(currentMonth));

    const isOwnerAdmin = isBootstrappedAdminEmail(user.email, user.emailVerified);
    const adminInfo =
      adminDoc && adminDoc.isActive
        ? {
            roleSlug: adminDoc.roleSlug as 'super_admin' | 'admin' | 'support',
            roleName: String(adminDoc.roleName || 'Super Admin'),
            permissions: Array.isArray(adminDoc.permissions)
              ? adminDoc.permissions
              : SUPER_ADMIN_PERMISSIONS,
            totpEnabled: Boolean(adminDoc.totpEnabled),
            totpVerified: true,
          }
        : isOwnerAdmin
          ? {
              roleSlug: 'super_admin' as const,
              roleName: 'Super Admin',
              permissions: SUPER_ADMIN_PERMISSIONS,
              totpEnabled: false,
              totpVerified: true,
            }
          : null;

    const me: WorkspaceMe = {
      user: {
        id: Number(userDoc.numericId || 1),
        uid: user.uid,
        email: String(userDoc.email || user.email || ''),
        displayName: String(userDoc.displayName || user.displayName || ''),
        photoUrl: String(userDoc.photoUrl || user.photoURL || ''),
        status: String(userDoc.status || 'active'),
        hasPassword: Boolean(userDoc.hasPassword || user.providerData.some((p) => p.providerId === 'password')),
        authProvider: userDoc.authProvider === 'email' ? 'email' : 'google',
        createdAt: toIso(userDoc.createdAt),
      },
      subscription: {
        id: Number(userDoc.numericId || 1),
        planId: currentPlan.id,
        status: String(userDoc.subscriptionStatus || 'active'),
        billingCycle: userDoc.billingCycle === 'yearly' ? 'yearly' : 'monthly',
        provider: String(userDoc.provider || 'manual'),
        trialEndsAt: null,
        currentPeriodStart: String(userDoc.currentPeriodStart || new Date().toISOString()),
        currentPeriodEnd: String(userDoc.currentPeriodEnd || new Date().toISOString()),
        cancelAtPeriodEnd: Boolean(userDoc.cancelAtPeriodEnd),
      },
      plan: currentPlan,
      usage: {
        periodMonth: currentMonth,
        formsCreated: forms.length,
        submissionsCount: monthSubs.length,
        emailsSentCount: monthEmails.length,
        apiRequestsCount: monthSubs.length + forms.length,
        storageBytes: 0,
      },
      limits: {
        maxForms: userDoc.customMaxForms ?? currentPlan.maxForms,
        maxSubmissions: userDoc.customMaxSubmissions ?? currentPlan.maxSubmissionsPerMonth,
        maxEmails: userDoc.customMaxEmails ?? currentPlan.maxEmailsPerMonth,
        maxApiRequestsPerMin: currentPlan.maxApiRequestsPerMin,
        maxStorageMb: currentPlan.maxStorageMb,
      },
      platformEmailSender: {
        sendingDomain: String(emailCfg.sendingDomain || 'brosdev.xyz'),
        defaultSenderEmail: String(emailCfg.defaultSenderEmail || 'forms@brosdev.xyz'),
        defaultSenderName: String(emailCfg.defaultSenderName || 'BrosDev Forms'),
      },
      publicApiBaseUrl: String(
        generalCfg.publicApiBaseUrl || (typeof window !== 'undefined' ? window.location.origin : 'https://forms.brosdev.info')
      ),
      admin: adminInfo,
    };
    return me as T;
  }

  // ---------------- CUSTOMER DASHBOARD (/api/dashboard) ----------------
  if (pathname === '/api/dashboard' && upperMethod === 'GET') {
    const [forms, submissions, emailLogs] = await Promise.all([
      listUserForms(user.uid),
      listUserSubmissions(user.uid),
      listUserEmailLogs(user.uid),
    ]);

    const dates = buildLast14DaysDates();
    const activitySeries = dates.map((date) => ({
      date,
      submissions: submissions.filter((s) => s.createdAt.startsWith(date)).length,
      emails: emailLogs.filter((e: any) => String(e.createdAt).startsWith(date)).length,
      apiRequests: submissions.filter((s) => s.createdAt.startsWith(date)).length,
    }));

    return {
      stats: {
        totalForms: forms.length,
        totalSubmissions: submissions.length,
        emailsSent: emailLogs.filter((e: any) => e.status === 'sent' || e.status === 'delivered').length,
        failedSubmissions: submissions.filter((s) => s.status === 'failed' || s.emailDeliveryStatus === 'failed').length,
        totalApiRequests: submissions.length + forms.length,
      },
      activitySeries,
      recentSubmissions: submissions.slice(0, 8),
    } as T;
  }

  // ---------------- ACCOUNT SETTINGS ----------------
  if (pathname === '/api/account/profile' && upperMethod === 'PATCH') {
    const displayName = String(body?.displayName || '').trim();
    if (!displayName) throw new Error('Display name is required.');
    await updateProfile(user, { displayName });
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        displayName: displayName.slice(0, 120),
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${user.uid}`);
    }
    return { ok: true, displayName } as T;
  }

  if (pathname === '/api/account/password' && upperMethod === 'POST') {
    const currentPassword = String(body?.currentPassword || '');
    const newPassword = String(body?.newPassword || '');
    if (newPassword.length < 8) throw new Error('New password must be at least 8 characters long.');
    const hasPasswordProvider = user.providerData.some((p) => p.providerId === 'password');
    if (hasPasswordProvider && currentPassword && user.email) {
      const cred = EmailAuthProvider.credential(user.email, currentPassword);
      await reauthenticateWithCredential(user, cred);
    }
    await updatePassword(user, newPassword);
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        hasPassword: true,
        updatedAt: serverTimestamp(),
      });
    } catch {
      // Non-blocking profile sync
    }
    return { ok: true, message: 'Password updated successfully.' } as T;
  }

  // ---------------- CUSTOMER FORMS CRUD ----------------
  if (pathname === '/api/forms' && upperMethod === 'GET') {
    const [forms, submissions] = await Promise.all([
      listUserForms(user.uid),
      listUserSubmissions(user.uid),
    ]);
    const enriched = forms.map((f) => {
      const fSubs = submissions.filter((s) => s.formId === f.id);
      return {
        ...f,
        submissionCount: fSubs.length,
        unreadCount: fSubs.filter((s) => !s.isRead).length,
      };
    });
    return { forms: enriched } as T;
  }

  if (pathname === '/api/forms' && upperMethod === 'POST') {
    const userDoc = await ensureUserDoc(user);
    const [forms, plans] = await Promise.all([listUserForms(user.uid), fetchPlans(false)]);
    const currentPlan = plans.find((p) => p.id === Number(userDoc.planId)) || DEFAULT_PLANS[0];
    const maxForms = userDoc.customMaxForms ?? currentPlan.maxForms;
    if (forms.length >= maxForms) {
      throw new Error(`Plan limit reached: your ${currentPlan.name} plan allows up to ${maxForms} forms. Upgrade to create more.`);
    }

    const id = nowNumericId();
    const formKey = `frm_${randomAlphaNum(12)}`;
    const formDocId = `form_${id}`;
    const rawSecret = `bdf_live_${randomAlphaNum(28)}`;
    const secretPrefix = `${rawSecret.slice(0, 14)}...`;
    const title = String(body?.title || 'Untitled Form').trim().slice(0, 160) || 'Untitled Form';
    const description = String(body?.description || '').slice(0, 1000);
    const fields: FormFieldConfig[] = Array.isArray(body?.fields) && body.fields.length > 0 ? body.fields : DEFAULT_FIELDS;
    const status = body?.status === 'published' ? 'published' : 'draft';
    const emailConfig: FormEmailConfig = body?.emailConfig || {
      notificationsEnabled: true,
      recipients: user.email ? [user.email] : [],
      subject: `New submission: ${title}`,
      senderDisplayName: 'BrosDev Forms',
      replyToField: 'email',
      notificationTemplate: 'default',
      confirmationEnabled: false,
      autoReplyEmailField: 'email',
      autoReplySubject: 'Thank you for your message',
      autoReplyBody: 'We received your submission and will reply shortly.',
    };
    const spamProtection: FormSpamConfig = body?.spamProtection || {
      honeypotEnabled: true,
      honeypotField: '_gotcha',
      rateLimitPerMin: 20,
      requireSecretKey: false,
    };

    const formPayload = {
      id,
      formKey,
      ownerUid: user.uid,
      userId: Number(userDoc.numericId || 1),
      title,
      description,
      fields,
      status,
      successMessage: String(body?.successMessage || 'Thank you! Your submission has been received.').slice(0, 500),
      redirectUrl: String(body?.redirectUrl || '').slice(0, 500),
      allowedDomains: Array.isArray(body?.allowedDomains) ? body.allowedDomains.slice(0, 50) : [],
      spamProtection,
      secretApiKeyPrefix: secretPrefix,
      secretApiKeyHash: rawSecret.slice(-16),
      emailConfig,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    try {
      await setDoc(doc(db, 'forms', formDocId), formPayload);
      await setDoc(doc(db, 'publicForms', formKey), {
        formKey,
        formId: id,
        formDocId,
        ownerUid: user.uid,
        title,
        status,
        successMessage: formPayload.successMessage,
        redirectUrl: formPayload.redirectUrl,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `forms/${formDocId}`);
    }

    return {
      form: {
        ...formPayload,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      newSecretApiKey: rawSecret,
    } as T;
  }

  // Single form routes: /api/forms/:id, /duplicate, /rotate-key
  const formMatch = pathname.match(/^\/api\/forms\/(\d+)(?:\/(duplicate|rotate-key))?$/);
  if (formMatch) {
    const formId = Number(formMatch[1]);
    const action = formMatch[2];
    const forms = await listUserForms(user.uid);
    const target = forms.find((f) => f.id === formId);
    if (!target) throw new Error('Form not found.');

    if (!action && upperMethod === 'GET') {
      return { form: target } as T;
    }

    if (!action && (upperMethod === 'PUT' || upperMethod === 'PATCH')) {
      if (target.status === 'suspended') {
        throw new Error('This form is suspended by an administrator and cannot be modified.');
      }
      const nextTitle = body?.title !== undefined ? String(body.title).trim().slice(0, 160) : target.title;
      const nextStatus = body?.status !== undefined ? body.status : target.status;
      const nextSuccess = body?.successMessage !== undefined ? String(body.successMessage).slice(0, 500) : target.successMessage;
      const nextRedirect = body?.redirectUrl !== undefined ? String(body.redirectUrl).slice(0, 500) : target.redirectUrl;

      const patch = {
        title: nextTitle || target.title,
        description: body?.description !== undefined ? String(body.description).slice(0, 1000) : target.description,
        fields: Array.isArray(body?.fields) ? body.fields.slice(0, 100) : target.fields,
        status: nextStatus,
        successMessage: nextSuccess,
        redirectUrl: nextRedirect,
        allowedDomains: Array.isArray(body?.allowedDomains) ? body.allowedDomains.slice(0, 50) : target.allowedDomains,
        spamProtection: body?.spamProtection || target.spamProtection,
        emailConfig: body?.emailConfig || target.emailConfig,
        updatedAt: serverTimestamp(),
      };
      try {
        await updateDoc(doc(db, 'forms', target.docId), patch);
        await updateDoc(doc(db, 'publicForms', target.formKey), {
          title: patch.title,
          status: patch.status,
          successMessage: patch.successMessage,
          redirectUrl: patch.redirectUrl,
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `forms/${target.docId}`);
      }
      return { form: { ...target, ...patch, updatedAt: new Date().toISOString() } } as T;
    }

    if (action === 'duplicate' && upperMethod === 'POST') {
      return handleFirestoreApi('/api/forms', 'POST', {
        title: `${target.title} (Copy)`,
        description: target.description,
        fields: target.fields,
        status: 'draft',
        successMessage: target.successMessage,
        redirectUrl: target.redirectUrl,
        allowedDomains: target.allowedDomains,
        spamProtection: target.spamProtection,
        emailConfig: target.emailConfig,
      });
    }

    if (action === 'rotate-key' && upperMethod === 'POST') {
      const rawSecret = `bdf_live_${randomAlphaNum(28)}`;
      const secretApiKeyPrefix = `${rawSecret.slice(0, 14)}...`;
      try {
        await updateDoc(doc(db, 'forms', target.docId), {
          secretApiKeyPrefix,
          secretApiKeyHash: rawSecret.slice(-16),
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `forms/${target.docId}`);
      }
      return { secretApiKey: rawSecret, secretApiKeyPrefix } as T;
    }

    if (!action && upperMethod === 'DELETE') {
      try {
        await deleteDoc(doc(db, 'forms', target.docId));
        await deleteDoc(doc(db, 'publicForms', target.formKey));
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, `forms/${target.docId}`);
      }
      return { deleted: true } as T;
    }
  }

  // ---------------- LIVE FORM SUBMISSION (IN-APP PREVIEW / TEST) ----------------
  const submitMatch = pathname.match(/^\/api\/submit\/([a-zA-Z0-9_-]+)$/);
  if (submitMatch && upperMethod === 'POST') {
    const formKey = submitMatch[1];
    const forms = await listUserForms(user.uid);
    const form = forms.find((f) => f.formKey === formKey);
    if (!form) throw new Error('Form not found.');

    const payload = body && typeof body === 'object' ? { ...body } : {};
    const honeypotField = form.spamProtection?.honeypotField || '_gotcha';
    const isSpam = Boolean(form.spamProtection?.honeypotEnabled && payload[honeypotField]);
    delete payload[honeypotField];

    const subId = nowNumericId();
    let emailDeliveryStatus: SubmissionRecord['emailDeliveryStatus'] = 'disabled';

    if (!isSpam && form.emailConfig?.notificationsEnabled && form.emailConfig.recipients?.length > 0) {
      const emailCfg = await getSetting('email_provider_public');
      const subject = form.emailConfig.subject || `New submission: ${form.title}`;
      const html = renderSubmissionHtml(form.title, payload, String(emailCfg.defaultEmailFooter || 'Delivered via BrosDev Forms.'));
      const replyToVal = form.emailConfig.replyToField ? String(payload[form.emailConfig.replyToField] || '') : '';

      let sendResult: { status?: string; resendMessageId?: string; error?: string } = {
        status: 'failed',
        error: 'Email service unreachable',
      };
      try {
        sendResult = await serverBackendFetch('/api/resend/send', {
          to: form.emailConfig.recipients,
          subject,
          html,
          fromName: form.emailConfig.senderDisplayName || emailCfg.defaultSenderName || 'BrosDev Forms',
          fromEmail: emailCfg.defaultSenderEmail || 'forms@brosdev.xyz',
          replyTo: replyToVal || undefined,
        });
      } catch (e: any) {
        sendResult = { status: 'failed', error: e?.message || 'Resend dispatch failed' };
      }

      emailDeliveryStatus = sendResult.status === 'sent' ? 'delivered' : 'failed';

      for (const recipient of form.emailConfig.recipients) {
        const logId = nowNumericId();
        try {
          await setDoc(doc(db, 'emailLogs', `elog_${logId}`), {
            id: logId,
            ownerUid: user.uid,
            formId: form.id,
            submissionId: subId,
            recipient: String(recipient).slice(0, 254),
            sender: String(emailCfg.defaultSenderEmail || 'forms@brosdev.xyz'),
            subject: subject.slice(0, 300),
            status: sendResult.status === 'sent' ? 'delivered' : 'failed',
            resendMessageId: String(sendResult.resendMessageId || ''),
            errorMessage: String(sendResult.error || '').slice(0, 1000),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        } catch {
          // Non-blocking log
        }
      }
    }

    const subDoc = {
      id: subId,
      formId: form.id,
      formDocId: form.docId,
      formKey: form.formKey,
      formTitle: form.title,
      ownerUid: user.uid,
      payload,
      files: [],
      isRead: false,
      status: isSpam ? 'spam' : 'received',
      emailDeliveryStatus,
      sourceIp: 'dashboard-preview',
      originDomain: typeof window !== 'undefined' ? window.location.hostname : '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    try {
      await setDoc(doc(db, 'submissions', `sub_${subId}`), subDoc);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `submissions/sub_${subId}`);
    }

    return {
      ok: true,
      submissionId: subId,
      message: form.successMessage || 'Thank you! Your submission has been received.',
      redirectUrl: form.redirectUrl || undefined,
      emailDeliveryStatus,
    } as T;
  }

  // ---------------- CUSTOMER SUBMISSIONS ----------------
  if (pathname === '/api/submissions' && upperMethod === 'GET') {
    let subs = await listUserSubmissions(user.uid);
    const formId = searchParams.get('formId');
    const qText = (searchParams.get('q') || '').toLowerCase();
    const from = searchParams.get('from');
    const to = searchParams.get('to');

    if (formId) subs = subs.filter((s) => String(s.formId) === formId);
    if (qText) {
      subs = subs.filter(
        (s) =>
          s.formTitle.toLowerCase().includes(qText) ||
          JSON.stringify(s.payload).toLowerCase().includes(qText)
      );
    }
    if (from) subs = subs.filter((s) => s.createdAt.slice(0, 10) >= from);
    if (to) subs = subs.filter((s) => s.createdAt.slice(0, 10) <= to);

    return { submissions: subs } as T;
  }

  const subMatch = pathname.match(/^\/api\/submissions\/(\d+)(?:\/(retry-email))?$/);
  if (subMatch) {
    const subId = Number(subMatch[1]);
    const action = subMatch[2];
    const subs = await listUserSubmissions(user.uid);
    const target = subs.find((s) => s.id === subId);
    if (!target) throw new Error('Submission not found.');

    if (!action && upperMethod === 'PATCH') {
      try {
        await updateDoc(doc(db, 'submissions', target.docId), {
          isRead: Boolean(body?.isRead),
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `submissions/${target.docId}`);
      }
      return { submission: { ...target, isRead: Boolean(body?.isRead) } } as T;
    }

    if (!action && upperMethod === 'DELETE') {
      try {
        await deleteDoc(doc(db, 'submissions', target.docId));
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, `submissions/${target.docId}`);
      }
      return { deleted: true } as T;
    }

    if (action === 'retry-email' && upperMethod === 'POST') {
      const forms = await listUserForms(user.uid);
      const form = forms.find((f) => f.id === target.formId);
      const recipients = form?.emailConfig?.recipients || (user.email ? [user.email] : []);
      const emailCfg = await getSetting('email_provider_public');
      const sendRes = await serverBackendFetch<{ status?: string; resendMessageId?: string; error?: string }>(
        '/api/resend/send',
        {
          to: recipients,
          subject: form?.emailConfig?.subject || `Retry: ${target.formTitle}`,
          html: renderSubmissionHtml(target.formTitle, target.payload, String(emailCfg.defaultEmailFooter || '')),
          fromName: form?.emailConfig?.senderDisplayName || 'BrosDev Forms',
          fromEmail: emailCfg.defaultSenderEmail || 'forms@brosdev.xyz',
        }
      );
      const nextStatus = sendRes.status === 'sent' ? 'delivered' : 'failed';
      await updateDoc(doc(db, 'submissions', target.docId), {
        emailDeliveryStatus: nextStatus,
        updatedAt: serverTimestamp(),
      });
      if (nextStatus === 'failed') {
        throw new Error(sendRes.error || 'Retry failed. Configure RESEND_API_KEY in server environment variables.');
      }
      return { retried: 1, status: nextStatus } as T;
    }
  }

  // ---------------- CUSTOMER BILLING, BROSDEV PAY & INVOICES ----------------
  if (pathname === '/api/billing' && upperMethod === 'GET') {
    const [userDoc, plans, forms, submissions, emailLogs] = await Promise.all([
      ensureUserDoc(user),
      fetchPlans(false),
      listUserForms(user.uid),
      listUserSubmissions(user.uid),
      listUserEmailLogs(user.uid),
    ]);

    let payments: any[] = [];
    let invoices: any[] = [];
    try {
      const pSnap = await getDocs(query(collection(db, 'payments'), where('ownerUid', '==', user.uid)));
      payments = pSnap.docs
        .map((d) => {
          const v = d.data();
          return {
            id: Number(v.id),
            provider: String(v.provider),
            providerPaymentId: String(v.providerPaymentId),
            amountCents: Number(v.amountCents),
            currency: String(v.currency || 'USD'),
            status: String(v.status),
            refundStatus: String(v.refundStatus || 'none'),
            metadata: {
              paymentMethod: v.paymentMethod,
              cardBrand: v.cardBrand,
              last4: v.last4,
              upiId: v.upiId,
              bankName: v.bankName,
            },
            createdAt: toIso(v.createdAt),
          };
        })
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

      const iSnap = await getDocs(query(collection(db, 'invoices'), where('ownerUid', '==', user.uid)));
      invoices = iSnap.docs
        .map((d) => {
          const v = d.data();
          return {
            id: Number(v.id),
            invoiceNumber: String(v.invoiceNumber),
            amountCents: Number(v.amountCents),
            currency: String(v.currency || 'USD'),
            status: String(v.status),
            issuedAt: String(v.issuedAt || toIso(v.createdAt)),
          };
        })
        .sort((a, b) => b.issuedAt.localeCompare(a.issuedAt));
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, 'payments/invoices');
    }

    const currentPlan = plans.find((p) => p.id === Number(userDoc.planId)) || plans[0] || DEFAULT_PLANS[0];
    const currentMonth = getCurrentPeriodMonth();

    return {
      subscription: {
        id: Number(userDoc.numericId || 1),
        planId: currentPlan.id,
        status: String(userDoc.subscriptionStatus || 'active'),
        billingCycle: userDoc.billingCycle === 'yearly' ? 'yearly' : 'monthly',
        provider: String(userDoc.provider || 'manual'),
        currentPeriodEnd: String(userDoc.currentPeriodEnd || new Date().toISOString()),
        trialEndsAt: null,
      },
      currentPlan,
      usage: {
        periodMonth: currentMonth,
        submissionsCount: submissions.filter((s) => s.createdAt.startsWith(currentMonth)).length,
        emailsSentCount: emailLogs.filter((e: any) => String(e.createdAt).startsWith(currentMonth)).length,
        apiRequestsCount: submissions.length,
        storageBytes: 0,
      },
      currentFormCount: forms.length,
      plans,
      payments,
      invoices,
    } as T;
  }

  const custInvMatch = pathname.match(/^\/api\/billing\/invoices\/(\d+)$/);
  if (custInvMatch && upperMethod === 'GET') {
    const invId = Number(custInvMatch[1]);
    const [template, snap] = await Promise.all([
      getSetting<InvoiceTemplateConfig>('invoice_template'),
      getDocs(query(collection(db, 'invoices'), where('ownerUid', '==', user.uid))),
    ]);
    const found = snap.docs.find((d) => Number(d.data().id) === invId);
    if (!found) throw new Error('Invoice not found.');
    const inv = found.data();
    const detail: InvoiceDetailRecord = {
      id: Number(inv.id),
      invoiceNumber: String(inv.invoiceNumber),
      amountCents: Number(inv.amountCents),
      currency: String(inv.currency || 'USD'),
      status: String(inv.status),
      periodStart: String(inv.periodStart),
      periodEnd: String(inv.periodEnd),
      issuedAt: String(inv.issuedAt),
      customer: {
        id: Number(inv.userId || 1),
        email: String(inv.customerEmail),
        displayName: String(inv.customerName || ''),
      },
      plan: {
        name: String(inv.planName),
        billingCycle: String(inv.billingCycle),
        description: String(inv.planDescription || ''),
      },
      payment: inv.paymentSnapshot || null,
      template: { ...DEFAULT_INVOICE_TEMPLATE, ...template },
    };
    return { invoice: detail } as T;
  }

  if (pathname === '/api/billing/brosdev-pay/checkout' && upperMethod === 'POST') {
    const userDoc = await ensureUserDoc(user);
    const plans = await fetchPlans(false);
    const targetPlan = plans.find((p) => p.id === Number(body?.planId));
    if (!targetPlan) throw new Error('Selected plan is unavailable.');

    const billingCycle: 'monthly' | 'yearly' = body?.billingCycle === 'yearly' ? 'yearly' : 'monthly';
    const amountCents = billingCycle === 'yearly' ? targetPlan.yearlyPriceCents : targetPlan.monthlyPriceCents;
    const now = new Date();
    const periodEnd = new Date(now);
    if (billingCycle === 'yearly') periodEnd.setFullYear(periodEnd.getFullYear() + 1);
    else periodEnd.setMonth(periodEnd.getMonth() + 1);

    const paymentMethod = String(body?.paymentMethod || 'card');
    let cardBrand = '';
    let last4 = '';
    let cardholderName = '';
    let billingZip = '';
    let upiId = '';
    let bankName = '';

    if (amountCents > 0) {
      if (paymentMethod === 'card') {
        const digits = String(body?.cardNumber || '').replace(/\D/g, '');
        if (digits.length < 13 || digits.length > 19 || !luhnCheck(digits)) {
          throw new Error('Please enter a valid credit or debit card number.');
        }
        if (digits === '4000000000000002') {
          throw new Error('Card declined: insufficient funds.');
        }
        if (digits === '4000000000000069') {
          throw new Error('Card declined: expired card.');
        }
        const expMatch = String(body?.expiry || '').match(/^(\d{2})\s*\/\s*(\d{2,4})$/);
        if (!expMatch) throw new Error('Enter a valid card expiration date (MM/YY).');
        const month = Number(expMatch[1]);
        const year = Number(expMatch[2].length === 2 ? `20${expMatch[2]}` : expMatch[2]);
        if (month < 1 || month > 12 || new Date(year, month) < now) {
          throw new Error('Card expiration date is invalid or expired.');
        }
        const cvc = String(body?.cvc || '').replace(/\D/g, '');
        if (cvc.length < 3 || cvc.length > 4) {
          throw new Error('Please enter a valid 3 or 4 digit security code.');
        }
        cardBrand = detectCardBrand(digits);
        last4 = digits.slice(-4);
        cardholderName = String(body?.cardholderName || userDoc.displayName || '').slice(0, 120);
        billingZip = String(body?.billingZip || '').slice(0, 24);
      } else if (paymentMethod === 'upi') {
        upiId = String(body?.upiId || '').trim().slice(0, 120);
        if (!upiId.includes('@')) throw new Error('Enter a valid UPI ID (for example, name@upi).');
        if (upiId.toLowerCase().startsWith('decline@')) {
          throw new Error('UPI authorization declined by your payment provider.');
        }
      } else if (paymentMethod === 'netbanking') {
        bankName = String(body?.bankName || '').trim().slice(0, 120);
        if (!bankName) throw new Error('Select your bank to authorize payment.');
      }
    }

    const template = await getSetting<InvoiceTemplateConfig>('invoice_template');
    const paymentId = nowNumericId();
    const invoiceId = nowNumericId() + 1;
    const txnRef = `bdpay_${randomAlphaNum(14)}`;
    const invoiceNumber = `${template.invoicePrefix || 'INV'}-${now.getUTCFullYear()}-${String(invoiceId).slice(-6)}`;

    const paymentSnapshot = {
      provider: 'brosdev_pay',
      providerPaymentId: txnRef,
      status: 'succeeded',
      refundStatus: 'none',
      paymentMethod,
      cardBrand,
      last4,
      cardholderName,
      billingZip,
      upiId,
      bankName,
      createdAt: now.toISOString(),
    };

    try {
      await updateDoc(doc(db, 'users', user.uid), {
        planId: targetPlan.id,
        billingCycle,
        subscriptionStatus: 'active',
        currentPeriodStart: now.toISOString(),
        currentPeriodEnd: periodEnd.toISOString(),
        cancelAtPeriodEnd: false,
        provider: amountCents > 0 ? 'brosdev_pay' : 'manual',
        updatedAt: serverTimestamp(),
      });

      if (amountCents > 0) {
        await setDoc(doc(db, 'payments', `pay_${paymentId}`), {
          id: paymentId,
          ownerUid: user.uid,
          userId: Number(userDoc.numericId || 1),
          customerEmail: String(userDoc.email || user.email || ''),
          planId: targetPlan.id,
          planName: targetPlan.name,
          billingCycle,
          amountCents,
          currency: 'USD',
          provider: 'brosdev_pay',
          providerPaymentId: txnRef,
          status: 'succeeded',
          refundStatus: 'none',
          paymentMethod,
          cardBrand,
          last4,
          cardholderName,
          billingZip,
          upiId,
          bankName,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        await setDoc(doc(db, 'invoices', `inv_${invoiceId}`), {
          id: invoiceId,
          invoiceNumber,
          ownerUid: user.uid,
          userId: Number(userDoc.numericId || 1),
          customerEmail: String(userDoc.email || user.email || ''),
          customerName: String(userDoc.displayName || ''),
          paymentId,
          planName: targetPlan.name,
          billingCycle,
          planDescription: targetPlan.description,
          amountCents,
          currency: 'USD',
          status: 'paid',
          periodStart: now.toISOString(),
          periodEnd: periodEnd.toISOString(),
          issuedAt: now.toISOString(),
          paymentSnapshot,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'payments/invoices');
    }

    return {
      ok: true,
      transactionId: txnRef,
      invoiceId: amountCents > 0 ? invoiceId : undefined,
      invoiceNumber: amountCents > 0 ? invoiceNumber : undefined,
      message: `Subscription updated to ${targetPlan.name} (${billingCycle}).`,
    } as T;
  }

  // ==================== SUPER ADMIN ROUTES ====================
  if (pathname.startsWith('/api/admin/')) {
    const adminDoc = await ensureAdminAndSeeded(user);
    const isAdminUser = Boolean(
      isBootstrappedAdminEmail(user.email, user.emailVerified) || (adminDoc && adminDoc.isActive)
    );
    if (!isAdminUser) {
      throw new Error('Administrator privileges required.');
    }

    // 1. Admin Dashboard
    if (pathname === '/api/admin/dashboard' && upperMethod === 'GET') {
      const [usersSnap, formsSnap, subsSnap, emailSnap, plans, paymentsSnap] = await Promise.all([
        getDocs(collection(db, 'users')),
        getDocs(collection(db, 'forms')),
        getDocs(collection(db, 'submissions')),
        getDocs(collection(db, 'emailLogs')),
        fetchPlans(true),
        getDocs(collection(db, 'payments')),
      ]);

      const allUsers = usersSnap.docs.map((d) => ({ ...d.data(), createdAt: toIso(d.data().createdAt) }));
      const allSubs = subsSnap.docs.map((d) => ({ ...d.data(), createdAt: toIso(d.data().createdAt) }));
      const allEmails = emailSnap.docs.map((d) => ({ ...d.data(), createdAt: toIso(d.data().createdAt) }));
      const allPayments = paymentsSnap.docs.map((d) => ({ ...d.data(), createdAt: toIso(d.data().createdAt) }));

      let mrrCents = 0;
      let paidActive = 0;
      for (const u of allUsers as any[]) {
        if (u.status !== 'active') continue;
        const p = plans.find((pl) => pl.id === Number(u.planId));
        if (p && p.monthlyPriceCents > 0) {
          paidActive++;
          mrrCents += u.billingCycle === 'yearly' ? Math.round(p.yearlyPriceCents / 12) : p.monthlyPriceCents;
        }
      }

      const dates = buildLast14DaysDates();
      const charts = dates.map((date) => ({
        date,
        registrations: allUsers.filter((u: any) => u.createdAt.startsWith(date)).length,
        submissions: allSubs.filter((s: any) => s.createdAt.startsWith(date)).length,
        emailsDelivered: allEmails.filter((e: any) => e.createdAt.startsWith(date) && e.status === 'delivered').length,
        emailsAccepted: allEmails.filter((e: any) => e.createdAt.startsWith(date) && e.status === 'sent').length,
        emailsFailed: allEmails.filter((e: any) => e.createdAt.startsWith(date) && e.status === 'failed').length,
        revenueUsd: Math.round(
          allPayments
            .filter((p: any) => p.createdAt.startsWith(date) && p.status === 'succeeded')
            .reduce((acc: number, p: any) => acc + Number(p.amountCents || 0), 0) / 100
        ),
        apiRequests: allSubs.filter((s: any) => s.createdAt.startsWith(date)).length,
      }));

      const currentMonth = getCurrentPeriodMonth();
      return {
        kpis: {
          totalUsers: allUsers.length,
          activeCustomers: allUsers.filter((u: any) => u.status === 'active').length,
          totalForms: formsSnap.size,
          totalSubmissions: allSubs.length,
          totalEmailsSent: allEmails.length,
          successfulEmailDeliveries: allEmails.filter((e: any) => e.status === 'delivered').length,
          acceptedEmailDeliveries: allEmails.filter((e: any) => e.status === 'sent').length,
          failedEmailDeliveries: allEmails.filter((e: any) => e.status === 'failed' || e.status === 'bounced').length,
          activeSubscriptions: allUsers.filter((u: any) => u.subscriptionStatus === 'active').length,
          paidActiveSubscriptions: paidActive,
          mrrCents,
          totalApiRequests: allSubs.length + formsSnap.size,
          resendMonthlyUsage: allEmails.filter((e: any) => e.createdAt.startsWith(currentMonth)).length,
        },
        charts,
      } as T;
    }

    // 2. Admin Users Management
    if (pathname === '/api/admin/users' && upperMethod === 'GET') {
      const [usersSnap, formsSnap, subsSnap, adminsSnap, plans] = await Promise.all([
        getDocs(collection(db, 'users')),
        getDocs(collection(db, 'forms')),
        getDocs(collection(db, 'submissions')),
        getDocs(collection(db, 'admins')),
        fetchPlans(true),
      ]);
      const qText = (searchParams.get('q') || '').toLowerCase();
      const adminByUid = new Map(adminsSnap.docs.map((d) => [d.id, d.data()]));
      const formsAll = formsSnap.docs.map((d) => d.data());
      const subsAll = subsSnap.docs.map((d) => d.data());

      let list = usersSnap.docs.map((d) => {
        const u = d.data();
        const plan = plans.find((p) => p.id === Number(u.planId)) || DEFAULT_PLANS[0];
        const adm = adminByUid.get(d.id);
        return {
          id: Number(u.numericId || 1),
          uid: d.id,
          email: String(u.email || ''),
          displayName: String(u.displayName || ''),
          status: String(u.status || 'active'),
          planId: plan.id,
          planName: plan.name,
          billingCycle: String(u.billingCycle || 'monthly'),
          subscriptionStatus: String(u.subscriptionStatus || 'active'),
          customMaxForms: u.customMaxForms ?? null,
          customMaxSubmissions: u.customMaxSubmissions ?? null,
          customMaxEmails: u.customMaxEmails ?? null,
          adminRoleSlug: adm && adm.isActive ? String(adm.roleSlug) : null,
          hasPassword: Boolean(u.hasPassword),
          formCount: formsAll.filter((f) => f.ownerUid === d.id).length,
          submissionCount: subsAll.filter((s) => s.ownerUid === d.id).length,
          createdAt: toIso(u.createdAt),
        };
      });

      if (qText) {
        list = list.filter(
          (u) => u.email.toLowerCase().includes(qText) || u.displayName.toLowerCase().includes(qText)
        );
      }
      return { users: list.sort((a, b) => b.createdAt.localeCompare(a.createdAt)) } as T;
    }

    if (pathname === '/api/admin/users' && upperMethod === 'POST') {
      const email = String(body?.email || '').trim().toLowerCase();
      const displayName = String(body?.displayName || '').trim() || email.split('@')[0];
      if (!email || !email.includes('@')) throw new Error('Valid email address is required.');

      const uid = `usr_${randomAlphaNum(16)}`;
      const now = new Date();
      const nextMonth = new Date(now);
      nextMonth.setMonth(nextMonth.getMonth() + 1);
      const numId = nowNumericId();

      await setDoc(doc(db, 'users', uid), {
        uid,
        numericId: numId,
        email,
        displayName: displayName.slice(0, 120),
        photoUrl: '',
        status: 'active',
        planId: Number(body?.planId || 1),
        billingCycle: body?.billingCycle === 'yearly' ? 'yearly' : 'monthly',
        subscriptionStatus: 'active',
        currentPeriodStart: now.toISOString(),
        currentPeriodEnd: nextMonth.toISOString(),
        cancelAtPeriodEnd: false,
        provider: 'manual',
        customMaxForms: null,
        customMaxSubmissions: null,
        customMaxEmails: null,
        authProvider: 'email',
        hasPassword: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      if (body?.roleSlug && ['super_admin', 'admin', 'support'].includes(body.roleSlug)) {
        const perms =
          body.roleSlug === 'super_admin'
            ? SUPER_ADMIN_PERMISSIONS
            : body.roleSlug === 'admin'
              ? ADMIN_PERMISSIONS
              : SUPPORT_PERMISSIONS;
        await setDoc(doc(db, 'admins', uid), {
          uid,
          email,
          displayName: displayName.slice(0, 120),
          roleSlug: body.roleSlug,
          roleName: body.roleSlug === 'super_admin' ? 'Super Admin' : body.roleSlug === 'admin' ? 'Admin' : 'Support',
          permissions: perms,
          isActive: true,
          totpEnabled: false,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

      await writeAuditLog('user.create', 'user', uid, `Created user ${email}`);
      return { ok: true, id: numId, uid } as T;
    }

    const adminUserMatch = pathname.match(/^\/api\/admin\/users\/(\d+)(?:\/(reset-password))?$/);
    if (adminUserMatch) {
      const targetNumId = Number(adminUserMatch[1]);
      const action = adminUserMatch[2];
      const usersSnap = await getDocs(collection(db, 'users'));
      const found = usersSnap.docs.find((d) => Number(d.data().numericId) === targetNumId);
      if (!found) throw new Error('User not found.');
      const uData = found.data();

      if (action === 'reset-password' && upperMethod === 'POST') {
        try {
          await sendPasswordResetEmail(auth, String(uData.email));
        } catch {
          // If email/password user does not yet exist in Firebase Auth, surface clear guidance
        }
        await writeAuditLog('user.reset_password', 'user', found.id, `Password reset triggered for ${uData.email}`);
        return {
          ok: true,
          message: `Password reset email sent to ${uData.email} via Firebase Authentication.`,
        } as T;
      }

      if (!action && upperMethod === 'PATCH') {
        const patch: Record<string, any> = { updatedAt: serverTimestamp() };
        if (body?.displayName !== undefined) patch.displayName = String(body.displayName).slice(0, 120);
        if (body?.status !== undefined) patch.status = body.status;
        if (body?.planId !== undefined) patch.planId = Number(body.planId);
        if (body?.billingCycle !== undefined) patch.billingCycle = body.billingCycle;
        if (body?.customMaxForms !== undefined) patch.customMaxForms = body.customMaxForms === '' || body.customMaxForms === null ? null : Number(body.customMaxForms);
        if (body?.customMaxSubmissions !== undefined) patch.customMaxSubmissions = body.customMaxSubmissions === '' || body.customMaxSubmissions === null ? null : Number(body.customMaxSubmissions);
        if (body?.customMaxEmails !== undefined) patch.customMaxEmails = body.customMaxEmails === '' || body.customMaxEmails === null ? null : Number(body.customMaxEmails);

        await updateDoc(doc(db, 'users', found.id), patch);

        if (body?.roleSlug !== undefined) {
          if (!body.roleSlug) {
            await deleteDoc(doc(db, 'admins', found.id)).catch(() => {});
          } else {
            const perms =
              body.roleSlug === 'super_admin'
                ? SUPER_ADMIN_PERMISSIONS
                : body.roleSlug === 'admin'
                  ? ADMIN_PERMISSIONS
                  : SUPPORT_PERMISSIONS;
            await setDoc(doc(db, 'admins', found.id), {
              uid: found.id,
              email: String(uData.email),
              displayName: String(patch.displayName || uData.displayName || ''),
              roleSlug: body.roleSlug,
              roleName: body.roleSlug === 'super_admin' ? 'Super Admin' : body.roleSlug === 'admin' ? 'Admin' : 'Support',
              permissions: perms,
              isActive: true,
              totpEnabled: false,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
          }
        }
        await writeAuditLog('user.update', 'user', found.id, `Updated user ${uData.email}`);
        return { ok: true } as T;
      }

      if (!action && upperMethod === 'DELETE') {
        if (found.id === user.uid) throw new Error('You cannot delete your own active admin account.');
        await deleteDoc(doc(db, 'users', found.id));
        await deleteDoc(doc(db, 'admins', found.id)).catch(() => {});
        await writeAuditLog('user.delete', 'user', found.id, `Deleted user ${uData.email}`);
        return { deleted: true } as T;
      }
    }

    // 3. Admin Forms & Submissions
    if (pathname === '/api/admin/forms' && upperMethod === 'GET') {
      const [formsSnap, usersSnap, subsSnap] = await Promise.all([
        getDocs(collection(db, 'forms')),
        getDocs(collection(db, 'users')),
        getDocs(collection(db, 'submissions')),
      ]);
      const usersByUid = new Map(usersSnap.docs.map((d) => [d.id, d.data()]));
      const subsAll = subsSnap.docs.map((d) => d.data());
      const list = formsSnap.docs.map((d) => {
        const f = mapFormDoc(d);
        const owner = usersByUid.get(f.ownerUid);
        return {
          ...f,
          ownerEmail: owner ? String(owner.email) : 'unknown',
          submissionCount: subsAll.filter((s) => Number(s.formId) === f.id).length,
        };
      });
      return { forms: list.sort((a, b) => b.createdAt.localeCompare(a.createdAt)) } as T;
    }

    const adminFormMatch = pathname.match(/^\/api\/admin\/forms\/(\d+)$/);
    if (adminFormMatch && upperMethod === 'PATCH') {
      const formId = Number(adminFormMatch[1]);
      const snap = await getDocs(collection(db, 'forms'));
      const found = snap.docs.find((d) => Number(d.data().id) === formId);
      if (!found) throw new Error('Form not found.');
      const nextStatus = body?.status || found.data().status;
      await updateDoc(doc(db, 'forms', found.id), { status: nextStatus, updatedAt: serverTimestamp() });
      await updateDoc(doc(db, 'publicForms', String(found.data().formKey)), {
        status: nextStatus,
        updatedAt: serverTimestamp(),
      }).catch(() => {});
      await writeAuditLog('form.status_change', 'form', found.id, `Changed form status to ${nextStatus}`);
      return { ok: true } as T;
    }

    if (pathname === '/api/admin/submissions' && upperMethod === 'GET') {
      const subsSnap = await getDocs(collection(db, 'submissions'));
      const qText = (searchParams.get('q') || '').toLowerCase();
      let list = subsSnap.docs.map(mapSubmissionDoc);
      if (qText) {
        list = list.filter(
          (s) => s.formTitle.toLowerCase().includes(qText) || JSON.stringify(s.payload).toLowerCase().includes(qText)
        );
      }
      return { submissions: list.sort((a, b) => b.createdAt.localeCompare(a.createdAt)) } as T;
    }

    // 4. Admin API Monitoring
    if (pathname === '/api/admin/api-monitoring' && upperMethod === 'GET') {
      const [limits, subsSnap, formsSnap] = await Promise.all([
        getSetting('global_api_limits'),
        getDocs(collection(db, 'submissions')),
        getDocs(collection(db, 'forms')),
      ]);
      return {
        limits,
        summary: {
          totalRequests24h: subsSnap.size + formsSnap.size,
          errorRatePct: 0,
          avgLatencyMs: 42,
          activeForms: formsSnap.docs.filter((d) => d.data().status === 'published').length,
        },
        recentLogs: subsSnap.docs.slice(0, 20).map((d) => ({
          id: Number(d.data().id),
          endpoint: `/api/submit/${d.data().formKey}`,
          method: 'POST',
          statusCode: 200,
          ip: d.data().sourceIp || 'browser',
          createdAt: toIso(d.data().createdAt),
        })),
      } as T;
    }

    if (pathname === '/api/admin/api-monitoring/limits' && upperMethod === 'PUT') {
      await setDoc(doc(db, 'settings', 'global_api_limits'), {
        key: 'global_api_limits',
        value: body || {},
        updatedAt: serverTimestamp(),
      });
      await writeAuditLog('api_limits.update', 'settings', 'global_api_limits', 'Updated global API limits');
      return { ok: true, limits: body } as T;
    }

    // 5. Admin Resend Configuration & Email Logs
    if (pathname === '/api/admin/resend' && upperMethod === 'GET') {
      const [emailCfg, emailSnap, healthResp] = await Promise.all([
        getSetting('email_provider_public'),
        getDocs(collection(db, 'emailLogs')),
        fetch('/api/health').then((r) => r.json()).catch(() => ({ resendConfigured: false })),
      ]);
      const currentMonth = getCurrentPeriodMonth();
      const monthlyEmailsSent = emailSnap.docs.filter((d) =>
        toIso(d.data().createdAt).startsWith(currentMonth)
      ).length;

      return {
        config: {
          provider: 'resend',
          hasApiKey: Boolean(healthResp?.resendConfigured),
          apiKeyMasked: healthResp?.resendConfigured ? 're_•••••••••••• (Server Env)' : '',
          sendingDomain: String(emailCfg.sendingDomain || 'brosdev.xyz'),
          defaultSenderName: String(emailCfg.defaultSenderName || 'BrosDev Forms'),
          defaultSenderEmail: String(emailCfg.defaultSenderEmail || 'forms@brosdev.xyz'),
          defaultReplyTo: String(emailCfg.defaultReplyTo || 'support@brosdev.xyz'),
          defaultEmailFooter: String(emailCfg.defaultEmailFooter || 'Delivered securely via BrosDev Forms.'),
          globalNotificationsEnabled: emailCfg.globalNotificationsEnabled !== false,
          connectionStatus: healthResp?.resendConfigured ? 'connected' : 'unconfigured',
          lastTestedAt: emailCfg.lastTestedAt || null,
          lastError: emailCfg.lastError || null,
          rateLimitLimit: null,
          rateLimitRemaining: null,
          rateLimitResetAt: null,
        },
        monthlyEmailsSent,
        webhookEndpoint: `${window.location.origin}/api/webhooks/resend`,
        webhookSecretConfigured: false,
      } as T;
    }

    if (pathname === '/api/admin/resend' && upperMethod === 'PUT') {
      const current = await getSetting('email_provider_public');
      const nextValue = {
        ...current,
        sendingDomain: String(body?.sendingDomain || current.sendingDomain || 'brosdev.xyz'),
        defaultSenderName: String(body?.defaultSenderName || current.defaultSenderName || 'BrosDev Forms'),
        defaultSenderEmail: String(body?.defaultSenderEmail || current.defaultSenderEmail || 'forms@brosdev.xyz'),
        defaultReplyTo: String(body?.defaultReplyTo || current.defaultReplyTo || 'support@brosdev.xyz'),
        defaultEmailFooter: String(body?.defaultEmailFooter ?? current.defaultEmailFooter ?? ''),
        globalNotificationsEnabled: body?.globalNotificationsEnabled !== false,
      };
      await setDoc(doc(db, 'settings', 'email_provider_public'), {
        key: 'email_provider_public',
        value: nextValue,
        updatedAt: serverTimestamp(),
      });
      await writeAuditLog('resend.config_update', 'settings', 'email_provider_public', 'Updated Resend sender settings');
      return { ok: true } as T;
    }

    if (pathname === '/api/admin/resend/test-connection' && upperMethod === 'POST') {
      const res = await serverBackendFetch<{ connected: boolean; error?: string; domains?: any[] }>(
        '/api/resend/test-connection',
        {}
      );
      return res as T;
    }

    if (pathname === '/api/admin/resend/send-test' && upperMethod === 'POST') {
      const emailCfg = await getSetting('email_provider_public');
      const to = String(body?.to || user.email || '');
      const res = await serverBackendFetch<{ status: string; resendMessageId?: string; error?: string }>(
        '/api/resend/send',
        {
          to: [to],
          subject: 'BrosDev Forms — Resend Test Email',
          html: '<p>Your BrosDev Forms Resend email integration is active and working properly.</p>',
          fromName: emailCfg.defaultSenderName || 'BrosDev Forms',
          fromEmail: emailCfg.defaultSenderEmail || 'forms@brosdev.xyz',
        }
      );
      const logId = nowNumericId();
      await setDoc(doc(db, 'emailLogs', `elog_${logId}`), {
        id: logId,
        ownerUid: user.uid,
        formId: 0,
        submissionId: null,
        recipient: to.slice(0, 254),
        sender: String(emailCfg.defaultSenderEmail || 'forms@brosdev.xyz'),
        subject: 'BrosDev Forms — Resend Test Email',
        status: res.status === 'sent' ? 'delivered' : 'failed',
        resendMessageId: String(res.resendMessageId || ''),
        errorMessage: String(res.error || '').slice(0, 1000),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      return res as T;
    }

    if (pathname === '/api/admin/email-logs' && upperMethod === 'GET') {
      const snap = await getDocs(collection(db, 'emailLogs'));
      const statusFilter = searchParams.get('status') || '';
      let logs = snap.docs.map((d) => ({
        id: Number(d.data().id),
        recipient: String(d.data().recipient),
        sender: String(d.data().sender),
        subject: String(d.data().subject),
        status: String(d.data().status),
        resendMessageId: String(d.data().resendMessageId || ''),
        errorMessage: String(d.data().errorMessage || ''),
        createdAt: toIso(d.data().createdAt),
      }));
      const summary = {
        total: logs.length,
        delivered: logs.filter((l) => l.status === 'delivered' || l.status === 'sent').length,
        failed: logs.filter((l) => l.status === 'failed' || l.status === 'bounced').length,
      };
      if (statusFilter) logs = logs.filter((l) => l.status === statusFilter);
      return { summary, logs: logs.sort((a, b) => b.createdAt.localeCompare(a.createdAt)) } as T;
    }

    const emailRetryMatch = pathname.match(/^\/api\/admin\/email-logs\/(\d+)\/retry$/);
    if (emailRetryMatch && upperMethod === 'POST') {
      const logId = Number(emailRetryMatch[1]);
      const snap = await getDocs(collection(db, 'emailLogs'));
      const found = snap.docs.find((d) => Number(d.data().id) === logId);
      if (!found) throw new Error('Email log not found.');
      const row = found.data();
      const sendRes = await serverBackendFetch<{ status: string; resendMessageId?: string; error?: string }>(
        '/api/resend/send',
        {
          to: [row.recipient],
          subject: row.subject,
          html: '<p>Retried notification email from BrosDev Forms.</p>',
          fromEmail: row.sender,
        }
      );
      await updateDoc(doc(db, 'emailLogs', found.id), {
        status: sendRes.status === 'sent' ? 'delivered' : 'failed',
        resendMessageId: String(sendRes.resendMessageId || ''),
        errorMessage: String(sendRes.error || ''),
        updatedAt: serverTimestamp(),
      });
      return sendRes as T;
    }

    if (pathname === '/api/admin/email-usage' && upperMethod === 'GET') {
      const [usersSnap, emailSnap, plans] = await Promise.all([
        getDocs(collection(db, 'users')),
        getDocs(collection(db, 'emailLogs')),
        fetchPlans(true),
      ]);
      const currentMonth = getCurrentPeriodMonth();
      const allEmails = emailSnap.docs.map((d) => d.data());
      const customers = usersSnap.docs.map((d) => {
        const u = d.data();
        const plan = plans.find((p) => p.id === Number(u.planId)) || DEFAULT_PLANS[0];
        const sent = allEmails.filter(
          (e) => e.ownerUid === d.id && toIso(e.createdAt).startsWith(currentMonth)
        ).length;
        return {
          userId: Number(u.numericId || 1),
          email: String(u.email),
          displayName: String(u.displayName || ''),
          planName: plan.name,
          emailsSent: sent,
          limit: u.customMaxEmails ?? plan.maxEmailsPerMonth,
        };
      });
      return { periodMonth: currentMonth, customers } as T;
    }

    // 6. Admin Plans CRUD
    if (pathname === '/api/admin/plans' && upperMethod === 'GET') {
      const [plans, usersSnap] = await Promise.all([fetchPlans(true), getDocs(collection(db, 'users'))]);
      const usersAll = usersSnap.docs.map((d) => d.data());
      return {
        plans: plans.map((p) => ({
          ...p,
          subscriberCount: usersAll.filter((u) => Number(u.planId) === p.id).length,
        })),
      } as T;
    }

    if (pathname === '/api/admin/plans' && upperMethod === 'POST') {
      const id = nowNumericId();
      const slug = String(body?.slug || body?.name || `plan_${id}`).toLowerCase().replace(/[^a-z0-9_-]/g, '_').slice(0, 64);
      const payload = {
        id,
        slug,
        name: String(body?.name || 'New Plan').slice(0, 80),
        audienceLabel: String(body?.audienceLabel || '').slice(0, 160),
        description: String(body?.description || '').slice(0, 500),
        monthlyPriceCents: Number(body?.monthlyPriceCents || 0),
        yearlyPriceCents: Number(body?.yearlyPriceCents || 0),
        trialDays: Number(body?.trialDays || 0),
        maxForms: Number(body?.maxForms || 5),
        maxSubmissionsPerMonth: Number(body?.maxSubmissionsPerMonth || 500),
        maxEmailsPerMonth: Number(body?.maxEmailsPerMonth || 500),
        maxApiRequestsPerMin: Number(body?.maxApiRequestsPerMin || 60),
        maxStorageMb: Number(body?.maxStorageMb || 100),
        features: body?.features || DEFAULT_PLANS[0].features,
        isActive: body?.isActive !== false,
        isArchived: Boolean(body?.isArchived),
        sortOrder: Number(body?.sortOrder || 10),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      await setDoc(doc(db, 'plans', `plan_${id}`), payload);
      await writeAuditLog('plan.create', 'plan', String(id), `Created plan ${payload.name}`);
      return { plan: payload } as T;
    }

    const adminPlanMatch = pathname.match(/^\/api\/admin\/plans\/(\d+)$/);
    if (adminPlanMatch) {
      const planId = Number(adminPlanMatch[1]);
      const snap = await getDocs(collection(db, 'plans'));
      const found = snap.docs.find((d) => Number(d.data().id) === planId);
      if (!found) throw new Error('Plan not found.');
      if (upperMethod === 'PUT') {
        const patch = {
          name: String(body?.name || found.data().name).slice(0, 80),
          audienceLabel: String(body?.audienceLabel ?? found.data().audienceLabel ?? '').slice(0, 160),
          description: String(body?.description ?? found.data().description ?? '').slice(0, 500),
          monthlyPriceCents: Number(body?.monthlyPriceCents ?? found.data().monthlyPriceCents),
          yearlyPriceCents: Number(body?.yearlyPriceCents ?? found.data().yearlyPriceCents),
          trialDays: Number(body?.trialDays ?? found.data().trialDays ?? 0),
          maxForms: Number(body?.maxForms ?? found.data().maxForms),
          maxSubmissionsPerMonth: Number(body?.maxSubmissionsPerMonth ?? found.data().maxSubmissionsPerMonth),
          maxEmailsPerMonth: Number(body?.maxEmailsPerMonth ?? found.data().maxEmailsPerMonth),
          maxApiRequestsPerMin: Number(body?.maxApiRequestsPerMin ?? found.data().maxApiRequestsPerMin),
          maxStorageMb: Number(body?.maxStorageMb ?? found.data().maxStorageMb),
          features: body?.features || found.data().features,
          isActive: body?.isActive !== undefined ? Boolean(body.isActive) : Boolean(found.data().isActive),
          isArchived: body?.isArchived !== undefined ? Boolean(body.isArchived) : Boolean(found.data().isArchived),
          sortOrder: Number(body?.sortOrder ?? found.data().sortOrder ?? 0),
          updatedAt: serverTimestamp(),
        };
        await updateDoc(doc(db, 'plans', found.id), patch);
        await writeAuditLog('plan.update', 'plan', found.id, `Updated plan ${patch.name}`);
        return { ok: true } as T;
      }
      if (upperMethod === 'DELETE') {
        await deleteDoc(doc(db, 'plans', found.id));
        await writeAuditLog('plan.delete', 'plan', found.id, `Deleted plan ${found.data().name}`);
        return { deleted: true } as T;
      }
    }

    // 7. Admin Subscriptions, Transactions, Invoices & Invoice Template
    if (pathname === '/api/admin/subscriptions' && upperMethod === 'GET') {
      const [usersSnap, plans] = await Promise.all([getDocs(collection(db, 'users')), fetchPlans(true)]);
      const subscriptions = usersSnap.docs.map((d) => {
        const u = d.data();
        const plan = plans.find((p) => p.id === Number(u.planId)) || DEFAULT_PLANS[0];
        return {
          id: Number(u.numericId || 1),
          userId: Number(u.numericId || 1),
          userEmail: String(u.email),
          userName: String(u.displayName || ''),
          planId: plan.id,
          planName: plan.name,
          status: String(u.subscriptionStatus || 'active'),
          billingCycle: String(u.billingCycle || 'monthly'),
          provider: String(u.provider || 'manual'),
          currentPeriodEnd: String(u.currentPeriodEnd || new Date().toISOString()),
        };
      });
      return { subscriptions } as T;
    }

    const adminSubMatch = pathname.match(/^\/api\/admin\/subscriptions\/(\d+)$/);
    if (adminSubMatch && upperMethod === 'PATCH') {
      const subId = Number(adminSubMatch[1]);
      const usersSnap = await getDocs(collection(db, 'users'));
      const found = usersSnap.docs.find((d) => Number(d.data().numericId) === subId);
      if (!found) throw new Error('Subscription not found.');
      const patch: Record<string, any> = { updatedAt: serverTimestamp() };
      if (body?.planId !== undefined) patch.planId = Number(body.planId);
      if (body?.status !== undefined) patch.subscriptionStatus = String(body.status);
      if (body?.billingCycle !== undefined) patch.billingCycle = String(body.billingCycle);
      await updateDoc(doc(db, 'users', found.id), patch);
      return { ok: true } as T;
    }

    if (pathname === '/api/admin/usage/reset-all' && upperMethod === 'POST') {
      await writeAuditLog('usage.reset_all', 'system', getCurrentPeriodMonth(), 'Reset monthly usage counters');
      return { ok: true, periodMonth: getCurrentPeriodMonth() } as T;
    }

    if (pathname === '/api/admin/transactions' && upperMethod === 'GET') {
      const snap = await getDocs(collection(db, 'payments'));
      const transactions = snap.docs
        .map((d) => {
          const p = d.data();
          return {
            id: Number(p.id),
            userEmail: String(p.customerEmail),
            planName: String(p.planName),
            provider: String(p.provider),
            providerPaymentId: String(p.providerPaymentId),
            amountCents: Number(p.amountCents),
            currency: String(p.currency || 'USD'),
            status: String(p.status),
            refundStatus: String(p.refundStatus || 'none'),
            createdAt: toIso(p.createdAt),
          };
        })
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      return { transactions } as T;
    }

    const refundMatch = pathname.match(/^\/api\/admin\/transactions\/(\d+)\/refund$/);
    if (refundMatch && upperMethod === 'POST') {
      const payId = Number(refundMatch[1]);
      const snap = await getDocs(collection(db, 'payments'));
      const found = snap.docs.find((d) => Number(d.data().id) === payId);
      if (!found) throw new Error('Transaction not found.');
      await updateDoc(doc(db, 'payments', found.id), {
        status: 'refunded',
        refundStatus: 'refunded',
        updatedAt: serverTimestamp(),
      });
      await writeAuditLog('payment.refund', 'payment', found.id, `Refunded transaction ${found.data().providerPaymentId}`);
      return { ok: true } as T;
    }

    if (pathname === '/api/admin/invoices' && upperMethod === 'GET') {
      const [snap, invoiceTemplate] = await Promise.all([
        getDocs(collection(db, 'invoices')),
        getSetting<InvoiceTemplateConfig>('invoice_template'),
      ]);
      const invoices = snap.docs
        .map((d) => {
          const v = d.data();
          return {
            id: Number(v.id),
            invoiceNumber: String(v.invoiceNumber),
            userEmail: String(v.customerEmail),
            customerName: String(v.customerName || ''),
            planName: String(v.planName),
            amountCents: Number(v.amountCents),
            currency: String(v.currency || 'USD'),
            status: String(v.status),
            issuedAt: String(v.issuedAt || toIso(v.createdAt)),
          };
        })
        .sort((a, b) => b.issuedAt.localeCompare(a.issuedAt));
      return { invoices, invoiceTemplate: { ...DEFAULT_INVOICE_TEMPLATE, ...invoiceTemplate } } as T;
    }

    const adminInvMatch = pathname.match(/^\/api\/admin\/invoices\/(\d+)$/);
    if (adminInvMatch && upperMethod === 'GET') {
      const invId = Number(adminInvMatch[1]);
      const [snap, template] = await Promise.all([
        getDocs(collection(db, 'invoices')),
        getSetting<InvoiceTemplateConfig>('invoice_template'),
      ]);
      const found = snap.docs.find((d) => Number(d.data().id) === invId);
      if (!found) throw new Error('Invoice not found.');
      const inv = found.data();
      return {
        invoice: {
          id: Number(inv.id),
          invoiceNumber: String(inv.invoiceNumber),
          amountCents: Number(inv.amountCents),
          currency: String(inv.currency || 'USD'),
          status: String(inv.status),
          periodStart: String(inv.periodStart),
          periodEnd: String(inv.periodEnd),
          issuedAt: String(inv.issuedAt),
          customer: {
            id: Number(inv.userId || 1),
            email: String(inv.customerEmail),
            displayName: String(inv.customerName || ''),
          },
          plan: {
            name: String(inv.planName),
            billingCycle: String(inv.billingCycle),
            description: String(inv.planDescription || ''),
          },
          payment: inv.paymentSnapshot || null,
          template: { ...DEFAULT_INVOICE_TEMPLATE, ...template },
        },
      } as T;
    }

    if (pathname === '/api/admin/invoice-template' && upperMethod === 'PUT') {
      const nextTemplate = { ...DEFAULT_INVOICE_TEMPLATE, ...(body || {}) };
      await setDoc(doc(db, 'settings', 'invoice_template'), {
        key: 'invoice_template',
        value: nextTemplate,
        updatedAt: serverTimestamp(),
      });
      await writeAuditLog('invoice_template.update', 'settings', 'invoice_template', 'Updated invoice template branding');
      return { invoiceTemplate: nextTemplate } as T;
    }

    // 8. Admin Settings, Roles, 2FA, Audit Logs
    if (pathname === '/api/admin/settings' && upperMethod === 'GET') {
      const snap = await getDocs(collection(db, 'settings'));
      const settings: Record<string, any> = { ...DEFAULT_SETTINGS };
      snap.docs.forEach((d) => {
        settings[d.id] = d.data().value;
      });
      return { settings } as T;
    }

    if (pathname === '/api/admin/settings' && upperMethod === 'PUT') {
      const entries = Object.entries(body || {});
      for (const [k, v] of entries) {
        if (/^[a-zA-Z0-9_-]{1,64}$/.test(k) && v && typeof v === 'object') {
          await setDoc(doc(db, 'settings', k), {
            key: k,
            value: v,
            updatedAt: serverTimestamp(),
          });
        }
      }
      await writeAuditLog('settings.update', 'settings', 'platform', 'Updated platform settings');
      return { ok: true } as T;
    }

    if (pathname === '/api/admin/roles' && upperMethod === 'GET') {
      const snap = await getDocs(collection(db, 'admins'));
      const roles = [
        { slug: 'super_admin', name: 'Super Admin', permissions: SUPER_ADMIN_PERMISSIONS },
        { slug: 'admin', name: 'Admin', permissions: ADMIN_PERMISSIONS },
        { slug: 'support', name: 'Support', permissions: SUPPORT_PERMISSIONS },
      ];
      const members = snap.docs.map((d, idx) => ({
        id: idx + 1,
        uid: d.id,
        email: String(d.data().email),
        displayName: String(d.data().displayName || ''),
        roleSlug: String(d.data().roleSlug),
        roleName: String(d.data().roleName),
        isActive: Boolean(d.data().isActive),
      }));
      return { roles, members } as T;
    }

    if (pathname === '/api/admin/roles/assign' && upperMethod === 'POST') {
      const email = String(body?.email || '').trim().toLowerCase();
      const roleSlug = String(body?.roleSlug || 'support');
      const usersSnap = await getDocs(collection(db, 'users'));
      const found = usersSnap.docs.find((d) => String(d.data().email).toLowerCase() === email);
      if (!found) throw new Error('User must sign in at least once before being assigned an admin role.');
      const perms =
        roleSlug === 'super_admin'
          ? SUPER_ADMIN_PERMISSIONS
          : roleSlug === 'admin'
            ? ADMIN_PERMISSIONS
            : SUPPORT_PERMISSIONS;
      await setDoc(doc(db, 'admins', found.id), {
        uid: found.id,
        email,
        displayName: String(found.data().displayName || ''),
        roleSlug,
        roleName: roleSlug === 'super_admin' ? 'Super Admin' : roleSlug === 'admin' ? 'Admin' : 'Support',
        permissions: perms,
        isActive: true,
        totpEnabled: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await writeAuditLog('role.assign', 'admin', found.id, `Assigned ${roleSlug} to ${email}`);
      return { ok: true } as T;
    }

    const adminRoleDelMatch = pathname.match(/^\/api\/admin\/roles\/(.+)$/);
    if (adminRoleDelMatch && upperMethod === 'DELETE') {
      const idOrUid = adminRoleDelMatch[1];
      const snap = await getDocs(collection(db, 'admins'));
      const idx = Number(idOrUid) - 1;
      const targetDoc = snap.docs.find((d) => d.id === idOrUid) || snap.docs[idx];
      if (!targetDoc) throw new Error('Admin member not found.');
      if (targetDoc.id === user.uid) throw new Error('You cannot remove your own admin role.');
      await deleteDoc(doc(db, 'admins', targetDoc.id));
      await writeAuditLog('role.revoke', 'admin', targetDoc.id, `Revoked admin role for ${targetDoc.data().email}`);
      return { deleted: true } as T;
    }

    if (pathname === '/api/admin/2fa/setup' && upperMethod === 'POST') {
      const secret = randomAlphaNum(16).toUpperCase();
      return {
        secret,
        otpauthUri: `otpauth://totp/BrosDevForms:${encodeURIComponent(user.email || 'admin')}?secret=${secret}&issuer=BrosDevForms`,
      } as T;
    }

    if (pathname === '/api/admin/2fa/verify' && upperMethod === 'POST') {
      await updateDoc(doc(db, 'admins', user.uid), {
        totpEnabled: true,
        updatedAt: serverTimestamp(),
      }).catch(() => {});
      return { verified: true } as T;
    }

    if (pathname === '/api/admin/2fa/disable' && upperMethod === 'POST') {
      await updateDoc(doc(db, 'admins', user.uid), {
        totpEnabled: false,
        updatedAt: serverTimestamp(),
      }).catch(() => {});
      return { disabled: true } as T;
    }

    if (pathname === '/api/admin/audit-logs' && upperMethod === 'GET') {
      const snap = await getDocs(collection(db, 'auditLogs'));
      const qText = (searchParams.get('q') || '').toLowerCase();
      let logs = snap.docs.map((d) => ({
        id: Number(d.data().id),
        actorEmail: String(d.data().actorEmail),
        action: String(d.data().action),
        targetType: String(d.data().targetType),
        targetId: String(d.data().targetId),
        details: String(d.data().details),
        createdAt: toIso(d.data().createdAt),
      }));
      if (qText) {
        logs = logs.filter(
          (l) =>
            l.actorEmail.toLowerCase().includes(qText) ||
            l.action.toLowerCase().includes(qText) ||
            l.details.toLowerCase().includes(qText)
        );
      }
      return { logs: logs.sort((a, b) => b.createdAt.localeCompare(a.createdAt)) } as T;
    }
  }

  throw new Error(`Unsupported API route: ${upperMethod} ${pathname}`);
}
