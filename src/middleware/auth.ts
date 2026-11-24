import type { Request, Response, NextFunction } from 'express';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { eq } from 'drizzle-orm';
import { adminAuth } from '../lib/firebase-admin.ts';
import { db } from '../db/index.ts';
import {
  adminAuditLogs,
  adminPermissions,
  adminRoles,
  adminUsers,
  users,
} from '../db/schema.ts';
import { getOrCreateUser } from '../server/bootstrap.ts';
import { verifySessionToken } from '../server/crypto.ts';

export interface AuthRequest extends Request {
  firebaseUser?: DecodedIdToken;
  authUid?: string;
  dbUser?: typeof users.$inferSelect;
  adminContext?: {
    adminUserId: number;
    roleSlug: 'super_admin' | 'admin' | 'support';
    roleName: string;
    permissions: string[];
    totpEnabled: boolean;
  };
}

// In-memory short-lived verified 2FA admin sessions (keyed by auth UID)
const verifiedAdmin2faSessions = new Map<string, number>();

export function markAdmin2faVerified(uid: string) {
  verifiedAdmin2faSessions.set(uid, Date.now() + 8 * 60 * 60 * 1000);
}

export function isAdmin2faVerified(uid: string): boolean {
  const expires = verifiedAdmin2faSessions.get(uid);
  if (!expires) return false;
  if (Date.now() > expires) {
    verifiedAdmin2faSessions.delete(uid);
    return false;
  }
  return true;
}

export function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim();
  }
  return req.socket?.remoteAddress || '';
}

export const requireAuth = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const token = authHeader.slice('Bearer '.length).trim();
  try {
    let dbUser: typeof users.$inferSelect | undefined;

    if (token.startsWith('bdp.')) {
      const session = verifySessionToken(token);
      if (!session) {
        return res.status(401).json({ error: 'Invalid or expired session token' });
      }
      const [found] = await db
        .select()
        .from(users)
        .where(eq(users.uid, session.uid))
        .limit(1);
      if (!found) {
        return res.status(401).json({ error: 'Account not found' });
      }
      dbUser = found;
      req.authUid = found.uid;
    } else {
      const decoded = await adminAuth.verifyIdToken(token);
      req.firebaseUser = decoded;
      req.authUid = decoded.uid;
      dbUser = await getOrCreateUser({
        uid: decoded.uid,
        email: decoded.email || `${decoded.uid}@users.brosdev.xyz`,
        displayName: decoded.name || '',
        photoUrl: decoded.picture || '',
      });
    }

    if (dbUser.status === 'suspended') {
      return res.status(403).json({
        error: 'Your account has been suspended. Please contact platform support.',
      });
    }

    req.dbUser = dbUser;

    // Attach admin context if user is an active platform admin
    const adminRows = await db
      .select({
        adminId: adminUsers.id,
        isActive: adminUsers.isActive,
        totpEnabled: adminUsers.totpEnabled,
        roleId: adminRoles.id,
        roleSlug: adminRoles.slug,
        roleName: adminRoles.name,
      })
      .from(adminUsers)
      .innerJoin(adminRoles, eq(adminUsers.roleId, adminRoles.id))
      .where(eq(adminUsers.userId, dbUser.id))
      .limit(1);

    if (adminRows[0] && adminRows[0].isActive) {
      const perms = await db
        .select({ permissionKey: adminPermissions.permissionKey })
        .from(adminPermissions)
        .where(eq(adminPermissions.roleId, adminRows[0].roleId));

      req.adminContext = {
        adminUserId: adminRows[0].adminId,
        roleSlug: adminRows[0].roleSlug as 'super_admin' | 'admin' | 'support',
        roleName: adminRows[0].roleName,
        permissions: perms.map((p) => p.permissionKey),
        totpEnabled: adminRows[0].totpEnabled,
      };
    }

    next();
  } catch (error) {
    console.error('Auth verification failed:', error);
    return res.status(401).json({ error: 'Invalid or expired authentication token' });
  }
};

export const requireAdminPermission = (permission?: string, options?: { skip2faCheck?: boolean }) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.dbUser || !req.adminContext) {
      return res.status(403).json({ error: 'Administrator privileges required' });
    }

    const sessionUid = req.authUid || req.firebaseUser?.uid;
    if (
      !options?.skip2faCheck &&
      req.adminContext.totpEnabled &&
      sessionUid &&
      !isAdmin2faVerified(sessionUid)
    ) {
      return res.status(403).json({
        error: 'Two-factor authentication verification required',
        code: 'ADMIN_2FA_REQUIRED',
      });
    }

    if (
      permission &&
      req.adminContext.roleSlug !== 'super_admin' &&
      !req.adminContext.permissions.includes(permission)
    ) {
      return res.status(403).json({
        error: `Insufficient admin permission: ${permission}`,
      });
    }

    next();
  };
};

export async function recordAdminAudit(
  req: AuthRequest,
  action: string,
  targetType: string,
  targetId: string | number = '',
  details: Record<string, unknown> = {}
) {
  if (!req.dbUser || !req.adminContext) return;
  try {
    await db.insert(adminAuditLogs).values({
      adminUserId: req.dbUser.id,
      adminEmail: req.dbUser.email,
      roleSlug: req.adminContext.roleSlug,
      action,
      targetType,
      targetId: String(targetId),
      details,
      ipAddress: getClientIp(req),
    });
  } catch (err) {
    console.error('Failed to record admin audit log:', err);
  }
}
