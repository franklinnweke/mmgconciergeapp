import { colors, radii, spacing } from "@mmg/brand";
import { formatNairaFromKobo } from "@mmg/domain";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ownerCommandErrorMessage } from "@/features/owner/domain/owner-errors";
import { useAuth } from "@/core/auth/auth-context";
import { createOwnerBookingGateway } from "../data/owner-booking-gateway";
import { createOwnerBookingRepository } from "../data/owner-booking-repository";
import type { OwnerVisibleBooking } from "@mmg/contracts";
import {
  canOwnerRespond,
  hasReachedExpectedState,
  isDeclineReasonValid,
} from "../domain/owner-booking";

export function OwnerBookingDetailScreen() {
  const { bookingId } = useLocalSearchParams<{ bookingId: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const repository = useMemo(() => createOwnerBookingRepository(), []);
  const gateway = useMemo(() => createOwnerBookingGateway(), []);
  const [booking, setBooking] = useState<OwnerVisibleBooking | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<{
    state: "confirmed" | "intervention_required";
    version: number;
  } | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const retry = () => {
    setError(null);
    setLoading(true);
    setRefreshKey((key) => key + 1);
  };

  useEffect(() => {
    if (!user?.uid || !bookingId) return undefined;
    return repository.subscribe(
      user.uid,
      (snapshot) => {
        const next =
          snapshot.bookings.find((item) => item.id === bookingId) ?? null;
        setBooking(next);
        setLoading(false);
        setError(null);
        if (pending && hasReachedExpectedState(next, pending)) {
          setPending(null);
          setBusy(false);
          Alert.alert(
            "Booking updated",
            "The booking record now reflects your response.",
          );
        }
      },
      () => {
        setError(
          "This booking could not be refreshed. Your last action has not been confirmed.",
        );
        setPending(null);
        setBusy(false);
        setLoading(false);
      },
    );
  }, [bookingId, pending, refreshKey, repository, user?.uid]);

  const act = async (kind: "confirm" | "reject") => {
    if (!booking || busy) return;
    if (kind === "reject" && !isDeclineReasonValid(reason)) {
      setError(
        `Add a decline reason between 10 and 500 characters (${reason.trim().length}/500).`,
      );
      return;
    }
    setBusy(true);
    setError(null);
    const expected = {
      state:
        kind === "confirm"
          ? ("confirmed" as const)
          : ("intervention_required" as const),
      version: booking.version + 1,
    };
    setPending(expected);
    try {
      if (kind === "confirm")
        await gateway.confirm(
          booking.id,
          booking.version,
          `owner_confirm_${booking.id}_${booking.version}`,
        );
      else
        await gateway.reject(
          booking.id,
          booking.version,
          reason.trim(),
          `owner_reject_${booking.id}_${booking.version}`,
        );
    } catch (caught) {
      setPending(null);
      setBusy(false);
      setError(ownerCommandErrorMessage(caught));
    }
  };

  if (loading)
    return (
      <SafeAreaView style={styles.safe}>
        <ActivityIndicator color={colors.gold} />
      </SafeAreaView>
    );
  if (error && !booking)
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <Text style={styles.title}>Booking unavailable</Text>
          <Text accessibilityLiveRegion="polite" style={styles.muted}>
            {error}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={retry}
            style={styles.button}
          >
            <Text style={styles.buttonText}>RETRY</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.back()}
            style={styles.secondary}
          >
            <Text style={styles.secondaryText}>BACK</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  if (!booking)
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <Text style={styles.title}>Booking unavailable</Text>
          <Text style={styles.muted}>
            This record may have changed or is not assigned to your fleet.
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.back()}
            style={styles.button}
          >
            <Text style={styles.buttonText}>BACK</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <Pressable
          accessibilityLabel="Back to booking desk"
          accessibilityRole="button"
          onPress={() => router.back()}
          style={styles.back}
        >
          <Text style={styles.backText}>‹ BACK TO BOOKINGS</Text>
        </Pressable>
        <Text style={styles.title}>{booking.vehicleSnapshot.displayName}</Text>
        <Text style={styles.sectionTitle}>Booking summary</Text>
        <View style={styles.card}>
          <Text style={styles.label}>DATES</Text>
          <Text style={styles.valueSmall}>
            {booking.startDate} → {booking.endDate}
          </Text>
          <Text style={styles.label}>BASE RENTAL</Text>
          <Text style={styles.value}>
            {formatNairaFromKobo(booking.priceSnapshot.baseRentalKobo)}
          </Text>
          <Text style={styles.label}>MMG COMMISSION</Text>
          <Text style={styles.value}>
            {booking.priceSnapshot.ownerCommissionBps} bps
          </Text>
          <Text style={styles.label}>YOUR EARNINGS</Text>
          <Text style={styles.value}>
            {formatNairaFromKobo(booking.priceSnapshot.ownerEarningsKobo)}
          </Text>
        </View>
        {error ? (
          <View style={styles.errorRow}>
            <Text accessibilityLiveRegion="polite" style={styles.error}>
              {error}
            </Text>
            <Pressable accessibilityRole="button" onPress={retry} style={styles.retryButton}>
              <Text style={styles.retryText}>RETRY</Text>
            </Pressable>
          </View>
        ) : null}
        {pending ? (
          <Text accessibilityLiveRegion="polite" style={styles.muted}>
            Refreshing booking status from MMG…
          </Text>
        ) : null}
        {canOwnerRespond(booking) ? (
          <>
            <Pressable
              disabled={busy}
              onPress={() => void act("confirm")}
              style={[styles.button, busy && styles.disabled]}
            >
              <Text style={styles.buttonText}>
                {busy ? "WAITING FOR REFRESH…" : "CONFIRM BOOKING"}
              </Text>
            </Pressable>
            <TextInput
              accessibilityLabel="Decline reason"
              accessibilityHint="Enter 10 to 500 characters"
              editable={!busy}
              maxLength={500}
              multiline
              onChangeText={setReason}
              placeholder="Why can you not take this journey? (10–500 characters)"
              placeholderTextColor={colors.muted}
              style={styles.input}
              value={reason}
            />
            <Text accessibilityLiveRegion="polite" style={styles.counter}>
              {reason.trim().length}/500 characters
            </Text>
            <Pressable
              disabled={busy}
              onPress={() =>
                Alert.alert(
                  "Decline this booking?",
                  "This releases the reserved dates and opens an MMG intervention case.",
                  [
                    { text: "Keep", style: "cancel" },
                    {
                      text: "Decline",
                      style: "destructive",
                      onPress: () => void act("reject"),
                    },
                  ],
                )
              }
              style={styles.secondary}
            >
              <Text style={styles.secondaryText}>DECLINE</Text>
            </Pressable>
          </>
        ) : (
          <Text style={styles.muted}>
            This booking is no longer awaiting your response.
          </Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { backgroundColor: colors.black, flex: 1 },
  content: { gap: spacing.md, padding: spacing.lg },
  center: {
    alignItems: "center",
    flex: 1,
    gap: spacing.md,
    justifyContent: "center",
    padding: spacing.lg,
  },
  back: { minHeight: 44, justifyContent: "center" },
  backText: {
    color: colors.gold,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1,
  },
  title: { color: colors.ivory, fontSize: 30, fontWeight: "700" },
  sectionTitle: { color: colors.gold, fontSize: 12, fontWeight: "800", letterSpacing: 1.2, marginTop: spacing.md },
  muted: { color: colors.muted, fontSize: 15, lineHeight: 22 },
  card: {
    borderBottomColor: colors.graphite,
    borderBottomWidth: 1,
    borderTopColor: colors.graphite,
    borderTopWidth: 1,
    gap: 8,
    paddingVertical: spacing.md,
  },
  label: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.2,
  },
  value: {
    color: colors.ivory,
    fontSize: 22,
    fontWeight: "700",
    marginBottom: spacing.sm,
  },
  valueSmall: { color: colors.ivory, fontSize: 15, marginBottom: spacing.sm },
  button: {
    alignItems: "center",
    backgroundColor: colors.gold,
    borderRadius: radii.sm,
    justifyContent: "center",
    minHeight: 48,
    paddingHorizontal: spacing.md,
  },
  buttonText: { color: colors.black, fontWeight: "800", letterSpacing: 1 },
  secondary: {
    alignItems: "center",
    borderColor: colors.danger,
    borderRadius: radii.sm,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 48,
  },
  secondaryText: { color: colors.danger, fontWeight: "800", letterSpacing: 1 },
  input: {
    borderColor: colors.graphite,
    borderRadius: radii.sm,
    borderWidth: 1,
    color: colors.ivory,
    minHeight: 96,
    padding: spacing.md,
    textAlignVertical: "top",
  },
  counter: { color: colors.muted, fontSize: 12, textAlign: "right" },
  error: { color: "#FCA5A5" },
  errorRow: { gap: spacing.sm },
  retryButton: { alignItems: "center", borderColor: colors.gold, borderRadius: radii.sm, borderWidth: 1, justifyContent: "center", minHeight: 44, paddingHorizontal: spacing.md, alignSelf: "flex-start" },
  retryText: { color: colors.gold, fontWeight: "800", letterSpacing: 1 },
  disabled: { opacity: 0.55 },
});
