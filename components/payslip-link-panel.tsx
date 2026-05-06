'use client';
import { useTransition } from 'react';
import { confirmIncomeLink, dismissIncomeLink } from '@/app/actions/payslips';
import { Button } from '@/components/ui/button';

interface Props {
  linkId: string;
  depositDate: string;
  depositDesc: string;
  depositAmountFormatted: string;
  confidence: number;
}

export function PayslipLinkPanel({ linkId, depositDate, depositDesc, depositAmountFormatted, confidence }: Props) {
  const [pending, startTransition] = useTransition();

  return (
    <div className="mt-3 p-3 rounded border border-amber-200 bg-amber-50 text-sm">
      <p className="font-medium text-amber-800 mb-2">Suggested deposit match</p>
      <p className="text-zinc-700">{depositDate} · {depositDesc} · {depositAmountFormatted}</p>
      <p className="text-zinc-500 text-xs mt-1">Confidence: {Math.round(confidence * 100)}%</p>
      <div className="flex gap-2 mt-3">
        <Button
          size="sm"
          disabled={pending}
          onClick={() => startTransition(() => confirmIncomeLink(linkId))}
        >
          Confirm link
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() => startTransition(() => dismissIncomeLink(linkId))}
        >
          Dismiss
        </Button>
      </div>
    </div>
  );
}
