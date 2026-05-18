import { Tabs } from "expo-router";
import React from "react";

import { BoxIcon } from "@/components/BoxIcon";
import { useTabBar } from "@/contexts/TabBarContext";
import { useColors } from "@/hooks/useColors";

export default function TabLayout() {
  const colors = useColors();
  const { tabBarVisible } = useTabBar();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: "#000000",
        tabBarInactiveTintColor: "#c0c0c0",
        tabBarStyle: tabBarVisible
          ? {
              backgroundColor: colors.background,
              borderTopWidth: 1,
              borderTopColor: colors.border,
              elevation: 0,
            }
          : { display: "none" },
        tabBarLabelStyle: {
          fontSize: 11,
          fontFamily: "Inter_500Medium",
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Corridas",
          tabBarIcon: ({ color, focused }) => (
            <BoxIcon
              name="Running"
              size={24}
              fill={color}
              pack={focused ? "filled" : "basic"}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="calendario"
        options={{
          title: "Calendário",
          tabBarIcon: ({ color, focused }) => (
            <BoxIcon
              name="Calendar"
              size={24}
              fill={color}
              pack={focused ? "filled" : "basic"}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="ai"
        options={{
          title: "IA Pace5",
          tabBarIcon: ({ color, focused }) => (
            <BoxIcon
              name="Sparkles"
              size={24}
              fill={color}
              pack={focused ? "filled" : "basic"}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="ranking"
        options={{
          title: "Ranking",
          tabBarIcon: ({ color, focused }) => (
            <BoxIcon
              name="MedalStar"
              size={24}
              fill={color}
              pack={focused ? "filled" : "basic"}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="perfil"
        options={{
          title: "Perfil",
          tabBarIcon: ({ color, focused }) => (
            <BoxIcon
              name="User"
              size={24}
              fill={color}
              pack={focused ? "filled" : "basic"}
            />
          ),
        }}
      />
    </Tabs>
  );
}
