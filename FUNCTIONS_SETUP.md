# Firebase Cloud Functions — Block Battle

Economy, premium IAP, and leaderboard writes are enforced server-side.

## Deploy

```bash
cd functions
npm install
cd ..
firebase deploy --only functions,firestore:rules,firestore:indexes
```

## Google Play IAP verification

Set the Play Console service account JSON for the function runtime:

```bash
firebase functions:secrets:set PLAY_SERVICE_ACCOUNT_JSON
# Paste minified service account JSON when prompted
firebase functions:secrets:set MATCH_TICKET_SECRET
# Paste a random value of at least 32 characters when prompted
```

Or for local emulator, export `PLAY_SERVICE_ACCOUNT_JSON` in `functions/.env`.

Without `PLAY_SERVICE_ACCOUNT_JSON`, `verifyPlayPurchase` fails in production (emulator allows verify when `FUNCTIONS_EMULATOR=true`).

`MATCH_TICKET_SECRET` must be a random value of at least 32 characters. Add the exact same value to the Render service environment so the game server can sign online match results and Cloud Functions can verify them.

## Client

The web app loads `firebase-functions-compat` and calls callables via [`public/js/economy-api.js`](public/js/economy-api.js).

After deploy, coin shop, quests, daily rewards, and IAP require Functions to be available.
