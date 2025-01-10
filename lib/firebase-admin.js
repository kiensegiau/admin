import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { getStorage } from "firebase-admin/storage";

const initializeFirebaseAdmin = () => {
  if (!process.env.FIREBASE_ADMIN_PROJECT_ID) {
    throw new Error("FIREBASE_ADMIN_PROJECT_ID is not set");
  }
  if (!process.env.FIREBASE_ADMIN_CLIENT_EMAIL) {
    throw new Error("FIREBASE_ADMIN_CLIENT_EMAIL is not set");
  }
  if (!process.env.FIREBASE_ADMIN_PRIVATE_KEY) {
    throw new Error("FIREBASE_ADMIN_PRIVATE_KEY is not set");
  }

  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY.replace(/\\n/g, "\n");
  
  return {
    credential: cert({
      projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: privateKey,
    }),
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  };
};

if (!getApps().length) {
  try {
    console.log("Khởi tạo Firebase Admin...");
    const config = initializeFirebaseAdmin();
    initializeApp(config);
    console.log("Khởi tạo Firebase Admin thành công");
  } catch (error) {
    console.error("Lỗi chi tiết khi khởi tạo Firebase Admin:", error);
    throw error; // Re-throw để biết được lỗi ở môi trường production
  }
}

const db = getFirestore();
const auth = getAuth();
const storage = getStorage();

export { db, auth, storage };
