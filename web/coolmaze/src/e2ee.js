// End-to-end encryption.
// The target client knows how to decrypt.

import {warningBackend, errorBackend} from './backend.js';

// Utility functions for conversion
export function hexToBytes(hex) {
    let bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < bytes.length; i++) {
        bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
    }
    return bytes;
}

export function base64ToBytes(base64) {
    let binaryString = window.atob(base64);
    let bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
}

export function bytesToBase64(bytes) {
    let binaryString = '';
    for (let i = 0; i < bytes.length; i++) {
        binaryString += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binaryString);
}

export function bytesToUtf8(bytes) {
    return new TextDecoder().decode(bytes);
}

// Derive a 128-bit key from passphrase using PBKDF2
async function deriveKey(passPhrase, saltBytes, iterations) {
    const encoder = new TextEncoder();
    const passphraseBytes = encoder.encode(passPhrase);
    
    const keyMaterial = await window.crypto.subtle.importKey(
        'raw',
        passphraseBytes,
        { name: 'PBKDF2' },
        false,
        ['deriveBits', 'deriveKey']
    );

    return await window.crypto.subtle.deriveKey(
        {
            name: 'PBKDF2',
            salt: saltBytes,
            iterations: iterations,
            hash: 'SHA-1' // PBKDF2 uses SHA-1 by default
        },
        keyMaterial,
        { name: 'AES-CTR', length: 128 },
        false,
        ['decrypt']
    );
}

// The first and second args must be in base64.
// The result will be a Uint8Array.
async function decrypt(algo, cipherText_b64, iv_b64, passPhrase) {
  // console.debug("Crypto algo [" + algo + "]");
  // console.debug("decrypt using IV [ " + iv_b64 + " ], passPhrase [ " + passPhrase + " ]");
  if(algo && algo !== "AES/CTR/NoPadding") {
    console.warn("Only AES/CTR/NoPadding is currently supported. Found algo " + algo);
  }
  // console.debug("Deciphering " + cipherText_b64.length + " bytes of Base64 with iv_b64=" + iv_b64 + ", pass=" + passPhrase);
  
  const cipherBytes = base64ToBytes(cipherText_b64);
  return await decryptWords(algo, cipherBytes, iv_b64, passPhrase);
}

async function decryptWords(algo, cipherBytes, iv_b64, passPhrase) {
  // console.debug("Crypto algo [" + algo + "]");
  // console.debug("decryptWords using IV [ " + iv_b64 + " ], passPhrase [ " + passPhrase + " ]");
  if(algo && algo !== "AES/CTR/NoPadding") {
    console.warn("Only AES/CTR/NoPadding is currently supported. Found algo " + algo);
  }

  // This salt is a Cool-Maze-wide constant.
  // Salt size is 32 bytes == (256 / 8)
  const saltHex = '92d1615c585468f2d6a24cf5c56b53f922ce83f7e45d58a99b82b52fc2eb78e4';
  const saltBytes = hexToBytes(saltHex);
  const iterations = 1000;
  
  const aesKey = await deriveKey(passPhrase, saltBytes, iterations);
  const ivBytes = base64ToBytes(iv_b64);

  const decrypted = await window.crypto.subtle.decrypt(
    {
      name: "AES-CTR",
      counter: ivBytes,
      length: 128 // Full IV is the counter
    },
    aesKey,
    cipherBytes
  );

  // If the input is incorrect, no error is thrown.
  // Instead, the returned bytes are gibberish.
  return new Uint8Array(decrypted);
}

export const Decrypt = decrypt;
export const DecryptWords = decryptWords;
