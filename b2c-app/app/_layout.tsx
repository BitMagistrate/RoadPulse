/**
 * Root layout for expo-router. Wraps every screen in QueryClient + safe area.
 *
 * Headers read their titles from the active locale via the i18n hook so toggling
 * the language at runtime updates the navigation chrome as well.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { rehydrateLocale, useT } from "@/lib/i18n";
import { rehydrate } from "@/store/trip";

const qc = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
});

export default function RootLayout() {
  const { t } = useT();
  useEffect(() => {
    void rehydrateLocale();
    void rehydrate();
  }, []);
  return (
    <QueryClientProvider client={qc}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: "#0F172A" },
            headerTintColor: "white",
          }}
        >
          <Stack.Screen name="index" options={{ title: t("nav.trip") }} />
          <Stack.Screen name="floods" options={{ title: t("nav.floods") }} />
          <Stack.Screen name="wallet" options={{ title: t("nav.wallet") }} />
          <Stack.Screen name="settings" options={{ title: t("nav.settings") }} />
          <Stack.Screen name="history" options={{ title: t("nav.history") }} />
          <Stack.Screen name="isochrone" options={{ title: t("nav.isochrone") }} />
        </Stack>
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}
