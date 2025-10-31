import { Movie, TVShow, getImageUrl } from "@/lib/tmdb";
import { useRouter } from "expo-router";
import React from "react";
import { Dimensions, Image, Text, TouchableOpacity, View } from "react-native";

interface MediaCardProps {
  media: Movie | TVShow;
}
const { width: screenWidth, height: screenHeight } = Dimensions.get("window");
const CARD_WIDTH = screenWidth * 0.27;

const MediaCard: React.FC<MediaCardProps> = ({ media }) => {
  const router = useRouter();
  const isMovie = "title" in media;
  const title = isMovie ? media.title : media.name;
  const imageUrl = getImageUrl(media.poster_path, "w300");
  const releaseDate = isMovie ? media.release_date : media.first_air_date;

  const handlePress = () => {
    const kind = isMovie ? "movie" : "tv";
    // navigate to the correct dynamic route using pathname + params to satisfy router types
    const pathname = `/${kind}/[id]`;
    // cast to any to satisfy expo-router's strict typing for dynamic paths
    router.push({ pathname, params: { id: String(media.id) } } as any);
  };

  return (
    <TouchableOpacity
      onPress={handlePress}
      activeOpacity={0.8}
      style={{ width: CARD_WIDTH, marginRight: 9, borderRadius: 6 }}
    >
      {imageUrl ? (
        <Image
          style={{
            width: CARD_WIDTH,
            height: screenHeight * 0.19,
            borderRadius: 6,
          }}
          resizeMode="cover"
          source={{ uri: imageUrl }}
        />
      ) : (
        <View style={{ width: CARD_WIDTH }}>
          <Text>No Image</Text>
        </View>
      )}

      <Text
        style={{ width: CARD_WIDTH }}
        numberOfLines={1}
        ellipsizeMode="tail"
        className="text-xs text-gray-200"
      >
        {title}
      </Text>

      <Text style={{ width: CARD_WIDTH }} className="text-xs text-gray-400">
        {releaseDate?.slice(0, 4)}
      </Text>
    </TouchableOpacity>
  );
};

export default MediaCard;
