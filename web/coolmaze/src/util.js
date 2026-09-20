
export const base64toBlob = function(base64Data, contentType) {
    // From https://stackoverflow.com/a/20151856/871134
    contentType = contentType || '';
    var sliceSize = 1024;
    var byteCharacters = atob(base64Data);
    var bytesLength = byteCharacters.length;
    var slicesCount = Math.ceil(bytesLength / sliceSize);
    var byteArrays = new Array(slicesCount);
  
    for (var sliceIndex = 0; sliceIndex < slicesCount; ++sliceIndex) {
        var begin = sliceIndex * sliceSize;
        var end = Math.min(begin + sliceSize, bytesLength);
  
        var bytes = new Array(end - begin);
        for (var offset = begin, i = 0; offset < end; ++i, ++offset) {
            bytes[i] = byteCharacters[offset].charCodeAt(0);
        }
        byteArrays[sliceIndex] = new Uint8Array(bytes);
    }
    return new Blob(byteArrays, { type: contentType });
}

// Number of bytes encoded by a base64 string (accounting for padding).
export const base64ByteSize = function(base64Data) {
    if (!base64Data)
      return null;
    let len = base64Data.length;
    let padding = 0;
    if (base64Data.endsWith('=='))
      padding = 2;
    else if (base64Data.endsWith('='))
      padding = 1;
    return Math.floor(len * 3 / 4) - padding;
}

// Human-readable file size: integer kB up to 1MB, then MB with 1 decimal.
// e.g. 466000 => "455 kB", 2411724 => "2.3 MB". Returns null if unknown.
export const formatFileSize = function(bytes) {
    if (bytes == null || isNaN(bytes) || bytes < 0)
      return null;
    const MB = 1024 * 1024;
    if (bytes <= MB)
      return Math.round(bytes / 1024) + " kB";
    return (bytes / MB).toFixed(1) + " MB";
}

export const youtubeVideoID = function(url) {
    // From https://stackoverflow.com/a/10315969/871134
    var p = /^(?:https?:\/\/)?(?:www\.)?(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))((\w|-){11})(?:\S+)?$/;
    return (url.match(p)) ? RegExp.$1 : false;
}


export const isImageType = function(contentType) {
    if(!contentType)
      return false;
    if(contentType.startsWith('image/'))
      return true;
    return false;
}
  
export const isVideoType = function(contentType) {
      if(!contentType)
        return false;
      if(contentType.startsWith('video/'))
        return true;
      if(contentType === "application/ogg")
        return true; // Note that it may be an audio file as well
      return false;
}
    
export const isAudioType = function(contentType) {
    if(!contentType)
      return false;
    if(contentType.startsWith('audio/'))
      return true;
    return false;
  }

// data is expected to have type Uint8Array<ArrayBuffer>
export const detectImageMimeType = function(data) {
  if (!data || data.length < 4)
    return null;

  // Extract the first 4 bytes for comparison
  const b0 = data[0];
  const b1 = data[1];
  const b2 = data[2];
  const b3 = data[3];

  // 1. JPEG: Starts with FF D8 FF
  if (b0 === 0xFF && b1 === 0xD8 && b2 === 0xFF) {
    return 'image/jpeg';
  }

  // 2. PNG: Starts with 89 50 4E 47 (.PNG)
  if (b0 === 0x89 && b1 === 0x50 && b2 === 0x4E && b3 === 0x47) {
    return 'image/png';
  }

  // 3. GIF: Starts with 47 49 46 38 (GIF87a or GIF89a)
  if (b0 === 0x47 && b1 === 0x49 && b2 === 0x46 && b3 === 0x38) {
    return 'image/gif';
  }

  // 4. WEBP: Starts with 52 49 46 46 (RIFF) ... and 57 45 42 50 (WEBP) at index 8
  // We check the first 4 bytes for the "RIFF" container
  if (b0 === 0x52 && b1 === 0x49 && b2 === 0x46 && b3 === 0x46) {
    return 'image/webp'; 
  }

  // No match found - likely gibberish or an unsupported format
  return null;
}

export const formatBytesToHex = function(data, n) {
  if (!data) {
    return "";
  }

  return Array.from(data.slice(0, n))
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join(' ');
}