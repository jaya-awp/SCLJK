import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { loadDatabase, type StoredUser } from './store.ts';

const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const TOKEN_TTL_MS = 1000 * 60 * 60 * 12;

export interface SessionPayload {
  sub: string;
  username: string;
  displayName: string;
  role: 'admin' | 'guru';
  exp: number;
}

export interface AuthenticatedRequest extends Request {
  authUser?: SessionPayload;
}

export function hashPasscode(passcode: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(passcode, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPasscode(passcode: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, keyHex] = parts;
  if (!salt || !keyHex) return false;
  const derivedBuffer = crypto.scryptSync(passcode, salt, 64);
  const storedBuffer = Buffer.from(keyHex, 'hex');
  if (derivedBuffer.length !== storedBuffer.length) return false;
  return crypto.timingSafeEqual(derivedBuffer, storedBuffer);
}

export function verifyEnvAdminPasscode(passcode: string): boolean {
  const envPass = process.env.ADMIN_PASSCODE?.trim();
  if (!envPass) return false;
  const a = Buffer.from(passcode, 'utf8');
  const b = Buffer.from(envPass, 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function hasConfiguredAdmin(): boolean {
  if (process.env.ADMIN_PASSCODE?.trim()) return true;
  const db = loadDatabase();
  return db.users.some((u) => u.role === 'admin' && u.active);
}

export function issueSessionToken(user: Pick<StoredUser, 'id' | 'username' | 'displayName' | 'role'>): string {
  const payload: SessionPayload = {
    sub: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    exp: Date.now() + TOKEN_TTL_MS,
  };
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(encoded).digest('base64url');
  return `${encoded}.${sig}`;
}

export function verifySessionToken(token: string): SessionPayload | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [encoded, sig] = parts;
  if (!encoded || !sig) return null;

  const expectedSig = crypto.createHmac('sha256', SESSION_SECRET).update(encoded).digest('base64url');
  const sigBuf = Buffer.from(sig, 'utf8');
  const expBuf = Buffer.from(expectedSig, 'utf8');
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as SessionPayload;
    if (!payload.sub || !payload.role || typeof payload.exp !== 'number') {
      return null;
    }
    if (Date.now() > payload.exp) {
      return null;
    }
    if (payload.sub !== 'env-admin') {
      const db = loadDatabase();
      const user = db.users.find((u) => u.id === payload.sub && u.active);
      if (!user) return null;
    }
    return payload;
  } catch {
    return null;
  }
}

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Sesi login diperlukan. Silakan masuk terlebih dahulu.' });
    return;
  }
  const token = header.slice('Bearer '.length).trim();
  const payload = verifySessionToken(token);
  if (!payload) {
    res.status(401).json({ error: 'Sesi login tidak valid atau telah berakhir.' });
    return;
  }
  req.authUser = payload;
  next();
}

export function requireAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  if (!req.authUser) {
    res.status(401).json({ error: 'Sesi login diperlukan.' });
    return;
  }
  if (req.authUser.role !== 'admin') {
    res.status(403).json({ error: 'Akses ditolak. Fitur ini khusus akun Admin.' });
    return;
  }
  next();
}
