import { Stack, router } from "expo-router";
import React, { useMemo } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BoxIcon } from "@/components/BoxIcon";
import { useHealth } from "@/contexts/HealthContext";
import { useColors } from "@/hooks/useColors";

type PermissionItem = {
  title: string;
  description: string;
  connected: boolean;
};

function PermissionStatusCard({ item }: { item: PermissionItem }) {
  const colors = useColors();
  return (
    <View style={[styles.card, { backgroundColor: colors.card }]}>
      <View style={styles.cardHeader}>
        <Text style={[styles.cardTitle, { color: colors.foreground }]}>{item.title}</Text>
        <View
          style={[
            styles.statusPill,
            {
              backgroundColor: item.connected ? "rgba(22,163,74,0.12)" : "rgba(217,119,6,0.12)",
            },
          ]}
        >
          <Text
            style={[
              styles.statusText,
              { color: item.connected ? "#16a34a" : "#d97706" },
            ]}
          >
            {item.connected ? "conectado" : "pendente"}
          </Text>
        </View>
      </View>
      <Text style={[styles.cardDescription, { color: colors.mutedForeground }]}>
        {item.description}
      </Text>
    </View>
  );
}

export default function DadosConectadosScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { workouts, dailySummaries, requestPermissions, isAuthorized } = useHealth();

  const items = useMemo<PermissionItem[]>(
    () => [
      {
        title: "Dados de treino",
        connected: workouts.length > 0,
        description: "Corridas, duração, distância e calorias alimentam perfil, carga e evolução.",
      },
      {
        title: "Frequência cardíaca",
        connected: workouts.some((workout) => workout.averageHeartRate),
        description: "Melhora a análise de intensidade, eficiência aeróbica e risco de sobrecarga.",
      },
      {
        title: "Sono",
        connected: dailySummaries.some((day) => day.sleepDurationMinutes),
        description: "Deixa o Recovery Score mais preciso e ajuda a decidir quando reduzir carga.",
      },
      {
        title: "Recuperação",
        connected: dailySummaries.some(
          (day) => day.heartRateVariability || day.restingHeartRate
        ),
        description: "HRV e FC de repouso ajudam a detectar fadiga acumulada.",
      },
      {
        title: "VO2 máximo",
        connected: dailySummaries.some((day) => day.vo2Max),
        description: "Ajuda a estimar base aeróbica e prontidão para distâncias maiores.",
      },
      {
        title: "Dados corporais",
        connected: dailySummaries.some((day) => day.bodyMassKg),
        description: "Peso e composição contextualizam carga, gasto energético e evolução.",
      },
    ],
    [dailySummaries, workouts]
  );

  return (
    <>
      <Stack.Screen
        options={{
          title: "Dados Conectados",
          headerShown: true,
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.foreground,
          headerShadowVisible: false,
          headerLeft: () => (
            <Pressable onPress={() => router.back()} style={{ marginLeft: 8 }}>
              <Text style={[styles.backText, { color: colors.foreground }]}>Voltar</Text>
            </Pressable>
          ),
        }}
      />
      <ScrollView
        style={{ backgroundColor: colors.background }}
        contentContainerStyle={{
          paddingTop: 12,
          paddingBottom: insets.bottom + 28,
          paddingHorizontal: 16,
        }}
      >
        <View style={styles.hero}>
          <BoxIcon name="Sparkles" size={32} fill={colors.primary} pack="filled" />
          <Text style={[styles.title, { color: colors.foreground }]}>
            Quanto mais dados, melhor a análise.
          </Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            O Pace5 usa apenas os dados autorizados para calcular evolução, carga,
            recuperação, risco e prontidão. Dados ausentes não são inventados.
          </Text>
        </View>

        {items.map((item) => (
          <PermissionStatusCard key={item.title} item={item} />
        ))}

        <TouchableOpacity
          style={[styles.button, { backgroundColor: colors.foreground }]}
          onPress={requestPermissions}
          activeOpacity={0.85}
        >
          <Text style={styles.buttonText}>
            {isAuthorized ? "Revisar permissões do Apple Health" : "Conectar Apple Health"}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  backText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  hero: {
    gap: 10,
    marginBottom: 18,
  },
  title: {
    fontSize: 24,
    fontFamily: "Inter_700Bold",
    lineHeight: 30,
  },
  subtitle: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    lineHeight: 21,
  },
  card: {
    borderRadius: 12,
    padding: 14,
    gap: 8,
    marginBottom: 10,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  cardTitle: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Inter_700Bold",
  },
  statusPill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  statusText: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
  },
  cardDescription: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 20,
  },
  button: {
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: "center",
    marginTop: 10,
  },
  buttonText: {
    color: "#fff",
    fontSize: 15,
    fontFamily: "Inter_700Bold",
  },
});
