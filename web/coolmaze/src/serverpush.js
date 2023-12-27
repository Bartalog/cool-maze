import {Init as FirestoreInit, ListenToChannel as FirestoreListenToChannel} from './serverpush_firestore.js';
import {Init as PusherComInit, ListenToChannel as PusherComListenToChannel} from './serverpush_pusher_com.js';

// Hard-coded choice between 2 server push tech: Firestore realtime updates, or Pusher.com

//
// Push via Firestore: uncomment below
//
export const InitPushComponent = FirestoreInit;
export const ListenToChannel = FirestoreListenToChannel;
export const PusherTechName = "firestore";

//
// Push via Pusher.com: uncomment below
//
// export const InitPushComponent = PusherComInit;
// export const ListenToChannel = PusherComListenToChannel;
// export const PusherTechName = "pusher.com";

//
// Disable all?? uncomment below
//
// export const InitPushComponent = () => {console.warn("server push init: no-op")};
// export const ListenToChannel = () => {console.warn("server push listen: no-op"); return ()=>{}; };;
// export const PusherTechName = "no server push yet";