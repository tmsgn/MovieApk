// New/updated imports
import { fetchMovieDetails } from "@/lib/tmdb";
import {
  FullScraperEvents,
  HlsBasedStream,
  makeProviders,
  makeStandardFetcher,
  RunOutput,
  ScrapeMedia,
  targets,
} from "@p-stream/providers";
import { useEvent } from "expo";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as ScreenOrientation from "expo-screen-orientation";
import { useVideoPlayer } from "expo-video";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Animated,
  Dimensions,
  Easing,
  GestureResponderEvent,
  Pressable,
  Text,
  View,
} from "react-native";
import { useSharedValue } from "react-native-reanimated";

// New UI components
import PlayerCore from "@/components/player/PlayerCore";
import ProvidersOverlay, {
  ScrapingItems,
  ScrapingSegment,
} from "@/components/player/ProvidersOverlay";
import SettingsModal from "@/components/player/SettingsModal";
import SubtitlesModal, {
  CaptionItem,
} from "@/components/player/SubtitlesModal";
import AsyncStorage from "@react-native-async-storage/async-storage";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

// Tiny cue type
type CaptionCue = {
  start: number;
  end: number;
  content: string;
  language?: string;
  id?: string;
};
// Keys
const LAST_USED_SOURCE_KEY = "@pstream:lastUsedByMovie"; // JSON { [tmdbId]: providerId }
const PROGRESS_KEY_PREFIX = "@watchProgress:movie:";

// Cache last-used provider per tmdb id (swap to AsyncStorage if needed)
const lastUsedProvider: Record<string, string> = {};

export default function VideoScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  type PlayerSource =
    | string
    | { uri: string; headers?: Record<string, string> };

  const [source, setSource] = useState<PlayerSource>("");
  const [movie, setMovie] = useState<{
    id: number;
    title: string;
    release_date?: string;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [streamType, setStreamType] = useState<"hls" | "file" | undefined>();
  const [mp4Qualities, setMp4Qualities] = useState<
    Array<{ label: string; url: string }>
  >([]);
  const [hlsVariants, setHlsVariants] = useState<
    Array<{ label: string; url: string; height?: number; bandwidth?: number }>
  >([]);
  const [selectedQuality, setSelectedQuality] = useState<string | undefined>(
    undefined
  );
  const [streamHeaders, setStreamHeaders] = useState<
    Record<string, string> | undefined
  >(undefined);
  const [masterHlsUrl, setMasterHlsUrl] = useState<string | undefined>(
    undefined
  );
  const [autoStarted, setAutoStarted] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [hasStarted, setHasStarted] = useState(false);

  // UI
  const [showSettings, setShowSettings] = useState(false);
  const [showProviders, setShowProviders] = useState(false);
  const [showSubtitles, setShowSubtitles] = useState(false);
  const [contentFit, setContentFit] = useState<"cover" | "contain">("cover");
  const [pendingSeek, setPendingSeek] = useState<number | undefined>();
  const [controlsVisible, setControlsVisible] = useState(true);
  const controlsFade = useRef(new Animated.Value(1)).current;

  // Provider selection state
  const [providersList, setProvidersList] = useState<
    Record<string, ScrapingSegment>
  >({});
  const [providerOrder, setProviderOrder] = useState<ScrapingItems[]>([]);
  const [selectedProviderId, setSelectedProviderId] = useState<
    string | undefined
  >(undefined);
  const [showProvidersOverlay, setShowProvidersOverlay] = useState(true);
  const [currentScrapeId, setCurrentScrapeId] = useState<string | undefined>();

  // Subtitles state
  const [captions, setCaptions] = useState<
    Array<{ id: string; language: string; url: string; type?: string }>
  >([]);
  const [hlsTextTracks, setHlsTextTracks] = useState<
    Array<{ id: string; language: string; url: string }>
  >([]);
  const [selectedCaptionId, setSelectedCaptionId] = useState<
    string | "off" | undefined
  >("off");
  const [parsedCues, setParsedCues] = useState<CaptionCue[]>([]);

  // Player/time
  const player = useVideoPlayer(source, (player) => {
    player.loop = true;
    try {
      player.play();
    } catch {}
  });

  const { isPlaying } = useEvent(player, "playingChange", {
    isPlaying: player.playing,
  });
  useEffect(() => {
    if (isPlaying) setHasStarted(true);
  }, [isPlaying]);

  const { status } = useEvent(player, "statusChange", {
    status: (player as any)?.status,
  }) as { status?: string };
  const isBuffering = status === "loading";
  const showLoadingIndicator =
    loading || isBuffering || (!hasStarted && !!source);

  // When player becomes ready or starts playing, clear initial loading flag
  useEffect(() => {
    if (status === "ready" || isPlaying) {
      setLoading(false);
    }
  }, [status, isPlaying]);

  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const progress = useSharedValue(0);
  const min = useSharedValue(0);
  const max = useSharedValue(100);

  useEffect(() => {
    const t = setInterval(() => {
      try {
        setCurrentTime(player.currentTime ?? 0);
        setDuration(player.duration ?? 0);
      } catch {}
    }, 250);
    return () => clearInterval(t);
  }, [player]);

  // Apply playback speed
  useEffect(() => {
    try {
      if (player) (player as any).playbackRate = playbackRate;
    } catch {}
  }, [playbackRate]);

  useEffect(() => {
    if (duration > 0) progress.value = (currentTime / duration) * 100;
    else progress.value = 0;
  }, [currentTime, duration]);

  // Orientation lock
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
      if (!mounted) return;
      (async () => {
        try {
          await ScreenOrientation.lockAsync(
            ScreenOrientation.OrientationLock.PORTRAIT_UP
          );
        } catch {}
      })();
      mounted = false;
    };
  }, []);

  // Helpers
  const fmt = (s: number) => {
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
  };

  const onSeek = (pos: number) => {
    try {
      player.currentTime = pos;
    } catch {}
  };

  const fadeControls = (to: number, dur = 200) => {
    Animated.timing(controlsFade, {
      toValue: to,
      duration: dur,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  };
  useEffect(() => {
    fadeControls(controlsVisible ? 1 : 0);
  }, [controlsVisible]);

  const lastTap = useRef<number>(0);
  const onBackgroundPress = (e?: GestureResponderEvent) => {
    const now = Date.now();
    const TAP_DELAY = 300;
    if (now - lastTap.current < TAP_DELAY) {
      const x = e?.nativeEvent.locationX ?? 0;
      if (x > SCREEN_WIDTH * 0.66) {
        try {
          player.currentTime = Math.min(
            player.duration ?? 0,
            (player.currentTime ?? 0) + 10
          );
        } catch {}
      } else if (x < SCREEN_WIDTH * 0.33) {
        try {
          player.currentTime = Math.max(0, (player.currentTime ?? 0) - 10);
        } catch {}
      } else {
        try {
          player.currentTime = Math.min(
            player.duration ?? 0,
            (player.currentTime ?? 0) + 10
          );
        } catch {}
      }
    } else {
      setControlsVisible((s) => !s);
    }
    lastTap.current = now;
  };

  // Subtitles overlay sync
  const visibleCues = useMemo(() => {
    if (!parsedCues || parsedCues.length === 0) return [];
    const t = currentTime;
    return parsedCues.filter((c) => t >= c.start && t <= c.end);
  }, [parsedCues, currentTime]);

  // Build providers with events (to collect source list)
  const makeScraper = () =>
    makeProviders({
      fetcher: makeStandardFetcher(fetch),
      target: targets.NATIVE,
      consistentIpForRequests: true,
    });

  const mapNameByIdFromProviders = (
    providers: any
  ): ((id: string) => string) => {
    const meta = providers?.getMetadata?.() ?? providers?.metadata ?? [];
    const pairs: Array<{ id: string; name: string }> = Array.isArray(meta)
      ? meta
          .flat()
          .filter((m: any) => m && m.id && m.name)
          .map((m: any) => ({ id: m.id, name: m.name }))
      : [];
    const map = new Map(pairs.map((p) => [p.id, p.name]));
    return (id: string) => map.get(id) || id;
  };

  // Core: run scrape with optional forced provider id
  const runScrape = useCallback(
    async (tmdbId: string, forceProviderId?: string) => {
      setLoading(true);
      setErrorMessage(null);
      setHasStarted(false);
      setSource("");
      setStreamType(undefined);
      setMp4Qualities([]);
      setHlsVariants([]);
      setSelectedQuality(undefined);
      setStreamHeaders(undefined);
      setMasterHlsUrl(undefined);
      setCaptions([]);
      setHlsTextTracks([]);
      setSelectedCaptionId("off");
      setParsedCues([]);
      setSelectedProviderId(forceProviderId);

      // fetch movie details
      const details = await fetchMovieDetails(tmdbId);
      setMovie(details);

      const providers = makeScraper();
      const nameById = mapNameByIdFromProviders(providers);

      // Collect provider list via events (p‑stream pattern)
      const collected: Record<string, ScrapingSegment> = {};
      const order: ScrapingItems[] = [];
      const events: FullScraperEvents = {
        init: (evt) => {
          const base = evt.sourceIds.map((sid) => {
            collected[sid] = {
              id: sid,
              name: nameById(sid),
              status: "waiting",
            };
            return { id: sid, children: [] as string[] };
          });
          setProvidersList({ ...collected });
          setProviderOrder(base);
          setCurrentScrapeId(undefined);
          setShowProvidersOverlay(true);
        },
        start: (id) => {
          collected[id] = {
            ...(collected[id] || { id, name: nameById(id) }),
            status: "pending",
          };
          setProvidersList({ ...collected });
          setCurrentScrapeId(id);
        },
        update: ({ id, status, reason, error, percentage }) => {
          collected[id] = {
            ...(collected[id] || { id, name: nameById(id) }),
            status: status as any,
            reason,
            error,
            percentage,
          };
          setProvidersList({ ...collected });
        },
        discoverEmbeds: (evt) => {
          // Create items for embeds under the parent provider
          evt.embeds.forEach((v) => {
            collected[v.id] = {
              id: v.id,
              name: nameById(v.embedScraperId),
              status: "waiting",
            } as ScrapingSegment;
          });
          setProvidersList({ ...collected });
          setProviderOrder((prev) => {
            const next = prev.map((o) => ({ ...o, children: [...o.children] }));
            const parent = next.find((o) => o.id === evt.sourceId);
            if (parent) parent.children = evt.embeds.map((e) => e.id);
            return next;
          });
        },
      };

      const media: ScrapeMedia = {
        type: "movie",
        title: details.title,
        releaseYear: details.release_date
          ? Number(details.release_date.slice(0, 4))
          : 0,
        tmdbId: String(details.id),
      };

      // Prefer last used provider for this title
      let sourceOrder: string[] | undefined = undefined;
      const last = await getLastUsedProvider(String(details.id));
      if (forceProviderId) sourceOrder = [forceProviderId];
      else if (last) sourceOrder = [last];

      const output = await providers.runAll({
        media,
        sourceOrder,
        events,
      });

      if (!output?.stream) {
        setErrorMessage("No stream found");
        setLoading(false);
        return;
      }

      // remember success
      if (output.sourceId)
        await setLastUsedProvider(String(details.id), output.sourceId);

      // set the selected provider so the UI shows which source is active
      try {
        if (output.sourceId) setSelectedProviderId(output.sourceId);
      } catch {}

      await applyRunOutput(output);
      // Hide providers panel shortly after success so the user can see success state
      setTimeout(() => setShowProvidersOverlay(false), 600);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  // Apply RunOutput: wires quality, headers, captions, hls tracks
  const applyRunOutput = useCallback(
    async (out: RunOutput) => {
      const mergedHeaders =
        (out.stream as any).preferredHeaders ||
        (out.stream as any).headers ||
        undefined;

      // provider captions (like p‑stream)
      const providerCaps =
        (out.stream as any).captions?.map((v: any) => ({
          id: String(v.id ?? `${v.language}-${v.url}`),
          language: String(v.language ?? "Unknown"),
          url: String(v.url),
          type: v.type ?? "srt",
        })) ?? [];
      setCaptions(providerCaps);

      if ((out.stream as HlsBasedStream).type === "hls") {
        setStreamType("hls");
        const playlist = (out.stream as HlsBasedStream).playlist;
        setMasterHlsUrl(playlist);
        setStreamHeaders(mergedHeaders);
        setSelectedQuality(undefined);
        setSource(
          mergedHeaders ? { uri: playlist, headers: mergedHeaders } : playlist
        );

        // Variants for UI
        try {
          const text = await (
            await fetch(playlist, { headers: mergedHeaders } as any)
          ).text();
          const variants = parseHlsVariants(text, playlist);
          setHlsVariants(variants);
          const hlsSubs = parseHlsSubtitles(text, playlist);
          setHlsTextTracks(hlsSubs);
        } catch {}
      } else {
        setStreamType("file");
        setStreamHeaders(mergedHeaders);
        const qmap = (out.stream as any).qualities || {};
        const items = Object.keys(qmap)
          .map((k) => parseInt(k, 10))
          .filter((n) => !Number.isNaN(n))
          .sort((a, b) => b - a)
          .map((k) => ({ label: `${k}p`, url: qmap[String(k)]?.url }))
          .filter((q) => !!q.url) as Array<{ label: string; url: string }>;
        setMp4Qualities(items);
        if (items.length > 0) {
          setSelectedQuality(items[0].label);
          setSource({ uri: items[0].url, headers: mergedHeaders });
        } else if ((out.stream as any).url) {
          setSelectedQuality(undefined);
          setSource({ uri: (out.stream as any).url, headers: mergedHeaders });
        } else {
          setErrorMessage("No playable file qualities found");
        }
      }

      // If we have provider captions, default select first; else if HLS subs exist, default first
      const defaultCap = providerCaps[0]?.id ?? hlsTextTracks[0]?.id ?? "off";
      setSelectedCaptionId(defaultCap || "off");
      if (defaultCap && defaultCap !== "off") {
        const cap:
          | { id: string; language: string; url: string; type?: string }
          | { id: string; language: string; url: string }
          | undefined =
          providerCaps.find((c: { id: string }) => c.id === defaultCap) ||
          hlsTextTracks.find((c: { id: string }) => c.id === defaultCap);
        if (cap) {
          try {
            const txt = await fetchWithHeaders(cap.url, streamHeaders);
            const cues = parseCaptionsToCues(txt);
            setParsedCues(cues);
          } catch {}
        }
      }
    },
    [hlsTextTracks, streamHeaders]
  );

  // Start
  useEffect(() => {
    if (!autoStarted && id) {
      runScrape(id);
      setAutoStarted(true);
    }
  }, [id, autoStarted, runScrape]);

  // Re-seek after quality/provider switch
  useEffect(() => {
    if (pendingSeek == null) return;
    const t = setTimeout(() => {
      try {
        player.currentTime = pendingSeek;
        player.play();
      } catch {}
      setPendingSeek(undefined);
    }, 500);
    return () => clearTimeout(t);
  }, [source]);

  // Last-used provider persistence (movies)
  const setLastUsedProvider = useCallback(
    async (tmdbId: string, providerId: string) => {
      try {
        const json = (await AsyncStorage.getItem(LAST_USED_SOURCE_KEY)) || "{}";
        const map = JSON.parse(json);
        map[tmdbId] = providerId;
        await AsyncStorage.setItem(LAST_USED_SOURCE_KEY, JSON.stringify(map));
      } catch {}
    },
    []
  );
  const getLastUsedProvider = useCallback(async (tmdbId: string) => {
    try {
      const json = (await AsyncStorage.getItem(LAST_USED_SOURCE_KEY)) || "{}";
      const map = JSON.parse(json);
      return map[tmdbId] as string | undefined;
    } catch {
      return undefined;
    }
  }, []);

  // Persist and resume progress
  const progressKey = useMemo(
    () => (movie?.id ? `${PROGRESS_KEY_PREFIX}${movie.id}` : undefined),
    [movie?.id]
  );
  useEffect(() => {
    if (!progressKey) return;
    let saver: ReturnType<typeof setInterval> | null = null;
    const saveNow = () => {
      try {
        const rec = {
          position: Math.floor(player.currentTime || 0),
          duration: Math.floor(player.duration || 0),
          updatedAt: Date.now(),
        };
        AsyncStorage.setItem(progressKey, JSON.stringify(rec));
      } catch {}
    };
    saver = setInterval(saveNow, 5000);
    return () => {
      if (saver) clearInterval(saver);
      saveNow();
    };
  }, [progressKey, player]);

  // Attempt to resume when source changes to a new stream
  useEffect(() => {
    (async () => {
      if (!progressKey) return;
      try {
        const v = await AsyncStorage.getItem(progressKey);
        let sec = 0;
        if (v) {
          try {
            const obj = JSON.parse(v);
            if (typeof obj?.position === "number") sec = obj.position;
          } catch {
            const n = parseInt(v, 10);
            sec = Number.isNaN(n) ? 0 : n;
          }
        }
        if (sec > 60) {
          player.currentTime = sec;
        }
      } catch {}
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source]);

  // Quality switch
  const switchQuality = (
    label: string,
    url: string | undefined,
    isAuto?: boolean
  ) => {
    if (!url && !isAuto) return;
    const pos = currentTime;
    setSelectedQuality(label);
    if (isAuto) {
      if (masterHlsUrl)
        setSource(
          streamHeaders
            ? { uri: masterHlsUrl, headers: streamHeaders }
            : masterHlsUrl
        );
    } else if (streamType === "file") {
      setSource({ uri: url!, headers: streamHeaders });
    } else {
      setSource(streamHeaders ? { uri: url!, headers: streamHeaders } : url!);
    }
    setPendingSeek(pos);
  };

  // Provider switch
  const switchProvider = async (providerId: string) => {
    if (!movie?.id) return;
    const pos = currentTime;
    await runScrape(String(movie.id), providerId);
    setPendingSeek(pos);
    setShowProvidersOverlay(false);
  };

  // Subtitle switch
  const switchSubtitle = async (captionId: string | "off") => {
    setSelectedCaptionId(captionId);
    setParsedCues([]);
    if (captionId === "off") return;

    const cap =
      captions.find((c) => c.id === captionId) ||
      hlsTextTracks.find((c) => c.id === captionId);
    if (!cap) return;

    try {
      const txt = await fetchWithHeaders(cap.url, streamHeaders);
      const cues = parseCaptionsToCues(txt);
      setParsedCues(cues);
    } catch {}
    setShowSubtitles(false);
  };

  const onRetry = () => {
    setControlsVisible(true);
    if (id) runScrape(id, selectedProviderId);
  };

  const qualityLabel = useMemo(
    () => selectedQuality ?? (streamType === "hls" ? "Auto" : "—"),
    [selectedQuality, streamType]
  );

  const subtitleLabel = useMemo(() => {
    if (!selectedCaptionId || selectedCaptionId === "off") return "Subs Off";
    const found =
      captions.find((c) => c.id === selectedCaptionId) ||
      hlsTextTracks.find((c) => c.id === selectedCaptionId);
    return found ? found.language : "Subs";
  }, [selectedCaptionId, captions, hlsTextTracks]);
  // Derived labels
  const titleLabel = movie?.title || "";
  const visibleSubtitles = visibleCues.map((c, i) => ({
    id: `${i}`,
    content: c.content,
  }));

  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      <PlayerCore
        player={player}
        title={titleLabel}
        showLoading={showLoadingIndicator}
        visibleSubtitles={visibleSubtitles}
        onBack={() => router.back()}
        onToggleFit={() =>
          setContentFit((v) => (v === "contain" ? "cover" : "contain"))
        }
        fitLabel={contentFit === "contain" ? "Fit" : "Fill"}
        onOpenProviders={() => setShowProvidersOverlay(true)}
        onOpenSubtitles={() => setShowSubtitles(true)}
        onOpenQuality={() => setShowSettings(true)}
        onOpenSpeed={() => setShowSettings(true)}
        currentTime={currentTime}
        duration={duration}
        onSeek={onSeek}
        isBuffering={isBuffering}
        onTogglePlayPause={() => {
          try {
            if (isPlaying) player.pause();
            else player.play();
          } catch {}
        }}
      />

      {/* Providers overlay */}
      <ProvidersOverlay
        visible={showProvidersOverlay}
        onRequestClose={() => setShowProvidersOverlay(false)}
        title="Testing providers…"
        sources={providersList}
        order={providerOrder}
        currentId={currentScrapeId}
        activeProviderId={selectedProviderId}
        onSelectProvider={(id) => switchProvider(id)}
      />

      {/* Settings (quality + speed) */}
      <SettingsModal
        visible={showSettings}
        onRequestClose={() => setShowSettings(false)}
        streamType={streamType}
        hlsVariants={hlsVariants}
        fileQualities={mp4Qualities}
        selectedQuality={selectedQuality}
        onSelectQuality={(label, url, isAuto) =>
          switchQuality(label, url, isAuto)
        }
        currentSpeed={playbackRate}
        onSelectSpeed={(rate) => setPlaybackRate(rate)}
      />

      {/* Subtitles */}
      <SubtitlesModal
        visible={showSubtitles}
        onRequestClose={() => setShowSubtitles(false)}
        tracks={[
          ...captions.map(
            (c) =>
              ({ id: c.id, display: c.language, url: c.url }) as CaptionItem
          ),
          ...hlsTextTracks.map(
            (c) =>
              ({ id: c.id, display: c.language, url: c.url }) as CaptionItem
          ),
        ]}
        selectedId={selectedCaptionId}
        onSelect={(id) => switchSubtitle(id as any)}
        allowAddExternal
        onAddExternal={(url) => {
          const id = `ext-${Date.now()}`;
          const item = { id, display: "External", url } as CaptionItem;
          setCaptions((prev) => [...prev, { id, language: "External", url }]);
          setSelectedCaptionId(id);
        }}
      />

      {!!errorMessage && (
        <View
          style={{
            position: "absolute",
            inset: 0,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "rgba(0,0,0,0.9)",
          }}
        >
          <View
            style={{
              padding: 16,
              borderRadius: 12,
              backgroundColor: "#111",
              alignItems: "center",
            }}
          >
            <Text style={{ color: "#fff", marginBottom: 12 }}>
              {errorMessage}
            </Text>
            <Pressable
              onPress={onRetry}
              style={{
                backgroundColor: "#fff",
                paddingHorizontal: 14,
                paddingVertical: 8,
                borderRadius: 8,
              }}
            >
              <Text style={{ color: "#000" }}>Retry</Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

/* ---------- Helpers: HLS parsing, captions parsing and fetch ---------- */

function parseHlsVariants(playlistText: string, masterUrl: string) {
  const lines = playlistText.split(/\r?\n/);
  const out: {
    label: string;
    url: string;
    height?: number;
    bandwidth?: number;
  }[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith("#EXT-X-STREAM-INF")) {
      const attrs = parseAttributeList(
        line.substring("#EXT-X-STREAM-INF:".length)
      );
      const next = lines[i + 1]?.trim();
      if (next && !next.startsWith("#")) {
        const url = resolveUrl(next, masterUrl);
        let height: number | undefined;
        if (attrs["RESOLUTION"]) {
          const m = String(attrs["RESOLUTION"]).match(/(\d+)x(\d+)/);
          height = m ? parseInt(m[2], 10) : undefined;
        }
        const bandwidth = attrs["BANDWIDTH"]
          ? Number(attrs["BANDWIDTH"])
          : undefined;
        const label = height
          ? `${height}p`
          : bandwidth
            ? bandwidthToResolution(bandwidth)
            : `variant-${out.length + 1}`;
        out.push({ label, url, height, bandwidth });
      }
    }
  }
  return out;
}

// Map HLS bandwidth (bits/sec) to a rough resolution label when RESOLUTION is missing.
function bandwidthToResolution(bandwidth: number) {
  const kb = Math.round(bandwidth / 1000);
  // thresholds tuned conservatively; adjust if you prefer different mapping
  if (kb < 800) return "360p";
  if (kb < 1400) return "480p";
  if (kb < 3000) return "720p";
  if (kb < 6000) return "1080p";
  if (kb < 12000) return "1440p";
  return "2160p";
}

function parseHlsSubtitles(playlistText: string, masterUrl: string) {
  // Look for in‑manifest subtitles
  const out: Array<{ id: string; language: string; url: string }> = [];
  const lines = playlistText.split(/\r?\n/);
  for (const line of lines) {
    const l = line.trim();
    if (l.startsWith("#EXT-X-MEDIA:") && l.includes("TYPE=SUBTITLES")) {
      const attrs = parseAttributeList(l.substring("#EXT-X-MEDIA:".length));
      const lang = attrs["LANGUAGE"] || attrs["NAME"] || "Subtitles";
      const uri = attrs["URI"]
        ? resolveUrl(attrs["URI"], masterUrl)
        : undefined;
      if (uri) {
        out.push({ id: `hls-${lang}`, language: lang, url: uri });
      }
    }
  }
  return out;
}

function parseAttributeList(s: string): Record<string, string> {
  // Split by commas that are not inside quotes
  const out: Record<string, string> = {};
  const parts: string[] = [];
  let buf = "";
  let inQuotes = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
      buf += ch;
    } else if (ch === "," && !inQuotes) {
      if (buf.trim()) parts.push(buf.trim());
      buf = "";
    } else {
      buf += ch;
    }
  }
  if (buf.trim()) parts.push(buf.trim());

  for (const p of parts) {
    const eq = p.indexOf("=");
    if (eq === -1) continue;
    const k = p.slice(0, eq).trim().toUpperCase();
    let v = p.slice(eq + 1).trim();
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
    out[k] = v;
  }
  return out;
}

function resolveUrl(rel: string, baseUrl: string): string {
  try {
    return new URL(rel, baseUrl).toString();
  } catch {
    return rel;
  }
}

async function fetchWithHeaders(
  url: string,
  headers?: Record<string, string>
): Promise<string> {
  const res = await fetch(url, headers ? ({ headers } as any) : undefined);
  return await res.text();
}

// Minimal SRT/VTT parser -> cues (start/end in seconds)
function parseCaptionsToCues(text: string): CaptionCue[] {
  // Normalize newlines, convert SRT separators to VTT-like
  const src = text.replace(/\r/g, "");
  const isSrt = /-->/.test(src) && src.includes(",");
  const lines = src.split("\n");
  const cues: CaptionCue[] = [];
  let i = 0;
  while (i < lines.length) {
    // Skip index line for SRT
    if (/^\d+$/.test(lines[i].trim())) i++;
    const timeLine = lines[i++]?.trim();
    if (!timeLine || !timeLine.includes("-->")) continue;
    const [a, b] = timeLine.split("-->").map((s) => s.trim());
    const start = toSeconds(a);
    const end = toSeconds(b);
    const buf: string[] = [];
    while (i < lines.length && lines[i].trim() !== "") {
      buf.push(lines[i++]);
    }
    // skip blank
    while (i < lines.length && lines[i].trim() === "") i++;
    const content = buf.join("\n");
    if (Number.isFinite(start) && Number.isFinite(end)) {
      cues.push({ start, end, content });
    }
  }
  return cues;

  function toSeconds(ts: string) {
    // supports 00:00:10.500 or 00:00:10,500
    const t = ts.replace(",", ".");
    const m = t.match(/(?:(\d+):)?(\d+):(\d+)(?:\.(\d+))?/);
    if (!m) return NaN;
    const h = parseInt(m[1] ?? "0", 10);
    const min = parseInt(m[2], 10);
    const s = parseInt(m[3], 10);
    const ms = parseInt(m[4] ?? "0", 10);
    return h * 3600 + min * 60 + s + ms / Math.pow(10, m[4]?.length ?? 0);
  }
}
