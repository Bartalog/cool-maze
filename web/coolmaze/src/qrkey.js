// This secret key will be written in the QR code.
// Since #373, it is *NOT* equal to the Pusher channel ID.
// This secret key is shared between Target client and Mobile source, however if the
// Mobile source implements E2EE, then the secret key must not leak to the server.
function generateRandomKey() {
  const SECRET_KEY_LENGTH = 21; // random chars for end-to-end crypto key
  let secretKey = randomString(SECRET_KEY_LENGTH);
  console.debug("Generated secret key [" + secretKey + "]");

  return secretKey;
}

function generateRandomTransientClientName() {
  const LENGTH = 6; // Short name, as rare collisions are okay
  let transientName = randomString(LENGTH);
  return transientName;
}

function randomString(L){
  const chars = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ-.";
  const M = chars.length; // 64

  let str = "";
  let crypto = window.crypto || window.msCrypto;
  let i, j;
  if( !crypto ) {
    // Per https://developer.mozilla.org/en-US/docs/Web/API/Window/crypto all major
    // browsers support crypto. If not, let's just crash, instead of going insecure.
    throw new Error( "Capability window.crypto not found :(" );
  }
  let buf = new Uint8Array(L);
  crypto.getRandomValues(buf);
  for(i=0; i<L; i++) {
    // 01234567 would be slightly more frequent, which is OK for our use case
    j = buf[i] % M;
    str += chars.charAt(j);
  }
  return str;
}

export const genRandomKey = generateRandomKey;
export const genRandomTransientClientName = generateRandomTransientClientName;