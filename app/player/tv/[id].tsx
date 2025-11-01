import {
  fetchSeasonDetails,
  fetchTVShowDetails,
  SeasonDetails,
  TVShowDetails,
} from "@/lib/tmdb";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import {
  FileBasedStream,
  HlsBasedStream,
  makeProviders,
  makeStandardFetcher,
  ScrapeMedia,
  targets,
} from "@p-stream/providers";
import { useEvent } from "expo";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as ScreenOrientation from "expo-screen-orientation";
import { StatusBar } from "expo-status-bar";
import { useVideoPlayer, VideoView } from "expo-video";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Easing,
  Modal,
  Pressable,
  Text,
  View,
} from "react-native";
import { Slider } from "react-native-awesome-slider";
import { useSharedValue } from "react-native-reanimated";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

type PlayerSource = string | { uri: string; headers?: Record<string, string> };

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

  const [stream, setStream] = useState<
    HlsBasedStream | FileBasedStream | undefined
  >(undefined);

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

  // Fetch show + season data and play
  const handlePlay = async (tvId: string, sNumber: number, eNumber: number) => {
    let isMounted = true;
    try {
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

      const details = await fetchTVShowDetails(tvId);
      if (!isMounted) return;
      setTv(details);

      const seasonDet = await fetchSeasonDetails(tvId, sNumber);
      if (!isMounted) return;
      setSeasonDetails(seasonDet);

      // Resolve current episode
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
        episode: {
          number: ep.episode_number,
          tmdbId: String(ep.id),
        },
        season: {
          number: seasonDet.season_number,
          tmdbId: String(seasonDet.id),
          title: seasonDet.name,
          episodeCount: seasonDet.episodes?.length || undefined,
        },
      };

      const output = await providers.runAll({ media });

      if (!isMounted) return;
      setStream(output?.stream);

      if (!output?.stream) {
        setErrorMessage("No stream found");
        return;
      }

      if ((output.stream as HlsBasedStream).type === "hls") {
        setStreamType("hls");
        const playlist = (output.stream as HlsBasedStream).playlist;
        setMasterHlsUrl(playlist);
        setSource(playlist);

        try {
          const res = await fetch(playlist);
          const text = await res.text();
          const variants = parseHlsVariants(text, playlist);
          setHlsVariants(variants);
          if (variants.length > 0) {
            const best = [...variants].sort(
              (a, b) =>
                (b.height ?? 0) - (a.height ?? 0) ||
                (b.bandwidth ?? 0) - (a.bandwidth ?? 0)
            )[0];
            setSelectedQuality(best.label);
            setSource(best.url);
          }
        } catch (e) {
          console.log("Failed to parse HLS variants; staying on master:", e);
        }
      } else if ((output.stream as any).type === "file") {
        setStreamType("file");
        setStreamHeaders((output.stream as any).headers);
        const qualitiesMap = (output.stream as any).qualities || {};
        const numericKeys = Object.keys(qualitiesMap)
          .map((k) => parseInt(k, 10))
          .filter((n) => !Number.isNaN(n))
          .sort((a, b) => b - a);
        const items = numericKeys
          .map((k) => ({ label: `${k}p`, url: qualitiesMap[String(k)]?.url }))
          .filter((q) => !!q.url) as Array<{ label: string; url: string }>;
        setMp4Qualities(items);
        if (items.length > 0) {
          setSelectedQuality(items[0].label);
          setSource({
            uri: items[0].url!,
            headers: (output.stream as any).headers,
          });
        } else if ((output.stream as any).url) {
          setSelectedQuality(undefined);
          setSource({
            uri: (output.stream as any).url,
            headers: (output.stream as any).headers,
          });
        }
      }
    } catch (err) {
      console.log("Error fetching show or stream:", err);
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

  useEffect(() => {
    if (source) setHasStarted(false);
  }, [source]);

  const onSeek = (pos: number) => {
    try {
      player.currentTime = pos;
    } catch {}
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
      if (masterHlsUrl) setSource(masterHlsUrl);
    } else if (streamType === "file") {
      setSource({ uri: url!, headers: streamHeaders });
    } else {
      setSource(url!);
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

  const onRetry = () => {
    setControlsVisible(true);
    if (id && seasonNumber && episodeNumber) {
      handlePlay(String(id), seasonNumber, episodeNumber);
    }
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

  // Compute next episode (within season or next season)
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
    // Next season
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
    // Update route so deep links reflect position
    router.replace({
      pathname: "/player/tv/[id]",
      params: {
        id: String(id),
        season: String(next.season),
        episode: String(next.episode),
      },
    });
    // Also trigger playback immediately (router.replace is async visually)
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

  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      <StatusBar hidden />
      <View style={{ flex: 1 }}>
        <VideoView
          style={{ width: "100%", height: "100%" }}
          player={player}
          nativeControls={false}
          pointerEvents="none"
          contentFit={contentFit}
          fullscreenOptions={{ enable: true, orientation: "landscape" }}
          allowsPictureInPicture
        />

        <Pressable
          onPress={() => setControlsVisible((s) => !s)}
          style={{ position: "absolute", inset: 0 }}
          accessibilityLabel="Video background"
        >
          <Animated.View
            style={{
              opacity: controlsFade,
              position: "absolute",
              inset: 0,
              justifyContent: "space-between",
            }}
          >
            <View
              style={{
                width: "100%",
                paddingHorizontal: 16,
                paddingTop: 12,
                paddingBottom: 8,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 12 }}
              >
                <Pressable
                  onPress={() => router.back()}
                  hitSlop={10}
                  style={{ padding: 8, borderRadius: 999 }}
                >
                  <MaterialCommunityIcons
                    name="arrow-left"
                    size={22}
                    color="#fff"
                  />
                </Pressable>
                {!!headerTitle && (
                  <Text
                    style={{ color: "#fff", fontSize: 16, maxWidth: "70%" }}
                    numberOfLines={1}
                  >
                    {headerTitle}
                  </Text>
                )}
              </View>

              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
              >
                {/* Next episode button */}
                <Pressable
                  onPress={goToNext}
                  disabled={!computeNextEpisode()}
                  style={{
                    paddingVertical: 8,
                    paddingHorizontal: 12,
                    borderRadius: 8,
                    backgroundColor: computeNextEpisode()
                      ? "rgba(255,255,255,0.12)"
                      : "rgba(255,255,255,0.05)",
                  }}
                >
                  <Text style={{ color: "#fff", fontSize: 12 }}>Next</Text>
                </Pressable>

                <Pressable
                  onPress={() =>
                    setContentFit((v) =>
                      v === "contain" ? "cover" : "contain"
                    )
                  }
                  style={{
                    padding: 8,
                    borderRadius: 8,
                    backgroundColor: "rgba(255,255,255,0.05)",
                  }}
                >
                  <Text style={{ color: "#fff", fontSize: 12 }}>
                    {contentFit === "contain" ? "Fit" : "Fill"}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => setShowSettings(true)}
                  style={{
                    padding: 8,
                    borderRadius: 8,
                    backgroundColor: "rgba(255,255,255,0.05)",
                  }}
                >
                  <Text style={{ color: "#fff", fontSize: 12 }}>
                    {qualityLabel}
                  </Text>
                </Pressable>
              </View>
            </View>

            <View
              style={{
                flex: 1,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <View
                style={{
                  width: "100%",
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-around",
                }}
              >
                <Pressable
                  onPress={() => {
                    try {
                      player.currentTime = Math.max(
                        0,
                        (player.currentTime ?? 0) - 10
                      );
                    } catch {}
                  }}
                  style={{
                    width: 80,
                    height: 80,
                    borderRadius: 40,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <MaterialCommunityIcons
                    name="rotate-left"
                    size={34}
                    color="#fff"
                  />
                </Pressable>

                <Pressable
                  onPress={() => {
                    try {
                      if (isPlaying) player.pause();
                      else player.play();
                    } catch {}
                  }}
                >
                  {loading || isBuffering || (!hasStarted && !!source) ? (
                    <ActivityIndicator size="large" color="#fff" />
                  ) : (
                    <MaterialCommunityIcons
                      name={isPlaying ? "pause" : "play"}
                      size={38}
                      color="#fff"
                    />
                  )}
                </Pressable>

                <Pressable
                  onPress={() => {
                    try {
                      player.currentTime = Math.min(
                        player.duration ?? 0,
                        (player.currentTime ?? 0) + 10
                      );
                    } catch {}
                  }}
                  style={{
                    width: 80,
                    height: 80,
                    borderRadius: 40,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <MaterialCommunityIcons
                    name="rotate-right"
                    size={34}
                    color="#fff"
                  />
                </Pressable>
              </View>
            </View>

            <View
              style={{
                width: "100%",
                paddingHorizontal: 16,
                paddingBottom: 18,
                paddingTop: 12,
                backgroundColor: "rgba(0,0,0,0.25)",
              }}
            >
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
              >
                <Text
                  style={{
                    color: "#fff",
                    fontSize: 12,
                    width: 48,
                    textAlign: "left",
                  }}
                >
                  {fmt(currentTime)}
                </Text>

                <View style={{ flex: 1 }}>
                  <Slider
                    style={{ width: "100%", height: 30 }}
                    progress={progress}
                    minimumValue={min}
                    maximumValue={max}
                    onSlidingStart={() => setControlsVisible(true)}
                    onValueChange={(val: number) => {
                      const t = (val / 100) * duration;
                      onSeek(t);
                    }}
                    onSlidingComplete={(val: number) => {
                      const t = (val / 100) * duration;
                      onSeek(t);
                    }}
                    bubble={(val: number) => fmt((val / 100) * duration)}
                    bubbleTextStyle={{
                      color: "black",
                      fontSize: 12,
                      fontWeight: "700",
                    }}
                    theme={{
                      minimumTrackTintColor: "#ffffff",
                      maximumTrackTintColor: "rgba(255,255,255,0.22)",
                      bubbleBackgroundColor: "#ffffff",
                      cacheTrackTintColor: "rgba(255,255,255,0.12)",
                    }}
                  />
                </View>

                <Text
                  style={{
                    color: "#fff",
                    fontSize: 12,
                    width: 48,
                    textAlign: "right",
                  }}
                >
                  {fmt(duration)}
                </Text>
              </View>
            </View>
          </Animated.View>
        </Pressable>
      </View>

      <Modal
        visible={showSettings}
        transparent
        animationType="fade"
        onRequestClose={() => setShowSettings(false)}
      >
        <Pressable
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.6)",
            alignItems: "center",
            justifyContent: "center",
          }}
          onPress={() => setShowSettings(false)}
        >
          <View
            style={{
              width: SCREEN_WIDTH - 120,
              backgroundColor: "#111",
              borderRadius: 12,
              paddingVertical: 14,
              paddingHorizontal: 12,
            }}
          >
            <Text
              style={{
                color: "#fff",
                fontSize: 16,
                fontWeight: "700",
                marginBottom: 10,
                alignSelf: "center",
              }}
            >
              Quality
            </Text>

            {streamType === "hls" && (
              <>
                <Pressable
                  onPress={() => {
                    setShowSettings(false);
                    switchQuality("Auto", undefined, true);
                  }}
                  style={{
                    paddingVertical: 10,
                    paddingHorizontal: 8,
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <Text
                    style={{
                      color: selectedQuality === undefined ? "#a8ff4a" : "#fff",
                      fontSize: 15,
                    }}
                  >
                    Auto
                  </Text>
                  {selectedQuality === undefined && (
                    <MaterialCommunityIcons
                      name="check"
                      size={18}
                      color="#a8ff4a"
                    />
                  )}
                </Pressable>
                {hlsVariants.map((v) => (
                  <Pressable
                    key={v.label}
                    onPress={() => {
                      setShowSettings(false);
                      switchQuality(v.label, v.url);
                    }}
                    style={{
                      paddingVertical: 10,
                      paddingHorizontal: 8,
                      flexDirection: "row",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <Text
                      style={{
                        color: selectedQuality === v.label ? "#a8ff4a" : "#fff",
                        fontSize: 15,
                      }}
                    >
                      {v.label}
                    </Text>
                    {selectedQuality === v.label && (
                      <MaterialCommunityIcons
                        name="check"
                        size={18}
                        color="#a8ff4a"
                      />
                    )}
                  </Pressable>
                ))}
              </>
            )}

            {streamType === "file" &&
              mp4Qualities.map((q) => (
                <Pressable
                  key={q.label}
                  onPress={() => {
                    setShowSettings(false);
                    switchQuality(q.label, q.url);
                  }}
                  style={{
                    paddingVertical: 10,
                    paddingHorizontal: 8,
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <Text
                    style={{
                      color: selectedQuality === q.label ? "#a8ff4a" : "#fff",
                      fontSize: 15,
                    }}
                  >
                    {q.label}
                  </Text>
                  {selectedQuality === q.label && (
                    <MaterialCommunityIcons
                      name="check"
                      size={18}
                      color="#a8ff4a"
                    />
                  )}
                </Pressable>
              ))}

            <View style={{ marginTop: 10, alignItems: "center" }}>
              <Pressable
                onPress={() => setShowSettings(false)}
                style={{
                  paddingHorizontal: 18,
                  paddingVertical: 8,
                  borderRadius: 20,
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.08)",
                }}
              >
                <Text style={{ color: "#fff" }}>Close</Text>
              </Pressable>
            </View>
          </View>
        </Pressable>
      </Modal>

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

function parseAttributeList(s: string): Record<string, string> {
  const out: Record<string, string> = {};
  const parts = s.match(/(?:[^,\"]+|\"[^\"]*\")+/g) || [];
  for (const p of parts) {
    const [k, v] = p.split("=");
    if (!k || v == null) continue;
    out[k.trim().toUpperCase()] = v.replace(/^\"|\"$/g, "").trim();
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
