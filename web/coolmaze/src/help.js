import React, { Component } from 'react';
import { withTranslation, Trans } from 'react-i18next';

import schema from './img/schema.png';
import googlePlay from './img/get-it-on-google-play.png';
import appStore from './img/download-on-the-app-store.png';
import FaClose from 'react-icons/lib/fa/close';
import FaExclamationTriangle from 'react-icons/lib/fa/exclamation-triangle';
import FaShareAlt from 'react-icons/lib/fa/share-alt';
import picto128 from './img/coolmaze_128.png';

class Help extends Component {
    render() {
      const { t } = this.props;
      return (
        <div id="help">
          <div id="help-contents">
            <div id="help-close" onClick={this.props.closeAction}><FaClose /></div>
            <p className="warning-specific-QR"><FaExclamationTriangle/> {t('help.qrOnlyWithCoolMaze')}</p>
            <img src={schema} width="296" height="400" className="help-schema right" alt="Illustration: Mobile-to-Desktop action" />
            <p>{t('help.intro')}</p>
            <span>
              <ol className="steps">
                <li>
                  <Trans i18nKey="help.steps.1" />
                  <div className="stores">
                    <a href="https://play.google.com/store/apps/details?id=com.bartalog.coolmaze" target="_blank" rel="noopener noreferrer">
                      <img src={googlePlay} alt="Get it on Google Play"/>
                    </a>
                    <a href="https://itunes.apple.com/us/app/cool-maze/id1284597516?mt=8" target="_blank" rel="noopener noreferrer">
                      <img src={appStore} alt="Download on the App Store" />
                    </a>
                  </div>
                </li>
                <li><Trans i18nKey="help.steps.2" /></li>
                <li>{t('help.steps.3.text')} <span className="rounded"><strong><FaShareAlt /></strong></span>&nbsp;<i>{t('help.steps.3.shareVia')}</i> &gt; <span className="rounded"><img src={picto128} className="mini-picto" alt="" /> <strong>Cool Maze</strong></span></li>
                <li>{t('help.steps.4')}</li>
              </ol>
            </span>
            <iframe 
              width={560} height={315} 
              src={t('help.demoVideoURL')}>
            </iframe>
            
            <p>{t('help.thatsIt')}</p>
            <p className="dim">{t('help.needInternet')}</p>
            <p className="dim"><Trans i18nKey="help.privacy.text" /> <a href="terms" target="_blank">{t('help.privacy.termsTitle')}</a> {t('help.privacy.inEnglish')}.</p>
            <p className="dim">{t('help.timeout')}</p>
            <p className="dim"><a href="https://github.com/Bartalog/cool-maze/labels/bug" target="_blank">{t('help.reportBug')}</a>.</p>
  
            {<div className="link-to-dual dim">
              {t('help.hotmaze.text')} <a href="https://hotmaze.io/" target="_blank">Hot Maze</a>.
            </div>}
          </div>
        </div>
      )
    }
  }

  export default withTranslation()(Help);