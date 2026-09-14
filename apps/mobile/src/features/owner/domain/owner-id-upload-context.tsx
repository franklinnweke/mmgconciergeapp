import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { GovernmentIdKind } from '@mmg/contracts';

import { useAuth } from '@/core/auth/auth-context';
import { saveDraftUpload } from '../data/owner-draft-store';
import { createOwnerVerificationGateway } from '../data/owner-verification-gateway';
import type { LocalUploadedDocument } from './owner-application';
import { ownerCommandErrorMessage } from './owner-errors';

export type OwnerIdUploadCandidate = {
  uri: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  documentKind: GovernmentIdKind;
};

export type OwnerIdUploadStatus = 'idle' | 'uploading' | 'completed' | 'error';

export type OwnerIdUploadContextValue = {
  status: OwnerIdUploadStatus;
  candidate: OwnerIdUploadCandidate | null;
  uploadId: string | null;
  uploadedDoc: LocalUploadedDocument | null;
  errorMessage: string | null;
  startUpload: (
    ownerId: string,
    asset: { uri: string; fileName: string; mimeType: string; fileSize: number },
    documentKind: GovernmentIdKind,
  ) => void;
  retryUpload: (ownerId: string) => void;
  reset: () => void;
};

const OwnerIdUploadContext = createContext<OwnerIdUploadContextValue | null>(null);

export function OwnerIdUploadProvider({ children }: { children: React.ReactNode }) {
  const auth = useAuth();
  const [status, setStatus] = useState<OwnerIdUploadStatus>('idle');
  const [candidate, setCandidate] = useState<OwnerIdUploadCandidate | null>(null);
  const [uploadId, setUploadId] = useState<string | null>(null);
  const [uploadedDoc, setUploadedDoc] = useState<LocalUploadedDocument | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const executeUpload = useCallback(
    async (ownerId: string, item: OwnerIdUploadCandidate, targetUploadId: string) => {
      setStatus('uploading');
      setErrorMessage(null);
      try {
        await auth.refreshUser();
        const gateway = createOwnerVerificationGateway();
        const uploadedMeta = await gateway.uploadPrivateIdDocument(
          ownerId,
          targetUploadId,
          item.uri,
          item.mimeType,
        );

        const byteSize =
          uploadedMeta.byteSize > 0
            ? uploadedMeta.byteSize
            : item.fileSize > 0
              ? item.fileSize
              : null;

        if (!byteSize) {
          throw new Error('Could not verify file size. Please re-select your ID photo.');
        }

        const doc: LocalUploadedDocument = {
          uploadId: targetUploadId,
          documentKind: item.documentKind,
          originalFileName: item.fileName,
          contentType: item.mimeType,
          byteSize,
          uploadedAt: uploadedMeta.uploadedAt || new Date().toISOString(),
        };

        await saveDraftUpload(ownerId, doc);
        setUploadedDoc(doc);
        setStatus('completed');
      } catch (err) {
        const code = (err as { code?: unknown })?.code;
        if (code === 'storage/unauthorized') {
          setErrorMessage(
            'Upload permission denied by server storage rules. Please verify you are signed in and try again.',
          );
        } else {
          setErrorMessage(ownerCommandErrorMessage(err));
        }
        setStatus('error');
      }
    },
    [auth],
  );

  const startUpload = useCallback(
    (
      ownerId: string,
      asset: { uri: string; fileName: string; mimeType: string; fileSize: number },
      documentKind: GovernmentIdKind,
    ) => {
      const newCandidate: OwnerIdUploadCandidate = {
        ...asset,
        documentKind,
      };
      const newUploadId = `upload-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      setCandidate(newCandidate);
      setUploadId(newUploadId);
      void executeUpload(ownerId, newCandidate, newUploadId);
    },
    [executeUpload],
  );

  const retryUpload = useCallback(
    (ownerId: string) => {
      if (!candidate) return;
      const targetUploadId =
        uploadId || `upload-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      setUploadId(targetUploadId);
      void executeUpload(ownerId, candidate, targetUploadId);
    },
    [candidate, uploadId, executeUpload],
  );

  const reset = useCallback(() => {
    setStatus('idle');
    setCandidate(null);
    setUploadId(null);
    setUploadedDoc(null);
    setErrorMessage(null);
  }, []);

  const value = useMemo(
    () => ({
      status,
      candidate,
      uploadId,
      uploadedDoc,
      errorMessage,
      startUpload,
      retryUpload,
      reset,
    }),
    [status, candidate, uploadId, uploadedDoc, errorMessage, startUpload, retryUpload, reset],
  );

  return (
    <OwnerIdUploadContext.Provider value={value}>
      {children}
    </OwnerIdUploadContext.Provider>
  );
}

export function useOwnerIdUpload() {
  const context = useContext(OwnerIdUploadContext);
  if (!context) {
    throw new Error('useOwnerIdUpload must be used within an OwnerIdUploadProvider');
  }
  return context;
}
