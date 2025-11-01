import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import { Text, View } from "react-native";

interface AppHeaderProps {
  title?: string;
  subTitle?: string;
  onPressSearch?: () => void;
}

const AppHeader: React.FC<AppHeaderProps> = ({
  title = "CineFlix",
  subTitle,
  onPressSearch,
}) => {
  const router = useRouter();
  const handleSearch =
    onPressSearch ?? (() => router.push({ pathname: "/search" } as any));
  return (
    <View className="p-6 pt-10 flex-row justify-between items-center">
      <View>
        <Text className="text-white font-extrabold text-2xl">{title}</Text>
        <Text className="text-white">{subTitle}</Text>
      </View>
      <Ionicons name="search" size={22} color="white" onPress={handleSearch} />
    </View>
  );
};

export default AppHeader;
