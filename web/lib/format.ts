export function runtime(seconds: number) {
  if (!seconds) return "";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${Math.max(minutes, 1)} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

export function clock(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
  const s = Math.floor(seconds % 60).toString().padStart(2, "0");
  const m = Math.floor((seconds / 60) % 60);
  const h = Math.floor(seconds / 3600);
  return h ? `${h}:${m.toString().padStart(2, "0")}:${s}` : `${m}:${s}`;
}

export function quality(height: number) {
  if (!height) return "";
  if (height >= 2160) return "4K";
  if (height >= 1080) return "1080p";
  if (height >= 720) return "720p";
  return `${height}p`;
}

export function bytes(size: number) {
  if (!size) return "";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let index = 0;
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index++;
  }
  return `${size.toFixed(size >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
}

export function ago(timestamp: number) {
  if (!timestamp) return "";
  const days = (Date.now() / 1000 - timestamp) / 86400;
  if (days < 1) return "Today";
  if (days < 2) return "Yesterday";
  if (days < 30) return `${Math.floor(days)} days ago`;
  return new Date(timestamp * 1000).toLocaleDateString(undefined, { month: "short", year: "numeric" });
}

export function left(card: { duration: number; progress?: number }) {
  if (!card.progress || !card.duration) return "";
  return `${runtime(card.duration * (1 - card.progress))} left`;
}

export function plural(count: number, word: string) {
  return `${count.toLocaleString()} ${word}${count === 1 ? "" : "s"}`;
}

export const SORT_LABELS: Record<string, string> = {
  newest: "Newest first",
  oldest: "Oldest first",
  title: "Title A to Z",
  title_desc: "Title Z to A",
  longest: "Longest",
  shortest: "Shortest",
  largest: "Largest file",
  smallest: "Smallest file",
  random: "Shuffled",
  saved: "Recently saved",
};
