import React from 'react';

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
  