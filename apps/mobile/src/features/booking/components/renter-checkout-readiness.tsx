import { Ionicons } from '@expo/vector-icons';
import { colors, radii, spacing, typography } from '@mmg/brand';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { useAuth } from '@/core/auth/auth-context';
import { useRenterProfile } from '@/features/account/hooks/use-renter-profile';

import { RenterCheckoutProfileCompletion } from './renter-checkout-profile-completion';
import { RenterPaymentCheckout } from './renter-payment-checkout';

type RenterCheckoutReadinessProps = {
  holdExpiresAt: string;
  intentId: string;
  onRestartHold: () => void;
  onViewTrips: () => void;
};

export function RenterCheckoutReadiness({
  holdExpiresAt,
  intentId,
  onRestartHold,
  onViewTrips,
}: RenterCheckoutReadinessProps) {
  const auth = useAuth();
  const { profile, isLoading, saveProfile } = useRenterProfile();

  if (isLoading) {
    return <LoadingPanel title="Checking checkout details" body="MMG is confirming your renter profile before payment." />;
  }

  if (!auth.user?.emailVerified) {
    return (
      <View style={styles.panel}>
        <Ionicons color={colors.goldStrong} name="mail-outline" size={25} />
        <Text style={styles.title}>Verify your email to pay</Text>
        <Text style={styles.body}>
          A verified email address is required before checkout. Confirm your email to continue.
        </Text>
      </View>
    );
  }

  if (
    !profile ||
    !profile.fullName ||
    !profile.phone ||
    !profile.defaultDeliveryAddress?.streetAddress ||
    !profile.defaultDeliveryAddress?.areaLabel
  ) {
    return (
      <RenterCheckoutProfileCompletion
        defaultName={profile?.fullName ?? auth.user?.displayName}
        defaultPhone={profile?.phone ?? auth.user?.phoneNumber}
        onSubmit={async (data) => {
          await saveProfile({
            fullName: data.fullName,
            phone: data.phone,
            defaultDeliveryAddress: {
              areaLabel: data.areaLabel,
              streetAddress: data.streetAddress,
              landmark: data.landmark,
            },
            acceptedRenterTermsVersion: profile?.acceptedRenterTermsVersion ?? '2026-03-01',
            acceptedPrivacyNoticeVersion: profile?.acceptedPrivacyNoticeVersion ?? '2026-03-01',
          });
        }}
      />
    );
  }

  if (profile.accountStatus !== 'active') {
    return (
      <View style={styles.panel}>
        <Ionicons color={colors.goldStrong} name="alert-circle-outline" size={25} />
        <Text style={styles.title}>Checkout unavailable</Text>
        <Text style={styles.body}>
          This renter profile is not active. Resolve the account status before attempting payment. The current hold will expire automatically.
        </Text>
      </View>
    );
  }

  return (
    <RenterPaymentCheckout
      holdExpiresAt={holdExpiresAt}
      intentId={intentId}
      onRestartHold={onRestartHold}
      onViewTrips={onViewTrips}
    />
  );
}

function LoadingPanel({ title, body }: { title: string; body: string }) {
  return (
    <View style={styles.panel}>
      <ActivityIndicator color={colors.goldStrong} />
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.body}>{body}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { color: colors.muted, fontFamily: typography.body, fontSize: 13, lineHeight: 19, textAlign: 'center' },
  panel: { alignItems: 'center', backgroundColor: colors.graphite, borderColor: colors.lineStrong, borderRadius: radii.md, borderWidth: 1, gap: spacing.md, marginTop: spacing.md, padding: spacing.lg },
  title: { color: colors.ivory, fontFamily: typography.display, fontSize: 18, textAlign: 'center' },
});
