import MediaCard from "@/components/MediaCard";
import {
  fetchRelatedTVShows,
  fetchSeasonDetails,
  fetchTVShowDetails,
  getImageUrl,
  SeasonDetails,
  TVResponse,
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
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import SelectDropdown from "react-native-select-dropdown";

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
  const [related, setRelated] = useState<TVResponse | null>(null);
  const scrollY = useRef(new Animated.Value(0)).current;
  const [activeTab, setActiveTab] = useState<
   "episodes" | "overview" | "cast" |  "related"
  >("episodes");
  const { colors } = useTheme();

  useEffect(() => {
    const load = async () => {
      try {
        const data = await fetchTVShowDetails(id);
        setTv(data);
        // prefetch related shows
        const rel = await fetchRelatedTVShows(id);
        setRelated(rel);
        // After fetching TV details, pick a sensible default season:
        // exclude season 0 (specials) and seasons with no episodes
        const availableSeasons =
          data.seasons?.filter(
            (s) => (s.season_number ?? 0) > 0 && (s.episode_count ?? 0) > 0
          ) ?? [];
        if (availableSeasons.length) {
          const seasonOne = availableSeasons.find((s) => s.season_number === 1);
          setSelectedSeason((seasonOne ?? availableSeasons[0]).season_number);
        }
      } catch (err) {
        console.log(err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id]);

  useEffect(() => {
    if (!selectedSeason) return;
    const loadSeason = async () => {
      try {
        setSeasonLoading(true);
        const data = await fetchSeasonDetails(id, selectedSeason);
        setSeasonDetails(data);
      } catch (err) {
        console.log(err);
      } finally {
        setSeasonLoading(false);
      }
    };
    loadSeason();
  }, [id, selectedSeason]);

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

  if (loading) {
    return (
      <View className="flex-1 bg-black justify-center items-center">
        <ActivityIndicator color="#fff" size="large" />
      </View>
    );
  }

  if (!tv) {
    return (
      <View className="flex-1 bg-black justify-center items-center">
        <Text className="text-white">TV show not found.</Text>
      </View>
    );
  }

  const seasonOptions =
    tv?.seasons
      ?.filter((s) => (s.season_number ?? 0) > 0 && (s.episode_count ?? 0) > 0)
      .map((s) => ({ label: s.name, value: s.season_number })) ?? [];

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
          colors={["rgba(0,0,0,0.1)", "rgba(0,0,0,0.9)"]}
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: HEADER_MAX_HEIGHT,
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
          <Text className="text-white text-3xl font-bold">{tv.name}</Text>
          <Text className="text-gray-400 mt-1 text-lg">
            ⭐ {tv.vote_average.toFixed(1)} • {tv.first_air_date?.slice(0, 4)}
          </Text>
        </Animated.View>
      </Animated.View>

      <Animated.FlatList
        data={[]}
        renderItem={() => null}
        ListHeaderComponent={() => (
          <View className="p-5">
            <View className="flex-row mt-6 self-center gap-2">
              {["overview", "cast", "episodes", "related"].map((tab) => {
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

            {activeTab === "episodes" && (
              <View className="mt-5">
                <SelectDropdown
                  data={seasonOptions}
                  onSelect={(selectedItem: any) =>
                    setSelectedSeason(selectedItem?.value)
                  }
                  defaultValue={
                    seasonOptions.find((s) => s.value === selectedSeason) ??
                    null
                  }
                  renderButton={(selectedItem: any, isOpened: boolean) => (
                    <View
                      style={{
                        height: 48,
                        borderRadius: 8,
                        backgroundColor: "#000", // black theme
                        paddingHorizontal: 12,
                        borderWidth: 1,
                        borderColor: "#333",
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "space-between",
                      }}
                    >
                      <Text
                        style={{
                          color: selectedItem ? "#fff" : "#666",
                          fontSize: 16,
                        }}
                      >
                        {(selectedItem && selectedItem.label) ||
                          "Select Season"}
                      </Text>
                      <MaterialCommunityIcons
                        name={isOpened ? "chevron-up" : "chevron-down"}
                        size={20}
                        color="#fff"
                      />
                    </View>
                  )}
                  renderItem={(
                    item: any,
                    index: number,
                    isSelected: boolean
                  ) => (
                    <View
                      style={{
                        backgroundColor: isSelected ? "#333" : "#000",
                        paddingVertical: 12,
                        paddingHorizontal: 8,
                      }}
                    >
                      <Text style={{ color: "#fff" }}>{item.label}</Text>
                    </View>
                  )}
                  dropdownStyle={{
                    backgroundColor: "#000",
                    borderColor: "#333",
                  }}
                  dropdownOverlayColor="rgba(0,0,0,0.3)"
                  showsVerticalScrollIndicator={false}
                />

                <View className="mt-5">
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
                </View>
              </View>
            )}

            {activeTab === "overview" && (
              <View className="mt-5">
                <Text className="text-gray-300 leading-7">{tv.overview}</Text>
                <View className="mt-5 gap-2">
                  <View className="flex-row flex-wrap gap-x-3 gap-y-2">
                    {(tv.genres ?? []).slice(0, 4).map((g: any) => (
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
                      label="Run time"
                      value={`${tv.episode_run_time?.[0] ?? 0} min`}
                    />
                    <InfoItem
                      label="First air"
                      value={tv.first_air_date?.slice(0, 10) ?? "-"}
                    />
                    <InfoItem label="Status" value={tv.status ?? "-"} />
                    <InfoItem
                      label="Language"
                      value={
                        tv.spoken_languages?.[0]?.english_name ??
                        tv.spoken_languages?.[0]?.name ??
                        "-"
                      }
                    />
                    <InfoItem
                      label="Country"
                      value={tv.production_countries?.[0]?.name ?? "-"}
                    />
                  </View>
                </View>
              </View>
            )}

            {activeTab === "cast" && (
              <FlatList
                className="mt-5"
                data={tv.credits?.cast?.slice(0, 20) ?? []}
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
                  <Text className="text-gray-400">No related shows.</Text>
                )}
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
        <Text className="text-white text-lg font-semibold">{tv?.name}</Text>
      </Animated.View>
    </View>
  );
}

// Local helper for label/value display
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
