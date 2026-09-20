import { base64toBlob } from './util.js';
import { using } from './backend.js';
import { MakeZip, MakeZipFromE2EE } from './zip.js';
import { SaveToDirectory } from './fs-writer.js';

// Builds the "download / export" actions for received resources:
// saving the single resource, and saving multiple resources (via the
// File System Access API, or a ZIP fallback). It closes over the App instance,
// reaching into it for state (app.state) and for app.isSample(), exactly as the
// former App methods did.
//
// The returned object is Object.assign()ed back onto the App instance, so every
// existing call site keeps working: this.openAsDownload() from the class,
// app.isZippable() from the keyboard handler, and the props passed to TopBar /
// MainZone.
//
// (There used to be an openInNewTab action too, but opening a resource URL is
// obsolete under E2EE — the URL only holds ciphertext. See issue #615.)
export function createDownloadActions(app) {

  function downloadFile(url, filename) {
    fetch(url)
      .then(response => response.blob())
      .then(blob => {
        const blobUrl = window.URL.createObjectURL(blob);

        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        // Clean up the blob object
        window.URL.revokeObjectURL(blobUrl);
      })
      .catch(err => console.error('Download failed:', err));
  }

  function openAsDownload() {
    if (app.isSample(app.state.resourceUrl)) {
      using("download/single/sample");
      // Download the file at URL app.state.resourceUrl
      // (which may be resolved as already displayed and available in the browser)
      downloadFile(app.state.resourceUrl, "sample.jpg");
      return;
    }

    if (app.state.resourceUrl) {
      // This path should not be taken anymore.
      // Either the single resource is encrypted in resourceData_b64 (see below),
      // or the user is sharing the sample picture (see above).
      using("download/single/unexpected/resourceUrl");
      // From https://stackoverflow.com/a/37521282
      let link = document.createElement('a');
      link.setAttribute('href', app.state.resourceUrl);
      link.setAttribute('download', '');

      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      return;
    }

    using("download/single");

    if (app.state.resourceData_b64) {
      let type = app.state.resourceType;
      let data = app.state.resourceData_b64;
      let filename = app.state.resourceFilename;
      console.debug("Download for type " + type + ", filename " + filename);
      let blob = base64toBlob(data, type);
      let objURL = URL.createObjectURL(blob);

      let dummy = document.createElement('a');
      dummy.setAttribute('href', objURL);
      dummy.setAttribute('download', filename);
      dummy.style.display = 'none';
      document.body.appendChild(dummy);
      dummy.click();
      document.body.removeChild(dummy);
      return;
    }

    console.warn("Oops, could not prepare single resource or download")
  }

  function isZippable() {
    // The [Dowload all as ZIP] button is primarily intended to download
    // all shared resources at once.
    // However, it is also useful in the case of a partial download
    // (e.g. if some uploads succeeded and other uploads have failed).
    // Thus, in a multi-upload workflow we should show the button as soon as we
    // have at least 1 available resource.
    if (!app.state.multi)
      return false;
    var hasResourceFromMulti = false;
    app.state.multiItems.forEach(function (item) {
      if (item.resourceUrl)
        hasResourceFromMulti = true;
    });
    return hasResourceFromMulti;
  }

  async function openAsDownloadZip() {
    if (!app.state.multiItems || app.state.multiItems.length === 0) {
      console.warn("No resources to generate a ZIP...");
      return;
    }

    if ('showDirectoryPicker' in window) {
      try {
        await SaveToDirectory(app.state.multiItems);
        return;
      } catch (err) {
        console.warn("File System Access API failed or cancelled, falling back to ZIP if applicable, or just stopping.", err);
        // If user cancelled, we stop.
        if (err && err.name === 'AbortError') return;
        // If real error, we might want to fallback?
        // For now let's fallback to ZIP only if it wasn't a cancellation.
      }
    }

    if (app.state.multiItems[0].resourceData_b64) {
      using(`download/zip/${app.state.multiItems.length}`);
      // E2EE: make zip from in-memory decrypted data
      MakeZipFromE2EE(app.state.multiItems, setZipProgress);
      return;
      // TODO what if we have some files... but not the 0th?
    }

    // Without E2EE: data is available at distant URLs.
    // For multiple resources, create a ZIP file
    var urls = [];
    app.state.multiItems.forEach(function (item) {
      urls.push(item.resourceUrl);
    });
    MakeZip(urls, setZipProgress);
  }

  function setZipProgress(ratio) {
    app.setState(prevState => ({
      zipProgressRatio: ratio
    }));
  }

  return {
    downloadFile,
    openAsDownload,
    isZippable,
    openAsDownloadZip,
    setZipProgress,
  };
}
