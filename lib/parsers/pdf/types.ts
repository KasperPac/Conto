export interface TextItem {
  text: string;
  x: number;
  y: number;
  page: number;
}

export interface TextRow {
  items: TextItem[];
  y: number;
  page: number;
}

export interface ParsedRow {
  posted_date: string;          // 'YYYY-MM-DD'
  description_raw: string;
  amount_cents: bigint;         // signed; negative = money out
  balance_after_cents?: bigint;
}

export interface ParsedStatement {
  template_id: string;
  institution: string;
  account_number_fragment: string;
  account_type: 'checking' | 'savings' | 'credit_card';
  period_start: string;         // 'YYYY-MM-DD'
  period_end: string;           // 'YYYY-MM-DD'
  rows: ParsedRow[];
}

export class UnknownFormatError extends Error {
  constructor() { super('unknown_format'); this.name = 'UnknownFormatError'; }
}
