import { upsertEpisodeProgress, upsertMovieProgress } from "@/lib/storage";
import {
  fetchMovieDetails,
  fetchMovieExternalIds,
  fetchSeasonDetails,
  fetchTVEpisodeExternalIds,
  fetchTVShowDetails,
} from "@/lib/tmdb";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import {
  makeProviders,
  makeStandardFetcher,
  targets,
  type FullScraperEvents,
  type RunOutput,
  type ScrapeMedia,
  type Stream,
} from "@p-stream/providers";
import "@react-native-anywhere/polyfill-base64";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Slider from "@react-native-community/slider";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as ScreenOrientation from "expo-screen-orientation";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StatusBar,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import "react-native-quick-crypto";
import Video, {
  OnLoadData,
  OnProgressData,
  VideoRef,
} from "react-native-video";
import SystemNavigationBar from "react-native-system-navigation-bar";

SystemNavigationBar.navigationHide();

/* -------------------- Types -------------------- */

type MediaType = "movie" | "tv";
type ScrapingStatus =
  | "failure"
  | "pending"
  | "notfound"
  | "success"
  | "waiting";
type ScrapingSegment = {
  name: string;
  id: string;
  embedId?: string;
  status: ScrapingStatus;
  reason?: string;
  error?: any;
  percentage: number;
};
type ScrapingItems = { id: string; children: string[] };

type QualityOption = {
  label: string;
  height?: number;
  url?: string;
  key?: string;
};

type SubtitleTrack = {
  label: string;
  language?: string;
  uri: string;
  type?: "srt" | "vtt";
  source?: string;
};

type SubtitleCue = {
  start: number;
  end: number;
  text: string;
};

type LastUsedMap = Record<string, string>;

const LAST_USED_KEY = "__RN_PLAYER::lastUsedProviderByShow";

/* -------------------- Orientation -------------------- */

function useLandscapeLock() {
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        await ScreenOrientation.lockAsync(
          ScreenOrientation.OrientationLock.LANDSCAPE
        );
      } catch {}
    })();
    return () => {
      (async () => {
        try {
          if (mounted) await ScreenOrientation.unlockAsync();
        } catch {}
      })();
      mounted = false;
    };
  }, []);
}

/* -------------------- Utilities -------------------- */

function parseMasterM3U8(
  input: string,
  baseUrl?: string
): { url: string; height?: number; bandwidth?: number }[] {
  const lines = input.split(/\r?\n/);
  const out: { url: string; height?: number; bandwidth?: number }[] = [];
  let bandwidth: number | undefined;
  let height: number | undefined;
  const resolveUrl = (u: string) => {
    try {
      return new URL(u, baseUrl).toString();
    } catch {
      return u;
    }
  };
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i].trim();
    if (l.startsWith("#EXT-X-STREAM-INF:")) {
      bandwidth = undefined;
      height = undefined;
      const attrs = l
        .slice("#EXT-X-STREAM-INF:".length)
        .split(",")
        .map((s) => s.trim());
      for (const a of attrs) {
        const [k, v] = a.split("=");
        if (k === "BANDWIDTH") bandwidth = Number(v);
        if (k === "RESOLUTION") {
          const [w, h] = (v || "").split("x").map((n) => Number(n));
          if (!isNaN(h)) height = h;
        }
      }
      let j = i + 1;
      while (j < lines.length && lines[j].trim().startsWith("#")) j++;
      if (j < lines.length) {
        out.push({ url: resolveUrl(lines[j].trim()), height, bandwidth });
        i = j;
      }
    }
  }
  return out.sort((a, b) => (b.height ?? 0) - (a.height ?? 0));
}

function formatTime(sec: number): string {
  if (!isFinite(sec)) return "0:00";
  const s = Math.floor(sec % 60)
    .toString()
    .padStart(2, "0");
  const m = Math.floor((sec / 60) % 60)
    .toString()
    .padStart(2, "0");
  const h = Math.floor(sec / 3600);
  return h > 0 ? `${h}:${m}:${s}` : `${m}:${s}`;
}

async function fetchOpenSubtitles(
  imdbId: string,
  season?: number,
  episode?: number
): Promise<SubtitleTrack[]> {
  try {
    const path = `https://rest.opensubtitles.org/search/${season && episode ? `episode-${episode}/` : ""}imdbid-${imdbId.slice(2)}${season && episode ? `/season-${season}` : ""}`;
    const res = await fetch(path, {
      headers: { "X-User-Agent": "VLSub 0.10.2" },
    });
    if (!res.ok) return [];
    const data = await res.json();
    const out: SubtitleTrack[] = [];
    for (const row of data || []) {
      const dl = String(row.SubDownloadLink ?? "")
        .replace(".gz", "")
        .replace("download/", "download/subencoding-utf8/");
      const langCode = String(
        row.ISO639 || row.SubLanguageID || row.LanguageName || ""
      ).toLowerCase();
      if (!dl) continue;
      const ext = String(row.SubFormat || "srt").toLowerCase();
      out.push({
        label: String(row.LanguageName || langCode || "Subtitle"),
        language: langCode || undefined,
        uri: dl,
        type: ext === "vtt" ? "vtt" : "srt",
        source: "opensubs",
      });
    }
    return out;
  } catch {
    return [];
  }
}

async function tryWyzie(
  imdbId?: string,
  tmdbId?: string | number,
  season?: number,
  episode?: number
): Promise<SubtitleTrack[]> {
  try {
    const mod: any = await import("wyzie-lib");
    const params: any = { encoding: "utf-8", source: "all" };
    if (imdbId) params.imdb_id = imdbId;
    if (tmdbId)
      params.tmdb_id =
        typeof tmdbId === "string" ? parseInt(tmdbId, 10) : tmdbId;
    if (season && episode) {
      params.season = season;
      params.episode = episode;
    }
    const list = await mod.searchSubtitles(params);
    return (list || []).map((s: any) => ({
      label: s.display || s.language || "Subtitle",
      language: s.language,
      uri: s.url,
      type: s.format === "vtt" ? "vtt" : "srt",
      source: "wyzie",
    }));
  } catch {
    return [];
  }
}

async function fetchExternalSubtitles(params: {
  imdbId?: string;
  tmdbId?: string | number;
  season?: number;
  episode?: number;
  isShow?: boolean;
}) {
  let imdb = params.imdbId;
  // Try to resolve imdbId from TMDB if not provided
  if (!imdb && params.tmdbId) {
    try {
      if (params.isShow && params.season && params.episode) {
        const ext = await fetchTVEpisodeExternalIds(
          params.tmdbId,
          params.season,
          params.episode
        );
        imdb = (ext as any)?.imdb_id ?? undefined;
      } else {
        const ext = await fetchMovieExternalIds(params.tmdbId);
        imdb = (ext as any)?.imdb_id ?? undefined;
      }
    } catch {}
  }

  const [wyzie, opensubs] = await Promise.allSettled<
    Promise<SubtitleTrack[]>[]
  >([
    tryWyzie(imdb, params.tmdbId, params.season, params.episode),
    imdb
      ? fetchOpenSubtitles(imdb, params.season, params.episode)
      : Promise.resolve([] as SubtitleTrack[]),
  ] as unknown as any);

  const a = wyzie.status === "fulfilled" ? wyzie.value : [];
  const b = opensubs.status === "fulfilled" ? opensubs.value : [];
  const merged = [...a, ...b];
  const seen = new Set<string>();
  const out: SubtitleTrack[] = [];
  for (const c of merged) {
    const key = `${c.uri}|${c.language}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push(c);
    }
  }
  return out;
}

async function getLastUsedMap(): Promise<LastUsedMap> {
  try {
    const raw = await AsyncStorage.getItem(LAST_USED_KEY);
    return raw ? (JSON.parse(raw) as LastUsedMap) : {};
  } catch {
    return {};
  }
}
async function setLastUsedForShow(tmdbId: string, sourceId: string) {
  const map = await getLastUsedMap();
  map[tmdbId] = sourceId;
  try {
    await AsyncStorage.setItem(LAST_USED_KEY, JSON.stringify(map));
  } catch {}
}

/* -------------------- Providers -------------------- */

const providers = makeProviders({
  fetcher: makeStandardFetcher(fetch as any),
  target: targets.NATIVE,
  consistentIpForRequests: true,
});

function buildMediaMeta(
  type: MediaType | undefined,
  tmdbId: string,
  season?: string,
  episode?: string,
  imdbId?: string
) {
  if (!type) return null;
  if (type === "movie") {
    return {
      type: "movie" as const,
      tmdbId,
      title: "",
      releaseYear: undefined,
      imdbId,
    };
  }
  return {
    type: "show" as const,
    tmdbId,
    title: "",
    season: season
      ? { number: Number(season), tmdbId: "", title: "" }
      : undefined,
    episode: episode
      ? { number: Number(episode), tmdbId: "", title: "" }
      : undefined,
    releaseYear: undefined,
    imdbId,
  };
}

async function extractStreamFromOutput(
  output: RunOutput | null
): Promise<Stream | null> {
  if (!output) return null;
  if ((output as any).stream) return (output as any).stream as Stream;
  return null;
}

async function parseQualities(stream: Stream): Promise<QualityOption[]> {
  if (stream.type === "hls") return [{ label: "Auto" }];
  if (stream.type === "file") {
    const entries = Object.keys(stream.qualities ?? {}) as string[];
    if (!entries.length) return [{ label: "Auto" }];
    return entries
      .slice()
      .sort((a, b) => {
        const aa = a === "unknown" ? 0 : Number(a);
        const bb = b === "unknown" ? 0 : Number(b);
        return bb - aa;
      })
      .map((k) => ({ key: k, label: k === "unknown" ? "Auto" : `${k}p` }));
  }
  return [{ label: "Auto" }];
}

/* -------------------- Main Component -------------------- */

export default function SinglePlayer() {
  const { id, type, season, episode, imdbId, startAt } = useLocalSearchParams<{
    id: string;
    type?: MediaType;
    season?: string;
    episode?: string;
    imdbId?: string;
    startAt?: string;
  }>();
  const router = useRouter();
  useLandscapeLock();

  const playerRef = useRef<VideoRef>(null);
  // React Native setTimeout returns a number id
  const controlsTimeoutRef = useRef<number | null>(null);

  const [paused, setPaused] = useState(false);
  const [duration, setDuration] = useState(0);
  const [position, setPosition] = useState(0);
  const [seeking, setSeeking] = useState(false);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  // Resume position across reloads (e.g., subtitle/quality change)
  const resumeAtRef = useRef<number>(0);
  // Keep previously selected subtitle across provider switches
  const prevSubtitleRef = useRef<SubtitleTrack | null>(null);
  // Buffering/loading state for activity indicator
  const [isLoading, setIsLoading] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);

  // Display state
  const [showControls, setShowControls] = useState(true);

  // Stream and derived
  const [stream, setStream] = useState<Stream | null>(null);
  const [currentProviderId, setCurrentProviderId] = useState<string | null>(
    null
  );

  // Captions
  const [captions, setCaptions] = useState<SubtitleTrack[]>([]);
  const [selectedSubtitle, setSelectedSubtitle] =
    useState<SubtitleTrack | null>(null);
  const [externalFetching, setExternalFetching] = useState(false);
  // Custom subtitle overlay state
  const [overlayCues, setOverlayCues] = useState<SubtitleCue[]>([]);
  const [activeSubtitle, setActiveSubtitle] = useState<string>("");

  // Quality
  const [qualities, setQualities] = useState<QualityOption[]>([
    { label: "Auto" },
  ]);
  const [selectedQuality, setSelectedQuality] = useState<QualityOption>({
    label: "Auto",
  });

  // Scrape overlay
  const [sources, setSources] = useState<Record<string, ScrapingSegment>>({});
  const [sourceOrder, setSourceOrder] = useState<ScrapingItems[]>([]);
  const [currentSource, setCurrentSource] = useState<string | undefined>(
    undefined
  );

  // Modals
  const [showSubtitleModal, setShowSubtitleModal] = useState(false);
  const [showProviderModal, setShowProviderModal] = useState(false);
  const [showQualityModal, setShowQualityModal] = useState(false);

  // HLS variants
  const [hlsVariants, setHlsVariants] = useState<
    { url: string; label: string; height?: number }[]
  >([]);
  const [selectedHlsVariantUrl, setSelectedHlsVariantUrl] = useState<
    string | null
  >(null);

  const media = useMemo(
    () =>
      buildMediaMeta(
        type as MediaType | undefined,
        id,
        season,
        episode,
        imdbId
      ),
    [type, id, season, episode, imdbId]
  );

  // Display title (movie title or TV show name). Fallback to id when unavailable.
  const [displayTitle, setDisplayTitle] = useState<string | null>(null);
  const [posterPath, setPosterPath] = useState<string | null>(null);
  const [episodeCount, setEpisodeCount] = useState<number | null>(null);
  useEffect(() => {
    let mounted = true;
    setDisplayTitle(null);
    (async () => {
      try {
        if (!media) return;
        if (media.type === "movie") {
          const details = await fetchMovieDetails(media.tmdbId);
          if (mounted) {
            setDisplayTitle(details?.title ?? String(id));
            setPosterPath(details?.poster_path ?? null);
          }
        } else {
          const details = await fetchTVShowDetails(media.tmdbId);
          if (mounted) {
            setDisplayTitle(details?.name ?? String(id));
            setPosterPath(details?.poster_path ?? null);
          }
          // Fetch season meta for next/prev
          const sNum = media.season?.number;
          if (sNum) {
            try {
              const s = await fetchSeasonDetails(media.tmdbId, sNum);
              if (mounted) setEpisodeCount((s.episodes ?? []).length || null);
            } catch {}
          } else if (mounted) setEpisodeCount(null);
        }
      } catch {
        if (mounted) setDisplayTitle(String(id));
      }
    })();
    return () => {
      mounted = false;
    };
  }, [media, id, type, season, episode, imdbId]);

  // Honor startAt param for resume
  useEffect(() => {
    if (startAt) {
      const t = Math.max(0, Number(startAt) || 0);
      resumeAtRef.current = t;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startAt]);

  /* -------- Controls auto-hide ---------- */

  const kickControls = useCallback(() => {
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    controlsTimeoutRef.current = setTimeout(() => {
      setShowControls(false);
      controlsTimeoutRef.current = null;
    }, 4000);
  }, []);

  useEffect(() => {
    kickControls();
  }, [kickControls, stream]);

  /* -------- Scrape events ---------- */

  const initEvent: NonNullable<FullScraperEvents["init"]> = useCallback(
    (evt) => {
      const map: Record<string, ScrapingSegment> = {};
      evt.sourceIds.forEach((sid) => {
        map[sid] = {
          id: sid,
          name: sid,
          status: "waiting",
          percentage: 0,
        };
      });
      setSources(map);
      setSourceOrder(evt.sourceIds.map((sid) => ({ id: sid, children: [] })));
      setCurrentSource(undefined);
      setShowProviderModal(true);
    },
    []
  );

  const startEvent: NonNullable<FullScraperEvents["start"]> = useCallback(
    (id) => {
      setSources((s) => {
        const prev = { ...s };
        if (currentSource && prev[currentSource]?.status === "pending")
          prev[currentSource].status = "success";
        if (prev[id]) prev[id].status = "pending";
        return prev;
      });
      setCurrentSource(id);
      setCurrentProviderId(id); // track active provider id
    },
    [currentSource]
  );

  const updateEvent: NonNullable<FullScraperEvents["update"]> = useCallback(
    (evt) => {
      setSources((s) => {
        const next = { ...s };
        if (next[evt.id]) {
          next[evt.id].status = evt.status as any;
          next[evt.id].reason = evt.reason;
          next[evt.id].error = evt.error;
          next[evt.id].percentage = evt.percentage;
        }
        return next;
      });
    },
    []
  );

  const discoverEmbedsEvent: NonNullable<FullScraperEvents["discoverEmbeds"]> =
    useCallback((evt) => {
      setSources((s) => {
        const next = { ...s };
        evt.embeds.forEach((e) => {
          next[e.id] = {
            id: e.id,
            embedId: e.embedScraperId,
            name: e.embedScraperId,
            status: "waiting",
            percentage: 0,
          };
        });
        return next;
      });
      setSourceOrder((o) => {
        const copy = o.map((x) => ({ ...x }));
        const parent = copy.find((x) => x.id === evt.sourceId);
        if (parent) parent.children = evt.embeds.map((e) => e.id);
        return copy;
      });
    }, []);

  const resetScrapeUi = useCallback(() => {
    setSources({});
    setSourceOrder([]);
    setCurrentSource(undefined);
  }, []);

  /* -------- Scrape runner ---------- */

  const runScrape = useCallback(
    async (preferredSourceId?: string | null) => {
      if (!media) return;
      resetScrapeUi();
      const lastUsedMap = await getLastUsedMap();
      const sourceOrderPref: string[] | undefined = preferredSourceId
        ? [preferredSourceId]
        : media.type === "show" && lastUsedMap[media.tmdbId]
          ? [lastUsedMap[media.tmdbId]]
          : undefined;

      const events: FullScraperEvents = {
        init: initEvent,
        start: startEvent,
        update: updateEvent,
        discoverEmbeds: discoverEmbedsEvent,
      };

      const output = await providers.runAll({
        media: media as unknown as ScrapeMedia,
        sourceOrder: sourceOrderPref,
        events,
      });

      setShowProviderModal(false);

      const s = await extractStreamFromOutput(output);
      if (!s) {
        setStream(null);
        setPlaybackError("No stream found.");
        return;
      }
      setStream(s);

      if (media.type === "show" && (output as any)?.sourceId) {
        try {
          await setLastUsedForShow(
            media.tmdbId,
            (output as any).sourceId as string
          );
        } catch {}
      }

      const qs = await parseQualities(s);
      setQualities(qs);
      setSelectedQuality(qs[0] ?? { label: "Auto" });

      const baseCaps: SubtitleTrack[] = (s.captions ?? [])
        .filter((c: any) => !!c?.url)
        .map((c: any) => ({
          label: c.language || "Subtitle",
          language: c.language,
          uri: c.url,
          type: c.type === "vtt" ? "vtt" : "srt",
          source: "provider",
        }));
      setCaptions(baseCaps);
      // Try to preserve previously selected subtitle (match by language first)
      if (prevSubtitleRef.current?.language) {
        const match = baseCaps.find(
          (c) =>
            c.language?.toLowerCase() ===
            prevSubtitleRef.current!.language?.toLowerCase()
        );
        if (match) {
          setSelectedSubtitle(match);
        } else {
          setSelectedSubtitle(null);
        }
      } else {
        setSelectedSubtitle(null);
      }

      if (s.type === "hls") {
        try {
          const res = await fetch(s.playlist, { headers: s.headers as any });
          const text = await res.text();
          const parsed = parseMasterM3U8(text, s.playlist).map((v) => ({
            url: v.url,
            height: v.height,
            label: v.height
              ? `${v.height}p`
              : v.bandwidth
                ? `${Math.round(v.bandwidth / 1000)}kbps`
                : "Variant",
          }));
          setHlsVariants(parsed);
        } catch {
          setHlsVariants([]);
        }
      } else {
        setHlsVariants([]);
      }

      // External subs
      setExternalFetching(true);
      try {
        const extra = await fetchExternalSubtitles({
          imdbId: (media as any).imdbId,
          tmdbId: media.tmdbId,
          season: (media as any).season?.number,
          episode: (media as any).episode?.number,
        });
        if (extra.length) {
          const existing = new Set(
            baseCaps.map((c) => `${c.uri}|${c.language}`)
          );
          const merged = [...baseCaps];
          for (const c of extra) {
            const key = `${c.uri}|${c.language}`;
            if (!existing.has(key)) merged.push(c);
          }
          setCaptions(merged);
          // Attempt to reselect previous subtitle again with expanded list
          if (prevSubtitleRef.current?.language) {
            const match = merged.find(
              (c) =>
                c.language?.toLowerCase() ===
                prevSubtitleRef.current!.language?.toLowerCase()
            );
            if (match) setSelectedSubtitle(match);
          }
        }
      } catch {}
      setExternalFetching(false);

      kickControls();
    },
    [
      media,
      initEvent,
      startEvent,
      updateEvent,
      discoverEmbedsEvent,
      resetScrapeUi,
      kickControls,
    ]
  );

  useEffect(() => {
    setStream(null);
    setPlaybackError(null);
    setSelectedSubtitle(null);
    setSelectedHlsVariantUrl(null);
    if (media) runScrape(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, type, season, episode, imdbId]);

  /* -------- Source URL ---------- */

  const sourceUrl = useMemo(() => {
    if (!stream) return null;
    if (stream.type === "hls") {
      if (selectedHlsVariantUrl) return selectedHlsVariantUrl;
      return stream.playlist;
    }
    if (stream.type === "file") {
      const key =
        selectedQuality.key ||
        selectedQuality.label.replace("p", "").replace("Auto", "unknown");
      const file =
        (stream.qualities as any)?.[key] ||
        Object.values(stream.qualities ?? {})[0];
      return (file as any)?.url ?? null;
    }
    return null;
  }, [stream, selectedQuality, selectedHlsVariantUrl]);

  /* -------- Video events ---------- */

  const onLoad = useCallback((data: OnLoadData) => {
    setDuration(data.duration ?? 0);
    setIsLoading(false);
    // Allow progress to persist only after video metadata is available
    canSaveRef.current = true;
    // If we queued a resume position, seek immediately after load
    if (resumeAtRef.current && resumeAtRef.current > 0) {
      const t = resumeAtRef.current;
      resumeAtRef.current = 0;
      // slight delay can help on some Android devices
      setTimeout(() => playerRef.current?.seek(t), 0);
    }
  }, []);

  const onProgress = useCallback(
    (data: OnProgressData) => {
      if (!seeking) setPosition(data.currentTime);
      // Mark safe to save when actual playback time advances
      if (data.currentTime > 1) canSaveRef.current = true;
    },
    [seeking]
  );

  const seekTo = useCallback((time: number) => {
    playerRef.current?.seek(time);
    setPosition(time);
  }, []);

  /* -------- Custom Subtitles (overlay) ---------- */

  function timeToSeconds(t: string) {
    // supports 00:00:00,000 and 00:00:00.000
    const m = t.trim().replace(",", ".").split(":");
    if (m.length < 3) return 0;
    const h = parseInt(m[0] || "0", 10) || 0;
    const min = parseInt(m[1] || "0", 10) || 0;
    const sec = parseFloat(m[2] || "0") || 0;
    return h * 3600 + min * 60 + sec;
  }

  function parseSrt(input: string): SubtitleCue[] {
    const blocks = input.replace(/\r/g, "").split(/\n\n+/);
    const cues: SubtitleCue[] = [];
    for (const b of blocks) {
      const lines = b.split("\n").filter(Boolean);
      if (!lines.length) continue;
      // SRT may start with numeric index
      const timeLine = lines[0].includes("-->") ? lines[0] : lines[1];
      if (!timeLine) continue;
      const m = timeLine.match(/([^\s]+)\s*-->\s*([^\s]+)/);
      if (!m) continue;
      const start = timeToSeconds(m[1]);
      const end = timeToSeconds(m[2]);
      const text = (
        lines.slice(timeLine === lines[0] ? 1 : 2).join("\n") || ""
      ).replace(/<[^>]+>/g, "");
      cues.push({ start, end, text });
    }
    return cues;
  }

  function parseVtt(input: string): SubtitleCue[] {
    const src = input.replace(/\r/g, "");
    const lines = src.split("\n");
    const cues: SubtitleCue[] = [];
    let i = 0;
    if (lines[0] && /^WEBVTT/i.test(lines[0])) i = 1; // skip header
    while (i < lines.length) {
      // skip empty & NOTE blocks
      while (i < lines.length && lines[i].trim() === "") i++;
      if (i >= lines.length) break;
      // optional identifier
      if (lines[i] && !lines[i].includes("-->")) i++;
      if (i >= lines.length) break;
      const tl = lines[i++];
      const m = tl.match(/([^\s]+)\s*-->\s*([^\s]+)/);
      if (!m) continue;
      const start = timeToSeconds(m[1]);
      const end = timeToSeconds(m[2]);
      const textLines: string[] = [];
      while (i < lines.length && lines[i].trim() !== "") {
        textLines.push(lines[i++]);
      }
      const text = textLines.join("\n").replace(/<[^>]+>/g, "");
      cues.push({ start, end, text });
    }
    return cues;
  }

  async function loadOverlaySubtitles(track: SubtitleTrack | null) {
    if (!track?.uri) {
      setOverlayCues([]);
      setActiveSubtitle("");
      return;
    }
    try {
      const res = await fetch(track.uri);
      const text = await res.text();
      const isVtt =
        (track.type || "").toLowerCase() === "vtt" || /^WEBVTT/i.test(text);
      const cues = isVtt ? parseVtt(text) : parseSrt(text);
      setOverlayCues(cues);
    } catch {
      setOverlayCues([]);
    }
  }

  useEffect(() => {
    loadOverlaySubtitles(selectedSubtitle ?? null);
  }, [selectedSubtitle]);

  useEffect(() => {
    if (!overlayCues.length) {
      setActiveSubtitle("");
      return;
    }
    // find active cue by time; linear scan is fine for few thousand entries
    const t = position;
    const cue = overlayCues.find((c) => t >= c.start && t <= c.end);
    setActiveSubtitle(cue?.text || "");
  }, [position, overlayCues]);

  const selectedVideoTrack =
    stream?.type === "hls"
      ? selectedQuality.height
        ? ({ type: "resolution", value: selectedQuality.height } as any)
        : ({ type: "auto" } as any)
      : ({ type: "auto" } as any);

  // (duplicate overlay/parser removed; using loadOverlaySubtitles + overlayCues/activeSubtitle above)

  /* -------- UI helpers ---------- */

  const allSourceKeys = useMemo(
    () => sourceOrder.flatMap((o) => [o.id, ...o.children]),
    [sourceOrder]
  );

  /* -------- Interaction overlay ---------- */

  function handleVideoPress() {
    if (!showControls) {
      kickControls();
    } else {
      // toggle quickly
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
      setShowControls(false);
    }
  }

  /* -------- Persist progress ---------- */
  const canSaveRef = useRef(false);
  const saveProgress = useCallback(async () => {
    try {
      if (!media || !canSaveRef.current) return;
      const dur = Math.max(duration || 0, 1);
      const pos = Math.max(0, position || 0);
      if (media.type === "movie") {
        await upsertMovieProgress({
          id: Number(media.tmdbId),
          title: displayTitle || undefined,
          poster_path: posterPath || undefined,
          position: pos,
          duration: dur,
        });
      } else if (media.type === "show") {
        await upsertEpisodeProgress({
          showId: Number(media.tmdbId),
          showName: displayTitle || undefined,
          poster_path: posterPath || undefined,
          season: media.season?.number || 1,
          episode: media.episode?.number || 1,
          position: pos,
          duration: dur,
        });
      }
    } catch {}
  }, [media, position, duration, displayTitle, posterPath]);

  useEffect(() => {
    const timer = setInterval(() => {
      // save every 5s
      saveProgress();
    }, 5000);
    return () => {
      clearInterval(timer);
      // Avoid writing zero position if playback never started
      saveProgress();
    };
  }, [saveProgress]);

  /* -------- Render ---------- */

  return (
    <View className="flex-1">
      <StatusBar hidden/>
      {/* Video Layer */}
      {sourceUrl ? (
        <>
          <Video
            ref={playerRef}
            source={{ uri: sourceUrl }}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
            }}
            resizeMode="contain"
            paused={paused}
            onLoadStart={() => setIsLoading(true)}
            onLoad={onLoad}
            onProgress={onProgress}
            onBuffer={(e: any) => setIsBuffering(!!e?.isBuffering)}
            onError={(e) => {
              const anyErr: any = e;
              setPlaybackError(
                typeof anyErr?.nativeEvent === "object"
                  ? JSON.stringify(anyErr.nativeEvent)
                  : String(anyErr)
              );
            }}
            // Disable built-in text tracks; we render our own overlay to ensure visibility
            selectedVideoTrack={selectedVideoTrack}
            allowsExternalPlayback
            ignoreSilentSwitch="ignore"
            automaticallyWaitsToMinimizeStalling
          />
          {/* Buffering / loading indicator */}
          {!paused && (isLoading || isBuffering) && (
            <View className="absolute inset-0 items-center justify-center">
              <ActivityIndicator color="#fff" size="large" />
            </View>
          )}
          {/* Subtitles overlay */}
          {activeSubtitle ? (
            <View
              pointerEvents="none"
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                bottom: showControls ? 120 : 36,
                alignItems: "center",
                paddingHorizontal: 16,
              }}
            >
              <View
                style={{
                  backgroundColor: "rgba(0,0,0,0.6)",
                  borderRadius: 8,
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                }}
              >
                <Text
                  style={{ color: "#fff", textAlign: "center", fontSize: 16 }}
                >
                  {activeSubtitle}
                </Text>
              </View>
            </View>
          ) : null}
          {/* Transparent overlay to toggle controls; disabled while a modal is open */}
          <Pressable
            onPress={handleVideoPress}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
            }}
            android_ripple={{ color: "transparent" }}
            pointerEvents={
              showProviderModal || showSubtitleModal || showQualityModal
                ? "none"
                : "auto"
            }
          />
        </>
      ) : (
        <View className="absolute inset-0 items-center justify-center">
          <ActivityIndicator color="#fff" />
          <Text className="text-white mt-3">Preparing stream…</Text>
        </View>
      )}

      {/* Top Controls */}
      {showControls && (
        <View className="absolute top-0 left-0 right-0 pt-6 pb-3 px-4 bg-gradient-to-b from-black/80 to-transparent">
          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center">
              <TouchableOpacity
                onPress={() => router.back()}
                className="mr-3 p-2 rounded-full bg-black/40"
              >
                <MaterialCommunityIcons
                  name="arrow-left"
                  size={22}
                  color="#fff"
                />
              </TouchableOpacity>
              <Text className="text-white text-sm" numberOfLines={1}>
                {displayTitle ?? (type as string)?.toUpperCase?.() ?? id}{" "}
                {media?.type === "show" ? (season ? `S${season}` : "") : ""}
                {media?.type === "show" && episode ? `E${episode}` : ""}
              </Text>
            </View>

            <View className="flex-row items-center gap-2">
              <TouchableOpacity
                className="px-3 py-2 rounded-full bg-white/10"
                onPress={() => setShowProviderModal(true)}
              >
                <Text className="text-white text-xs" numberOfLines={1}>
                  {currentProviderId ? currentProviderId : "Provider"}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                className="px-3 py-2 rounded-full bg-white/10"
                onPress={() => setShowQualityModal(true)}
              >
                <Text className="text-white text-xs" numberOfLines={1}>
                  {selectedQuality.label}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                className="px-3 py-2 rounded-full bg-white/10"
                onPress={() => setShowSubtitleModal(true)}
              >
                <Text className="text-white text-xs" numberOfLines={1}>
                  {selectedSubtitle
                    ? selectedSubtitle.label
                    : externalFetching
                      ? "Subtitles…"
                      : captions.length
                        ? "Subtitles"
                        : "No Subs"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {/* Bottom Controls */}
      {showControls && (
        <View className="absolute bottom-0 left-0 right-0 pb-6 px-5 pt-3 bg-gradient-to-t from-black/80 to-transparent">
          {/* Timeline */}
          <View className="flex-row items-center w-full gap-3">
            <Text className="text-white text-xs w-12 text-center">
              {formatTime(position)}
            </Text>
            <Slider
              style={{ flex: 1 }}
              minimumValue={0}
              maximumValue={Math.max(duration, 1)}
              value={position}
              onSlidingStart={() => {
                setSeeking(true);
                kickControls();
              }}
              onSlidingComplete={(v) => {
                setSeeking(false);
                seekTo(v);
                kickControls();
              }}
              minimumTrackTintColor="#fff"
              maximumTrackTintColor="#555"
              thumbTintColor="#fff"
            />
            <Text className="text-white text-xs w-12 text-center">
              {formatTime(duration)}
            </Text>
          </View>

          {/* Buttons */}
          <View className="flex-row items-center justify-center w-full mt-2 gap-x-6">
            {media?.type === "show" && (
              <TouchableOpacity
                onPress={() => {
                  const ep = Number(
                    episode || (media as any).episode?.number || 1
                  );
                  const prevEp = Math.max(1, ep - 1);
                  if (ep === prevEp) return;
                  resumeAtRef.current = 0;
                  router.replace({
                    pathname: "/player/[id]",
                    params: {
                      id: String(id),
                      type: "tv",
                      season: String(media.season?.number || season || "1"),
                      episode: String(prevEp),
                    },
                  } as any);
                }}
                className="p-2 rounded-full"
              >
                <MaterialCommunityIcons
                  name="skip-previous"
                  size={32}
                  color="white"
                />
              </TouchableOpacity>
            )}
            <TouchableOpacity
              onPress={() => {
                seekTo(Math.max(position - 10, 0));
                kickControls();
              }}
              className="p-2 rounded-full"
            >
              <MaterialCommunityIcons
                name="rewind-10"
                size={32}
                color="white"
              />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => {
                setPaused((p) => !p);
                kickControls();
              }}
              className="p-2 rounded-full"
            >
              <MaterialCommunityIcons
                name={paused ? "play-circle" : "pause-circle"}
                size={50}
                color="white"
              />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => {
                seekTo(Math.min(position + 10, duration));
                kickControls();
              }}
              className="p-2 rounded-full"
            >
              <MaterialCommunityIcons
                name="fast-forward-10"
                size={32}
                color="white"
              />
            </TouchableOpacity>

            {media?.type === "show" && (
              <TouchableOpacity
                onPress={() => {
                  const count = episodeCount || Number.MAX_SAFE_INTEGER;
                  const ep = Number(
                    episode || (media as any).episode?.number || 1
                  );
                  const nextEp = Math.min(count, ep + 1);
                  if (ep === nextEp) return;
                  resumeAtRef.current = 0;
                  router.replace({
                    pathname: "/player/[id]",
                    params: {
                      id: String(id),
                      type: "tv",
                      season: String(media.season?.number || season || "1"),
                      episode: String(nextEp),
                    },
                  } as any);
                }}
                className="p-2 rounded-full"
              >
                <MaterialCommunityIcons
                  name="skip-next"
                  size={32}
                  color="white"
                />
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}

      {/* Persistent Next Episode button (7 min before end) */}
      {media?.type === "show" &&
        episodeCount &&
        duration > 0 &&
        duration - position <= 420 && (
          <View
            style={{
              position: "absolute",
              right: 16,
              // Higher when controls visible so it sits above them; lower when hidden
              bottom: showControls ? 105 : 36,
            }}
          >
            <TouchableOpacity
              onPress={() => {
                const ep = Number(
                  episode || (media as any).episode?.number || 1
                );
                if (ep >= (episodeCount || ep)) return;
                resumeAtRef.current = 0;
                router.replace({
                  pathname: "/player/[id]",
                  params: {
                    id: String(id),
                    type: "tv",
                    season: String(media.season?.number || season || "1"),
                    episode: String(ep + 1),
                  },
                } as any);
              }}
              className="px-4 py-2 rounded-full bg-white/90"
              activeOpacity={0.85}
            >
              <View className="flex-row items-center">
                <Text className="text-black font-semibold mr-1">
                  Next Episode
                </Text>
                <MaterialCommunityIcons
                  name="skip-next"
                  size={20}
                  color="#000"
                />
              </View>
            </TouchableOpacity>
          </View>
        )}

      {/* Provider Modal */}
      <Modal
        visible={showProviderModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowProviderModal(false)}
      >
        <View className="flex-1 items-center justify-center bg-black/70 px-4">
          <View className="w-full max-w-[600px] max-h-[80%] bg-neutral-900 rounded-2xl p-5">
            <View className="flex-row items-center justify-between mb-4">
              <Text className="text-white text-lg font-semibold">
                Providers
              </Text>
              <TouchableOpacity
                className="px-3 py-1.5 rounded-full bg-white/10"
                onPress={() => {
                  setShowProviderModal(false);
                  // preserve position and subtitles across provider change (Auto)
                  resumeAtRef.current = position;
                  prevSubtitleRef.current = selectedSubtitle;
                  runScrape(null);
                }}
              >
                <Text className="text-white text-xs">Auto</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 360 }} nestedScrollEnabled>
              {sourceOrder.map((grp) => {
                const rootSeg = sources[grp.id];
                return (
                  <View key={grp.id} className="mb-4">
                    <TouchableOpacity
                      className="flex-row items-center justify-between px-3 py-2 rounded-xl bg-white/5"
                      onPress={() => {
                        setShowProviderModal(false);
                        // preserve position and subtitles across provider change
                        resumeAtRef.current = position;
                        prevSubtitleRef.current = selectedSubtitle;
                        runScrape(grp.id);
                      }}
                      activeOpacity={0.8}
                    >
                      <Text
                        className="text-white font-medium flex-1"
                        numberOfLines={1}
                      >
                        {grp.id}
                      </Text>
                      <ProviderStatusBadge
                        segment={rootSeg}
                        currentId={currentProviderId}
                      />
                    </TouchableOpacity>
                    {grp.children.map((eid) => {
                      const embSeg = sources[eid];
                      return (
                        <TouchableOpacity
                          key={eid}
                          className="flex-row items-center justify-between px-3 py-2 rounded-xl bg-white/5 mt-2 ml-2"
                          onPress={() => {
                            // Embeds discovered only after parent; still prioritize parent source
                            setShowProviderModal(false);
                            // preserve position and subtitles across provider change
                            resumeAtRef.current = position;
                            prevSubtitleRef.current = selectedSubtitle;
                            runScrape(grp.id);
                          }}
                          activeOpacity={0.8}
                        >
                          <Text className="text-white flex-1" numberOfLines={1}>
                            {eid}
                          </Text>
                          <ProviderStatusBadge
                            segment={embSeg}
                            currentId={currentProviderId}
                          />
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                );
              })}
              {!sourceOrder.length && (
                <Text className="text-white/60 text-sm">
                  No provider list available yet.
                </Text>
              )}
            </ScrollView>
            <View className="flex-row justify-end mt-3">
              <TouchableOpacity
                className="px-4 py-2 rounded-full bg-white"
                onPress={() => setShowProviderModal(false)}
              >
                <Text className="text-black font-medium">Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Quality Modal */}
      <Modal
        visible={showQualityModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowQualityModal(false)}
      >
        <View className="flex-1 items-center justify-center bg-black/70 px-4">
          <View className="w-full max-w-[480px] max-h-[75%] bg-neutral-900 rounded-2xl p-5">
            <Text className="text-white text-lg font-semibold mb-4">
              Quality
            </Text>
            <ScrollView style={{ maxHeight: 300 }} nestedScrollEnabled>
              {stream?.type === "hls" ? (
                <>
                  <QualityItem
                    label="Auto"
                    selected={selectedQuality.label === "Auto"}
                    onPress={() => {
                      resumeAtRef.current = position;
                      setSelectedQuality({ label: "Auto" });
                      setSelectedHlsVariantUrl(null);
                      setShowQualityModal(false);
                    }}
                  />
                  {hlsVariants.map((v) => (
                    <QualityItem
                      key={v.url}
                      label={v.label}
                      selected={selectedQuality.height === v.height}
                      onPress={() => {
                        resumeAtRef.current = position;
                        setSelectedQuality({
                          label: v.label,
                          height: v.height,
                        });
                        setSelectedHlsVariantUrl(null);
                        setShowQualityModal(false);
                      }}
                    />
                  ))}
                </>
              ) : (
                <>
                  <QualityItem
                    label="Auto"
                    selected={selectedQuality.label === "Auto"}
                    onPress={() => {
                      resumeAtRef.current = position;
                      setSelectedQuality({ label: "Auto", key: "unknown" });
                      setShowQualityModal(false);
                    }}
                  />
                  {qualities
                    .filter((q) => q.key || q.label !== "Auto")
                    .map((q) => (
                      <QualityItem
                        key={q.key ?? q.label}
                        label={q.label}
                        selected={selectedQuality.label === q.label}
                        onPress={() => {
                          resumeAtRef.current = position;
                          setSelectedQuality(q);
                          setShowQualityModal(false);
                        }}
                      />
                    ))}
                </>
              )}
            </ScrollView>
            <View className="flex-row justify-end mt-3">
              <TouchableOpacity
                className="px-4 py-2 rounded-full bg-white"
                onPress={() => setShowQualityModal(false)}
              >
                <Text className="text-black font-medium">Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Subtitles Modal */}
      <Modal
        visible={showSubtitleModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowSubtitleModal(false)}
      >
        <View className="flex-1 items-center justify-center bg-black/70 px-4">
          <View className="w-full max-w-[560px] max-h-[75%] bg-neutral-900 rounded-2xl p-5">
            <Text className="text-white text-lg font-semibold mb-4">
              Subtitles
            </Text>
            <ScrollView style={{ maxHeight: 300 }} nestedScrollEnabled>
              <SubtitleItem
                label="Off"
                selected={!selectedSubtitle}
                onPress={() => {
                  resumeAtRef.current = position;
                  setSelectedSubtitle(null);
                  setShowSubtitleModal(false);
                }}
              />
              {captions.map((c) => (
                <SubtitleItem
                  key={`${c.uri}|${c.language}`}
                  label={`${c.label}${c.source ? ` (${c.source})` : ""}`}
                  selected={selectedSubtitle?.uri === c.uri}
                  onPress={() => {
                    resumeAtRef.current = position;
                    setSelectedSubtitle(c);
                    setShowSubtitleModal(false);
                  }}
                />
              ))}
              {!captions.length && !externalFetching && (
                <Text className="text-white/50 text-sm mt-2">
                  No subtitles found yet.
                </Text>
              )}
              {externalFetching && (
                <View className="flex-row items-center mt-2">
                  <ActivityIndicator color="#fff" />
                  <Text className="text-white text-xs ml-2">
                    Fetching external subtitles…
                  </Text>
                </View>
              )}
            </ScrollView>
            <View className="flex-row justify-end mt-3">
              <TouchableOpacity
                className="px-4 py-2 rounded-full bg-white"
                onPress={() => setShowSubtitleModal(false)}
              >
                <Text className="text-black font-medium">Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Playback Error */}
      {playbackError && (
        <View className="absolute inset-0 items-center justify-center">
          <View className="px-6 py-5 rounded-2xl bg-black/80 border border-red-500/40 w-11/12 max-w-[560px]">
            <Text className="text-white font-semibold">Playback error</Text>
            <Text
              className="text-red-300 mt-3 text-xs leading-4"
              numberOfLines={10}
            >
              {playbackError}
            </Text>
            <View className="flex-row justify-end mt-5">
              <TouchableOpacity
                className="px-4 py-2 rounded-full bg-white"
                onPress={() => setPlaybackError(null)}
              >
                <Text className="text-black font-medium">Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

/* -------------------- Small UI Components -------------------- */

function ProviderStatusBadge({
  segment,
  currentId,
}: {
  segment?: ScrapingSegment;
  currentId: string | null;
}) {
  if (!segment) return <Text className="text-white/40 text-xs">unknown</Text>;
  let text: string = segment.status;
  let color =
    segment.status === "pending"
      ? "#3b82f6"
      : segment.status === "success"
        ? "#16a34a"
        : segment.status === "failure" || segment.status === "notfound"
          ? "#ef4444"
          : "#9ca3af";
  if (currentId === segment.id && segment.status === "pending") {
    text = "active";
  }
  return (
    <View
      style={{
        borderColor: color,
        borderWidth: 2,
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 999,
      }}
    >
      <Text style={{ color }} className="text-[11px] font-medium">
        {text}
      </Text>
    </View>
  );
}

function QualityItem({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      className="px-3 py-2 rounded-xl mb-2 flex-row items-center bg-white/5"
      onPress={onPress}
      activeOpacity={0.75}
    >
      <Text className="text-white flex-1">{label}</Text>
      {selected && (
        <MaterialCommunityIcons name="check" size={18} color="#3b82f6" />
      )}
    </TouchableOpacity>
  );
}

function SubtitleItem({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      className="px-3 py-2 rounded-xl mb-2 flex-row items-center bg-white/5"
      onPress={onPress}
      activeOpacity={0.75}
    >
      <Text className="text-white flex-1">{label}</Text>
      {selected && (
        <MaterialCommunityIcons name="check" size={18} color="#3b82f6" />
      )}
    </TouchableOpacity>
  );
}
