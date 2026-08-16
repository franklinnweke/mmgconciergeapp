import AsyncStorage from '@react-native-async-storage/async-storage';
import type { LocalUploadedDocument } from '../domain/owner-application';

const DRAFT_UPLOAD_KEY_PREFIX = '@mmg:owner-draft-upload:';

export async function saveDraftUpload(
  ownerId: string,
  doc: LocalUploadedDocument,
): Promise<void> {
  if (!ownerId) return;
  try {
    await AsyncStorage.setItem(
      `${DRAFT_UPLOAD_KEY_PREFIX}${ownerId}`,
      JSON.stringify(doc),
    );
  } catch (error) {
    console.warn('Failed to save draft ID document to local storage:', error);
  }
}

export async function getDraftUpload(
  ownerId: string,
): Promise<LocalUploadedDocument | null> {
  if (!ownerId) return null;
  try {
    const raw = await AsyncStorage.getItem(`${DRAFT_UPLOAD_KEY_PREFIX}${ownerId}`);
    if (!raw) return null;
    return JSON.parse(raw) as LocalUploadedDocument;
  } catch (error) {
    console.warn('Failed to read draft ID document from local storage:', error);
    return null;
  }
}

export async function clearDraftUpload(ownerId: string): Promise<void> {
  if (!ownerId) return;
  try {
    await AsyncStorage.removeItem(`${DRAFT_UPLOAD_KEY_PREFIX}${ownerId}`);
  } catch (error) {
    console.warn('Failed to clear draft ID document from local storage:', error);
  }
}
