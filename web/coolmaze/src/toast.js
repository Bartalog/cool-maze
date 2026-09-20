import i18n from './i18n';

let hideTimeout;

// Minimalistic, self-dismissing "toaster" feedback.
// Reuses a single DOM node so repeated calls don't stack up.
// The toast fades in, stays for 3 seconds, then fades out.
export function showToast(message) {
  let toast = document.getElementById('toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = message;

  // Retrigger the fade-in even if a toast is already on screen.
  toast.classList.remove('show');
  void toast.offsetWidth; // force reflow so the CSS transition replays
  toast.classList.add('show');

  window.clearTimeout(hideTimeout);
  hideTimeout = window.setTimeout(function () {
    toast.classList.remove('show');
  }, 3000);
}

// Convenience for the message shared by every copy-to-clipboard path.
export function showCopiedToast() {
  showToast(i18n.t('toast.copiedToClipboard'));
}
