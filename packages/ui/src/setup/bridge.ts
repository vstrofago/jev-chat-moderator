/** What the desktop app's preload exposes to the setup page (see apps/desktop/src/preload.cts). */
export type SetupStep = "source" | "twitch-app" | "twitch-login" | "jev-key" | "done";

export interface SetupState {
  step: SetupStep;
  source?: "twitch" | "observe";
  observeChannel?: string;
  twitchClientId?: string;
  /** The OS has no keychain: secrets are stored without encryption. */
  weak: boolean;
}

export interface DesktopBridge {
  state(): Promise<SetupState>;
  chooseSource(source: "twitch" | "observe", channel?: string): Promise<SetupState>;
  saveClientId(clientId: string): Promise<SetupState>;
  /** Starts the device login; the main process opens the browser. */
  startTwitchLogin(): Promise<{ uri: string; code: string; minutes: number }>;
  onTwitchLogin(listener: (r: { ok: boolean; login?: string; error?: string }) => void): void;
  saveJevKey(key: string): Promise<{ ok: boolean; error?: string; state?: SetupState }>;
  back(): Promise<SetupState>;
  finish(): Promise<void>;
  openExternal(url: string): Promise<void>;
}

declare global {
  interface Window {
    vigiaDesktop: DesktopBridge;
  }
}

export const desktop = () => window.vigiaDesktop;
