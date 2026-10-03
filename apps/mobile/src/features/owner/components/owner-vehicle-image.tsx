import { Ionicons } from '@expo/vector-icons';
import { Image, type ImageProps } from 'expo-image';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useAuth } from '@/core/auth/auth-context';
import { fetchOwnerImagePreview } from '../data/owner-image-preview-gateway';
import { createOwnerImagePreviewCache } from '../data/owner-image-preview-cache';

const previews = createOwnerImagePreviewCache(fetchOwnerImagePreview);

export function OwnerVehicleImage({ vehicle, style }: {
  vehicle: { vehicleId: string; primaryImagePath: string | null };
  style?: ImageProps['style'];
}) {
  const { user, signingOut } = useAuth();
  const uid = !signingOut ? user?.uid ?? null : null;
  useEffect(() => { previews.setSession(uid); }, [uid]);
  return <ResolvedOwnerVehicleImage key={`${uid}:${vehicle.vehicleId}:${vehicle.primaryImagePath}`} uid={uid} vehicle={vehicle} style={style} />;
}

function ResolvedOwnerVehicleImage({ vehicle, style, uid }: {
  vehicle: { vehicleId: string; primaryImagePath: string | null };
  style?: ImageProps['style'];
  uid: string | null;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const identity = `${uid}:${vehicle.vehicleId}:${vehicle.primaryImagePath}`;
  const [resolvedIdentity, setResolvedIdentity] = useState('');
  useEffect(() => {
    let active = true;
    previews.setSession(uid);
    if (uid) void previews.resolve(uid, vehicle.vehicleId, vehicle.primaryImagePath, retry === 1)
      .then((value) => { if (active) { setUrl(value); setResolvedIdentity(identity); } })
      .catch(() => { if (active && retry === 0) setRetry(1); });
    return () => { active = false; };
  }, [uid, vehicle.vehicleId, vehicle.primaryImagePath, identity, retry]);

  return (
    <View style={[styles.placeholder, style]}>
      <Ionicons accessibilityLabel="Vehicle photo unavailable" color="#777" name="car-outline" size={28} />
      {url && resolvedIdentity === identity && uid ? (
        <Image cachePolicy="none" contentFit="cover" source={{ uri: url }} style={StyleSheet.absoluteFill}
          onError={() => { setUrl(null); if (retry === 0) setRetry(1); }} />
      ) : null}
    </View>
  );
}
const styles = StyleSheet.create({ placeholder: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#1E1E1E' } });
