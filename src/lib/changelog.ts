// Release notes shown in the "What's new" window. Add a new entry at the TOP for every release,
// using the same version as package.json / tauri.conf.json.
export interface Release {
  version: string;
  date: string; // YYYY-MM-DD
  added?: string[];
  changed?: string[];
  fixed?: string[];
}

export const SIGNATURE = "Regards, [SE/DEV] Vince";

export const CHANGELOG: Release[] = [
  {
    version: "0.1.14",
    date: "2026-11-27",
    fixed: [
      "Live connection no longer retries every second when the server is unavailable",
    ],
  },
  {
    version: "0.1.13",
    date: "2026-11-27",
    changed: [
      "Much lighter on the server: background refreshes are slower and pause while the window is hidden",
      "The app now backs off instead of retrying constantly when the server is unavailable",
    ],
  },
  {
    version: "0.1.12",
    date: "2026-11-18",
    changed: [
      "Updates install silently in the background after refresh; no need to open the app from the tray",
    ],
  },
  {
    version: "0.1.10",
    date: "2026-11-18",
    fixed: [
      "GIF search now works in the release build",
    ],
  },
  {
    version: "0.1.9",
    date: "2026-11-18",
    added: [
      "Full conversation threads showing both sent and received messages",
      "Quick 'Reply' button added next to the 'Acknowledge' button on shout popup window",
      "Interactive group member panel (click the header to view online/offline members)",
      "Photo support: You can now send photos in conversations",
      "Group customization: Set group profile pictures",
      "Complete emoji selection menu",
    ],
    changed: [
      "Overhauled update/refresh button auto-update logic",
      "Streamlined read receipts: Removed 'acknowledged' chat bubbles in favor of double-checkmarks",
      "Shout popup message font size adjustment",
      "Improved Emoji/GIF panel legibility and added in and out animations",
      "Implemented rate-limiting/spam prevention for Quick Shouts",
      "Added 100 max character limits across text inputs",
    ],
    fixed: [
      "GIFs displaying as raw text links to receivers instead of animating",
      "GIF sizing and scaling issues in chat",
    ],
  },
  {
    version: "0.1.8",
    date: "2026-11-13",
    changed: ["Refreshed views and smoother UI/UX"],
    fixed: ["Receiver improvements and general reliability fixes"],
  },
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