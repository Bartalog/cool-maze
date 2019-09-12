import React, { Component } from 'react';
import schema from './img/schema.png';
import googlePlay from './img/get-it-on-google-play.png';
import appStore from './img/download-on-the-app-store.png';
import FaClose from 'react-icons/lib/fa/close';
import FaExclamationTriangle from 'react-icons/lib/fa/exclamation-triangle';
import picto128 from './img/coolmaze_128.png';

export default class Help extends Component {
    render() {
      return (
        <div id="help">
          <div><span id="question-mark" onClick={this.props.closeAction}> </span></div>
          <div id="help-contents">
            <div id="help-close" onClick={this.props.closeAction}><FaClose /></div>
            <p className="warning-specific-QR"><FaExclamationTriangle/> This QR-code works only with mobile app Cool Maze!</p>
            <img src={schema} width="296" height="400" className="help-schema right" alt="Illustration: Mobile-to-Desktop action" />
            <p>You can share a document from your mobile device to a computer or video projector</p>
            <span>
              <ol>
                <li>
                  Install <strong>Cool Maze</strong> on your mobile
                  <div className="stores">
                    <a href="https://play.google.com/store/apps/details?id=com.bartalog.coolmaze" target="_blank" rel="noopener noreferrer">
                      <img src={googlePlay} alt="Get it on Google Play"/>
                    </a>
                    <a href="https://itunes.apple.com/us/app/cool-maze/id1284597516?mt=8" target="_blank" rel="noopener noreferrer">
                      <img src={appStore} alt="Download on the App Store" />
                    </a>
                  </div>
                </li>
                <li>Open <strong>coolmaze.io</strong> in your computer browser</li>
                <li>On mobile resource (photo, video, URL, PDF), select <span className="rounded"><strong><i>Share via</i></strong></span> > <span className="rounded"><img src={picto128} className="mini-picto" alt="" /> <strong>Cool Maze</strong></span></li>
                <li>Scan the QR-code</li>
              </ol>
            </span>
            <p>That's it. No login, no passwords, no ads.</p>
            <p className="dim">The two devices (source and target) must have internet connection.</p>
            <p className="dim"><strong>Your data remains private</strong>. It is not publicly available and not disclosed to third parties. See the <a href="terms">Privacy terms</a>.</p>
            <p className="dim">Resource is available only for a few minutes after transfer, so you may want to explicitly save it on your computer.</p>
  
            <div className="link-to-dual dim">
              But I want to send from computer to mobile instead! Use <a href="https://hotmaze.io/">Hot Maze</a>.
            </div>
          </div>
        </div>
      )
    }
  }