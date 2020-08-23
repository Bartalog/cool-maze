import React, { Component } from 'react';
import ProgressiveImage from 'react-progressive-image';
import Linkify from 'react-linkify';
import ResourceIcon from './resourceicon.js';
import MdAspectRatio from 'react-icons/lib/md/aspect-ratio';
import MdLockOutline from 'react-icons/lib/md/lock-outline';
import base64toBlob from './util.js';

require('string.prototype.startswith');

// 1 received resource or message.
// To be used in a single or multi inbox. 
export default class Item extends Component {
    render() {
      let e2eeLock;
      if(this.props.e2ee)
        e2eeLock = <div className="e2ee-message item-extra-info" key="e2ee-message"><MdLockOutline/>This transfer was <span title="Data sent with Cool Maze for Android is encrypted in such a way that the Cool Maze service provider can't read it." className="hint">end-to-end encrypted</span>.</div>;

      if (this.props.resourceData_b64){
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
              downscaledDimensions = " to " + this.props.resourceWidth + "x" + this.props.resourceHeight;
            downscaledWarning = <div className="downscaled item-extra-info" key="downscaled-message"><MdAspectRatio/>This picture was downscaled{downscaledDimensions}.</div>;
          }

          return [<img 
              src={bigdataURI} 
              alt={filename || "...  Freshly sent resource  ..."}
              className="resource-picture fit-down" 
              onClick={dl}
              key="image" />,
              downscaledWarning,
              e2eeLock];
        } else if (isVideoType(type)) {
          console.debug("  Item " + index + " displayed as video");
          let bigdataURI = "data:video/mp4;base64," + data; // TODO any video, not just MP4!
          return [
            <video src={bigdataURI} controls autoPlay className="resource-video fit-down" key="video">
              Video <a href={this.props.resourceUrl} target="_blank" rel="noopener noreferrer">{this.props.resourceFilename || "here"}</a>
            </video>,
            e2eeLock
          ];
        } else {
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
          ]
        }
      }
      
      if (this.props.resourceUrl){
  
        if(this.props.youtubeID) {
          var embedURL = "https://www.youtube.com/embed/" + this.props.youtubeID; 
          embedURL += "?autoplay=1";
          let linkToYT = "https://www.youtube.com/watch?v=" + this.props.youtubeID;
          return (
            <div class="youtube-item">
              <a href={linkToYT} target="_blank" rel="noopener noreferrer" class="external-link">Link to YouTube video</a>
              <iframe id="ytplayer" title="YouTUbe player" type="text/html" src={embedURL} width="100%" height="600" allowFullScreen />
            </div>
          )
        }
  
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
            downscaledDimensions = " to " + this.props.resourceWidth + "x" + this.props.resourceHeight;
          downscaledWarning = <div className="downscaled item-extra-info" key="warning"><MdAspectRatio/>This picture was downscaled{downscaledDimensions}.</div>;
        }
  
        return (
            <ProgressiveImage src={bigPictureUrl} placeholder={thumbUrl}>
              {function(src) {
                if (thumbUrl && src===thumbUrl)
                  return (
                    <img 
                      src={src} 
                      alt='Downloading...' 
                      className="resource-thumb fit-up-height" />
                  );
                else
                  return [
                      <img 
                        src={src} 
                        alt={filename || "...  Freshly sent resource  ..."}
                        className="resource-picture fit-down" 
                        onClick={open}
                        key="image" />,
                      downscaledWarning
                    ];
              }}
            </ProgressiveImage>
        );
      }
  
      if (this.props.thumb){
        let alt = "Thumbnail of resource ";
        if(this.props.resourceFilename)
          alt += this.props.resourceFilename + " ";
        alt += "being received";
        return (
          <img src={this.props.thumb} className="resource-thumb fit-up-height very-blurry" alt={alt} />
        );
      }
  
      if (this.props.textMessage)
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
              <a href={this.props.resourceWebpageUrl} target="_blank" rel="noopener noreferrer">{this.props.resourceWebpageUrl}</a>
            </div>
          </div>
        )
      }
  
      if(this.props.spinning)
        return (
          <div className="resource-receiving">
            <i>Receiving {this.props.resourceFilename || "data"}...</i>
          </div>
        );
  
      return null;
    }

}

function selectReceivedText(){
  // Make it easier to copy to clipboard
  window.getSelection().selectAllChildren(
    document.getElementById("text-message")
  );
}

function isImageType(contentType) {
  if(!contentType)
    return false;
  if(contentType.startsWith('image/'))
    return true;
  return false;
}
function isVideoType(contentType) {
    if(!contentType)
      return false;
    if(contentType.startsWith('video/'))
      return true;
    if(contentType === "application/ogg")
      return true; // Note that it may be an audio file as well
    return false;
}
  
function isAudioType(contentType) {
  if(!contentType)
    return false;
  if(contentType.startsWith('audio/'))
    return true;
  return false;
}