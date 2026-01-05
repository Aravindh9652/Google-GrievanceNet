import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";


// 🔥 Firebase Config (PASTE YOUR VALUES)
const firebaseConfig = {
  apiKey: "AIzaSyA1ZpenMqs24r7yGNZKyY6vOFjsjhDzM94",
  authDomain: "gemini-greivancenet.firebaseapp.com",
  projectId: "gemini-greivancenet",
  storageBucket: "gemini-greivancenet.appspot.com",
  messagingSenderId: "645029221074",
  appId: "1:645029221074:web:2fcf8daf3240c8440c930b",
};

const app = initializeApp(firebaseConfig);

// Export auth
export const auth = getAuth(app);

// 🗄️ Firestore Database
export const db = getFirestore(app);