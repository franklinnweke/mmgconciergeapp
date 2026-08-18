import { Ionicons } from '@expo/vector-icons';
import { colors, radii, spacing, typography } from '@mmg/brand';
import { RenterVisibleBooking } from '@mmg/contracts';
import { formatNairaFromKobo } from '@mmg/domain';
import React, { useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, View } from 'react-native';

import { PressableScale } from '@/components/pressable-scale';
import { formatLagosDateOnly } from '@/features/discovery/data/lagos-destinations';

import { useOwnerBookings } from '../hooks/use-owner-bookings';

export function OwnerPendingReservations() {
  const { actionInProgress, confirmBooking, pendingBookings, rejectBooking } = useOwnerBookings();
  const [activeBookingId, setActiveBookingId] = useState<string | null>(null);

  if (pendingBookings.length === 0) {
    return null;
  }

  const handleConfirm = async (booking: RenterVisibleBooking) => {
    setActiveBookingId(booking.id);
    try {
      await confirmBooking(booking.id, 1);
      Alert.alert('Booking Confirmed', 'You have confirmed this luxury chauffeured rental.');
    } catch (err: any) {
      Alert.alert('Confirmation Error', err?.message || 'Could not confirm booking.');
    } finally {
      setActiveBookingId(null);
    }
  };

  const handleDecline = async (booking: RenterVisibleBooking) => {
    Alert.alert(
      'Decline Booking',
      'Are you sure you want to decline this booking? Renter will receive a prompt notification and refund.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Decline',
          style: 'destructive',
          onPress: async () => {
            setActiveBookingId(booking.id);
            try {
              await rejectBooking(booking.id, 'vehicle_maintenance', 1);
              Alert.alert('Booking Declined', 'The reservation has been declined.');
            } catch (err: any) {
              Alert.alert('Decline Error', err?.message || 'Could not decline booking.');
            } finally {
              setActiveBookingId(null);
            }
          },
        },
      ],
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.badge}>
          <View style={styles.pulseDot} />
          <Text style={styles.badgeText}>ACTION REQUIRED · {pendingBookings.length}</Text>
        </View>
        <Text style={styles.headerTitle}>Pending Escort Reservations</Text>
      </View>

      {pendingBookings.map((booking) => {
        const isProcessing = actionInProgress && activeBookingId === booking.id;

        return (
          <View key={booking.id} style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={styles.vehicleInfo}>
                <Text style={styles.vehicleName}>{booking.vehicleSnapshot.displayName}</Text>
                <Text style={styles.vehicleCategory}>
                  {booking.vehicleSnapshot.categoryLabel || 'EXECUTIVE CHAUFFEURED'}
                </Text>
              </View>
              <View style={styles.amountBadge}>
                <Text style={styles.amountLabel}>NET REVENUE</Text>
                <Text style={styles.amountValue}>
                  {formatNairaFromKobo(booking.priceSnapshot.ownerEarningsKobo)}
                </Text>
              </View>
            </View>

            <View style={styles.datesRow}>
              <View style={styles.dateBlock}>
                <Text style={styles.dateLabel}>COMMENCEMENT</Text>
                <Text style={styles.dateValue}>{formatLagosDateOnly(booking.startDate)}</Text>
              </View>
              <Ionicons color={colors.goldStrong} name="arrow-forward" size={14} />
              <View style={styles.dateBlock}>
                <Text style={styles.dateLabel}>CONCLUSION</Text>
                <Text style={styles.dateValue}>{formatLagosDateOnly(booking.endDate)}</Text>
              </View>
            </View>

            <View style={styles.actionsRow}>
              <PressableScale
                disabled={isProcessing}
                onPress={() => handleConfirm(booking)}
                style={styles.confirmButton}
              >
                <View style={styles.confirmButtonContent}>
                  {isProcessing ? (
                    <ActivityIndicator color={colors.black} size="small" />
                  ) : (
                    <Ionicons color={colors.black} name="checkmark" size={16} />
                  )}
                  <Text style={styles.confirmText}>CONFIRM ESCORT</Text>
                </View>
              </PressableScale>

              <PressableScale
                disabled={isProcessing}
                onPress={() => handleDecline(booking)}
                style={styles.declineButton}
              >
                <View style={styles.declineButtonContent}>
                  <Ionicons color={colors.danger ?? '#EF4444'} name="close" size={16} />
                  <Text style={styles.declineText}>DECLINE</Text>
                </View>
              </PressableScale>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  actionsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  amountBadge: {
    alignItems: 'flex-end',
  },
  amountLabel: {
    color: colors.muted,
    fontFamily: typography.bodyMedium,
    fontSize: 9,
    letterSpacing: 1.1,
  },
  amountValue: {
    color: colors.goldStrong,
    fontFamily: typography.bodySemiBold,
    fontSize: 14,
  },
  badge: {
    alignItems: 'center',
    backgroundColor: 'rgba(212,175,55,0.18)',
    borderColor: 'rgba(212,175,55,0.3)',
    borderRadius: radii.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 3,
  },
  badgeText: {
    color: colors.goldStrong,
    fontFamily: typography.bodySemiBold,
    fontSize: 10,
    letterSpacing: 1.2,
  },
  card: {
    backgroundColor: colors.graphite,
    borderColor: 'rgba(212,175,55,0.35)',
    borderRadius: radii.md,
    borderWidth: 1,
    padding: spacing.md,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  confirmButton: {
    flex: 2,
  },
  confirmButtonContent: {
    alignItems: 'center',
    backgroundColor: colors.goldStrong,
    borderRadius: radii.pill,
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'center',
    paddingVertical: spacing.sm + 2,
  },
  confirmText: {
    color: colors.black,
    fontFamily: typography.bodySemiBold,
    fontSize: 11,
    letterSpacing: 1.1,
  },
  container: {
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  dateBlock: {
    gap: 2,
  },
  dateLabel: {
    color: colors.muted,
    fontFamily: typography.bodyMedium,
    fontSize: 9,
    letterSpacing: 1.1,
  },
  dateValue: {
    color: colors.ivory,
    fontFamily: typography.bodySemiBold,
    fontSize: 12,
  },
  datesRow: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderColor: colors.line,
    borderRadius: radii.sm,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  declineButton: {
    flex: 1,
  },
  declineButtonContent: {
    alignItems: 'center',
    backgroundColor: 'rgba(239,68,68,0.1)',
    borderColor: 'rgba(239,68,68,0.25)',
    borderRadius: radii.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 4,
    justifyContent: 'center',
    paddingVertical: spacing.sm + 2,
  },
  declineText: {
    color: colors.danger ?? '#EF4444',
    fontFamily: typography.bodySemiBold,
    fontSize: 11,
    letterSpacing: 1.1,
  },
  header: {
    alignItems: 'flex-start',
    gap: 4,
    marginBottom: 4,
  },
  headerTitle: {
    color: colors.ivory,
    fontFamily: typography.bodySemiBold,
    fontSize: 15,
  },
  pulseDot: {
    backgroundColor: colors.goldStrong,
    borderRadius: radii.pill,
    height: 6,
    width: 6,
  },
  vehicleCategory: {
    color: colors.gold,
    fontFamily: typography.bodyMedium,
    fontSize: 10,
    letterSpacing: 1.1,
  },
  vehicleInfo: {
    gap: 2,
  },
  vehicleName: {
    color: colors.ivory,
    fontFamily: typography.bodySemiBold,
    fontSize: 14,
  },
});
