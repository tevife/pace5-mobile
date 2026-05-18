import { router, Stack, useLocalSearchParams } from "expo-router";
import { useEffect } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { setPendingDeepLink } from "@/utils/deepLink";

export default function MagicLinkScreen() {
  const { email, code, name, phone, redirect } =
    useLocalSearchParams<{
      email: string;
      code: string;
      name?: string;
      phone?: string;
      redirect?: string;
    }>();

  useEffect(() => {
    if (!email || !code) {
      router.replace("/");
      return;
    }

    // Build the equivalent https URL so the WebView handles the request.
    // The WebView's WKWebView cookie store receives the session cookie directly —
    // unlike a native fetch() which uses a separate URLSession cookie jar.
    const params = new URLSearchParams();
    params.set("email", email as string);
    params.set("code", code as string);
    if (name) params.set("name", name as string);
    if (phone) params.set("phone", phone as string);
    if (redirect) params.set("redirect", redirect as string);

    const webUrl = `https://pace5.com.br/magic-link?${params.toString()}`;

    // Hand the URL to the WebView — it will verify, receive the cookie and redirect.
    setPendingDeepLink(webUrl);
    router.replace("/");
  }, [email, code, name, phone, redirect]);

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#000" />
        <Text style={styles.text}>Entrando na sua conta...</Text>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
  },
  text: {
    marginTop: 16,
    fontSize: 14,
    color: "#666",
    fontWeight: "500",
  },
});
