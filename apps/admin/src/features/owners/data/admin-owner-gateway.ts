import type { OwnerVerificationStatus } from '@mmg/contracts';

import type {
  OwnerVerificationDetail,
  OwnerVerificationListItem,
} from '../domain/types';

export type OwnerVerificationQuery = {
  status?: OwnerVerificationStatus;
  /** Opaque forward-only cursor returned as `nextCursor` by a previous page. */
  cursor?: string;
  /** Bounded by the gateway; see `OWNER_QUEUE_PAGE_SIZE`. */
  pageSize?: number;
};

export type OwnerVerificationPage = {
  items: OwnerVerificationListItem[];
  nextCursor: string | null;
  hasMore: boolean;
};

export interface AdminOwnerGateway {
  listOwnerVerifications(query?: OwnerVerificationQuery): Promise<OwnerVerificationPage>;

  getOwnerVerificationDetail(ownerId: string): Promise<OwnerVerificationDetail | null>;

  mintSignedDocumentUrl(storagePath: string): Promise<string | null>;
}
