import AsyncStorage from "@react-native-async-storage/async-storage";
import { Stack, router } from "expo-router";
import React, { useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";
import { clearLocalCoachData } from "@/utils/coachPersistence";

const PRIVACY_KEY = "pace5.coach.privacy";

type PrivacyPreferences = {
  analysisEnabled: boolean;
  cloudSyncEnabled: boolean;
  shareWithCoach: boolean;
  shareRecoveryData: boolean;
  shareGoals: boolean;
};

const DEFAULT_PRIVACY: PrivacyPreferences = {
  analysisEnabled: true,
  cloudSyncEnabled: true,
  shareWithCoach: false,
  shareRecoveryData: false,
  shareGoals: false,
};

function PreferenceRow({
  title,
  description,
  value,
  onChange,
}: {
  title: string;
  description: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  const colors = useColors();
  return (
    <View style={[styles.row, { backgroundColor: colors.card }]}>
      <View style={styles.rowText}>
        <Text style={[styles.rowTitle, { color: colors.foreground }]}>{title}</Text>
        <Text style={[styles.rowDescription, { color: colors.mutedForeground }]}>
          {description}
        </Text>
      </View>
      <Switch value={value} onValueChange={onChange} />
    </View>
  );
}

export default function PrivacidadeCoachScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [preferences, setPreferences] = useState<PrivacyPreferences>(DEFAULT_PRIVACY);

  React.useEffect(() => {
    AsyncStorage.getItem(PRIVACY_KEY)
      .then((raw) => {
        if (!raw) return;
        setPreferences({ ...DEFAULT_PRIVACY, ...JSON.parse(raw) });
      })
      .catch(() => {});
  }, []);

  const updatePreference = (patch: Partial<PrivacyPreferences>) => {
    const next = { ...preferences, ...patch };
    setPreferences(next);
    AsyncStorage.setItem(PRIVACY_KEY, JSON.stringify(next)).catch(() => {});
  };

  const handleClearLocalData = () => {
    Alert.alert(
      "Apagar dados locais?",
      "Isso remove snapshots do Coach Engine e feedbacks salvos neste aparelho. Seus dados no Apple Health não serão apagados.",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Apagar",
          style: "destructive",
          onPress: () => {
            clearLocalCoachData()
              .then(() => Alert.alert("Dados locais apagados"))
              .catch(() => Alert.alert("Não foi possível apagar os dados locais"));
          },
        },
      ]
    );
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: "Privacidade",
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
        <Text style={[styles.title, { color: colors.foreground }]}>
          Controle seus dados do Coach Engine.
        </Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
          Nenhum dado sensível deve ser compartilhado com assessoria sem consentimento
          explícito. Esta tela controla o comportamento local preparado para o sync.
        </Text>

        <PreferenceRow
          title="Análise local ativa"
          description="Permite calcular scores e insights no aparelho usando dados autorizados."
          value={preferences.analysisEnabled}
          onChange={(value) => updatePreference({ analysisEnabled: value })}
        />
        <PreferenceRow
          title="Sincronização com nuvem"
          description="Prepara envio de snapshots e scores para o backend Pace5 quando disponível."
          value={preferences.cloudSyncEnabled}
          onChange={(value) => updatePreference({ cloudSyncEnabled: value })}
        />
        <PreferenceRow
          title="Compartilhar com coach"
          description="Autoriza compartilhamento de resumo de treinos, scores e alertas com assessoria."
          value={preferences.shareWithCoach}
          onChange={(value) => updatePreference({ shareWithCoach: value })}
        />
        <PreferenceRow
          title="Compartilhar recuperação"
          description="Inclui sono, HRV e frequência de repouso nos dados visíveis ao coach."
          value={preferences.shareRecoveryData}
          onChange={(value) => updatePreference({ shareRecoveryData: value })}
        />
        <PreferenceRow
          title="Compartilhar objetivos"
          description="Permite usar metas e calendário de provas em análises de assessoria."
          value={preferences.shareGoals}
          onChange={(value) => updatePreference({ shareGoals: value })}
        />

        <TouchableOpacity
          style={[styles.dangerButton, { borderColor: colors.destructive }]}
          onPress={handleClearLocalData}
          activeOpacity={0.85}
        >
          <Text style={[styles.dangerText, { color: colors.destructive }]}>
            Apagar dados locais do Coach
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
  title: {
    fontSize: 24,
    fontFamily: "Inter_700Bold",
    lineHeight: 30,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    lineHeight: 21,
    marginBottom: 18,
  },
  row: {
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  rowText: {
    flex: 1,
    gap: 4,
  },
  rowTitle: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
  },
  rowDescription: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 19,
  },
  dangerButton: {
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: "center",
    marginTop: 10,
  },
  dangerText: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
  },
});
