import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useTheme } from "@react-navigation/native";
import {
  Icon,
  Label,
  NativeTabs,
  VectorIcon,
} from "expo-router/unstable-native-tabs";

export default function TabLayout() {
  const { colors } = useTheme();

  return (
    <NativeTabs
      indicatorColor={"white"}
      backgroundColor={colors.background}
      labelStyle={{ fontSize: 12 }}
    >
      <NativeTabs.Trigger name="index">
        <Icon
          selectedColor={"black"}
          src={<VectorIcon family={MaterialCommunityIcons} name="home" />}
        />
        <Label>Home</Label>
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="movies">
        <Icon
          selectedColor={"black"}
          src={<VectorIcon family={MaterialCommunityIcons} name="movie-open" />}
        />
        <Label>Movies</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="tvshows">
        <Icon
          selectedColor={"black"}
          src={<VectorIcon family={MaterialCommunityIcons} name="television" />}
        />
        <Label>Tvshows</Label>
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="watchlist">
        <Icon
          selectedColor={"black"}
          src={
            <VectorIcon
              family={MaterialCommunityIcons}
              name="bookmark-outline"
            />
          }
        />
        <Label>Watchlist</Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
