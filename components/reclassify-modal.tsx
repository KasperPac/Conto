'use client';
import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { reclassifyTransaction } from '@/app/actions/reclassify';

interface Category { id: string; name: string; }

interface Props {
  transactionId: string;
  description: string;
  currentCategoryId: string | null;
  currentCategoryName: string | null;
  categories: Category[];
}

export function ReclassifyButton({
  transactionId,
  description,
  currentCategoryId,
  currentCategoryName,
  categories,
}: Props) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(currentCategoryId ?? '');
  const [busy, setBusy] = useState(false);

  async function handleSave(applyToAll: boolean) {
    if (!selected) return;
    setBusy(true);
    await reclassifyTransaction(transactionId, selected, applyToAll);
    setBusy(false);
    setOpen(false);
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="text-xs px-2 py-0.5 rounded border text-zinc-500 cursor-pointer hover:bg-zinc-100"
      >
        {currentCategoryName ?? 'Uncategorised'}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Categorise transaction</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-zinc-600 truncate">{description}</p>
          <Select value={selected} onValueChange={setSelected}>
            <SelectTrigger>
              <SelectValue placeholder="Select category" />
            </SelectTrigger>
            <SelectContent>
              {categories.map(c => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button variant="outline" disabled={busy} onClick={() => handleSave(false)}>
              This transaction only
            </Button>
            <Button disabled={busy || !selected} onClick={() => handleSave(true)}>
              Apply to all matching
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
