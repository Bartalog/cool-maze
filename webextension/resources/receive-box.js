
var backend = "https://cool-maze.appspot.com";
var coolMazePusherAppKey = 'e36002cfca53e4619c15';
// Since #108, qrKey==chanID and it is random generated in JS.
var qrKey = "";
var chanID = "";
var pusher;
var channel;
var multiOpened = 0;

function showError(errmsg) {
  console.log("Error: " + errmsg)
  clearQR();
  var errorZone = document.getElementById("errors");
  errorZone.innerHTML = errmsg;
}

function render(colorDark){
  // QR-code has fixed size 400px
  var w = 400;
  var h = 400;
  var c = 400;

  var logo = document.getElementById("overprint-logo");
  if ( logo )
    logo.style.display = "none";
  clearQR();
  new QRCode("qrcode", {
    text: qrKey,
    width: c,
    height: c,
    colorDark : colorDark,
    colorLight : "white",
    correctLevel : QRCode.CorrectLevel.M
  });
  var qrcode = document.getElementById("qrcode");

  var cc = c/4;
  logo = document.getElementById("overprint-logo"); // has changed
  var bodyPad = 20; // weird.
  logo.style.width = cc + "px";
  logo.style.height = cc + "px";
  logo.style.top = (bodyPad + ((1.5)*cc)) + "px";
  logo.style.marginLeft = (-cc/2) + "px";
  //logo.style.display = "inline";
  window.setTimeout(function(){ logo.style.display = "inline"; }, 40);

}

function clearQR() {
  var node = document.getElementById("qrcode");
  while (node.firstChild) {
      node.removeChild(node.firstChild);
  }
  node.innerHTML='<img src="icons/red_arrow.png" id="overprint-logo" style="display: none;" />';
}

function startsWith(str, word) {
 return str.lastIndexOf(word, 0) === 0;
}

function show(id) {
  // Show either "qr-zone", or "help-contents", or "txt-msg-zone".
  var qrzone = document.getElementById("qr-zone");
  var msg = document.getElementById("txt-msg-zone");

  var dispQr = "none";
  var dispHelpContents = "none";
  var dispMsg = "none";
  var bgcolor = "#64d8ff";
  switch(id) {
    case "qr-zone":
      dispQr = "block";
      bgcolor = "white"; // or keep it always blue...?
      break;
    case "txt-msg-zone":
      dispMsg = "block";
      break;
  }
  qrzone.style.display = dispQr;
  msg.style.display = dispMsg;
  document.body.style.backgroundColor = bgcolor;
}

function genRandomQrKey() {
  var chars = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
  var M = chars.length; // 62
  var L = 11;
  var s = "";

  var crypto = window.crypto || window.msCrypto;
  if( crypto ) {
    var buf = new Uint8Array(L);
    window.crypto.getRandomValues(buf);
    for(var i=0; i<L; i++) {
      // 01234567 would be slightly more frequent, which is OK for our use case
      var j = buf[i] % M;
      s += chars.charAt(j);
    }
  } else {
    console.log( "Capability window.crypto not found :(" );
    for(var i=0; i<L; i++) {
      // This is less crypto-secure, but the best we can do locally.
      var j = Math.floor(Math.random() * M);
      s += chars.charAt(j);
    }
  }

  console.log("Generated qrKey [" + s + "]");
  return s;
}

document.getElementById("txt-msg-close").onclick = function(event) { 
  show("qr-zone");
}
document.getElementById("inbox").onclick = function(event) { 
    event.stopPropagation();
}

function spin() {
  // When we receive a Scan Notification event from Pusher,
  // we are excited about a resource payload coming soon.
  // So we wag tail with a spinning wheel.
  render("#CCC");
  var logo = document.getElementById("overprint-logo");
  if ( logo )
    logo.src = "icons/red_spinner.gif";
}

function success() {
  render("#CCC");
  var logo = document.getElementById("overprint-logo");
  if ( logo ){
    logo.src = "icons/check_256.png";
    logo.style.top = (bodyPad + 72) + "px";
    logo.style.left = "72px";
    logo.style.width = "256px";
    logo.style.height = "256px";
  }
}

document.getElementById("inbox").value = "";

function attachPusherBindings(){
  pusher.connection.bind( 'error', function( err ) {
    if( err.data.code === 4004 ) {
      showError("We're very sorry, but the Cool Maze service currently runs at maximal capacity. We cannot provide a fresh QR-code right now.");
    } else {
      console.log(err);
    }
  });
}

function attachPusherChannelBindings(){
  var eventNotifScan = 'maze-scan';
  channel.bind(eventNotifScan, function(data) {
    console.log("Received scan notification. Payload coming soon.");
    spin();
  });

  var eventCast = 'maze-cast';
  channel.bind(eventCast, function(data) {
      var msg = data.message;
      console.log("Received message: " + msg);

      if(startsWith(msg,'http') || startsWith(msg,'www.')) {
         var newTabUrl = msg;
         chrome.tabs.create({
            "url":newTabUrl
         });

         if(data.multiIndex){
           multiOpened++;
           if( multiOpened == data.multiCount) {
             // Multi resources, each already opened in respective tab.
             success();
             multiOpened = 0;
           }
         }else{
           // Single resource opened.
           // We may:
           // - close the popin  (but how?)
           // - keep QR-code displayed, to immediately cast further resources
           // - display success icon
           //
           // TODO
         }
         return;
      }

      document.getElementById("inbox").value = msg;
      show("txt-msg-zone");
  });
}


function checkInternetAndExecute(action){
  // This request is supposed to be fast.
  var tinyRequest = new XMLHttpRequest();
  tinyRequest.onreadystatechange = function() {
      if (tinyRequest.readyState == 4 ) {
        if (tinyRequest.status == 200) {
          // #110: response ensures we have internet connectivity
          action();
        } else {
          showError("No internet...?");
        }
      }
  };
  tinyRequest.open("GET", backend+"/online", true);
  tinyRequest.send( null );
}

function wakeUpBackend(){
  // This request can be slow.
  // We don't need to wait for the response.
  var wakeup = new XMLHttpRequest();
  var wuEndpoint = backend + "/wakeup";
  var wuParam = "qrKey=" + qrKey;
  wakeup.open("GET", wuEndpoint + "?" + wuParam, true);
  wakeup.send( null );
}

window.addEventListener('offline', function(){
  showError("Lost internet connectivity :(")
});

window.setTimeout(function(){ 
  var qrzone = document.getElementById("qr-zone");
  if ( qrzone.style.display == "block" || qrzone.style.display == "" ) {
    showError("Please reload.");
    pusher.disconnect();
  }
}, 10 * 60 * 1000);

function init() {
  // Spin until we have checked for internet connectivity
  spin();

  //
  // Generate qrKey/chanID -> Listen to Pusher channel -> Check internet -> Render QR-code
  //
  qrKey = genRandomQrKey();
  chanID = qrKey;

  if (typeof Pusher === 'undefined')
    return showError("No internet connectivity :(");

  pusher = new Pusher(coolMazePusherAppKey, {
    encrypted: true
  });
  attachPusherBindings();
  channel = pusher.subscribe(chanID);
  attachPusherChannelBindings();

  checkInternetAndExecute(function(){
    // #110: internet connectivity unlocks the QR-code display.
    render("black");
  });

  wakeUpBackend();
}
init();