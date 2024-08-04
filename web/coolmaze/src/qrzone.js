import React, { Component } from 'react';
import { withTranslation, Trans } from 'react-i18next';

import arrow from './img/red_arrow.png';
import picto128 from './img/coolmaze_128.png';

// This lib generates simpler (21x21) code
let QRCode = require('qrcode.react');

// This lib supports logo
// let QRCode = require('qrcode-react');

// QrZone is for displaying a QR-code.
class QrZone extends Component {

    render() {
      const { t } = this.props;
      if ( this.props.qrKey === "reload" ) {
        // Dirty magic value to detect removed QR-code.
        // issues/244 after 10mn, QR-code removed, user must click.
        return (
          <div id="qr-zone" className="please-reload">
            <div>
              <button onClick={this.props.clear}>
                <img src={picto128} alt={t('qrZone.reload')} />
              </button>
            </div>
            <div>
              <i>{t('qrZone.pleaseReload')}</i>
            </div>
          </div>
        )
      }

      // #355
      // By default: a full URL for app discoverability.
      // TODO https for cmaz
      //var qrText = 'https://cmaz.io/#' + this.props.qrKey;
      var qrText = 'cmaz.io/#' + this.props.qrKey;
      // On biggest zoom: just the qrKey, fewer chars, possibly easier to scan from afar
      if (this.props.qrSize > 4)
        qrText = this.props.qrKey;
      console.debug("qrText="+qrText);
  
      return (
        <div id="qr-zone">
          <div id="qrcode" title={t('qrZone.clickToEnlarge')} onClick={this.props.embiggen} className={this.props.qrAnimClass}> 
            <QRCode value={qrText} size={125 * this.props.qrSize} logo={arrow} level="M" />
          </div>
        </div>
      )
    }
  
    componentDidMount() {
      this.printLogoInQR();
    }
    
    componentDidUpdate() {
      this.printLogoInQR();
    }
  
    printLogoInQR() {
      // Render the Cool Maze red arrow logo
      // in the center of the QR-code canvas.
      //
      // Maybe this should be rewritten some day, in a React style.
  
      var parent = document.getElementById('qrcode');
      if (!parent)
        return;
      var canvas = parent.querySelector('canvas');
      if(!canvas)
        return;
  
      var ctx = canvas.getContext('2d');
  
      var qrsize = 125 * this.props.qrSize;
      // var logosize = 50;
      var logosize = qrsize/4;
      var image = new Image();
      image.onload = function() {
          var dwidth = logosize || qrsize * 0.2;
          var dheight = logosize || image.height / image.width * dwidth;
          var dx = (qrsize - dwidth) / 2;
          var dy = (qrsize - dheight) / 2;
          image.width = dwidth;
          image.height = dheight;
          ctx.drawImage(image, dx, dy, dwidth, dheight);
      }
      image.onerror = function(x, y) {
          console.warn("Error on loading red arrow logo :(");
      }
      image.src = arrow;
    }
}
  
export default withTranslation()(QrZone);