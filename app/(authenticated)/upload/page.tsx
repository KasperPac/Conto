'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

export default function UploadPage() {
  const [key, setKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setKey(null);
    setBusy(true);
    const form = new FormData(e.currentTarget);
    const res = await fetch('/api/upload', { method: 'POST', body: form });
    const json = await res.json() as { ok?: boolean; key?: string; error?: string };
    setBusy(false);
    if (!res.ok) { setError(json.error ?? 'Upload failed'); return; }
    setKey(json.key ?? null);
  }

  return (
    <Card className="p-6 space-y-4 max-w-lg">
      <h1 className="text-xl font-semibold">Upload a file</h1>
      <p className="text-sm text-zinc-600">Pick any small file. We&apos;ll PUT it to R2 and enqueue a no-op job.</p>
      <form onSubmit={onSubmit} className="space-y-3">
        <input type="file" name="file" required className="block w-full text-sm" />
        <Button type="submit" disabled={busy}>{busy ? 'Uploading…' : 'Upload'}</Button>
      </form>
      {key && <p className="text-sm text-emerald-700">Uploaded — key: <code className="text-xs">{key}</code></p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </Card>
  );
}
