'use client';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { deleteReceipt } from '@/app/actions/receipts';

interface Props {
  transactionId: string;
  signedUrl: string;
  filename: string;
  contentType: string;
  onClose: () => void;
}

export function ReceiptViewerModal({ transactionId, signedUrl, filename, contentType, onClose }: Props) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function handleDelete() {
    startTransition(async () => {
      await deleteReceipt(transactionId);
      router.refresh();
      onClose();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl p-4 w-[90vw] max-w-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-medium truncate">{filename}</span>
          <div className="flex gap-2">
            <button onClick={handleDelete} disabled={pending} className="text-sm text-red-600 hover:underline">
              {pending ? 'Removing…' : 'Remove'}
            </button>
            <button onClick={onClose} className="text-sm border rounded px-2 py-0.5">Close</button>
          </div>
        </div>
        {contentType === 'application/pdf' ? (
          <iframe src={signedUrl} className="w-full h-[70vh] rounded border" title={filename} />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={signedUrl} alt={filename} className="max-h-[70vh] mx-auto rounded" />
        )}
      </div>
    </div>
  );
}
