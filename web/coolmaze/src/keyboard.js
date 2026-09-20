import { copyImageElementToClipboard } from './item.js';
import { using } from './backend.js';

// Builds the global "keydown" handler that maps keyboard shortcuts to App
// actions. It closes over the App instance, reaching into it for state
// (app.state) and behavior (app.clear(), app.toggleHelp(), ...) exactly as the
// former App._keydownHandler method did.
export function createKeydownHandler(app) {

  function copyDisplayedResource() {
    // Case A: an image is currently displayed fullscreen — copy exactly that
    // image (which, in a multi-share, may not be the first one).
    let lightbox = document.querySelector("img.lightbox");
    if (lightbox) {
      using("copy/lightbox");
      copyImageElementToClipboard(lightbox);
      return;
    }

    // Case B: a text message was received and is displayed — copy the text,
    // just like the "copy-to-clipboard" button does.
    let textCopyButton = document.getElementById("copy-to-clipboard");
    if (textCopyButton) {
      textCopyButton.click();
      return;
    }

    // Case C: a single image resource was received — copy it, reusing the very
    // same logic as the item's "copy-item" button.
    if (!app.state.multi) {
      let copyButton = document.querySelector(".copy-item");
      if (copyButton)
        copyButton.click();
    }
  }

  function rotateDisplayedResource() {
    // Case A: an image is currently displayed fullscreen — rotate exactly that
    // image (which, in a multi-share, may not be the first one). Its rotate
    // button lives next to it, in the same item container.
    let lightbox = document.querySelector("img.lightbox");
    if (lightbox) {
      let rotateButton = lightbox.parentNode.querySelector(".rotate-item");
      if (rotateButton)
        rotateButton.click();
      return;
    }

    // Case B: a single image resource was received — rotate it, reusing the very
    // same logic as the item's "rotate-item" button.
    if (!app.state.multi) {
      let rotateButton = document.querySelector(".rotate-item");
      if (rotateButton)
        rotateButton.click();
    }
  }

  return function handleKeydown(event) {
    //console.log(event);
    if (event.code == "Escape") {
      // Esc can mean "quit" for 2 different things:
      // If a lightbox is displayed fullscreen, just quit the lightbox.
      // Otherwise, reset the app and display a fresh new QR.
      let lightbox = document.querySelector("img.lightbox");
      if (lightbox) {
        lightbox.classList.remove("lightbox", "zoomed");
        lightbox.classList.add("fit-down");
      } else {
        // issues/613: Debounce
        let now = Date.now(); // ms since epoch
        if (app.lastCleared) {
          let elapsed = now - app.lastCleared;
          if (elapsed < 2000) {
            console.debug("Debouncing Esc");
            return;
          }
        }

        // Fresh new QR
        app.clear();
        app.lastCleared = now;
      }
      return;
    }

    if (event.key == "h") {
      // H => Help
      app.toggleHelp();
      return;
    }

    if (event.key == "f") {
      // F => Display received picture in Fullscreen
      let existingLightbox = document.querySelector("img.lightbox");
      if (existingLightbox) {
        // Case 2 fullscreen => zoomed
        // When an element is already displayed in a fullscreen lightbox, just close it
        existingLightbox.classList.remove("lightbox", "zoomed");
        existingLightbox.classList.add("fit-down");
        return;
      }
      let firstItem = document.getElementById("item-0");
      if (!firstItem) {
        console.log("No picture to show fullscreen");
        return;
      }
      let fullscreen = firstItem.classList.add("lightbox");
      if (fullscreen) {
        let suffix = app.state.multi ? "/0" : "";
        using("item/lightbox" + suffix);
      }
    }

    if (event.key == "c" && !event.ctrlKey && !event.metaKey && !event.altKey) {
      // C => Copy the currently displayed resource to the clipboard.
      // (Guard against Ctrl+C / Cmd+C so the native "copy selection" still works.)
      copyDisplayedResource();
      return;
    }

    if (event.key == "r" && !event.ctrlKey && !event.metaKey && !event.altKey) {
      // R => Rotate the currently displayed picture 90° counter-clockwise.
      // (Guard against Ctrl+R / Cmd+R so the native "reload page" still works.)
      rotateDisplayedResource();
      return;
    }

    if (event.key == "ArrowLeft") {
      let existingLightbox = document.querySelector("img.lightbox");
      if (!existingLightbox)
        return;
      let id = existingLightbox.id; // "item-3"
      let i = parseInt(id.slice(5), 10); // -> 3
      if (i <= 0)
        return; // Do not wrap around
      let j = i - 1;
      let newLightbox = document.getElementById(`item-${j}`);
      existingLightbox.classList.remove('lightbox');
      newLightbox.classList.add('lightbox');
      using(`lightbox/previous/${j}`);
    }

    if (event.key == "ArrowRight") {
      let existingLightbox = document.querySelector("img.lightbox");
      if (!existingLightbox)
        return;
      let id = existingLightbox.id; // "item-3"
      let i = parseInt(id.slice(5), 10); // -> 3
      let j = i + 1;
      let newLightbox = document.getElementById(`item-${j}`);
      if (!newLightbox)
        return; // Do not wrap around
      existingLightbox.classList.remove('lightbox');
      newLightbox.classList.add('lightbox');
      using(`lightbox/next/${j}`);
    }

    if (event.key == "d") {
      // D => Download
      if (!app.hasAnyResource()) {
        console.log("No resource to download yet");
        return false;
      }
      if (app.isZippable()) {
        app.openAsDownloadZip();
      } else {
        app.openAsDownload();
      }
    }

    if (event.key == "+") {
      if (app.state.actionID) {
        // Already received something
        // Let's zoom on displayed picture (if exists)
        let existingLightbox = document.querySelector("img.lightbox");
        if (existingLightbox) {
          // Case 2 fullscreen => zoomed
          // When an element is already displayed in a fullscreen lightbox, zoom on it
          existingLightbox.classList.add("lightbox", "zoomed");
          existingLightbox.classList.remove("fit-down");
          using("item/zoomed");
          return;
        }
        // Case 1 item box => fullscreen
        let firstItem = document.getElementById("item-0");
        if (!firstItem) {
          return;
        }
        let fullscreen = firstItem.classList.add("lightbox", "fit-down");
        if (fullscreen) {
          let suffix = app.state.multi ? "/0" : "";
          using("item/lightbox" + suffix);
        }
      } else {
        // Not scanned yet
        // Let's embiggen the QR code
        app.embiggenOnly();
      }
    }

    if (event.key == "-")
      app.ensmallenOnly();

    if (event.key == "?") {
      // ? => Show all keyboard shortcuts
      const { t } = app.props;
      window.alert(
        t("keyboardShortcuts.title") + "\n\n" +
        "    Esc : " + t("keyboardShortcuts.esc") + "\n" +
        "    f : " + t("keyboardShortcuts.fullscreen") + "\n" +
        "    d : " + t("keyboardShortcuts.download") + "\n" +
        "    r : " + t("keyboardShortcuts.rotate") + "\n" +
        "    c : " + t("keyboardShortcuts.copy") + "\n" +
        "    h : " + t("keyboardShortcuts.help") + "\n" +
        "    + : " + t("keyboardShortcuts.bigger") + "\n" +
        "    ? : " + t("keyboardShortcuts.shortcuts")
      );
    }
  };
}
