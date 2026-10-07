import { Ionicons } from '@expo/vector-icons';
import { Image, type ImageProps } from 'expo-image';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useAuth } from '@/core/auth/auth-context';
import { fetchOwnerImagePreview } from '../data/owner-image-preview-gateway';
import { createOwnerImagePreviewCache } from '../data/owner-image-preview-cache';
import { ownerImageTimings } from '../data/owner-image-timings';

export const ownerImagePreviewCache = createOwnerImagePreviewCache(
  fetchOwnerImagePreview,
  Date.now,
  () => {
    void Image.clearMemoryCache?.();
    ownerImageTimings.clear();
  },
);

export function OwnerVehicleImage({ vehicle, style }: {
  vehicle: { vehicleId: string; primaryImagePath: string | null };
  style?: ImageProps['style'];
}) {
  const { user, signingOut } = useAuth();
  const uid = !signingOut ? user?.uid ?? null : null;
  useEffect(() => {
    ownerImagePreviewCache.setSession(uid);
  }, [uid]);
  return (
    <ResolvedOwnerVehicleImage
      key={`${uid}:${vehicle.vehicleId}:${vehicle.primaryImagePath}`}
      style={style}
      uid={uid}
      vehicle={vehicle}
    />
  );
}

export function ResolvedOwnerVehicleImage({ vehicle, style, uid }: {
  vehicle: { vehicleId: string; primaryImagePath: string | null };
  style?: ImageProps['style'];
  uid: string | null;
}) {
  const hasImage = Boolean(vehicle.primaryImagePath && uid);
  const [url, setUrl] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [status, setStatus] = useState<'loading' | 'loaded' | 'unavailable'>(() => (
    hasImage ? 'loading' : 'unavailable'
  ));
  const identity = `${uid}:${vehicle.vehicleId}:${vehicle.primaryImagePath}`;
  const [resolvedIdentity, setResolvedIdentity] = useState('');

  useEffect(() => {
    if (!uid || !vehicle.primaryImagePath) {
      return;
    }
    let active = true;
    ownerImagePreviewCache.setSession(uid);
    ownerImageTimings.start(identity);

    void ownerImagePreviewCache
      .resolve(uid, vehicle.vehicleId, vehicle.primaryImagePath, retry === 1)
      .then((value) => {
        if (!active) return;
        ownerImageTimings.markResolved(identity);
        if (value) {
          setUrl(value);
          setResolvedIdentity(identity);
        } else {
          setUrl(null);
          setStatus('unavailable');
        }
      })
      .catch(() => {
        if (!active) return;
        if (retry === 0) {
          setRetry(1);
        } else {
          setUrl(null);
          setStatus('unavailable');
        }
      });

    return () => { active = false; };
  }, [uid, vehicle.vehicleId, vehicle.primaryImagePath, identity, retry]);

  const handleLoad = () => {
    ownerImageTimings.markLoaded(identity, vehicle.vehicleId);
    setStatus('loaded');
  };

  const handleError = () => {
    setUrl(null);
    if (retry === 0) {
      setRetry(1);
    } else {
      setStatus('unavailable');
    }
  };

  return (
    <View style={[styles.placeholder, style]}>
      {status === 'loading' ? (
        <ActivityIndicator
          accessibilityLabel="Loading vehicle photo"
          color="#777"
          size="small"
        />
      ) : status === 'unavailable' ? (
        <Ionicons
          accessibilityLabel="Vehicle photo unavailable"
          color="#777"
          name="car-outline"
          size={28}
        />
      ) : null}

      {url && resolvedIdentity === identity && uid && status !== 'unavailable' ? (
        <Image
          accessibilityLabel={status === 'loaded' ? `${vehicle.vehicleId} photo` : 'Loading vehicle photo'}
          cachePolicy="memory"
          contentFit="cover"
          onError={handleError}
          onLoad={handleLoad}
          source={{ uri: url }}
          style={StyleSheet.absoluteFill}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  placeholder: {
    alignItems: 'center',
    backgroundColor: '#1E1E1E',
    justifyContent: 'center',
  },
});
