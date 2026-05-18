import { router, Stack } from "expo-router";
import { useEffect } from "react";
import { Linking } from "react-native";

import { setPendingDeepLink } from "@/utils/deepLink";

const isPace5Url = (url: string) =>
  /^https?:\/\/(www\.)?pace5\.com\.br(?:\/|$)/.test(url) ||
  /^pace5:\/\//.test(url);

const normalizeUrl = (url: string): string => {
  if (!url.startsWith("pace5://")) return url;
  const withoutScheme = url.slice("pace5://".length);
  return `https://pace5.com.br/${withoutScheme}`;
};

export default function NotFoundScreen() {
  useEffect(() => {
    Linking.getInitialURL().then((url) => {
      if (url && isPace5Url(url)) {
        setPendingDeepLink(normalizeUrl(url));
      }
      router.replace("/");
    });
  }, []);

  return <Stack.Screen options={{ headerShown: false }} />;
}
