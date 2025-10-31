import {
  fetchTrendingMovies,
  fetchTrendingTVShows,
  getImageUrl,
  Movie,
  TVShow,
} from "@/lib/tmdb";
import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Dimensions, Image, Text, View } from "react-native";
import {
  runOnJS,
  useAnimatedReaction,
  useSharedValue,
} from "react-native-reanimated";
import Carousel, { ICarouselInstance } from "react-native-reanimated-carousel";

const { width, height } = Dimensions.get("window");

const Slider = () => {
  const [items, setItems] = useState<(Movie | TVShow)[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);

  const ref = useRef<ICarouselInstance>(null);
  const progressValue = useSharedValue<number>(0);

  // Helper function to get the title from either Movie or TVShow
  const getMediaTitle = (media: Movie | TVShow): string => {
    return "title" in media ? media.title : media.name;
  };

  // Update current index when progress changes
  useAnimatedReaction(
    () => progressValue.value,
    (currentValue, previousValue) => {
      if (currentValue !== previousValue) {
        runOnJS(setCurrentIndex)(Math.round(currentValue));
      }
    }
  );

  useEffect(() => {
    async function loadMedia() {
      try {
        const movieData = await fetchTrendingMovies();
        const tvshowData = await fetchTrendingTVShows();

        const combinedItems = [
          ...movieData.results,
          ...tvshowData.results,
        ].sort((a, b) => b.popularity - a.popularity);
        setItems(combinedItems);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setIsLoading(false);
      }
    }
    loadMedia();
  }, []);

  if (isLoading) {
    return (
      <View
        className="justify-center items-center"
        style={{ height: height * 0.4 }}
      >
        <ActivityIndicator size="large" color="#FFFFFF" />
      </View>
    );
  }

  if (error) {
    return (
      <View
        className="justify-center items-center"
        style={{ height: height * 0.4 }}
      >
        <Text className="text-red-500 text-base">{error}</Text>
      </View>
    );
  }

  return (
    <View className="mt-10">
      <Carousel
        ref={ref}
        data={items}
        renderItem={({ item }) =>
          item ? <SliderMediaCard media={item} /> : <View />
        }
        width={width}
        height={height * 0.4}
        loop
        autoPlay
        autoPlayInterval={6000}
        mode="parallax"
        modeConfig={{
          parallaxScrollingScale: 1,
          parallaxScrollingOffset: width * 0.43,
          parallaxAdjacentItemScale: 0.8,
        }}
        scrollAnimationDuration={300}
        onProgressChange={(_, absoluteProgress) => {
          progressValue.value = absoluteProgress;
        }}
      />

      {/* Display current media title */}
      <View className="mt-4 px-4">
        <Text className="text-white text-xl font-bold text-center">
          {items[currentIndex] ? getMediaTitle(items[currentIndex]) : ""}
        </Text>
      </View>
    </View>
  );
};

const SliderMediaCard: React.FC<{ media: Movie | TVShow }> = ({ media }) => {
  const imageUrl = getImageUrl(media.poster_path, "w500");
  return (
    <View className="flex-1 justify-center items-center">
      <Image
        className="rounded-3xl"
        style={{
          width: width * 0.6,
          height: height * 0.4,
        }}
        resizeMode="cover"
        source={{
          uri:
            imageUrl ??
            "https://placehold.co/500x750/1a202c/ffffff?text=No+Image",
        }}
      />
    </View>
  );
};

export default Slider;
