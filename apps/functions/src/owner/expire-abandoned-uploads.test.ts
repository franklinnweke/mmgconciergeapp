import { describe, expect, it } from 'vitest';

import {
  isCurrentCleanupCandidate,
  parseStoragePath,
  selectAbandonedUploads,
  selectDraftsForCleanup,
  selectRejectedForCleanup,
  type StorageObjectSummary,
} from './expire-abandoned-uploads.js';

describe('expire-abandoned-uploads logic', () => {
  describe('parseStoragePath', () => {
    it('parses valid private owner verification storage paths', () => {
      expect(parseStoragePath('private/owner-verification/owner-123/upload-abc')).toEqual({
        ownerId: 'owner-123',
        uploadId: 'upload-abc',
      });
    });

    it('returns null for foreign or invalid paths', () => {
      expect(parseStoragePath('public/owner-verification/owner-123/upload-abc')).toBeNull();
      expect(parseStoragePath('private/owner-verification/owner-123')).toBeNull();
      expect(parseStoragePath('private/owner-verification/owner-123/upload-abc/sub')).toBeNull();
    });
  });

  describe('selectAbandonedUploads', () => {
    const now = new Date('2026-08-15T12:00:00.000Z');
    const cutoff = new Date('2026-08-14T12:00:00.000Z'); // 24 hours ago
    const olderTime = new Date('2026-08-13T12:00:00.000Z'); // 48 hours ago
    const recentTime = new Date('2026-08-15T06:00:00.000Z'); // 6 hours ago

    it('preserves recent uploads even if not submitted', () => {
      const files: StorageObjectSummary[] = [
        {
          name: 'private/owner-verification/owner-1/upload-recent',
          ownerId: 'owner-1',
          uploadId: 'upload-recent',
          timeCreated: recentTime,
        },
      ];
      const activeMap = new Map<string, string>();
      expect(selectAbandonedUploads(files, activeMap, cutoff)).toHaveLength(0);
    });

    it('preserves old uploads if they are currently active in submitted ownerVerifications', () => {
      const files: StorageObjectSummary[] = [
        {
          name: 'private/owner-verification/owner-1/upload-active-submitted',
          ownerId: 'owner-1',
          uploadId: 'upload-active-submitted',
          timeCreated: olderTime,
        },
      ];
      const activeMap = new Map<string, string>([['owner-1', 'upload-active-submitted']]);
      expect(selectAbandonedUploads(files, activeMap, cutoff)).toHaveLength(0);
    });

    it('preserves a 25-hour-old draft current upload when referenced in ownerVerifications', () => {
      const uploadTime25hAgo = new Date(now.getTime() - 25 * 60 * 60 * 1000);
      const files: StorageObjectSummary[] = [
        {
          name: 'private/owner-verification/owner-draft-25h/upload-draft-current',
          ownerId: 'owner-draft-25h',
          uploadId: 'upload-draft-current',
          timeCreated: uploadTime25hAgo,
        },
      ];
      const activeMap = new Map<string, string>([['owner-draft-25h', 'upload-draft-current']]);
      expect(selectAbandonedUploads(files, activeMap, cutoff)).toHaveLength(0);
    });

    it('preserves old uploads if they are currently active in rejected ownerVerifications (until 90-day pass)', () => {
      const files: StorageObjectSummary[] = [
        {
          name: 'private/owner-verification/owner-rej/upload-active-rej',
          ownerId: 'owner-rej',
          uploadId: 'upload-active-rej',
          timeCreated: olderTime,
        },
      ];
      const activeMap = new Map<string, string>([['owner-rej', 'upload-active-rej']]);
      expect(selectAbandonedUploads(files, activeMap, cutoff)).toHaveLength(0);
    });

    it('selects unreferenced old uploads (>24h) when draft references a different uploadId', () => {
      const files: StorageObjectSummary[] = [
        {
          name: 'private/owner-verification/owner-draft/upload-orphaned-old',
          ownerId: 'owner-draft',
          uploadId: 'upload-orphaned-old',
          timeCreated: olderTime,
        },
      ];
      // Draft references a newer uploadId, so the old orphaned one is selected
      const activeMap = new Map<string, string>([['owner-draft', 'upload-new-active']]);
      const selected = selectAbandonedUploads(files, activeMap, cutoff);
      expect(selected).toHaveLength(1);
      expect(selected[0].uploadId).toBe('upload-orphaned-old');
    });

    it('selects old uploads when owner never submitted or attached verification', () => {
      const files: StorageObjectSummary[] = [
        {
          name: 'private/owner-verification/owner-1/upload-abandoned',
          ownerId: 'owner-1',
          uploadId: 'upload-abandoned',
          timeCreated: olderTime,
        },
      ];
      const activeMap = new Map<string, string>();
      const selected = selectAbandonedUploads(files, activeMap, cutoff);
      expect(selected).toHaveLength(1);
      expect(selected[0].uploadId).toBe('upload-abandoned');
    });
  });

  describe('selectDraftsForCleanup', () => {
    const now = new Date('2026-08-15T12:00:00.000Z');
    const cutoff30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    it('selects unsubmitted drafts older than 30 days with uncleared uploads', () => {
      const verifications = [
        {
          ownerId: 'owner-old-draft',
          status: 'draft',
          updatedAt: '2026-07-01T10:00:00.000Z', // > 30 days ago
          governmentId: {
            uploadId: 'upload-draft-1',
            storagePath: 'private/owner-verification/owner-old-draft/upload-draft-1',
            bytesState: 'present',
          },
        },
        {
          ownerId: 'owner-recent-draft',
          status: 'draft',
          updatedAt: '2026-08-10T10:00:00.000Z', // 5 days ago
          governmentId: {
            uploadId: 'upload-draft-2',
            storagePath: 'private/owner-verification/owner-recent-draft/upload-draft-2',
            bytesState: 'present',
          },
        },
        {
          ownerId: 'owner-already-cleared',
          status: 'draft',
          updatedAt: '2026-06-01T10:00:00.000Z',
          governmentId: {
            uploadId: 'upload-draft-3',
            storagePath: null,
            bytesState: 'cleared',
          },
        },
      ];

      const candidates = selectDraftsForCleanup(verifications, cutoff30Days);
      expect(candidates).toHaveLength(1);
      expect(candidates[0].ownerId).toBe('owner-old-draft');
      expect(candidates[0].uploadId).toBe('upload-draft-1');
      expect(candidates[0].version).toBe(1);
    });
  });

  describe('transactional candidate revalidation', () => {
    const candidate = {
      ownerId: 'owner-draft',
      uploadId: 'upload-current',
      storagePath: 'private/owner-verification/owner-draft/upload-current',
      status: 'draft' as const,
      version: 4,
    };

    it('accepts the exact current status, version, upload, and path', () => {
      expect(
        isCurrentCleanupCandidate(
          {
            status: 'draft',
            version: 4,
            governmentId: {
              uploadId: 'upload-current',
              storagePath: candidate.storagePath,
              bytesState: 'present',
            },
          },
          candidate,
        ),
      ).toBe(true);
    });

    it.each([
      ['resubmitted replacement', { governmentId: { uploadId: 'upload-new', storagePath: candidate.storagePath, bytesState: 'present' } }],
      ['concurrent review/status change', { status: 'submitted' }],
      ['concurrent profile edit/version change', { version: 5 }],
      ['stale or unexpected storage path', { governmentId: { uploadId: 'upload-current', storagePath: 'private/owner-verification/owner-draft/other', bytesState: 'present' } }],
    ])('rejects a stale %s candidate', (_label, override) => {
      const current = {
        status: 'draft',
        version: 4,
        governmentId: {
          uploadId: 'upload-current',
          storagePath: candidate.storagePath,
          bytesState: 'present',
        },
        ...override,
      };
      expect(isCurrentCleanupCandidate(current, candidate)).toBe(false);
    });
  });

  describe('selectRejectedForCleanup', () => {
    const now = new Date('2026-08-15T12:00:00.000Z');
    const cutoff90Days = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

    it('selects rejected verifications older than 90 days with uncleared uploads', () => {
      const verifications = [
        {
          ownerId: 'owner-old-rejected',
          status: 'rejected',
          reviewedAt: '2026-04-01T10:00:00.000Z', // > 90 days ago
          governmentId: {
            uploadId: 'upload-rej-1',
            storagePath: 'private/owner-verification/owner-old-rejected/upload-rej-1',
            bytesState: 'present',
          },
        },
        {
          ownerId: 'owner-recent-rejected',
          status: 'rejected',
          reviewedAt: '2026-08-01T10:00:00.000Z', // 14 days ago
          governmentId: {
            uploadId: 'upload-rej-2',
            storagePath: 'private/owner-verification/owner-recent-rejected/upload-rej-2',
            bytesState: 'present',
          },
        },
        {
          ownerId: 'owner-already-cleared-rejected',
          status: 'rejected',
          reviewedAt: '2026-03-01T10:00:00.000Z',
          governmentId: {
            uploadId: 'upload-rej-3',
            storagePath: null,
            bytesState: 'cleared',
          },
        },
      ];

      const candidates = selectRejectedForCleanup(verifications, cutoff90Days);
      expect(candidates).toHaveLength(1);
      expect(candidates[0].ownerId).toBe('owner-old-rejected');
      expect(candidates[0].uploadId).toBe('upload-rej-1');
    });
  });
});
