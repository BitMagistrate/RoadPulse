/**
 * Trip planner — three-route picker (fast / safe / eco) with flood overlay.
 *
 * The map view is rendered with react-native-maps; the polylines for each
 * variant are coloured per `lib/theme.variantColour`. Tap a card to switch
 * the highlighted polyline. Every variant card surfaces the p10 / p90 ETA
 * window and the model's confidence badge (M8).
 */
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { api, type EtaConfidence, type LatLon, type RouteVariant, type RouteVariantName } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { palette, radius, variantColour } from "@/lib/theme";
import { useTripStore } from "@/store/trip";

const DEFAULT_ORIGIN: LatLon = { lat: 10.776, lng: 106.7 }; // District 1 HCMC
const DEFAULT_DEST: LatLon = { lat: 10.737, lng: 106.722 }; // District 7

export default function TripPlannerScreen() {
  const router = useRouter();
  const { t, locale, setLocale } = useT();
  const { setOd, setRoutes, routes, selected, select } = useTripStore();
  const [origin] = useState<LatLon>(DEFAULT_ORIGIN);
  const [destination] = useState<LatLon>(DEFAULT_DEST);

  const findRoutes = useMutation({
    mutationFn: async () => {
      const res = await api.route(origin, destination, "motorbike", locale);
      setOd(origin, destination);
      setRoutes(res);
      return res;
    },
  });

  const variants = useMemo<RouteVariant[]>(() => routes?.variants ?? [], [routes]);

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.topRow}>
          <View style={styles.banner}>
            <Text style={styles.bannerText}>{t("app.synthetic_banner")}</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="toggle language"
            onPress={() => setLocale(locale === "vi" ? "en" : "vi")}
            style={styles.localeBtn}
          >
            <Text style={styles.localeBtnLabel}>🌐 {locale === "vi" ? "VI" : "EN"}</Text>
          </Pressable>
        </View>
        <Text style={styles.heading}>{t("trip.heading")}</Text>

        <View style={styles.odCard}>
          <Field
            label={t("trip.field.from")}
            value={`${origin.lat.toFixed(3)}, ${origin.lng.toFixed(3)}`}
          />
          <Field
            label={t("trip.field.to")}
            value={`${destination.lat.toFixed(3)}, ${destination.lng.toFixed(3)}`}
          />
          <Pressable
            style={[styles.ctaPrimary, findRoutes.isPending && styles.ctaDisabled]}
            disabled={findRoutes.isPending}
            onPress={() => findRoutes.mutate()}
          >
            <Text style={styles.ctaPrimaryLabel}>
              {findRoutes.isPending ? t("trip.cta.searching") : t("trip.cta.search")}
            </Text>
          </Pressable>
          {findRoutes.isError && (
            <Text style={styles.error}>{(findRoutes.error as Error).message}</Text>
          )}
        </View>

        {variants.length > 0 && (
          <View style={styles.variants}>
            <Text style={styles.subheading}>{t("trip.routes_heading")}</Text>
            {variants.map((variant) => (
              <VariantCard
                key={variant.name}
                variant={variant}
                isSelected={selected === variant.name}
                onPress={() => select(variant.name as RouteVariantName)}
              />
            ))}
            <Pressable style={styles.ctaSecondary} onPress={() => router.push("/floods")}>
              <Text style={styles.ctaSecondaryLabel}>{t("trip.cta.flood_overlay")}</Text>
            </Pressable>
            <Pressable style={styles.ctaSecondary} onPress={() => router.push("/wallet")}>
              <Text style={styles.ctaSecondaryLabel}>{t("trip.cta.wallet")}</Text>
            </Pressable>
            <Pressable style={styles.ctaSecondary} onPress={() => router.push("/isochrone")}>
              <Text style={styles.ctaSecondaryLabel}>{t("trip.cta.isochrone")}</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={styles.fieldValue}>{value}</Text>
    </View>
  );
}

const CONFIDENCE_TINT: Record<EtaConfidence, string> = {
  low: palette.bad,
  medium: palette.hazard,
  high: palette.good,
};

function VariantCard({
  variant,
  isSelected,
  onPress,
}: { variant: RouteVariant; isSelected: boolean; onPress: () => void }) {
  const { t } = useT();
  const accent = variantColour[variant.name];
  const tint = CONFIDENCE_TINT[variant.eta_confidence];
  const variantLabel = t(`trip.variant.${variant.name}_short`);
  const minutes = Math.round(variant.duration_s / 60);
  const p10 = Math.round(variant.eta_p10_s / 60);
  const p90 = Math.round(variant.eta_p90_s / 60);
  return (
    <Pressable
      onPress={onPress}
      style={[styles.variantCard, { borderColor: isSelected ? accent : palette.surfaceMuted }]}
    >
      <View style={[styles.variantBadge, { backgroundColor: accent }]}>
        <Text style={styles.variantBadgeLabel}>{variantLabel}</Text>
      </View>
      <View style={styles.variantBody}>
        <Text style={styles.variantTime}>{t("trip.duration_min", { min: minutes })}</Text>
        <View style={styles.confRow}>
          <Text style={styles.confRange}>
            {t("trip.duration_range", { p10, p90 })}
          </Text>
          <View style={[styles.confBadge, { backgroundColor: tint }]}>
            <Text style={styles.confBadgeLabel}>
              {t(`trip.confidence.${variant.eta_confidence}`)}
            </Text>
          </View>
        </View>
        <Text style={styles.variantSub}>
          {t("trip.distance_km", { km: (variant.distance_m / 1000).toFixed(1) })} ·{" "}
          {t("trip.flood_pct", { pct: (variant.flood_score * 100).toFixed(0) })} ·{" "}
          {t("trip.toll_vnd", { vnd: variant.toll_vnd.toLocaleString("vi-VN") })}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.surface },
  container: { padding: 20, gap: 18 },
  topRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  banner: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: "rgba(245,158,11,0.16)",
    alignSelf: "flex-start",
  },
  bannerText: { color: palette.hazard, fontWeight: "600", fontSize: 11, letterSpacing: 0.6 },
  localeBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: palette.surfaceMuted,
  },
  localeBtnLabel: { fontWeight: "600", color: palette.ink, fontSize: 12 },
  heading: { fontSize: 28, fontWeight: "700", color: palette.ink },
  subheading: { fontSize: 18, fontWeight: "600", color: palette.ink, marginBottom: 8 },
  odCard: { backgroundColor: palette.surfaceMuted, borderRadius: radius.lg, padding: 16, gap: 12 },
  field: { gap: 4 },
  fieldLabel: { fontSize: 12, color: "#475569", textTransform: "uppercase", letterSpacing: 0.6 },
  fieldValue: { fontSize: 16, color: palette.ink },
  ctaPrimary: {
    marginTop: 4, paddingVertical: 14, borderRadius: radius.md, alignItems: "center",
    backgroundColor: palette.pulse,
  },
  ctaDisabled: { opacity: 0.6 },
  ctaPrimaryLabel: { color: "white", fontWeight: "600", fontSize: 16 },
  ctaSecondary: {
    paddingVertical: 12, borderRadius: radius.md, alignItems: "center",
    borderWidth: 1, borderColor: palette.pulse,
  },
  ctaSecondaryLabel: { color: palette.pulse, fontWeight: "600" },
  variants: { gap: 12 },
  variantCard: {
    flexDirection: "row", alignItems: "center", gap: 14, padding: 14,
    borderRadius: radius.lg, borderWidth: 2, backgroundColor: palette.surface,
  },
  variantBadge: {
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.pill,
  },
  variantBadgeLabel: { color: "white", fontWeight: "700", letterSpacing: 0.5 },
  variantBody: { flex: 1 },
  variantTime: { fontSize: 22, fontWeight: "700", color: palette.ink },
  variantSub: { color: "#475569", marginTop: 2 },
  confRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 2 },
  confRange: { color: "#475569", fontVariant: ["tabular-nums"], fontSize: 12 },
  confBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  confBadgeLabel: { color: "white", fontWeight: "700", fontSize: 10, letterSpacing: 0.4 },
  error: { color: palette.bad, marginTop: 4 },
});
