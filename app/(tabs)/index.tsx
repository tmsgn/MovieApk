import AppHeader from "@/components/AppHeader";
import MediaCard from "@/components/MediaCard";
import Slider from "@/components/Slider";
import { fmtTime, listProgressSummaries } from "@/lib/storage";
import {
  fetchMovieDetails,
  fetchPopularMovies,
  fetchPopularTVShows,
  fetchTrendingMovies,
  fetchTrendingTVShows,
  fetchTVShowDetails,
  getImageUrl,
  Movie,
  TVShow,
} from "@/lib/tmdb";
import { useFocusEffect } from "@react-navigation/native";
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
  const [continueItems, setContinueItems] = useState<
    Array<{
      type: "movie" | "tv";
      id: number;
      title: string;
      poster_path: string | null;
      position: number;
      season?: number;
      episode?: number;
    }>
  >([]);
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
    async function loadContinue() {
      try {
        const summaries = await listProgressSummaries();
        const top = summaries.slice(0, 12);
        const mapped = await Promise.all(
          top.map(async (s) => {
            if (s.type === "movie") {
              const d = await fetchMovieDetails(String(s.id));
              return {
                type: "movie" as const,
                id: d.id,
                title: d.title,
                poster_path: d.poster_path,
                position: s.progress.position,
              };
            } else {
              const d = await fetchTVShowDetails(String(s.id));
              return {
                type: "tv" as const,
                id: d.id,
                title: d.name,
                poster_path: d.poster_path,
                position: s.progress.position,
                season: s.season,
                episode: s.episode,
              };
            }
          })
        );
        setContinueItems(mapped.filter(Boolean) as any);
      } catch (e) {
        // ignore
      }
    }
    const t = setTimeout(loadContinue, 0);
    return () => clearTimeout(t);
  }, []);

  // Refresh Continue Watching whenever the tab/screen gains focus
  useFocusEffect(
    React.useCallback(() => {
      let cancelled = false;
      (async () => {
        try {
          const summaries = await listProgressSummaries();
          if (cancelled) return;
          const top = summaries.slice(0, 12);
          const mapped = await Promise.all(
            top.map(async (s) => {
              if (s.type === "movie") {
                const d = await fetchMovieDetails(String(s.id));
                return {
                  type: "movie" as const,
                  id: d.id,
                  title: d.title,
                  poster_path: d.poster_path,
                  position: s.progress.position,
                };
              } else {
                const d = await fetchTVShowDetails(String(s.id));
                return {
                  type: "tv" as const,
                  id: d.id,
                  title: d.name,
                  poster_path: d.poster_path,
                  position: s.progress.position,
                  season: s.season,
                  episode: s.episode,
                };
              }
            })
          );
          if (!cancelled) setContinueItems(mapped.filter(Boolean) as any);
        } catch {}
      })();
      return () => {
        cancelled = true;
      };
    }, [])
  );

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
                `${item.type}-${item.id}-${item.season ?? ""}-${item.episode ?? ""}`
              }
              showsHorizontalScrollIndicator={false}
              renderItem={({ item }) => {
                const imageUrl = getImageUrl(item.poster_path, "w300");
                const onPress = () => {
                  if (item.type === "movie") {
                    router.push({
                      pathname: "/player/movie/[id]",
                      params: { id: String(item.id) },
                    } as any);
                  } else {
                    router.push({
                      pathname: "/player/tv/[id]",
                      params: {
                        id: String(item.id),
                        season: String(item.season),
                        episode: String(item.episode),
                      },
                    } as any);
                  }
                };
                return (
                  <TouchableOpacity
                    onPress={onPress}
                    activeOpacity={0.85}
                    style={{ width: 120, marginRight: 10 }}
                  >
                    {imageUrl ? (
                      <Image
                        source={{ uri: imageUrl }}
                        style={{ width: 120, height: 170, borderRadius: 8 }}
                      />
                    ) : (
                      <View
                        style={{
                          width: 120,
                          height: 170,
                          borderRadius: 8,
                          backgroundColor: "#222",
                        }}
                      />
                    )}
                    <Text className="text-white mt-1" numberOfLines={1}>
                      {item.title}
                    </Text>
                    <Text className="text-gray-400 text-xs">{`Continue at ${fmtTime(item.position)}`}</Text>
                  </TouchableOpacity>
                );
              }}
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
