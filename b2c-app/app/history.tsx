/**
 * Trip history + replay (N4).
 *
 * The list is read straight from the persisted trip store. Tapping "replay"
 * pushes the OD pair back onto the active trip state and navigates to the
 * planner, which will re-route automatically next time the user taps "find".
 */
import { useRouter } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useT } from "@/lib/i18n";
import { palette, radius, variantColour } from "@/lib/theme";
import { useTripStore } from "@/store/trip";

export default function HistoryScreen() {
  const { t } = useT();
  const router = useRouter();
  const { history, setOd, select } = useTripStore();

  if (history.length === 0) {
    return (
      <SafeAreaView style={styles.screen}>
        <Text style={styles.heading}>{t("history.heading")}</Text>
        <Text style={styles.muted}>{t("history.empty")}</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.heading}>{t("history.heading")}</Text>
        {history.map((entry) => {
          const accent = variantColour[entry.selected];
          const date = new Date(entry.saved_at_ms);
          const stamp = `${date.toLocaleDateString()} ${date
            .toLocaleTimeString()
            .slice(0, 5)}`;
          return (
            <View key={entry.id} style={styles.row}>
              <View style={[styles.badge, { backgroundColor: accent }]}>
                <Text style={styles.badgeLabel}>
                  {t(`trip.variant.${entry.selected}_short`)}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{stamp}</Text>
                <Text style={styles.rowSub}>
                  {t("trip.distance_km", { km: (entry.distance_m / 1000).toFixed(1) })} ·{" "}
                  {t("trip.duration_min", { min: Math.round(entry.duration_s / 60) })} ·{" "}
                  {t("trip.flood_pct", { pct: (entry.flood_score * 100).toFixed(0) })}
                </Text>
              </View>
              <Pressable
                onPress={() => {
                  setOd(entry.origin, entry.destination);
                  select(entry.selected);
                  router.push("/");
                }}
                style={styles.replayBtn}
              >
                <Text style={styles.replayBtnLabel}>{t("history.replay")}</Text>
              </Pressable>
            </View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.surface, padding: 20, gap: 12 },
  container: { gap: 12, paddingBottom: 32 },
  heading: { fontSize: 24, fontWeight: "700", color: palette.ink },
  muted: { color: "#475569" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: radius.lg,
    backgroundColor: palette.surfaceMuted,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  badgeLabel: { color: "white", fontWeight: "700", fontSize: 11, letterSpacing: 0.4 },
  rowTitle: { color: palette.ink, fontWeight: "600" },
  rowSub: { color: "#475569", fontSize: 12, marginTop: 2 },
  replayBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.pill,
    backgroundColor: palette.pulse,
  },
  replayBtnLabel: { color: "white", fontWeight: "600", fontSize: 12 },
});
