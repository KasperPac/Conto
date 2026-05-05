'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

export default function UploadPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const form = new FormData(e.currentTarget);
    const res = await fetch('/api/upload', { method: 'POST', body: form });
    const json = await res.json() as { ok?: boolean; statementId?: string; error?: string };
    setBusy(false);
    if (!res.ok) { setError(json.error ?? 'Upload failed'); return; }
    router.push('/statements');
  }

  return (
    <Card className="p-6 space-y-4 max-w-lg">
      <h1 className="text-xl font-semibold">Upload a statement</h1>
      <p className="text-sm text-zinc-600">Upload a PDF bank statement. It will be parsed automatically.</p>
      <form onSubmit={onSubmit} className="space-y-3">
        <input type="file" name="file" required accept=".pdf" className="block w-full text-sm" />
        <Button type="submit" disabled={busy}>{busy ? 'Uploading…' : 'Upload'}</Button>
      </form>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </Card>
  );
}
