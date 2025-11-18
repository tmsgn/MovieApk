import AppHeader from "@/components/AppHeader";
import MediaCard from "@/components/MediaCard";
import Slider from "@/components/Slider";
import {
  ContinueItem,
  formatTimestampLabel,
  getContinueWatching,
} from "@/lib/storage";
// storage/watchlist removed
import {
  fetchPopularMovies,
  fetchPopularTVShows,
  fetchTrendingMovies,
  fetchTrendingTVShows,
  Movie,
  TVShow,
} from "@/lib/tmdb";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const Home = () => {
  const [movies, setMovies] = useState<Movie[]>([]);
  const [tvshows, setTVShows] = useState<TVShow[]>([]);
  const [sliderItems, setSliderItems] = useState<(Movie | TVShow)[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sliderLoading, setSliderLoading] = useState(true);
  const [sliderError, setSliderError] = useState<string | null>(null);
  // continue watching removed
  const [continueItems, setContinueItems] = useState<ContinueItem[]>([]);
  const router = useRouter();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    async function loadMedia() {
      try {
        setLoading(true);
        const movieData = await fetchPopularMovies();
        const tvshowData = await fetchPopularTVShows();
        setMovies(movieData.results.filter((m) => !!m.poster_path));
        setTVShows(tvshowData.results.filter((t) => !!t.poster_path));
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    }
    loadMedia();
  }, []);

  useEffect(() => {
    async function loadSliderItems() {
      try {
        setSliderLoading(true);
        const trendingMovies = await fetchTrendingMovies();
        const trendingTV = await fetchTrendingTVShows();
        const combined = [...trendingMovies.results, ...trendingTV.results]
          .filter((item) => !!item.poster_path)
          .sort((a, b) => b.popularity - a.popularity);
        setSliderItems(combined);
      } catch (err) {
        setSliderError((err as Error).message);
      } finally {
        setSliderLoading(false);
      }
    }
    loadSliderItems();
  }, []);

  // Load continue watching summaries
  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const items = await getContinueWatching();
        if (mounted) setContinueItems(items);
      } catch {}
    };
    load();
    const id = setInterval(load, 2000); // simple refresher when returning
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, []);

  if (loading)
    return (
      <View className="text-white flex-1 items-center justify-center">
        <ActivityIndicator size="large" color="#ffffff" />
      </View>
    );

  if (error)
    return (
      <View>
        <Text className="text-red-400">Error: {error}</Text>
      </View>
    );
  return (
    <>
      <AppHeader />
      <ScrollView
        showsVerticalScrollIndicator={false}
        className="flex-1"
        contentContainerStyle={{ paddingBottom: insets.bottom + 80 }}
      >
        <Slider items={sliderItems} />
        {continueItems.length > 0 && (
          <View className="px-4 mt-6">
            <Text className="text-white font-bold text-xl mb-3">
              Continue Watching
            </Text>
            <FlatList
              horizontal
              data={continueItems}
              keyExtractor={(item) =>
                item.type === "movie"
                  ? `m-${item.id}`
                  : `t-${item.showId}-${item.season}-${item.episode}`
              }
              showsHorizontalScrollIndicator={false}
              renderItem={({ item }) => (
                <ContinueCard
                  item={item}
                  onPress={() => {
                    if (item.type === "movie") {
                      router.push({
                        pathname: "/player/[id]",
                        params: {
                          id: String(item.id),
                          type: "movie",
                          startAt: String(Math.floor(item.position)),
                        },
                      } as any);
                    } else {
                      router.push({
                        pathname: "/player/[id]",
                        params: {
                          id: String(item.showId),
                          type: "tv",
                          season: String(item.season),
                          episode: String(item.episode),
                          startAt: String(Math.floor(item.position)),
                        },
                      } as any);
                    }
                  }}
                />
              )}
            />
          </View>
        )}

        <View className="px-4 mt-6">
          <Text className="text-white font-bold text-xl mb-3">
            Popular Movies
          </Text>
          <FlatList
            horizontal
            data={movies}
            keyExtractor={(item) => item.id.toString()}
            showsHorizontalScrollIndicator={false}
            renderItem={({ item }) => <MediaCard media={item} />}
          />
        </View>

        <View className="px-4 mt-6 mb-10">
          <Text className="text-white font-bold text-xl mb-3">
            Popular TV Shows
          </Text>
          <FlatList
            horizontal
            data={tvshows}
            keyExtractor={(item) => item.id.toString()}
            showsHorizontalScrollIndicator={false}
            renderItem={({ item }) => <MediaCard media={item} />}
          />
        </View>
      </ScrollView>
    </>
  );
};

export default Home;

// Header moved to components/AppHeader

function ContinueCard({
  item,
  onPress,
}: {
  item: ContinueItem;
  onPress: () => void;
}) {
  const img = item.poster_path
    ? `https://image.tmdb.org/t/p/w300${item.poster_path}`
    : undefined;
  const label =
    item.type === "movie"
      ? `${formatTimestampLabel(item.position)}`
      : `S${item.season}E${item.episode} • ${formatTimestampLabel(item.position)}`;
  const title =
    item.type === "movie"
      ? (item.title ?? "Movie")
      : (item.showName ?? "TV Show");
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      className="mr-3"
      style={{ width: 120 }}
    >
      <View
        className="rounded-xl overflow-hidden bg-neutral-800"
        style={{ width: 120, height: 160 }}
      >
        {img ? (
          <Image source={{ uri: img }} style={{ width: 120, height: 160 }} />
        ) : (
          <View className="w-full h-full items-center justify-center">
            <Text className="text-white/70 text-xs">No Image</Text>
          </View>
        )}
      </View>
      <Text className="text-white text-xs mt-2" numberOfLines={1}>
        {title}
      </Text>
      <Text className="text-gray-400 text-[11px]" numberOfLines={1}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}
