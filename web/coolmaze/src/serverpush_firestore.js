import { db } from './initfirebase.js';
import { collection, onSnapshot } from "firebase/firestore";
import { doc, getDoc, updateDoc, addDoc } from "firebase/firestore";

function initFirestore() {
  // Nothing to do, Firebase is already initialized
}

function firestoreListenToCollection(channelName, handler) {
    const path = `channels/${channelName}/messages`;
    let m = collection(db, path);

    console.debug("Subscribing to Firestore collection", path);
    const unsubscribe = onSnapshot(m, (snapshot) => {
        snapshot.docChanges().forEach( (change) => {
          if (change.type === "added") {
            let data = change.doc.data();
            console.debug("Received Firestore data:");
            // console.log("Document", change.doc.id);
            console.debug(data); // warning: this is logging full thumbnail data
            data["ref"] = change.doc.ref; // Explicit ref path is useful later e.g. for WebRTC
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

export const Init = initFirestore;
export const ListenToChannel = firestoreListenToCollection;