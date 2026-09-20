import {using, backendHost, errorBackend, warningBackend} from './backend.js';

// issues/514
// The backend may follow its heuristic and send us a "pre-cast" signal with an URL to an encrypted
// resource (but not the decryption key), even before the user has scanned the QR code.
// When receiving such a signal, it is appropriate to download the encrypted resource immediately, and
// then wait for the decryption key to arrive.
//
// This can be used for a single resource share action, or a multiple resource share action.
//
// It is not meant to be used for simple text messages such as a webpage URL. Only for files.

const preDownloadLocalCache = {};

function preDownloadResource(app, data) {
    console.debug("preDownloadResource", data);
    if( !data.message.startsWith("https://storage.googleapis.com/cool-maze-transit/")
        && !data.message.startsWith("https://storage.googleapis.com/push-to-computer-transit-eu/")
        && !data.message.startsWith("https://coolmaze.io/f/")
        && !data.message.startsWith(backendHost + "/f/")
        && !data.message.startsWith("https://backend.coolmaze.io/f/")
        && !data.message.startsWith("https://backend.pushto.computer/f/")
        && !data.message.startsWith("https://" + process.env.REACT_APP_backend_domain +"/f/")
        && !data.message.includes(".appspot.com/f/")
        && !data.message.includes(":8080/f/") ){
            console.error("Unexpected precast message:", data.message);
            // Notify the backend, but do not provide the cleartext messages.
            errorBackend(app.state.actionID, app.chanKey, `Unexpected precast message`);
            return
    }
    // Fetch encrypted file
    let encryptedResourceUrl = data.message;    // The file contents is encrypted, not the URL
    let prefetchUrl = backendHost + "/prefetch";
    let xhr = new XMLHttpRequest();
    xhr.open('POST', prefetchUrl);   // POST request enjoys body parameter
    xhr.responseType = "arraybuffer";
    let tip = performance.now();
    xhr.onload = function() {
        let top = performance.now();
        let duration = Math.round(top -tip);
        let arrayBuffer = xhr.response;

        let emptyResponse = !arrayBuffer || arrayBuffer.byteLength === 0 || xhr.status === 204;
        if (emptyResponse) {
            // When prefetch times out: code 204 + empty body
            console.debug(`prefetch ${data.i} returned empty body (code ${xhr.status}, byteLength ${arrayBuffer.byteLength})`);
            using(`prefetch/${data.i}/empty/${xhr.status}`);
            warningBackend(app.state.actionID, app.chanKey, `Prefetch ${data.i} failed in ${duration} ms: empty response (status ${xhr.status})`);
            let cb = preDownloadLocalCache[encryptedResourceUrl];
            if( typeof cb === 'function' ) {
                // We still want to call the callback, even with empty data!
                // This may happen in the (unlikely) event where the client receives the CAST (backend has the resource) *before* the server
                // has time out on PREFETCH because the server still didn't have the resource. Maybe if the 204 takes longer than expected through
                // the network.
                console.debug(`prefetch ${data.i} empty body: run the callback`);
                cb();
            } else {
                console.debug(`prefetch ${data.i} empty body: no callback to be run`);
            }
            delete preDownloadLocalCache[encryptedResourceUrl];
            return;
        }

        console.debug(`Prefetched encrypted resource ${data.i || 0} in ${duration}ms`);
        if( data.i=="0" && data.n=="1" ) {
            // Single precast
            app.prefetchDuration = duration;
        } else {
            // Multiple precast: #531
            app.setState(prevState => {
                let index = parseInt(data.i,10);
                let m = prevState.preDownloadedTtpf;
                if(m[index])
                    console.warn(`preDownloadedTtpf[${index}] was ${m[index]}, is now ${duration} ??`);
                m[index] = duration;
                return {
                    preDownloadedTtpf: m
                }
            });
        }

        if( typeof preDownloadLocalCache[encryptedResourceUrl] === 'function' ) {
            // issues/526
            // prevent downloading the same resource twice concurrently (prefetch, fetch)
            // When the prefetch completes, we have already received the cast message?
            // Then call the provided callback.
            console.debug(`prefetch ${data.i} unlocking cast`);
            let cb = preDownloadLocalCache[encryptedResourceUrl];
            preDownloadLocalCache[encryptedResourceUrl] = "PREFETCHED";
            cb(arrayBuffer);
            return;
        }

        // Put the result in the cache, and wait for the later dispatch for the very same URL
        preDownloadLocalCache[encryptedResourceUrl] = arrayBuffer;
    };
    xhr.onerror = function() {
        using(`prefetch/${data.i}/failed/${xhr.status}`);
        console.warn(`Failed to prefetch resource ${data.i} :(`);
        // A failed prefetch is not fatal: warning.
        warningBackend(app.state.actionID, app.chanKey, `Prefetch ${data.i} failed`);
        // Run the callback, to give a chance to a fallback
        if( typeof preDownloadLocalCache[encryptedResourceUrl] === 'function' ) {
            let cb = preDownloadLocalCache[encryptedResourceUrl];
            delete preDownloadLocalCache[encryptedResourceUrl];
            cb();
        }
    };
    preDownloadLocalCache[encryptedResourceUrl] = "PREFETCHING";
    console.debug(`Prefetch ${data.i}: ${encryptedResourceUrl}`);
    xhr.send(`resourceurl=${encryptedResourceUrl}`);
}

export const preDownload = preDownloadResource;
export const preDownloaded = preDownloadLocalCache;
// TODO export const clearPreDownloaded ?