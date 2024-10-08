import {Component} from 'react';
import Help from './help.js';
import QrZone from './qrzone.js';
import Inbox from './inbox.js';
import InboxMulti from './inboxmulti.js';
import {ZipProgress} from './zip.js';

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
      var resourceDownloadProgress = this.props.resourceDownloadProgress;
  
      if (!thumb && !resourceUrl && !resourceData_b64 && !resourceWebpageUrl && !textMessage && !multi && !spinning && !resourceDownloadProgress)
        return (
          <div className="main">
            <QrZone 
              qrKey={this.props.qrKey} 
              qrSize={this.props.qrSize}
              qrAnimClass={this.props.qrAnimClass}
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
              e2ee={e2ee}
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
            resourceDownloadProgress={resourceDownloadProgress}
          />
        </div>
      );
    }
}

export default MainZone;