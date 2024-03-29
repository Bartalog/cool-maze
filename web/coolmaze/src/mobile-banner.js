import React, { Component } from 'react';
import { withTranslation, Trans } from 'react-i18next';

import googlePlay from './img/get-it-on-google-play.png';
import appStore from './img/download-on-the-app-store.png';

class MobileBanner extends Component {
    render() {
      const { t } = this.props;
      return [
        <div className="android-only" key="0">
            <div className="mobile-app-banner-promo">
                <div className="product">
                    {t('mobileBanner.coolMazeForAndroid')}
                </div>
                <a href="https://play.google.com/store/apps/details?id=com.bartalog.coolmaze">
                      <img src={googlePlay} alt="Get it on Google Play"/>
                </a>
            </div>
        </div>,
        <div className="ios-only" key="1">
            <div className="mobile-app-banner-promo">
                <div className="product">
                    {t('mobileBanner.coolMazeForIOS')}
                </div>
                <a href="https://itunes.apple.com/us/app/cool-maze/id1284597516?mt=8">
                    <img src={appStore} alt="Download on the App Store" />
                </a>
            </div>
        </div>
      ]
    }
  }

  export default withTranslation()(MobileBanner);