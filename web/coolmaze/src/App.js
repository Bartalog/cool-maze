import React, { Component } from 'react';
import Pusher from 'pusher-js';
import CryptoJS from 'crypto-js';

import genRandomKey from './qrkey.js';
import sha256 from './derive.js';
import {wakeUpBackend, ackBackend} from './backend.js';
import MobileBanner from './mobile-banner.js';
import TopBar from './topbar.js';
import Help from './help.js';
import QrZone from './qrzone.js';
import Item from './item.js';
import {MakeZip, MakeZipFromE2EE, ZipProgress} from './zip.js';
import {Decrypt, DecryptWords} from './e2ee.js';
import base64toBlob from './util.js';

import './App.css';

require('string.prototype.startswith');

let coolMazePusherAppKey = 'e36002cfca53e4619c15';
const CM_CLIENT_PREFIX = "a/";

class App extends Component {
  constructor(props) {
    super(props);

    this.toggleHelp = this.toggleHelp.bind(this);
    this.handleScanNotif = this.handleScanNotif.bind(this);
    this.handleCast = this.handleCast.bind(this);
    this.handlePusherData = this.handlePusherData.bind(this);
    this.openInNewTab = this.openInNewTab.bind(this);
    this.openAsDownload = this.openAsDownload.bind(this);
    this.openAsDownloadZip = this.openAsDownloadZip.bind(this);
    this.setZipProgress = this.setZipProgress.bind(this);
    this.clear = this.clear.bind(this);
    this.embiggen = this.embiggen.bind(this);

    this.initQR();

    this.state = {
      chanKey: this.chanKey,
      symCryptoKey: this.symCryptoKey,
      qrKey: this.qrKey,
      qrSize: localStorage.getItem("qrSize") || 2,
      actionID: null,
      scanNotif: false,
      thumb: null,
      resourceType: null,
      resourceUrl: null,
      resourceData_b64: null,
      resourceWebpageUrl: null,
      resourceFilename: null,
      resourceResized: null,
      resourceWidth: null,
      resourceHeight: null,
      multi: false,
      multiItems: [],
      zipProgressRatio: null,
      textMessage: null,
      infoMessage: null,
      errorMessage: null,
      showHelp: false
    }
    this.crypto_algo = null;
    this.crypto_iv = null;
    this.fetchDuration = null;
    this.decryptDuration = null;
  }

  render() {
    var spinning = this.state.scanNotif;
    if(this.state.multi)
      spinning = !this.multiFinished(false); // ??????? TODO determine encryption
    var errorBox;
    if(this.state.errorMessage) {
      spinning = false;
      errorBox = <div className="error-box">{this.state.errorMessage}</div>;
    }
    var e2ee = this.crypto_algo ? true : false;

    return (
      <div className="App">
        <div className="promodomain">
          cmaz.io
        </div>
        <TopBar 
          helpAction={this.toggleHelp}
          clear={this.clear}
          openInNewTab={this.openInNewTab}
          openAsDownload={this.openAsDownload}
          openAsDownloadZip={this.openAsDownloadZip}
          resourceUrl={this.state.resourceUrl}
          resourceData_b64={this.state.resourceData_b64}
          resourceWebpageUrl={this.state.resourceWebpageUrl}
          textMessage={this.state.textMessage}
          errorMessage={this.state.errorMessage}
          spinning={spinning}
          showHelp={this.state.showHelp}
          zippable={this.isZippable()}
        />
        <MobileBanner />
        {errorBox}
        <MainZone 
          qrKey={this.state.qrKey}
          qrSize={this.state.qrSize}
          thumb={this.state.thumb}
          resourceType={this.state.resourceType}
          resourceUrl={this.state.resourceUrl}
          resourceData_b64={this.state.resourceData_b64}
          resourceWebpageUrl={this.state.resourceWebpageUrl}
          resourceFilename={this.state.resourceFilename}
          resourceResized={this.state.resourceResized}
          resourceWidth={this.state.resourceWidth}
          resourceHeight={this.state.resourceHeight}
          textMessage={this.state.textMessage}
          youtubeID={this.state.youtubeID}
          showHelp={this.state.showHelp}
          closeHelpAction={this.toggleHelp}
          multi={this.state.multi}
          multiItems={this.state.multiItems}
          zipProgressRatio={this.state.zipProgressRatio}
          spinning={spinning}
          clear={this.clear}
          embiggen={this.embiggen}
          openAsDownload={this.openAsDownload}
          e2ee={e2ee}
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

    this.symCryptoKey = genRandomKey();
    this.qrKey = CM_CLIENT_PREFIX + this.symCryptoKey;
    let that = this;
    sha256(this.symCryptoKey).then(function(chanKey) {
      console.debug("Derived " + that.symCryptoKey + " => " + chanKey);
      that.initQRwith(chanKey);
    });
  }

  initQRwith(chanKey) {
    this.chanKey = chanKey;
    this.pusher = new Pusher(coolMazePusherAppKey, {
      encrypted: true
    });
    console.debug("Listening to [" + this.chanKey + "]");
    this.channel = this.pusher.subscribe(this.chanKey);
    this.qrDisplayTime = new Date();
    this.singleNotifTime = null;
    this.singleCastTime = null;
    this.multipleAllCastTime = null;

    var cb = this.handlePusherData;
    // TODO refactor this into 1 generic bind to cb?
    this.channel.bind('maze-scan', function(data) {
      console.debug('maze-scan');
      data.event = 'maze-scan';
      cb(data);
    });
    this.channel.bind('maze-cast', function(data) {
      console.debug('maze-cast');
      data.event = 'maze-cast';
      cb(data);
    });
    this.channel.bind('maze-error', function(data) {
      console.debug('maze-error');
      data.event = 'maze-error';
      cb(data);
    });
    wakeUpBackend(this.chanKey);

    var that = this;
    this.qrtimeout = window.setTimeout(function(){
        that.expireQR();
    }, 10 * 60 * 1000);

    // Current tab suddenly visible again => Refresh idle QR
    document.addEventListener("visibilitychange", function() {
      if( that.state.qrKey==="reload" && document.visibilityState === "visible") {
        console.debug( "Welcome back (visible), new QR" );
        that.clear();
      }
    });

    // Browser window suddenly gets focus again => Refresh idle QR
    window.addEventListener("focus", function(event) {
      if( that.state.qrKey==="reload" ) {
        console.debug( "Welcome back (focus), new QR" );
        that.clear();
      }
    });

    // Warning: this does NOT update this.state.
  }

  handleScanNotif(data) {
    if(this.state.textMessage) {
      console.log("Ignoring scan notif because single text message has already arrived");
      return;
    }

    if(this.state.resourceData_b64) {
      console.log("Ignoring scan notif because single encrypted resource has already arrived");
      return;
    }

    if(this.state.resourceUrl) {
      //console.log("Ignoring scan notif because single resource URL has already arrived");
      //return;
      // Actually a thumbnail could be useful, if the encrypted picture is not fully downloaded yet...
    }

    let encryption = data.crypto_iv ? true : false;
    if(this.state.multi && this.multiFinished(encryption)) {
      console.log("Ignoring scan notif " + data.multiIndex + " because all the resources have already arrived");
      return;
    }

    this.crypto_algo = data.crypto_algo;
    if (encryption) {
      this.crypto_iv = data.crypto_iv;
      console.debug("Found encryption ", this.crypto_algo);
      let decryptedWords = Decrypt(data.crypto_algo, data.message, data.crypto_iv, this.symCryptoKey);
      let data_b64 = CryptoJS.enc.Base64.stringify(decryptedWords);
      console.debug("Decrypted scan notif ciphertext of size " + data.message.length + " into base64 message of size " + data_b64.length);
      data.message = "data:image/jpeg;base64," + data_b64;
      // This thumb is always implicitly JPEG.
      // TODO: consider PNG, or other?
    }

    if(data.multiCount && data.multiCount>1)
      this.handleScanNotifMulti(data);
    else
      this.handleScanNotifSingle(data);
  }

  handleScanNotifSingle(data) {
    //
    // Single message or resource
    //
    this.singleNotifTime = new Date();
    if(this.qrDisplayTime)
      console.debug("Got single notif after " + (this.singleNotifTime-this.qrDisplayTime) + "ms");

    let actionID = data.actionID || this.state.actionID;

    if (data.message
        && data.message.startsWith('data:image/')) {
      console.debug('Received thumbnail');
      window.setTimeout( this.unblurryThumb.bind(this, 0, 1000), 100 ); // TODO what's the proper way??
      this.setState(prevState => ({
        actionID: actionID,
        scanNotif: true,
        thumb: data.message,
        resourceFilename: data.filename
      }));
      return;
    }

    this.setState(prevState => ({
      actionID: actionID,
      scanNotif: true,
      resourceFilename: data.filename
    }));

    // TODO some nice default pictogram for known and
    // unknown resource types. See resourceicons.js
  }

  handleScanNotifMulti(data) {
    //
    // Multiple resources
    //
    let actionID = data.actionID || this.state.actionID;

    let index = data.multiIndex;
    let item = {};
    if( this.state.multiItems && this.state.multiItems[index] )
      item = this.state.multiItems[index];

    if(item.resourceData_b64 || item.resourceUrl) {
      console.log("Scan notif for resource " + index + " arrived late, ignoring.")
      return;
    }

    if (data.message && data.message.startsWith('data:image/')) {
      item.thumb = data.message;
      // TODO index arg to unblurryThumb is not what we want!!
      window.setTimeout( this.unblurryThumb.bind(this, index, 1000), 100 ); // TODO what's the proper way??
    }
    item.resourceType = data.contentType;
  
    this.setState(prevState => {
      let items = prevState.multiItems;
      if (!items || items.length!==parseInt(data.multiCount,10)) {
        items = [];
        for(var i=0;i<data.multiCount;i++)
          items.push(Object());
      }
      items[index].thumb = item.thumb;
      items[index].resourceType = item.resourceType;
      return {
        actionID: actionID,
        multi: true,
        multiItems: items
      }
    });
  }

  handleCast(data) {
    if(data.multiCount && data.multiCount>1)
      this.handleCastMulti(data);
    else
      this.handleCastSingle(data);
  }

  handleCastSingle(data) {
    let actionID = data.actionID || this.state.actionID;
    //
    // Single
    //

    if (!data.message) {
      console.warn("Cast with no message");
      return;
    }

    // #380
    // A "single message cast" is sufficient to close channel right now.
    // We're not expecting any separate thumb or anything else after this.
    this.quitPusherChannel();

    this.singleCastTime = new Date();
    if(this.qrDisplayTime)
      console.debug("Got single message after " + (this.singleCastTime-this.qrDisplayTime) + "ms");

    let mobileKey = "";
    this.crypto_algo = data.crypto_algo;
    if (data.crypto_iv) {
      this.crypto_iv = data.crypto_iv;
      console.debug("Got a crypto IV");
      // Let K = the target browser's secret passphrase
      // Let P = the mobile source's secret passphrase
      // Let M = the short text message
      //
      // Thumb is encrypted with K
      // Resource file is encrypted with P
      // M is encrypted with K
      // P is encrypted with K
      //
      // IV is the same for all of the above (but changed at every actionID)

      // Decoding the message M (if necessary) is straightforward
      if( data.messageIsClearText || data.message.startsWith("http")) {
        console.debug("  No need to decrypt clear text message:", data.message);
      } else {
        let decryptedWords = Decrypt(data.crypto_algo, data.message, data.crypto_iv, this.symCryptoKey);
        data.message = decryptedWords.toString(CryptoJS.enc.Utf8);
        console.debug("  Decrypted message: ", data.message);
      }

      // Decoding the filename is straightforward
      if (data.filename){
        let decryptedWords = Decrypt(data.crypto_algo, data.filename, data.crypto_iv, this.symCryptoKey);
        data.filename = decryptedWords.toString(CryptoJS.enc.Utf8);
        console.debug("  Decrypted filename: " + data.filename);
      }

      // Decode thumbnail (if any). See #374.
      if (data.thumb){
        console.debug("  Got encrypted thumbnail, length " + data.thumb.length);
        let decryptedWords = Decrypt(data.crypto_algo, data.thumb, data.crypto_iv, this.symCryptoKey);
        let thumb_b64 = CryptoJS.enc.Base64.stringify(decryptedWords);
        thumb_b64 = "data:image/jpeg;base64," + thumb_b64;
        // This thumb is always implicitly JPEG.
        // TODO: consider PNG, or other?
        this.setState(prevState => ({
          thumb: thumb_b64
        }));
        window.setTimeout( this.unblurryThumb.bind(this, 0, 200), 100 ); // TODO what's the proper way??
      }

      // Decoding the resource will require a different key P, emitted by Mobile source.
      if(data.mobile_secret_scrambled) {
        let decryptedWords = Decrypt(data.crypto_algo, data.mobile_secret_scrambled, data.crypto_iv, this.symCryptoKey);
        mobileKey = decryptedWords.toString(CryptoJS.enc.Utf8);
        console.debug("Decrypted mobile secret: " + mobileKey);
      }
      console.debug("Fetching encrypted resource");
      if( data.message.startsWith("https://storage.googleapis.com/cool-maze-transit/")
          || data.message.includes(".appspot.com/f/")
          || data.message.includes(":8080/f/") ){
        // Fetch encrypted file
        let url = data.message;
        let xhr = new XMLHttpRequest();
        xhr.open('GET', url);
        xhr.responseType = "arraybuffer";
        let app = this;
        let tip = new Date().getTime();
        xhr.onload = function() {
          let top = new Date().getTime();
          app.fetchDuration = (top -tip);
          console.debug("Fetched encrypted resource in " + app.fetchDuration + "ms");
          let arrayBuffer = xhr.response;
          if (arrayBuffer) {
            app.handleFetchedEncryptedResourceSingle(arrayBuffer, mobileKey);
          }else{
            console.warn("ahem, where is my arrayBuffer?");
          }
        };
        xhr.onerror = function() {
          console.warn("Failed to fetch resource :(");
        };
        xhr.send();
        this.setState(prevState => ({
          actionID: actionID,
          resourceType: data.contentType,
          resourceFilename: data.filename,
          resourceResized: data.resized,
          resourceWidth: data.contentWidth,
          resourceHeight: data.contentHeight
        }));
        // Stop here (see fetch handlers above)
        return
      }
    }

    if ( data.message.startsWith("https://storage.googleapis.com/cool-maze.appspot.com/sample")
        || data.message.startsWith("https://storage.googleapis.com/cool-maze.appspot.com/demo")) {
      // Specific case for the sample photo, because it may be sent as a URL without
      // an explicit content-type. But we want to display directly the picture, not the URL.
      console.debug("Receiving sample photo");
      this.setState(prevState => ({
        actionID: actionID,
        resourceType: "image/jpeg",
        resourceUrl: data.message,
        textMessage: null,
        scanNotif: false
      }));
      this.teardown();
      return;
    }

    var ytID = youtubeVideoID(data.message);
    if ( ytID ) {
      console.debug("Receiving a youtube URL");
      this.setState(prevState => ({
        actionID: actionID,
        resourceType: "youtube",
        resourceUrl: data.message,
        textMessage: null,
        scanNotif: false,
        youtubeID: ytID,
      }));
      this.teardown();
      return;
    }

    if ( data.message.startsWith("https://storage.googleapis.com/cool-maze-")
         || data.message.startsWith("https://cool-maze.appspot.com/f/")
         || data.message.startsWith("https://cool-maze.uc.r.appspot.com/f/") ) {
      // This resource is a file uploaded from mobile app
      console.debug("Receiving shared file resource");
      this.setState(prevState => ({
        actionID: actionID,
        resourceType: data.contentType,
        resourceUrl: data.message,
        resourceFilename: data.filename,
        resourceResized: data.resized,
        resourceWidth: data.contentWidth,
        resourceHeight: data.contentHeight,
        textMessage: null,
        scanNotif: false
      }));
      this.teardown(); // TODO no ack until resource has been downloaded (& decrypted?)
      return;
    }

    if (data.message.startsWith("http://") || data.message.startsWith("https://")) {  
      // This is a generic URL shared from mobile app, let's just redirect to it
      // (because auto opening in new tab would be blocked by browser)
      console.debug("Receiving shared URL");
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
      this.teardown();
      console.debug("Redirect to " + url + " in 500ms...");
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
      // this.teardown();
      return;
    }

    var chunks = data.message.split(/\s+/);
    var lastChunk = chunks[chunks.length - 1];
    if (lastChunk.startsWith("http://") || lastChunk.startsWith("https://")) {  
      // #323
      // This looks like a URL shared from mobile app, prepended by some text
      // (from Twitter, or web share api, etc.) -> let's just redirect to it
      // (because auto opening in new tab would be blocked by browser)
      var urlEnd = lastChunk;

      // Direct redirect  (this is abrupt)
      this.setState(prevState => ({
        actionID: actionID,
        infoMessage: "Redirecting to " + urlEnd + " ...",
        resourceUrl: null,
        thumb: null,
        textMessage: data.message,
        scanNotif: false
      }));
      this.teardown();
      console.debug("Redirect to " + urlEnd + " in 500ms...");
      window.setTimeout(function(){
        window.location = urlEnd;
      }, 500);

      return;
    }


    console.debug("Receiving shared text message");
    this.setState(prevState => ({
      actionID: actionID,
      resourceType: data.contentType,
      textMessage: data.message,
      resourceUrl: null,
      scanNotif: false
    }));
    this.teardown();

    // TODO look at content-type advertised in pusher message
    // TODO handle some other resource types:
    // - video
    // - generic file
    // - multiple resources at once
  }

  handleCastMulti(data) {
    //
    // Multiple
    //
    let actionID = data.actionID || this.state.actionID;

    var index = data.multiIndex;

    let mobileKey = "";
    this.crypto_algo = data.crypto_algo;
    if (data.crypto_iv) {
      this.crypto_iv = data.crypto_iv;
      console.debug("Got a crypto IV");
      // See handleCastSingle for definition of K, P, M, IV

      // Decoding the message M is straightforward
      let decryptedWords = Decrypt(data.crypto_algo, data.message, data.crypto_iv, this.symCryptoKey);
      data.message = decryptedWords.toString(CryptoJS.enc.Utf8);
      console.debug("Decrypted message " + index + ":" + data.message);

      // Decoding the filename is straightforward
      if (data.filename){
        // TODO make sure the filename *is* encrypted
        try {
          decryptedWords = Decrypt(data.crypto_algo, data.filename, data.crypto_iv, this.symCryptoKey);
          data.filename = decryptedWords.toString(CryptoJS.enc.Utf8);
          console.debug("  Decrypted filename: " + data.filename);
        } catch(error) {
          console.log("  Could not decrypt filename \"" + data.filename + "\" — maybe it wasn't encrypted?");
        }
      }

      // Decoding the resource will require a different key P, emitted by Mobile source.
      if(data.mobile_secret_scrambled) {
        let decryptedWords = Decrypt(data.crypto_algo, data.mobile_secret_scrambled, data.crypto_iv, this.symCryptoKey);
        mobileKey = decryptedWords.toString(CryptoJS.enc.Utf8);
        console.debug("Decrypted mobile secret: " + mobileKey);
      }
      if(data.message.startsWith("https://storage.googleapis.com")){
        // Fetch encrypted file
        let url = data.message;
        let xhr = new XMLHttpRequest();
        xhr.open('GET', url);
        xhr.responseType = "arraybuffer";
        let app = this;
        xhr.onload = function() {
          let arrayBuffer = xhr.response;
          if (arrayBuffer) {
            app.handleFetchedEncryptedResourceMulti(index, arrayBuffer, mobileKey);
          }else{
            console.warn("ahem, where is my arrayBuffer?");
          }
        };
        xhr.onerror = function() {
          console.warn("Failed to fetch resource :(");
        };
        xhr.send();
      }
    }

    if(data.thumb) {
      console.debug("  cast " + index + " has an attached thumb");
      // Display thumb smoothly until full resource is fetched.
      if (data.crypto_iv) {
        let decryptedWords = Decrypt(data.crypto_algo, data.thumb, data.crypto_iv, this.symCryptoKey);
        let data_b64 = CryptoJS.enc.Base64.stringify(decryptedWords);
        data.thumb = "data:image/jpeg;base64," + data_b64; // This thumb is always implicitly JPEG.
        // TODO: consider PNG, or other?
      }
      // TODO unblurry anim 0.4s?
    }

    this.setState(prevState => {
      let items = prevState.multiItems;
      if (!items || items.length!==parseInt(data.multiCount,10)) {
        items = [];
        for(var i=0;i<data.multiCount;i++)
          items.push(Object());
      }
      items[index].resourceUrl = data.message;
      items[index].resourceType = data.contentType;
      items[index].resourceFilename = data.filename;
      items[index].resourceResized = data.resized;
      items[index].resourceWidth = data.contentWidth;
      items[index].resourceHeight = data.contentHeight;
      return {
        actionID: actionID,
        multi: true,
        multiItems: items
      }
    });

    let encryption = data.crypto_iv ? true : false;
    if(this.multiFinished(encryption)) {
      this.multipleAllCastTime = new Date();
      this.teardown();
    }
  }

  handlePusherData(data) {
    switch(data.event) {
      case 'maze-scan':
        this.handleScanNotif(data);
        break;
      case 'maze-cast':
        console.debug('message = ' + data.message);
        this.handleCast(data);
        break;
      case 'maze-error':
        console.warn('Error message = ' + data.message);
        this.setState(prevState => ({
          errorMessage: data.message
        }));
        break;
      default:
        console.warn('Weird pusher event...');
        console.warn(data);
    }
  }

  handleFetchedEncryptedResourceSingle(arrayBuffer, mobileKey) {
    let tip = new Date().getTime();
    // Decrypt it
    var words = CryptoJS.lib.WordArray.create(arrayBuffer);
    let decryptedWords = DecryptWords(this.crypto_algo, words, this.crypto_iv, mobileKey);
    // Display/generate it to user
    let data_b64 = CryptoJS.enc.Base64.stringify(decryptedWords);
    let top = new Date().getTime();
    this.decryptDuration = (top -tip);
    console.debug("Decrypted ciphertext into base64 message of size " + data_b64.length + " in " + this.decryptDuration + "ms");
    this.setState(prevState => ({
      resourceData_b64: data_b64,
      scanNotif: false
    }));
    this.teardown();
  }

  handleFetchedEncryptedResourceMulti(index, arrayBuffer, mobileKey) {
    // Decrypt it
    var words = CryptoJS.lib.WordArray.create(arrayBuffer);
    let decryptedWords = DecryptWords(this.crypto_algo, words, this.crypto_iv, mobileKey);
    // Display/generate it to user
    let data_b64 = CryptoJS.enc.Base64.stringify(decryptedWords);
    console.debug("Decrypted ciphertext " + index + " into base64 message of size " + data_b64.length);

    this.setState(prevState => {
      //console.debug("Setting base64 data of item " + index);
      let items = prevState.multiItems;
      items[index].resourceData_b64 = data_b64;
      return {
        multi: true,
        multiItems: items
      }
    });

    if(this.multiFinished(true)) {
      this.multipleAllCastTime = new Date();
      this.teardown();
    }
  }

  expireQR() {
    if( this.pusher.connection.state !== 'connected' )
      return;
    console.debug("Closing idle channel, hiding QR-code");
    this.pusher.disconnect();
    this.setState(prevState => ({
      // magic value :(
      qrKey: "reload",
      // errorMessage: "Please reload",
    }));
  }

  embiggen() {
    this.setState(prevState => ({
      qrSize: 2 + (prevState.qrSize%6)
    }));
    localStorage.setItem('qrSize', 2 + (this.state.qrSize%6) );
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
    if(this.state.resourceUrl) {
      // From https://stackoverflow.com/a/37521282
      let link = document.createElement('a');
      link.setAttribute('href', this.state.resourceUrl);
      link.setAttribute('download', '');

      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      return;
    }

    if(this.state.resourceData_b64){
      let type = this.state.resourceType;
      let data = this.state.resourceData_b64;
      let filename = this.state.resourceFilename;
      console.debug("Download for type " + type + ", filename " + filename);
      let blob = base64toBlob(data, type);
      let objURL = URL.createObjectURL(blob);

      let dummy = document.createElement('a');
      dummy.setAttribute('href', objURL);
      dummy.setAttribute('download', filename);
      dummy.style.display = 'none';
      document.body.appendChild(dummy);
      dummy.click();
      document.body.removeChild(dummy);
      return;
    }

    console.warn("Oops, could not prepare single resource or download")
  }

  isZippable() {
    // The [Dowload all as ZIP] button is primarily intended to download
    // all shared resources at once.
    // However, it is also useful in the case of a partial download
    // (e.g. if some uploads succeeded and other uploads have failed).
    // Thus, in a multi-upload workflow we should show the button as soon as we
    // have at least 1 available resource.
    if(!this.state.multi)
      return false;
    var hasResource = false;
    this.state.multiItems.forEach(function(item){
      if(item.resourceUrl)
        hasResource = true;
    });
    return hasResource;
  }

  openAsDownloadZip() {
    if( !this.state.multiItems || this.state.multiItems.lenght===0 ) {
      console.warn("No resources to generate a ZIP...");
      return;
    }

    if(this.state.multiItems[0].resourceData_b64) {
      // E2EE: make zip from in-memory decrypted data
      MakeZipFromE2EE(this.state.multiItems, this.setZipProgress);
      return;
      // TODO what if we have some files... but not the 0th?
    }
    
    // Without E2EE: data is available at distant URLs.
    // For multiple resources, create a ZIP file
    var urls = [];
    this.state.multiItems.forEach(function(item){
      urls.push(item.resourceUrl);
    });
    MakeZip(urls, this.setZipProgress);
  }

  setZipProgress(ratio){
    this.setState(prevState => ({
      zipProgressRatio: ratio
    }));
  }

  toggleHelp() {
    this.setState(prevState => ({
      showHelp: !prevState.showHelp
    }));
  }

  clear() {
    this.initQR();
    this.setState(prevState => ({
      chanKey: this.chanKey,
      symCryptoKey: this.symCryptoKey,
      qrKey: this.qrKey,
      actionID: null,
      scanNotif: false,
      thumb: null,
      resourceUrl: null,
      resourceData_b64: null,
      resourceWebpageUrl: null,
      textMessage: null,
      youtubeID: null,
      errorMessage: null,
      showHelp: false,
      multi: false,
      multiItems: [],
      zipProgressRatio: null
    }));
    this.crypto_iv = null;
    this.fetchDuration = null;
    this.decryptDuration = null;
  }

  multiFinished(encryption) {
    var n = this.state.multiItems.length;
    var m = 0;

    if(encryption) {
      // We are "finished" as soon as all resources have been downloaded
      // TODO: and decrypted?
      for(let i=0; i<n; i++)
        if(this.state.multiItems[i].resourceData_b64)
          m++;
      let allFinished = (m===n);
      return allFinished;
    }else{
      // We are "finished" as soon as all resource URLs are known
      // TODO: and downloaded?
      for(let i=0; i<n; i++)
        if(this.state.multiItems[i].resourceUrl)
          m++;
      let allFinished = (m===n);
      return allFinished;
    }
  }

  unblurryThumb(index, durationMs) {
    console.debug("Animating .resource-thumb [" + index + "]"); 
    let th = document.getElementsByClassName("resource-thumb")[index];
    if(!th)
      return;
    th.style.filter = "blur(30px) contrast(110%)";
    th.animate([
      { filter: 'blur(30px)' }, 
      { filter: 'blur(3px)' }
    ], { 
      fill: "forwards",
      duration: durationMs,
      iterations: 1
    });
    // TODO what's the proper way without window.setTimeout??
  }

  quitPusherChannel() {
    if( !this.pusher  )
      return;
    if( this.pusher.connection.state !== "connected" ) {
      console.debug("Not closing channel because Pusher state: " + this.pusher.connection.state);
      return;
    }
    console.debug("Closing channel");
    this.pusher.disconnect();
  }

  teardown() {
    var qrToNotifDuration, qrToCastDuration;
    if ( this.qrDisplayTime ) {
      if( this.singleNotifTime )
        qrToNotifDuration = this.singleNotifTime - this.qrDisplayTime;
      if( this.singleCastTime )
        qrToCastDuration = this.singleCastTime - this.qrDisplayTime;
      if( this.multipleAllCastTime )
        qrToCastDuration = this.multipleAllCastTime - this.qrDisplayTime;
    }
    ackBackend(this.chanKey, this.state.actionID, qrToNotifDuration, qrToCastDuration, this.fetchDuration, this.decryptDuration);
    this.quitPusherChannel();
  }
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
    var resourceData_b64 = this.props.resourceData_b64;
    var resourceWebpageUrl = this.props.resourceWebpageUrl;
    var textMessage = this.props.textMessage;
    var youtubeID = this.props.youtubeID;
    var resourceFilename = this.props.resourceFilename;
    var resourceResized = this.props.resourceResized;
    var resourceWidth = this.props.resourceWidth;
    var resourceHeight = this.props.resourceHeight;
    var multi = this.props.multi;
    var multiItems = this.props.multiItems;
    var spinning = this.props.spinning;
    var openAsDownload = this.props.openAsDownload;
    var e2ee = this.props.e2ee;

    if (!thumb && !resourceUrl && !resourceData_b64 && !resourceWebpageUrl && !textMessage && !multi && !spinning)
      return (
        <div className="main">
          <QrZone 
            qrKey={this.props.qrKey} 
            qrSize={this.props.qrSize}
            clear={this.props.clear}
            embiggen={this.props.embiggen}
          />
        </div>
      );
    
    if(multi)
      return (
        <div className="main">
          <ZipProgress ratio={this.props.zipProgressRatio} />
          <InboxMulti
            items={multiItems}
            spinning={spinning}
          />
        </div>
      );

    return (
      <div className="main">
        <Inbox 
          thumb={thumb}
          resourceType={resourceType}
          resourceUrl={resourceUrl}
          resourceData_b64={resourceData_b64}
          resourceWebpageUrl={resourceWebpageUrl}
          textMessage={textMessage}
          resourceFilename={resourceFilename}
          resourceResized={resourceResized}
          resourceWidth={resourceWidth}
          resourceHeight={resourceHeight}
          youtubeID={youtubeID}
          spinning={spinning}
          openAsDownload={openAsDownload}
          e2ee={e2ee}
        />
      </div>
    );
  }
}

class Inbox extends Component {
  render() {
    return (
      <div id="inbox">
        <Item {...this.props} />
      </div>
    )
  }
}

class InboxMulti extends Component {
  render() {
      var items = this.props.items;
      var subBoxes = [];
      for (var i=0; i < items.length; i++) {
        subBoxes.push(
          <div className="multi-item" key={i}>
            <Item multiIndex={i}
                {...items[i]} 
                spinning={this.props.spinning} />
          </div>
        )
      }

      return (
        <div id="inbox-multi">
          {subBoxes}
        </div>
      );
  }
}

export default App;
