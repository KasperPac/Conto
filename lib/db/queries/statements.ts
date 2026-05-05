import { eq } from 'drizzle-orm';
import { db, withUser } from '@/lib/db/client';
import { statements } from '@/lib/db/schema';

export async function createStatement(userId: string, data: {
  sourceFilename: string;
  sourceObjectKey: string;
  format: string;
}): Promise<string> {
  return withUser(userId, async (tx) => {
    const rows = await tx.insert(statements).values({
      userId,
      sourceFilename: data.sourceFilename,
      sourceObjectKey: data.sourceObjectKey,
      format: data.format,
      status: 'pending',
    }).returning({ id: statements.id });
    if (!rows[0]) throw new Error('Insert returned no rows');
    return rows[0].id;
  });
}

export async function updateStatement(userId: string, id: string, data: Partial<{
  accountId: string;
  parserTemplate: string;
  periodStart: string;
  periodEnd: string;
  status: string;
  parseError: string;
  parsedAt: Date;
}>): Promise<void> {
  await withUser(userId, async (tx) => {
    await tx.update(statements).set(data).where(eq(statements.id, id));
  });
}

export async function getStatements(userId: string) {
  return withUser(userId, async (tx) => {
    return tx.select().from(statements)
      .where(eq(statements.userId, userId))
      .orderBy(statements.uploadedAt);
  });
}
