'use client';
import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

interface Props {
  transactionId: string;
  onClose: () => void;
}

export function ReceiptUploadModal({ transactionId, onClose }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function submit() {
    const file = inputRef.current?.files?.[0];
    if (!file) { setError('Please select a file'); return; }
    const allowed = ['application/pdf', 'image/jpeg', 'image/png'];
    if (!allowed.includes(file.type)) { setError('Only PDF, JPG, or PNG files are supported'); return; }
    if (file.size > 10 * 1024 * 1024) { setError('File must be under 10 MB'); return; }

    startTransition(async () => {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('transactionId', transactionId);
      const res = await fetch('/api/receipts/upload', { method: 'POST', body: fd });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError((body as { error?: string }).error ?? 'Upload failed');
        return;
      }
      router.refresh();
      onClose();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl p-6 w-80" onClick={e => e.stopPropagation()}>
        <h2 className="text-base font-semibold mb-4">Attach receipt</h2>
        <input ref={inputRef} type="file" accept=".pdf,.jpg,.jpeg,.png" className="mb-3 text-sm w-full" />
        {error && <p className="text-red-600 text-sm mb-3">{error}</p>}
        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="px-3 py-1.5 text-sm border rounded">Cancel</button>
          <button onClick={submit} disabled={pending} className="px-3 py-1.5 text-sm bg-zinc-900 text-white rounded">
            {pending ? 'Uploading…' : 'Upload'}
          </button>
        </div>
      </div>
    </div>
  );
}
