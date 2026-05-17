/**
 * Reachability screen — the rider sees how far they can get in the next N
 * minutes from their current position. We don't render polygons here (the B2C
 * Expo Go build deliberately avoids MapLibre Native); we surface area and
 * population for each ring as a stat card list instead.
 */
import { useMutation } from "@tanstack/react-query";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { api, type IsochroneResponse } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { useTripStore } from "@/store/trip";
import { palette, radius } from "@/lib/theme";

const RING_COLORS = [palette.pulse, palette.good, palette.hazard];
const DEFAULT_ORIGIN = { lat: 10.806, lng: 106.7 };

export default function IsochroneScreen() {
  const { t } = useT();
  const storedOrigin = useTripStore((s) => s.origin);
  const origin = storedOrigin ?? DEFAULT_ORIGIN;
  const job = useMutation({
    mutationFn: () => api.isochrone(origin, [5, 10, 15]),
  });

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.banner}>
        <Text style={styles.bannerText}>{t("app.synthetic_banner")}</Text>
      </View>

      <Text style={styles.heading}>{t("iso.heading")}</Text>
      <Text style={styles.muted}>{t("iso.subtitle")}</Text>

      <Pressable
        style={[styles.cta, job.isPending && styles.ctaDisabled]}
        disabled={job.isPending}
        onPress={() => job.mutate()}
      >
        <Text style={styles.ctaLabel}>
          {job.isPending ? t("iso.cta.loading") : t("iso.cta.compute")}
        </Text>
      </Pressable>

      {job.isError && (
        <Text style={styles.error}>{(job.error as Error).message}</Text>
      )}

      <ScrollView contentContainerStyle={styles.list}>
        {job.data?.rings.map((ring, idx) => (
          <RingCard
            key={ring.minutes}
            ring={ring}
            tone={RING_COLORS[idx % RING_COLORS.length] ?? palette.pulse}
            t={t}
          />
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

function RingCard({
  ring,
  tone,
  t,
}: {
  ring: IsochroneResponse["rings"][number];
  tone: string;
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
  return (
    <View style={[styles.ring, { borderColor: tone }]}>
      <Text style={[styles.ringMin, { color: tone }]}>
        {t("iso.ring.minutes", { min: ring.minutes })}
      </Text>
      <Text style={styles.ringArea}>
        {t("iso.ring.area", { km2: ring.area_km2.toFixed(2) })}
      </Text>
      <Text style={styles.muted}>
        {t("iso.ring.population", {
          n: ring.population_reached.toLocaleString("vi-VN"),
        })}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.surface, padding: 20, gap: 12 },
  banner: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: "rgba(245,158,11,0.16)",
    alignSelf: "flex-start",
  },
  bannerText: {
    color: palette.hazard,
    fontWeight: "600",
    fontSize: 11,
    letterSpacing: 0.6,
  },
  heading: { fontSize: 22, fontWeight: "700", color: palette.ink },
  muted: { color: "#64748B" },
  cta: {
    backgroundColor: palette.pulse,
    borderRadius: radius.md,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: "center",
  },
  ctaDisabled: { opacity: 0.6 },
  ctaLabel: { color: "white", fontWeight: "700", fontSize: 16 },
  error: { color: palette.bad },
  list: { gap: 10, paddingBottom: 32 },
  ring: {
    padding: 14,
    borderRadius: radius.md,
    backgroundColor: palette.surfaceMuted,
    borderWidth: 2,
  },
  ringMin: { fontWeight: "700", marginBottom: 4 },
  ringArea: { fontSize: 18, fontWeight: "700", color: palette.ink },
});
