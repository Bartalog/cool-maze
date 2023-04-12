import React, { Component } from 'react';
import { withTranslation, Trans } from 'react-i18next';

import Linkify from 'react-linkify';
import ResourceIcon from './resourceicon.js';
import MdAspectRatio from 'react-icons/lib/md/aspect-ratio';
import MdLockOutline from 'react-icons/lib/md/lock-outline';
import {base64toBlob, isImageType, isAudioType, isVideoType} from './util.js';

require('string.prototype.startswith');

// 1 received resource or message.
// To be used in a single or multi inbox. 
class Item extends Component {
    render() {
      if (this.props.resourceData_b64)
        return this.render_Data_b64();
      
      if (this.props.resourceUrl && !this.props.e2ee)
        return this.render_unencrypted_resource();

      if (this.props.resourceUrl && this.props.resourceUrl.startsWith("https://storage.googleapis.com/cool-maze.appspot.com/sample"))
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
  
      console.debug("NO RENDER for item " + (this.props.multiIndex || 0));
      return null;
    }

    render_Data_b64() {
      const { t } = this.props;

      let e2eeLock;
      if(this.props.e2ee && (this.props.multiCount || 1) <=1)
          e2eeLock = <div className="e2ee-message item-extra-info" key="e2ee-message"><MdLockOutline/>{t('item.e2ee.text')} <span title={t('item.e2ee.tooltip')} className="hint">{t('item.e2ee.e2ee')}</span>.</div>;

      let index = this.props.multiIndex || 0;
      let type = this.props.resourceType;
      let data = this.props.resourceData_b64;
      let filename = this.props.resourceFilename;
      function dl() {
        // Works for any single resource, even from a multi-share.
        let dummy = document.createElement('a');
        let blob = base64toBlob(data, type);
        let objURL = URL.createObjectURL(blob);
        dummy.setAttribute('href', objURL);
        dummy.setAttribute('download', filename);
        dummy.style.display = 'none';
        document.body.appendChild(dummy);
        dummy.click();
        document.body.removeChild(dummy);
      }
      console.debug("Item " + index + " type " + type);

      if (isImageType(type)) {
        console.debug("  Item " + index + " displayed as image");
        let bigdataURI = "data:image/jpeg;base64," + data; // TODO any image, not just JPEG!

        let downscaledWarning;
        if( this.props.resized || (filename && filename.toLowerCase().indexOf("-resized.") !== -1)) {
          let downscaledDimensions;
          if( this.props.resourceWidth && this.props.resourceHeight )
            downscaledDimensions = " " + t('item.wasDownscaled.to') + " " + this.props.resourceWidth + "x" + this.props.resourceHeight;
          downscaledWarning = <div className="downscaled item-extra-info" key="downscaled-message"><MdAspectRatio/>{t('item.wasDownscaled.text')}{downscaledDimensions}.</div>;
        }

        return [<img 
            src={bigdataURI} 
            alt={filename || t('item.beingReceivedPlaceholder')}
            className="resource-picture fit-down" 
            onClick={dl}
            key="image" />,
            downscaledWarning,
            e2eeLock];
      }
      
      if (isVideoType(type)) {
        console.debug("  Item " + index + " displayed as video");
        let bigdataURI = "data:video/mp4;base64," + data; // TODO any video, not just MP4!
        return [
          <video src={bigdataURI} controls autoPlay className="resource-video fit-down" key="video">
            Video <a href={this.props.resourceUrl} target="_blank" rel="noopener noreferrer">{this.props.resourceFilename || "here"}</a>
          </video>,
          e2eeLock
        ];
      }

      console.debug("  Item " + index + " displayed as downloadable file");
      return [
        <div id="inbox-file" key="file">
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

        if (isVideoType(this.props.resourceType)) {
          return (
            <video src={this.props.resourceUrl} controls autoPlay className="resource-video fit-down">
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
              <audio src={this.props.resourceUrl} controls autoPlay>
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
            <div id="inbox-file">
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
        var open = function(){
          window.open(bigPictureUrl, '_blank');
        }

        let downscaledWarning;
        if( this.props.resized || (filename && filename.toLowerCase().indexOf("-resized.") !== -1)) {
          let downscaledDimensions;
          if( this.props.resourceWidth && this.props.resourceHeight )
            downscaledDimensions = " " + t('item.wasDownscaled.to') + " " + this.props.resourceWidth + "x" + this.props.resourceHeight;
          downscaledWarning = <div className="downscaled item-extra-info" key="warning"><MdAspectRatio/>{t('item.wasDownscaled.text')}{downscaledDimensions}.</div>;
        }

        if (bigPictureUrl)
          return [
              <img 
                src={bigPictureUrl} 
                alt={filename || t('item.beingReceivedPlaceholder')}
                tooltip={filename}
                className="resource-picture fit-down" 
                onClick={open}
                key="image" />,
              downscaledWarning
            ];
        else if (thumbUrl)
            return (
              <img 
                src={thumbUrl} 
                alt='Downloading...' 
                className="resource-thumb fit-up-width" />
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
        <img src={this.props.thumb} className="resource-thumb fit-up-width very-blurry " id={ith} alt={alt} />
      );
    }

    render_text() {
      return (
        <div id="inbox-text">
          <h3>Received text message</h3>
          <h5 className="selected-color-invert"
              onMouseEnter={selectReceivedText}
              onClick={selectReceivedText}>
            Select <span className="big-caret">ꕯ</span>
          </h5>
          <Linkify>
            <div id="text-message">
              {this.props.textMessage}
            </div>
          </Linkify>
        </div>
      );
    }

    render_external_webpage_url() {
      return (
        <div id="inbox-external-url">
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
      var embedURL = "https://www.youtube.com/embed/" + this.props.youtubeID; 
      embedURL += "?autoplay=1";
      let linkToYT = "https://www.youtube.com/watch?v=" + this.props.youtubeID;
      return (
        <div class="youtube-item">
          <a href={linkToYT} target="_blank" rel="noopener noreferrer" class="external-link">Link to YouTube video</a>
          <iframe id="ytplayer" title="YouTube player" type="text/html" src={embedURL} width="100%" height="600" allowFullScreen />
        </div>
      )
    }
}

function selectReceivedText(){
  // Make it easier to copy to clipboard
  window.getSelection().selectAllChildren(
    document.getElementById("text-message")
  );
}

export default withTranslation()(Item);