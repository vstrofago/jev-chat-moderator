import type { DesktopSettings } from "./secrets";

export type SetupStep = "source" | "twitch-app" | "twitch-login" | "jev-key" | "done";

/** What the setup page must ask next, given what is already stored. */
export function nextStep(s: DesktopSettings): SetupStep {
  if (s.source === "observe") {
    if (!s.observeChannel) return "source";
  } else if (s.source === "twitch") {
    if (!s.twitchClientId) return "twitch-app";
    if (!s.twitchTokens) return "twitch-login";
  } else return "source";
  return s.jevKey ? "done" : "jev-key";
}
