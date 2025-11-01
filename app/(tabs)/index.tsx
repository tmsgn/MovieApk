import AppHeader from "@/components/AppHeader";
import MediaCard from "@/components/MediaCard";
import Slider from "@/components/Slider";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  fetchPopularMovies,
  fetchPopularTVShows,
  fetchTrendingMovies,
  fetchTrendingTVShows,
  Movie,
  TVShow,
} from "../../lib/tmdb";

const Home = () => {
  const [movies, setMovies] = useState<Movie[]>([]);
  const [tvshows, setTVShows] = useState<TVShow[]>([]);
  const [sliderItems, setSliderItems] = useState<(Movie | TVShow)[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sliderLoading, setSliderLoading] = useState(true);
  const [sliderError, setSliderError] = useState<string | null>(null);
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
