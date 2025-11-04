import AsyncStorage from "@react-native-async-storage/async-storage";

export type MediaType = "movie" | "tv";

export type ProgressRecord = {
  position: number; // seconds
  duration?: number; // seconds (optional)
  updatedAt: number; // epoch ms
};

export type WatchlistItem = {
  id: number;
  type: MediaType;
  title?: string;
  poster_path?: string | null;
};

const KEYS = {
  movieProgress: (id: number | string) => `@watchProgress:movie:${id}`,
  tvProgress: (
    showId: string | number,
    s: number | string,
    e: number | string
  ) => `@watchProgress:tv:${showId}:S${s}E${e}`,
  watchlist: "@watchlist",
};

// Parse legacy or JSON progress values
function parseProgress(val: string | null): ProgressRecord | undefined {
  if (!val) return undefined;
  try {
    const obj = JSON.parse(val);
    if (typeof obj?.position === "number") {
      return {
        position: obj.position,
        duration: typeof obj.duration === "number" ? obj.duration : undefined,
        updatedAt:
          typeof obj.updatedAt === "number" ? obj.updatedAt : Date.now(),
      };
    }
  } catch {}
  // legacy plain number seconds
  const sec = parseInt(val, 10);
  if (!Number.isNaN(sec)) {
    return { position: sec, updatedAt: Date.now() };
  }
  return undefined;
}

function serializeProgress(p: ProgressRecord): string {
  return JSON.stringify(p);
}

export async function saveMovieProgress(
  id: number,
  position: number,
  duration?: number
) {
  const key = KEYS.movieProgress(id);
  const rec: ProgressRecord = {
    position: Math.floor(position),
    duration,
    updatedAt: Date.now(),
  };
  try {
    await AsyncStorage.setItem(key, serializeProgress(rec));
  } catch {}
}

export async function getMovieProgress(
  id: number
): Promise<ProgressRecord | undefined> {
  try {
    return parseProgress(await AsyncStorage.getItem(KEYS.movieProgress(id)));
  } catch {
    return undefined;
  }
}

export async function saveTvProgress(
  showId: number,
  season: number,
  episode: number,
  position: number,
  duration?: number
) {
  const key = KEYS.tvProgress(showId, season, episode);
  const rec: ProgressRecord = {
    position: Math.floor(position),
    duration,
    updatedAt: Date.now(),
  };
  try {
    await AsyncStorage.setItem(key, serializeProgress(rec));
  } catch {}
}

export async function getTvProgress(
  showId: number,
  season: number,
  episode: number
): Promise<ProgressRecord | undefined> {
  try {
    return parseProgress(
      await AsyncStorage.getItem(KEYS.tvProgress(showId, season, episode))
    );
  } catch {
    return undefined;
  }
}

export async function listAllProgressKeys(): Promise<string[]> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    return keys.filter((k) => k.startsWith("@watchProgress:"));
  } catch {
    return [];
  }
}

export async function listProgressSummaries(): Promise<
  Array<{
    key: string;
    type: MediaType;
    id: number;
    season?: number;
    episode?: number;
    progress: ProgressRecord;
  }>
> {
  const keys = await listAllProgressKeys();
  if (!keys.length) return [];
  const pairs = await AsyncStorage.multiGet(keys);
  const out: Array<{
    key: string;
    type: MediaType;
    id: number;
    season?: number;
    episode?: number;
    progress: ProgressRecord;
  }> = [];
  for (const [key, val] of pairs) {
    const p = parseProgress(val);
    if (!p) continue;
    if (key.startsWith("@watchProgress:movie:")) {
      const idStr = key.replace("@watchProgress:movie:", "");
      const id = parseInt(idStr, 10);
      if (!Number.isNaN(id)) out.push({ key, type: "movie", id, progress: p });
    } else if (key.startsWith("@watchProgress:tv:")) {
      // format: @watchProgress:tv:<id>:S<season>E<episode>
      const rest = key.replace("@watchProgress:tv:", "");
      const [idPart, se] = rest.split(":S");
      const id = parseInt(idPart, 10);
      const m = se?.match(/(\d+)E(\d+)/);
      const season = m ? parseInt(m[1], 10) : undefined;
      const episode = m ? parseInt(m[2], 10) : undefined;
      if (!Number.isNaN(id) && season && episode)
        out.push({ key, type: "tv", id, season, episode, progress: p });
    }
  }
  // sort by updatedAt desc
  out.sort((a, b) => (b.progress.updatedAt || 0) - (a.progress.updatedAt || 0));
  return out;
}

// Watchlist helpers
export async function getWatchlist(): Promise<WatchlistItem[]> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.watchlist);
    return raw ? (JSON.parse(raw) as WatchlistItem[]) : [];
  } catch {
    return [];
  }
}

export async function addToWatchlist(item: WatchlistItem) {
  const list = await getWatchlist();
  const exists = list.find((x) => x.id === item.id && x.type === item.type);
  if (!exists) {
    list.unshift(item);
    try {
      await AsyncStorage.setItem(KEYS.watchlist, JSON.stringify(list));
    } catch {}
  }
}

export async function removeFromWatchlist(type: MediaType, id: number) {
  const list = await getWatchlist();
  const next = list.filter((x) => !(x.id === id && x.type === type));
  try {
    await AsyncStorage.setItem(KEYS.watchlist, JSON.stringify(next));
  } catch {}
}

export async function isInWatchlist(type: MediaType, id: number) {
  const list = await getWatchlist();
  return list.some((x) => x.type === type && x.id === id);
}

export function fmtTime(s: number): string {
  if (!Number.isFinite(s)) return "00:00";
  const sign = s < 0 ? "-" : "";
  s = Math.max(0, Math.floor(Math.abs(s)));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60)
    .toString()
    .padStart(2, "0");
  const sec = Math.floor(s % 60)
    .toString()
    .padStart(2, "0");
  return h > 0 ? `${sign}${h}:${m}:${sec}` : `${sign}${m}:${sec}`;
}

// Clear helpers
export async function clearMovieProgress(id: number) {
  try {
    await AsyncStorage.removeItem(KEYS.movieProgress(id));
  } catch {}
}

export async function clearTvProgress(
  showId: number,
  season: number,
  episode: number
) {
  try {
    await AsyncStorage.removeItem(KEYS.tvProgress(showId, season, episode));
  } catch {}
}
