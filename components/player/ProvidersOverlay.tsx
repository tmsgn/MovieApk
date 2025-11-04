import React from "react";
import {
  ActivityIndicator,
  Dimensions,
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

export type ScrapingStatus =
  | "failure"
  | "pending"
  | "notfound"
  | "success"
  | "waiting";
export type ScrapingSegment = {
  id: string;
  name: string;
  status: ScrapingStatus;
  percentage?: number;
  reason?: string;
  error?: any;
};

export type ScrapingItems = { id: string; children: string[] };

export default function ProvidersOverlay(props: {
  visible: boolean;
  onRequestClose: () => void;
  title?: string;
  sources: Record<string, ScrapingSegment>;
  order: ScrapingItems[];
  currentId?: string;
  activeProviderId?: string;
  onSelectProvider?: (id: string) => void;
}) {
  const {
    visible,
    onRequestClose,
    title,
    sources,
    order,
    currentId,
    onSelectProvider,
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
            backgroundColor: "#111",
            borderRadius: 12,
            paddingHorizontal: 16,
            paddingVertical: 12,
            maxHeight: "75%",
            width: SCREEN_WIDTH - 80,
          }}
        >
          <Text
            style={{
              color: "#fff",
              fontSize: 16,
              fontWeight: "700",
              marginBottom: 12,
            }}
          >
            {title ?? "Testing providers…"}
          </Text>

          {(!order || order.length === 0) && (
            <View style={{ alignItems: "center", paddingVertical: 20 }}>
              <ActivityIndicator color="#fff" />
              <Text style={{ color: "#aaa", marginTop: 8 }}>Verifying…</Text>
            </View>
          )}

          <ScrollView style={{ maxHeight: 420 }}>
            {order.map((o) => {
              const src = sources[o.id];
              const isCurrent = currentId === o.id;
              return (
                <View key={o.id} style={{ marginBottom: 12 }}>
                  <Row
                    name={src?.name ?? o.id}
                    status={src?.status ?? "waiting"}
                    percent={Math.round(src?.percentage ?? 0)}
                    isCurrent={isCurrent}
                    onPress={() => onSelectProvider?.(o.id)}
                  />
                  {!!o.children?.length && (
                    <View style={{ marginTop: 8, paddingLeft: 12 }}>
                      {o.children.map((childId) => {
                        const embed = sources[childId];
                        const isCurrentChild = currentId === childId;
                        return (
                          <Row
                            key={childId}
                            name={`↳ ${embed?.name ?? childId}`}
                            status={embed?.status ?? "waiting"}
                            percent={Math.round(embed?.percentage ?? 0)}
                            isCurrent={isCurrentChild}
                            small
                            onPress={() => onSelectProvider?.(childId)}
                          />
                        );
                      })}
                    </View>
                  )}
                </View>
              );
            })}
          </ScrollView>

          <View style={{ marginTop: 12, alignItems: "flex-end" }}>
            <Pressable
              style={{
                paddingHorizontal: 12,
                paddingVertical: 8,
                backgroundColor: "rgba(255,255,255,0.12)",
                borderRadius: 8,
              }}
              onPress={onRequestClose}
            >
              <Text style={{ color: "#fff" }}>Hide</Text>
            </Pressable>
          </View>
        </View>
      </Pressable>
    </Modal>
  );
}

function Row(props: {
  name: string;
  status: ScrapingStatus;
  percent: number;
  isCurrent?: boolean;
  small?: boolean;
  onPress?: () => void;
}) {
  const color =
    props.status === "success"
      ? "#a8ff4a"
      : props.status === "failure" || props.status === "notfound"
        ? "#ff8080"
        : props.status === "pending"
          ? "#ffd166"
          : "#aaa";
  return (
    <Pressable
      onPress={props.onPress}
      style={{
        paddingVertical: props.small ? 6 : 8,
        paddingHorizontal: 8,
        borderRadius: 8,
        backgroundColor: "rgba(255,255,255,0.06)",
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
      }}
    >
      <Text
        style={{ color: color, fontSize: props.small ? 12 : 14 }}
        numberOfLines={1}
      >
        {props.name} {props.isCurrent ? "•" : ""}
      </Text>
      <Text style={{ color: "#ccc", fontSize: props.small ? 12 : 13 }}>
        {props.status} {props.status === "pending" ? `(${props.percent}%)` : ""}
      </Text>
    </Pressable>
  );
}
