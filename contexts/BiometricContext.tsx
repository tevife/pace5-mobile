import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { AppState } from "react-native";

const BIOMETRIC_ENABLED_KEY = "pace5_biometric_v1";

interface BiometricContextValue {
  isAvailable: boolean;
  isAppEnrolled: boolean;
  isLocked: boolean;
  showEnrollPrompt: boolean;
  enableBiometrics: () => Promise<void>;
  disableBiometrics: () => Promise<void>;
  unlock: () => Promise<void>;
  onLoginDetected: () => void;
  dismissEnrollPrompt: () => void;
}

const BiometricContext = createContext<BiometricContextValue | null>(null);

export function BiometricProvider({ children }: { children: React.ReactNode }) {
  const [isAvailable, setIsAvailable] = useState(false);
  const [isAppEnrolled, setIsAppEnrolled] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [showEnrollPrompt, setShowEnrollPrompt] = useState(false);
  const hasOfferedEnroll = useRef(false);

  useEffect(() => {
    (async () => {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isOsEnrolled = await LocalAuthentication.isEnrolledAsync();
      const available = hasHardware && isOsEnrolled;
      setIsAvailable(available);

      const stored = await SecureStore.getItemAsync(BIOMETRIC_ENABLED_KEY);
      if (stored === "true" && available) {
        setIsAppEnrolled(true);
        setIsLocked(true);
      }
    })();
  }, []);

  // Lock when app goes to background
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "background" && isAppEnrolled) {
        setIsLocked(true);
      }
    });
    return () => sub.remove();
  }, [isAppEnrolled]);

  const unlock = useCallback(async () => {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: "Entrar no Pace5",
      fallbackLabel: "Usar código",
      cancelLabel: "Cancelar",
    });
    if (result.success) setIsLocked(false);
  }, []);

  const enableBiometrics = useCallback(async () => {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: "Confirmar ativação do Face ID",
      cancelLabel: "Cancelar",
    });
    if (!result.success) return;
    await SecureStore.setItemAsync(BIOMETRIC_ENABLED_KEY, "true");
    setIsAppEnrolled(true);
    setIsLocked(false);
    setShowEnrollPrompt(false);
  }, []);

  const disableBiometrics = useCallback(async () => {
    await SecureStore.deleteItemAsync(BIOMETRIC_ENABLED_KEY);
    setIsAppEnrolled(false);
    setIsLocked(false);
    setShowEnrollPrompt(false);
  }, []);

  const onLoginDetected = useCallback(() => {
    if (!isAvailable || isAppEnrolled || hasOfferedEnroll.current) return;
    hasOfferedEnroll.current = true;
    setShowEnrollPrompt(true);
  }, [isAvailable, isAppEnrolled]);

  const dismissEnrollPrompt = useCallback(() => {
    setShowEnrollPrompt(false);
  }, []);

  return (
    <BiometricContext.Provider
      value={{
        isAvailable,
        isAppEnrolled,
        isLocked,
        showEnrollPrompt,
        enableBiometrics,
        disableBiometrics,
        unlock,
        onLoginDetected,
        dismissEnrollPrompt,
      }}
    >
      {children}
    </BiometricContext.Provider>
  );
}

export function useBiometric() {
  const ctx = useContext(BiometricContext);
  if (!ctx)
    throw new Error("useBiometric must be used within BiometricProvider");
  return ctx;
}
