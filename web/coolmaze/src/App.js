import React, { Component } from 'react';
import Pusher from 'pusher-js';
import schema from './img/schema.png';
import arrow from './img/red_arrow.png';
import picto128 from './img/coolmaze_128.png';
import whitewheel from './img/wheel_black_white_128.gif';
import MdErrorOutline from 'react-icons/lib/md/error-outline';
import FaQuestionCircle from 'react-icons/lib/fa/question-circle';
import FaClose from 'react-icons/lib/fa/close';
import FaExternalLink from 'react-icons/lib/fa/external-link';
import FaFilePdfO from 'react-icons/lib/fa/file-pdf-o';
import FaFileO from 'react-icons/lib/fa/file-o';
import FaExclamationTriangle from 'react-icons/lib/fa/exclamation-triangle';
import GoDownload from 'react-icons/lib/go/cloud-download';
import ProgressiveImage from 'react-progressive-image';
import './App.css';

require('string.prototype.startswith');

// This lib generates simpler (21x21) code
let QRCode = require('qrcode.react');

// This lib supports logo
// let QRCode = require('qrcode-react');

let coolMazePusherAppKey = 'e36002cfca53e4619c15';
let backend = "https://cool-maze.appspot.com";

class App extends Component {
  constructor(props) {
    super(props);

    this.toggleHelp = this.toggleHelp.bind(this);
    this.handleScanNotif = this.handleScanNotif.bind(this);
    this.handleCast = this.handleCast.bind(this);
    this.handlePusherData = this.handlePusherData.bind(this);
    this.openInNewTab = this.openInNewTab.bind(this);
    this.openAsDownload = this.openAsDownload.bind(this);
    this.clear = this.clear.bind(this);

    this.initQR();

    this.state = {
      qrKey: this.key,
      actionID: null,
      scanNotif: false,
      thumb: null,
      resourceType: null,
      resourceUrl: null,
      resourceWebpageUrl: null,
      multi: false,
      multiItems: [],

      textMessage: null,
      infoMessage: null,
      errorMessage: null,
      showHelp: false
    }
  }

  render() {
    var spinning = this.state.scanNotif;
    if(this.state.multi)
      spinning = !this.multiFinished();
    var errorBox;
    if(this.state.errorMessage) {
      spinning = false;
      errorBox = <div className="error-box">{this.state.errorMessage}</div>;
    }

    return (
      <div className="App">
        <TopBar 
          helpAction={this.toggleHelp}
          clear={this.clear}
          openInNewTab={this.openInNewTab}
          openAsDownload={this.openAsDownload}
          resourceUrl={this.state.resourceUrl}
          resourceWebpageUrl={this.state.resourceWebpageUrl}
          textMessage={this.state.textMessage}
          errorMessage={this.state.errorMessage}
          spinning={spinning}
          showHelp={this.state.showHelp}
          multi={this.state.multi}
        />
        {errorBox}
        <MainZone 
          qrKey={this.state.qrKey}
          thumb={this.state.thumb}
          resourceType={this.state.resourceType}
          resourceUrl={this.state.resourceUrl}
          resourceWebpageUrl={this.state.resourceWebpageUrl}
          textMessage={this.state.textMessage}
          youtubeID={this.state.youtubeID}
          showHelp={this.state.showHelp}
          closeHelpAction={this.toggleHelp}
          multi={this.state.multi}
          multiItems={this.state.multiItems}
          spinning={spinning}
          clear={this.clear}
        />
      </div>
    );
  }

  initQR() {
    // Closes any prexisting connection,
    // then chooses a fresh random key,
    // then connects to pusher channel.

    window.clearTimeout(this.qrtimeout);

    if(this.pusher)
      this.pusher.disconnect();

    this.key = genRandomQrKey();
    this.pusher = new Pusher(coolMazePusherAppKey, {
      encrypted: true
    });
    this.channel = this.pusher.subscribe(this.key);

    var cb = this.handlePusherData;
    // TODO refactor this into 1 generic bind to cb?
    this.channel.bind('maze-scan', function(data) {
      console.log('maze-scan');
      data.event = 'maze-scan';
      cb(data);
    });
    this.channel.bind('maze-cast', function(data) {
      console.log('maze-cast');
      data.event = 'maze-cast';
      cb(data);
    });
    this.channel.bind('maze-error', function(data) {
      console.log('maze-error');
      data.event = 'maze-error';
      cb(data);
    });
    this.wakeUpBackend();

    var that = this;
    this.qrtimeout = window.setTimeout(function(){
        that.expireQR();
    }, 10 * 60 * 1000);

    // Warning: this does NOT update this.state.
  }


  wakeUpBackend(){
    // This request can be slow.
    // We don't need to wait for the response.
    var wakeup = new XMLHttpRequest();
    var wuEndpoint = backend + "/wakeup";
    var wuParam = "qrKey=" + this.key;
    wakeup.open("POST", wuEndpoint, true);
    wakeup.setRequestHeader("Content-type", "application/x-www-form-urlencoded");
    wakeup.send( wuParam );
  }

  handleScanNotif(data) {
    if(this.state.resourceUrl || this.state.textMessage)
      return; // Too late, ignoring

    if(this.state.multi && this.multiFinished())
      return; // Too late, ignoring

    var actionID = this.state.actionID;
    if(data.actionID)
      actionID = data.actionID;

    if(data.multiCount && data.multiCount>1) {
      var items = this.state.multiItems;
      if (!items || items.length!==parseInt(data.multiCount,10)) {
        items = [];
        for(var i=0;i<data.multiCount;i++)
          items.push(Object());
      }

      var index = data.multiIndex;
      if (data.message && data.message.startsWith('data:image/'))
        items[index].thumb = data.message;
      items[index].resourceType = data.contentType;

      this.setState(prevState => ({
        actionID: actionID,
        multi: true,
        multiItems: items
      }));
      return;
    }

    if (data.message
        && (data.message.startsWith("http://") || data.message.startsWith("https://"))) {        
      this.setState(prevState => ({
        actionID: actionID,
        scanNotif: true,
        resourceType: data.contentType,
        resourceUrl: data.message,
        textMessage: null
      }));
      return;
    }

    if (data.message
        && data.message.startsWith('data:image/')) {
      console.log('Received thumbnail');
      this.setState(prevState => ({
        actionID: actionID,
        scanNotif: true,
        thumb: data.message
      }));
    }

    this.setState(prevState => ({
      actionID: actionID,
      scanNotif: true
    }));

    // TODO some nice default pictogram for known and
    // unknown resource types.
  }

  handleCast(data) {
    // console.log(data);

    var actionID = this.state.actionID;
    if(data.actionID)
      actionID = data.actionID;

    if(data.multiCount && data.multiCount>1) {
      var items = this.state.multiItems;
      if (!items || items.length!==parseInt(data.multiCount,10)) {
        items = [];
        for(var i=0;i<data.multiCount;i++)
          items.push(Object());
      }

      var index = data.multiIndex;
      items[index].resourceUrl = data.message;
      items[index].resourceType = data.contentType;

      this.setState(prevState => ({
        actionID: actionID,
        multi: true,
        multiItems: items
      }));

      if(this.multiFinished())
        this.ack();

      return;
    }

    if (data.message
        && (data.message.startsWith("https://storage.googleapis.com/cool-maze.appspot.com/sample")
           || data.message.startsWith("https://storage.googleapis.com/cool-maze.appspot.com/demo"))) {
      // Specific case for the sample photo, because it may be sent as a URL without
      // an explicit content-type. But we want to siplay directly the picture, not the URL.
      console.log("Receiving sample photo");
      this.setState(prevState => ({
        actionID: actionID,
        resourceType: "image/jpeg",
        resourceUrl: data.message,
        textMessage: null,
        scanNotif: false
      }));
      this.ack();
      return;
    }

    var ytID = youtubeVideoID(data.message);
    if ( ytID ) {
      console.log("Receiving a youtube URL");
      this.setState(prevState => ({
        actionID: actionID,
        resourceType: "youtube",
        resourceUrl: data.message,
        textMessage: null,
        scanNotif: false,
        youtubeID: ytID,
      }));
      this.ack();
      return;
    }

    if (data.message
        && data.message.startsWith("https://storage.googleapis.com/cool-maze-")) {
      // This resource is a file uploaded from mobile app
      console.log("Receiving shared file resource");
      this.setState(prevState => ({
        actionID: actionID,
        resourceType: data.contentType,
        resourceUrl: data.message,
        textMessage: null,
        scanNotif: false
      }));
      this.ack();
      return;
    }

    if (data.message
        && (data.message.startsWith("http://") || data.message.startsWith("https://"))) {  
      // This is a generic URL shared from mobile app, let's just redirect to it
      // (because auto opening in new tab would be blocked by browser)
      console.log("Receiving shared URL");
      var url = data.message;

      // Direct redirect?  (this is abrupt)
      this.setState(prevState => ({
        actionID: actionID,
        infoMessage: "Redirecting to " + url + " ...",
        resourceUrl: null,
        thumb: null,
        textMessage: "Redirecting to " + url + " ...",
        scanNotif: false
      }));
      this.ack();
      console.log("Redirect to " + url + " in 500ms...");
      window.setTimeout(function(){
        window.location = url;
      }, 500);

      // Rather display in iframe?  But, browser security forbids :(

      // Just display clickable URL (not really great)
      // this.setState(prevState => ({
      //   resourceType: data.contentType,
      //   resourceWebpageUrl: url,
      //   thumb: null,
      //   scanNotif: false
      // }));
      // this.ack();
      return;
    }

    if(data.message) {
      console.log("Receiving shared text message");
      this.setState(prevState => ({
        actionID: actionID,
        resourceType: data.contentType,
        textMessage: data.message,
        resourceUrl: null,
        scanNotif: false
      }));
      this.ack();
      return;
    }


    // TODO look at content-type advertised in pusher message
    // TODO handle some other resource types:
    // - video
    // - generic file
    // - multiple resources at once
  }

  handlePusherData(data) {
    switch(data.event) {
      case 'maze-scan':
        this.handleScanNotif(data);
        break;
      case 'maze-cast':
        console.log('message = ' + data.message);
        this.handleCast(data);
        break;
      case 'maze-error':
        console.log('Error message = ' + data.message);
        this.setState(prevState => ({
          errorMessage: data.message
        }));
        break;
      default:
        console.warn('Weird pusher event...');
        console.warn(data);
    }
  }

  expireQR() {
    console.log("Closing idle channel, hiding QR-code");
    this.pusher.disconnect();
    this.setState(prevState => ({
      // magic value :(
      qrKey: "reload",
      // errorMessage: "Please reload",
    }));
  }

  openInNewTab() {
    if(this.state.resourceUrl) {
      window.open(this.state.resourceUrl, '_blank');
      return;
    }
    if(this.state.resourceWebpageUrl) {
      window.open(this.state.resourceWebpageUrl, '_blank');
      return;
    }
  }

  openAsDownload() {
    // From https://stackoverflow.com/a/37521282
    var link = document.createElement('a');
    link.setAttribute('href', this.state.resourceUrl);
    link.setAttribute('download', '');

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  toggleHelp() {
    this.setState(prevState => ({
      showHelp: !prevState.showHelp
    }));
  }

  clear() {
    this.initQR();
    this.setState(prevState => ({
      qrKey: this.key,
      actionID: null,
      scanNotif: false,
      thumb: null,
      resourceUrl: null,
      resourceWebpageUrl: null,
      textMessage: null,
      youtubeID: null,
      errorMessage: null,
      showHelp: false,
      multi: false,
      multiItems: []
    }));
  }

  multiFinished() {
    var n = this.state.multiItems.length;
    var m = 0;
    for(var i=0; i<n; i++)
      if(this.state.multiItems[i].resourceUrl)
        m++;
    var allFinished = (m===n);
    return allFinished;
  }

  ack() {
    // Tell the server that the resource was sucessfully received by client.
    // Same acknowledgement for Single and Multi.
    // We don't need to wait for the response.
    var ack = new XMLHttpRequest();
    var endpoint = backend + "/ack";
    var params = "qrKey=" + this.state.qrKey + "&actionid=" + this.state.actionID;
    ack.open("POST", endpoint, true);
    ack.setRequestHeader("Content-type", "application/x-www-form-urlencoded");
    ack.send( params );

    // TODO send 2 acks:
    // - 1 when resourceURL successfully received
    // - 1 when resource successfully loaded
  }
}

function TopBar(props) {
  var showHelpButton = true;
  var hasResource = (props.resourceUrl) ? true : false;
  var clearable = (props.textMessage || hasResource || props.resourceWebpageUrl || props.spinning || props.multi) ? true : false;
  var openableUrl; 
  if(props.resourceUrl)
    openableUrl = props.resourceUrl;
  if(props.resourceWebpageUrl)
    openableUrl = props.resourceWebpageUrl;

  if ( props.errorMessage ) {
    showHelpButton = false;
    clearable = true;
  } else if (props.spinning) {
    // It would be confusing to handle resource reception while help is displayed,
    // thus we don't want the user to reach help right now.
    showHelpButton = false;
  } else if (props.showHelp) {
    // It would be confusing to handle action buttons while help is displayed.
    // User should close help to go back to resource view with action buttons.
    clearable = false;
    openableUrl = false;
    hasResource = false;
  }

  var helpCssClass = "";
  if(props.showHelp)
    helpCssClass = "pressed";

  var spin, error;
  if (props.spinning) {
    spin = <img src={whitewheel} alt="Receiving data..." className="spinning" />
  }
  if (props.errorMessage) {
    error = <MdErrorOutline className="error"/>;
  }

  return (
    <header>
      <table className="topbar">
        <tbody>
          <tr>
            <td>
              <button onClick={props.helpAction} title="What is this all about" disabled={!showHelpButton} className={helpCssClass}><FaQuestionCircle /></button>
            </td>
            <td>
              <button onClick={props.openInNewTab} title="Open in new tab" disabled={!openableUrl}><FaExternalLink /></button>
            </td>
            <td>
              <button onClick={props.openAsDownload} title="Save" disabled={!hasResource}><GoDownload /></button>
            </td>
            <td>
              {spin}
              {error}
            </td>
            <td>
              <button onClick={props.clear} title="Clear" disabled={!clearable}><FaClose /></button>
            </td>
          </tr>
        </tbody>
      </table>
    </header>
  )
}

function youtubeVideoID(url) {
  // From https://stackoverflow.com/a/10315969/871134
  var p = /^(?:https?:\/\/)?(?:www\.)?(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))((\w|-){11})(?:\S+)?$/;
  return (url.match(p)) ? RegExp.$1 : false;
}

class MainZone extends Component {
  render() {
    if (this.props.showHelp)
      return (
        <div className="main">
          <Help closeAction={this.props.closeHelpAction} />
        </div>
      );

    var thumb = this.props.thumb;
    var resourceType = this.props.resourceType;
    var resourceUrl = this.props.resourceUrl;
    var resourceWebpageUrl = this.props.resourceWebpageUrl;
    var textMessage = this.props.textMessage;
    var youtubeID = this.props.youtubeID;
    var multi = this.props.multi;
    var multiItems = this.props.multiItems;
    var spinning = this.props.spinning;

    if (!thumb && !resourceUrl && !resourceWebpageUrl && !textMessage && !multi && !spinning)
      return (
        <div className="main">
          <QrZone 
            qrKey={this.props.qrKey} 
            clear={this.props.clear}
          />
        </div>
      );
    
    if(multi)
      return (
        <div className="main">
          <InboxMulti
            items={multiItems}
          />
        </div>
      );

    return (
      <div className="main">
        <Inbox 
          thumb={thumb}
          resourceType={resourceType}
          resourceUrl={resourceUrl}
          resourceWebpageUrl={resourceWebpageUrl}
          textMessage={textMessage}
          youtubeID={youtubeID}
          spinning={spinning}
        />
      </div>
    );
  }
}


// QrZone is for displaying a QR-code.
class QrZone extends Component {
  constructor(props) {
    super(props);
    this.state = {
      size: 2
    }
    this.embiggen = this.embiggen.bind(this);
  }

  render() {
    if ( this.props.qrKey === "reload" ) {
      // Dirty magic value to detect removed QR-code.
      // issues/244 after 10mn, QR-code removed, user must click.
      return (
        <div id="qr-zone" className="please-reload">
          <div>
            <button onClick={this.props.clear}>
              <img src={picto128} alt="Reload" />
            </button>
          </div>
          <div>
            <i>Please reload</i>
          </div>
        </div>
      )
    }

    return (
      <div id="qr-zone">
        <div id="qrcode" title="Click to enlarge" onClick={this.embiggen}> 
          <QRCode value={this.props.qrKey} size={125 * this.state.size} logo={arrow} level="M" />
        </div>
      </div>
    )
  }

  componentDidMount() {
    this.printLogoInQR();
  }
  
  componentDidUpdate() {
    this.printLogoInQR();
  }

  printLogoInQR() {
    // Render the Cool Maze red arrow logo
    // in the center of the QR-code canvas.
    //
    // Maybe this should be rewritten some day, in a React style.

    var parent = document.getElementById('qrcode');
    if (!parent)
      return;
    var canvas = parent.querySelector('canvas');
    if(!canvas)
      return;

    var ctx = canvas.getContext('2d');

    var qrsize = 125 * this.state.size;
    // var logosize = 50;
    var logosize = qrsize/4;
    var image = new Image();
    image.onload = function() {
        var dwidth = logosize || qrsize * 0.2;
        var dheight = logosize || image.height / image.width * dwidth;
        var dx = (qrsize - dwidth) / 2;
        var dy = (qrsize - dheight) / 2;
        image.width = dwidth;
        image.height = dheight;
        ctx.drawImage(image, dx, dy, dwidth, dheight);
    }
    image.onerror = function(x, y) {
        console.log("Error on loading red arrow logo :(");
    }
    image.src = arrow;
  }

  embiggen() {
    this.setState(prevState => ({
      size: 2 + (prevState.size%6)
    }));
  }
}

class Help extends Component {
  render() {
    return (
      <div id="help">
        <div><span id="question-mark" onClick={this.props.closeAction}> </span></div>
        <div id="help-contents">
          <div id="help-close" onClick={this.props.closeAction}><FaClose /></div>
          <img src={schema} width="296" height="400" className="help-schema right" alt="Illustration: Mobile-to-Desktop action" />
          <p className="warning-specific-QR"><FaExclamationTriangle/> This QR-code works only with mobile app Cool Maze!</p>
          <p>You can share a document from your mobile device to a desktop computer or video projector</p>
          <span>
            <ol>
              <li>Install the <strong><a href="https://play.google.com/apps/testing/net.coolmaze.coolmaze">Cool Maze app</a></strong> on your Android mobile</li>
              <li>Open <strong>coolmaze.io</strong> in your desktop browser</li>
              <li>On mobile resource (photo, video, URL, PDF), select <span className="rounded"><strong><i>Share via</i></strong></span> > <span className="rounded"><img src={picto128} className="mini-picto" alt="" /> <strong>Cool Maze</strong></span></li>
              <li>Scan the QR-code</li>
            </ol>
          </span>
          <p>That's it. No login, no passwords, no ads.</p>
          <p>The two devices (source and target) must have internet connection.</p>
          <p><strong>Your data remains private</strong>. It is not publicly available and not disclosed to third parties. See the <a href="terms.html">Privacy terms</a>.</p>
          <p>Resource is available only for a few minutes after transfer, so you may want to explicitly save it on your computer.</p>

          <div className="link-to-dual">
          But I want to send from desktop to mobile instead! Use <a href="https://hotmaze.io/">Hot Maze</a>.
          </div>
        </div>
      </div>
    )
  }
}

class Inbox extends Component {
  render() {
    
    if (this.props.resourceUrl){

      if(this.props.youtubeID) {
        var embedURL = "https://www.youtube.com/embed/" + this.props.youtubeID ; 
        embedURL += "?autoplay=1";
        return (
          <div id="inbox">
            <iframe id="ytplayer" type="text/html" src={embedURL} width="100%" height="600" allowFullScreen />
          </div>
        )
      }

      if (this.props.resourceType 
          && this.props.resourceType.startsWith('video/')) {
        return (
          <div id="inbox">
            <video src={this.props.resourceUrl} controls className="resource-video fit-down">
              Video <a href={this.props.resourceUrl} target="_blank">{this.props.resourceFilename || "here"}</a>
            </video>
          </div>
        );
      }

      if( /\/pdf/.test(this.props.resourceType) ){
        return (
          <div id="inbox-file">
            <div className="file-item">
              <a href={this.props.resourceUrl}
                target="_blank"><FaFilePdfO size={140} /></a> <br/>
              <a href={this.props.resourceUrl}
                target="_blank">{this.props.resourceFilename || "Your PDF"}</a>
            </div>
          </div>
        )          
      }

      if( !this.props.thumb
          && this.props.resourceType 
          && !this.props.resourceType.startsWith('image/') ){
        return (
          <div id="inbox-file">
            <div className="file-item">
              <a href={this.props.resourceUrl}
                target="_blank"><FaFileO size={140} /></a> <br/>
              <a href={this.props.resourceUrl}
                target="_blank">{this.props.resourceFilename || "Your file"}</a>
            </div>
          </div>
        )          
      }

      var bigPictureUrl = this.props.resourceUrl;
      var thumbUrl = this.props.thumb;
      var filename = this.props.resourceFilename;
      var open = function(){
        window.open(bigPictureUrl, '_blank');
      }

        return (
          <ProgressiveImage src={bigPictureUrl} placeholder={thumbUrl}>
            {function(src) {
              if (thumbUrl && src===thumbUrl)
                return (
                  <div id="inbox">
                    <img 
                      src={src} 
                      alt='Downloading...' 
                      className="resource-thumb fit-up-height" />
                  </div>
                );
              else
                return (
                  <div id="inbox">
                    <img 
                      src={src} 
                      alt={filename || "Freshly sent resource"}
                      className="resource-picture fit-down" 
                      onClick={open} />
                  </div>
                );
            }}
          </ProgressiveImage>
          );
    }

    if (this.props.thumb)
      return (
        <div id="inbox">
          <img src={this.props.thumb} className="resource-thumb fit-up-height" alt="Thumbnail of resource being received" />
        </div>
      );

    if (this.props.textMessage)
      return (
        <div id="inbox-text">
          <h3>Received text message</h3>
          <textarea id="text-message" readOnly="readonly" value={this.props.textMessage} />
        </div>
      );

    if (this.props.resourceWebpageUrl) {
      // Most often iframe doesn't work, because of cross-origin
      // return (
      //   <div id="inbox">
      //     <iframe src={this.props.resourceWebpageUrl} className="external-webpage" />
      //   </div>
      // )

      return (
        <div id="inbox-external-url">
          <h3>Received URL</h3>
          <div className="external-webpage">
            <a href={this.props.resourceWebpageUrl} target="_blank">{this.props.resourceWebpageUrl}</a>
          </div>
        </div>
      )
    }

    if(this.props.spinning)
      return (
        <div id="inbox">
            <i>Receiving data...</i>
        </div>
      );

    return (
      <div id="inbox">
          {/* ø  */}
      </div>
    );
  }
}


class InboxMulti extends Component {
  render() {
      var items = this.props.items;
      var subBoxes = [];
      var opener = function(i) {
        return function(){
          window.open(items[i].resourceUrl, '_blank');
        }
      }
      for (var i=0; i < items.length; i++) {
        if (items[i].resourceUrl)
          subBoxes.push(
            <div className="multi-item" key={i}>
              <img src={items[i].resourceUrl} alt={"Item "+i} className="resource" onClick={opener(i)} />
            </div>
          );
        else if (items[i].thumb)
          subBoxes.push(
            <div className="multi-item" key={i}>
              <img src={items[i].thumb} alt="Downloading..." className="thumb" />
            </div>
          );
        else
          subBoxes.push(
            <div className="multi-item" key={i}>
            </div>
          );
      }

      return (
        <div id="inbox-multi">
          {subBoxes}
        </div>
      );
  }
}

function genRandomQrKey() {
  var CM_CLIENT_PREFIX = "a";
  var chars = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
  var M = chars.length; // 62
  var L = 11;
  var s = CM_CLIENT_PREFIX;

  var crypto = window.crypto || window.msCrypto;
  var i, j;
  if( crypto ) {
    var buf = new Uint8Array(L);
    crypto.getRandomValues(buf);
    for(i=1; i<L; i++) {
      // 01234567 would be slightly more frequent, which is OK for our use case
      j = buf[i] % M;
      s += chars.charAt(j);
    }
  } else {
    console.log( "Capability window.crypto not found :(" );
    for(i=1; i<L; i++) {
      // This is less crypto-secure, but the best we can do locally.
      j = Math.floor(Math.random() * M);
      s += chars.charAt(j);
    }
  }

  console.log("Generated qrKey [" + s + "]");
  return s;
}

export default App;
