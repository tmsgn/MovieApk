import React, { useState } from "react";
import {
  Dimensions,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

export type CaptionItem = {
  id: string;
  display?: string;
  language?: string;
  url: string;
};

export default function SubtitlesModal(props: {
  visible: boolean;
  onRequestClose: () => void;
  tracks: CaptionItem[];
  selectedId: string | "off" | undefined;
  onSelect: (id: string | "off") => void;
  allowAddExternal?: boolean;
  onAddExternal?: (url: string) => void;
}) {
  const {
    visible,
    onRequestClose,
    tracks,
    selectedId,
    onSelect,
    allowAddExternal,
    onAddExternal,
  } = props;
  const [adding, setAdding] = useState(false);
  const [url, setUrl] = useState("");

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onRequestClose}
    >
      <Pressable
        style={{
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.6)",
          alignItems: "center",
          justifyContent: "center",
        }}
        onPress={onRequestClose}
      >
        <View
          style={{
            width: Math.min(SCREEN_WIDTH - 32, 700),
            maxHeight: SCREEN_HEIGHT * 0.8,
            backgroundColor: "#111",
            borderRadius: 12,
            paddingVertical: 14,
            paddingHorizontal: 12,
          }}
        >
          <Text
            style={{
              color: "#fff",
              fontSize: 16,
              fontWeight: "700",
              marginBottom: 10,
              alignSelf: "center",
            }}
          >
            Subtitles
          </Text>

          <ScrollView style={{ maxHeight: SCREEN_HEIGHT * 0.6 }}>
            <Pressable
              onPress={() => onSelect("off")}
              style={{
                paddingVertical: 10,
                paddingHorizontal: 8,
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <Text
                style={{
                  color: selectedId === "off" ? "#a8ff4a" : "#fff",
                  fontSize: 15,
                }}
              >
                Off
              </Text>
            </Pressable>

            {tracks.map((t) => (
              <Pressable
                key={t.id}
                onPress={() => onSelect(t.id)}
                style={{
                  paddingVertical: 10,
                  paddingHorizontal: 8,
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <Text
                  style={{
                    color: selectedId === t.id ? "#a8ff4a" : "#fff",
                    fontSize: 15,
                  }}
                >
                  {t.display || t.language || t.id}
                </Text>
              </Pressable>
            ))}
          </ScrollView>

          {!!allowAddExternal && (
            <View
              style={{
                flexDirection: "row",
                gap: 8,
                alignItems: "center",
                justifyContent: "center",
                marginTop: 6,
              }}
            >
              <Pressable
                onPress={() => setAdding(true)}
                style={{
                  paddingHorizontal: 14,
                  paddingVertical: 8,
                  borderRadius: 8,
                  backgroundColor: "rgba(255,255,255,0.12)",
                }}
              >
                <Text style={{ color: "#fff" }}>Add URL</Text>
              </Pressable>
            </View>
          )}

          <View style={{ marginTop: 10, alignItems: "center" }}>
            <Pressable
              onPress={onRequestClose}
              style={{
                paddingHorizontal: 18,
                paddingVertical: 8,
                borderRadius: 20,
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.08)",
              }}
            >
              <Text style={{ color: "#fff" }}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Pressable>

      {/* Add External URL modal */}
      <Modal
        visible={adding}
        transparent
        animationType="fade"
        onRequestClose={() => setAdding(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.7)",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <View
            style={{
              width: SCREEN_WIDTH - 80,
              backgroundColor: "#111",
              borderRadius: 12,
              padding: 14,
            }}
          >
            <Text
              style={{
                color: "#fff",
                fontSize: 16,
                fontWeight: "700",
                marginBottom: 8,
              }}
            >
              Add subtitle URL
            </Text>
            <TextInput
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="https://example.com/subtitle.vtt or .srt"
              placeholderTextColor="#777"
              value={url}
              onChangeText={setUrl}
              style={{
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.12)",
                borderRadius: 8,
                paddingHorizontal: 10,
                paddingVertical: Platform.select({ ios: 12, android: 8 }),
                color: "#fff",
                marginBottom: 10,
              }}
            />
            <View
              style={{
                flexDirection: "row",
                justifyContent: "flex-end",
                gap: 10,
              }}
            >
              <Pressable
                onPress={() => setAdding(false)}
                style={{ paddingHorizontal: 14, paddingVertical: 8 }}
              >
                <Text style={{ color: "#fff" }}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  if (!url.trim()) return;
                  onAddExternal?.(url.trim());
                  setAdding(false);
                  setUrl("");
                }}
                style={{
                  paddingHorizontal: 14,
                  paddingVertical: 8,
                  backgroundColor: "#fff",
                  borderRadius: 8,
                }}
              >
                <Text style={{ color: "#000" }}>Add</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </Modal>
  );
}
