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

let app, db;

function initFirebase() {
  // Firestore needs Firebase init
  app = initializeApp(firebaseConfig);
  db = getFirestore(app);
}

function firestoreListenToCollection(channelName, handler) {
    const path = `channels/${channelName}/messages`;
    let m = collection(db, path);

    console.debug("Subscribing to Firestore collection", path);
    const unsubscribe = onSnapshot(m, (snapshot) => {
        snapshot.docChanges().forEach( (change) => {
          if (change.type === "added") {
            console.debug("Received Firestore data:");
            // console.log("Document", change.doc.id);
            let data = change.doc.data();
            console.debug(data);
            // Run the callback with the message payload!
            handler(data);
          }
      });
    });

    const unsubscribe2 = () => {
      console.log("Unsubscribing from Firestore collection", path);
      unsubscribe();
    }

    // Provide the "close channel" function
    return unsubscribe2;
}

export const Init = initFirebase;
export const ListenToChannel = firestoreListenToCollection;