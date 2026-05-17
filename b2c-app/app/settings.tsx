/**
 * Settings + Privacy dashboard (N1).
 *
 * Surfaces the three privacy guarantees of the demo build (synthetic data,
 * k-anonymity threshold, on-device hex hashing) plus a language toggle and a
 * stub button that submits a crowdsourced flood report via the public API.
 */
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { api } from "@/lib/api";
import { useT, type Locale } from "@/lib/i18n";
import { palette, radius } from "@/lib/theme";

const DEMO_DEVICE_HASH = "rp-demo-device-0001";

export default function SettingsScreen() {
  const { t, locale, setLocale } = useT();
  const router = useRouter();

  const reportFlood = useMutation({
    mutationFn: () =>
      api.reportFlood({
        location: { lat: 10.776, lng: 106.7 },
        severity: "knee",
        note: "settings demo",
        device_hash: DEMO_DEVICE_HASH,
      }),
  });

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.heading}>{t("settings.heading")}</Text>

        <View style={styles.card}>
          <Text style={styles.cardLabel}>{t("settings.locale")}</Text>
          <View style={styles.row}>
            <LocaleButton
              active={locale === "vi"}
              label={t("settings.locale.vi")}
              onPress={() => setLocale("vi" as Locale)}
            />
            <LocaleButton
              active={locale === "en"}
              label={t("settings.locale.en")}
              onPress={() => setLocale("en" as Locale)}
            />
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardLabel}>{t("settings.privacy.heading")}</Text>
          <Bullet>{t("settings.privacy.k")}</Bullet>
          <Bullet>{t("settings.privacy.synthetic")}</Bullet>
          <Bullet>{t("settings.privacy.crowd")}</Bullet>
          <Bullet>{t("settings.privacy.location")}</Bullet>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardLabel}>{t("settings.crowd.heading")}</Text>
          <Text style={styles.bodyMuted}>{t("settings.crowd.body")}</Text>
          <Pressable
            style={[styles.ctaPrimary, reportFlood.isPending && styles.ctaDisabled]}
            disabled={reportFlood.isPending}
            onPress={() => reportFlood.mutate()}
          >
            <Text style={styles.ctaPrimaryLabel}>{t("settings.crowd.cta")}</Text>
          </Pressable>
          {reportFlood.isSuccess && (
            <Text style={styles.bodyMuted}>
              hex: {reportFlood.data.hex_id} · boost{" "}
              {(reportFlood.data.crowd_boost * 100).toFixed(0)}%
            </Text>
          )}
          {reportFlood.isError && (
            <Text style={styles.error}>{(reportFlood.error as Error).message}</Text>
          )}
        </View>

        <Pressable style={styles.ctaSecondary} onPress={() => router.push("/history")}>
          <Text style={styles.ctaSecondaryLabel}>{t("nav.history")}</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function LocaleButton({
  active,
  label,
  onPress,
}: {
  active: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.localeBtn, active && styles.localeBtnActive]}
    >
      <Text style={[styles.localeBtnLabel, active && styles.localeBtnLabelActive]}>{label}</Text>
    </Pressable>
  );
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <View style={styles.bullet}>
      <Text style={styles.bulletDot}>•</Text>
      <Text style={styles.bulletText}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.surface },
  container: { padding: 20, gap: 16 },
  heading: { fontSize: 26, fontWeight: "700", color: palette.ink },
  card: {
    backgroundColor: palette.surfaceMuted,
    borderRadius: radius.lg,
    padding: 16,
    gap: 10,
  },
  cardLabel: { fontSize: 12, color: "#475569", textTransform: "uppercase", letterSpacing: 0.6 },
  row: { flexDirection: "row", gap: 8 },
  localeBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radius.pill,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.surface,
  },
  localeBtnActive: { borderColor: palette.pulse, backgroundColor: "#DBEAFE" },
  localeBtnLabel: { color: palette.ink, fontWeight: "600" },
  localeBtnLabelActive: { color: palette.pulse },
  bullet: { flexDirection: "row", gap: 8, alignItems: "flex-start" },
  bulletDot: { color: palette.pulse, fontSize: 18, lineHeight: 22 },
  bulletText: { flex: 1, color: palette.ink, fontSize: 14, lineHeight: 22 },
  bodyMuted: { color: "#475569", fontSize: 13, lineHeight: 20 },
  ctaPrimary: {
    paddingVertical: 12,
    borderRadius: radius.md,
    alignItems: "center",
    backgroundColor: palette.pulse,
  },
  ctaDisabled: { opacity: 0.6 },
  ctaPrimaryLabel: { color: "white", fontWeight: "600" },
  ctaSecondary: {
    paddingVertical: 12,
    borderRadius: radius.md,
    alignItems: "center",
    borderWidth: 1,
    borderColor: palette.pulse,
  },
  ctaSecondaryLabel: { color: palette.pulse, fontWeight: "600" },
  error: { color: palette.bad, marginTop: 4 },
});
