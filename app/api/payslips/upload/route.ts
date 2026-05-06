import { NextResponse } from 'next/server';
import { getCurrentUserId, UnauthenticatedError } from '@/lib/auth/server';
import { putObject } from '@/lib/storage/put-object';
import { dispatchPayslip, UnknownFormatError } from '@/lib/parsers/payslips/index';
import { createPayslipRecord } from '@/lib/db/queries/payslips';
import { boss } from '@/lib/jobs/boss';

export async function POST(req: Request): Promise<Response> {
  let userId: string;
  try {
    userId = await getCurrentUserId();
  } catch (e) {
    if (e instanceof UnauthenticatedError) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
    if (e instanceof Error && e.message.includes('headers')) {
      return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
    }
    throw e;
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid multipart body' }, { status: 400 });
  }

  const file = formData.get('file');
  if (!(file instanceof File)) return NextResponse.json({ error: 'No file provided' }, { status: 400 });

  const arrayBuf = await file.arrayBuffer();
  const buf = Buffer.from(arrayBuf);

  let key: string;
  try {
    ({ key } = await putObject({
      userId,
      body: buf,
      contentType: file.type || 'application/pdf',
      originalFilename: file.name,
    }));
  } catch (err) {
    return NextResponse.json({ error: 'R2 upload failed', detail: String(err) }, { status: 502 });
  }

  let parsed: import('@/lib/parsers/payslips/myob').ParsedPayslip;
  try {
    parsed = await dispatchPayslip(buf);
  } catch (err) {
    if (err instanceof UnknownFormatError) {
      return NextResponse.json({ error: 'unrecognised_payslip_format' }, { status: 422 });
    }
    throw err;
  }

  const payslipId = await createPayslipRecord(userId, {
    employer: parsed.employer,
    periodStart: parsed.period_start,
    periodEnd: parsed.period_end,
    payDate: parsed.pay_date,
    grossCents: parsed.gross_cents,
    taxWithheldCents: parsed.tax_withheld_cents,
    netCents: parsed.net_cents,
    superCents: parsed.super_cents,
    salarySacrificeCents: parsed.salary_sacrifice_cents,
    preTaxDeductionsCents: parsed.pre_tax_deductions_cents,
    postTaxDeductionsCents: parsed.post_tax_deductions_cents,
    sourceObjectKey: key,
    source: 'pdf',
  });

  try {
    await boss.send('link-payslips', { userId });
  } catch (err) {
    return NextResponse.json({
      error: 'Upload succeeded but job enqueue failed',
      payslipId,
      detail: String(err),
    }, { status: 502 });
  }

  return NextResponse.json({ ok: true, payslipId });
}
