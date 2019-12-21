import React from 'react';

/*
    The purpose of this URL bar widget is to display the domain name coolmaze.io,
    for advertising, when the page is fullscreen (real URL bar hidden).
    However this may lead to confusion and be interpreted as a malicious fake UI
    designed to lure the user into thinking that the trust components "lock" and 
    "https" were rendered by the browser, which is not the case.

    A better solution is to display a domain name, but stylized as an browser URL bar.
*/

export default function BigUrlBar(props) {
    return (
      <div className="browserbar">
          <div className="urlbar">
              <span className="green lock" role="img" aria-label="secure">
                  🔒
              </span>
              <span className="gray pipe">
                  |
              </span>
              <span className="green">https</span><span className="gray">://</span>coolmaze.io
              <span className="star" role="img" aria-label="star">
                ☆
              </span>
          </div>
      </div>
    )
}
  