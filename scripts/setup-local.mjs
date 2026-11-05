import { writeFile, access } from 'node:fs/promises';
const files = {
  '.env.local': 'VITE_FIREBASE_API_KEY=demo-key\nVITE_FIREBASE_AUTH_DOMAIN=demo-soundroom.firebaseapp.com\nVITE_FIREBASE_PROJECT_ID=demo-soundroom\nVITE_FIREBASE_STORAGE_BUCKET=demo-soundroom.appspot.com\nVITE_FIREBASE_APP_ID=demo-app\nVITE_API_BASE_URL=http://127.0.0.1:5001/demo-soundroom/us-central1/api\nVITE_USE_EMULATORS=true\n',
  'functions/.env.local': 'ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173\nAPP_ENV=local\nDEPLOY_COMMIT=local\n',
};
for (const [path, content] of Object.entries(files)) {
  try { await access(path); console.log(`${path} already exists; left unchanged.`); }
  catch { await writeFile(path, content, { flag: 'wx' }); console.log(`Created ignored ${path}`); }
}
console.log('Run npm run build:api, npm run emulators, then npm run seed:local in another terminal. Restart npm run dev after setting environment variables.');
