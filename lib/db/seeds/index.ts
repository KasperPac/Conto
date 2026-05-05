import 'dotenv/config';
import { db } from '@/lib/db/client';
import { seedAuSubcategories } from './au-subcategories';
import { seedAuMerchants } from './au-merchants';

async function main(): Promise<void> {
  await seedAuSubcategories(db);
  console.log('[seed] AU subcategories seeded.');
  await seedAuMerchants(db);
  console.log('[seed] AU merchants seeded.');
}

main().then(() => process.exit(0)).catch((err) => {
  console.error('[seed] failed:', err);
  process.exit(1);
});
