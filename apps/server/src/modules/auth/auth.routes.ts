import crypto from 'node:crypto';
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { ECONOMY, type UserDTO } from '@castino/shared';
import type { User } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { signToken } from '../../lib/jwt.js';
import { optionalAuth, requireAuth } from '../../middlewares/auth.js';
import { ensureActiveSeed } from '../fairness/fairness.service.js';

export function toUserDTO(user: User): UserDTO {
  return {
    id: user.id,
    username: user.username,
    role: user.role as 'USER' | 'ADMIN',
    isGuest: user.isGuest,
    isBanned: user.isBanned,
    avatarSeed: user.avatarSeed,
    balance: user.balance,
    totalWagered: user.totalWagered,
    totalWon: user.totalWon,
    lastFaucetAt: user.lastFaucetAt ? user.lastFaucetAt.toISOString() : null,
    createdAt: user.createdAt.toISOString(),
  };
}

const registerSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3, 'Le pseudo doit contenir au moins 3 caractères.')
    .max(20, 'Le pseudo ne doit pas dépasser 20 caractères.')
    .regex(/^[a-zA-Z0-9_-]+$/, 'Utilisez uniquement des lettres, chiffres, _ ou -.'),
  password: z.string().min(4, 'Le mot de passe doit contenir au moins 4 caractères.').max(100),
});

const loginSchema = z.object({
  username: z.string().trim().min(1),
  password: z.string().min(1),
});

export const authRouter = Router();

// Création d'une session Invité persistante
authRouter.post('/guest', async (_req, res) => {
  try {
    const suffix = crypto.randomBytes(2).toString('hex').toUpperCase();
    let username = `Joueur_${suffix}`;

    const exists = await prisma.user.findUnique({ where: { username } });
    if (exists) {
      username = `Joueur_${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    }

    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          username,
          isGuest: true,
          avatarSeed: suffix,
          balance: ECONOMY.INITIAL_BALANCE,
        },
      });
      await ensureActiveSeed(tx, created.id);
      return created;
    });

    const token = signToken({ userId: user.id, username: user.username });
    res.json({ token, user: toUserDTO(user) });
  } catch (err) {
    console.error('Guest auth error:', err);
    res.status(500).json({ error: 'Impossible de créer le profil invité.' });
  }
});

// Inscription d'un vrai compte (ou conversion d'un compte Invité existant sans perte de solde/inventaire)
authRouter.post('/register', optionalAuth, async (req, res) => {
  try {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Données invalides.' });
      return;
    }

    const { username, password } = parsed.data;
    const passwordHash = await bcrypt.hash(password, 10);

    // Vérifier si le pseudo est déjà pris par un autre utilisateur
    const existingByName = await prisma.user.findFirst({
      where: {
        username: { equals: username },
      },
    });

    if (req.user) {
      const currentUser = await prisma.user.findUnique({ where: { id: req.user.userId } });
      if (currentUser && currentUser.isGuest) {
        if (existingByName && existingByName.id !== currentUser.id) {
          res.status(409).json({ error: 'Ce pseudo est déjà utilisé par un autre joueur.' });
          return;
        }
        const upgraded = await prisma.user.update({
          where: { id: currentUser.id },
          data: {
            username,
            passwordHash,
            isGuest: false,
            avatarSeed: username.slice(0, 6),
          },
        });
        const token = signToken({ userId: upgraded.id, username: upgraded.username });
        res.json({ token, user: toUserDTO(upgraded) });
        return;
      }
    }

    if (existingByName) {
      res.status(409).json({ error: 'Ce pseudo est déjà pris.' });
      return;
    }

    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          username,
          passwordHash,
          isGuest: false,
          avatarSeed: username.slice(0, 6),
          balance: ECONOMY.INITIAL_BALANCE,
        },
      });
      await ensureActiveSeed(tx, created.id);
      return created;
    });

    const token = signToken({ userId: user.id, username: user.username });
    res.json({ token, user: toUserDTO(user) });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Erreur lors de la création du compte.' });
  }
});

authRouter.post('/login', async (req, res) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Veuillez renseigner votre pseudo et mot de passe.' });
      return;
    }

    const { username, password } = parsed.data;
    const user = await prisma.user.findUnique({ where: { username } });
    if (!user || !user.passwordHash) {
      res.status(401).json({ error: 'Pseudo ou mot de passe incorrect.' });
      return;
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      res.status(401).json({ error: 'Pseudo ou mot de passe incorrect.' });
      return;
    }
    if (user.isBanned) {
      res.status(403).json({ error: 'Ce compte a été suspendu par un administrateur.' });
      return;
    }

    const token = signToken({ userId: user.id, username: user.username });
    res.json({ token, user: toUserDTO(user) });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Erreur lors de la connexion.' });
  }
});

authRouter.get('/me', requireAuth, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user!.userId } });
    if (!user) {
      res.status(404).json({ error: 'Utilisateur introuvable.' });
      return;
    }
    res.json({ user: toUserDTO(user) });
  } catch (err) {
    console.error('Auth me error:', err);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});
