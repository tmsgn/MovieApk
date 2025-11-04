// TvPlayerScreen.tsx
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEvent } from "expo";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as ScreenOrientation from "expo-screen-orientation";
import { StatusBar } from "expo-status-bar";
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
  Pressable,
  Text,
  View,
} from "react-native";
import { useSharedValue } from "react-native-reanimated";

import {
  FileBasedStream,
  FullScraperEvents,
  HlsBasedStream,
  makeProviders,
  makeStandardFetcher,
  ProviderControls,
  RunOutput,
  ScrapeMedia,
  targets,
} from "@p-stream/providers";

import {
  fetchSeasonDetails,
  fetchTVShowDetails,
  SeasonDetails,
  TVShowDetails,
} from "@/lib/tmdb";

// New shared player UI
import PlayerCore from "@/components/player/PlayerCore";
import ProvidersOverlay from "@/components/player/ProvidersOverlay";
import SettingsModal from "@/components/player/SettingsModal";
import SubtitlesModal from "@/components/player/SubtitlesModal";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

type PlayerSource = string | { uri: string; headers?: Record<string, string> };

type ScrapingItems = { id: string; children: string[] };
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

type CaptionListItem = {
  id: string;
  language: string;
  url: string;
  type?: string;
  needsProxy?: boolean;
  hls?: boolean;
  opensubtitles?: boolean;
  display?: string;
  media?: string;
  isHearingImpaired?: boolean;
  source?: string;
  encoding?: string;
};

type Cue = { start: number; end: number; text: string };

const LAST_USED_SOURCE_KEY = "@pstream:lastUsedByShow"; // JSON object { [tmdbId: string]: string }

export default function TvPlayerScreen() {
  const { id, season, episode } = useLocalSearchParams<{
    id: string;
    season?: string;
    episode?: string;
  }>();
  const router = useRouter();

  const [source, setSource] = useState<PlayerSource>("");
  const [tv, setTv] = useState<TVShowDetails | null>(null);
  const [seasonDetails, setSeasonDetails] = useState<SeasonDetails | null>(
    null
  );
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

  const [showSettings, setShowSettings] = useState(false);
  const [contentFit, setContentFit] = useState<"cover" | "contain">("cover");
  const [pendingSeek, setPendingSeek] = useState<number | undefined>();
  const [controlsVisible, setControlsVisible] = useState(true);
  const controlsFade = useRef(new Animated.Value(1)).current;

  const [stream, setStream] = useState<
    HlsBasedStream | FileBasedStream | undefined
  >(undefined);

  // Provider testing UI state
  const [scrapingSources, setScrapingSources] = useState<
    Record<string, ScrapingSegment>
  >({});
  const [scrapingOrder, setScrapingOrder] = useState<ScrapingItems[]>([]);
  const [currentScrapeId, setCurrentScrapeId] = useState<string | undefined>(
    undefined
  );
  const [showScrapeOverlay, setShowScrapeOverlay] = useState(true);
  const [failedToStartScrape, setFailedToStartScrape] = useState(false);

  // Subtitles state
  const [captionTracks, setCaptionTracks] = useState<CaptionListItem[]>([]);
  const [selectedCaptionId, setSelectedCaptionId] = useState<
    string | "off" | undefined
  >("off");
  const [parsedCues, setParsedCues] = useState<Cue[]>([]);
  const [showSubs, setShowSubs] = useState(false);
  // external subtitles handled inside SubtitlesModal now

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

  useEffect(() => {
    if (status === "ready" || isPlaying) setLoading(false);
  }, [status, isPlaying]);

  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

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

  useEffect(() => {
    if (duration > 0) progress.value = (currentTime / duration) * 100;
    else progress.value = 0;
  }, [currentTime, duration]);

  const seasonNumber = useMemo(
    () => (season ? parseInt(String(season), 10) : undefined),
    [season]
  );
  const episodeNumber = useMemo(
    () => (episode ? parseInt(String(episode), 10) : undefined),
    [episode]
  );

  // Progress key for this episode
  const progressKey = useMemo(() => {
    if (!id || !seasonNumber || !episodeNumber) return undefined;
    return `@watchProgress:tv:${id}:S${seasonNumber}E${episodeNumber}`;
  }, [id, seasonNumber, episodeNumber]);

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

  // Persist progress periodically and on unmount
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

  // Attempt to resume when source changes
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
        if (sec > 30) {
          player.currentTime = sec;
        }
      } catch {}
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source]);

  useEffect(() => {
    fadeControls(controlsVisible ? 1 : 0);
  }, [controlsVisible]);

  const fadeControls = (to: number, dur = 200) => {
    Animated.timing(controlsFade, {
      toValue: to,
      duration: dur,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  };

  useEffect(() => {
    if (source) setHasStarted(false);
  }, [source]);

  const seasonEpisodeFromState = () => {
    if (!seasonNumber || !episodeNumber) return null;
    return { season: seasonNumber, episode: episodeNumber };
  };

  const computeNextEpisode = () => {
    if (!tv || !seasonDetails || !seasonNumber || !episodeNumber) return null;
    const episodes = seasonDetails.episodes || [];
    const idx = episodes.findIndex((e) => e.episode_number === episodeNumber);
    if (idx >= 0 && idx + 1 < episodes.length) {
      return {
        season: seasonNumber,
        episode: episodes[idx + 1].episode_number,
      };
    }
    const seasons = (tv.seasons || [])
      .filter((s) => (s.season_number ?? 0) > 0 && (s.episode_count ?? 0) > 0)
      .sort((a, b) => (a.season_number ?? 0) - (b.season_number ?? 0));
    const currentIdx = seasons.findIndex(
      (s) => s.season_number === seasonNumber
    );
    if (currentIdx >= 0 && currentIdx + 1 < seasons.length) {
      return { season: seasons[currentIdx + 1].season_number, episode: 1 };
    }
    return null;
  };

  const goToNext = async () => {
    const next = computeNextEpisode();
    if (!next || !id) return;
    router.replace({
      pathname: "/player/tv/[id]",
      params: {
        id: String(id),
        season: String(next.season),
        episode: String(next.episode),
      },
    });
    await handlePlay(String(id), next.season, next.episode);
  };

  const qualityLabel = useMemo(
    () => selectedQuality ?? (streamType === "hls" ? "Auto" : "—"),
    [selectedQuality, streamType]
  );

  const headerTitle = useMemo(() => {
    const s = seasonNumber ?? 0;
    const e = episodeNumber ?? 0;
    const se =
      s && e
        ? `S${String(s).padStart(2, "0")}E${String(e).padStart(2, "0")}`
        : "";
    return `${tv?.name ?? "TV Show"}${se ? " • " + se : ""}`;
  }, [tv?.name, seasonNumber, episodeNumber]);

  // Remember last successful provider for shows
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

  // Provider events -> scraping UI
  function initScrapeEvent(
    evt: Parameters<NonNullable<FullScraperEvents["init"]>>[0],
    nameById: (id: string) => string
  ) {
    setScrapingSources(
      evt.sourceIds
        .map((v) => ({
          name: nameById(v),
          id: v,
          status: "waiting" as ScrapingStatus,
          percentage: 0,
        }))
        .reduce<Record<string, ScrapingSegment>>((a, v) => {
          a[v.id] = v;
          return a;
        }, {})
    );
    setScrapingOrder(evt.sourceIds.map((v) => ({ id: v, children: [] })));
    setCurrentScrapeId(undefined);
    setFailedToStartScrape(false);
  }

  function startScrapeEvent(id: string) {
    setScrapingSources((s) => {
      const copy = { ...s };
      if (copy[id]) copy[id].status = "pending";
      return copy;
    });
    setCurrentScrapeId(id);
  }

  function updateScrapeEvent(evt: {
    id: string;
    status: ScrapingStatus;
    reason?: string;
    error?: any;
    percentage: number;
  }) {
    setScrapingSources((s) => {
      const copy = { ...s };
      const item = copy[evt.id];
      if (item) {
        item.status = evt.status;
        item.reason = evt.reason;
        item.error = evt.error;
        item.percentage = evt.percentage;
      }
      return copy;
    });
  }

  function discoverEmbedsEvent(
    evt: {
      sourceId: string;
      embeds: Array<{ id: string; embedScraperId: string }>;
    },
    nameById: (id: string) => string
  ) {
    setScrapingSources((s) => {
      const copy = { ...s };
      evt.embeds.forEach((v) => {
        copy[v.id] = {
          embedId: v.embedScraperId,
          name: nameById(v.embedScraperId),
          id: v.id,
          status: "waiting",
          percentage: 0,
        };
      });
      return copy;
    });
    setScrapingOrder((order) => {
      const copy = order.map((x) => ({ ...x, children: [...x.children] }));
      const parent = copy.find((o) => o.id === evt.sourceId);
      if (parent) parent.children = evt.embeds.map((e) => e.id);
      return copy;
    });
  }

  const mapNameByIdFromProviders = (
    providers: ProviderControls
  ): ((id: string) => string) => {
    // Try to get metadata with names from providers if available
    const meta =
      (providers as any).getMetadata?.() ?? (providers as any).metadata ?? [];
    const pairs: Array<{ id: string; name: string }> = Array.isArray(meta)
      ? meta
          .flat()
          .filter((m: any) => m && m.id && m.name)
          .map((m: any) => ({ id: m.id, name: m.name }))
      : [];
    const map = new Map(pairs.map((p) => [p.id, p.name]));
    return (id: string) => map.get(id) || id;
  };

  const setStreamAndUI = async (output: RunOutput | null, tmdbId?: string) => {
    if (!output?.stream) return;

    // Remember last provider on success for shows
    if (tmdbId && output.sourceId) {
      setLastUsedProvider(tmdbId, output.sourceId).catch(() => {});
    }

    setStream(output.stream as any);

    // Merge headers
    const mergedHeaders =
      (output.stream as any).preferredHeaders ||
      (output.stream as any).headers ||
      undefined;

    const newCaptions: CaptionListItem[] = convertProviderCaption(
      output.stream.captions
    );

    if ((output.stream as HlsBasedStream).type === "hls") {
      setStreamType("hls");
      const playlist = (output.stream as HlsBasedStream).playlist;
      setMasterHlsUrl(playlist);
      setStreamHeaders(mergedHeaders);
      setSelectedQuality(undefined);
      setSource(
        mergedHeaders ? { uri: playlist, headers: mergedHeaders } : playlist
      );

      try {
        const res = await fetch(playlist, { headers: mergedHeaders } as any);
        const text = await res.text();
        const variants = parseHlsVariants(text, playlist);
        setHlsVariants(variants);

        // Parse HLS subtitle tracks
        const hlsSubs = parseHlsSubtitles(text, playlist);
        const mergedSubs = mergeCaptionsAvoidDup([...newCaptions, ...hlsSubs]);
        setCaptionTracks(mergedSubs);
      } catch (e) {
        setCaptionTracks(newCaptions);
      }
    } else if ((output.stream as any).type === "file") {
      setStreamType("file");
      setStreamHeaders(mergedHeaders);

      const qualitiesMap = (output.stream as any).qualities || {};
      const numericKeys = Object.keys(qualitiesMap)
        .map((k) => parseInt(k, 10))
        .filter((n) => !Number.isNaN(n))
        .sort((a, b) => b - a);
      const items = numericKeys
        .map((k) => ({ label: `${k}p`, url: qualitiesMap[String(k)]?.url }))
        .filter((q) => !!q.url) as Array<{ label: string; url: string }>;
      setMp4Qualities(items);

      setCaptionTracks(newCaptions);

      if (items.length > 0) {
        setSelectedQuality(items[0].label);
        setSource({ uri: items[0].url!, headers: mergedHeaders });
      } else if ((output.stream as any).url) {
        setSelectedQuality(undefined);
        setSource({ uri: (output.stream as any).url, headers: mergedHeaders });
      } else {
        setErrorMessage("No playable file qualities found");
      }
    }
  };

  // Fetch show + season data and play using providers with progress events
  const handlePlay = async (tvId: string, sNumber: number, eNumber: number) => {
    let isMounted = true;

    // reset UI
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
    setCaptionTracks([]);
    setSelectedCaptionId("off");
    setParsedCues([]);
    setShowScrapeOverlay(true);
    setScrapingSources({});
    setScrapingOrder([]);
    setCurrentScrapeId(undefined);
    setFailedToStartScrape(false);

    try {
      // Get TMDB data for labels and last-used source
      const details = await fetchTVShowDetails(tvId);
      if (!isMounted) return;
      setTv(details);

      const seasonDet = await fetchSeasonDetails(tvId, sNumber);
      if (!isMounted) return;
      setSeasonDetails(seasonDet);

      const ep = seasonDet.episodes.find((e) => e.episode_number === eNumber);
      if (!ep) {
        setErrorMessage("Episode not found");
        return;
      }

      const providers = makeProviders({
        fetcher: makeStandardFetcher(fetch as any),
        target: targets.NATIVE,
        consistentIpForRequests: true,
      });

      const media: ScrapeMedia = {
        type: "show",
        title: details.name,
        releaseYear: details.first_air_date
          ? Number(details.first_air_date.slice(0, 4))
          : 0,
        tmdbId: String(details.id),
        episode: { number: ep.episode_number, tmdbId: String(ep.id) },
        season: {
          number: seasonDet.season_number,
          tmdbId: String(seasonDet.id),
          title: seasonDet.name,
          episodeCount: seasonDet.episodes?.length || undefined,
        },
      };

      // Prefer last-used provider first if available
      let sourceOrder: string[] | undefined = undefined;
      try {
        const lastUsed = await getLastUsedProvider(String(details.id));
        // If providers expose metadata, reorder to put lastUsed first when present
        // We’ll just pass sourceOrder if we know at least the lastUsed id
        if (lastUsed) sourceOrder = [lastUsed];
      } catch {}

      const nameById = mapNameByIdFromProviders(providers);

      // Run with events for UI
      const output = await providers.runAll({
        media,
        sourceOrder,
        events: {
          init: (evt) => initScrapeEvent(evt, nameById),
          start: (id) => startScrapeEvent(id),
          update: (evt) => updateScrapeEvent(evt),
          discoverEmbeds: (evt) => discoverEmbedsEvent(evt, nameById),
        },
      });

      if (!isMounted) return;

      // Mark last active pending as success for display
      if (output && output.sourceId) {
        setScrapingSources((s) => {
          const copy = { ...s };
          const lastKey = output.sourceId;
          if (copy[lastKey] && copy[lastKey].status === "pending") {
            copy[lastKey].status = "success";
            copy[lastKey].percentage = 100;
          }
          return copy;
        });
      }

      if (!output?.stream) {
        setErrorMessage("No stream found");
        return;
      }

      await setStreamAndUI(output, String(details.id));
      // Hide overlay after a short delay so user can see success state
      setTimeout(() => setShowScrapeOverlay(false), 600);
    } catch (err) {
      console.log("Error fetching show or stream:", err);
      setFailedToStartScrape(true);
      setErrorMessage("Failed to load stream");
    } finally {
      setLoading(false);
    }

    return () => {
      isMounted = false;
    };
  };

  // Auto start when params available
  useEffect(() => {
    if (!autoStarted && id && seasonNumber && episodeNumber) {
      handlePlay(String(id), seasonNumber, episodeNumber);
      setAutoStarted(true);
    }
  }, [id, seasonNumber, episodeNumber, autoStarted]);

  const onRetry = () => {
    setControlsVisible(true);
    if (id && seasonNumber && episodeNumber) {
      handlePlay(String(id), seasonNumber, episodeNumber);
    }
  };

  const switchQuality = (
    label: string,
    url: string | undefined,
    isAuto?: boolean
  ) => {
    if (!url && !isAuto) return;
    const pos = currentTime;
    setSelectedQuality(label);
    if (isAuto) {
      if (masterHlsUrl) {
        setSource(
          streamHeaders
            ? { uri: masterHlsUrl, headers: streamHeaders }
            : masterHlsUrl
        );
      }
    } else if (streamType === "file") {
      setSource({ uri: url!, headers: streamHeaders });
    } else {
      setSource(streamHeaders ? { uri: url!, headers: streamHeaders } : url!);
    }
    setPendingSeek(pos);
  };

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

  // Captions: when selection changes, load and parse
  useEffect(() => {
    const run = async () => {
      if (!selectedCaptionId || selectedCaptionId === "off") {
        setParsedCues([]);
        return;
      }
      const track = captionTracks.find((c) => c.id === selectedCaptionId);
      if (!track || !track.url) {
        setParsedCues([]);
        return;
      }
      try {
        const res = await fetch(
          track.url,
          streamHeaders ? ({ headers: streamHeaders } as any) : undefined
        );
        const text = await res.text();
        const cues = parseSubtitlesAuto(text);
        setParsedCues(cues);
      } catch (e) {
        console.warn("Failed to load caption file:", e);
        setParsedCues([]);
      }
    };
    run();
  }, [selectedCaptionId, captionTracks, JSON.stringify(streamHeaders)]);

  const visibleCues = useMemo(() => {
    if (!parsedCues.length) return [];
    return parsedCues.filter(
      (c) => c.start <= currentTime && c.end >= currentTime
    );
  }, [parsedCues, currentTime]);

  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      <StatusBar hidden />

      <PlayerCore
        player={player}
        title={headerTitle}
        showLoading={showLoadingIndicator}
        visibleSubtitles={visibleCues.map((c, i) => ({
          id: `${i}`,
          content: c.text,
        }))}
        onBack={() => router.back()}
        onToggleFit={() =>
          setContentFit((v) => (v === "contain" ? "cover" : "contain"))
        }
        fitLabel={contentFit === "contain" ? "Fit" : "Fill"}
        onOpenProviders={() => setShowScrapeOverlay(true)}
        onOpenSubtitles={() => setShowSubs(true)}
        onOpenQuality={() => setShowSettings(true)}
        onOpenSpeed={() => setShowSettings(true)}
        rightActions={[
          {
            label: "Next",
            onPress: goToNext,
            disabled: !computeNextEpisode(),
          },
        ]}
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

      <ProvidersOverlay
        visible={showScrapeOverlay}
        onRequestClose={() => setShowScrapeOverlay(false)}
        title="Testing providers…"
        sources={scrapingSources as any}
        order={scrapingOrder as any}
        currentId={currentScrapeId}
        onSelectProvider={() => {}}
      />

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
      />

      <SubtitlesModal
        visible={showSubs}
        onRequestClose={() => setShowSubs(false)}
        tracks={captionTracks.map((c) => ({
          id: c.id,
          display: c.display || c.language,
          url: c.url,
        }))}
        selectedId={selectedCaptionId}
        onSelect={(id) => {
          setSelectedCaptionId(id as any);
          setShowSubs(false);
        }}
        allowAddExternal
        onAddExternal={(url) => {
          const id = `ext-${Date.now()}`;
          const item: CaptionListItem = {
            id,
            language: "External",
            url,
            display: "External",
          };
          setCaptionTracks((prev) => mergeCaptionsAvoidDup([...prev, item]));
          setSelectedCaptionId(id);
        }}
      />

      {/* Error overlay */}
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

// ————— UI bits —————
function ScrapeItemRow(props: {
  name: string;
  status: ScrapingStatus;
  percent: number;
  isCurrent?: boolean;
  small?: boolean;
}) {
  const color =
    props.status === "success"
      ? "#a8ff4a"
      : props.status === "failure" || props.status === "notfound"
        ? "#ff8080"
        : props.status === "pending"
          ? "#ffd166"
          : "#aaa";
  return (
    <View
      style={{
        paddingVertical: props.small ? 6 : 8,
        paddingHorizontal: 8,
        borderRadius: 8,
        backgroundColor: "rgba(255,255,255,0.06)",
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
      }}
    >
      <Text
        style={{ color: color, fontSize: props.small ? 12 : 14 }}
        numberOfLines={1}
      >
        {props.name} {props.isCurrent ? "•" : ""}
      </Text>
      <Text style={{ color: "#ccc", fontSize: props.small ? 12 : 13 }}>
        {props.status} {props.status === "pending" ? `(${props.percent}%)` : ""}
      </Text>
    </View>
  );
}

// ————— Captions helpers —————

function convertProviderCaption(
  captions: RunOutput["stream"]["captions"]
): CaptionListItem[] {
  // Mirrors web convertProviderCaption with a subset of fields
  return captions.map((v) => ({
    id: v.id,
    language: v.language,
    url: v.url,
    type: (v as any).type,
    needsProxy: (v as any).hasCorsRestrictions,
    opensubtitles: (v as any).opensubtitles,
    display: (v as any).display,
    media: (v as any).media,
    isHearingImpaired: (v as any).isHearingImpaired,
    source: (v as any).source,
    encoding: (v as any).encoding,
  }));
}

function mergeCaptionsAvoidDup(caps: CaptionListItem[]): CaptionListItem[] {
  const seen = new Set<string>();
  const out: CaptionListItem[] = [];
  for (const c of caps) {
    const key = `${c.language}|${c.url}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
}

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
            ? `${Math.round(bandwidth / 1000)}k`
            : `variant-${out.length + 1}`;
        out.push({ label, url, height, bandwidth });
      }
    }
  }
  return out;
}

function parseHlsSubtitles(
  playlistText: string,
  masterUrl: string
): CaptionListItem[] {
  // Parse EXT-X-MEDIA:TYPE=SUBTITLES with URI + NAME + LANGUAGE
  const lines = playlistText.split(/\r?\n/);
  const out: CaptionListItem[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("#EXT-X-MEDIA")) continue;
    if (!trimmed.includes("TYPE=SUBTITLES")) continue;
    const attrs = parseAttributeList(trimmed.substring("#EXT-X-MEDIA:".length));
    const uri = attrs["URI"] ? stripQuotes(attrs["URI"]) : undefined;
    if (!uri) continue;
    const url = resolveUrl(uri, masterUrl);
    const name = attrs["NAME"] ? stripQuotes(attrs["NAME"]) : undefined;
    const lang = attrs["LANGUAGE"]
      ? stripQuotes(attrs["LANGUAGE"])
      : name || "sub";
    const id = `hls-${lang}-${name || uri}`;
    out.push({
      id,
      language: lang,
      display: name || lang,
      url,
      hls: true,
    });
  }
  return out;
}

function stripQuotes(s: string) {
  return s.replace(/^\"|\"$/g, "");
}

function parseAttributeList(s: string): Record<string, string> {
  const out: Record<string, string> = {};
  const parts = s.match(/(?:[^,\"]+|\"[^\"]*\")+/g) || [];
  for (const p of parts) {
    const [k, v] = p.split("=");
    if (!k || v == null) continue;
    out[k.trim().toUpperCase()] = v.trim();
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

// Minimal subtitle parsing (VTT + SRT)
function parseSubtitlesAuto(text: string): Cue[] {
  const t = text.trim();
  if (t.startsWith("WEBVTT")) return parseVtt(t);
  // If looks like SRT (timestamps with comma)
  if (
    /-->\s*\d{2}:\d{2}:\d{2},\d{3}/.test(t) ||
    /\d{2}:\d{2}:\d{2},\d{3}\s+-->/.test(t)
  ) {
    return parseSrt(t);
  }
  // Try VTT anyway
  return parseVtt(t);
}

function parseVtt(text: string): Cue[] {
  const lines = text.replace(/\r/g, "").split("\n");
  const cues: Cue[] = [];
  let i = 0;
  // Skip header
  if (lines[i]?.startsWith("WEBVTT")) {
    while (i < lines.length && lines[i].trim() !== "") i++;
    i++;
  }
  while (i < lines.length) {
    // optional cue id
    if (lines[i].trim() === "") {
      i++;
      continue;
    }
    if (!lines[i].includes("-->")) {
      // skip stray lines until a cue timing
      i++;
      continue;
    }
    const timing = lines[i++].trim();
    const [startS, endS] = timing.split("-->").map((s) => s.trim());
    const start = parseTimeToSecondsVtt(startS);
    const end = parseTimeToSecondsVtt(endS);
    const textLines: string[] = [];
    while (i < lines.length && lines[i].trim() !== "") {
      textLines.push(lines[i++]);
    }
    i++;
    cues.push({ start, end, text: textLines.join("\n") });
  }
  return cues;
}

function parseSrt(text: string): Cue[] {
  const blocks = text.replace(/\r/g, "").split(/\n\s*\n/);
  const cues: Cue[] = [];
  for (const block of blocks) {
    const lines = block.split("\n").map((l) => l.trim());
    if (lines.length < 2) continue;
    let idx = 0;
    if (/^\d+$/.test(lines[idx])) idx++;
    if (!lines[idx] || !lines[idx].includes("-->")) continue;
    const [startS, endS] = lines[idx++].split("-->").map((s) => s.trim());
    const start = parseTimeToSecondsSrt(startS);
    const end = parseTimeToSecondsSrt(endS);
    const textLines = lines.slice(idx);
    cues.push({ start, end, text: textLines.join("\n") });
  }
  return cues;
}

function parseTimeToSecondsVtt(s: string): number {
  // 00:00:10.500 or 00:10.500
  const parts = s.split(/:|\./);
  const nums = parts.map((p) => parseInt(p, 10));
  if (s.includes(":") && s.split(":").length === 3) {
    const [h, m, rest] = s.split(":");
    const ss = rest.split(".")[0] || "0";
    const ms = rest.split(".")[1] || "0";
    return (
      parseInt(h, 10) * 3600 +
      parseInt(m, 10) * 60 +
      parseInt(ss, 10) +
      parseInt(ms, 10) / 1000
    );
  } else {
    const [m, rest] = s.split(":");
    const ss = rest.split(".")[0] || "0";
    const ms = rest.split(".")[1] || "0";
    return parseInt(m, 10) * 60 + parseInt(ss, 10) + parseInt(ms, 10) / 1000;
  }
}

function parseTimeToSecondsSrt(s: string): number {
  // 00:00:10,500
  const [hms, msStr] = s.split(",");
  const [h, m, sec] = hms.split(":").map((x) => parseInt(x, 10));
  const ms = parseInt(msStr || "0", 10);
  return h * 3600 + m * 60 + sec + ms / 1000;
}
