import React, { Component, Suspense } from 'react';
import { withTranslation } from 'react-i18next';
import { InitPushComponent, ListenToChannel, PusherTechName } from './serverpush.js';

import { backendHost, errorBackend, warningBackend, wakeUpBackend, ackBackend,
  partialAckBackend, previewAckBackend, using, tabClosedBeacon,
  userCancelBeacon } from './backend.js';
import { genRandomKey } from './qrkey.js';
import sha256 from './derive.js';
import MobileBanner from './mobile-banner.js';
import TopBar from './topbar.js';
import MainZone from './mainzone.js';
import { Decrypt, DecryptWords, bytesToBase64, bytesToUtf8 } from './e2ee.js';
import { youtubeVideoID, detectImageMimeType, formatBytesToHex } from './util.js';
import { preDownload, preDownloaded } from './precast.js';
import schema from './img/schema.png';
import { StartWebRTC } from './webrtc.js';
import { createKeydownHandler } from './keyboard.js';
import { createDownloadActions } from './download.js';

import './App.css';

require('string.prototype.startswith');

const CM_CLIENT_PREFIX = (process.env.REACT_APP_web_client_prefix || "a");

// No-op function
const noop = () => { };

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
    this.handleWebRTCError = this.handleWebRTCError.bind(this);
    this.pushStopListening = noop;
    // Whether we are currently subscribed to the push channel. Gates the tab-closed
    // beacon: once we stop listening (teardown after a completed share, channel closed,
    // QR expired…) there is nothing to interrupt, so no beacon should be sent.
    this.listening = false;
    // Download / export actions (openAsDownload, openAsDownloadZip, isZippable,
    // setZipProgress, downloadFile) live in download.js; assign them onto the
    // instance so props and this.*() call sites keep working.
    Object.assign(this, createDownloadActions(this));
    this.onRotateResource = this.onRotateResource.bind(this);
    this.clear = this.clear.bind(this);
    this.embiggen = this.embiggen.bind(this);
    this._keydownHandler = createKeydownHandler(this);

    this.initQR();

    let qrSize = parseInt(localStorage.getItem("qrSize"));
    if (![2, 4, 6].includes(qrSize))
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
    this.crypto_iv = null; // TODO remove obsolete crypto_iv (soonish)
    this.fetchDuration = null;
    this.prefetchDuration = null;
    this.decryptDuration = null;
    this.webrtcSDPExchangeDuration = null;
    // #flip-card: the "flip card" reveal animation (QR flips away, Preview flips
    // in) runs at most once per action, either at maze-scan or at maze-cast.
    this.flipCardDone = false;
    // While the flip is playing (QR-out + Preview-in, ~300ms), the UI must not
    // be updated by newer data (e.g. the full-resolution picture arriving right
    // after the Preview): the whole animation should always be seen. Any such
    // update is deferred through runAfterFlip() and applied (FIFO) once the flip
    // ends.
    this.flipInProgress = false;
    this.pendingAfterFlip = [];

    let h = window.location.hash;
    if (h) {
      // User may have scanned a Cool Maze QR code with a standard QR scanner app,
      // which then opened the current URL in the mobile browser
      if (h.match(/^#[a-zA-Z]\/[a-zA-Z0-9\-.]{10,}$/)) {
        // This is a Cool Maze QR code, let's use it
        let client = h.substring(1, 2);
        let key = h.substring(3);
        console.debug("Ignoring scanned key " + key);
        using(`scanned/browser/${client}`);
      } else {
        console.error("Unexpected hash: " + h)
      }
    }
  }

  render() {
    const { t } = this.props;
    var spinning = this.state.scanNotif;
    var e2ee = (this.crypto_algo || this.crypto_iv) ? true : false;
    if (this.state.multi) {
      spinning = !this.multiFinished(e2ee);
    }
    var errorBox;
    if (this.state.errorMessage) {
      spinning = false;
      errorBox = <div className="error-box">{this.state.errorMessage}</div>;
    }

    // Once resource(s) have been received and displayed, hide the bug notice.
    var received = !!(this.state.thumb || this.state.resourceUrl || this.state.resourceData_b64
      || this.state.resourceWebpageUrl || this.state.textMessage || this.state.multi);

    return (
      <div className="App">
        <div className="promodomain">
          {process.env.REACT_APP_app_short_domain}
        </div>
        <TopBar
          helpAction={this.toggleHelp}
          clear={this.clear}
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
          actionID={this.state.actionID}
          chanKey={this.chanKey}
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
          onRotateResource={this.onRotateResource}
          e2ee={e2ee}
          resourceDownloadProgress={this.state.resourceDownloadProgress}
        />
        {!received &&
          <div className="bug-notice">
            <details>
              <summary>{t('bugNotice.summary')}</summary>
              {t('bugNotice.explanation')} <a href="https://blog.pushto.computer/posts/021-what-s-in-a-name/" target="_blank">{t('bugNotice.inTheBlog')}</a>
            </details>
          </div>
        }

      </div>
    );
  }

  initQR() {
    // Closes any preexisting connection,
    // then chooses a fresh random key,
    // then connects to push channel.

    window.clearTimeout(this.qrtimeout);

    this.stopListening();

    this.symCryptoKey = "";
    this.qrKey = "";
    if (!window.navigator.onLine) {
      return;
    }
    this.symCryptoKey = genRandomKey();
    this.qrKey = CM_CLIENT_PREFIX + "/" + this.symCryptoKey;

    // The page title might be "resource filename", needs reset
    const { t } = this.props;
    document.title = process.env.REACT_APP_app_name + " - " + t("tagline");

    let that = this;
    sha256(this.symCryptoKey).then(function (chanKey) {
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
    this.listening = true;

    wakeUpBackend(this.chanKey, CM_CLIENT_PREFIX);

    var that = this;
    this.qrtimeout = window.setTimeout(function () {
      that.expireQR();
    }, 10 * 60 * 1000);

    // Current tab suddenly visible again => Refresh idle QR
    document.addEventListener("visibilitychange", function () {
      if (that.state.qrKey === "reload" && document.visibilityState === "visible" && !that.hasAnyResource()) {
        console.debug("Welcome back (visible), new QR");
        that.clear();
      }
    });

    // Browser window suddenly gets focus again => Refresh idle QR
    window.addEventListener("focus", function (event) {
      if (that.state.qrKey === "reload" && !that.hasAnyResource()) {
        console.debug("Welcome back (focus), new QR");
        that.clear();
      }
    });

    // Suddenly losing internet
    window.addEventListener("offline", function (event) {
      console.log("Lost connectivity :(");
      if (!that.hasAnyResource())
        that.expireQR();
    });

    // Suddenly recovering internet
    window.addEventListener("online", function (event) {
      console.debug("Connectivity is back :)");
      if (that.state.qrKey === "reload" && !that.hasAnyResource()) {
        console.debug("Welcome back online, new QR");
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
    if (this.state.resourceUrl)
      return true;
    if (this.state.resourceData_b64)
      return true;
    if (this.state.multiItems.length > 0)
      return true;
    return false;
  }

  async handleScanNotif(data) {
    if (this.state.textMessage) {
      console.debug("Ignoring scan notif because single text message has already arrived");
      return;
    }

    if (this.state.resourceData_b64) {
      console.debug("Ignoring scan notif because single encrypted resource has already arrived");
      return;
    }

    if (this.state.resourceUrl) {
      //console.debug("Ignoring scan notif because single resource URL has already arrived");
      //return;
      // Actually a thumbnail could be useful, if the encrypted picture is not fully downloaded yet...
    }

    var encryption = (data.crypto_algo || data.crypto_iv) ? true : false;
    if (this.state.multi && this.multiFinished(encryption)) {
      console.debug("Ignoring scan notif " + data.multiIndex + " because all the resources have already arrived");
      return;
    }

    this.crypto_algo = data.crypto_algo || this.crypto_algo;
    this.crypto_iv = data.crypto_iv || this.crypto_iv;  // TODO remove obsolete crypto_iv (soonish)

    if(data.crypto_iv) {
      errorBackend(this.state.actionID, this.chanKey, "Received obsolete crypto_iv");
    }

    if (encryption) {
      console.debug("Encryption =", this.crypto_algo);
      let i = 0;
      if (data.multiIndex)
        i = data.multiIndex;
      if (data[`crypto_iv_thumb_${i}`])
        console.debug(`using data.crypto_iv_thumb_${i}`);
      else {
        console.debug("fallback using obsolete data.crypto_iv for preview :(");
        if(data.crypto_iv) {
          errorBackend(this.state.actionID, this.chanKey, `Missing crypto_iv_thumb_${i} for preview, using obsolete crypto_iv`);
        }
      }
      let iv = data[`crypto_iv_thumb_${i}`] || data.crypto_iv;
      let thumbData = data.thumb || data.message;
      if (thumbData) {
        let decryptedBytes = await Decrypt(data.crypto_algo, thumbData, iv, this.symCryptoKey);

        // We're expecting a proper preview image. Does this binary data look like an image?
        if(detectImageMimeType(decryptedBytes) == null) {
          let firstBytes = formatBytesToHex(decryptedBytes, 4);
          errorBackend(this.state.actionID, this.chanKey, `Preview ${i}: unexpected first bytes ${firstBytes}`);
        }

        let data_b64 = bytesToBase64(decryptedBytes);
        console.debug("Decrypted scan notif ciphertext of size " + thumbData.length + " into base64 message of size " + data_b64.length);
        console.debug("Decrypted thumb " + (data.multiIndex || ""));
        data.thumb = "data:image/jpeg;base64," + data_b64;
        // This thumb is always implicitly JPEG.
        // TODO: consider PNG, or other?
        previewAckBackend(data.actionID, i, data.multiCount || 1);
      }

      // Decrypt the filename here too, so the user gets this lightweight clue
      // early (alongside the Preview, while the heavy resource is still being
      // transferred). We only ever propagate a *decrypted* filename downstream:
      // if we can't decrypt it (missing IV/algo/key, or a decryption error), we
      // drop data.filename so handleScanNotifSingle leaves resourceFilename
      // untouched rather than storing ciphertext — which otherwise surfaced as
      // garbage in the image hint (title attribute) and the download filename.
      if (data.filename) {
        let filenameIV = data[`crypto_iv_filename_${i}`];
        if (filenameIV && data.crypto_algo && this.symCryptoKey) {
          try {
            let decryptedBytes = await Decrypt(data.crypto_algo, data.filename, filenameIV, this.symCryptoKey);
            data.filename = bytesToUtf8(decryptedBytes);
            console.debug("Decrypted scan notif filename: " + data.filename);
          } catch (err) {
            console.warn("Could not decrypt scan notif filename, dropping it:", err);
            delete data.filename;
          }
        } else {
          console.debug("Scan notif filename not decryptable yet (missing IV/algo/key), dropping it");
          delete data.filename;
        }
      }
    } else {
      errorBackend(this.state.actionID, this.chanKey, `No encryption in scan notif`);
    }

    if (data.multiCount && data.multiCount > 1)
      this.handleScanNotifMulti(data);
    else
      this.handleScanNotifSingle(data);
  }

  handleScanNotifSingle(data) {
    //
    // Single message or resource
    //
    this.singleNotifTime = new Date();
    if (this.qrDisplayTime)
      console.debug("Got single notif after " + (this.singleNotifTime - this.qrDisplayTime) + "ms");

    let actionID = data.actionID || this.state.actionID;

    if (data.thumb
      && data.thumb.startsWith('data:image/')) {
      console.debug('Received thumbnail');
      const showThumb = () => this.setState(prevState => {
        const next = {
          actionID: actionID,
          scanNotif: true,
          thumb: data.thumb,
          resourceWidth: data.contentWidth,
          resourceHeight: data.contentHeight
        };
        // handleScanNotif dropped data.filename unless it decrypted cleanly, so
        // this only ever stores a plaintext filename — never ciphertext, and
        // never clobbers a filename the cast already decrypted.
        if (data.filename)
          next.resourceFilename = data.filename;
        return next;
      });
      // #flip-card: single picture with a Preview => flip the QR card over to
      // reveal the Preview. Runs at most once (here, at scan notification).
      if (!this.flipCardDone) {
        this.flipCardToPreview(0, showThumb, 1000);
      } else {
        window.setTimeout(this.unblurryThumb.bind(this, 0, 1000), 20); // TODO what's the proper way??
        showThumb();
      }
      return;
    }

    this.setState(prevState => {
      const next = {
        actionID: actionID,
        scanNotif: true,
        resourceWidth: data.contentWidth,
        resourceHeight: data.contentHeight
      };
      // Only store a decrypted filename (see the thumb branch above).
      if (data.filename)
        next.resourceFilename = data.filename;
      return next;
    });

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
    if (this.state.multiItems && this.state.multiItems[index])
      item = this.state.multiItems[index];

    if (item.resourceData_b64 || item.resourceUrl) {
      console.log("Scan notif for resource " + index + " arrived late, ignoring.")
      return;
    }

    if (data.thumb && data.thumb.startsWith('data:image/')) {
      console.debug(`Received thumbnail of resource ${index}/${data.multiCount}`);
      item.thumb = data.thumb;
      window.setTimeout(this.unblurryThumb.bind(this, index, 1000), 20); // TODO what's the proper way??
    }
    item.resourceType = data.contentType;

    this.setState(prevState => {
      let items = prevState.multiItems;
      if (!items || items.length !== parseInt(data.multiCount, 10)) {
        items = [];
        for (var i = 0; i < data.multiCount; i++)
          items.push(Object());
      }
      items[index].thumb = item.thumb;
      items[index].resourceType = item.resourceType;
      items[index].resourceWidth = data.contentWidth;
      items[index].resourceHeight = data.contentHeight;
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

  async handleCast(data) {
    if (data.multiCount && data.multiCount > 1)
      await this.handleCastMulti(data);
    else
      await this.handleCastSingle(data);
  }

  async handleCastSingle(data) {
    const { t } = this.props;

    //
    // Single
    //

    let actionID = data.actionID || this.state.actionID;

    if (!data.message) {
      console.warn("Cast with no message");
      return;
    }

    // prevThumb means "A Preview was already displayed by maze-scan, we won't
    // need to play the Preview unblur animation again".
    const prevThumb = this.state.thumb;

    // #380
    // A "single message cast" is sufficient to close channel right now.
    // We're not expecting any separate thumb or anything else after this.
    this.stopListening();

    this.singleCastTime = new Date();
    if (this.qrDisplayTime)
      console.debug("Got single message after " + (this.singleCastTime - this.qrDisplayTime) + "ms");

    let mobileKey = "";
    this.crypto_algo = data.crypto_algo || this.crypto_algo;
    this.crypto_iv = data.crypto_iv || this.crypto_iv; // TODO remove obsolete crypto_iv (soonish)
    if (data.crypto_algo || data.crypto_iv) {
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
      if (data.messageIsClearText || data.message.startsWith("http")) {
        console.debug("  No need to decrypt clear text message:", data.message);
      } else {
        if (data.crypto_iv_message_0)
          console.debug("using data.crypto_iv_message_0");
        else {
          console.debug("fallback using obsolete data.crypto_iv for message :("); 
          if(data.crypto_iv) {
            errorBackend(this.state.actionID, this.chanKey, `Missing crypto_iv_message_0 for message, using obsolete crypto_iv`);
          }
        }
        let iv = data.crypto_iv_message_0 || data.crypto_iv;
        let decryptedBytes = await Decrypt(data.crypto_algo, data.message, iv, this.symCryptoKey);
        data.message = bytesToUtf8(decryptedBytes);
        console.debug("  Decrypted message: ", data.message);
      }

      // Decoding the filename is straightforward
      if (data.filename) {
        if (data.crypto_iv_filename_0)
          console.debug("using data.crypto_iv_filename_0");
        else {
          console.debug("fallback using obsolete data.crypto_iv for filename :(");
          if(data.crypto_iv) {
            errorBackend(this.state.actionID, this.chanKey, `Missing crypto_iv_filename_0 for filename, using obsolete crypto_iv`);
          }
        }
        let iv = data.crypto_iv_filename_0 || data.crypto_iv;
        let decryptedBytes = await Decrypt(data.crypto_algo, data.filename, iv, this.symCryptoKey);
        data.filename = bytesToUtf8(decryptedBytes);
        console.debug("  Decrypted filename: " + data.filename);
        // Set page title, for glanceability of the tab name!
        document.title = data.filename;
      }

      // Decode thumbnail (if any). See #374.
      if (data.thumb) {
        console.debug("  Got encrypted thumbnail, length " + data.thumb.length);
        if (data.crypto_iv_thumb_0)
          console.debug("using data.crypto_iv_thumb_0");
        else {
          console.debug("fallback using obsolete data.crypto_iv for preview :(");
          if(data.crypto_iv) {
            errorBackend(this.state.actionID, this.chanKey, `Missing crypto_iv_thumb_0 for preview, using obsolete crypto_iv`);
          }
        }
        let iv = data.crypto_iv_thumb_0 || data.crypto_iv;
        let decryptedBytes = await Decrypt(data.crypto_algo, data.thumb, iv, this.symCryptoKey);
        let thumb_b64 = bytesToBase64(decryptedBytes);
        thumb_b64 = "data:image/jpeg;base64," + thumb_b64;
        // This thumb is always implicitly JPEG.
        // TODO: consider PNG, or other?
        const showThumb = () => this.setState(prevState => ({
          thumb: thumb_b64
        }));
        // #flip-card: single picture with a Preview, and no Preview was shown
        // yet (no maze-scan thumb) => flip the QR card over to reveal the
        // Preview now, at cast. Runs at most once.
        if (!prevThumb && !this.flipCardDone) {
          this.flipCardToPreview(0, showThumb, 150);
        } else {
          showThumb();
          window.setTimeout(this.unblurryThumb.bind(this, 0, 150), 10); // TODO what's the proper way??
        }
      }

      // Decoding the resource will require a different key P, emitted by Mobile source.
      if (data.mobile_secret_scrambled) {
        if (data.crypto_iv_mobile_secret_scrambled)
          console.debug("using data.crypto_iv_mobile_secret_scrambled");
        else {
          console.debug("fallback using obsolete data.crypto_iv for mobile_secret_scrambled :(");
          if(data.crypto_iv) {
            errorBackend(this.state.actionID, this.chanKey, `Missing crypto_iv_mobile_secret_scrambled, using obsolete crypto_iv`);
          }
        }
        let iv = data.crypto_iv_mobile_secret_scrambled || data.crypto_iv;
        let decryptedBytes = await Decrypt(data.crypto_algo, data.mobile_secret_scrambled, iv, this.symCryptoKey);
        mobileKey = bytesToUtf8(decryptedBytes);
        console.debug("Decrypted mobile secret: " + mobileKey);
      } else {
        console.debug("No mobile_secret_scrambled, for now.");
      }

      // The advertized file size will be compared with the actual size to the
      // downloaded resource.
      let expectedFilesize = data.filesize;

      console.debug("Fetching encrypted resource");
      if (data.message.startsWith("https://storage.googleapis.com/cool-maze-transit/")
        || data.message.startsWith("https://storage.googleapis.com/push-to-computer-transit-eu/")
        || data.message.includes(".appspot.com/f/")
        || data.message.startsWith("https://coolmaze.io/f/")
        || data.message.startsWith(backendHost + "/f/")
        || data.message.startsWith("https://backend.coolmaze.io/f/")
        || data.message.startsWith("https://backend.pushto.computer/f/")
        || data.message.startsWith("https://" + process.env.REACT_APP_backend_domain + "/f/")
        || data.message.includes(":8080/f/")) {

        if(!expectedFilesize)
          warningBackend(this.state.actionID, this.chanKey, `No filesize advertised for single resource.`);
        // Fetch encrypted file
        let url = data.message;
        if (data.crypto_iv_contents_0)
          console.debug("using data.crypto_iv_contents_0");
        else {
          console.debug("fallback using obsolete data.crypto_iv for single contents :(");
          if(data.crypto_iv) {
            errorBackend(this.state.actionID, this.chanKey, `Missing crypto_iv_contents_0 for single contents, using obsolete crypto_iv`);
          }
        }
        let iv = data.crypto_iv_contents_0 || data.crypto_iv;
        if (preDownloaded[url]) {
          if (preDownloaded[url] === "PREFETCHING") {
            // issues/526
            // The resource is already being downloaded by prefetching.
            // Better wait for completion, instead of downloading again!
            console.debug("joining prefetch still downloading");
            let that = this;
            preDownloaded[url] = function (lateArrayBuffer) {
              if (lateArrayBuffer && lateArrayBuffer.byteLength > 0) {
                that.handleFetchedEncryptedResourceSingle(lateArrayBuffer, mobileKey, iv, expectedFilesize);
              } else {
                // Prefetch has failed!
                // Let's fallback to standard handling of cast
                console.debug(`prefetch single failed, fallback to handleCastSingle`);
                delete preDownloaded[url];
                that.handleCastSingle(data);
              }
            };
            // TODO shall we try to display already received thumb, right now?
          } else {
            let prefetchedResource = preDownloaded[url];
            console.debug(`Resource already prefetched (${prefetchedResource.byteLength} bytes): ${url}`);
            let arrayBuffer = prefetchedResource;
            // No artificial delay: decrypt right away (in parallel with any
            // flip-card reveal). The visible swap to the full-resolution picture
            // is deferred until the flip completes, inside runAfterFlip().
            this.handleFetchedEncryptedResourceSingle(arrayBuffer, mobileKey, iv, expectedFilesize);
          }
        } else {
          let xhr = new XMLHttpRequest();
          xhr.open('GET', url);
          xhr.responseType = "arraybuffer";
          let app = this;
          let tip = new Date().getTime();
          xhr.onload = function () {
            let top = new Date().getTime();
            app.fetchDuration = (top - tip);
            console.debug("Fetched encrypted resource in " + app.fetchDuration + "ms");
            let arrayBuffer = xhr.response;
            if (arrayBuffer) {
              app.handleFetchedEncryptedResourceSingle(arrayBuffer, mobileKey, iv, expectedFilesize);
            } else {
              console.warn("ahem, where is my arrayBuffer?");
              errorBackend(app.state.actionID, app.chanKey, `Single download failed: empty response (status ${xhr.status})`);
            }
          };
          xhr.onerror = function () {
            console.warn("Failed to fetch resource :(");
            errorBackend(app.state.actionID, app.chanKey, `Single download failed`);
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

    if (this.isSample(data.message)) {
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
    if (ytID) {
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

    if (data.message.startsWith("https://storage.googleapis.com/cool-maze-")
      || data.message.startsWith("https://storage.googleapis.com/push-to-computer-transit-eu/")
      || data.message.startsWith("https://coolmaze.io/f/")
      || data.message.startsWith(backendHost + "/f/")
      || data.message.startsWith("https://backend.coolmaze.io/f/")
      || data.message.startsWith("https://backend.pushto.computer/f/")
      || data.message.startsWith("https://cool-maze.appspot.com/f/")
      || data.message.startsWith("https://cool-maze.uc.r.appspot.com/f/")) {
      // This resource is a file uploaded from mobile app
      console.debug("Receiving shared file resource from " + data.message);
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
      let rt = t("item.redirectTo");
      let message = `${rt} ${url} …`;
      this.setState(prevState => ({
        actionID: actionID,
        infoMessage: message,
        resourceUrl: null,
        thumb: null,
        textMessage: message,
        scanNotif: false
      }),
        this.teardown);
      console.debug("Redirect to " + url + " in 500ms...");
      window.setTimeout(function () {
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
      window.setTimeout(function () {
        window.location = urlEnd;
      }, 500);

      return;
    }


    console.debug("Receiving shared text message: " + preview(data.message, 80));
    this.setState(prevState => ({
      actionID: actionID,
      resourceType: data.contentType,
      textMessage: data.message,
      resourceUrl: null,
      scanNotif: false
    }),
      this.teardown);
  }

  async handleCastMulti(data) {
    //
    // Multiple
    //
    let actionID = data.actionID || this.state.actionID;

    var index = data.multiIndex;

    // The advertized file size will be compared with the actual size to the
    // downloaded resource.
    let expectedFilesize = data.filesize;
    if(!expectedFilesize)
      warningBackend(this.state.actionID, this.chanKey, `No filesize advertised for resource ${index}.`);

    let mobileKey = "";
    this.crypto_algo = data.crypto_algo || this.crypto_algo;
    this.crypto_iv = data.crypto_iv || this.crypto_iv;   // TODO remove obsolete crypto_iv (soonish)
    var encryption = (data.crypto_algo || data.crypto_iv) ? true : false;
    if (encryption) {
      // See handleCastSingle for definition of K, P, M, IV

      // Decoding the message M is straightforward
      let messageIV = data[`crypto_iv_message_${index}`] || data.crypto_iv;
      let decryptedBytes = await Decrypt(data.crypto_algo, data.message, messageIV, this.symCryptoKey);
      data.message = bytesToUtf8(decryptedBytes);
      console.debug("Decrypted message " + index + ":" + data.message);

      // Decoding the filename is straightforward
      if (data.filename) {
        // TODO make sure the filename *is* encrypted
        try {
          let filenameIV = data[`crypto_iv_filename_${index}`] || data.crypto_iv;
          let decryptedBytesFilename = await Decrypt(data.crypto_algo, data.filename, filenameIV, this.symCryptoKey);
          data.filename = bytesToUtf8(decryptedBytesFilename);
          console.debug("  Decrypted filename: " + data.filename);
        } catch (error) {
          console.warn("  Could not decrypt filename \"" + data.filename + "\" — maybe it wasn't encrypted?");
        }
      }

      // Decoding the resource will require a different key P, emitted by Mobile source.
      if (data.mobile_secret_scrambled) {
        let iv = data.crypto_iv_mobile_secret_scrambled || data.crypto_iv;
        let decryptedBytesMobile = await Decrypt(data.crypto_algo, data.mobile_secret_scrambled, iv, this.symCryptoKey);
        mobileKey = bytesToUtf8(decryptedBytesMobile);
        console.debug("Decrypted mobile secret: " + mobileKey);
      }
      if (data.message.startsWith("https://storage.googleapis.com")) {
        let url = data.message;
        let contentsIV = data[`crypto_iv_contents_${index}`] || data.crypto_iv;
        if (preDownloaded[url] === "PREFETCHING") {
          // issues/526
          // The resource is already being downloaded by prefetching.
          // Better wait for completion, instead of downloading again!
          console.debug(`joining prefetch ${index} still downloading`);
          let that = this;
          preDownloaded[url] = function (lateArrayBuffer) {
            if (lateArrayBuffer && lateArrayBuffer.byteLength > 0) {
              that.handleFetchedEncryptedResourceMulti(index, lateArrayBuffer, mobileKey, null, contentsIV, expectedFilesize);
            } else {
              // Prefetch has failed!
              // Let's fallback to standard handling of cast
              console.debug(`prefetch ${data.multiIndex} failed, fallback to handleCastMulti`);
              delete preDownloaded[url];  // should already be deleted (see precast.js), but here we really don't want an infinite loop
              that.handleCastMulti(data);
            }
          };
        } else {
          // Fetch encrypted file
          let prefetchedResource = preDownloaded[url];
          if (prefetchedResource) {
            console.debug(`Resource already prefetched (${prefetchedResource.byteLength} bytes): ${url}`);
            let arrayBuffer = prefetchedResource;
            // This will kick in just after a short thumbnail unblur
            window.setTimeout(this.handleFetchedEncryptedResourceMulti.bind(this, index, arrayBuffer, mobileKey, null, contentsIV, expectedFilesize), 165);
          } else {
            let xhr = new XMLHttpRequest();
            xhr.open('GET', url);
            xhr.responseType = "arraybuffer";
            let app = this;
            let tip = performance.now();
            xhr.onload = function () {
              let arrayBuffer = xhr.response;
              if (arrayBuffer) {
                let top = performance.now();
                let fetchDuration = Math.round(top - tip);
                app.handleFetchedEncryptedResourceMulti(index, arrayBuffer, mobileKey, fetchDuration, contentsIV, expectedFilesize);
              } else {
                console.warn("ahem, where is my arrayBuffer?");
                errorBackend(app.state.actionID, app.chanKey, `Download #${index} failed: empty response (status ${xhr.status})`);
              }
            };
            xhr.onerror = function () {
              console.warn(`Failed to fetch resource ${index} :(`);
              errorBackend(app.state.actionID, app.chanKey, `Download #${index} failed`);
            };
            xhr.send();
          }
        }
      }
    } else {
      errorBackend(this.state.actionID, this.chanKey, `No encryption in cast multi`);
    }

    if (data.thumb) {
      console.debug("  cast " + index + " has an attached thumb");
      // Display thumb smoothly until full resource is fetched.
      if (encryption) {
        let thumbIV = data[`crypto_iv_thumb_${index}`] || data.crypto_iv;
        let decryptedBytesThumb = await Decrypt(data.crypto_algo, data.thumb, thumbIV, this.symCryptoKey);
        let data_b64 = bytesToBase64(decryptedBytesThumb);
        data.thumb = "data:image/jpeg;base64," + data_b64; // This thumb is always implicitly JPEG.
        // TODO: consider PNG, or other?
        console.debug("  decrypted thumb " + index);
      } else {
        errorBackend(this.state.actionID, this.chanKey, `No encryption in cast multi with preview`);
      }
      window.setTimeout(this.unblurryThumb.bind(this, index, 200), 20); // TODO what's the proper way??
    }

    let that = this;

    this.setState(prevState => {
      let items = prevState.multiItems;
      if (!items || items.length !== parseInt(data.multiCount, 10)) {
        items = [];
        for (var i = 0; i < data.multiCount; i++)
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
    }, function () {
      // This is never supposed to be called, because we don't do clear text multiple sharing.
      // So multiFinished is returning false (at least one resourceData_b64 is missing at this point).
      // TODO either unlock multiple clear text sharing from iOS, or remove this dead code.
      if (that.multiFinished(encryption)) {
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

    StartWebRTC(this.chanKey, data, this.handleBinaryProgress, this.handleBinary, this.handleWebRTCError);
  }

  handleWebRTCError(reason) {
    // The P2P (WebRTC) transfer could not be established or was lost. Without a
    // TURN server this is expected when the two devices aren't on the same
    // network. Surface a failure instead of leaving the user on a spinner.
    console.error("WebRTC transfer failed:", reason);
    errorBackend(this.state.actionID, this.chanKey, `WebRTC transfer failed: ${reason}`);
    this.setState(prevState => ({
      resourceDownloadProgress: null,
      errorMessage: this.props.t("webRTC.error"),
    }));
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
      if (r.bytesReceived && r.Size)
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

    if (resources.length >= 2) {
      this.handleBinaryMultiple(resources);
      return;
    }

    this.fetchDuration = downloadDuration;
    this.webrtcSDPExchangeDuration = webrtcSDPExchangeDuration;

    // Handle single resource:
    let resource = resources[0];

    function _arrayBufferToBase64(buffer) {
      var binary = '';
      var bytes = new Uint8Array(buffer);
      var len = bytes.byteLength;
      for (var i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      return window.btoa(binary);
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
      if (!items || items.length !== parseInt(data.multiCount, 10)) {
        items = [];
        for (var i = 0; i < data.multiCount; i++)
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

    switch (data.event) {
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

  async handleFetchedEncryptedResourceSingle(arrayBuffer, mobileKey, crypto_iv_contents_0, expectedFilesize) {
    let tip = new Date().getTime();
    
    if(expectedFilesize && expectedFilesize != arrayBuffer.byteLength) {
      errorBackend(this.state.actionID, this.chanKey, `Expected single resource of size ${expectedFilesize}, got ${arrayBuffer.byteLength} bytes.`);
      // Backend notified.
      // Then try to keep going, just in case?  Instead of displaying an explicit error message?
    }

    let decryptedBytes;
    try {
      decryptedBytes = await DecryptWords(this.crypto_algo, arrayBuffer, crypto_iv_contents_0, mobileKey);
    } catch (err) {
      console.error("Failed to decrypt single resource:", err);
      errorBackend(this.state.actionID, this.chanKey, `Decrypting single resource: ${err.message}`);
      this.setState(prevState => ({
        errorMessage: `Decryption error: ${err.message}`
      }));
      return;
    }

    if(this.state?.resourceType.startsWith("image/")) {
      // We're expecting a proper image. Does this binary data look like an image?
      if(detectImageMimeType(decryptedBytes) == null) {
        let firstBytes = formatBytesToHex(decryptedBytes, 4);
        errorBackend(this.state.actionID, this.chanKey, `Image: unexpected first bytes ${firstBytes}`);
      }
    }

    // Display/generate it to user
    let data_b64 = bytesToBase64(decryptedBytes);
    let top = new Date().getTime();
    this.decryptDuration = (top - tip);
    if(this.decryptDuration == 0) {
      // Decryption taking less than 1ms is possible.
      // However, 0ms is more difficult to distinguish from NULL in the stats. Let's say 1ms instead.
      this.decryptDuration = 1;
    }
    console.debug("Decrypted ciphertext into base64 message of size " + data_b64.length + " in " + this.decryptDuration + "ms");
    // We are now positive the transfer arrived and decrypted. Report
    // success right away instead of waiting for the flip-card reveal — the BI metrics
    // should not carry the ~300ms animation delay. `haveResource` is true because the
    // decrypted resource is in hand (data_b64), even though we withhold it from state
    // below until the flip finishes, so hasResource() would not yet see it.
    this.teardown(true /* haveResource */);

    // Keep the *visible* swap to the full-resolution picture deferred until the
    // flip-card preview-in reveal has fully played. UX only, no telemetry impact.
    this.runAfterFlip(() => {
      this.setState(prevState => ({
        resourceData_b64: data_b64,
        scanNotif: false
      }));
    });
  }

  async handleFetchedEncryptedResourceMulti(index, arrayBuffer, mobileKey, fetchDuration, contentsIV, expectedFilesize) {
    //console.debug(`handleFetchedEncryptedResourceMulti(${index}, arrayBuffer ${arrayBuffer.byteLength} bytes, ${mobileKey}, ${fetchDuration}, ${contentsIV}, ${expectedFilesize})`)
    // Decrypt it
    let tip = performance.now();

    if(expectedFilesize && expectedFilesize != arrayBuffer.byteLength) {
      errorBackend(this.state.actionID, this.chanKey, `Expected resource ${index} of size ${expectedFilesize}, got ${arrayBuffer.byteLength} bytes.`);
      // Backend notified.
      // Then try to keep going, just in case?  Instead of displaying an explicit error message?
    }

    let iv = contentsIV || this.crypto_iv; // TODO remove this.crypto_iv
    let decryptedBytes;
    try {
      decryptedBytes = await DecryptWords(this.crypto_algo, arrayBuffer, iv, mobileKey);
    } catch (err) {
      console.error(`Failed to decrypt resource ${index}: `, err);
      errorBackend(this.state.actionID, this.chanKey, `Decrypting resource ${index}: ${err.message}`);
      this.setState(prevState => ({
        errorMessage: `Decryption error: ${err.message}`
      }));
      return;
    }

    if(this.state.multiItems[index]?.resourceType.startsWith("image/")) {
      // We're expecting a proper image. Does this binary data look like an image?
      if(detectImageMimeType(decryptedBytes) == null) {
        let firstBytes = formatBytesToHex(decryptedBytes, 4);
        errorBackend(this.state.actionID, this.chanKey, `Image ${index}: unexpected first bytes ${firstBytes}`);
      }
    }

    // Display/generate it to user
    let data_b64 = bytesToBase64(decryptedBytes);
    let top = performance.now();
    console.debug("Decrypted ciphertext " + index + " into base64 message of size " + data_b64.length);
    let ttd = Math.round(top - tip);
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
    }, function () {
      let ttf = fetchDuration;
      let filenameIsUnknown = that.isUnknown(that.state.multiItems[index].resourceFilename);
      let durations = {
        "prefetch": ttpf,
        "fetch": ttf,
        "decrypt": ttd,
      };
      partialAckBackend(that.chanKey, that.state.actionID, index, that.state.multiItems.length, durations, filenameIsUnknown);

      if (isMultiFinished) {
        that.multipleAllCastTime = new Date();
        that.teardown();
      }
    });

  }

  isUnknown(filename) {
    // A "filename unknown" is when the original resource filename is not known, probably
    // because the mobile source device could not could not determine it.
    // It may be falsy (false, undefined, null, empty string) or a placeholder ("coolmaze-shared-content")
    if (!filename)
      return true;
    if (filename.startsWith("coolmaze-shared-content"))
      return true;
    if (filename.startsWith("shared-image"))
      return true;
    return false;
  }

  expireQR() {
    if (this.hasAnyResource()) {
      // Don't mess with state if the resource is already there!
      // At this point, push unsubscribe should have been already done.
      return;
    }
    console.debug("Closing idle channel, hiding QR-code");
    this.stopListening();
    this.setState(prevState => ({
      // magic value :(
      qrKey: "reload",
      // errorMessage: "Please reload",
    }));
  }

  embiggen() {
    let newSize = 2 + (this.state.qrSize % 6);
    this.setState(prevState => ({
      qrSize: newSize,
      qrAnimClass: "qr-resize-" + prevState.qrSize + "-to-" + newSize,
    }));
    localStorage.setItem('qrSize', newSize);
    using(`embiggen/${newSize}`);
  }

  embiggenOnly() {
    // Like embiggen(), but stops at max size (do not wrap)
    if (this.state.qrSize >= 6)
      return;
    this.embiggen();
  }

  ensmallenOnly() {
    // Reduce QR code size, and stop at min size (do not wrap)
    if (this.state.qrSize <= 2)
      return;
    let newSize = this.state.qrSize - 2;
    this.setState(prevState => ({
      qrSize: newSize,
      qrAnimClass: "qr-resize-" + prevState.qrSize + "-to-" + newSize,
    }));
    localStorage.setItem('qrSize', newSize);
    using(`ensmallen/${newSize}`);
  }

  // Called by Item when the user rotates a received image.
  // Updates App state so the TopBar's Save button also saves the rotated data.
  onRotateResource(data, type) {
    this.setState({ resourceData_b64: data, resourceType: type });
  }

  toggleHelp() {
    if (!this.state.showHelp) {
      // User is accessing the Help box
      using("help");
    }

    this.setState(prevState => ({
      showHelp: !prevState.showHelp
    }));
  }

  clear() {
    if(this.listening && this.state.actionID) {
      // Canceling an ongoing transfer?
      // Then notify the backend, let the mobile fail faster.
      userCancelBeacon(this.state.actionID, this.state.chanKey);
    }

    this.initQR();
    if (!window.navigator.onLine) {
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
    this.crypto_iv = null;  // TODO remove obsolete crypto_iv (soonish)
    this.fetchDuration = null;
    this.prefetchDuration = null;
    this.decryptDuration = null;
    this.webrtcSDPExchangeDuration = null;
    this.flipCardDone = false;
    this.flipInProgress = false;
    this.pendingAfterFlip = [];
  }

  multiFinishedCount(encryption) {
    let n = this.state.multiItems.length;
    var m = 0;

    if (encryption) {
      // We are "finished" as soon as all resources have been downloaded
      // TODO: and decrypted?
      for (let i = 0; i < n; i++)
        if (this.state.multiItems[i].resourceData_b64)
          m++;
      return m;
    } else {
      // We are "finished" as soon as all resource URLs are known
      // TODO: and downloaded?
      for (let i = 0; i < n; i++)
        if (this.state.multiItems[i].resourceUrl)
          m++;
      return m;
    }
  }

  multiFinished(encryption) {
    let n = this.state.multiItems.length;
    let m = this.multiFinishedCount(encryption);
    let allFinished = (m === n);
    return allFinished;
  }

  // #flip-card
  // A "flip card" reveal for a single picture that has a Preview:
  //  1. the QR code flips away around its horizontal center line (height -> 0),
  //  2. then the Preview flips in the opposite direction (height 0 -> full),
  //     while progressively unblurrying.
  // scaleY around the (default) center transform-origin keeps the layout box
  // unchanged, so the page does not reflow/move during the animation.
  // Runs at most once per action (guarded by this.flipCardDone at the call sites).
  // `showThumb` must setState the Preview so React mounts #thumb-<index>.
  flipCardToPreview(index, showThumb, unblurMs) {
    this.flipCardDone = true;
    this.flipInProgress = true;
    const FLIP_MS = 150;

    // The flip is over: apply any UI update that newer data deferred meanwhile.
    const finishFlip = () => {
      if (!this.flipInProgress)
        return; // already finished (onfinish + safety-net race)
      this.flipInProgress = false;
      const pending = this.pendingAfterFlip;
      this.pendingAfterFlip = [];
      pending.forEach(fn => fn()); // run every deferred update, in arrival order
    };

    const flipPreviewIn = () => {
      // React has (just) rendered the blurry Preview: reveal it from height 0.
      window.setTimeout(() => {
        const th = document.getElementById(`thumb-${index}`);
        if (th) {
          // transform (scaleY) and filter (unblur) are independent properties,
          // so these two animations compose on the same element.
          const flipIn = th.animate([
            { transform: 'scaleY(0)' },
            { transform: 'scaleY(1)' }
          ], {
            duration: FLIP_MS,
            easing: 'ease-out',
            iterations: 1
          });
          flipIn.onfinish = finishFlip;
        }
        // Safety net: always release the deferred update, even if the thumb
        // element is missing or onfinish never fires (e.g. backgrounded tab).
        window.setTimeout(finishFlip, FLIP_MS + 50);
        this.unblurryThumb(index, unblurMs);
      }, 20); // let React paint the freshly-mounted thumb first
    };

    const qr = document.getElementById('qrcode');
    if (qr) {
      // Phase 1: flip the QR code away, down to height zero.
      const flipOut = qr.animate([
        { transform: 'scaleY(1)' },
        { transform: 'scaleY(0)' }
      ], {
        duration: FLIP_MS,
        easing: 'ease-in',
        fill: 'forwards', // hold at height 0 until React swaps QR -> Preview
        iterations: 1
      });
      flipOut.onfinish = () => {
        showThumb();      // Phase 2a: swap QR out, mount the Preview
        flipPreviewIn();  // Phase 2b: flip the Preview in
      };
    } else {
      // No QR in the DOM (edge case): just reveal the Preview.
      showThumb();
      flipPreviewIn();
    }
  }

  // Run `fn` now, or defer it until the flip-card animation completes if one is
  // currently playing. Guarantees the full reveal is always seen before newer
  // data (e.g. the full-resolution picture) updates the UI. Multiple deferred
  // updates are queued and run in arrival order (FIFO) when the flip ends.
  runAfterFlip(fn) {
    if (this.flipInProgress)
      this.pendingAfterFlip.push(fn);
    else
      fn();
  }

  unblurryThumb(index, durationMs) {
    console.debug(`Animating #thumb-${index} for ${durationMs}ms`);
    let th = document.getElementById(`thumb-${index}`);
    if (!th)
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

  isSample(url) {
    if (!url)
      return false;
    if (url.startsWith("https://storage.googleapis.com/cool-maze.appspot.com/sample"))
      return true;
    if (url.startsWith("https://storage.googleapis.com/push-to-computer/sample/"))
      return true;
    if (url.startsWith("https://storage.googleapis.com/cool-maze.appspot.com/demo"))
      return true;
    return false;
  }

  // Unsubscribe from the push channel and record that we are no longer listening.
  // Every place that stops the channel goes through here so the `listening` flag stays
  // in sync (used to decide whether the tab-closed beacon should still fire).
  stopListening() {
    this.pushStopListening();
    this.listening = false;
  }

  teardown(haveResource = this.hasResource()) {
    console.debug("Tearing down");
    var qrToNotifDuration, qrToCastDuration;
    if (this.qrDisplayTime) {
      if (this.singleNotifTime)
        qrToNotifDuration = this.singleNotifTime - this.qrDisplayTime;
      if (this.singleCastTime)
        qrToCastDuration = this.singleCastTime - this.qrDisplayTime;
      if (this.multipleAllCastTime)
        qrToCastDuration = this.multipleAllCastTime - this.qrDisplayTime;
    }

    // Report "filename unknown" when...
    let singleFilenameIsUnknown =
      haveResource             // we do have a resource (not a mere text or URL)
      && (!this.state.multi)   // which is not a multiple share action (reported elsewhere in /partial-ack)
      && (!this.isSample(this.state.resourceUrl))           // which is not the sample share (a resource without a provided filename)
      && this.isUnknown(this.state.resourceFilename); // where we have no filename, or just a placeholder filename

    let durations = {
      "qrToNotif": qrToNotifDuration,
      "qrToCast": qrToCastDuration,
      "prefetch": this.prefetchDuration,
      "fetch": this.fetchDuration,
      "decrypt": this.decryptDuration,
      "webrtcSDPExchange": this.webrtcSDPExchangeDuration,
    };
    ackBackend(this.chanKey, this.state.actionID, durations, singleFilenameIsUnknown, this.state.qrSize, CM_CLIENT_PREFIX);
    this.stopListening();

    this.setState(prevState => ({
      qrKey: "",
    }));
  }

  componentDidMount() {
    // Preload image for the Help box
    // See https://stackoverflow.com/a/50227675/871134
    window.setTimeout(() => { new Image().src = schema; }, 400);

    // Desktop user closes the tab/window (or navigates away) while a share is in
    // progress => tell the backend, so the ongoing action can be interrupted on the
    // mobile side instead of letting the mobile wait until its own timeout.
    //
    // We deliberately use `pagehide` and NOT `visibilitychange`: pagehide fires only
    // on real page teardown (tab/window close, navigation away, reload) and NOT on tab
    // switching or minimizing, so merely switching tabs never triggers a halt.
    // The listener is registered once here (rather than in initQRwith, which runs again
    // on every QR refresh) to avoid firing duplicate beacons on close. It reads the
    // live actionID/chanKey at close time, so a single registration is enough.
    window.addEventListener("pagehide", () => {
      // Only interrupt a share that is genuinely still in flight: a scan has happened
      // (actionID) AND we are still subscribed to the channel. Once we have torn down
      // (completed share, channel closed, QR expired), listening is false and we stay
      // silent — there is nothing left to halt.
      if (this.listening && this.state.actionID) {
        tabClosedBeacon(this.state.actionID, this.chanKey);
      }
    });

    // Ask the user to confirm before closing the tab while a transfer is in flight, so
    // it is not lost by accident. Browsers show their own generic wording; we can't set
    // the message. preventDefault() triggers the prompt on modern browsers, and setting
    // returnValue to a non-empty value is still required by some older ones.
    // The confirm only appears once a scan has happened (actionID known) and while we are
    // still actively listening — same gate as the tab-closed beacon.
    // Also, this will likely not be shown at all if the user has not yet explicitly
    // interacted with the page, which is often the case.
    window.addEventListener("beforeunload", (e) => {
      if (this.listening && this.state.actionID) {
        e.preventDefault();
        e.returnValue = "";
      }
    });
  }
}

function preview(str, n) {
  if(str.length < n)
    return str;
  return str.substring(0, n) + "…";
}

export default withTranslation()(App);
