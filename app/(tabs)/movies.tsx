import AppHeader from "@/components/AppHeader";
import MediaCard from "@/components/MediaCard";
import { Movie, fetchPopularMovies } from "@/lib/tmdb";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  ListRenderItem,
  RefreshControl,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const Movies = () => {
  const insets = useSafeAreaInsets();
  const [movies, setMovies] = useState<Movie[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPage = useCallback(async (nextPage: number, append = false) => {
    try {
      if (append) setLoadingMore(true);
      else setLoading(true);
      const data = await fetchPopularMovies(nextPage);
      setPage(data.page);
      setTotalPages(data.total_pages);
      const filtered = data.results.filter((m) => !!m.poster_path);
      setMovies((prev) => (append ? [...prev, ...filtered] : filtered));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
      setLoadingMore(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadPage(1, false);
  }, [loadPage]);

  const onEndReached = () => {
    if (loading || loadingMore) return;
    if (page >= totalPages) return;
    loadPage(page + 1, true);
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadPage(1, false);
  };

  const renderItem: ListRenderItem<Movie> = ({ item }) => (
    <View style={{ marginBottom: 12 }}>
      <MediaCard media={item} />
    </View>
  );

  if (loading && movies.length === 0)
    return (
      <View className="text-white flex-1 items-center justify-center">
        <ActivityIndicator size="large" color="#ffffff" />
      </View>
    );

  if (error && movies.length === 0)
    return (
      <View className="flex-1 items-center justify-center">
        <Text className="text-red-400">Error: {error}</Text>
      </View>
    );

  return (
    <View className="flex-1">
      <AppHeader subTitle="Movies" title="CineFlix" />
      <FlatList
        data={movies}
        keyExtractor={(item) => item.id.toString()}
        renderItem={renderItem}
        numColumns={3}
        columnWrapperStyle={{ paddingHorizontal: 16, gap: 9 }}
        contentContainerStyle={{ paddingBottom: insets.bottom + 80 }}
        showsVerticalScrollIndicator={false}
        onEndReached={onEndReached}
        onEndReachedThreshold={0.5}
        ListFooterComponent={
          loadingMore ? (
            <View className="py-4 items-center">
              <ActivityIndicator color="#fff" />
            </View>
          ) : null
        }
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#fff"
          />
        }
      />
    </View>
  );
};

export default Movies;
