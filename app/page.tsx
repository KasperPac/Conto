import { Button } from '@/components/ui/button';

export default function Home() {
  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="space-y-4 text-center">
        <h1 className="text-2xl font-semibold">Conto</h1>
        <p className="text-zinc-600 text-sm">Phase 0 — bootstrap.</p>
        <Button>Hello</Button>
      </div>
    </main>
  );
}
