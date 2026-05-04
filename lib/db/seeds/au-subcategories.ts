import type { Database } from '@/lib/db/client';
import { sql } from 'drizzle-orm';

interface SubcategorySeed {
  name: string;
  deductionKind: 'wfh' | 'donation' | 'work_tools' | 'motor_vehicle' | 'professional_sub';
}

const AU_SUBCATEGORIES: SubcategorySeed[] = [
  { name: 'WFH — utilities (electricity portion)',    deductionKind: 'wfh' },
  { name: 'WFH — internet (work portion)',            deductionKind: 'wfh' },
  { name: 'Donations — DGR-registered',               deductionKind: 'donation' },
  { name: 'Work tools & equipment',                   deductionKind: 'work_tools' },
  { name: 'Motor vehicle — work travel',              deductionKind: 'motor_vehicle' },
  { name: 'Professional subscriptions / memberships', deductionKind: 'professional_sub' },
];

export async function seedAuSubcategories(db: Database): Promise<void> {
  for (const sub of AU_SUBCATEGORIES) {
    await db.execute(sql`
      insert into categories (name, deduction_kind, is_deductible_candidate, is_essential, is_discretionary, is_income)
      select ${sub.name}, ${sub.deductionKind}, true, false, true, false
      where not exists (
        select 1 from categories
        where name = ${sub.name}
          and deduction_kind = ${sub.deductionKind}
          and user_id is null
      )
    `);
  }
}
