
var backend = "https://cool-maze.appspot.com";
var coolMazePusherAppKey = 'e36002cfca53e4619c15';

// qrKey, chanID will be provided by the backend
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
    colorLight : "white"
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
         chrome.tabs.create({
            "url":newTabUrl
         });
         return;
      }
      document.getElementById("inbox").value = msg;
      show("txt-msg-zone");
  });

  render("black");
};
xhrRegister.open('POST', backend + '/register');
xhrRegister.send(null);
