// The setup page's only way to reach the main process. Sandboxed preloads must be CommonJS.
// The dashboard (served over http) gets nothing: it talks to the local host like a browser.
import { contextBridge, ipcRenderer } from "electron";

if (location.protocol === "vigia:") {
  const call =
    (channel: string) =>
    (...args: unknown[]) =>
      ipcRenderer.invoke(`setup:${channel}`, ...args);

  contextBridge.exposeInMainWorld("vigiaDesktop", {
    autoOpens: true,
    state: call("state"),
    chooseSource: call("chooseSource"),
    saveClientId: call("saveClientId"),
    startTwitchLogin: call("startTwitchLogin"),
    onTwitchLogin(listener: (r: unknown) => void) {
      ipcRenderer.removeAllListeners("setup:twitchLogin");
      ipcRenderer.on("setup:twitchLogin", (_e, r) => listener(r));
    },
    saveJevKey: call("saveJevKey"),
    back: call("back"),
    finish: call("finish"),
    openExternal: call("openExternal"),
  });
}
