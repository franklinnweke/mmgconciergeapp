import AsyncStorage from '@react-native-async-storage/async-storage';

export type OwnerVehicleEditorStep = 1 | 2 | 3 | 4 | 5 | 6;

export type OwnerVehicleEditorSession = {
  vehicleId: string;
  step: OwnerVehicleEditorStep;
  updatedAt: string;
};

const KEY_PREFIX = '@mmg:owner-vehicle-editor:';

function storageKey(ownerId: string) {
  return `${KEY_PREFIX}${ownerId}`;
}

export async function saveOwnerVehicleEditorSession(
  ownerId: string,
  session: OwnerVehicleEditorSession,
): Promise<void> {
  if (!ownerId) return;
  try {
    await AsyncStorage.setItem(storageKey(ownerId), JSON.stringify(session));
  } catch (error) {
    console.warn('Failed to persist vehicle editor session:', error);
  }
}

export async function getOwnerVehicleEditorSession(
  ownerId: string,
): Promise<OwnerVehicleEditorSession | null> {
  if (!ownerId) return null;
  try {
    const raw = await AsyncStorage.getItem(storageKey(ownerId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<OwnerVehicleEditorSession>;
    if (
      typeof parsed.vehicleId !== 'string' ||
      !parsed.vehicleId ||
      !Number.isInteger(parsed.step) ||
      (parsed.step ?? 0) < 1 ||
      (parsed.step ?? 0) > 6 ||
      typeof parsed.updatedAt !== 'string'
    ) {
      await AsyncStorage.removeItem(storageKey(ownerId));
      return null;
    }
    return parsed as OwnerVehicleEditorSession;
  } catch (error) {
    console.warn('Failed to read vehicle editor session:', error);
    return null;
  }
}

export async function clearOwnerVehicleEditorSession(ownerId: string): Promise<void> {
  if (!ownerId) return;
  try {
    await AsyncStorage.removeItem(storageKey(ownerId));
  } catch (error) {
    console.warn('Failed to clear vehicle editor session:', error);
  }
}
