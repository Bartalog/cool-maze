import {genRandomTransientClientName} from './qrkey.js';
import Cookies from 'js-cookie';
import {PusherTechName} from './serverpush.js';

let mainDomain = "https://coolmaze.io";
//let mainDomain = "https://dev-dot-cool-maze.uc.r.appspot.com";

// The historical domain "appspot.com" is coupled to App Engine.
// 2025-02: To prepare a migration to Cloud Run, we now use the subdomain "backend.coolmaze.io" for all the call to
// the backend.
let backend = "https://backend.coolmaze.io";
// let backend = "https://backend-1012380534553.us-central1.run.app";
// let backend = "https://coolmaze.io";
//let backend = "https://cool-maze.uc.r.appspot.com";
// let mainDomain = "http://localhost:8080";
// let backend = "http://localhost:8080";
// let backend = "http://192.168.1.16:8080";
// let backend = "https://dev-dot-cool-maze.uc.r.appspot.com";
// let backend = "https://push-via-firestore-dot-cool-maze.appspot.com";

// Google App Engine sometimes causes "cold start" problems
// (a few hundred ms delay for a Go backend), which we want
// to mitigate by sending a wakeup/warmup request as early as
// possible.
// The request may be slow or fast, anyway we don't need to 
// wait for the response.
function wakeUp(chanID){

    // issues/514
    // Generate and register a transient client name, to get a chance to receive
    // pre-cast data and download early, for performance.
    let transient = Cookies.get('ctn');
    if( !transient ) {
        transient = genRandomTransientClientName();
        console.debug(`Registering new transient name ${transient}`)
        Cookies.set('ctn', transient, { expires: 1.5 });  // 36h
        // Cookies.set('ctn', transient, { expires: 1.5, domain: 'localhost:8080' });  // For local dev
    }

    var wakeup = new XMLHttpRequest();
    var wuEndpoint = backend + "/wakeup";
    var wuParam = "qrKey=" + chanID;
    wuParam += `&push=${PusherTechName}`;
    // 2025-03+ problem: subdomains coolmaze.io and backend.coolmaze.io don't play
    // nicely together with cookie. Passing ctn as query param.
    wuParam += `&ctn=${transient}`;
    wakeup.open("POST", wuEndpoint, true);
    wakeup.setRequestHeader("Content-type", "application/x-www-form-urlencoded");
    wakeup.send( wuParam );
}

// Tell the server that the resource was sucessfully received by client.
// Same acknowledgement for Single and Multi.
// We don't need to wait for the response.
function ack(qrKey, actionID, durations, singleFilenameIsUnknown, qrSize) {

    // issues/514
    // Generate and register a transient client name, to get a chance to receive
    // pre-cast data and download early, for performance.
    let transient = Cookies.get('ctn');
    if( !transient ) {
        transient = genRandomTransientClientName();
        console.debug(`Registering new transient name ${transient}`)
        Cookies.set('ctn', transient, { expires: 1.5 });  // 36h
        //Cookies.set('ctn', transient, { expires: 1.5, domain: 'localhost:8080' });  // For local dev
    }

    var ack = new XMLHttpRequest();
    var endpoint = backend + "/ack";
    var params = "qrKey=" + qrKey + "&actionid=" + actionID;

    if(durations["qrToNotif"])
        params += "&qrttnotif=" + durations["qrToNotif"];
    if(durations["qrToCast"])
        params += "&qrttcast=" + durations["qrToCast"];
    if(durations["decrypt"])
        params += "&ttd=" + durations["decrypt"];
    if(durations["prefetch"])
        params += "&ttpf=" + durations["prefetch"];
    if(durations["fetch"])
        params += "&ttf=" + durations["fetch"];
    if(durations["webrtcSDPExchange"])
        params += "&ttrtcx=" + durations["webrtcSDPExchange"];

    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        // dark mode!
        params += "&dark=1";
    }
    params += `&push=${PusherTechName}`;
    if(singleFilenameIsUnknown) {
        // If the original filename could not be determined, inform the backend
        // (even if the root cause of the problem is in the mobile app)
        params += `&filenameUnknown=1`;
    }
    params += `&qrsize=` + qrSize;
    // 2025-03+ problem: subdomains coolmaze.io and backend.coolmaze.io don't play
    // nicely together with cookie. Passing ctn as query param.
    params += `&ctn=${transient}`;
    ack.open("POST", endpoint, true);
    ack.setRequestHeader("Content-type", "application/x-www-form-urlencoded");
    ack.send( params );
    console.debug("Acked actionID " + actionID);

    // TODO send 2 acks:
    // - 1 when resourceURL successfully received
    // - 1 when resource successfully loaded
}

// Tell the server that 1 resource was sucessfully received by client,
// in a multi share action.
// We don't need to wait for the response.
function partialAck(qrKey, actionID, multiIndex, multiCount, durations, filenameIsUnknown) {
    var ack = new XMLHttpRequest();
    var endpoint = backend + "/partial-ack";
    var params = `qrKey=${qrKey}`
                    + `&actionid=${actionID}`
                    + `&multiIndex=${multiIndex}`
                    + `&multiCount=${multiCount}`
                    + `&push=${PusherTechName}`;

    if(durations["prefetch"])
        params += "&ttpf=" + durations["prefetch"];
    if(durations["fetch"])
        params += "&ttf=" + durations["fetch"];
    if(durations["decrypt"])
        params += "&ttd=" + durations["decrypt"];
    if(filenameIsUnknown) {
        // If the original filename could not be determined, inform the backend
        // (even if the root cause of the problem is in the mobile app)
        params += `&filenameUnknown=1`;
    }
    ack.open("POST", endpoint, true);
    ack.setRequestHeader("Content-type", "application/x-www-form-urlencoded");
    ack.send( params );
    console.debug(`Partial acked ${multiIndex}/${multiCount} for actionID ${actionID}`);
}

function usingFeature(what) {
    fetch(`${backend}/using/web/${what}`, {method: "POST"});
}

function fence(actionid, chanID) {
    if(!actionid) {
        return;
    }

    // This request does not use the same backend hostname as the other requests.
    // It uses functionality only available in App Engine, hence the explicit App Engine domain.
    let fenceBackendHost = "https://cool-maze.appspot.com";

    var fence = new XMLHttpRequest();
    var fEndpoint = fenceBackendHost + "/fence";
    var fParam = "actionid=" + actionid;
    fParam += `&qrKey=${chanID}`;
    fence.open("POST", fEndpoint, true);
    fence.setRequestHeader("Content-type", "application/x-www-form-urlencoded");
    fence.send( fParam );
}

function warning(actionid, chanKey, message) {
    // Call warning to signal a non-blocking error to the backend.
    // actionID may be null if it has not been provided by the backend yet.
    // chanKey must not contain any secret.
    const data = new URLSearchParams();
    data.append("actionid", actionid);
    data.append("chan", chanKey);
    data.append("message", message);
    fetch(`${backend}/warning/web`, {
        method: "POST",
        body: data,
    });
}

function error(actionid, chanKey, message) {
    // Call error to signal a failure to the backend.
    // actionID may be null if it has not been provided by the backend yet.
    // chanKey must not contain any secret.
    const data = new URLSearchParams();
    data.append("actionid", actionid);
    data.append("chan", chanKey);
    data.append("message", message);
    fetch(`${backend}/error/web`, {
        method: "POST",
        body: data,
    });
}

export const wakeUpBackend = wakeUp;
export const ackBackend = ack;
export const partialAckBackend = partialAck;
export const fenceBackend = fence;
export const using = usingFeature;
export const backendHost = backend;
export const warningBackend = warning;
export const errorBackend = error;