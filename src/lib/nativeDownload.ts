/**
 * Webviews (WKWebView / WebKitGTK) ignore <a download> on blob: URLs. Every page in the
 * original app downloads via a synthetic anchor click followed by an immediate
 * URL.revokeObjectURL(), so we:
 *   1. remember the Blob behind every object URL (synchronously, at creation time), and
 *   2. intercept those anchor clicks and send the bytes to the native "Save as…" dialog
 *      implemented in Rust (`save_file`).
 */
import { isTauri, saveFile } from "./backend";

const blobs = new Map<string, Blob>();
let queue: Promise<void> = Promise.resolve();

export function installNativeDownloads() {
  if (!isTauri()) return;

  const origCreate = URL.createObjectURL.bind(URL);
  const origRevoke = URL.revokeObjectURL.bind(URL);
  URL.createObjectURL = (obj: Blob | MediaSource) => {
    const url = origCreate(obj);
    if (obj instanceof Blob) blobs.set(url, obj);
    return url;
  };
  URL.revokeObjectURL = (url: string) => {
    origRevoke(url);
    setTimeout(() => blobs.delete(url), 120_000); // keep long enough for a queued save
  };

  const origClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function patchedClick(this: HTMLAnchorElement) {
    if (this.download && this.href.startsWith("data:")) {
      const href = this.href, name = this.download;
      queue = queue.then(async () => {
        try { await saveFile(name, new Uint8Array(await (await fetch(href)).arrayBuffer())); } catch (e) { console.error("save failed", e); }
      });
      return;
    }
    if (this.download && this.href.startsWith("blob:")) {
      const blob = blobs.get(this.href);
      const name = this.download;
      if (blob) {
        queue = queue.then(async () => {
          try {
            await saveFile(name, new Uint8Array(await blob.arrayBuffer()));
          } catch (e) {
            console.error("save failed", e);
          }
        });
        return;
      }
    }
    return origClick.call(this);
  };
}
