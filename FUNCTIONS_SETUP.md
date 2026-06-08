# Firebase Cloud Functions — Block Battle

Economy, premium IAP, and leaderboard writes are enforced server-side.

## Deploy

```bash
cd functions
npm install
cd ..
firebase deploy --only functions,firestore:rules
```

## Google Play IAP verification

Set the Play Console service account JSON for the function runtime:

```bash
firebase functions:secrets:set PLAY_SERVICE_ACCOUNT_JSON
# Paste minified service account JSON when prompted
```

Or for local emulator, export `PLAY_SERVICE_ACCOUNT_JSON` in `functions/.env`.

Without this secret, `verifyPlayPurchase` fails in production (emulator allows verify when `FUNCTIONS_EMULATOR=true`).

## Client

The web app loads `firebase-functions-compat` and calls callables via [`public/js/economy-api.js`](public/js/economy-api.js).

After deploy, coin shop, quests, daily rewards, and IAP require Functions to be available.
