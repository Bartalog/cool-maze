
var backend = "https://cool-maze.appspot.com";
// var backend = "https://dev-dot-cool-maze.appspot.com";
// var backend = "http://localhost:8080";
var coolMazePusherAppKey = 'e36002cfca53e4619c15';

// qrKey, chanID will be provided by the backend
var qrKey = "";
var chanID = "";
var channel;

var qrHundredth = 68;

function render(colorDark, clickCallback){
  // qrHundredth == 95 is a "big QR-code" (almost fullscreen)
  // qrHundredth == 50 is a "medium-size QR-code"

  // -50 is for the small [?] box on the left
  var w = Math.max(document.documentElement.clientWidth -50, (window.innerWidth || 0) -50) * qrHundredth / 100;
  var h = Math.max(document.documentElement.clientHeight, window.innerHeight || 0) * qrHundredth / 100;
  var c = 400;
  if ( w>0 )
    c = w;
  if ( h>0 && h<c )
    c = h;

  var logo = document.getElementById("overprint-logo");
  if ( logo )
    logo.style.display = "none";
  clearQR();
  new QRCode("qrcode", {
    text: qrKey,
    width: c,
    height: c,
    colorDark : colorDark,
    colorLight : "white"
  });
  var qrcode = document.getElementById("qrcode");

  var cc = c/4;
  logo = document.getElementById("overprint-logo"); // has changed
  logo.style.width = cc + "px";
  logo.style.height = cc + "px";
  logo.style.top = ((1.5)*cc) + "px";
  logo.style.marginLeft = (-cc/2) + "px";
  //logo.style.display = "inline";
  window.setTimeout(function(){ logo.style.display = "inline"; }, 40);

  if (clickCallback) {
    // The QR-code contents is clickable to embiggen, not the whole qr-zone
    for(var i=0; i < qrcode.childNodes.length; i++) {
      qrcode.childNodes[i].onclick = clickCallback;
    }
  }
}

// Go fullscreen -> bigger QR
/*
var resizeTimeOut = null;
window.onresize = function(){
    if (resizeTimeOut != null)
        clearTimeout(resizeTimeOut);
    resizeTimeOut = setTimeout(function(){
        render("black", embiggen);
    }, 300);
};
*/

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

document.getElementById("txt-msg-close").onclick = function(event) { 
  show("qr-zone");
}
document.getElementById("inbox").onclick = function(event) { 
    event.stopPropagation();
}

function embiggen(event) { 
    // Change size on each click
    // 40, 68, 96, 40, 60, 96 ...
    qrHundredth += 28;
    if ( qrHundredth>100 )
      qrHundredth = 40;
    render("black", embiggen);
}

function spin() {
  // When we receive a Scan Notification event from Pusher,
  // we are excited about a resource payload coming soon.
  // So we wag tail with a spinning wheel.
  render("#CCC", null);
  var logo = document.getElementById("overprint-logo");
  if ( logo )
    logo.src = "icons/red_spinner.gif";
}

document.getElementById("inbox").value = "";

// Spin while registering
spin();

//
// Register -> Listen to Pusher channel -> Render QR-code
//
var xhrRegister = new XMLHttpRequest();
xhrRegister.onreadystatechange = function () {
  var DONE = 4;
  var OK = 200;
  if (xhrRegister.readyState !== DONE)
      return;
  if (xhrRegister.status !== OK) {
    console.log('Error: ' + xhrRegister.status);
    return;
  }
  //console.log(xhrRegister.responseText);
  var jsonResponse = JSON.parse(xhrRegister.responseText);
  qrKey = jsonResponse.qrKey;
  chanID = jsonResponse.chanID;
  console.log("Received from backend (qrKey, chanID) pair (" + qrKey + ", " + chanID + ")");

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
         console.log("Opening tab");
         if(chrome) {
           chrome.tabs.create({
              "url":newTabUrl
           });
           console.log("Opened tab");
         }else{
          console.log("chrome doesn't exist :(")
         }
         return;
      }
      document.getElementById("inbox").value = msg;
      show("txt-msg-zone");
  });

  render("black", embiggen);
};
xhrRegister.open('POST', backend + '/register');
xhrRegister.send(null);
