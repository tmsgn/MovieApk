import AppHeader from "@/components/AppHeader";
import {
  WatchlistItem,
  getWatchlist,
  removeFromWatchlist,
} from "@/lib/storage";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { FlatList, Image, Text, TouchableOpacity, View } from "react-native";

const Watchlist = () => {
  const [items, setItems] = useState<WatchlistItem[]>([]);
  const router = useRouter();

  async function load() {
    const list = await getWatchlist();
    setItems(list);
  }

  useEffect(() => {
    load();
    const id = setInterval(load, 2000);
    return () => clearInterval(id);
  }, []);

  const renderItem = ({ item }: { item: WatchlistItem }) => {
    const img = item.poster_path
      ? `https://image.tmdb.org/t/p/w300${item.poster_path}`
      : undefined;
    return (
      <View className="w-1/3 px-2 mb-4">
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() =>
            router.push({
              pathname: `/${item.type}/[id]`,
              params: { id: String(item.id) },
            } as any)
          }
          className="rounded-xl overflow-hidden bg-neutral-900"
          style={{ height: 180 }}
        >
          {img ? (
            <Image
              source={{ uri: img }}
              style={{ width: "100%", height: 180 }}
            />
          ) : (
            <View className="w-full h-full items-center justify-center">
              <Text className="text-white/70 text-xs">No Image</Text>
            </View>
          )}
        </TouchableOpacity>
        <Text className="text-white mt-2" numberOfLines={1}>
          {item.title}
        </Text>
        <TouchableOpacity
          onPress={async () => {
            await removeFromWatchlist(item.id, item.type);
            load();
          }}
          className="mt-1 self-start px-3 py-1 rounded-full bg-white/10"
        >
          <Text className="text-white text-xs">Remove</Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <View className="flex-1 bg-black">
      <AppHeader title="Watchlist" />
      {items.length === 0 ? (
        <View className="flex-1 items-center justify-center">
          <Text className="text-white/70">Your watchlist is empty.</Text>
        </View>
      ) : (
        <FlatList
          contentContainerStyle={{ paddingHorizontal: 8, paddingBottom: 40 }}
          data={items}
          keyExtractor={(x) => `${x.type}-${x.id}`}
          numColumns={3}
          renderItem={renderItem}
        />
      )}
    </View>
  );
};

export default Watchlist;
