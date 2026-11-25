import jwt from 'jsonwebtoken';
import { ENV } from '../config/env.js';

export interface AuthTokenPayload {
  userId: string;
  username: string;
}

export function signToken(payload: AuthTokenPayload): string {
  return jwt.sign(payload, ENV.JWT_SECRET, { expiresIn: '30d' });
}

export function verifyToken(token: string): AuthTokenPayload | null {
  try {
    return jwt.verify(token, ENV.JWT_SECRET) as AuthTokenPayload;
  } catch {
    return null;
  }
}
