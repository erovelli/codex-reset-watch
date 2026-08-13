const enableButton = document.querySelector("#enable");
const statusNode = document.querySelector("#status");
const keyPanel = document.querySelector("#key-panel");
const publicKeyInput = document.querySelector("#public-key");
const pairingPanel = document.querySelector("#pairing");
const pairingCode = document.querySelector("#pairing-code");
const copyButton = document.querySelector("#copy");
const copyStatus = document.querySelector("#copy-status");

function publicKeyFromPage() {
  const fragment = new URLSearchParams(location.hash.slice(1));
  const fromLink = fragment.get("vapid");
  if (fromLink) {
    localStorage.setItem("codex-reset-watch-vapid", fromLink);
    history.replaceState(null, "", `${location.pathname}${location.search}`);
  }
  return fromLink || localStorage.getItem("codex-reset-watch-vapid") || publicKeyInput.value.trim();
}

function base64UrlBytes(value) {
  const padding = "=".repeat((4 - value.length % 4) % 4);
  const raw = atob((value + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, character => character.charCodeAt(0));
}

function encodePairingCode(subscription) {
  const bytes = new TextEncoder().encode(JSON.stringify(subscription.toJSON()));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function standalone() {
  return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
}

function setStatus(message, error = false) {
  statusNode.textContent = message;
  statusNode.classList.toggle("error", error);
}

async function enableNotifications() {
  try {
    enableButton.disabled = true;
    if (!window.isSecureContext) throw new Error("This page must be opened over HTTPS.");
    if (!standalone()) {
      throw new Error("This button works only in the installed Home Screen app. In Safari, tap Share, choose Add to Home Screen, then open the new Reset Watch icon.");
    }
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      throw new Error("This iOS version does not support Home Screen Web Push. iOS or iPadOS 16.4 or newer is required.");
    }
    const key = publicKeyFromPage();
    if (!key) {
      keyPanel.hidden = false;
      throw new Error("Paste the public key shown by the CLI, then tap Enable again.");
    }
    localStorage.setItem("codex-reset-watch-vapid", key);
    setStatus("Registering this device...");
    const registration = await navigator.serviceWorker.register("./sw.js", { scope: "./" });
    await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();
    if (subscription) {
      const existingKey = subscription.options.applicationServerKey;
      const requested = base64UrlBytes(key);
      if (!existingKey || existingKey.byteLength !== requested.byteLength || !requested.every((byte, index) => byte === new Uint8Array(existingKey)[index])) {
        await subscription.unsubscribe();
        subscription = null;
      }
    }
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64UrlBytes(key)
      });
    }
    pairingCode.value = encodePairingCode(subscription);
    pairingPanel.hidden = false;
    setStatus("Device subscription created.");
    pairingPanel.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    const denied = "Notification" in window && Notification.permission === "denied"
      ? " Notifications are blocked in iOS Settings."
      : "";
    setStatus(`${error instanceof Error ? error.message : String(error)}${denied}`, true);
  } finally {
    enableButton.disabled = false;
  }
}

async function copyCode() {
  try {
    await navigator.clipboard.writeText(pairingCode.value);
    copyStatus.textContent = "Copied. Return to the terminal and paste it there.";
  } catch {
    pairingCode.focus();
    pairingCode.select();
    copyStatus.textContent = "The code is selected. Tap Copy, then paste it into the terminal.";
  }
}

if (!publicKeyFromPage()) keyPanel.hidden = false;
setStatus(standalone() ? "Ready to request notification permission." : "Add this page to your Home Screen, then open the installed app.");
enableButton.addEventListener("click", enableNotifications);
copyButton.addEventListener("click", copyCode);
