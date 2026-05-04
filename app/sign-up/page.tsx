'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { signUp } from '@/lib/auth/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';

export default function SignUpPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) { setError('Passwords do not match'); return; }
    setBusy(true);
    const res = await signUp.email({ email, password, name: email.split('@')[0] ?? email });
    setBusy(false);
    if (res.error) { setError(res.error.message ?? 'Sign-up failed'); return; }
    router.push('/dashboard');
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <Card className="w-full max-w-sm p-6 space-y-4">
        <h1 className="text-xl font-semibold">Create an account</h1>
        <form onSubmit={onSubmit} className="space-y-3">
          <div><Label htmlFor="email">Email</Label><Input id="email" name="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          <div><Label htmlFor="password">Password</Label><Input id="password" name="password" type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} /></div>
          <div><Label htmlFor="confirm">Confirm password</Label><Input id="confirm" name="confirm" type="password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} /></div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" disabled={busy} className="w-full">{busy ? 'Creating…' : 'Create account'}</Button>
        </form>
        <p className="text-sm text-zinc-600">Already have an account? <a href="/sign-in" className="underline">Sign in</a>.</p>
      </Card>
    </main>
  );
}
