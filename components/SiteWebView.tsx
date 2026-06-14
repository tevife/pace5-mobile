import { router, useFocusEffect } from "expo-router";
import * as SecureStore from "expo-secure-store";
import * as WebBrowser from "expo-web-browser";
import React, { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  BackHandler,
  Linking,
  Platform,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { WebView, WebViewMessageEvent, WebViewNavigation } from "react-native-webview";

import { useBiometric } from "@/contexts/BiometricContext";
import { useColors } from "@/hooks/useColors";
import { useTabBar } from "@/contexts/TabBarContext";
import { consumePendingDeepLink, registerDeepLinkListener } from "@/utils/deepLink";
import {
  registerInjectJS,
  dispatchHealthSyncResult,
  dispatchCalendarRacesResult,
} from "@/utils/webViewBridge";

export const PACE5_TOKEN_KEY = "pace5_auth_token";

// URL pattern → Expo Router tab route mapping
// Order matters: more specific patterns first
const TAB_URL_MAP: { pattern: RegExp; route: string }[] = [
  { pattern: /\/perfil\/calendario/, route: "/calendario" },
  { pattern: /\/corridas/,           route: "/"           },
  { pattern: /\/avaliacoes/,         route: "/ranking"    },
  { pattern: /\/ai/,                 route: "/ai"         },
  { pattern: /\/perfil/,             route: "/perfil"     },
];

// Returns the tab route that owns a given URL, or null if unrecognised
function getTabRouteForUrl(tabUrl: string): string | null {
  const path = tabUrl.replace(/^https?:\/\/pace5\.com\.br/, "");
  for (const { pattern, route } of TAB_URL_MAP) {
    if (pattern.test(path)) return route;
  }
  return null;
}

// Module-level flag: true when a tab switch was triggered by URL detection
// (not by the user tapping the tab). Prevents useFocusEffect from resetting the URL.
let urlDrivenNavigation = false;

// Service workers and caches are intentionally preserved: the site relies on
// service workers for its own biometric / WebAuthn auth flow and PWA features.
// Also signals to the site that it is running inside the native app.
const NOOP_JS = `window.pace5NativeApp = true; true;`;

// Hides the site footer and disables the logo home link
const HIDE_FOOTER_JS = `
(function() {
  function hideFooters() {
    var footers = document.getElementsByTagName('footer');
    for (var i = 0; i < footers.length; i++) {
      footers[i].style.setProperty('display', 'none', 'important');
    }
    var contentinfo = document.querySelectorAll('[role="contentinfo"]');
    for (var j = 0; j < contentinfo.length; j++) {
      contentinfo[j].style.setProperty('display', 'none', 'important');
    }
  }

  function disableLogoLink() {
    var selectors = [
      'header a[href="/"]',
      'nav a[href="/"]',
      'header a[href="https://pace5.com.br"]',
      'header a[href="https://pace5.com.br/"]',
      'nav a[href="https://pace5.com.br"]',
      'nav a[href="https://pace5.com.br/"]',
    ];
    selectors.forEach(function(sel) {
      var links = document.querySelectorAll(sel);
      links.forEach(function(link) {
        if (!link.dataset.logoDisabled) {
          link.dataset.logoDisabled = '1';
          link.addEventListener('click', function(e) { e.preventDefault(); });
          link.style.cursor = 'default';
        }
      });
    });
  }

  function fixViewport() {
    var existing = document.querySelector('meta[name="viewport"]');
    if (existing) {
      existing.setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no');
    } else {
      var meta = document.createElement('meta');
      meta.name = 'viewport';
      meta.content = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no';
      (document.head || document.documentElement).appendChild(meta);
    }
  }

  function hideOpenAppBanners() {
    var phrases = [
      'Abra o app Pace5',
      'sincronizar seus treinos do Apple Health',
      'Nenhum treino sincronizado',
      'Sincronização é feita automaticamente',
      'feita automaticamente pelo App Pace5',
      'Clique para verificar',
    ];

    function findCardContainer(el) {
      var node = el;
      for (var i = 0; i < 12; i++) {
        if (!node.parentElement || node.parentElement === document.body) break;
        node = node.parentElement;
        // Stop at the first ancestor that has siblings — that's the card
        if (node.parentElement && node.parentElement.children.length >= 2) {
          return node;
        }
      }
      return el;
    }

    var walker = document.createTreeWalker(document.body, 4 /* NodeFilter.SHOW_TEXT */, null);
    var toHide = [];
    var textNode;
    while ((textNode = walker.nextNode())) {
      var text = (textNode.textContent || '').trim();
      for (var p = 0; p < phrases.length; p++) {
        if (text.indexOf(phrases[p]) !== -1) {
          toHide.push(textNode.parentElement);
          break;
        }
      }
    }
    toHide.forEach(function(el) {
      if (!el) return;
      var card = findCardContainer(el);
      card.style.setProperty('display', 'none', 'important');
    });
  }

  hideFooters();
  disableLogoLink();
  fixViewport();
  hideOpenAppBanners();

  var observer = new MutationObserver(function() {
    hideFooters();
    disableLogoLink();
    hideOpenAppBanners();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  var style = document.createElement('style');
  style.textContent = [
    'footer, [role="contentinfo"] { display: none !important; }',
    'html, body { overflow-x: hidden !important; max-width: 100vw !important; }',
    '* { max-width: 100vw; box-sizing: border-box; }',
  ].join(' ');
  (document.head || document.documentElement).appendChild(style);
})();
true;
`;

// Polls the DOM every 500ms to check if the cookie banner still exists.
const BANNER_POLL_JS = `
(function() {
  function bannerExists() {
    var buttons = document.querySelectorAll('button');
    for (var i = 0; i < buttons.length; i++) {
      var text = (buttons[i].innerText || '').trim();
      if (text === 'Aceitar e Continuar' || text === 'Continuar sem aceitar') {
        return true;
      }
    }
    return false;
  }

  function postState(hasBanner) {
    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(
        JSON.stringify({ type: 'bannerState', hasBanner: hasBanner })
      );
    }
  }

  var checks = 0;
  var maxChecks = 60;

  function poll() {
    checks++;
    var has = bannerExists();
    postState(has);
    if (has && checks < maxChecks) {
      setTimeout(poll, 500);
    } else if (!has) {
      postState(false);
    }
  }

  setTimeout(poll, 1000);
})();
true;
`;

// Matches login pages AND magic-link pages so onLoginDetected fires after auth
const LOGIN_URL_PATTERN = /\/(login|entrar|auth|signin|cadastro|register|magic-link)/i;

interface SiteWebViewProps {
  url: string;
}

export function SiteWebView({ url }: SiteWebViewProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const webviewRef = useRef<WebView>(null);
  const [canGoBack, setCanGoBack] = useState(false);
  const [loading, setLoading] = useState(true);
  const { showTabBar, hideTabBar } = useTabBar();
  const hasLoadedBefore = useRef(false);
  const prevUrlRef = useRef<string>("");
  const [cacheBust, setCacheBust] = useState(() => Date.now());
  const { onLoginDetected } = useBiometric();

  const navigateWebViewTo = useCallback((targetUrl: string) => {
    webviewRef.current?.injectJavaScript(
      `window.location.replace(${JSON.stringify(targetUrl)}); true;`
    );
  }, []);

  useFocusEffect(
    useCallback(() => {
      const unregister = registerDeepLinkListener((deepUrl) => {
        navigateWebViewTo(deepUrl);
      });

      if (hasLoadedBefore.current) {
        if (urlDrivenNavigation) {
          urlDrivenNavigation = false;
        } else {
          webviewRef.current?.clearCache(true);
          setCacheBust(Date.now());
        }
      }
      hasLoadedBefore.current = true;

      return unregister;
    }, [navigateWebViewTo])
  );

  const handleNavigationStateChange = (state: WebViewNavigation) => {
    setCanGoBack(state.canGoBack);

    const webUrl = state.url;
    const prevUrl = prevUrlRef.current;
    prevUrlRef.current = webUrl;

    // Detect successful login: navigated FROM a login/magic-link URL TO a main tab route
    const wasOnLoginPage = LOGIN_URL_PATTERN.test(prevUrl);
    const isOnMainRoute = TAB_URL_MAP.some(({ pattern }) => pattern.test(webUrl));
    if (wasOnLoginPage && isOnMainRoute && prevUrl) {
      onLoginDetected();
      // Capture Bearer token from localStorage right after login
      setTimeout(() => {
        webviewRef.current?.injectJavaScript(`
          (function() {
            var keys = ['bearer_token','token','auth_token','session_token',
                        'better-auth.session_token','pace5_token'];
            for (var i = 0; i < keys.length; i++) {
              var t = localStorage.getItem(keys[i]);
              if (t && t !== 'null' && t !== 'undefined') {
                window.ReactNativeWebView.postMessage(
                  JSON.stringify({ type: 'authToken', token: t })
                );
                break;
              }
            }
          })(); true;
        `);
      }, 800);
    }

    // If the site redirects to the homepage (e.g. after logout), send to /corridas
    if (/^https?:\/\/pace5\.com\.br\/?$/.test(webUrl)) {
      webviewRef.current?.injectJavaScript(
        `window.location.replace('https://pace5.com.br/corridas'); true;`
      );
      return;
    }

    // After logout: if any tab lands on a login page and it's not already the
    // corridas tab, switch to corridas (which will reload and show login there)
    const isLoginPage = LOGIN_URL_PATTERN.test(webUrl) && !/magic-link/.test(webUrl);
    if (isLoginPage) {
      const myRoute = getTabRouteForUrl(url);
      if (myRoute !== "/") {
        urlDrivenNavigation = true;
        router.navigate("/" as any);
      }
      return;
    }

    // Detect if the WebView navigated to a URL belonging to a different tab
    for (const { pattern, route } of TAB_URL_MAP) {
      if (pattern.test(webUrl)) {
        const myRoute = getTabRouteForUrl(url);
        if (myRoute !== route) {
          urlDrivenNavigation = true;
          router.navigate(route as any);
        }
        break;
      }
    }
  };

  // Register this WebView instance with the bridge.
  // registerInjectJS now returns an unsubscribe fn — call it on unmount.
  React.useEffect(() => {
    const injectFn = (js: string) => webviewRef.current?.injectJavaScript(js);
    return registerInjectJS(injectFn);
  }, []);

  const handleMessage = (event: WebViewMessageEvent) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === "bannerState") {
        if (data.hasBanner) {
          hideTabBar();
        } else {
          showTabBar();
        }
      } else if (data.type === "authToken" && data.token) {
        SecureStore.setItemAsync(PACE5_TOKEN_KEY, data.token).catch(() => {});
      } else if (data.type === "healthSync") {
        dispatchHealthSyncResult(data);
      } else if (data.type === "calendarRaces") {
        dispatchCalendarRacesResult(data);
      }
    } catch {}
  };

  React.useEffect(() => {
    if (Platform.OS !== "android") return;
    const onBackPress = () => {
      if (canGoBack && webviewRef.current) {
        webviewRef.current.goBack();
        return true;
      }
      return false;
    };
    const sub = BackHandler.addEventListener("hardwareBackPress", onBackPress);
    return () => sub.remove();
  }, [canGoBack]);

  const handleShouldStartLoadWithRequest = (request: WebViewNavigation & { isTopFrame?: boolean }): boolean => {
    const { url: reqUrl } = request;
    const isPace5 = /^https?:\/\/(www\.)?pace5\.com\.br/.test(reqUrl);
    if (isPace5) return true;
    if (/^https?:\/\//.test(reqUrl)) {
      WebBrowser.openBrowserAsync(reqUrl, {
        presentationStyle: WebBrowser.WebBrowserPresentationStyle.AUTOMATIC,
        dismissButtonStyle: "close",
        enableBarCollapsing: true,
      });
      return false;
    }
    Linking.openURL(reqUrl).catch(() => {});
    return false;
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top, backgroundColor: colors.background }]}>
      <WebView
        key={cacheBust}
        ref={webviewRef}
        source={{ uri: url }}
        style={styles.webview}
        onLoadStart={() => setLoading(true)}
        onLoadEnd={() => {
          setLoading(false);
          const deepUrl = consumePendingDeepLink();
          if (deepUrl) navigateWebViewTo(deepUrl);
        }}
        onError={() => setLoading(false)}
        onHttpError={() => setLoading(false)}
        onNavigationStateChange={handleNavigationStateChange}
        onShouldStartLoadWithRequest={handleShouldStartLoadWithRequest}
        injectedJavaScriptBeforeContentLoaded={NOOP_JS}
        injectedJavaScript={HIDE_FOOTER_JS + BANNER_POLL_JS}
        onMessage={handleMessage}
        allowsBackForwardNavigationGestures
        javaScriptEnabled
        domStorageEnabled
        userAgent="Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1 pace5-mobile-app"
      />
      {loading && (
        <View style={[styles.loadingOverlay, { backgroundColor: colors.background }]}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  webview: {
    flex: 1,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
});
