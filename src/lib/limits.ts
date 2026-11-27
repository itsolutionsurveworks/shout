// Longest shout a user can compose: custom messages, quick shouts and replies.
export const SHOUT_MAX = 100;

// Messages containing a link may be longer, up to the database limit (500), so URLs can be pasted whole.
export const LINK_MAX = 500;
const LINK_RE = /(https?:\/\/|www\.)\S/i;
export const maxFor = (text: string) => (LINK_RE.test(text) ? LINK_MAX : SHOUT_MAX);
// Cut text to its limit (used instead of an input maxlength, which would also truncate pasted links).
export const clampShout = (text: string) => text.slice(0, maxFor(text));
