const SESSION_MARKER_KEY = "sobra:business-session-change:v1";
const SESSION_CHANNEL = "sobra-business-session-v1";
const LOCAL_SESSION_EVENT = "sobra-business-session-changed";
const tabIds = new WeakMap<Window, string>();

function tabId(browser: Window): string {
  let id = tabIds.get(browser);
  if (!id) {
    id = `${Date.now()}:${Math.random().toString(36).slice(2)}`;
    tabIds.set(browser, id);
  }
  return id;
}

function currentBrowser(): Window | undefined {
  return typeof window === "undefined" ? undefined : window;
}

function readMarker(browser: Window): string | null {
  try {
    return browser.localStorage.getItem(SESSION_MARKER_KEY);
  } catch {
    return null;
  }
}

function createChannel(browser: Window): BroadcastChannel | null {
  try {
    const Channel = (browser as Window & {
      BroadcastChannel?: typeof BroadcastChannel;
    }).BroadcastChannel;
    return Channel ? new Channel(SESSION_CHANNEL) : null;
  } catch {
    return null;
  }
}

/** Only a generic change signal crosses tabs; never a user, token or payload. */
export function notifyBusinessSessionChanged(browser = currentBrowser()): void {
  if (!browser) return;
  try {
    browser.localStorage.setItem(
      SESSION_MARKER_KEY,
      `${Date.now()}:${Math.random().toString(36).slice(2)}`,
    );
  } catch {
    // BroadcastChannel still works when storage is unavailable in this context.
  }
  browser.dispatchEvent(new Event(LOCAL_SESSION_EVENT));
  const channel = createChannel(browser);
  if (channel) {
    try {
      channel.postMessage({ type: "session-changed", version: 1, source: tabId(browser) });
    } catch {
      // A blocked channel must not turn an already confirmed login into failure.
    } finally {
      channel.close();
    }
  }
}

/** Reload discards both query caches and component-local drafts from the old account. */
export function installBusinessSessionEvents(browser = currentBrowser()): () => void {
  if (!browser) return () => undefined;
  let marker = readMarker(browser);
  let reloading = false;
  const reload = () => {
    if (reloading) return;
    reloading = true;
    browser.location.reload();
  };
  const onStorage = (event: StorageEvent) => {
    if (event.key === SESSION_MARKER_KEY && event.newValue !== marker) reload();
  };
  const onFocus = () => {
    if (readMarker(browser) !== marker) reload();
  };
  const onLocalChange = () => {
    // The initiating tab already clears its own cache through login/logout.
    marker = readMarker(browser);
  };
  const channel = createChannel(browser);
  if (channel) {
    channel.onmessage = (event: MessageEvent<unknown>) => {
      const message = event.data;
      if (
        message !== null && typeof message === "object" &&
        "type" in message && message.type === "session-changed" &&
        "version" in message && message.version === 1 &&
        "source" in message && typeof message.source === "string" &&
        message.source !== tabId(browser)
      ) reload();
    };
  }
  browser.addEventListener("storage", onStorage);
  browser.addEventListener("focus", onFocus);
  browser.addEventListener("pageshow", onFocus);
  browser.addEventListener(LOCAL_SESSION_EVENT, onLocalChange);
  return () => {
    browser.removeEventListener("storage", onStorage);
    browser.removeEventListener("focus", onFocus);
    browser.removeEventListener("pageshow", onFocus);
    browser.removeEventListener(LOCAL_SESSION_EVENT, onLocalChange);
    if (channel) {
      channel.onmessage = null;
      channel.close();
    }
  };
}
