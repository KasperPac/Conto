import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { rules } from '@/lib/db/schema';
import type { LoadedRule } from '@/lib/domain/classification';

export async function getUserRules(userId: string): Promise<LoadedRule[]> {
  const rows = await db
    .select({
      id: rules.id,
      pattern: rules.pattern,
      matchField: rules.matchField,
      categoryId: rules.categoryId,
      subcategoryId: rules.subcategoryId,
      priority: rules.priority,
    })
    .from(rules)
    .where(and(eq(rules.userId, userId), eq(rules.active, true)))
    .orderBy(desc(rules.priority));

  return rows.map(r => ({
    ...r,
    matchField: r.matchField as LoadedRule['matchField'],
  }));
}
