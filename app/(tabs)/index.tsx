import MediaCard from "@/components/MediaCard";
import Slider from "@/components/Slider";
import { Ionicons } from "@expo/vector-icons";
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
  Movie,
  TVShow,
} from "../../lib/tmdb";

const Home = () => {
  const [movies, setMovies] = useState<Movie[]>([]);
  const [tvshows, setTVShows] = useState<TVShow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    async function loadMedia() {
      try {
        setLoading(true);
        const movieData = await fetchPopularMovies();
        const tvshowData = await fetchPopularTVShows();
        setMovies(movieData.results);
        setTVShows(tvshowData.results);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    }
    loadMedia();
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
      <HomeHeader />
      <ScrollView
        showsVerticalScrollIndicator={false}
        className="flex-1"
        contentContainerStyle={{ paddingBottom: insets.bottom + 80 }}
      >
        <Slider />
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

const HomeHeader = () => {
  return (
    <View className="p-6 pt-10 flex-row justify-between items-center">
      <Text className="text-white font-extrabold text-2xl">CineFlix</Text>
      <Ionicons
        name="search"
        size={22}
        color="white"
        onPress={() => {
          // Handle search navigation here
          console.log("Search pressed");
        }}
      />
    </View>
  );
};
