import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import Slider from "@react-native-community/slider";
import { useEvent } from "expo";
import { StatusBar } from "expo-status-bar";
import { VideoView } from "expo-video";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Easing,
  GestureResponderEvent,
  Pressable,
  Text,
  View,
} from "react-native";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

export type PlayerHandle = ReturnType<typeof useVideoPlayerDummy>;

// Workaround type helper: we only need the shape used by consumers (playing, play, pause, duration/currentTime)
function useVideoPlayerDummy(_: any) {
  return {} as any;
}

export type PlayerCoreProps = {
  // expo-video player instance created by the screen with useVideoPlayer(source)
  player: any;
  // Media title to display in top bar
  title?: string;
  // Is initial data still loading (scraping, network)?
  showLoading?: boolean;
  // Subtitles currently visible (already filtered for current time)
  visibleSubtitles?: Array<{ id?: string; content: string }>;
  // Controls
  onBack?: () => void;
  onToggleFit?: () => void;
  fitLabel?: string; // "Fit"/"Fill"
  onOpenProviders?: () => void;
  onOpenSubtitles?: () => void;
  onOpenQuality?: () => void;
  onOpenSpeed?: () => void;
  rightActions?: Array<{
    label: string;
    onPress: () => void;
    disabled?: boolean;
  }>;
  // Time/seek
  currentTime: number;
  duration: number;
  onSeek: (time: number) => void;
  // Play state
  isBuffering?: boolean;
  onTogglePlayPause: () => void;
};

export default function PlayerCore(props: PlayerCoreProps) {
  const {
    player,
    title,
    showLoading,
    visibleSubtitles,
    onBack,
    onToggleFit,
    fitLabel,
    onOpenProviders,
    onOpenSubtitles,
    onOpenQuality,
    onOpenSpeed,
    rightActions,
    currentTime,
    duration,
    onSeek,
    isBuffering,
    onTogglePlayPause,
  } = props;

  const { isPlaying } = useEvent(player, "playingChange", {
    isPlaying: player?.playing,
  });

  // Controls visibility with auto-hide
  const [controlsVisible, setControlsVisible] = useState(true);
  const controlsFade = useRef(new Animated.Value(1)).current;
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleHide = () => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setControlsVisible(false), 2500);
  };

  useEffect(() => {
    Animated.timing(controlsFade, {
      toValue: controlsVisible ? 1 : 0,
      duration: 200,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
    if (controlsVisible) scheduleHide();
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [controlsVisible]);

  // Double-tap seek gesture
  const lastTap = useRef(0);
  const onBackgroundPress = (e?: GestureResponderEvent) => {
    const now = Date.now();
    const TAP_DELAY = 300;
    if (now - lastTap.current < TAP_DELAY) {
      const x = e?.nativeEvent.locationX ?? 0;
      const isRight = x > SCREEN_WIDTH * 0.5;
      try {
        const pos = player?.currentTime ?? 0;
        const dur = player?.duration ?? 0;
        const target = isRight
          ? Math.min(dur, pos + 10)
          : Math.max(0, pos - 10);
        onSeek(target);
      } catch {}
    } else {
      setControlsVisible((s) => !s);
      if (!controlsVisible) scheduleHide();
    }
    lastTap.current = now;
  };

  // Formatting helper
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

  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      <StatusBar hidden />

      <View style={{ flex: 1 }}>
        <VideoView
          style={{ width: "100%", height: "100%" }}
          player={player}
          nativeControls={false}
          pointerEvents="none"
          contentFit="cover"
          fullscreenOptions={{ enable: true, orientation: "landscape" }}
          allowsPictureInPicture
        />

        {/* Loading indicator independent from controls */}
        {(showLoading || isBuffering) && (
          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              inset: 0,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <ActivityIndicator size="large" color="#fff" />
          </View>
        )}

        {/* Subtitles overlay */}
        {!!visibleSubtitles?.length && (
          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              left: 20,
              right: 20,
              bottom: controlsVisible ? 96 : 60,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {visibleSubtitles!.map((cue, i) => (
              <Text
                key={`${cue.id || i}-${i}`}
                style={{
                  color: "#fff",
                  fontSize: 18,
                  textAlign: "center",
                  lineHeight: 24,
                  textShadowColor: "rgba(0,0,0,0.9)",
                  textShadowOffset: { width: 0, height: 0 },
                  textShadowRadius: 4,
                  backgroundColor: "rgba(0,0,0,0.35)",
                  paddingHorizontal: 8,
                  paddingVertical: 4,
                  borderRadius: 6,
                  marginBottom: 6,
                }}
              >
                {cue.content}
              </Text>
            ))}
          </View>
        )}

        {/* Touch overlay + new controls */}
        <Pressable
          onPress={onBackgroundPress}
          style={{ position: "absolute", inset: 0 }}
          accessibilityLabel="Video background"
        >
          <Animated.View
            pointerEvents={controlsVisible ? "auto" : "none"}
            style={{
              opacity: controlsFade,
              position: "absolute",
              inset: 0,
              justifyContent: "space-between",
            }}
          >
            {/* Top bar */}
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
                  onPress={onBack}
                  hitSlop={10}
                  style={{ padding: 8, borderRadius: 999 }}
                >
                  <MaterialCommunityIcons
                    name="arrow-left"
                    size={22}
                    color="#fff"
                  />
                </Pressable>
                {!!title && (
                  <Text
                    style={{ color: "#fff", fontSize: 16, maxWidth: "60%" }}
                    numberOfLines={1}
                  >
                    {title}
                  </Text>
                )}
              </View>

              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
              >
                {rightActions?.map((btn, idx) => (
                  <Pressable
                    key={`act-${idx}`}
                    onPress={btn.onPress}
                    disabled={btn.disabled}
                    style={{
                      padding: 8,
                      borderRadius: 8,
                      backgroundColor: btn.disabled
                        ? "rgba(255,255,255,0.05)"
                        : "rgba(255,255,255,0.08)",
                      opacity: btn.disabled ? 0.6 : 1,
                    }}
                  >
                    <Text style={{ color: "#fff", fontSize: 12 }}>
                      {btn.label}
                    </Text>
                  </Pressable>
                ))}
                {!!onOpenProviders && (
                  <Pressable
                    onPress={onOpenProviders}
                    style={{
                      padding: 8,
                      borderRadius: 8,
                      backgroundColor: "rgba(255,255,255,0.08)",
                    }}
                  >
                    <Text style={{ color: "#fff", fontSize: 12 }}>
                      Providers
                    </Text>
                  </Pressable>
                )}
                {!!onOpenSubtitles && (
                  <Pressable
                    onPress={onOpenSubtitles}
                    style={{
                      padding: 8,
                      borderRadius: 8,
                      backgroundColor: "rgba(255,255,255,0.08)",
                    }}
                  >
                    <Text style={{ color: "#fff", fontSize: 12 }}>
                      Subtitles
                    </Text>
                  </Pressable>
                )}
                {!!onOpenQuality && (
                  <Pressable
                    onPress={onOpenQuality}
                    style={{
                      padding: 8,
                      borderRadius: 8,
                      backgroundColor: "rgba(255,255,255,0.08)",
                    }}
                  >
                    <Text style={{ color: "#fff", fontSize: 12 }}>Quality</Text>
                  </Pressable>
                )}
                {!!onOpenSpeed && (
                  <Pressable
                    onPress={onOpenSpeed}
                    style={{
                      padding: 8,
                      borderRadius: 8,
                      backgroundColor: "rgba(255,255,255,0.08)",
                    }}
                  >
                    <Text style={{ color: "#fff", fontSize: 12 }}>Speed</Text>
                  </Pressable>
                )}
                {!!onToggleFit && (
                  <Pressable
                    onPress={onToggleFit}
                    style={{
                      padding: 8,
                      borderRadius: 8,
                      backgroundColor: "rgba(255,255,255,0.08)",
                    }}
                  >
                    <Text style={{ color: "#fff", fontSize: 12 }}>
                      {fitLabel || "Fit"}
                    </Text>
                  </Pressable>
                )}
              </View>
            </View>

            {/* Center controls */}
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
                  onPress={() =>
                    onSeek(Math.max(0, (player?.currentTime ?? 0) - 10))
                  }
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

                <Pressable onPress={onTogglePlayPause}>
                  {!isBuffering && (
                    <MaterialCommunityIcons
                      name={isPlaying ? "pause" : "play"}
                      size={72}
                      color="#fff"
                    />
                  )}
                </Pressable>

                <Pressable
                  onPress={() => {
                    const pos = player?.currentTime ?? 0;
                    const dur = player?.duration ?? 0;
                    onSeek(Math.min(dur, pos + 10));
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

            {/* Bottom bar with interactive seek slider */}
            <View
              style={{
                width: "100%",
                paddingHorizontal: 16,
                paddingBottom: 18,
                paddingTop: 12,
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
                <Slider
                  style={{ flex: 1, height: 32 }}
                  minimumValue={0}
                  maximumValue={
                    Number.isFinite(duration) && duration > 0 ? duration : 0
                  }
                  value={
                    Number.isFinite(currentTime)
                      ? Math.min(Math.max(0, currentTime), duration || 0)
                      : 0
                  }
                  minimumTrackTintColor="#fff"
                  maximumTrackTintColor="rgba(255,255,255,0.3)"
                  thumbTintColor="#fff"
                  onSlidingComplete={(val) => {
                    const v = Array.isArray(val) ? val[0] : val;
                    if (Number.isFinite(v)) onSeek(v as number);
                  }}
                />
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
    </View>
  );
}
