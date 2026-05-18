import React, { useEffect, useRef } from "react";
import {
  AppState,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useBiometric } from "@/contexts/BiometricContext";
import { useColors } from "@/hooks/useColors";
import { BoxIcon } from "./BoxIcon";

export function BiometricGate({ children }: { children: React.ReactNode }) {
  const {
    isLocked,
    showEnrollPrompt,
    unlock,
    enableBiometrics,
    dismissEnrollPrompt,
  } = useBiometric();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const isLockedRef = useRef(isLocked);

  useEffect(() => {
    isLockedRef.current = isLocked;
  }, [isLocked]);

  // Cold start: se o app abriu já bloqueado, dispara após a tela estar visível
  useEffect(() => {
    if (isLocked) {
      const t = setTimeout(() => unlock(), 400);
      return () => clearTimeout(t);
    }
  }, []);

  // Volta do background: dispara Face ID apenas quando o app retorna ao foreground
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active" && isLockedRef.current) {
        unlock();
      }
    });
    return () => sub.remove();
  }, [unlock]);

  return (
    <>
      {children}

      {/* App lock screen */}
      <Modal visible={isLocked} animationType="fade" transparent={false}>
        <View
          style={[
            styles.lockContainer,
            {
              backgroundColor: colors.background,
              paddingTop: insets.top + 40,
              paddingBottom: insets.bottom + 32,
            },
          ]}
        >
          <View style={styles.lockContent}>
            <BoxIcon name="Lock" size={48} fill={colors.foreground} pack="filled" />
            <Text style={[styles.lockTitle, { color: colors.foreground }]}>
              Pace5
            </Text>
            <Text style={[styles.lockSubtitle, { color: colors.mutedForeground }]}>
              Confirme sua identidade para continuar
            </Text>
          </View>

          <TouchableOpacity
            style={[styles.faceIdBtn, { backgroundColor: colors.foreground }]}
            onPress={unlock}
            activeOpacity={0.85}
          >
            <BoxIcon name="FaceId" size={22} fill="#fff" pack="basic" />
            <Text style={styles.faceIdBtnText}>Usar Face ID</Text>
          </TouchableOpacity>
        </View>
      </Modal>

      {/* Enrollment prompt bottom sheet */}
      <Modal
        visible={showEnrollPrompt}
        animationType="slide"
        transparent
        statusBarTranslucent
      >
        <View style={styles.sheetOverlay}>
          <View
            style={[
              styles.sheet,
              {
                backgroundColor: colors.card,
                paddingBottom: insets.bottom + 16,
              },
            ]}
          >
            <View style={styles.sheetHandle} />
            <BoxIcon name="FaceId" size={40} fill={colors.foreground} pack="basic" />
            <Text style={[styles.sheetTitle, { color: colors.foreground }]}>
              Ativar Face ID?
            </Text>
            <Text style={[styles.sheetDesc, { color: colors.mutedForeground }]}>
              Na próxima vez que abrir o app, o Face ID destrava direto — sem
              precisar fazer login de novo.
            </Text>

            <TouchableOpacity
              style={[styles.btn, { backgroundColor: colors.foreground }]}
              onPress={enableBiometrics}
              activeOpacity={0.85}
            >
              <Text style={styles.btnText}>Ativar Face ID</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.skipBtn}
              onPress={dismissEnrollPrompt}
            >
              <Text style={[styles.skipText, { color: colors.mutedForeground }]}>
                Agora não
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  lockContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 32,
  },
  lockContent: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
  },
  lockTitle: {
    fontSize: 28,
    fontFamily: "Inter_700Bold",
    marginTop: 4,
  },
  lockSubtitle: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 22,
  },
  faceIdBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    width: "100%",
    paddingVertical: 16,
    borderRadius: 14,
  },
  faceIdBtnText: {
    color: "#fff",
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
  sheetOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    alignItems: "center",
    gap: 12,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#ccc",
    marginBottom: 8,
  },
  sheetTitle: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
  },
  sheetDesc: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 21,
    paddingHorizontal: 8,
    marginBottom: 8,
  },
  btn: {
    width: "100%",
    paddingVertical: 15,
    borderRadius: 12,
    alignItems: "center",
  },
  btnText: {
    color: "#fff",
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
  skipBtn: {
    paddingVertical: 12,
  },
  skipText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
});
