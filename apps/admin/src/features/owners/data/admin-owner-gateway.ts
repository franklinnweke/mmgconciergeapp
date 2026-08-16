import type { OwnerVerificationStatus } from '@mmg/contracts';

import type {
  OwnerVerificationDetail,
  OwnerVerificationListItem,
} from '../domain/types';

export interface AdminOwnerGateway {
  listOwnerVerifications(filter?: {
    status?: OwnerVerificationStatus;
  }): Promise<OwnerVerificationListItem[]>;

  getOwnerVerificationDetail(ownerId: string): Promise<OwnerVerificationDetail | null>;

  mintSignedDocumentUrl(storagePath: string): Promise<string | null>;
}
