export function extractYoutubeVideoId(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname === "youtu.be") {
      return u.pathname.slice(1) || null;
    }
    if (u.searchParams.has("v")) {
      return u.searchParams.get("v");
    }
    const shortsMatch = u.pathname.match(/\/shorts\/([^/]+)/);
    if (shortsMatch) return shortsMatch[1];
    return null;
  } catch {
    return null;
  }
}
