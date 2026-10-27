import AsyncStorage from '@react-native-async-storage/async-storage';
import { CryptoDigestAlgorithm, digestStringAsync, randomUUID } from 'expo-crypto';
import type { CreateRentalRequestData } from '@mmg/contracts/rental-request';
import { rentalRequestFingerprint } from './rental-request-gateway-core';

const pending = new Map<string, Promise<unknown>>();
const storageKey = (uid: string) => `@mmg/rental-request-attempt/v1/${uid}`;

function serialize<T>(uid: string, task: () => Promise<T>): Promise<T> {
  const result = (pending.get(uid) ?? Promise.resolve()).catch(() => undefined).then(task);
  pending.set(uid, result);
  void result.finally(() => { if (pending.get(uid) === result) pending.delete(uid); }).catch(() => undefined);
  return result;
}

/** Persist only an opaque payload hash + command key, never pickup/contact data. */
export async function prepareRentalRequestAttempt(uid: string, data: CreateRentalRequestData): Promise<string> {
  const hash = await digestStringAsync(CryptoDigestAlgorithm.SHA256, rentalRequestFingerprint(data));
  return serialize(uid, async () => {
    const raw = await AsyncStorage.getItem(storageKey(uid));
    let saved: { hash?: unknown; key?: unknown } = {};
    try { saved = raw ? JSON.parse(raw) : {}; } catch { /* Replace malformed local metadata. */ }
    if (saved?.hash === hash && typeof saved.key === 'string' && /^rental_request_[a-zA-Z0-9_-]{16,64}$/.test(saved.key)) return saved.key;
    const key = `rental_request_${randomUUID()}`;
    await AsyncStorage.setItem(storageKey(uid), JSON.stringify({ hash, key }));
    return key;
  });
}

export async function completeRentalRequestAttempt(uid: string, key: string): Promise<void> {
  await serialize(uid, async () => {
    const raw = await AsyncStorage.getItem(storageKey(uid));
    if (!raw) return;
    try { if (JSON.parse(raw)?.key === key) await AsyncStorage.removeItem(storageKey(uid)); } catch { /* Server success must not be disguised as failure. */ }
  });
}
