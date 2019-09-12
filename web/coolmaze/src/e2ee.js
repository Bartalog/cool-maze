import CryptoJS from 'crypto-js';

// End-to-en encryption.
// The target client knows how to decrypt.

// The first and second args must be in base64.
// The result will be a "words" object.
function decrypt(algo, cipherText_b64, iv_b64, passPhrase) {
  console.log("Crypto algo [" + algo + "]");
  if(algo && algo !== "AES/CTR/NoPadding") {
    console.warn("Only AES/CTR/NoPadding is currently supported. Found algo " + algo);
  }
  console.log("Deciphering " + cipherText_b64.length + " bytes of Base64 with iv_b64=" + iv_b64 + ", pass=" + passPhrase);
  // This salt is a Cool-Maze-wide constant.
  // Salt size is 32 bytes == (256 / 8)
  let saltHex = '92d1615c585468f2d6a24cf5c56b53f922ce83f7e45d58a99b82b52fc2eb78e4';
  let saltWords = CryptoJS.enc.Hex.parse(saltHex);
  let iterations = 1000;
  let aesKey = CryptoJS.PBKDF2(
      passPhrase, 
      saltWords, 
      { keySize: 128/32, iterations: iterations });
  console.log("aesKey.toString(): " + aesKey.toString());

  let cipherWords = CryptoJS.enc.Base64.parse(cipherText_b64);
  console.log(preview("cipherWords="+cipherWords, 100) + "(" + (""+cipherWords).length + " chars)");
  // let ivHex =     'a217f5a0fb926f7009a4c821d76e6788';
  // let ivWords = CryptoJS.enc.Hex.parse(ivHex);
  let ivWords = CryptoJS.enc.Base64.parse(iv_b64);
  console.log("ivWords="+ivWords);
  let decryptedWords = CryptoJS.AES.decrypt(
    {
      ciphertext: cipherWords,
      salt: saltWords
    },
    aesKey, 
    { 
      iv: ivWords, 
      padding: CryptoJS.pad.NoPadding,
      mode: CryptoJS.mode.CTR
    });
 //console.log(decryptedWords);
 //console.log("decryptedWords=" + decryptedWords);
 //let decrypted = hex2a(decryptedWords.toString());
 // console.log("hex2a(decryptedWords)="+hex2a(decryptedWords.toString()));
 //let decrypted = decryptedWords.toString();
 //let decrypted = decryptedWords.toString(CryptoJS.enc.Utf8);
 //let decrypted = decryptedWords.toString(CryptoJS.enc.Latin1);
 //let decrypted = decryptedWords.toString(CryptoJS.enc.Utf16);
 //let decrypted = decryptedWords.toString(CryptoJS.enc.Hex);
 //let decrypted = CryptoJS.enc.Base64.stringify(decryptedWords);
 //console.log("decrypted_ = " + decrypted);
 return decryptedWords;
}

function preview(str, n) {
  if(str.length < n)
    return str;
  return str.substring(0, n) + "…";
}

function decryptWords(algo, cipherWords, iv_b64, passPhrase) {
  console.log("Crypto algo [" + algo + "]");
  if(algo && algo !== "AES/CTR/NoPadding") {
    console.warn("Only AES/CTR/NoPadding is currently supported. Found algo " + algo);
  }

  // This salt is a Cool-Maze-wide constant.
  // Salt size is 32 bytes == (256 / 8)
  let saltHex = '92d1615c585468f2d6a24cf5c56b53f922ce83f7e45d58a99b82b52fc2eb78e4';
  let saltWords = CryptoJS.enc.Hex.parse(saltHex);
  let iterations = 1000;
  let aesKey = CryptoJS.PBKDF2(
      passPhrase, 
      saltWords, 
      { keySize: 128/32, iterations: iterations });
  console.log("aesKey.toString(): " + aesKey.toString());

  // warning the following line is super-slow when cipherWords is large!
  //console.log(preview("cipherWords="+cipherWords, 100) + "(" + (""+cipherWords).length + " chars)");
  let ivWords = CryptoJS.enc.Base64.parse(iv_b64);
  console.log("ivWords="+ivWords);
  let decryptedWords = CryptoJS.AES.decrypt(
    {
      ciphertext: cipherWords,
      salt: saltWords
    },
    aesKey, 
    { 
      iv: ivWords, 
      padding: CryptoJS.pad.NoPadding,
      mode: CryptoJS.mode.CTR
    });
 return decryptedWords;
}

export const Decrypt = decrypt;
export const DecryptWords = decryptWords;
