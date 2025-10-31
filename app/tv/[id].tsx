import {
  fetchSeasonDetails,
  fetchTVShowDetails,
  getImageUrl,
  SeasonDetails,
  TVShowDetails,
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
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

const { width } = Dimensions.get("window");
const HEADER_MAX_HEIGHT = 280;
const HEADER_MIN_HEIGHT = 80;
const SCROLL_DISTANCE = HEADER_MAX_HEIGHT - HEADER_MIN_HEIGHT;

export default function TvshowDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [tv, setTv] = useState<TVShowDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [seasonLoading, setSeasonLoading] = useState(false);
  const [seasonDetails, setSeasonDetails] = useState<SeasonDetails | null>(
    null
  );
  const [selectedSeason, setSelectedSeason] = useState<number | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const scrollY = useRef(new Animated.Value(0)).current;
  const [activeTab, setActiveTab] = useState<"overview" | "cast" | "episodes">(
    "overview"
  );

  useEffect(() => {
    (async () => {
      try {
        const data = await fetchTVShowDetails(id ?? "");
        setTv(data);
        // auto-select first season if available
        if (data.seasons && data.seasons.length > 0) {
          const firstSeason = data.seasons[0].season_number;
          setSelectedSeason(firstSeason);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  useEffect(() => {
    if (!selectedSeason || !tv) return;
    (async () => {
      try {
        setSeasonLoading(true);
        const sd = await fetchSeasonDetails(tv.id, selectedSeason);
        setSeasonDetails(sd);
      } catch (e) {
        console.error(e);
      } finally {
        setSeasonLoading(false);
      }
    })();
  }, [selectedSeason, tv]);

  const { colors } = useTheme();

  if (loading)
    return (
      <View className="flex-1 justify-center items-center">
        <ActivityIndicator color={colors.text} size="large" />
      </View>
    );

  if (!tv)
    return (
      <View className="flex-1 justify-center items-center">
        <Text className="text-white text-lg">TV show not found</Text>
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
      <TouchableOpacity
        onPress={() => router.back()}
        style={{
          position: "absolute",
          top: 25,
          left: 12,
          zIndex: 60,
          padding: 8,
        }}
      >
        <MaterialCommunityIcons name="arrow-left" size={26} color="#fff" />
      </TouchableOpacity>
      <Animated.View
        style={{
          position: "absolute",
          width: "100%",
          height: headerHeight,
          overflow: "hidden",
        }}
      >
        <Animated.Image
          source={{ uri: getImageUrl(tv.backdrop_path, "original") }}
          style={{
            width,
            height: "100%",
            opacity: imageOpacity,
            transform: [{ scale: imageScale }],
          }}
          resizeMode="cover"
        />
        <LinearGradient
          colors={["transparent", "rgba(0,0,0,0.8)"]}
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: HEADER_MAX_HEIGHT / 1.5,
          }}
        />
      </Animated.View>

      <Animated.FlatList
        data={[]}
        renderItem={() => null}
        ListHeaderComponent={() => (
          <View className="p-5">
            <Text className="text-white text-3xl font-bold">{tv.name}</Text>
            <Text className="text-gray-400 mt-1 text-lg">
              ⭐ {tv.vote_average.toFixed(1)} • {tv.first_air_date?.slice(0, 4)}
            </Text>

            {/* Tabs */}
            <View className="flex-row mt-6 bg-neutral-900 rounded-full self-center overflow-hidden">
              {["overview", "cast", "episodes"].map((tab) => (
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
                {tv.overview}
              </Text>
            )}

            {activeTab === "cast" && (
              <FlatList
                className="mt-5"
                data={tv.credits.cast.slice(0, 20)}
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

            {activeTab === "episodes" && (
              <View className="mt-5">
                {/* Season selector */}
                <View style={{ position: "relative" }}>
                  <TouchableOpacity
                    onPress={() => setDropdownOpen((s) => !s)}
                    className="px-4 py-3 bg-neutral-800 rounded-lg flex-row justify-between items-center"
                  >
                    <Text className="text-white">
                      Season {selectedSeason ?? "-"}
                    </Text>
                    <Text className="text-gray-300">
                      {dropdownOpen ? "▲" : "▼"}
                    </Text>
                  </TouchableOpacity>

                  {dropdownOpen && (
                    <View
                      style={{
                        position: "absolute",
                        top: 48,
                        left: 0,
                        right: 0,
                        zIndex: 50,
                        maxHeight: 220,
                        borderRadius: 8,
                        overflow: "hidden",
                        backgroundColor: "#0b0b0b",
                      }}
                    >
                      <ScrollView
                        nestedScrollEnabled
                        style={{ maxHeight: 220 }}
                      >
                        {(tv.seasons ?? []).map((item) => (
                          <TouchableOpacity
                            key={item.id}
                            style={{
                              paddingHorizontal: 16,
                              paddingVertical: 12,
                              borderBottomWidth: 1,
                              borderBottomColor: "rgba(255,255,255,0.04)",
                            }}
                            onPress={() => {
                              setSelectedSeason(item.season_number);
                              setDropdownOpen(false);
                            }}
                          >
                            <Text className="text-white">{item.name}</Text>
                            <Text className="text-gray-400 text-sm">
                              Episodes: {item.episode_count ?? "-"}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    </View>
                  )}
                </View>

                {/* Episodes list (rendered without FlatList to avoid nested vertical VirtualizedLists) */}
                <View className="mt-4">
                  {seasonLoading && (
                    <ActivityIndicator color="#fff" size="small" />
                  )}

                  {!seasonLoading && seasonDetails && (
                    <View>
                      {(seasonDetails.episodes ?? []).map((item) => (
                        <View key={item.id}>
                          <View className="flex-row">
                            <Image
                              source={{
                                uri: getImageUrl(item.still_path, "w300"),
                              }}
                              className="w-36 h-20 rounded-lg bg-neutral-800"
                            />
                            <View className="flex-1 ml-3">
                              <Text className="text-white font-semibold">
                                {item.episode_number}. {item.name}
                              </Text>
                              <Text
                                className="text-gray-400 text-sm mt-1"
                                numberOfLines={3}
                              >
                                {item.overview || "No description available."}
                              </Text>
                            </View>
                          </View>
                          <View className="h-px bg-neutral-800 my-3" />
                        </View>
                      ))}
                    </View>
                  )}

                  {!seasonLoading && !seasonDetails && (
                    <Text className="text-gray-400">
                      Select a season to view episodes.
                    </Text>
                  )}
                </View>
              </View>
            )}
          </View>
        )}
        contentContainerStyle={{ paddingTop: HEADER_MAX_HEIGHT * 0.9 }}
        scrollEventThrottle={16}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: false }
        )}
      />

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
        <Text className="text-white text-lg font-semibold">{tv.name}</Text>
      </Animated.View>
    </View>
  );
}
