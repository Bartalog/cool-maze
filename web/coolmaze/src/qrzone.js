import React, { Component } from 'react';
import { withTranslation, Trans } from 'react-i18next';

import arrow from './img/red_arrow.png';
import picto128 from './img/coolmaze_128.png';
import {QRCodeCanvas} from 'qrcode.react';
// 'qrcode.react' also has {QRCodeSVG}, but smooth resize animation doesn't seem to work with QRCodeSVG

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
            <QRCodeCanvas value={qrText} 
              size={125 * this.props.qrSize} 
              imageSettings={{src:arrow, width: 31* this.props.qrSize, height: 31* this.props.qrSize}}
              level="L" />
          </div>
        </div>
      )
    }
  
  
}
  
export default withTranslation()(QrZone);