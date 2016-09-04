
var backend = "https://cool-maze.appspot.com";
var coolMazePusherAppKey = 'e36002cfca53e4619c15';

// Since #108, qrKey==chanID and it is random generated in JS.
var qrKey = "";
var chanID = "";
var channel;

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
    for(var i=0; i<11; i++) {
      // 01234567 would be slightly more frequent, which is OK for our use case
      var j = buf[i] % M;
      s += chars.charAt(j);
    }
  } else {
    console.log( "Capability window.crypto not found :(" );
    for(var i=0; i<11; i++) {
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

document.getElementById("inbox").value = "";

// Spin while registering
spin();

//
// Generate qrKey/chanID -> Listen to Pusher channel -> Render QR-code
//
qrKey = genRandomQrKey();
chanID = qrKey;

var pusher = new Pusher(coolMazePusherAppKey, {
  encrypted: true
});
channel = pusher.subscribe(chanID);

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
       return;
    }
    document.getElementById("inbox").value = msg;
    show("txt-msg-zone");
});

render("black");