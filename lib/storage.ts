import AsyncStorage from "@react-native-async-storage/async-storage";

// Keys
const WATCHLIST_KEY = "__cineflix:watchlist";
const PROGRESS_KEY = "__cineflix:progress";

export type WatchlistItem = {
  id: number; // tmdb id
  type: "movie" | "tv";
  title: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  addedAt: number; // epoch ms
};

export type ProgressMovie = {
  kind: "movie";
  id: number; // tmdb movie id
  title?: string;
  poster_path?: string | null;
  position: number; // seconds
  duration: number; // seconds
  updatedAt: number; // epoch ms
};

export type ProgressEpisode = {
  kind: "tv";
  showId: number; // tmdb tv id
  showName?: string;
  poster_path?: string | null;
  season: number;
  episode: number;
  position: number; // seconds
  duration: number; // seconds
  updatedAt: number; // epoch ms
};

export type ProgressItem = ProgressMovie | ProgressEpisode;

async function readJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

async function writeJson<T>(key: string, value: T): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore
  }
}

// Watchlist APIs
export async function getWatchlist(): Promise<WatchlistItem[]> {
  return readJson(WATCHLIST_KEY, [] as WatchlistItem[]);
}

export async function isSaved(
  id: number,
  type: "movie" | "tv"
): Promise<boolean> {
  const list = await getWatchlist();
  return list.some((x) => x.id === id && x.type === type);
}

export async function toggleSave(item: WatchlistItem): Promise<boolean> {
  const list = await getWatchlist();
  const idx = list.findIndex((x) => x.id === item.id && x.type === item.type);
  if (idx >= 0) {
    list.splice(idx, 1);
    await writeJson(WATCHLIST_KEY, list);
    return false; // now removed
  }
  list.unshift({ ...item, addedAt: Date.now() });
  await writeJson(WATCHLIST_KEY, list);
  return true; // now saved
}

export async function removeFromWatchlist(id: number, type: "movie" | "tv") {
  const list = await getWatchlist();
  await writeJson(
    WATCHLIST_KEY,
    list.filter((x) => !(x.id === id && x.type === type))
  );
}

// Progress APIs
export async function getProgress(): Promise<ProgressItem[]> {
  return readJson(PROGRESS_KEY, [] as ProgressItem[]);
}

export async function upsertMovieProgress(
  input: Omit<ProgressMovie, "kind" | "updatedAt">
) {
  const list = await getProgress();
  const now = Date.now();
  const idx = list.findIndex((x) => x.kind === "movie" && x.id === input.id);
  const existing = idx >= 0 ? (list[idx] as ProgressMovie) : undefined;
  // Guard: avoid overwriting meaningful progress with near-zero position before load completes
  if (existing && input.position < 2 && existing.position > 5) {
    return; // keep previous progress
  }
  const row: ProgressMovie = {
    kind: "movie",
    id: input.id,
    title: input.title ?? existing?.title,
    poster_path: input.poster_path ?? existing?.poster_path,
    position: input.position,
    duration:
      input.duration && input.duration > 1
        ? input.duration
        : (existing?.duration ?? input.duration),
    updatedAt: now,
  };
  if (idx >= 0) list[idx] = row;
  else list.unshift(row);
  await writeJson(PROGRESS_KEY, list);
}

export async function resetMovieProgress(id: number) {
  const list = await getProgress();
  const idx = list.findIndex((x) => x.kind === "movie" && x.id === id);
  if (idx >= 0) {
    list.splice(idx, 1);
    await writeJson(PROGRESS_KEY, list);
  }
}

export async function upsertEpisodeProgress(
  input: Omit<ProgressEpisode, "kind" | "updatedAt">
) {
  const list = await getProgress();
  const now = Date.now();
  const idx = list.findIndex(
    (x) =>
      x.kind === "tv" &&
      x.showId === input.showId &&
      x.season === input.season &&
      x.episode === input.episode
  );
  const existing = idx >= 0 ? (list[idx] as ProgressEpisode) : undefined;
  if (existing && input.position < 2 && existing.position > 5) {
    return; // keep previous episode progress
  }
  const row: ProgressEpisode = {
    kind: "tv",
    showId: input.showId,
    showName: input.showName ?? existing?.showName,
    poster_path: input.poster_path ?? existing?.poster_path,
    season: input.season,
    episode: input.episode,
    position: input.position,
    duration:
      input.duration && input.duration > 1
        ? input.duration
        : (existing?.duration ?? input.duration),
    updatedAt: now,
  };
  if (idx >= 0) list[idx] = row;
  else list.unshift(row);
  await writeJson(PROGRESS_KEY, list);
}

export async function clearEpisodeProgress(showId: number) {
  const list = await getProgress();
  await writeJson(
    PROGRESS_KEY,
    list.filter((x) => !(x.kind === "tv" && x.showId === showId))
  );
}

export type ContinueItem =
  | {
      type: "movie";
      id: number;
      title?: string;
      poster_path?: string | null;
      position: number;
      duration: number;
      updatedAt: number;
    }
  | {
      type: "tv";
      showId: number;
      showName?: string;
      poster_path?: string | null;
      season: number;
      episode: number;
      position: number;
      duration: number;
      updatedAt: number;
    };

// Returns latest progress per movie and per show (TV deduplicated by last updated episode)
export async function getContinueWatching(): Promise<ContinueItem[]> {
  const list = await getProgress();
  const movies: Record<number, ProgressMovie> = {};
  const shows: Record<number, ProgressEpisode> = {};
  for (const item of list) {
    if (item.kind === "movie") {
      const prev = movies[item.id];
      if (!prev || item.updatedAt > prev.updatedAt) movies[item.id] = item;
    } else {
      const prev = shows[item.showId];
      if (!prev || item.updatedAt > prev.updatedAt) shows[item.showId] = item;
    }
  }
  const out: ContinueItem[] = [
    ...Object.values(movies).map((m) => ({
      type: "movie" as const,
      id: m.id,
      title: m.title,
      poster_path: m.poster_path,
      position: m.position,
      duration: m.duration,
      updatedAt: m.updatedAt,
    })),
    ...Object.values(shows).map((e) => ({
      type: "tv" as const,
      showId: e.showId,
      showName: e.showName,
      poster_path: e.poster_path,
      season: e.season,
      episode: e.episode,
      position: e.position,
      duration: e.duration,
      updatedAt: e.updatedAt,
    })),
  ];
  return out.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getMovieProgress(
  id: number
): Promise<ProgressMovie | undefined> {
  const list = await getProgress();
  return list.find(
    (x): x is ProgressMovie => x.kind === "movie" && x.id === id
  );
}

export async function getLastEpisodeForShow(
  showId: number
): Promise<ProgressEpisode | undefined> {
  const list = await getProgress();
  const eps = list.filter(
    (x): x is ProgressEpisode => x.kind === "tv" && x.showId === showId
  );
  if (!eps.length) return undefined;
  return eps.sort((a, b) => b.updatedAt - a.updatedAt)[0];
}

export function formatTimestampLabel(position: number): string {
  const s = Math.floor(position % 60)
    .toString()
    .padStart(2, "0");
  const m = Math.floor((position / 60) % 60)
    .toString()
    .padStart(2, "0");
  const h = Math.floor(position / 3600);
  return h > 0 ? `${h}:${m}:${s}` : `${m}:${s}`;
}
