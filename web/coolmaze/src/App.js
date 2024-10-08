import React, { Component, Suspense } from 'react';
import {InitPushComponent, ListenToChannel, PusherTechName} from './serverpush.js';
import CryptoJS from 'crypto-js';

import {genRandomKey} from './qrkey.js';
import sha256 from './derive.js';
import {wakeUpBackend, ackBackend, partialAckBackend, using} from './backend.js';
import MobileBanner from './mobile-banner.js';
import TopBar from './topbar.js';
import MainZone from './mainzone.js';
import {MakeZip, MakeZipFromE2EE, ZipProgress} from './zip.js';
import {Decrypt, DecryptWords} from './e2ee.js';
import {base64toBlob, youtubeVideoID} from './util.js';
import {preDownload, preDownloaded} from './precast.js';
import schema from './img/schema.png';
import {StartWebRTC} from './webrtc.js';

import './App.css';

require('string.prototype.startswith');

const CM_CLIENT_PREFIX = "a/";

// No-op function
const noop = () => {};

class App extends Component {
  constructor(props) {
    super(props);

    this.toggleHelp = this.toggleHelp.bind(this);
    this.handleScanNotif = this.handleScanNotif.bind(this);
    this.handleCast = this.handleCast.bind(this);
    this.handlePushData = this.handlePushData.bind(this);
    this.handleBinary = this.handleBinary.bind(this);
    this.handleBinaryMultiple = this.handleBinaryMultiple.bind(this);
    this.handleBinaryProgress = this.handleBinaryProgress.bind(this);
    this.pushStopListening = noop;
    this.openInNewTab = this.openInNewTab.bind(this);
    this.openAsDownload = this.openAsDownload.bind(this);
    this.openAsDownloadZip = this.openAsDownloadZip.bind(this);
    this.setZipProgress = this.setZipProgress.bind(this);
    this.clear = this.clear.bind(this);
    this.embiggen = this.embiggen.bind(this);
    this._keydownHandler = this._keydownHandler.bind(this);

    this.initQR();

    let qrSize = parseInt(localStorage.getItem("qrSize"));
    if( ![2, 4, 6].includes(qrSize) )
      qrSize = 2; // default size

    this.state = {
      chanKey: this.chanKey,
      symCryptoKey: this.symCryptoKey,
      qrKey: this.qrKey,
      qrSize: qrSize,
      qrAnimClass: "qr-resize-1-to-" + qrSize,
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
      preDownloadedTtpf: {},  // can't be part of multiItems, before the real scan action
      zipProgressRatio: null,
      textMessage: null,
      infoMessage: null,
      errorMessage: null,
      showHelp: false
    }
    this.crypto_algo = null;
    this.crypto_iv = null;
    this.fetchDuration = null;
    this.prefetchDuration = null;
    this.decryptDuration = null;
    this.webrtcSDPExchangeDuration = null;
  }

  render() {
    var spinning = this.state.scanNotif;
    var e2ee = this.crypto_iv ? true : false;
    if(this.state.multi) {
      spinning = !this.multiFinished(e2ee);
    }
    var errorBox;
    if(this.state.errorMessage) {
      spinning = false;
      errorBox = <div className="error-box">{this.state.errorMessage}</div>;
    }

    return (
      <Suspense fallback="loading">
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
            qrAnimClass={this.state.qrAnimClass}
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
            resourceDownloadProgress={this.state.resourceDownloadProgress}
          />
        </div>
      </Suspense>
    );
  }

  initQR() {
    // Closes any preexisting connection,
    // then chooses a fresh random key,
    // then connects to push channel.

    window.clearTimeout(this.qrtimeout);

    this.pushStopListening();

    this.symCryptoKey = "";
    this.qrKey = "";
    if(!window.navigator.onLine) {
      return;
    }
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
    InitPushComponent();
    console.debug("Listening to [" + this.chanKey + "]");
    this.qrDisplayTime = new Date();
    this.singleNotifTime = null;
    this.singleCastTime = null;
    this.multipleAllCastTime = null;

    this.pushStopListening = ListenToChannel(this.chanKey, this.handlePushData);

    wakeUpBackend(this.chanKey);

    var that = this;
    this.qrtimeout = window.setTimeout(function(){
        that.expireQR();
    }, 10 * 60 * 1000);

    // Current tab suddenly visible again => Refresh idle QR
    document.addEventListener("visibilitychange", function() {
      if( that.state.qrKey==="reload" && document.visibilityState === "visible" && !that.hasAnyResource() ) {
        console.debug( "Welcome back (visible), new QR" );
        that.clear();
      }
    });

    // Browser window suddenly gets focus again => Refresh idle QR
    window.addEventListener("focus", function(event) {
      if( that.state.qrKey==="reload" && !that.hasAnyResource() ) {
        console.debug( "Welcome back (focus), new QR" );
        that.clear();
      }
    });

    // Suddenly losing internet
    window.addEventListener("offline", function(event) {
      console.log("Lost connectivity :(");
      if(!that.hasAnyResource())
        that.expireQR();
    });

    // Suddenly recovering internet
    window.addEventListener("online", function(event) {
      console.debug( "Connectivity is back :)" );
      if( that.state.qrKey==="reload" && !that.hasAnyResource() ) {
        console.debug( "Welcome back online, new QR" );
        that.clear();
      }
    });

    window.addEventListener("keydown", that._keydownHandler, true);

    // Warning: this does NOT update this.state.
  }

  // Has single resource already arrived?
  hasResource() {
    return (this.state.resourceUrl || this.state.resourceData_b64) ? true : false;
  }

  // Same as hasResource, but also checks for multiple resources
  hasAnyResource() {
    if( this.state.resourceUrl )
      return true;
    if( this.state.resourceData_b64 )
      return true;
    if( this.state.multiItems.length > 0 )
      return true;
    return false;
  }

  _keydownHandler(event){
    //console.log(event);
    if(event.code == "Escape") {
      // Esc can mean "quit" for 2 different things:
      // If a lightbox is displayed fullscreen, just quit the lightbox.
      // Otherwise, reset the app and display a fresh new QR.
      let lightbox = document.querySelector("img.lightbox");
      if( lightbox ) {
        lightbox.classList.remove('lightbox');
      }else {
        // Fresh new QR
        this.clear();
      }
      return;
    }

    if(event.key == "h") {
      // H => Help
      this.toggleHelp();
      return;
    }

    if(event.key == "o") {
      // O => Open in new tab
      this.openInNewTab();
    }


    if(event.key == "f") {
      // F => Display received picture in Fullscreen
      let existingLightbox = document.querySelector("img.lightbox");
      if( existingLightbox ) {
        // When an element is already displayed in a fullscreen lightbox, just close it
        existingLightbox.classList.remove('lightbox');
        return;
      }
      let firstItem = document.getElementById("item-0");
      if(!firstItem) {
        console.log("No picture to show fullscreen");
        return;
      }
      let fullscreen = firstItem.classList.toggle("lightbox");
      if(fullscreen) {
        let suffix = this.state.multi ? "/0" : "";
        using("item/lightbox" + suffix);
      }
    }

    if(event.key == "ArrowLeft") {
      let existingLightbox = document.querySelector("img.lightbox");
      if( !existingLightbox )
        return;
      let id = existingLightbox.id; // "item-3"
      let i = parseInt(id.slice(5), 10); // -> 3
      if( i <= 0 )
        return; // Do not wrap around
      let j = i-1;
      let newLightbox = document.getElementById(`item-${j}`);
      existingLightbox.classList.remove('lightbox');
      newLightbox.classList.add('lightbox');
      using(`lightbox/previous/${j}`);
    }

    if(event.key == "ArrowRight") {
      let existingLightbox = document.querySelector("img.lightbox");
      if( !existingLightbox )
        return;
      let id = existingLightbox.id; // "item-3"
      let i = parseInt(id.slice(5), 10); // -> 3
      let j = i+1;
      let newLightbox = document.getElementById(`item-${j}`);
      if( !newLightbox )
        return; // Do not wrap around
      existingLightbox.classList.remove('lightbox');
      newLightbox.classList.add('lightbox');
      using(`lightbox/next/${j}`);
    }

    if(event.key == "d") {
      // D => Download
      if(!this.hasAnyResource()) {
        console.log("No resource to download yet");
        return false;
      }
      if ( this.isZippable() ) {
        this.openAsDownloadZip();
      }else{
        this.openAsDownload();
      }
    }

    if(event.key == "+")
      this.embiggenOnly();

    if(event.key == "-")
      this.ensmallenOnly();

    if(event.key == "?") {
      // ? => Show all keyboard shortcuts
      window.alert(`Keyboard shortcuts:

    Esc : Clear & start new action
    f : Fullscreen picture
    d : Download resource
    o : Open resource in a new tab
    h : Show help
    + : Bigger QR code
    ? : Show keyboard shortcuts`);
    }
  };

  handleScanNotif(data) {
    if(this.state.textMessage) {
      console.debug("Ignoring scan notif because single text message has already arrived");
      return;
    }

    if(this.state.resourceData_b64) {
      console.debug("Ignoring scan notif because single encrypted resource has already arrived");
      return;
    }

    if(this.state.resourceUrl) {
      //console.debug("Ignoring scan notif because single resource URL has already arrived");
      //return;
      // Actually a thumbnail could be useful, if the encrypted picture is not fully downloaded yet...
    }

    let encryption = data.crypto_iv ? true : false;
    if(this.state.multi && this.multiFinished(encryption)) {
      console.debug("Ignoring scan notif " + data.multiIndex + " because all the resources have already arrived");
      return;
    }

    this.crypto_algo = data.crypto_algo || this.crypto_algo;
    if (encryption) {
      this.crypto_iv = data.crypto_iv;
      console.debug("Found encryption ", this.crypto_algo);
      let decryptedWords = Decrypt(data.crypto_algo, data.message, data.crypto_iv, this.symCryptoKey);
      let data_b64 = CryptoJS.enc.Base64.stringify(decryptedWords);
      console.debug("Decrypted scan notif ciphertext of size " + data.message.length + " into base64 message of size " + data_b64.length);
      console.debug("Decrypted thumb " + (data.multiIndex || ""));
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
      window.setTimeout( this.unblurryThumb.bind(this, 0, 1000), 20 ); // TODO what's the proper way??
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
      console.debug(`Received thumbnail of resource ${index}/${data.multiCount}`);
      item.thumb = data.message;
      window.setTimeout( this.unblurryThumb.bind(this, index, 1000), 20 ); // TODO what's the proper way??
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

  handlePreCast(data) {
    console.debug("Gentle wind of encrypted data");
    preDownload(this, data);
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
    this.pushStopListening();

    this.singleCastTime = new Date();
    if(this.qrDisplayTime)
      console.debug("Got single message after " + (this.singleCastTime-this.qrDisplayTime) + "ms");

    let mobileKey = "";
    this.crypto_algo = data.crypto_algo || this.crypto_algo;
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
        window.setTimeout( this.unblurryThumb.bind(this, 0, 150), 10 ); // TODO what's the proper way??
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
        if(preDownloaded[url]) {
          if( preDownloaded[url]==="PREFETCHING" ) {
            // issues/526
            // The resource is already being downloaded by prefetching.
            // Better wait for completion, instead of downloading again!
            console.debug("joining prefetch still downloading");
            let that = this;
            preDownloaded[url] = function(lateArrayBuffer){ 
              that.handleFetchedEncryptedResourceSingle(lateArrayBuffer, mobileKey);
            };
          } else {
            let prefetchedResource = preDownloaded[url];
            console.debug(`Resource already prefetched (${prefetchedResource.byteLength} bytes): ${url}`);
            let arrayBuffer = prefetchedResource;
            // This will kick in just after a short thumbnail unblur
            window.setTimeout( this.handleFetchedEncryptedResourceSingle.bind(this, arrayBuffer, mobileKey), 165 ); 
          }
        } else {
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
          // Stop here (see fetch handlers above)
        }
        this.setState(prevState => ({
          actionID: actionID,
          resourceType: data.contentType,
          resourceFilename: data.filename,
          resourceResized: data.resized,
          resourceWidth: data.contentWidth,
          resourceHeight: data.contentHeight
        }));
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
        }),
        this.teardown);
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
        }),
        this.teardown);
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
        }),
        this.teardown  // TODO no ack until resource has been downloaded (& decrypted?)
      );
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
        }),
        this.teardown);
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
        }),
        this.teardown);
      
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
      }),
      this.teardown);
  }

  handleCastMulti(data) {
    //
    // Multiple
    //
    let actionID = data.actionID || this.state.actionID;

    var index = data.multiIndex;

    let mobileKey = "";
    this.crypto_algo = data.crypto_algo || this.crypto_algo;
    let encryption = data.crypto_iv ? true : false;
    if (encryption) {
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
          console.warn("  Could not decrypt filename \"" + data.filename + "\" — maybe it wasn't encrypted?");
        }
      }

      // Decoding the resource will require a different key P, emitted by Mobile source.
      if(data.mobile_secret_scrambled) {
        let decryptedWords = Decrypt(data.crypto_algo, data.mobile_secret_scrambled, data.crypto_iv, this.symCryptoKey);
        mobileKey = decryptedWords.toString(CryptoJS.enc.Utf8);
        console.debug("Decrypted mobile secret: " + mobileKey);
      }
      if(data.message.startsWith("https://storage.googleapis.com")){
        let url = data.message;
        if( preDownloaded[url]==="PREFETCHING" ) {
          // issues/526
          // The resource is already being downloaded by prefetching.
          // Better wait for completion, instead of downloading again!
          console.debug(`joining prefetch ${index} still downloading`);
          let that = this;
          preDownloaded[url] = function(lateArrayBuffer){ that.handleFetchedEncryptedResourceMulti(index, lateArrayBuffer, mobileKey, null); };
        } else {
          // Fetch encrypted file
          let prefetchedResource = preDownloaded[url];
          if(prefetchedResource) {
            console.debug(`Resource already prefetched (${prefetchedResource.byteLength} bytes): ${url}`);
            let arrayBuffer = prefetchedResource;
            // This will kick in just after a short thumbnail unblur
            window.setTimeout( this.handleFetchedEncryptedResourceMulti.bind(this, index, arrayBuffer, mobileKey, null), 165 ); 
          } else {
            let xhr = new XMLHttpRequest();
            xhr.open('GET', url);
            xhr.responseType = "arraybuffer";
            let app = this;
            let tip = performance.now();
            xhr.onload = function() {
              let arrayBuffer = xhr.response;
              if (arrayBuffer) {
                let top = performance.now();
                let fetchDuration = Math.round(top -tip);
                app.handleFetchedEncryptedResourceMulti(index, arrayBuffer, mobileKey, fetchDuration);
              } else {
                console.warn("ahem, where is my arrayBuffer?");
              }
            };
            xhr.onerror = function() {
              console.warn(`Failed to fetch resource ${index} :(`);
            };
            xhr.send();
          }
        }
      }
    }

    if(data.thumb) {
      console.debug("  cast " + index + " has an attached thumb");
      // Display thumb smoothly until full resource is fetched.
      if (encryption) {
        let decryptedWords = Decrypt(data.crypto_algo, data.thumb, data.crypto_iv, this.symCryptoKey);
        let data_b64 = CryptoJS.enc.Base64.stringify(decryptedWords);
        data.thumb = "data:image/jpeg;base64," + data_b64; // This thumb is always implicitly JPEG.
        // TODO: consider PNG, or other?
        console.debug("  decrypted thumb " + index);
      }
      window.setTimeout( this.unblurryThumb.bind(this, index, 200), 20 ); // TODO what's the proper way??
    }

    let that = this;

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
      items[index].thumb = data.thumb || items[index].thumb;
      return {
        actionID: actionID,
        multi: true,
        multiItems: items
      }
    }, function() {
      // This is never supposed to be called, because we don't do clear text multiple sharing.
      // So multiFinished is returning false (at least one resourceData_b64 is missing at this point).
      // TODO either unlock multiple clear text sharing from iOS, or remove this dead code.
      if(that.multiFinished(encryption)) {
        that.multipleAllCastTime = new Date();
        that.teardown();
      }
    });
  }


  handleStream(data) {
    // This will initiate a WebRTC connection.
    // The mobile device is the "caller" and the browser target is the "callee"
    let actionID = data.actionID || this.state.actionID;
    this.setState(prevState => ({
      actionID: actionID,
    }));

    // TODO: adjust the semantic, when WebRTC will accept multiple share
    this.singleNotifTime = new Date();

    StartWebRTC(this.chanKey, data, this.handleBinaryProgress, this.handleBinary);
  }

  handleBinaryProgress(resources) {
    // Data being received via WebRTC.
    // WebRTC is natively, transparently E2EE, and the data received is
    // now cleartext. No need to decipher with keys.

    // Compute a summary of the resources currently being downloaded:
    // Filename, Type, Size, % finished.
    let progress = [];
    for (const r of resources) {
      let item = {
        filename: r.Filename,
        contentType: r.ContentType,
        size: r.Size,
        ratioDownloaded: 0.0,
      };
      if(r.bytesReceived && r.Size)
        item.ratioDownloaded = (r.bytesReceived / r.Size);
      progress.push(item);
    }
    this.setState(prevState => ({
      resourceDownloadProgress: progress,
    }));
  }

  handleBinary(resources, downloadDuration, webrtcSDPExchangeDuration) {
    // Data freshly received via WebRTC.
    // WebRTC is natively, transparently E2EE, and the data received is
    // now cleartext. No need to decipher with keys.

    if(resources.length >= 2) {
      this.handleBinaryMultiple(resources);
      return;
    }

    this.fetchDuration = downloadDuration;
    this.webrtcSDPExchangeDuration = webrtcSDPExchangeDuration;

    // Handle single resource:
    let resource = resources[0];

    function _arrayBufferToBase64( buffer ) {
      var binary = '';
      var bytes = new Uint8Array( buffer );
      var len = bytes.byteLength;
      for (var i = 0; i < len; i++) {
          binary += String.fromCharCode( bytes[ i ] );
      }
      return window.btoa( binary );
    }

    // b64 URI doesn't work when the resource is very large (e.g. 100MB)
    // consider another field resourceData_arrayBuffer instead

    this.setState(prevState => ({
        resourceDownloadProgress: null,
        resourceData_b64: _arrayBufferToBase64(resource.data),
        resourceType: resource.ContentType,
        resourceFilename: resource.Filename,
      }),
      this.teardown);
  }

  handleBinaryMultiple(resources) {
    // TODO would be nicer to refactor this and
    // have webrtc.js provide thumbs and resources, as they arrive,
    // instead of all at once at the end.
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
      items[index].thumb = data.thumb || items[index].thumb;
      return {
        actionID: actionID,
        multi: true,
        multiItems: items
      }
    });
  }

  handlePushData(data) {
    //console.log("Push data: " + JSON.stringify(data));
    switch(data.event) {
      case 'maze-scan':
        this.handleScanNotif(data);
        break;
      case 'maze-pre-cast':
        // console.debug('message = ' + data.message);
        this.handlePreCast(data);
        break;
      case 'maze-cast':
        // console.debug('message = ' + data.message);
        this.handleCast(data);
        break;
      case 'maze-pre-stream':
        // NYI: #589
        break;
      case 'maze-stream':
        this.handleStream(data);
        break;
      case 'maze-error':
        console.warn('Error message = ' + data.message);
        this.setState(prevState => ({
          errorMessage: data.message
        }));
        break;
      default:
        console.warn('Unexpected push event type', data.event);
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
      }),
      this.teardown);
  }

  handleFetchedEncryptedResourceMulti(index, arrayBuffer, mobileKey, fetchDuration) {
    //console.debug(`handleFetchedEncryptedResourceMulti(${index}, arrayBuffer ${arrayBuffer.byteLength} bytes, ${mobileKey}, ${fetchDuration})`)
    // Decrypt it
    let tip = performance.now();
    var words = CryptoJS.lib.WordArray.create(arrayBuffer);
    let decryptedWords = DecryptWords(this.crypto_algo, words, this.crypto_iv, mobileKey);
    // Display/generate it to user
    let data_b64 = CryptoJS.enc.Base64.stringify(decryptedWords);
    let top = performance.now();
    console.debug("Decrypted ciphertext " + index + " into base64 message of size " + data_b64.length);
    let ttd = Math.round(top-tip);
    let ttpf = this.state.preDownloadedTtpf[index];

    // let isMultiFinished = this.multiFinished(true);
    // No, at this point the state has not been updated yet (see below) and we're can't rely
    // on its future state after the callback may or may not have been called async.
    // Instead, let's compute if "with this extra item, we're reaching the count"
    let isMultiFinished = ((this.multiFinishedCount(true) + 1) == this.state.multiItems.length);

    let that = this;

    this.setState(prevState => {
        //console.debug("Setting base64 data of item " + index);
        let items = prevState.multiItems;
        items[index].resourceData_b64 = data_b64;
        return {
          multi: true,
          multiItems: items
        }
      }, function() {
        let ttf = fetchDuration;
        let filenameIsUnknown = that.isUnknown(that.state.multiItems[index].resourceFilename);
        let durations = {
          "prefetch": ttpf,
          "fetch": ttf,
          "decrypt": ttd,
        };
        partialAckBackend(that.chanKey, that.state.actionID, index, that.state.multiItems.length, durations, filenameIsUnknown);
    
        if(isMultiFinished) {
          that.multipleAllCastTime = new Date();
          that.teardown();
        }
      });

  }

  isUnknown(filename) {
    // A "filename unknown" is when the original resource filename is not known, probably
    // because the mobile source device could not could not determine it.
    // It may be falsy (false, undefined, null, empty string) or a placeholder ("coolmaze-shared-content")
    if(!filename)
      return true;
    if(filename.startsWith("coolmaze-shared-content"))
      return true;
    if(filename.startsWith("shared-image"))
      return true;
    return false;
  }

  expireQR() {
    if( this.hasAnyResource() ) {
      // Don't mess with state if the resource is already there!
      // At this point, push unsubscribe should have been already done.
      return;
    }
    console.debug("Closing idle channel, hiding QR-code");
    this.pushStopListening();
    this.setState(prevState => ({
      // magic value :(
      qrKey: "reload",
      // errorMessage: "Please reload",
    }));
  }

  embiggen() {
    let newSize = 2 + (this.state.qrSize%6);
    this.setState(prevState => ({
      qrSize: newSize,
      qrAnimClass: "qr-resize-" + prevState.qrSize + "-to-" + newSize,
    }));
    localStorage.setItem('qrSize', newSize );
    using(`embiggen/${newSize}`);
  }

  embiggenOnly() {
    // Like embiggen(), but stops at max size (do not wrap)
    if(this.state.qrSize >= 6)
      return;
    this.embiggen();
  }

  ensmallenOnly() {
    // Reduce QR code size, and stop at min size (do not wrap)
    if(this.state.qrSize <= 2)
      return;
    let newSize = this.state.qrSize - 2;
    this.setState(prevState => ({
      qrSize: newSize,
      qrAnimClass: "qr-resize-" + prevState.qrSize + "-to-" + newSize,
    }));
    localStorage.setItem('qrSize', newSize );
    using(`ensmallen/${newSize}`);
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
    console.log("No resource to open in new tab, yet");
  }

  openAsDownload() {
    using("download/single");

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
    var hasResourceFromMulti = false;
    this.state.multiItems.forEach(function(item){
      if(item.resourceUrl)
        hasResourceFromMulti = true;
    });
    return hasResourceFromMulti;
  }

  openAsDownloadZip() {
    if( !this.state.multiItems || this.state.multiItems.length===0 ) {
      console.warn("No resources to generate a ZIP...");
      return;
    }

    if(this.state.multiItems[0].resourceData_b64) {
      using(`download/zip/${this.state.multiItems.length}`);
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
    if(!this.state.showHelp) {
      // User is accessing the Help box
      using("help");
    }

    this.setState(prevState => ({
      showHelp: !prevState.showHelp
    }));
  }

  clear() {
    this.initQR();
    if(!window.navigator.onLine) {
      // Offline? Then no QR.
      console.log("Not online, no QR.");
      return;
    }
    this.setState(prevState => ({
      chanKey: this.chanKey,
      symCryptoKey: this.symCryptoKey,
      qrKey: this.qrKey,
      actionID: null,
      scanNotif: false,
      thumb: null,
      resourceUrl: null,
      resourceDownloadProgress: null,
      resourceData_b64: null,
      resourceWebpageUrl: null,
      textMessage: null,
      youtubeID: null,
      errorMessage: null,
      showHelp: false,
      multi: false,
      multiItems: [],
      preDownloadedTtpf: {},
      zipProgressRatio: null
    }));
    this.crypto_algo = null;
    this.crypto_iv = null;
    this.fetchDuration = null;
    this.prefetchDuration = null;
    this.decryptDuration = null;
    this.webrtcSDPExchangeDuration = null;
  }

  multiFinishedCount(encryption) {
    let n = this.state.multiItems.length;
    var m = 0;

    if(encryption) {
      // We are "finished" as soon as all resources have been downloaded
      // TODO: and decrypted?
      for(let i=0; i<n; i++)
        if(this.state.multiItems[i].resourceData_b64)
          m++;
      return m;
    }else{
      // We are "finished" as soon as all resource URLs are known
      // TODO: and downloaded?
      for(let i=0; i<n; i++)
        if(this.state.multiItems[i].resourceUrl)
          m++;
      return m;
    }
  }

  multiFinished(encryption) {
    let n = this.state.multiItems.length;
    let m = this.multiFinishedCount(encryption);
    let allFinished = (m===n);
    return allFinished;
  }

  unblurryThumb(index, durationMs) {
    console.debug(`Animating #thumb-${index} for ${durationMs}ms`); 
    let th = document.getElementById(`thumb-${index}`);
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

  teardown() {
    console.debug("Tearing down");
    var qrToNotifDuration, qrToCastDuration;
    if ( this.qrDisplayTime ) {
      if( this.singleNotifTime )
        qrToNotifDuration = this.singleNotifTime - this.qrDisplayTime;
      if( this.singleCastTime )
        qrToCastDuration = this.singleCastTime - this.qrDisplayTime;
      if( this.multipleAllCastTime )
        qrToCastDuration = this.multipleAllCastTime - this.qrDisplayTime;
    }

    let isSample = (this.state.resourceUrl || "").startsWith("https://storage.googleapis.com/cool-maze.appspot.com/sample");

    // Report "filename unknown" when...
    let singleFilenameIsUnknown =
      this.hasResource()       // we do have a resource (not a mere text or URL)
      && (!this.state.multi)   // which is not a multiple share action (reported elsewhere in /partial-ack)
      && (!isSample)           // which is not the sample share (a resource without a provided filename)
      && this.isUnknown(this.state.resourceFilename); // where we have no filename, or just a placeholder filename

    let durations = {
      "qrToNotif": qrToNotifDuration,
      "qrToCast": qrToCastDuration,
      "prefetch": this.prefetchDuration,
      "fetch": this.fetchDuration,
      "decrypt": this.decryptDuration,
      "webrtcSDPExchange": this.webrtcSDPExchangeDuration,
    };
    ackBackend(this.chanKey, this.state.actionID, durations, singleFilenameIsUnknown);
    this.pushStopListening();

    this.setState(prevState => ({
      qrKey: "",
    }));
  }
  
  componentDidMount() {
    // Preload image for the Help box
    // See https://stackoverflow.com/a/50227675/871134
    window.setTimeout( ()=> { new Image().src = schema; }, 400);
  }
}


export default App;
