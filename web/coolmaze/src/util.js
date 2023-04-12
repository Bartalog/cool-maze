
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