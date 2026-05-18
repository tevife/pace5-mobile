import { router } from "expo-router";
import React from "react";
import {
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BoxIcon } from "@/components/BoxIcon";
import { SiteWebView } from "@/components/SiteWebView";
import { useHealth } from "@/contexts/HealthContext";
import { useColors } from "@/hooks/useColors";

function HealthBanner() {
  const colors = useColors();
  const { isAvailable, isAuthorized } = useHealth();
  const insets = useSafeAreaInsets();

  if (!isAvailable || Platform.OS !== "ios") return null;

  return (
    <TouchableOpacity
      style={[
        styles.banner,
        {
          backgroundColor: isAuthorized ? colors.primary : colors.card,
          marginTop: insets.top + 12,
          marginHorizontal: 16,
        },
      ]}
      onPress={() => router.push("/saude")}
      activeOpacity={0.85}
    >
      <View style={styles.bannerIcon}>
        <BoxIcon
          name="Running"
          size={22}
          fill={isAuthorized ? "#fff" : colors.primary}
          pack="filled"
        />
      </View>
      <View style={styles.bannerText}>
        <Text
          style={[
            styles.bannerTitle,
            { color: isAuthorized ? "#fff" : colors.foreground },
          ]}
        >
          Apple Health
        </Text>
        <Text
          style={[
            styles.bannerSub,
            { color: isAuthorized ? "rgba(255,255,255,0.8)" : colors.mutedForeground },
          ]}
        >
          {isAuthorized ? "Ver corridas, passos e calorias" : "Toque para conectar"}
        </Text>
      </View>
      <BoxIcon
        name="Running"
        size={18}
        fill={isAuthorized ? "rgba(255,255,255,0.7)" : colors.mutedForeground}
        pack="basic"
      />
    </TouchableOpacity>
  );
}

export default function PerfilScreen() {
  const { isAvailable } = useHealth();

  if (Platform.OS === "ios" && isAvailable) {
    return (
      <View style={styles.container}>
        <HealthBanner />
        <View style={styles.webviewWrapper}>
          <SiteWebView url="https://pace5.com.br/perfil" />
        </View>
      </View>
    );
  }

  return <SiteWebView url="https://pace5.com.br/perfil" />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  webviewWrapper: {
    flex: 1,
  },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 14,
    padding: 14,
    marginBottom: 8,
  },
  bannerIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  bannerText: {
    flex: 1,
    gap: 2,
  },
  bannerTitle: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  bannerSub: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
});
