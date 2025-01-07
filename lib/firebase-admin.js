import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const firebaseAdminConfig = {
  credential: cert({
    projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
    clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n"),
  }),
  databaseURL: `https://${process.env.FIREBASE_ADMIN_PROJECT_ID}.firebaseio.com`,
};

console.log("Firebase Admin Config:", firebaseAdminConfig);

let app;
try {
  const apps = getApps();
  app = !apps.length ? initializeApp(firebaseAdminConfig) : apps[0];
} catch (error) {
  console.error('Failed to initialize Firebase Admin SDK:', error);
  throw error;  
}

const adminDb = getFirestore(app);

async function getAccessToken() {
  const accessToken = await app.credential.getAccessToken();
  return accessToken.access_token;
}

export { adminDb, getAccessToken };
