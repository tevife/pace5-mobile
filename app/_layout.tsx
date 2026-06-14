import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect } from "react";
import { Linking } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { BiometricGate } from "@/components/BiometricGate";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { BiometricProvider } from "@/contexts/BiometricContext";
import { HealthProvider } from "@/contexts/HealthContext";
import { TabBarProvider } from "@/contexts/TabBarContext";
import { setPendingDeepLink } from "@/utils/deepLink";

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

function RootLayoutNav() {
  return (
    <Stack screenOptions={{ headerBackTitle: "Perfil" }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen
        name="saude"
        options={{
          headerShown: false,
          presentation: "card",
        }}
      />
      <Stack.Screen
        name="dados-conectados"
        options={{
          headerShown: false,
          presentation: "card",
        }}
      />
      <Stack.Screen
        name="privacidade-coach"
        options={{
          headerShown: false,
          presentation: "card",
        }}
      />
      <Stack.Screen
        name="prova"
        options={{
          headerShown: false,
          presentation: "card",
        }}
      />
      <Stack.Screen
        name="insights"
        options={{
          headerShown: false,
          presentation: "card",
        }}
      />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  useEffect(() => {
    // Matches both https://pace5.com.br/... and pace5://...
    // The (?:\/|$) boundary prevents matching pace5.com.br.evil.tld-style URLs.
    const isPace5Url = (url: string) =>
      /^https?:\/\/(www\.)?pace5\.com\.br(?:\/|$)/.test(url) ||
      /^pace5:\/\//.test(url);

    // Converts pace5://path?query → https://pace5.com.br/path?query
    // so the WebView always receives a valid HTTPS URL it can load.
    const normalizeUrl = (url: string): string => {
      if (!url.startsWith("pace5://")) return url;
      const withoutScheme = url.slice("pace5://".length);
      return `https://pace5.com.br/${withoutScheme}`;
    };

    // App opened cold via a deep link (magic link tapped while app was closed)
    Linking.getInitialURL().then((url) => {
      if (url && isPace5Url(url)) setPendingDeepLink(normalizeUrl(url));
    });

    // App already open — incoming deep link (magic link tapped while app was in background)
    const sub = Linking.addEventListener("url", ({ url }) => {
      if (isPace5Url(url)) setPendingDeepLink(normalizeUrl(url));
    });

    return () => sub.remove();
  }, []);

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <GestureHandlerRootView>
            <KeyboardProvider>
              <HealthProvider>
                <BiometricProvider>
                  <TabBarProvider>
                    <BiometricGate>
                      <RootLayoutNav />
                    </BiometricGate>
                  </TabBarProvider>
                </BiometricProvider>
              </HealthProvider>
            </KeyboardProvider>
          </GestureHandlerRootView>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
