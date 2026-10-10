# הבית שלנו (שם זמני)

אפליקציה משפחתית: רשימת קניות משותפת שעובדת גם בלי קליטה, ובהמשך משימות ויומן.
האפיון המלא: `spec/initial-spec.md` בתיקיית הפרויקט המשותפת.

## Stack
React + Vite PWA, Firebase (Auth, Firestore with persistent local cache, Hosting) on the free Spark plan.

## Development
```
npm install
npm run emulators              # local Auth + Firestore emulators
VITE_USE_EMULATORS=1 npm run dev   # app against the emulators (test login enabled)
```

## Tests
```
npm run test:rules   # security rules: family separation, invite → request → approval
CHROMIUM_PATH=/path/to/chrome npm run test:e2e   # two simulated phones: offline, restart, sync, merge rules
```

## Deploy
Copy `.env.example` to `.env.local` and fill in the Firebase web config, then:
```
npm run build
npx firebase deploy --only firestore:rules,hosting --project <project-id>
```
