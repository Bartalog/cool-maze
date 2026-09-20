import React, { Component } from 'react';
import { withTranslation, Trans } from 'react-i18next';

import googlePlay from './img/get-it-on-google-play.png';
import googlePlayFade from './img/get-it-on-google-play_fade.png';
import appStore from './img/download-on-the-app-store.png';
import appStoreFade from './img/download-on-the-app-store_fade.png';

class MobileBanner extends Component {
    render() {
      const { t } = this.props;

      let androidApp;
      if (process.env.REACT_APP_play_store_url) {
        androidApp =
            <div className="mobile-app-banner-promo">
                <div className="product">
                    {t('mobileBanner.coolMazeForAndroid')}
                </div>
                <a href={process.env.REACT_APP_play_store_url}>
                      <img src={googlePlay} alt="Get it on Google Play"/>
                </a>
            </div>;
      } else {
        androidApp =
            <div className="mobile-app-banner-promo">
                <div className="product">
                    {t('mobileBanner.coolMazeForAndroid')}
                </div>
                <img src={googlePlayFade} alt="Coming soon on Google..." title="Coming soon on Google..." />
            </div>;
      }

      let iOSApp;
      if (process.env.REACT_APP_app_store_url) {
        iOSApp =
            <div className="mobile-app-banner-promo">
                <div className="product">
                    {t('mobileBanner.coolMazeForIOS')}
                </div>
                <a href={process.env.REACT_APP_app_store_url}>
                    <img src={appStore} alt="Download on the App Store" />
                </a>
            </div>;
      } else {
        iOSApp =
            <div className="mobile-app-banner-promo">
                <div className="product">
                    {t('mobileBanner.coolMazeForIOS')}
                </div>
                <img src={appStoreFade} alt="Coming soon on the Apple App Store..." title="Coming soon on the Apple App Store..." />
            </div>;
      }

      return [
        <div className="android-only" key="0">
            {androidApp}
        </div>,
        <div className="ios-only" key="1">
            {iOSApp}
        </div>
      ]
    }
  }

  export default withTranslation()(MobileBanner);