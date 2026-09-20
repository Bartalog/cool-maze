import React, { Component } from 'react';
import { withTranslation, Trans } from 'react-i18next';

import schema from './img/schema.png';
import schemaCartoon from './img/schema-cartoon.png';
import googlePlay from './img/get-it-on-google-play.png';
import googlePlayFade from './img/get-it-on-google-play_fade.png';
import appStore from './img/download-on-the-app-store.png';
import appStoreFade from './img/download-on-the-app-store_fade.png';
import FaClose from 'react-icons/lib/fa/close';
import FaExclamationTriangle from 'react-icons/lib/fa/exclamation-triangle';
import FaShareAlt from 'react-icons/lib/fa/share-alt';
import picto128 from './img/coolmaze_128.png';

class Help extends Component {
    render() {
      const { t } = this.props;

      let appSchema = schema; // Cool Maze dog photo
      if( process.env.REACT_APP_app_mnemonic==="ptc" ) {
        appSchema = schemaCartoon; // Push to Computer cartoon dog
      }

      let androidApp;
      if (process.env.REACT_APP_play_store_url) {
        androidApp =
            <a href={process.env.REACT_APP_play_store_url} target="_blank" rel="noopener noreferrer">
              <img src={googlePlay} alt="Get it on Google Play"/>
            </a>;
      } else {
        androidApp =
            <img src={googlePlayFade} alt="Coming soon on Google..." title="Coming soon on Google..." />;
      }

      let iOSApp;
      if (process.env.REACT_APP_app_store_url) {
        iOSApp =
            <a href={process.env.REACT_APP_app_store_url} target="_blank" rel="noopener noreferrer">
              <img src={appStore} alt="Download on the App Store" />
            </a>;
      } else {
        iOSApp =
            <img src={appStoreFade} alt="Coming soon on the Apple App Store..." title="Coming soon on the Apple App Store..." />;
      }

      let tutorialVideo;
      if (process.env.REACT_APP_youtube_demo_video_show === "true") {
        tutorialVideo = <div className="tutorial-video">
              <iframe src={t('help.demoVideoURL')}>
              </iframe>
            </div>;
      }

      let blogParagraph;
      if (process.env.REACT_APP_blog_url) {
        blogParagraph = <p><a href={process.env.REACT_APP_blog_url} target="_blank">{t('help.blog')}</a>{t('help.privacy.inEnglish')}.</p>;
      }

      let bugReportParagraph;
      if (process.env.REACT_APP_bug_tracker_url) {
        bugReportParagraph = <p className="dim">
            {t('help.reportBug.reportInThe')} <a href={process.env.REACT_APP_bug_tracker_url} target="_blank">{t('help.reportBug.bugTracker')}</a> {t('help.reportBug.or')} <a href={"mailto:bartalogsoftware@gmail.com?subject=Problem%20with%20"+process.env.REACT_APP_app_name}>{t('help.reportBug.byEmail')}</a>.
          </p>;
      }

      let dualAppPromo;
      if (process.env.REACT_APP_dual_app_url) {
        dualAppPromo = <div className="link-to-dual dim">
            {t('help.hotmaze.text')} <a href={process.env.REACT_APP_dual_app_url} target="_blank">{process.env.REACT_APP_dual_app_name}</a>.
          </div>;
      }

      return (
        <div id="help">
          <div id="help-contents">
            <div id="help-close" onClick={this.props.closeAction}><FaClose /></div>
            <p className="warning-specific-QR"><FaExclamationTriangle/> {t('help.qrOnlyWithCoolMaze')}</p>
            <p className="intro">{t('help.intro')}</p>
            <img src={appSchema} className="help-schema" alt="Illustration: Mobile-to-Desktop action" />
            <ol className="steps">
              <li>
                <Trans i18nKey="help.steps.1" />
                <div className="stores">
                  {androidApp}
                  {iOSApp}
                </div>
              </li>
              <li className="open-website-in-computer"><Trans i18nKey="help.steps.2" /></li>
              <li>{t('help.steps.3.text')} <span className="rounded"><strong><FaShareAlt /></strong></span>&nbsp;<i>{t('help.steps.3.shareVia')}</i> &gt; <span className="rounded"><img src={picto128} className="mini-picto" alt="" /> <strong>{process.env.REACT_APP_app_name}</strong></span></li>
              <li>{t('help.steps.4')}</li>
            </ol>
            {tutorialVideo}
            
            <p>{t('help.thatsIt')}</p>
            <p className="dim">{t('help.needInternet')}</p>
            <p className="dim"><Trans i18nKey="help.privacy.text" /> <a href="terms" target="_blank">{t('help.privacy.termsTitle')}</a>{t('help.privacy.inEnglish')}.</p>
            <p className="dim">{t('help.timeout')}</p>
            {blogParagraph}
            {bugReportParagraph}
            {dualAppPromo}
          </div>
        </div>
      )
    }
  }

  export default withTranslation()(Help);