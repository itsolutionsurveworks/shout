// GIFs are sent as plain messages whose whole text is an https image URL, so no schema change
// is needed. Anything else is shown as text.
const GIF_RE = /^https:\/\/\S+$/i;
const GIF_HOSTS = /(^|\.)(giphy\.com|tenor\.com|tenor\.googleapis\.com)$/i;

// Photos are sent as `<url>#<w>x<h>`; the size lets the bubble reserve the right space before the image loads.
export function imageSize(text: string): { w: number; h: number } | null {
  const m = /#(\d{1,5})x(\d{1,5})$/.exec(text.trim());
  return m && +m[1] > 0 && +m[2] > 0 ? { w: +m[1], h: +m[2] } : null;
}

// Box that fits w×h inside `maxH` px tall and the available width, keeping the aspect ratio.
export function photoBox(w: number, h: number, maxH = 224): Record<string, string> {
  return { aspectRatio: `${w} / ${h}`, width: `${Math.round(Math.min(w, (maxH * w) / h))}px`, maxWidth: "100%", minWidth: "96px" };
}

export function gifUrl(text: string): string | null {
  const t = text.trim();
  if (!GIF_RE.test(t)) return null;
  try {
    const u = new URL(t);
    if (/\.(gif|webp)$/i.test(u.pathname) || GIF_HOSTS.test(u.hostname)) return t;
  } catch { /* not a url */ }
  return null;
}

// Centre-crop to a square and scale to `px`, encoded as WebP.
export async function toSquareWebp(file: File, px = 512): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = px;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not process the image.");
  ctx.imageSmoothingQuality = "high";
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, px, px);
  ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, px, px);
  bitmap.close();
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/webp", 0.92));
  if (!blob) throw new Error("Could not process the image.");
  return blob;
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
