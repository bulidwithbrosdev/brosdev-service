import crypto from 'node:crypto';
import express, { type Request, type Response } from 'express';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db/index.ts';
import {
  adminRoles,
  adminUsers,
  subscriptionPlans,
  subscriptions,
  subscriptionUsage,
  users,
} from '../../db/schema.ts';
import { ensurePlatformBootstrapped, getCurrentPeriodMonth } from '../bootstrap.ts';
import { hashPassword, signSessionToken, verifyPassword } from '../crypto.ts';

export const authRouter = express.Router();

const registerSchema = z.object({
  email: z.string().email('Please enter a valid email address.'),
  password: z.string().min(8, 'Password must be at least 8 characters long.').max(128),
  displayName: z.string().max(100).optional().default(''),
});

const loginSchema = z.object({
  email: z.string().email('Please enter a valid email address.'),
  password: z.string().min(1, 'Password is required.').max(128),
});

const INITIAL_SUPER_ADMIN_EMAIL = (
  process.env.SUPER_ADMIN_EMAIL || 'gajjars614@gmail.com'
).toLowerCase();

export async function createEmailPasswordAccount(params: {
  email: string;
  password: string;
  displayName?: string;
  planId?: number;
  billingCycle?: 'monthly' | 'yearly';
}) {
  await ensurePlatformBootstrapped();
  const normalizedEmail = params.email.trim().toLowerCase();

  const existing = await db
    .select()
    .from(users)
    .where(eq(users.email, normalizedEmail))
    .limit(1);

  if (existing.length > 0) {
    throw new Error('An account with this email address already exists.');
  }

  const uid = `local_${crypto.randomBytes(12).toString('hex')}`;
  const passwordHash = hashPassword(params.password);
  const displayName = params.displayName?.trim() || normalizedEmail.split('@')[0];

  const [createdUser] = await db
    .insert(users)
    .values({
      uid,
      email: normalizedEmail,
      passwordHash,
      displayName,
      status: 'active',
      lastLoginAt: new Date(),
    })
    .returning();

  // Assign requested plan or default to Free plan
  let targetPlanId = params.planId;
  if (!targetPlanId) {
    const [freePlan] = await db
      .select()
      .from(subscriptionPlans)
      .where(eq(subscriptionPlans.slug, 'free'))
      .limit(1);
    const fallback = freePlan || (await db.select().from(subscriptionPlans).limit(1))[0];
    targetPlanId = fallback?.id;
  }

  if (targetPlanId) {
    const now = new Date();
    const end = new Date(now);
    if (params.billingCycle === 'yearly') end.setFullYear(end.getFullYear() + 1);
    else end.setMonth(end.getMonth() + 1);

    await db
      .insert(subscriptions)
      .values({
        userId: createdUser.id,
        planId: targetPlanId,
        status: 'active',
        billingCycle: params.billingCycle === 'yearly' ? 'yearly' : 'monthly',
        provider: 'manual',
        currentPeriodStart: now,
        currentPeriodEnd: end,
      })
      .onConflictDoNothing();
  }

  await db
    .insert(subscriptionUsage)
    .values({
      userId: createdUser.id,
      periodMonth: getCurrentPeriodMonth(),
    })
    .onConflictDoNothing();

  // Auto-grant Super Admin if matching configured owner email
  if (normalizedEmail === INITIAL_SUPER_ADMIN_EMAIL) {
    const [superAdminRole] = await db
      .select()
      .from(adminRoles)
      .where(eq(adminRoles.slug, 'super_admin'))
      .limit(1);
    if (superAdminRole) {
      await db
        .insert(adminUsers)
        .values({ userId: createdUser.id, roleId: superAdminRole.id, isActive: true })
        .onConflictDoNothing();
    }
  }

  return createdUser;
}

authRouter.post('/auth/register', async (req: Request, res: Response) => {
  try {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      const firstErr = parsed.error.issues[0]?.message || 'Invalid registration details.';
      return res.status(400).json({ error: firstErr });
    }

    const user = await createEmailPasswordAccount(parsed.data);
    const token = signSessionToken({ uid: user.uid, email: user.email, userId: user.id });

    return res.status(201).json({
      token,
      user: {
        id: user.id,
        uid: user.uid,
        email: user.email,
        displayName: user.displayName,
      },
    });
  } catch (err: any) {
    if (err?.code === '42P01' || err?.cause?.code === '42P01') {
      return res.status(503).json({
        error:
          'Database schema is not initialized yet. Run "npx drizzle-kit push --config=src/db/drizzle.config.ts" against your DATABASE_URL.',
      });
    }
    return res.status(400).json({ error: err.message || 'Registration failed' });
  }
});

authRouter.post('/auth/login', async (req: Request, res: Response) => {
  try {
    await ensurePlatformBootstrapped();
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Please enter a valid email and password.' });
    }

    const email = parsed.data.email.trim().toLowerCase();
    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);

    if (!user || !verifyPassword(parsed.data.password, user.passwordHash)) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    if (user.status === 'suspended') {
      return res.status(403).json({
        error: 'Your account has been suspended. Please contact platform support.',
      });
    }

    await db
      .update(users)
      .set({ lastLoginAt: new Date() })
      .where(eq(users.id, user.id));

    const token = signSessionToken({ uid: user.uid, email: user.email, userId: user.id });
    return res.json({
      token,
      user: {
        id: user.id,
        uid: user.uid,
        email: user.email,
        displayName: user.displayName,
      },
    });
  } catch (err: any) {
    console.error('POST /api/auth/login failed:', err);
    if (err?.code === '42P01' || err?.cause?.code === '42P01') {
      return res.status(503).json({
        error:
          'Database schema is not initialized yet. Run "npx drizzle-kit push --config=src/db/drizzle.config.ts" against your DATABASE_URL.',
      });
    }
    return res.status(500).json({ error: 'Sign in failed. Please try again.' });
  }
});
