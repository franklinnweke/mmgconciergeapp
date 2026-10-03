import { colors, radii, spacing, typography } from '@mmg/brand';
import type { LagosAreaLabel } from '@mmg/contracts';
import { useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { PressableScale } from '@/components/pressable-scale';

const LAGOS_AREAS: readonly LagosAreaLabel[] = [
  'Ikoyi',
  'Victoria Island',
  'Lekki',
  'Lekki Phase 1',
  'Lagos Island',
  'Banana Island',
  'Oniru',
  'Ikeja',
  'Maryland',
  'Ajah',
  'Yaba',
  'Surulere',
];

type CheckoutProfileData = {
  fullName: string;
  areaLabel: LagosAreaLabel;
  streetAddress: string;
  landmark?: string;
};

export function RenterCheckoutProfileCompletion({
  defaultName,
  onSubmit,
  verifiedPhone,
}: {
  defaultName?: string | null;
  onSubmit: (data: CheckoutProfileData) => Promise<void>;
  verifiedPhone: string;
}) {
  const [fullName, setFullName] = useState(defaultName ?? '');
  const [areaLabel, setAreaLabel] = useState<LagosAreaLabel>('Victoria Island');
  const [streetAddress, setStreetAddress] = useState('');
  const [landmark, setLandmark] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (busy) return;
    if (fullName.trim().length < 2) {
      setError('Add your name to continue.');
      return;
    }
    if (streetAddress.trim().length < 5) {
      setError('Add your Lagos delivery address to continue.');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await onSubmit({
        fullName: fullName.trim(),
        areaLabel,
        streetAddress: streetAddress.trim(),
        landmark: landmark.trim() || undefined,
      });
    } catch {
      setError('Your renter details could not be saved. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.panel}>
      <Text style={styles.title}>Complete checkout details</Text>
      <Text style={styles.body}>
        Add the delivery details needed for this booking. Your verified phone is already linked. Renters do not upload government ID.
      </Text>

      <View style={styles.field}>
        <Text style={styles.label}>NAME</Text>
        <TextInput
          editable={!busy}
          onChangeText={setFullName}
          placeholder="Your name"
          placeholderTextColor={colors.muted}
          style={styles.input}
          value={fullName}
        />
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>VERIFIED PHONE</Text>
        <View style={styles.readOnlyField}><Text style={styles.readOnlyText}>{verifiedPhone}</Text></View>
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>DELIVERY AREA</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.areaScroller}>
          {LAGOS_AREAS.map((area) => {
            const selected = area === areaLabel;
            return (
              <PressableScale
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                key={area}
                onPress={() => setAreaLabel(area)}
                style={[styles.areaPill, selected && styles.areaPillSelected]}
              >
                <Text style={[styles.areaText, selected && styles.areaTextSelected]}>{area}</Text>
              </PressableScale>
            );
          })}
        </ScrollView>
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>STREET ADDRESS</Text>
        <TextInput
          editable={!busy}
          onChangeText={setStreetAddress}
          placeholder="15 Queens Drive, Ikoyi"
          placeholderTextColor={colors.muted}
          style={styles.input}
          value={streetAddress}
        />
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>LANDMARK (OPTIONAL)</Text>
        <TextInput
          editable={!busy}
          onChangeText={setLandmark}
          placeholder="Nearby building or landmark"
          placeholderTextColor={colors.muted}
          style={styles.input}
          value={landmark}
        />
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <PressableScale accessibilityRole="button" disabled={busy} onPress={() => void submit()} style={busy ? styles.disabled : undefined}>
        <View style={styles.button}>
          {busy ? <ActivityIndicator color={colors.black} size="small" /> : null}
          <Text style={styles.buttonText}>{busy ? 'Saving details…' : 'Save and continue to payment'}</Text>
        </View>
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  areaPill: { borderColor: colors.lineStrong, borderRadius: radii.pill, borderWidth: 1, marginRight: spacing.xs, minHeight: 38, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  areaPillSelected: { backgroundColor: colors.ivory, borderColor: colors.ivory },
  areaScroller: { flexGrow: 0 },
  areaText: { color: colors.muted, fontFamily: typography.bodyMedium, fontSize: 11 },
  areaTextSelected: { color: colors.black },
  body: { color: colors.muted, fontFamily: typography.body, fontSize: 12, lineHeight: 18, textAlign: 'center' },
  button: { alignItems: 'center', backgroundColor: colors.goldStrong, borderRadius: radii.button, flexDirection: 'row', gap: spacing.sm, justifyContent: 'center', minHeight: 48, paddingHorizontal: spacing.md },
  buttonText: { color: colors.black, fontFamily: typography.bodySemiBold, fontSize: 13 },
  disabled: { opacity: 0.55 },
  error: { color: colors.danger, fontFamily: typography.bodyMedium, fontSize: 12, lineHeight: 18, textAlign: 'center' },
  field: { gap: spacing.xs, width: '100%' },
  input: { backgroundColor: colors.graphiteRaised, borderColor: colors.lineStrong, borderRadius: radii.sm, borderWidth: 1, color: colors.ivory, fontFamily: typography.body, fontSize: 14, minHeight: 46, paddingHorizontal: spacing.md },
  label: { color: colors.muted, fontFamily: typography.bodySemiBold, fontSize: 10, letterSpacing: 0.7 },
  panel: { alignItems: 'center', backgroundColor: colors.graphite, borderColor: colors.lineStrong, borderRadius: radii.md, borderWidth: 1, gap: spacing.md, marginTop: spacing.md, padding: spacing.lg },
  readOnlyField: { backgroundColor: colors.graphiteRaised, borderColor: colors.lineStrong, borderRadius: radii.sm, borderWidth: 1, justifyContent: 'center', minHeight: 46, paddingHorizontal: spacing.md },
  readOnlyText: { color: colors.success, fontFamily: typography.bodySemiBold, fontSize: 14 },
  title: { color: colors.ivory, fontFamily: typography.display, fontSize: 18, textAlign: 'center' },
});
