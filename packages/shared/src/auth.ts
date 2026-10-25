import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

export type UserRole = 'customer' | 'admin';

export interface Session {
  token: string;
  userId: string;
  email: string;
  role: UserRole;
  createdAt: string;
}

/** Cost parameter for scrypt. 2^14 = 16384 — fast enough for dev, strong enough for the lab. */
const SCRYPT_COST = 14;

/** Generates a random salt and returns a scrypt hash of the password. */
export function hashPassword(password: string): { salt: string; hash: string } {
  const salt = randomBytes(16).toString('hex');
  const derived = scryptSync(password, salt, 64, { cost: 1 << SCRYPT_COST });
  return { salt, hash: derived.toString('hex') };
}

/** Compares a plaintext password against a stored salt+hash. */
export function verifyPassword(
  password: string,
  salt: string,
  hash: string,
): boolean {
  try {
    const derived = scryptSync(password, salt, 64, { cost: 1 << SCRYPT_COST });
    return timingSafeEqual(Buffer.from(hash, 'hex'), derived);
  } catch {
    return false;
  }
}

/** Generates an opaque session token. */
export function generateSessionToken(): string {
  return randomBytes(32).toString('hex');
}

/** In-memory session store used by user-service. */
export class SessionStore {
  private readonly sessions = new Map<string, Session>();

  create(userId: string, email: string, role: UserRole): Session {
    const token = generateSessionToken();
    const session: Session = {
      token,
      userId,
      email,
      role,
      createdAt: new Date().toISOString(),
    };
    this.sessions.set(token, session);
    return session;
  }

  get(token: string): Session | undefined {
    return this.sessions.get(token);
  }

  destroy(token: string): boolean {
    return this.sessions.delete(token);
  }

  clear(): void {
    this.sessions.clear();
  }

  size(): number {
    return this.sessions.size;
  }
}

export function requireRole(allowed: UserRole[]) {
  return (session: Session | undefined): { ok: true; session: Session } | { ok: false; status: number; code: string; message: string } => {
    if (!session) {
      return { ok: false, status: 401, code: 'UNAUTHORIZED', message: 'Authentication required' };
    }
    if (!allowed.includes(session.role)) {
      return { ok: false, status: 403, code: 'FORBIDDEN', message: 'Insufficient privileges' };
    }
    return { ok: true, session };
  };
}
