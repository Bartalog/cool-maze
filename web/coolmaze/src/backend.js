import {genRandomTransientClientName} from './qrkey.js';
import Cookies from 'js-cookie';
import {PusherTechName} from './serverpush.js';

let mainDomain = "https://coolmaze.io";
let backend = "https://cool-maze.uc.r.appspot.com";
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
    var wuEndpoint = mainDomain + "/wakeup";
    var wuParam = "qrKey=" + chanID;
    wuParam += `&push=${PusherTechName}`;
    //wuParam += `&ctn=${transient}`; // For local dev only, as cookies are difficult between localhost:3000 and localhost:8080
    wakeup.open("POST", wuEndpoint, true);
    wakeup.setRequestHeader("Content-type", "application/x-www-form-urlencoded");
    wakeup.send( wuParam );
}

// Tell the server that the resource was sucessfully received by client.
// Same acknowledgement for Single and Multi.
// We don't need to wait for the response.
function ack(qrKey, actionID, qrToNotifDuration, qrToCastDuration, prefetchDuration, fetchDuration, decryptDuration) {

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
    var endpoint = mainDomain + "/ack";
    var params = "qrKey=" + qrKey + "&actionid=" + actionID;
    if(qrToNotifDuration)
        params += "&qrttnotif=" + qrToNotifDuration;
    if(qrToCastDuration)
        params += "&qrttcast=" + qrToCastDuration;
    if(decryptDuration)
        params += "&ttd=" + decryptDuration;
    if(prefetchDuration)
        params += "&ttpf=" + prefetchDuration;
    if(fetchDuration)
        params += "&ttf=" + fetchDuration;
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        // dark mode!
        params += "&dark=1";
    }
    params += `&push=${PusherTechName}`;
    //params += `&ctn=${transient}`; // For local dev only, as cookies are difficult between localhost:3000 and localhost:8080
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
function partialAck(qrKey, actionID, multiIndex, multiCount, prefetchDuration, fetchDuration, decryptDuration) {
    var ack = new XMLHttpRequest();
    var endpoint = backend + "/partial-ack";
    var params = `qrKey=${qrKey}`
                    + `&actionid=${actionID}`
                    + `&multiIndex=${multiIndex}`
                    + `&multiCount=${multiCount}`
                    + `&ttd=${decryptDuration}`
                    + `&push=${PusherTechName}`;
    if(prefetchDuration)
        params += `&ttpf=${prefetchDuration}`;
    if(fetchDuration)
        params += `&ttf=${fetchDuration}`;
    ack.open("POST", endpoint, true);
    ack.setRequestHeader("Content-type", "application/x-www-form-urlencoded");
    ack.send( params );
    console.debug(`Partial acked ${multiIndex}/${multiCount} for actionID ${actionID}`);
}

function usingFeature(what) {
    fetch(`${backend}/using/web/${what}`, {method: "POST"});
}

export const wakeUpBackend = wakeUp;
export const ackBackend = ack;
export const partialAckBackend = partialAck;
export const using = usingFeature;
export const backendHost = backend;