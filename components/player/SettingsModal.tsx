import React from "react";
import {
  Dimensions,
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

export type Variant = { label: string; url?: string };

export default function SettingsModal(props: {
  visible: boolean;
  onRequestClose: () => void;
  streamType?: "hls" | "file";
  hlsVariants: Variant[];
  fileQualities: Variant[];
  selectedQuality?: string;
  onSelectQuality: (label: string, url?: string, isAuto?: boolean) => void;
  speeds?: number[];
  currentSpeed?: number;
  onSelectSpeed?: (rate: number) => void;
}) {
  const {
    visible,
    onRequestClose,
    streamType,
    hlsVariants,
    fileQualities,
    selectedQuality,
    onSelectQuality,
    speeds = [0.5, 0.75, 1, 1.25, 1.5, 2],
    currentSpeed = 1,
    onSelectSpeed,
  } = props;

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
            width: Math.min(SCREEN_WIDTH - 32, 920),
            maxHeight: SCREEN_HEIGHT * 0.85,
            backgroundColor: "#111",
            borderRadius: 12,
            paddingVertical: 14,
            paddingHorizontal: 12,
          }}
        >
          <View style={{ flexDirection: "row", gap: 16 }}>
            {/* Quality column */}
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text
                style={{
                  color: "#fff",
                  fontSize: 16,
                  fontWeight: "700",
                  marginBottom: 10,
                  alignSelf: "center",
                }}
              >
                Quality
              </Text>

              {streamType === "hls" && (
                <>
                  <Pressable
                    onPress={() => onSelectQuality("Auto", undefined, true)}
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
                        color:
                          selectedQuality === undefined ? "#a8ff4a" : "#fff",
                        fontSize: 15,
                      }}
                    >
                      Auto
                    </Text>
                  </Pressable>
                  <ScrollView style={{ maxHeight: SCREEN_HEIGHT * 0.6 }}>
                    {hlsVariants.map((v) => (
                      <Pressable
                        key={v.label}
                        onPress={() => onSelectQuality(v.label, v.url)}
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
                            color:
                              selectedQuality === v.label ? "#a8ff4a" : "#fff",
                            fontSize: 15,
                          }}
                        >
                          {v.label}
                        </Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                </>
              )}

              {streamType === "file" && (
                <ScrollView style={{ maxHeight: SCREEN_HEIGHT * 0.6 }}>
                  {fileQualities.map((q) => (
                    <Pressable
                      key={q.label}
                      onPress={() => onSelectQuality(q.label, q.url)}
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
                          color:
                            selectedQuality === q.label ? "#a8ff4a" : "#fff",
                          fontSize: 15,
                        }}
                      >
                        {q.label}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              )}
            </View>

            {/* Playback speed column */}
            {!!onSelectSpeed && (
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text
                  style={{
                    color: "#fff",
                    fontSize: 16,
                    fontWeight: "700",
                    marginBottom: 10,
                    alignSelf: "center",
                  }}
                >
                  Playback speed
                </Text>
                <ScrollView style={{ maxHeight: SCREEN_HEIGHT * 0.6 }}>
                  {speeds.map((r) => (
                    <Pressable
                      key={`rate-${r}`}
                      onPress={() => onSelectSpeed(r)}
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
                          color: currentSpeed === r ? "#a8ff4a" : "#fff",
                          fontSize: 15,
                        }}
                      >{`${r.toFixed(2).replace(/\.00$/, "")}x`}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            )}
          </View>

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
    </Modal>
  );
}
