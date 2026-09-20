import React from 'react';
import { withTranslation, Trans } from 'react-i18next';

import whitewheel from './img/wheel_black_white_128.gif';
import MdErrorOutline from 'react-icons/lib/md/error-outline';
import FaQuestionCircle from 'react-icons/lib/fa/question-circle';
import FaClose from 'react-icons/lib/fa/close';
import FaDownload from 'react-icons/lib/fa/download';

function TopBar(props) {
    const { t } = props;

    var showHelpButton = true;
    var hasResource = (props.resourceUrl || props.resourceData_b64) ? true : false;
    var clearable = (props.textMessage || hasResource || props.resourceWebpageUrl || props.spinning || props.zippable) ? true : false;

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
    var download = <button onClick={props.openAsDownload} title={t('topbar.tooltips.save')} disabled={!hasResource}><FaDownload /></button>;
    if (props.zippable)
      download = <button onClick={props.openAsDownloadZip} title={t('topbar.tooltips.saveAll')}><FaDownload /></button>;
  
    return (
      <header>
        <div className="topbar">
          <div className="topbar-zone topbar-left">
            <button onClick={props.helpAction} title={t('topbar.tooltips.whatIsThis')} disabled={!showHelpButton} className={helpCssClass}><FaQuestionCircle /></button>
          </div>
          <div className="topbar-zone topbar-center">
            {download}
            <span className="topbar-status">
              {spin}
              {error}
            </span>
          </div>
          <div className="topbar-zone topbar-right">
            <button onClick={props.clear} title={t('topbar.tooltips.clear')} disabled={!clearable}><FaClose /></button>
          </div>
        </div>
      </header>
    )
}
  
export default withTranslation()(TopBar);