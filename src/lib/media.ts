// GIFs are sent as plain messages whose whole text is an https image URL, so no schema change
// is needed. Anything else is shown as text.
const GIF_RE = /^https:\/\/\S+$/i;
const GIF_HOSTS = /(^|\.)(giphy\.com|tenor\.com|tenor\.googleapis\.com)$/i;

export function gifUrl(text: string): string | null {
  const t = text.trim();
  if (!GIF_RE.test(t)) return null;
  try {
    const u = new URL(t);
    if (/\.(gif|webp)$/i.test(u.pathname) || GIF_HOSTS.test(u.hostname)) return t;
  } catch { /* not a url */ }
  return null;
}

export const GIPHY_KEY = import.meta.env.VITE_GIPHY_KEY as string | undefined;

export interface Gif { id: string; url: string; preview: string }

export async function searchGifs(q: string): Promise<Gif[]> {
  if (!GIPHY_KEY) return [];
  const base = "https://api.giphy.com/v1/gifs";
  const params = `api_key=${GIPHY_KEY}&limit=24&rating=pg`;
  const res = await fetch(q.trim() ? `${base}/search?${params}&q=${encodeURIComponent(q)}` : `${base}/trending?${params}`);
  if (!res.ok) throw new Error("GIF search failed");
  const json = await res.json();
  return json.data.map((g: any) => ({
    id: g.id,
    url: g.images.downsized.url,
    preview: g.images.fixed_width_small.url,
  }));
}

export const EMOJIS = ("😀 😃 😄 😁 😆 😅 😂 🤣 😊 😇 🙂 😉 😍 🥰 😘 😋 😎 🤩 🥳 😏 😒 😞 😔 😢 😭 😤 😡 🤯 😱 😴 🤔 🤗 🙄 😬 🤝 👍 👎 👏 🙌 🙏 💪 👋 👌 ✌️ 🤞 👀 ❤️ 💙 💚 💛 🧡 💜 🔥 ✨ ⭐ 🎉 🎂 🍕 ☕ 🍻 ✅ ❌ ⚠️ 🚨 📢 📞 💻 📅 ⏰ 🚀 💯").split(" ");
