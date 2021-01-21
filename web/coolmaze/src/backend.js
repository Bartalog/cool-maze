let backend = "https://cool-maze.uc.r.appspot.com";
// let backend = "http://localhost:8080";
// let backend = "http://192.168.1.80:8080";
// let backend = "https://dev-dot-cool-maze.uc.r.appspot.com";

// Google App Engine sometimes causes "cold start" problems
// (a few hundred ms delay for a Go backend), which we want
// to mitigate by sending a wakeup/warmup request as early as
// possible.
// The request may be slow or fast, anyway we don't need to 
// wait for the response.
function wakeUp(chanID){
    var wakeup = new XMLHttpRequest();
    var wuEndpoint = backend + "/wakeup";
    var wuParam = "qrKey=" + chanID;
    wakeup.open("POST", wuEndpoint, true);
    wakeup.setRequestHeader("Content-type", "application/x-www-form-urlencoded");
    wakeup.send( wuParam );
}

// Tell the server that the resource was sucessfully received by client.
// Same acknowledgement for Single and Multi.
// We don't need to wait for the response.
function ack(qrKey, actionID, qrToNotifDuration, qrToCastDuration, fetchDuration, decryptDuration) {
    var ack = new XMLHttpRequest();
    var endpoint = backend + "/ack";
    var params = "qrKey=" + qrKey + "&actionid=" + actionID;
    if(qrToNotifDuration)
        params += "&qrttnotif=" + qrToNotifDuration;
    if(qrToCastDuration)
        params += "&qrttcast=" + qrToCastDuration;
    if(decryptDuration)
        params += "&ttd=" + decryptDuration;
    if(fetchDuration)
        params += "&ttf=" + fetchDuration;
    ack.open("POST", endpoint, true);
    ack.setRequestHeader("Content-type", "application/x-www-form-urlencoded");
    ack.send( params );
    console.debug("Acked actionID " + actionID);

    // TODO send 2 acks:
    // - 1 when resourceURL successfully received
    // - 1 when resource successfully loaded
}

export const wakeUpBackend = wakeUp;
export const ackBackend = ack;