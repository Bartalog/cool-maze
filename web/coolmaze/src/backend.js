import {genRandomTransientClientName} from './qrkey.js';
import Cookies from 'js-cookie';
import {PusherTechName} from './serverpush.js';

let mainDomain = "https://coolmaze.io";
//let mainDomain = "https://dev-dot-cool-maze.uc.r.appspot.com";

// The historical domain "appspot.com" is coupled to App Engine.
// 2025-02: To prepare a migration to Cloud Run, we now use the subdomain "backend.coolmaze.io" for all the call to
// the backend.
let backend = "https://" + process.env.REACT_APP_backend_domain;
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
function wakeUp(chanID, clientPrefix){

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

    const data = new URLSearchParams();
    data.append("chanid", chanID);
    data.append("push", PusherTechName);
    if(clientPrefix)
        data.append("client", clientPrefix);
    data.append("ctn", transient);
    fetch(`${backend}/wakeup`, {
        method: "POST",
        body: data,
    });
}

// Tell the server that the resource was sucessfully received by client.
// Same acknowledgement for Single and Multi.
// We don't need to wait for the response.
function ack(chanID, actionID, durations, singleFilenameIsUnknown, qrSize, clientPrefix) {

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

    function append(params, key, value) {
        // Add param only if not empty
        if(value)
            params.append(key, value);
    }

    const data = new URLSearchParams();
    append(data, "chanid", chanID);
    append(data, "actionid", actionID);
    append(data, "qrttnotif", durations["qrToNotif"]);
    append(data, "qrttcast", durations["qrToCast"]);
    append(data, "ttd", durations["decrypt"]);
    append(data, "ttpf", durations["prefetch"]);
    append(data, "ttf", durations["fetch"]);
    append(data, "ttrtcx", durations["webrtcSDPExchange"]);
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches)
        append(data, "dark", "1");
    append(data, "push", PusherTechName);
    if(singleFilenameIsUnknown){
        // If the original filename could not be determined, inform the backend
        // (even if the root cause of the problem is in the mobile app)
        append(data, "filenameUnknown", "1");
    }
    append(data, "qrsize", qrSize);
    append(data, "ctn", transient);
    append(data, "client", clientPrefix);
    fetch(`${backend}/ack`, {
        method: "POST",
        body: data,
    });


    console.debug("Acked actionID " + actionID);
}

// Tell the server that 1 resource was sucessfully received by client,
// in a multi share action.
// We don't need to wait for the response.
function partialAck(chanID, actionID, multiIndex, multiCount, durations, filenameIsUnknown) {
    var ack = new XMLHttpRequest();
    var endpoint = backend + "/partial-ack";
    var params = `chanid=${chanID}`
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

// Tell the server that 1 preview (thumb) was sucessfully received and decrypted by the.
// We don't need to wait for the response.
function previewAck(actionID, multiIndex, multiCount) {
    const data = new URLSearchParams();
    data.append("actionid", actionID);
    data.append("multiIndex", multiIndex);
    data.append("multiCount", multiCount);
    fetch(`${backend}/preview-ack`, {
        method: "POST",
        body: data,
    });
}

function usingFeature(what) {
    fetch(`${backend}/using/web/${what}`, {method: "POST"});
}

// Tell the backend that the desktop user closed the tab/window (or navigated away)
// while a share was still in progress, so that the ongoing action can be interrupted
// on the mobile side instead of letting the mobile wait until its own timeout.
//
// This is meant to be triggered from a `pagehide` handler. Two properties matter:
//   - We use navigator.sendBeacon (falling back to fetch keepalive): a plain fetch
//     issued during page teardown is frequently killed before it leaves the browser,
//     whereas a beacon is queued and guaranteed the delivery attempt.
//   - `pagehide` does NOT fire on tab switching or minimizing, only on real teardown
//     (tab close, window close, navigation away, reload). So this never emits a
//     spurious halt for a user who merely switched to another tab.
// chanKey is the sha256-derived channel id, never the raw secret, so it is safe to send.
function tabClosed(actionID, chanKey) {
    cancelAction(actionID, chanKey, "tab closed");
}

function userCancel(actionID, chanKey) {
    cancelAction(actionID, chanKey, "browser user canceled");
}

function cancelAction(actionID, chanKey, message) {
    if(!actionID) {
        // No share that the backend knows about yet: nothing to interrupt.
        return;
    }
    const data = new URLSearchParams();
    data.append("actionid", actionID);
    data.append("chan", chanKey);
    data.append("message", message);
    const endpoint = `${backend}/target-cancel`;
    if(navigator.sendBeacon) {
        navigator.sendBeacon(endpoint, data);
    } else {
        // keepalive lets the request outlive the page even without sendBeacon.
        fetch(endpoint, {method: "POST", body: data, keepalive: true});
    }
}

function logMessage(actionID, chanKey, message, level) {
    const data = new URLSearchParams({
        "component": "frontend", // TODO version of the frontend?
        "level": level,
        "actionid": actionID,
        "chan": chanKey,
        "message": message
    });
    fetch(`${backend}/log`, {
        method: "POST",
        body: data,
    });
}

function warning(actionID, chanKey, message) {
    // Call warning to signal a non-blocking error to the backend.
    // actionID may be null if it has not been provided by the backend yet.
    // chanKey must not contain any secret.
    logMessage(actionID, chanKey, message, "warning");
}

function error(actionID, chanKey, message) {
    // Call error to signal a failure to the backend.
    // actionID may be null if it has not been provided by the backend yet.
    // chanKey must not contain any secret.
    logMessage(actionID, chanKey, message, "error");
}

export const wakeUpBackend = wakeUp;
export const ackBackend = ack;
export const partialAckBackend = partialAck;
export const previewAckBackend = previewAck;
export const using = usingFeature;
export const tabClosedBeacon = tabClosed;
export const userCancelBeacon = userCancel;
export const backendHost = backend;
export const warningBackend = warning;
export const errorBackend = error;