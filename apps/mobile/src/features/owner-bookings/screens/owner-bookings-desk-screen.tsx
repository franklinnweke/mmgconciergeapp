import { Ionicons } from "@expo/vector-icons";
import { colors, radii, spacing } from "@mmg/brand";
import { formatNairaFromKobo } from "@mmg/domain";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAuth } from "@/core/auth/auth-context";
import {
  createOwnerBookingRepository,
  type OwnerBookingSnapshot,
} from "../data/owner-booking-repository";
import { groupOwnerBookings } from "../domain/owner-booking";

function formatNaira(value: number) {
  return formatNairaFromKobo(value);
}

export function OwnerBookingsDeskScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const repository = useMemo(() => createOwnerBookingRepository(), []);
  const [snapshot, setSnapshot] = useState<OwnerBookingSnapshot>({
    bookings: [],
    skippedInvalidCount: 0,
    source: "unavailable",
  });
  const [loading, setLoading] = useState(Boolean(user?.uid));
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const retry = () => {
    setError(null);
    setLoading(true);
    setRefreshKey((key) => key + 1);
  };

  useEffect(() => {
    if (!user?.uid) return undefined;
    return repository.subscribe(
      user.uid,
      (next) => {
        setSnapshot(next);
        setError(null);
        setLoading(false);
      },
      () => {
        setLoading(false);
        setError(
          "Bookings could not be loaded. Check your connection and retry.",
        );
      },
    );
  }, [repository, user?.uid, refreshKey]);

  const groups = groupOwnerBookings(snapshot.bookings);
  const sections = [
    ["AWAITING YOU", groups.awaiting],
    ["CONFIRMED", groups.confirmed],
    ["NEEDS ATTENTION", groups.attention],
    ["OTHER", groups.other],
  ] as const;
  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={retry}
            tintColor={colors.gold}
          />
        }
      >
        <Text style={styles.title}>Booking desk</Text>
        {snapshot.source === "development_fixture" ? (
          <View style={styles.fixture}>
            <Ionicons color={colors.black} name="flask-outline" size={16} />
            <Text style={styles.fixtureText}>
              DEVELOPMENT FIXTURE · ACTIONS DO NOT CHANGE LIVE DATA
            </Text>
          </View>
        ) : null}
        {snapshot.skippedInvalidCount > 0 ? (
          <View style={styles.warning}>
            <Text style={styles.warningText}>
              {snapshot.skippedInvalidCount} booking record
              {snapshot.skippedInvalidCount === 1 ? "" : "s"} could not be
              displayed.
            </Text>
          </View>
        ) : null}
        {error ? (
          <View style={styles.error}>
            <Text style={styles.errorText}>{error}</Text>
            <Pressable
              accessibilityLabel="Retry loading bookings"
              accessibilityRole="button"
              onPress={retry}
              style={styles.retry}
            >
              <Text style={styles.retryText}>RETRY</Text>
            </Pressable>
          </View>
        ) : null}
        {loading && snapshot.bookings.length === 0 ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.gold} />
            <Text style={styles.muted}>Loading bookings...</Text>
          </View>
        ) : null}
        {!loading && !error && snapshot.bookings.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No paid bookings yet.</Text>
            <Text style={styles.muted}>
              Payment is not available in this release.
            </Text>
          </View>
        ) : null}
        {sections.map(([label, bookings]) =>
          bookings.length ? (
            <View key={label} style={styles.section}>
              <Text style={styles.sectionLabel}>{label}</Text>
              {bookings.map((booking) => (
                <Pressable
                  key={booking.id}
                  accessibilityLabel={`Open booking for ${booking.vehicleSnapshot.displayName}`}
                  accessibilityRole="button"
                  onPress={() =>
                    router.push({
                      pathname: "/(owner)/owner-bookings/[bookingId]" as never,
                      params: { bookingId: booking.id },
                    })
                  }
                  style={styles.row}
                >
                  <View style={styles.rowBody}>
                    <Text style={styles.vehicle}>
                      {booking.vehicleSnapshot.displayName}
                    </Text>
                    <Text style={styles.meta}>
                      {booking.startDate} → {booking.endDate}
                    </Text>
                    <Text style={styles.meta}>
                      {booking.state.replaceAll('_', ' ')} · {formatNaira(booking.priceSnapshot.ownerEarningsKobo)}
                    </Text>
                  </View>
                  <Ionicons
                    color={colors.muted}
                    name="chevron-forward"
                    size={18}
                  />
                </Pressable>
              ))}
            </View>
          ) : null,
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { backgroundColor: colors.black, flex: 1 },
  content: { gap: spacing.md, padding: spacing.lg },
  title: { color: colors.ivory, fontSize: 34, fontWeight: "700" },
  fixture: {
    alignItems: "center",
    backgroundColor: colors.gold,
    borderRadius: radii.sm,
    flexDirection: "row",
    gap: 8,
    minHeight: 44,
    padding: spacing.sm,
  },
  fixtureText: {
    color: colors.black,
    flex: 1,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  warning: {
    backgroundColor: "rgba(212,175,55,0.12)",
    borderRadius: radii.sm,
    padding: spacing.sm,
  },
  warningText: { color: colors.gold, fontSize: 13 },
  error: {
    backgroundColor: "rgba(239,68,68,0.14)",
    borderRadius: radii.sm,
    gap: spacing.sm,
    padding: spacing.md,
  },
  errorText: { color: "#FCA5A5" },
  retry: { justifyContent: "center", minHeight: 44 },
  retryText: { color: colors.gold, fontWeight: "800" },
  center: { alignItems: "center", gap: spacing.sm, padding: spacing.xl },
  muted: { color: colors.muted, fontSize: 14 },
  empty: {
    alignItems: "center",
    borderColor: colors.graphite,
    borderRadius: radii.md,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.xl,
  },
  emptyTitle: { color: colors.ivory, fontSize: 20, fontWeight: "700" },
  section: { gap: spacing.sm },
  sectionLabel: {
    color: colors.gold,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1.4,
  },
  row: {
    alignItems: "center",
    backgroundColor: colors.graphite,
    borderRadius: radii.md,
    flexDirection: "row",
    gap: spacing.md,
    minHeight: 72,
    padding: spacing.md,
  },
  rowBody: { flex: 1, gap: 4 },
  vehicle: { color: colors.ivory, fontSize: 16, fontWeight: "700" },
  meta: { color: colors.muted, fontSize: 13 },
});
