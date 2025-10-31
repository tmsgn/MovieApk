import { fetchMovieDetails, getImageUrl, MovieDetails } from "@/lib/tmdb";
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
  const scrollY = useRef(new Animated.Value(0)).current;
  const [activeTab, setActiveTab] = useState<"overview" | "cast" | "related">(
    "overview"
  );

  useEffect(() => {
    (async () => {
      try {
        const data = await fetchMovieDetails(id ?? "");
        setMovie(data);
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
        <View className="p-5">
          <Text className="text-white text-3xl font-bold">{movie.title}</Text>
          <Text className="text-gray-400 mt-1 text-lg">
            ⭐ {movie.vote_average.toFixed(1)} •{" "}
            {movie.release_date?.slice(0, 4)}
          </Text>

          {/* Tabs */}
          <View className="flex-row mt-6 bg-neutral-900 rounded-full self-center overflow-hidden">
            {["overview", "cast", "related"].map((tab) => (
              <TouchableOpacity
                key={tab}
                onPress={() => setActiveTab(tab as any)}
                className={`flex-1 py-3 items-center ${
                  activeTab === tab ? "bg-white" : ""
                }`}
              >
                <Text
                  className={`${
                    activeTab === tab ? "text-black font-bold" : "text-white"
                  } capitalize text-lg`}
                >
                  {tab}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Content */}
          {activeTab === "overview" && (
            <Text className="text-gray-300 mt-5 leading-7">
              {movie.overview}
            </Text>
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
              <Text className="text-gray-400">No related movies yet</Text>
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
