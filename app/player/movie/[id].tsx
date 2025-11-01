import { fetchMovieDetails, MovieDetails } from "@/lib/tmdb";
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
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  GestureResponderEvent,
  LayoutChangeEvent,
  Modal,
  Pressable,
  Text,
  View,
} from "react-native";

export default function VideoScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  type PlayerSource =
    | string
    | { uri: string; headers?: Record<string, string> };
  const [source, setSource] = useState<PlayerSource>("");
  const [movie, setMovie] = useState<MovieDetails | null>(null);
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

  // UI state (always visible controls)
  const [showSettings, setShowSettings] = useState(false);
  const [contentFit, setContentFit] = useState<"cover" | "contain">("cover");
  const [pendingSeek, setPendingSeek] = useState<number | undefined>();
  const [controlsVisible, setControlsVisible] = useState(true);

  // recreate the player when source changes so it picks up the new URI
  const player = useVideoPlayer(source, (player) => {
    player.loop = true;
    player.play();
  });

  const { isPlaying } = useEvent(player, "playingChange", {
    isPlaying: player.playing,
  });

  // Track player status to know if buffering/loading
  const { status } = useEvent(player, "statusChange", {
    // @ts-ignore - status property provided by expo-video
    status: (player as any)?.status,
  }) as { status?: string };
  const isBuffering = status === "loading";

  const [stream, setStream] = useState<
    HlsBasedStream | FileBasedStream | undefined
  >(undefined);

  // Force landscape while on this screen; restore on exit
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

  // Simple ticker to keep current time/duration updated
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  useEffect(() => {
    const t = setInterval(() => {
      try {
        // @ts-ignore properties provided by expo-video player
        setCurrentTime(player.currentTime ?? 0);
        // @ts-ignore
        setDuration(player.duration ?? 0);
      } catch {}
    }, 250);
    return () => clearInterval(t);
  }, [player]);

  // Trigger fetching movie details + stream when user presses Play
  const handlePlay = async () => {
    if (!id) {
      console.log("No id param provided to player");
      return;
    }

    let isMounted = true;
    try {
      setLoading(true);

      // fetch movie details from TMDB
      console.log("Fetching movie details for id:", id);
      const details = await fetchMovieDetails(id);
      if (!isMounted) return;
      setMovie(details);
      console.log("Movie details:", details);

      // prepare providers
      const providers = makeProviders({
        fetcher: makeStandardFetcher(fetch),
        target: targets.NATIVE,
        consistentIpForRequests: true,
      });

      const media: ScrapeMedia = {
        type: "movie",
        title: details.title,
        // ScrapeMedia.releaseYear expects a number; default to 0 when unknown
        releaseYear: details.release_date
          ? Number(details.release_date.slice(0, 4))
          : 0,
        tmdbId: String(details.id),
      };

      console.log("Running providers for media:", media);
      const output = await providers.runAll({ media });
      console.log("Providers output:", output);

      if (!isMounted) return;
      setStream(output?.stream);
      console.log("Selected stream:", output?.stream);

      if (!output?.stream) return;

      if ((output.stream as HlsBasedStream).type === "hls") {
        setStreamType("hls");
        const playlist = (output.stream as HlsBasedStream).playlist;
        console.log("HLS master playlist:", playlist);
        // set master first so playback can start quickly
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
            console.log("Switching to best HLS variant:", best);
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
          .filter((q) => !!q.url);
        setMp4Qualities(items);
        if (items.length > 0) {
          setSelectedQuality(items[0].label);
          console.log("Using best MP4 quality:", items[0]);
          setSource({
            uri: items[0].url,
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
      console.log("Error fetching movie or stream:", err);
    } finally {
      setLoading(false);
    }
    return () => {
      isMounted = false;
    };
  };

  // Auto-start fetching/playing when navigated to this screen
  useEffect(() => {
    if (!autoStarted && id) {
      handlePlay();
      setAutoStarted(true);
    }
  }, [id, autoStarted]);

  // helper: pretty time
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
      // absolute seek
      // @ts-ignore expo-video exposes a setter for currentTime
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

  // after switching source, restore position and resume
  useEffect(() => {
    if (pendingSeek == null) return;
    const t = setTimeout(() => {
      try {
        // @ts-ignore
        player.currentTime = pendingSeek;
        player.play();
      } catch {}
      setPendingSeek(undefined);
    }, 500);
    return () => clearTimeout(t);
  }, [source]);

  return (
    <View className="flex-1 ">
      <StatusBar hidden={true} />
      <View className="flex-1">
        <VideoView
          className="w-full h-full"
          style={{ width: "100%", height: "100%" }}
          player={player}
          nativeControls={false}
          pointerEvents="none"
          contentFit={contentFit}
          fullscreenOptions={{ enable: true, orientation: "landscape" }}
          allowsPictureInPicture
        />

        {/* Overlay controls - always visible */}
        {controlsVisible ? (
          <Pressable
            onPress={() => setControlsVisible(false)}
            className="absolute inset-0 justify-between"
          >
            {/* Top bar */}
            <View className="w-full px-3 pt-3 pb-2  flex-row items-center justify-between">
              <View className="flex-row items-center gap-x-3">
                <Pressable
                  onPress={() => router.back()}
                  hitSlop={10}
                  className="p-2 rounded-full "
                >
                  <MaterialCommunityIcons
                    name="arrow-left"
                    size={22}
                    color="#fff"
                  />
                </Pressable>
                {!!movie?.title && (
                  <Text className="text-white text-sm" numberOfLines={1}>
                    {movie.title}
                  </Text>
                )}
              </View>
            </View>

            {/* Center play/pause */}
            <View className="flex-1 items-center justify-center">
              <Pressable
                onPress={() => {
                  try {
                    if (isPlaying) player.pause();
                    else player.play();
                  } catch {}
                }}
                className="p-4 rounded-full  items-center justify-center"
                disabled={false}
                style={{ elevation: 6 }}
              >
                {isBuffering || loading ? (
                  <ActivityIndicator size="large" color="#ffffff" />
                ) : (
                  <MaterialCommunityIcons
                    name={isPlaying ? "pause-circle" : "play-circle"}
                    size={48}
                    color="#fff"
                  />
                )}
              </Pressable>
            </View>

            {/* Bottom bar */}
            <View className="w-full px-3 pb-3 pt-2 bg-black/40">
              {/* Time + seekbar */}
              <View className="flex-row items-center gap-x-2">
                <Text className="text-white text-xs w-12 text-right">
                  {fmt(currentTime)}
                </Text>
                <View className="flex-1">
                  <SeekBar
                    value={currentTime}
                    duration={duration}
                    onSeek={(t) => onSeek(t)}
                  />
                </View>
                <Text className="text-white text-xs w-12">{fmt(duration)}</Text>
              </View>

              {/* Actions row */}
              <View className="mt-2 flex-row items-center justify-between">
                <View className="flex-row items-center gap-x-2">
                  <Pressable
                    onPress={() => {
                      setContentFit((v) =>
                        v === "contain" ? "cover" : "contain"
                      );
                    }}
                    className="px-2 py-1 rounded bg-black/40"
                  >
                    <Text className="text-white text-xs">
                      {contentFit === "contain" ? "Fit" : "Fill"}
                    </Text>
                  </Pressable>
                  {selectedQuality && (
                    <View className="px-2 py-1 rounded bg-black/40">
                      <Text className="text-white text-xs">
                        {selectedQuality}
                      </Text>
                    </View>
                  )}
                </View>
                <View className="flex-row items-center gap-x-2">
                  <Pressable
                    onPress={() => {
                      setShowSettings(true);
                    }}
                    className="p-2 rounded-full bg-black/40"
                  >
                    <MaterialCommunityIcons name="cog" size={20} color="#fff" />
                  </Pressable>
                </View>
              </View>
            </View>
          </Pressable>
        ) : (
          <Pressable
            onPress={() => setControlsVisible(true)}
            className="absolute inset-0"
            accessibilityLabel="Show controls"
          />
        )}
      </View>

      {/* Settings modal for quality */}
      <Modal
        visible={showSettings}
        transparent
        animationType="fade"
        onRequestClose={() => setShowSettings(false)}
      >
        <Pressable
          className="flex-1 bg-black/60"
          onPress={() => setShowSettings(false)}
        >
          <View className="absolute right-4 top-14 bg-neutral-900 rounded-xl p-2 w-44">
            <Text className="text-white text-sm font-semibold px-2 py-1">
              Quality
            </Text>
            {streamType === "hls" && (
              <>
                <Pressable
                  onPress={() => {
                    setShowSettings(false);
                    switchQuality("Auto", undefined, true);
                  }}
                  className="flex-row items-center justify-between px-3 py-2"
                >
                  <Text className="text-white">Auto</Text>
                  {selectedQuality === "Auto" && (
                    <MaterialCommunityIcons
                      name="check"
                      size={18}
                      color="#fff"
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
                    className="flex-row items-center justify-between px-3 py-2"
                  >
                    <Text className="text-white">{v.label}</Text>
                    {selectedQuality === v.label && (
                      <MaterialCommunityIcons
                        name="check"
                        size={18}
                        color="#fff"
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
                  className="flex-row items-center justify-between px-3 py-2"
                >
                  <Text className="text-white">{q.label}</Text>
                  {selectedQuality === q.label && (
                    <MaterialCommunityIcons
                      name="check"
                      size={18}
                      color="#fff"
                    />
                  )}
                </Pressable>
              ))}
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

// --- helpers ---
type SeekBarProps = {
  value: number;
  duration: number;
  onSeek: (time: number) => void;
  onScrubStart?: () => void;
  onScrubEnd?: () => void;
};

function SeekBar({
  value,
  duration,
  onSeek,
  onScrubStart,
  onScrubEnd,
}: SeekBarProps) {
  const [width, setWidth] = useState(0);
  const [seeking, setSeeking] = useState(false);
  const [seekTime, setSeekTime] = useState(0);

  const clamp = (n: number, min: number, max: number) =>
    Math.max(min, Math.min(max, n));

  const fraction = duration > 0 ? (seeking ? seekTime : value) / duration : 0;
  const playedPct = clamp(fraction, 0, 1) * 100;

  const onLayout = (e: LayoutChangeEvent) =>
    setWidth(e.nativeEvent.layout.width);

  const calcTime = (x: number) => {
    if (width <= 0 || duration <= 0) return 0;
    const ratio = clamp(x / width, 0, 1);
    return ratio * duration;
  };

  const onGrant = (e: GestureResponderEvent) => {
    setSeeking(true);
    onScrubStart?.();
    const x = e.nativeEvent.locationX;
    const t = calcTime(x);
    setSeekTime(t);
  };
  const onMove = (e: GestureResponderEvent) => {
    if (!seeking) return;
    const x = e.nativeEvent.locationX;
    const t = calcTime(x);
    setSeekTime(t);
  };
  const onRelease = () => {
    if (seeking) {
      onSeek(seekTime);
      onScrubEnd?.();
    }
    setSeeking(false);
  };

  return (
    <View
      onLayout={onLayout}
      // @ts-ignore: responder props exist on View
      onStartShouldSetResponder={() => true}
      // @ts-ignore
      onMoveShouldSetResponder={() => true}
      // @ts-ignore
      onResponderGrant={onGrant}
      // @ts-ignore
      onResponderMove={onMove}
      // @ts-ignore
      onResponderRelease={onRelease}
      className="h-4 justify-center"
    >
      <View className="h-1.5 rounded-full bg-white/20 overflow-hidden">
        <View style={{ width: `${playedPct}%` }} className="h-full bg-white" />
      </View>
      {/* knob */}
      <View
        style={{ left: `${playedPct}%`, transform: [{ translateX: -6 }] }}
        className="w-3 h-3 rounded-full bg-white absolute"
      />
    </View>
  );
}

function parseHlsVariants(
  text: string,
  baseUrl: string
): Array<{ label: string; url: string; height?: number; bandwidth?: number }> {
  const lines = text.split(/\r?\n/);
  const out: Array<{
    label: string;
    url: string;
    height?: number;
    bandwidth?: number;
  }> = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith("#EXT-X-STREAM-INF")) {
      const attrs = parseAttributeList(
        line.substring("#EXT-X-STREAM-INF:".length)
      );
      const next = lines[i + 1]?.trim();
      if (next && !next.startsWith("#")) {
        const url = resolveUrl(next, baseUrl);
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
