# CaSTIno — Plateforme Casino Virtuel & Case Opening Temps Réel (Stake × Hellcase)

> **100% Monnaie Fictive (Play Money) — But ludique et éducatif.**

## Lancer en Local (1 minute)

```bash
npm install
npm run setup
npm run dev
```

- **Frontend :** http://localhost:5173
- **Backend API & Socket.io :** http://localhost:4000

## Héberger Gratuitement en Multijoueur (Comptes Persistants + Temps Réel)

Pour que vos amis puissent créer de vrais comptes, discuter dans le chat global, ouvrir des caisses et jouer ensemble sur la même courbe **Crash** en direct :

1. **Base de données PostgreSQL gratuite (Neon.tech) :**
   - Créez un compte gratuit sur [neon.tech](https://neon.tech) et créez un projet.
   - Copiez l'URL de connexion PostgreSQL (`postgresql://...`).
2. **Serveur Full-Stack WebSockets + Frontend sur Render (Gratuit) :**
   - Poussez ce dossier sur un dépôt **GitHub**.
   - Sur [render.com](https://render.com), cliquez sur **New + → Blueprint** (qui détectera automatiquement `render.yaml`), ou **New Web Service** :
     - **Build Command :** `npm install && npm run build:cloud`
     - **Start Command :** `npm run start`
   - Ajoutez la variable d'environnement `DATABASE_URL` avec votre URL Neon PostgreSQL.
   - Le serveur Express sert automatiquement le Frontend compilé (`apps/web/dist`), l'API `/api/*` et les WebSockets `Socket.io` sur **une seule URL HTTPS publique** !
