// Release notes shown in the "What's new" window. Add a new entry at the TOP for every release,
// using the same version as package.json / tauri.conf.json.
export interface Release {
  version: string;
  date: string; // YYYY-MM-DD
  added?: string[];
  changed?: string[];
  fixed?: string[];
}

export const SIGNATURE = "Regards, vince@dev";

export const CHANGELOG: Release[] = [
  {
    version: "0.1.7",
    date: "2026-11-13",
    added: [
      "Emoji and GIF's",
      "Everyone can send a shout now. Group shouts are still admin-only",
      "You'll stay signed in until you choose to sign out",
      "Your shouts now re-shouts itself every 5 seconds unless acknowleged",
      "This What's new window, so you always know what changed",
    ],
    changed: ["A fresher, smoother look and feel throughout the app"],
    fixed: ["Squashed a bunch of bugs to make everything run more reliably"],
  },
];

const SEEN_KEY = "oas-changelog-seen"; // deliberately outside the cache prefix so sign-out keeps it

export function hasUnseenRelease(version: string): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) !== version;
  } catch {
    return false;
  }
}

export function markReleaseSeen(version: string) {
  try {
    localStorage.setItem(SEEN_KEY, version);
  } catch {
    /* storage unavailable: the window may show again next launch */
  }
}
