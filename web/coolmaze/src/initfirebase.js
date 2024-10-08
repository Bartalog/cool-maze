import { initializeApp } from "firebase/app";
import { getFirestore, collection, onSnapshot } from "firebase/firestore";


const firebaseConfig = {
  apiKey: "AIzaSyAzaeJ9eRP9ikP8Phzf6QjuIh-4ZwVHX7E",
  authDomain: "cool-maze-push.firebaseapp.com",
  projectId: "cool-maze-push",
  storageBucket: "cool-maze-push.appspot.com",
  messagingSenderId: "471489957828",
  appId: "1:471489957828:web:06d5543fef7c3b4ce11e91"
};

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);