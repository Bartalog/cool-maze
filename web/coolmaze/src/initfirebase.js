import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyCtxd4KFpIQOsfWUQ3YRpxBxvx9Hf8tD-g",
  authDomain: "cool-maze.firebaseapp.com",
  projectId: "cool-maze",
  storageBucket: "cool-maze.firebasestorage.app",
  messagingSenderId: "1012380534553",
  appId: "1:1012380534553:web:5cb3e9c7f9d1d01b786788"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, "actions-eu");