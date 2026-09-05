# Déployer l'app web (PWA) — Cloudflare

L'app web / PWA est hébergée sur **Cloudflare Workers** (assets statiques).

| | |
|---|---|
| URL en ligne | https://solferme.barryedu56.workers.dev |
| Projet Cloudflare | `solferme` (compte `barryedu56@gmail.com`) |
| Config | `wrangler.jsonc` (`assets.directory = dist`) |
| Compte requis | Cloudflare (gratuit), connecté via `npx wrangler login` une fois |

## ⚠️ Le déploiement n'est PAS automatique

Un `git push` **ne redéploie pas** le web. Il faut lancer la commande à la main
après chaque changement frontend que tu veux voir en ligne.

## Redéployer

Depuis `frontend/` :

```bash
npm run deploy
```

Cette commande enchaîne :
1. `npx expo export -p web` → génère `dist/`
2. `node scripts/build-pwa-manifest.js` → liste tous les fichiers pour le
   service worker (démarrage hors-ligne) + tamponne `sw.js` avec un id de build
3. `wrangler deploy` → envoie `dist/` sur Cloudflare

Durée : ~3-4 min. À la fin, l'URL et le `Current Version ID` s'affichent.

## Vérifier

- Ouvre https://solferme.barryedu56.workers.dev — recharge avec **Ctrl+Shift+R**
  (le service worker met en cache agressivement).
- Pour tester le mode hors-ligne : ouvre le site, laisse-le charger, coupe le
  Wi-Fi, ferme/rouvre l'onglet → doit toujours afficher l'app.

## Variables

`npm run deploy` lit `frontend/.env` :
- `EXPO_PUBLIC_API_URL` → l'API backend (PythonAnywhere)
- `EXPO_PUBLIC_SENTRY_DSN` → optionnel ; sinon le DSN par défaut dans `App.tsx`
  s'applique (non sensible).

## Rollback

Dashboard Cloudflare → Workers & Pages → **solferme** → onglet **Deployments** →
sur une version précédente → **⋯ → Rollback to this version**.

## Plus tard : déploiement automatique (CI)

Cloudflare peut se connecter au dépôt GitHub pour redéployer à chaque push
(Workers & Pages → solferme → Settings → **Build** → *Connect to Git*).
Commande de build : `npm run deploy` sans la partie `wrangler deploy`
(Cloudflare s'en charge), output `dist`. Pas encore configuré.
