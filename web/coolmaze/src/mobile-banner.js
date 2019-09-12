import React, { Component } from 'react';
import googlePlay from './img/get-it-on-google-play.png';
import appStore from './img/download-on-the-app-store.png';

export default class MobileBanner extends Component {
    render() {
      return [
        <div className="android-only" key="0">
            <div className="mobile-app-banner-promo">
                <div className="product">
                    Cool Maze for Android
                </div>
                <a href="https://play.google.com/store/apps/details?id=com.bartalog.coolmaze">
                      <img src={googlePlay} alt="Get it on Google Play"/>
                </a>
            </div>
        </div>,
        <div className="ios-only" key="1">
            <div className="mobile-app-banner-promo">
                <div className="product">
                    Cool Maze for iOS
                </div>
                <a href="https://itunes.apple.com/us/app/cool-maze/id1284597516?mt=8">
                    <img src={appStore} alt="Download on the App Store" />
                </a>
            </div>
        </div>
      ]
    }
  }