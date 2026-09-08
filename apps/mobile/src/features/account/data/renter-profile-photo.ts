import { getAuth, updateProfile } from '@react-native-firebase/auth';
import { getDownloadURL, getStorage, putFile, ref } from '@react-native-firebase/storage';

const SUPPORTED_PROFILE_PHOTO_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]);

export async function uploadRenterProfilePhoto(
  renterId: string,
  fileUri: string,
  contentType: string,
): Promise<string> {
  const auth = getAuth();
  const currentUser = auth.currentUser;
  if (!currentUser || currentUser.uid !== renterId) {
    throw new Error('Sign in again before changing your profile photo.');
  }
  if (!SUPPORTED_PROFILE_PHOTO_TYPES.has(contentType)) {
    throw new Error('Choose a JPEG, PNG, WebP or HEIC image.');
  }

  const storagePath = `private/renter-profile/${renterId}/avatar`;
  const fileRef = ref(getStorage(), storagePath);
  await putFile(fileRef, fileUri, {
    contentType,
    customMetadata: {
      purpose: 'profile_photo',
      renterId,
    },
  });

  const photoURL = await getDownloadURL(fileRef);
  await updateProfile(currentUser, { photoURL });
  return photoURL;
}
