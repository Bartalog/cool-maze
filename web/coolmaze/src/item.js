import React, { Component } from 'react';
import { withTranslation, Trans } from 'react-i18next';

import Linkify from 'react-linkify';
import ResourceIcon from './resourceicon.js';
import MdAspectRatio from 'react-icons/lib/md/aspect-ratio';
import MdLockOutline from 'react-icons/lib/md/lock-outline';
import MdContentCopy from 'react-icons/lib/md/content-copy';
import MdRotate90DegreesCcw from 'react-icons/lib/md/rotate-90-degrees-ccw';
import FaDownload from 'react-icons/lib/fa/download';
import FaCopy from 'react-icons/lib/fa/copy';
import {base64toBlob, isImageType, isAudioType, isVideoType, base64ByteSize, formatFileSize} from './util.js';
import {using, warningBackend, errorBackend} from './backend.js';
import {showCopiedToast} from './toast.js';

require('string.prototype.startswith');

// 1 received resource or message.
// To be used in a single or multi inbox. 
class Item extends Component {
    constructor(props) {
        super(props);
        this.state = {
            lightbox: false,
            zoomed: false,
            dragging: false,
            dragged: false,
            offsetX: 0,
            offsetY: 0,
            lastX: 0,
            lastY: 0,
            rotatedData_b64: null,
            rotatedType: null,
        };
    }

    toggleItemFullscreen = ( e ) => {
        let count = this.props.multiCount || 1;
        let index = this.props.multiIndex || 0;
        let suffix = count <= 1 ? "" : `/${index}`;

        // Case 1 item box => fullscreen
        if( !this.state.lightbox ) {
          this.setState({ lightbox: true, zoomed: false });
          using("item/lightbox" + suffix);
          return;
        }
        // Case 2 fullscreen => zoomed
        if( !this.state.zoomed ) {
          this.setState({ zoomed: true, offsetX: 0, offsetY: 0 });
          using("item/zoomed" + suffix);
          return;
        }
        // Case 3 back to item box
        this.setState({ lightbox: false, zoomed: false });
    }

    handleMouseDown = (e) => {
        if (!this.state.zoomed) return;
        this.setState({
            dragging: true,
            dragged: false,
            lastX: e.clientX,
            lastY: e.clientY
        });
    }

    handleMouseMove = (e) => {
        if (!this.state.dragging) return;
        const deltaX = e.clientX - this.state.lastX;
        const deltaY = e.clientY - this.state.lastY;
        
        const { offsetX, offsetY } = this.applyBounds(e.target, this.state.offsetX + deltaX, this.state.offsetY + deltaY);

        if (Math.abs(offsetX - this.state.offsetX) > 1 || Math.abs(offsetY - this.state.offsetY) > 1) {
            this.setState({ dragged: true });
        }

        this.setState({
            offsetX,
            offsetY,
            lastX: e.clientX,
            lastY: e.clientY
        });
    }

    handleMouseUp = (e) => {
        this.setState({ dragging: false });
    }

    handleTouchStart = (e) => {
        if (!this.state.zoomed) return;
        const touch = e.touches[0];
        this.setState({
            dragging: true,
            dragged: false,
            lastX: touch.clientX,
            lastY: touch.clientY
        });
    }

    handleTouchMove = (e) => {
        if (!this.state.dragging) return;
        const touch = e.touches[0];
        const deltaX = touch.clientX - this.state.lastX;
        const deltaY = touch.clientY - this.state.lastY;
        
        const { offsetX, offsetY } = this.applyBounds(e.target, this.state.offsetX + deltaX, this.state.offsetY + deltaY);

        if (Math.abs(offsetX - this.state.offsetX) > 1 || Math.abs(offsetY - this.state.offsetY) > 1) {
            this.setState({ dragged: true });
        }

        this.setState({
            offsetX,
            offsetY,
            lastX: touch.clientX,
            lastY: touch.clientY
        });
        if (e.cancelable) e.preventDefault();
    }

    applyBounds = (img, x, y) => {
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        const zoom = 2.4;

        const imageAspectRatio = img.naturalWidth / img.naturalHeight;
        const viewportAspectRatio = viewportWidth / viewportHeight;

        let displayedWidth, displayedHeight;
        if (imageAspectRatio > viewportAspectRatio) {
            displayedWidth = viewportWidth;
            displayedHeight = viewportWidth / imageAspectRatio;
        } else {
            displayedWidth = viewportHeight * imageAspectRatio;
            displayedHeight = viewportHeight;
        }

        const zoomedWidth = displayedWidth * zoom;
        const zoomedHeight = displayedHeight * zoom;

        let resX = x;
        let resY = y;

        if (zoomedWidth > viewportWidth) {
            const maxOffsetX = (zoomedWidth - viewportWidth) / 2;
            resX = Math.max(-maxOffsetX, Math.min(maxOffsetX, x));
        } else {
            resX = 0;
        }

        if (zoomedHeight > viewportHeight) {
            const maxOffsetY = (zoomedHeight - viewportHeight) / 2;
            resY = Math.max(-maxOffsetY, Math.min(maxOffsetY, y));
        } else {
            resY = 0;
        }

        return { offsetX: resX, offsetY: resY };
    }

    handleImageClick = (e) => {
        if (this.state.dragged) {
            this.setState({ dragged: false });
            return;
        }
        this.toggleItemFullscreen(e);
    }

    rotateImageCCW = async (base64Data, resourceType) => {
        const img = new Image();
        img.src = `data:${resourceType};base64,${base64Data}`;
        // decode() rejects on a malformed or unsupported image — let it propagate.
        await img.decode();
        const canvas = document.createElement("canvas");
        // Swap width and height for 90° rotation
        canvas.width = img.height;
        canvas.height = img.width;
        const ctx = canvas.getContext("2d");
        ctx.translate(0, img.width);
        ctx.rotate(-Math.PI / 2);
        ctx.drawImage(img, 0, 0);
        // Re-encode in the same format as the input to avoid format-switch bloat
        // (e.g. JPEG → PNG would be ~12× heavier). JPEG needs an explicit quality
        // argument; PNG is lossless and ignores it. Fall back to JPEG for any
        // format that canvas cannot encode (e.g. GIF, HEIC).
        const canEncode = resourceType === "image/png" || resourceType === "image/jpeg" || resourceType === "image/webp";
        const outputType = canEncode ? resourceType : "image/jpeg";
        const quality    = outputType === "image/jpeg" ? 0.85 : undefined;

        return new Promise((resolve, reject) => {
            canvas.toBlob((blob) => {
                // toBlob passes null on failure (tainted canvas, memory pressure, …)
                if (!blob) {
                    reject(new Error("canvas.toBlob returned null — cannot encode rotated image"));
                    return;
                }
                const reader = new FileReader();
                reader.onerror = () => reject(reader.error || new Error("FileReader failed"));
                reader.onloadend = () => {
                    if (reader.error) { reject(reader.error); return; }
                    const b64 = reader.result && reader.result.split(',')[1];
                    if (!b64) { reject(new Error("FileReader produced empty result")); return; }
                    resolve({ data: b64, type: outputType });
                };
                reader.readAsDataURL(blob);
            }, outputType, quality);
        });
    }

    render() {

      if (this.props.resourceData_b64)
        return this.render_Data_b64();
      
      if (this.props.resourceUrl && !this.props.e2ee) {
        warningBackend(this.props.actionID, this.props.chanKey, "received unencrypted resource");
        return this.render_unencrypted_resource();
        
        // TODO: consider instead
        //   errorBackend
        //   fail now, do not proceed further.
        // Also, consider "hoisting" this, out of the rendering logic, and make sure it is not called several times
        // on each paint.
      }

      if (this.props.resourceUrl &&
          (  this.props.resourceUrl.startsWith("https://storage.googleapis.com/cool-maze.appspot.com/sample")
          || this.props.resourceUrl.startsWith("https://storage.googleapis.com/push-to-computer/sample/")))
        return this.render_unencrypted_resource(); // The Android sample share message is encrypted, but the file is not
  
      if (this.props.thumb){
        return this.render_thumb();
      }
  
      if (this.props.textMessage)
        return this.render_text();
  
      if(this.props.youtubeID)
        return this.render_youtuber_player();

      if (this.props.resourceWebpageUrl) 
        return this.render_external_webpage_url();
  
      if(this.props.spinning)
        return this.render_spinning();

      if(this.props.resourceDownloadProgress)
        return this.render_download_progress();
  
      console.debug("NO RENDER for item " + (this.props.multiIndex || 0));
      return null;
    }

    render_Data_b64() {
      const { t } = this.props;

      let count = this.props.multiCount || 1;
      let e2eeLock;
      if(this.props.e2ee && count<=1)
          e2eeLock = <div className="e2ee-message item-extra-info" key="e2ee-message"><MdLockOutline/>{t('item.e2ee.text')} <span title={t('item.e2ee.tooltip')} className="hint">{t('item.e2ee.e2ee')}</span>.</div>;

      let index = this.props.multiIndex || 0;
      let type = this.state.rotatedType || this.props.resourceType;
      let data = this.state.rotatedData_b64 || this.props.resourceData_b64;
      let filename = this.props.resourceFilename;
      function dl() {
        // Works for any single resource, even from a multi-share.
        using(`download/item/${index}`);
        let dummy = document.createElement('a');
        let blob = base64toBlob(data, type);
        let objURL = URL.createObjectURL(blob);
        dummy.setAttribute('href', objURL);
        dummy.setAttribute('download', filename || `resource${index}.${type}`);
        dummy.style.display = 'none';
        document.body.appendChild(dummy);
        dummy.click();
        document.body.removeChild(dummy);
        // using(`download/item/${index}/success`); ??
      }
      let downloadButton = 
        <button onClick={dl} title={t('topbar.tooltips.save')} key="download-item" className="download-item">
          <FaDownload />
        </button>

        async function copyBase64ImageToClipboard(resourceType, base64Data, button) {
          let blob = base64toBlob(base64Data, resourceType);
          // Chrome supports only image/png — so convert JPEG to PNG if needed
          if (resourceType === "image/jpeg") {
            const img = new Image();
            img.src = `data:${resourceType};base64,${base64Data}`;
            await img.decode();
            // Draw JPEG on canvas and convert to PNG
            const canvas = document.createElement("canvas");
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext("2d");
            ctx.drawImage(img, 0, 0);
            blob = await new Promise(resolve => 
              canvas.toBlob(resolve, "image/png")
            );
            resourceType = "image/png"; // update type
          }
          navigator.clipboard.write([
            new ClipboardItem({ [resourceType]: blob })
          ]).then(function() {
              console.log('Copied resource to the clipboard in PNG format');
              showCopiedToast();
              if(button) {
                button.classList.add("checked");
                setTimeout(() => {
                  button.classList.remove("checked");
                }, 2000);
              }
            }, function(err) {
              console.error('Could not copy resource to the clipboard:', err);
              alert('Could not copy resource to the clipboard :(');
            });
        }
      function copy(e) {
        using(`copy/item/${index}`);
        let button = e.target;
        while (button.tagName !== "BUTTON" && button.parentNode) {
          button = button.parentNode;
        }
        if(button.tagName !== "BUTTON")
          button = null;
        copyBase64ImageToClipboard(type, data, button);
      }
      let copyButton =
        <button onClick={copy} title={t('item.copyToClipboard')} key="copy-item" className="copy-item">
          <FaCopy />
        </button>;

      const rotateCCW = async () => {
        using(`rotate-ccw/item/${index}`);
        try {
          const { data: newData, type: newType } = await this.rotateImageCCW(data, type);
          // setState (and thus the visual update) is only reached when rotated data
          // has been fully and successfully produced.
          this.setState({ rotatedData_b64: newData, rotatedType: newType });
          // Propagate to App state so the TopBar's Save button also saves the rotated image.
          if (this.props.onRotateResource) {
            this.props.onRotateResource(newData, newType);
          }
        } catch (err) {
          console.error('Could not rotate image:', err);
          alert('Could not rotate image :(');
        }
      };
      let rotateButton =
        <button onClick={rotateCCW} title={t('item.rotateCCW')} key="rotate-item" className="rotate-item">
          <MdRotate90DegreesCcw />
        </button>;

      console.debug("Item " + index + " type " + type);

      if (isImageType(type)) {
        console.debug("  Item " + index + " displayed as image");
        let bigdataURI = `data:${type};base64,` + data;

        let downscaledWarning;
        if( this.props.resized || (filename && filename.toLowerCase().indexOf("-resized.") !== -1)) {
          let downscaledDimensions;
          if( this.props.resourceWidth && this.props.resourceHeight )
            downscaledDimensions = " " + t('item.wasDownscaled.to') + " " + this.props.resourceWidth + "x" + this.props.resourceHeight;
          downscaledWarning = <div className="downscaled item-extra-info" key="downscaled-message"><MdAspectRatio/>{t('item.wasDownscaled.text')}{downscaledDimensions}.</div>;
        }
        let buttons =
          <div>
            {downloadButton}
            {rotateButton}
            {copyButton}
          </div>;

        let classes = "resource-picture";
        if (this.state.lightbox) classes += " lightbox";
        if (this.state.zoomed) classes += " zoomed";
        if (!this.state.zoomed) classes += " fit-down";

        let style = {};
        if (this.state.zoomed) {
            style = { transform: `translate(${this.state.offsetX}px, ${this.state.offsetY}px) scale(2.4)` };
        }

        let sizeLabel = formatFileSize(base64ByteSize(this.props.resourceData_b64));
        let title = filename;
        if (filename && sizeLabel)
          title += " — " + sizeLabel;

        return [<img
            src={bigdataURI}
            alt={filename || t('item.beingReceivedPlaceholder')}
            title={title}
            className={classes}
            style={style}
            onClick={this.handleImageClick}
            onMouseDown={this.handleMouseDown}
            onMouseMove={this.handleMouseMove}
            onMouseUp={this.handleMouseUp}
            onMouseLeave={this.handleMouseUp}
            onTouchStart={this.handleTouchStart}
            onTouchMove={this.handleTouchMove}
            onTouchEnd={this.handleMouseUp}
            draggable={false}
            onDragStart={(e) => e.preventDefault()}
            key="image"
            id={`item-${index}`} />,
            buttons,
            downscaledWarning,
            e2eeLock];
      }
      
      if (isVideoType(type)) {
        console.debug("  Item " + index + " displayed as video");
        let bigdataURI = "data:video/mp4;base64," + data; // TODO any video, not just MP4!
        let buttons = 
          <div>
            {downloadButton}
          </div>;
        return [
          <video src={bigdataURI} controls autoPlay className="resource-video fit-down" key="video" id={`item-${index}`}>
            Video <a href={this.props.resourceUrl} target="_blank" rel="noopener noreferrer">{this.props.resourceFilename || "here"}</a>
          </video>,
          buttons,
          e2eeLock
        ];
      }

      console.debug("  Item " + index + " displayed as downloadable file");
      return [
        <div className="inbox-file" key="file" id={`item-${index}`}>
          <div className="file-item">
            <button onClick={dl} >
              <ResourceIcon resourceType={type} resourceFilename={filename} /><br/>
              {filename || "Your file"}
            </button>
          </div>
        </div>,
        e2eeLock
      ];
    }

    render_unencrypted_resource() {
        const { t } = this.props;
        let index = this.props.multiIndex || 0;

        if (isVideoType(this.props.resourceType)) {
          return (
            <video src={this.props.resourceUrl} controls autoPlay className="resource-video fit-down" id={`item-${index}`}>
              Video <a href={this.props.resourceUrl} target="_blank" rel="noopener noreferrer">{this.props.resourceFilename || "here"}</a>
            </video>
          );
        }

        if (isAudioType(this.props.resourceType)) {
        return (
          <div className="resource-audio fit-down">
            <div>
              {this.props.resourceFilename}
            </div>
            <div>
              <audio src={this.props.resourceUrl} controls autoPlay id={`item-${index}`}>
                Audio file <a href={this.props.resourceUrl} target="_blank" rel="noopener noreferrer">here</a>
              </audio>
            </div>
          </div>
          );
        }

        if( !this.props.thumb
            && this.props.resourceType 
            && !isImageType(this.props.resourceType) ){
          return (
            <div className="inbox-file" id={`item-${index}`}>
              <div className="file-item">
                <a href={this.props.resourceUrl}
                  target="_blank" rel="noopener noreferrer"><ResourceIcon resourceType={this.props.resourceType} resourceFilename={this.props.resourceFilename} /></a> <br/>
                <a href={this.props.resourceUrl}
                  target="_blank" rel="noopener noreferrer">{this.props.resourceFilename || "Your file"}</a>
              </div>
            </div>
          )          
        }

        var bigPictureUrl = this.props.resourceUrl;
        var thumbUrl = this.props.thumb;
        var filename = this.props.resourceFilename;

        let downscaledWarning;
        if( this.props.resized || (filename && filename.toLowerCase().indexOf("-resized.") !== -1)) {
          let downscaledDimensions;
          if( this.props.resourceWidth && this.props.resourceHeight )
            downscaledDimensions = " " + t('item.wasDownscaled.to') + " " + this.props.resourceWidth + "x" + this.props.resourceHeight;
          downscaledWarning = <div className="downscaled item-extra-info" key="warning"><MdAspectRatio/>{t('item.wasDownscaled.text')}{downscaledDimensions}.</div>;
        }

        if (bigPictureUrl) {
          let classes = "resource-picture";
          if (this.state.lightbox) classes += " lightbox";
          if (this.state.zoomed) classes += " zoomed";
          if (!this.state.zoomed) classes += " fit-down";

          let style = {};
          if (this.state.zoomed) {
              style = { transform: `translate(${this.state.offsetX}px, ${this.state.offsetY}px) scale(2.4)` };
          }

          let sizeLabel = formatFileSize(base64ByteSize(this.props.resourceData_b64));
          let title = filename;
          if (filename && sizeLabel)
            title += " — " + sizeLabel;

          return [
              <img
                src={bigPictureUrl}
                alt={filename || t('item.beingReceivedPlaceholder')}
                title={title}
                className={classes}
                style={style}
                onClick={this.handleImageClick}
                onMouseDown={this.handleMouseDown}
                onMouseMove={this.handleMouseMove}
                onMouseUp={this.handleMouseUp}
                onMouseLeave={this.handleMouseUp}
                onTouchStart={this.handleTouchStart}
                onTouchMove={this.handleTouchMove}
                onTouchEnd={this.handleMouseUp}
                draggable={false}
                onDragStart={(e) => e.preventDefault()}
                key="image" 
                id={`item-${index}`} />,
              downscaledWarning
            ];
        }
        else if (thumbUrl)
            return (
              <img 
                src={thumbUrl} 
                alt='Downloading...' 
                className="resource-thumb fit-up" 
                id={`thumb-${index}`} />
            );
        else
            return t('item.beingReceivedPlaceholder');
    }

    render_thumb() {
      let alt = "Thumbnail of resource ";
      if(this.props.resourceFilename)
        alt += this.props.resourceFilename + " ";
      alt += "being received";
      let ith = `thumb-${this.props.multiIndex || 0}`;
      return (
        <img src={this.props.thumb} className="resource-thumb fit-up very-blurry " id={ith} alt={alt} />
      );
    }

    render_text() {
      const { t } = this.props;
      let index = this.props.multiIndex || 0;
      return (
        <div className="inbox-text" id={`item-${index}`}>
          <h3>{t('item.receivedTextMessage')}</h3>
          <div>
            <button id="copy-to-clipboard" onClick={copyTextToClipboard}>
              <MdContentCopy />
              <span className="checked"></span>
            </button>
          </div>
          <Linkify>
            <div id="text-message">
              {this.props.textMessage}
            </div>
          </Linkify>
        </div>
      );
    }

    render_external_webpage_url() {
      let index = this.props.multiIndex || 0;
      return (
        <div className="inbox-external-url" id={`item-${index}`}>
          <h3>Received URL</h3>
          <div className="external-webpage">
            <a href={this.props.resourceWebpageUrl} target="_blank" rel="noopener noreferrer">{this.props.resourceWebpageUrl}</a>
          </div>
        </div>
      )
    }

    render_spinning() {
      return (
        <div className="resource-receiving">
          <i>Receiving {this.props.resourceFilename || "data"}...</i>
        </div>
      );
    }

    render_youtuber_player() {
      let index = this.props.multiIndex || 0;
      var embedURL = "https://www.youtube.com/embed/" + this.props.youtubeID; 
      embedURL += "?autoplay=1";
      let linkToYT = "https://www.youtube.com/watch?v=" + this.props.youtubeID;
      return (
        <div className="youtube-item" id={`item-${index}`}>
          <a href={linkToYT} target="_blank" rel="noopener noreferrer" className="external-link">Link to YouTube video</a>
          <iframe id="ytplayer" title="YouTube player" type="text/html" src={embedURL} width="100%" height="600" allowFullScreen />
        </div>
      )
    }

    render_download_progress() {
      //      Receiving 20240825_123844.mp4
      //      [========..................]
      const { t } = this.props;
      var boxes = [];
      for (const item of this.props.resourceDownloadProgress) {
        let p = Math.floor( item.ratioDownloaded * 100 );
        var clazz = "resource-download";
        if(p >= 99){
          clazz += " complete";
          // Note: the custom green color does not seem to be take into account,
          // unless we also specify "background-color: white;"
        }
        boxes.push(
          <div className="resource-download-progress">
            <p>{t('webRTC.receiving')} {item.filename || t('webRTC.data')}</p>
            <progress value={p} min="0" max="100" className={clazz}>0%</progress>
          </div>
        )
      }
      return boxes;
    }
}

function selectReceivedText(){
  // Make it easier to copy to clipboard
  window.getSelection().selectAllChildren(
    document.getElementById("text-message")
  );
}

function copyTextToClipboard() {
  using("copy/text");
  let text = document.getElementById("text-message").innerText;
  navigator.clipboard.writeText(text).then(function() {
      console.log('Copied text to the clipboard:');
      console.log(text);
      showCopiedToast();
      let check = document.querySelector('#copy-to-clipboard .checked');
      // check.style.visibility = 'visible';
      check.innerHTML += "✓";
    }, function(err) {
      console.error(err);
      alert('Could not copy text to the clipboard :(');
    });

}

// Copy an already-displayed <img> element to the clipboard as PNG.
// Used to copy the picture currently shown fullscreen, which may be any
// image of a multi-share, not necessarily the first one.
export async function copyImageElementToClipboard(imgElement) {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = imgElement.naturalWidth || imgElement.width;
    canvas.height = imgElement.naturalHeight || imgElement.height;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(imgElement, 0, 0, canvas.width, canvas.height);
    // Chrome supports only image/png on the clipboard.
    const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/png"));
    await navigator.clipboard.write([
      new ClipboardItem({ "image/png": blob })
    ]);
    console.log('Copied displayed image to the clipboard in PNG format');
    showCopiedToast();
  } catch (err) {
    console.error('Could not copy image to the clipboard:', err);
    alert('Could not copy resource to the clipboard :(');
  }
}

export default withTranslation()(Item);