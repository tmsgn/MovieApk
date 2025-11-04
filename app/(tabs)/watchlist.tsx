import MediaCard from "@/components/MediaCard";
import {
  getWatchlist,
  removeFromWatchlist,
  WatchlistItem,
} from "@/lib/storage";
import {
  fetchMovieDetails,
  fetchTVShowDetails,
  Movie,
  TVShow,
} from "@/lib/tmdb";
import { useFocusEffect } from "@react-navigation/native";
import React, { useEffect, useState } from "react";
import {
  FlatList,
  RefreshControl,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

type AnyMedia = Movie | TVShow;

const Watchlist = () => {
  const [items, setItems] = useState<WatchlistItem[]>([]);
  const [mediaDetails, setMediaDetails] = useState<Record<string, AnyMedia>>(
    {}
  );
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    try {
      setLoading(true);
      const list = await getWatchlist();
      setItems(list);
      const details: Record<string, AnyMedia> = {};
      for (const it of list) {
        const key = `${it.type}-${it.id}`;
        try {
          if (it.type === "movie")
            details[key] = await fetchMovieDetails(String(it.id));
          else details[key] = await fetchTVShowDetails(String(it.id));
        } catch {}
      }
      setMediaDetails(details);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  // Refresh when tab/screen gains focus so added items appear immediately
  useFocusEffect(
    React.useCallback(() => {
      load();
      return () => {};
    }, [])
  );

  const onRemove = async (it: WatchlistItem) => {
    await removeFromWatchlist(it.type, it.id);
    load();
  };

  if (loading && !items.length) {
    return (
      <View className="flex-1 bg-black items-center justify-center">
        <Text className="text-white">Loading watchlist…</Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-black px-4 pt-4">
      <Text className="text-white font-bold text-xl mb-3">Watchlist</Text>
      {items.length === 0 ? (
        <Text className="text-gray-400">Your watchlist is empty.</Text>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(it) => `${it.type}-${it.id}`}
          numColumns={3}
          columnWrapperStyle={{ gap: 10 }}
          contentContainerStyle={{ gap: 12, paddingBottom: 80 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                load();
              }}
            />
          }
          renderItem={({ item }) => {
            const key = `${item.type}-${item.id}`;
            const details = mediaDetails[key];
            if (!details) return null;
            return (
              <View>
                <MediaCard media={details} />
                <TouchableOpacity
                  onPress={() => onRemove(item)}
                  style={{
                    position: "absolute",
                    top: 6,
                    right: 6,
                    backgroundColor: "rgba(0,0,0,0.6)",
                    paddingHorizontal: 6,
                    paddingVertical: 2,
                    borderRadius: 6,
                  }}
                >
                  <Text className="text-white text-xs">Remove</Text>
                </TouchableOpacity>
              </View>
            );
          }}
        />
      )}
    </View>
  );
};

export default Watchlist;
