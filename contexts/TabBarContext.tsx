import React, { createContext, useContext, useEffect, useState } from "react";

interface TabBarContextType {
  tabBarVisible: boolean;
  showTabBar: () => void;
  hideTabBar: () => void;
}

const TabBarContext = createContext<TabBarContextType>({
  tabBarVisible: false,
  showTabBar: () => {},
  hideTabBar: () => {},
});

export function TabBarProvider({ children }: { children: React.ReactNode }) {
  const [tabBarVisible, setTabBarVisible] = useState(false);

  // Safety fallback: always show the tab bar after 8s
  // in case the WebView JS bridge doesn't fire (e.g. network slow)
  useEffect(() => {
    const timer = setTimeout(() => setTabBarVisible(true), 8000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <TabBarContext.Provider
      value={{
        tabBarVisible,
        showTabBar: () => setTabBarVisible(true),
        hideTabBar: () => setTabBarVisible(false),
      }}
    >
      {children}
    </TabBarContext.Provider>
  );
}

export function useTabBar() {
  return useContext(TabBarContext);
}
