// Warning: this returns a promise, not the final value!
//
export default function sha256(message) {
    function hexString(buffer) {
      const byteArray = new Uint8Array(buffer);
    
      const hexCodes = [...byteArray].map(value => {
        const hexCode = value.toString(16);
        const paddedHexCode = hexCode.padStart(2, '0');
        return paddedHexCode;
      });
    
      return hexCodes.join('');
    }

    function digestSha256(message) {
      const encoder = new TextEncoder();
      const data = encoder.encode(message);
      return window.crypto.subtle.digest('SHA-256', data).then(function(digest){
        return hexString(digest);
      });
    }
    
    return digestSha256(message);
  }