// The WebRTC setup is loosely derived from https://webrtc.org/getting-started/firebase-rtc-codelab
// and the branch "Solution" of https://github.com/webrtc/FirebaseRTC

import { db } from './initfirebase.js';
import { collection, onSnapshot } from "firebase/firestore";
import { doc, getDoc, updateDoc, addDoc } from "firebase/firestore";

const configuration = {
    iceServers: [
      {
        urls: [
          'stun:stun1.l.google.com:19302',
          'stun:stun2.l.google.com:19302',
        ],
      },
    ],
    iceCandidatePoolSize: 10,
};

let remoteShareConnection;
let webrtcStartTime;
let webrtcSDPExchangeSuccessTime;
let receiveChannel;
let receiveChannelTime;
let totalReceived = 0;
// resources will contain the metadata, then also the data
let resources;
let multiIndex = 0;
let multiCount;
let progressHandler;
let successHandler;

async function receiveData(channelName, doc, progress, success) {
  if(!doc.offer) {
    console.error("Aborting, this doc has no offer:");
    console.error(doc);
    return;
  }
  progressHandler = progress;
  successHandler = success;

  remoteShareConnection = new RTCPeerConnection(configuration);
  console.log('Created remote peer connection object remoteShareConnection');
  
  //
  // Collect callee ICE candidates (ours)
  // and write them to Firestore
  //
  const calleeCandidatesPath = `${doc.ref.path}/calleeCandidates`;
  const calleeCandidatesCollection = collection(db, calleeCandidatesPath);
  remoteShareConnection.addEventListener('icecandidate', async event => {
    //console.log(event);
    if (!event.candidate) {
      console.log('Got final callee candidate!');
      return;
    }
    console.log('Got callee candidate: ', event.candidate);
    addDoc(calleeCandidatesCollection, event.candidate.toJSON());
  });
  
  // Create SDP answer
  const offer = doc.offer;
  console.log('Got offer:', offer);
  await remoteShareConnection.setRemoteDescription(new RTCSessionDescription(offer));
  const answer = await remoteShareConnection.createAnswer();
  console.log('Created answer:', answer);
  await remoteShareConnection.setLocalDescription(answer);
  const shareWithAnswer = {
    answer: {
      type: answer.type,
      sdp: answer.sdp,
    },
  };
  await updateDoc(doc.ref, shareWithAnswer);
  

  // Listen for remote caller ICE candidates  (theirs)
  const callerCandidatesPath = `${doc.ref.path}/callerCandidates`;
  const callerCandidatesCollection = collection(db, callerCandidatesPath);
  let unsub = onSnapshot(callerCandidatesCollection, snapshot => {
        snapshot.docChanges().forEach(async change => {
            if (change.type === 'added') {
                let data = change.doc.data();
                console.log(`Got new remote (caller) ICE candidate: ${JSON.stringify(data)}`);
                await remoteShareConnection.addIceCandidate(new RTCIceCandidate(data));
            }
    });
  });

  remoteShareConnection.addEventListener('datachannel', receiveChannelCallback);
  // ...
}


function receiveChannelCallback(event) {
  receiveChannelTime = performance.now();
  webrtcSDPExchangeSuccessTime = receiveChannelTime;
  totalReceived = 0;
  console.log('Receive Channel Callback');
  receiveChannel = event.channel;
  receiveChannel.binaryType = 'arraybuffer';
  receiveChannel.onmessage = onReceiveMessageCallback;
  receiveChannel.onopen = onReceiveChannelStateChange;
  receiveChannel.onerror = onError;
}

function onReceiveMessageCallback(event) {
  let t = performance.now();
  let d = t - receiveChannelTime;
  totalReceived += event.data.byteLength;
  console.debug(`Received ${totalReceived} bytes in ${d}ms`);
  //console.log(typeof event.data);
  //console.log(event.data);
  let view = new Uint8Array(event.data);

  if(!resources) {
    // The very first message contains the JSON array of resources description
    let msg = new TextDecoder("utf-8").decode(view);
    resources = JSON.parse(msg);
    multiCount = resources.length;
    console.log("Received description for", multiCount, "resources");
    console.log(resources);
    for(let i=0;i<multiCount;i++) {
      resources[i].data = new ArrayBuffer(resources[i].Size);
      resources[i].bytesReceived = 0;
    }
  } else {
    // The subsequent messages contain file data
    if(resources[multiIndex].bytesReceived + event.data.byteLength > resources[multiIndex].Size)
      throw new Error (`unexpected ${event.data.byteLength} bytes for resource ${multiIndex}, exceeds size ${resources[multiIndex].Size}`);
    var src = view;
    var offset = resources[multiIndex].bytesReceived;
    var dst = new Uint8Array(resources[multiIndex].data, offset);
    dst.set(src);

    resources[multiIndex].bytesReceived += event.data.byteLength;
    let p = Math.floor( (resources[multiIndex].bytesReceived / resources[multiIndex].Size) * 100 );
    // console.log(`Received ${p}% of resource ${multiIndex}`);
    if(progressHandler)
      progressHandler(resources);

    if(resources[multiIndex].bytesReceived == resources[multiIndex].Size) {
      console.log(`Fully received resource ${multiIndex} (${resources[multiIndex].Size} bytes)`);
      multiIndex ++;
      receiveChannel.send(`Ack resource ${multiIndex}`);
      if(multiIndex == multiCount) {
        // Write final ack to the data channel,
        // so the mobile can vibrate and release the resources
        receiveChannel.send(`Ack all ${multiCount} resources`);
        if(successHandler) {
          // Time between "Start WebRTC" and "Finished downloading", which includes the
          // SDP exchange time before the download can start.
          let downloadSingleResourceDuration = Math.floor(t - webrtcStartTime);

          let webrtcSDPExchangeDuration = Math.floor(webrtcSDPExchangeSuccessTime - webrtcStartTime);
          successHandler(resources, downloadSingleResourceDuration, webrtcSDPExchangeDuration);
        }
      }
    }
  }

  if(event.data.byteLength < 250) {
    let msg = new TextDecoder("utf-8").decode(view);
    console.log(`Received Message ${msg}`);
    //alert(`Received Message:\n ${msg}`);
  } else 
    ; //alert(`Received Message:\n (${event.data.byteLength}) bytes`);
}


async function onReceiveChannelStateChange() {
    if (receiveChannel) {
      const readyState = receiveChannel.readyState;
      console.log(`Receive channel state is: ${readyState}`);
    //   if (readyState === 'open') {
    //     statsInterval = setInterval(displayStats, 500);
    //     await displayStats();
    //   }
    }
}

function onError(error) {
    if (receiveChannel) {
      console.error('Error in receiveChannel:', error);
      return;
    }
    console.log('Error in receiveChannel which is already closed:', error);
  }

// Once we call receiveData, we don't want to call it again on every change
// let busy = false;

// start means:
// - read offer from the mobile caller
// - create and upload answer
// - create and upload callee ICE candidates
// - listen to caller ICE candidates
function start(channelName, doc, progress, success) {
  webrtcStartTime = performance.now();
  receiveData(channelName, doc, progress, success);
}


export const StartWebRTC = start;