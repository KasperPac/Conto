'use client';
import { useState } from 'react';
import { ReceiptUploadModal } from './receipt-upload-modal';
import { ReceiptViewerModal } from './receipt-viewer-modal';

interface Props {
  transactionId: string;
  hasReceipt: boolean;
  signedUrl?: string;
  filename?: string;
  contentType?: string;
}

export function ReceiptCell({ transactionId, hasReceipt, signedUrl, filename, contentType }: Props) {
  const [mode, setMode] = useState<'upload' | 'view' | null>(null);

  return (
    <>
      <button
        onClick={() => setMode(hasReceipt ? 'view' : 'upload')}
        title={hasReceipt ? 'View receipt' : 'Attach receipt'}
        className={`text-base ${hasReceipt ? 'text-zinc-700' : 'text-zinc-300 hover:text-zinc-500'}`}
      >
        📎
      </button>
      {mode === 'upload' && (
        <ReceiptUploadModal transactionId={transactionId} onClose={() => setMode(null)} />
      )}
      {mode === 'view' && signedUrl && filename && contentType && (
        <ReceiptViewerModal
          transactionId={transactionId}
          signedUrl={signedUrl}
          filename={filename}
          contentType={contentType}
          onClose={() => setMode(null)}
        />
      )}
    </>
  );
}
