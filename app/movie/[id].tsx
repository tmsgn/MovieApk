import MediaCard from "@/components/MediaCard";
import {
  addToWatchlist,
  clearMovieProgress,
  fmtTime,
  getMovieProgress,
  isInWatchlist,
  removeFromWatchlist,
} from "@/lib/storage";
import {
  fetchMovieDetails,
  fetchRelatedMovies,
  getImageUrl,
  MovieDetails,
  MovieResponse,
} from "@/lib/tmdb";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useTheme } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  FlatList,
  Image,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

const { width } = Dimensions.get("window");
const HEADER_MAX_HEIGHT = 280;
const HEADER_MIN_HEIGHT = 80;
const SCROLL_DISTANCE = HEADER_MAX_HEIGHT - HEADER_MIN_HEIGHT;

export default function MovieDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [movie, setMovie] = useState<MovieDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [related, setRelated] = useState<MovieResponse | null>(null);
  const [inWatchlist, setInWatchlist] = useState(false);
  const [resumeSec, setResumeSec] = useState<number | null>(null);
  const scrollY = useRef(new Animated.Value(0)).current;
  const [activeTab, setActiveTab] = useState<"overview" | "cast" | "related">(
    "overview"
  );

  useEffect(() => {
    (async () => {
      try {
        const data = await fetchMovieDetails(id ?? "");
        setMovie(data);
        // also load related movies
        const rel = await fetchRelatedMovies(id ?? "");
        setRelated(rel);
        // watchlist + progress
        try {
          setInWatchlist(await isInWatchlist("movie", Number(id)));
        } catch {}
        try {
          const prog = await getMovieProgress(Number(id));
          if (prog && prog.position > 60) setResumeSec(prog.position);
        } catch {}
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const { colors } = useTheme();

  if (loading)
    return (
      <View className="flex-1 justify-center items-center">
        <ActivityIndicator color={colors.text} size="large" />
      </View>
    );

  if (!movie)
    return (
      <View className="flex-1 justify-center items-center">
        <Text className="text-white text-lg">Movie not found</Text>
      </View>
    );

  const headerHeight = scrollY.interpolate({
    inputRange: [-200, 0, SCROLL_DISTANCE],
    outputRange: [
      HEADER_MAX_HEIGHT + 200,
      HEADER_MAX_HEIGHT,
      HEADER_MIN_HEIGHT,
    ],
    extrapolate: "clamp",
  });

  const imageOpacity = scrollY.interpolate({
    inputRange: [0, 150],
    outputRange: [1, 0],
    extrapolate: "clamp",
  });

  const imageScale = scrollY.interpolate({
    inputRange: [-200, 0, SCROLL_DISTANCE],
    outputRange: [1.4, 1, 1],
    extrapolate: "clamp",
  });

  const titleTranslate = scrollY.interpolate({
    inputRange: [0, SCROLL_DISTANCE],
    outputRange: [0, -20],
    extrapolate: "clamp",
  });

  return (
    <View className="flex-1 bg-black">
      {/* Back button */}
      <TouchableOpacity
        onPress={() => router.back()}
        style={{
          position: "absolute",
          top: 25,
          left: 12,
          zIndex: 20,
          padding: 8,
        }}
      >
        <MaterialCommunityIcons name="arrow-left" size={26} color="#fff" />
      </TouchableOpacity>
      {/* Header */}
      <Animated.View
        style={{
          position: "absolute",
          width: "100%",
          height: headerHeight,
        }}
      >
        <Animated.Image
          source={{ uri: getImageUrl(movie.backdrop_path, "original") }}
          style={{
            width,
            height: "100%",
            opacity: imageOpacity,
            transform: [{ scale: imageScale }],
          }}
          resizeMode="cover"
        />

        {/* Gradient overlay */}
        <LinearGradient
          colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.85)"]}
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: HEADER_MAX_HEIGHT,
            zIndex: 10,
          }}
        />

        {/* Title + rating inside collapsing header (disappears with image) */}
        <Animated.View
          style={{
            position: "absolute",
            bottom: 20,
            left: 16,
            right: 16,
            zIndex: 15,
            opacity: imageOpacity,
            transform: [{ translateY: titleTranslate }],
          }}
        >
          <Text className="text-white text-3xl font-bold">{movie.title}</Text>
          <Text className="text-gray-200 mt-1 text-lg">
            ⭐ {movie.vote_average.toFixed(1)} •{" "}
            {movie.release_date?.slice(0, 4)}
          </Text>
        </Animated.View>
      </Animated.View>

      {/* Scrollable content */}
      <Animated.ScrollView
        contentContainerStyle={{ paddingTop: HEADER_MAX_HEIGHT * 0.9 }}
        scrollEventThrottle={16}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: false }
        )}
      >
        <View className="items-center mt-4 px-4">
          {/* If we have a resume point, show Continue/Start over, else show Play */}
          {resumeSec == null ? (
            <View className="w-full flex-row gap-3">
              <TouchableOpacity
                onPress={() =>
                  router.push({
                    pathname: "/player/movie/[id]",
                    params: { id: String(movie.id) },
                  } as any)
                }
                className="flex-1 flex-row items-center justify-center bg-white py-2 rounded-full"
                activeOpacity={0.9}
              >
                <MaterialCommunityIcons name="play" size={24} color="#000" />
                <Text className="text-black text-lg font-bold ml-2">Play</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={async () => {
                  if (!movie) return;
                  if (inWatchlist) {
                    await removeFromWatchlist("movie", movie.id);
                    setInWatchlist(false);
                  } else {
                    await addToWatchlist({
                      type: "movie",
                      id: movie.id,
                      title: movie.title,
                      poster_path: movie.poster_path,
                    });
                    setInWatchlist(true);
                  }
                }}
                className="px-4 items-center justify-center bg-neutral-900 border border-neutral-800 rounded-full"
                activeOpacity={0.9}
              >
                <Text className="text-white font-semibold">
                  {inWatchlist ? "Saved" : "Save"}
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View className="w-full flex-row gap-3 mt-3 items-stretch">
              <TouchableOpacity
                onPress={() =>
                  router.push({
                    pathname: "/player/movie/[id]",
                    params: { id: String(movie.id) },
                  } as any)
                }
                className="flex-1 flex-row items-center justify-center bg-white py-2 rounded-full"
                activeOpacity={0.9}
              >
                <MaterialCommunityIcons name="play" size={22} color="#000" />
                <Text className="text-black font-semibold ml-2">
                  Continue at {fmtTime(resumeSec)}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={async () => {
                  if (!movie) return;
                  await clearMovieProgress(movie.id);
                  router.push({
                    pathname: "/player/movie/[id]",
                    params: { id: String(movie.id) },
                  } as any);
                }}
                className="px-4 items-center justify-center bg-neutral-900 border border-neutral-800 rounded-full"
                activeOpacity={0.9}
              >
                <Text className="text-white font-semibold">Start over</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={async () => {
                  if (!movie) return;
                  if (inWatchlist) {
                    await removeFromWatchlist("movie", movie.id);
                    setInWatchlist(false);
                  } else {
                    await addToWatchlist({
                      type: "movie",
                      id: movie.id,
                      title: movie.title,
                      poster_path: movie.poster_path,
                    });
                    setInWatchlist(true);
                  }
                }}
                className="px-4 items-center justify-center bg-neutral-900 border border-neutral-800 rounded-full"
                activeOpacity={0.9}
              >
                <Text className="text-white font-semibold">
                  {inWatchlist ? "Saved" : "Save"}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
        <View className="p-5">
          {/* Tabs */}
          <View className="flex-row mt-6 self-center gap-2">
            {["overview", "cast", "related"].map((tab) => {
              const active = activeTab === (tab as any);
              return (
                <TouchableOpacity
                  key={tab}
                  onPress={() => setActiveTab(tab as any)}
                  className={`px-5 py-2 rounded-full ${
                    active ? "bg-white" : "bg-neutral-900"
                  }`}
                >
                  <Text
                    className={`${
                      active ? "text-black font-bold" : "text-white"
                    } capitalize`}
                  >
                    {tab}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Content */}
          {activeTab === "overview" && (
            <View className="mt-5">
              <Text className="text-gray-300 leading-7">{movie.overview}</Text>

              {/* additional metadata */}
              <View className="mt-5 gap-2">
                <View className="flex-row flex-wrap gap-x-3 gap-y-2">
                  {movie.genres?.slice(0, 4).map((g) => (
                    <View
                      key={g.id}
                      className="bg-neutral-900 px-3 py-1 rounded-full"
                    >
                      <Text className="text-gray-200 text-sm">{g.name}</Text>
                    </View>
                  ))}
                </View>
                <View className="h-px bg-neutral-800 my-2" />
                <View className="flex-row flex-wrap">
                  <InfoItem
                    label="Runtime"
                    value={`${movie.runtime ?? 0} min`}
                  />
                  <InfoItem
                    label="Release"
                    value={movie.release_date?.slice(0, 10) ?? "-"}
                  />
                  <InfoItem label="Status" value={movie.status ?? "-"} />
                  <InfoItem
                    label="Language"
                    value={
                      movie.spoken_languages?.[0]?.english_name ??
                      movie.spoken_languages?.[0]?.name ??
                      "-"
                    }
                  />
                  <InfoItem
                    label="Country"
                    value={movie.production_countries?.[0]?.name ?? "-"}
                  />
                </View>
              </View>
            </View>
          )}

          {activeTab === "cast" && (
            <FlatList
              className="mt-5"
              data={movie.credits.cast.slice(0, 20)}
              horizontal
              showsHorizontalScrollIndicator={false}
              keyExtractor={(c) => c.id.toString()}
              renderItem={({ item }) => (
                <View className="mr-4 w-32">
                  <Image
                    source={{ uri: getImageUrl(item.profile_path, "w300") }}
                    className="w-32 h-32 rounded-2xl bg-neutral-800"
                  />
                  <Text className="text-white font-semibold mt-2">
                    {item.name}
                  </Text>
                  <Text className="text-gray-400 text-sm">
                    {item.character}
                  </Text>
                </View>
              )}
            />
          )}

          {activeTab === "related" && (
            <View className="mt-6">
              {related?.results?.length ? (
                <FlatList
                  data={related.results.filter((m) => m.poster_path)}
                  keyExtractor={(item) => item.id.toString()}
                  numColumns={3}
                  showsHorizontalScrollIndicator={false}
                  renderItem={({ item }) => (
                    <MediaCard key={item.id} media={item} />
                  )}
                />
              ) : (
                <Text className="text-gray-400">No related movies.</Text>
              )}
            </View>
          )}
        </View>
      </Animated.ScrollView>

      {/* Compact header */}
      <Animated.View
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: HEADER_MIN_HEIGHT,
          justifyContent: "center",
          alignItems: "center",
          backgroundColor: colors.background,
          zIndex: 10,
          opacity: scrollY.interpolate({
            inputRange: [SCROLL_DISTANCE - 60, SCROLL_DISTANCE - 10],
            outputRange: [0, 1],
            extrapolate: "clamp",
          }),
          borderBottomWidth: 1,
          borderBottomColor: "rgba(255,255,255,0.1)",
        }}
      >
        <Text className="text-white text-lg font-semibold">{movie.title}</Text>
      </Animated.View>
    </View>
  );
}

// Small helper component for overview metadata rows
const InfoItem: React.FC<{ label: string; value: string }> = ({
  label,
  value,
}) => (
  <View className="mr-5 mb-2">
    <Text className="text-gray-400 text-xs">{label}</Text>
    <Text className="text-white text-sm mt-0.5" numberOfLines={1}>
      {value}
    </Text>
  </View>
);
