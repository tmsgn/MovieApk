import AppHeader from "@/components/AppHeader";
import MediaCard from "@/components/MediaCard";
import { Movie, TVShow, searchMulti } from "@/lib/tmdb";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  ListRenderItem,
  RefreshControl,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// Union type we actually render
type MediaItem = Movie | TVShow;

const SearchScreen = () => {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MediaItem[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runSearch = useCallback(
    async (q: string, nextPage: number, append = false) => {
      if (!q.trim()) {
        setResults([]);
        setPage(1);
        setTotalPages(1);
        setError(null);
        setLoading(false);
        setLoadingMore(false);
        return;
      }
      try {
        if (append) setLoadingMore(true);
        else setLoading(true);
        const data = await searchMulti(q, nextPage);
        // Only movies/TV with posters
        const filtered = data.results.filter((item: any) => {
          const isMovie = item && typeof item === "object" && "title" in item;
          const isTV =
            item &&
            typeof item === "object" &&
            "name" in item &&
            !("title" in item);
          const hasPoster = !!item?.poster_path;
          return (isMovie || isTV) && hasPoster;
        }) as MediaItem[];
        setPage(data.page);
        setTotalPages(data.total_pages);
        setResults((prev) => (append ? [...prev, ...filtered] : filtered));
        setError(null);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
        setLoadingMore(false);
        setRefreshing(false);
      }
    },
    []
  );

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      runSearch(query, 1, false);
    }, 400);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, runSearch]);

  const onEndReached = () => {
    if (loading || loadingMore) return;
    if (page >= totalPages) return;
    if (!query.trim()) return;
    runSearch(query, page + 1, true);
  };

  const onRefresh = () => {
    setRefreshing(true);
    runSearch(query, 1, false);
  };

  const renderItem: ListRenderItem<MediaItem> = ({ item }) => (
    <View style={{ marginBottom: 12 }}>
      <MediaCard media={item} />
    </View>
  );

  return (
    <View className="flex-1">
      <AppHeader title="Search" />
      <View className="px-4 mb-4">
        <TextInput
          placeholder="Search movies and TV shows"
          placeholderTextColor="#9CA3AF"
          value={query}
          onChangeText={setQuery}
          className="bg-neutral-800 text-white px-4 py-3 rounded-lg"
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
        />
      </View>

      {error && !loading && results.length === 0 ? (
        <View className="items-center justify-center py-10">
          <Text className="text-red-400">Error: {error}</Text>
        </View>
      ) : null}

      {loading && results.length === 0 ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#ffffff" />
        </View>
      ) : (
        <FlatList
          data={results}
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
      )}
    </View>
  );
};

export default SearchScreen;
