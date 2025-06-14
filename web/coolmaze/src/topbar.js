import React from 'react';
import { withTranslation, Trans } from 'react-i18next';

import whitewheel from './img/wheel_black_white_128.gif';
import MdErrorOutline from 'react-icons/lib/md/error-outline';
import FaQuestionCircle from 'react-icons/lib/fa/question-circle';
import FaClose from 'react-icons/lib/fa/close';
import FaExternalLink from 'react-icons/lib/fa/external-link';
import FaDownload from 'react-icons/lib/fa/download';

function TopBar(props) {
    const { t } = props;

    var showHelpButton = true;
    var hasResource = (props.resourceUrl || props.resourceData_b64) ? true : false;
    var clearable = (props.textMessage || hasResource || props.resourceWebpageUrl || props.spinning || props.zippable) ? true : false;
    var openableUrl = false; 
    // #615 "Open this URL in new tab" is obsolete, because in general with E2EE, shared resources are not available at
    //      all in clear text at a given URL.
    // if(props.resourceUrl)
    //   openableUrl = props.resourceUrl;
    // if(props.resourceWebpageUrl)
    //   openableUrl = props.resourceWebpageUrl;
  
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
    var download = <button onClick={props.openAsDownload} title={t('topbar.tooltips.save')} disabled={!hasResource}><FaDownload /></button>;
    if (props.zippable)
      download = <button onClick={props.openAsDownloadZip} title={t('topbar.tooltips.saveAsZIP')}><FaDownload /></button>;
  
    return (
      <header>
        <table className="topbar">
          <tbody>
            <tr>
              <td>
                <button onClick={props.helpAction} title={t('topbar.tooltips.whatIsThis')} disabled={!showHelpButton} className={helpCssClass}><FaQuestionCircle /></button>
              </td>
              <td>
                <button onClick={props.openInNewTab} title={t('topbar.tooltips.openInNewTab')} disabled={!openableUrl}><FaExternalLink /></button>
              </td>
              <td>
                {download}
              </td>
              <td>
                {spin}
                {error}
              </td>
              <td>
                <button onClick={props.clear} title={t('topbar.tooltips.clear')} disabled={!clearable}><FaClose /></button>
              </td>
            </tr>
          </tbody>
        </table>
      </header>
    )
}
  
export default withTranslation()(TopBar);