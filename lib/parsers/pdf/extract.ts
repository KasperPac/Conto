import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { TextItem, TextRow } from './types';

const Y_TOL = 3;

export async function extractRows(buf: Buffer): Promise<TextRow[]> {
  const data = new Uint8Array(buf);
  const doc = await getDocument({ data, useWorkerFetch: false, isEvalSupported: false, useSystemFonts: true }).promise;
  const all: TextItem[] = [];

  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    for (const item of content.items) {
      if (!('str' in item) || !item.str.trim()) continue;
      const [, , , , x, y] = item.transform as number[];
      all.push({ text: item.str.trim(), x, y, page: p });
    }
  }

  const rows: TextRow[] = [];
  for (const item of all) {
    let row = rows.find(r => r.page === item.page && Math.abs(r.y - item.y) <= Y_TOL);
    if (!row) {
      row = { items: [], y: item.y, page: item.page };
      rows.push(row);
    }
    row.items.push(item);
    row.items.sort((a, b) => a.x - b.x);
  }

  return rows.sort((a, b) => a.page !== b.page ? a.page - b.page : b.y - a.y);
}

export function rowText(row: TextRow): string {
  return row.items.map(i => i.text).join(' ');
}
