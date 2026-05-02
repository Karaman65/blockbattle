# Block Battle

Online multiplayer block puzzle game powered by Express, Socket.IO and Firebase.

## Features

- Solo endless and level-based gameplay
- Online rooms and quick-match modes (score/time)
- Firebase Auth + Firestore player data
- Leaderboard and match history
- PWA support with service worker cache
- Capacitor-ready mobile packaging

## Local Setup

1. Install dependencies:

```bash
npm install
```

2. Start development server:

```bash
npm run dev
```

3. Open:

`http://localhost:3001`

## Environment Variables

- `PORT` (optional, default `3001`)
- `ALLOWED_ORIGINS` (optional, comma-separated list)
  - Example: `https://example.com,https://www.example.com`
  - If omitted, all origins are allowed (development fallback).
- Copy `.env.example` and set your production values.

## Firebase

Client Firebase settings are in `public/js/firebase-config.js`.

Security rules template is included in `firestore.rules`.
Deploy rules with Firebase CLI:

```bash
firebase deploy --only firestore:rules
```

`firebase.json` is included so the command uses local `firestore.rules`.

## Verification Commands

```bash
npm run check:syntax
npm run health:local
```

## Production Notes

- Set strict `ALLOWED_ORIGINS` in production.
- Keep Firestore rules locked to signed-in users and ownership checks.
- Re-deploy service worker updates when changing core assets.
- Follow `DEPLOY_CHECKLIST.md` before going live.
