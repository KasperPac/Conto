import type { Database } from '@/lib/db/client';
import { sql } from 'drizzle-orm';

interface CategorySeed {
  name: string;
  isEssential: boolean;
  isDiscretionary: boolean;
  isIncome: boolean;
}

interface MerchantSeed {
  canonicalName: string;
  categoryName: string;
  patterns: string[];
  isSubscription: boolean;
}

const SYSTEM_CATEGORIES: CategorySeed[] = [
  { name: 'Groceries',                isEssential: true,  isDiscretionary: false, isIncome: false },
  { name: 'Dining & Takeaway',        isEssential: false, isDiscretionary: true,  isIncome: false },
  { name: 'Transport',                isEssential: true,  isDiscretionary: false, isIncome: false },
  { name: 'Streaming',                isEssential: false, isDiscretionary: true,  isIncome: false },
  { name: 'Software & Subscriptions', isEssential: false, isDiscretionary: true,  isIncome: false },
  { name: 'Utilities',                isEssential: true,  isDiscretionary: false, isIncome: false },
  { name: 'Fuel & Petrol',            isEssential: true,  isDiscretionary: false, isIncome: false },
  { name: 'Pharmacy & Health',        isEssential: true,  isDiscretionary: false, isIncome: false },
  { name: 'Telco',                    isEssential: true,  isDiscretionary: false, isIncome: false },
  { name: 'Entertainment',            isEssential: false, isDiscretionary: true,  isIncome: false },
];

const AU_MERCHANTS: MerchantSeed[] = [
  // Supermarkets
  { canonicalName: 'Woolworths',        categoryName: 'Groceries',              patterns: ['WOOLWORTHS', 'WW '],                                      isSubscription: false },
  { canonicalName: 'Coles',             categoryName: 'Groceries',              patterns: ['COLES ', 'COLES\\b'],                                     isSubscription: false },
  { canonicalName: 'Aldi',              categoryName: 'Groceries',              patterns: ['ALDI '],                                                  isSubscription: false },
  { canonicalName: 'IGA',               categoryName: 'Groceries',              patterns: ['\\bIGA\\b'],                                              isSubscription: false },
  { canonicalName: 'Harris Farm',       categoryName: 'Groceries',              patterns: ['HARRIS FARM'],                                            isSubscription: false },

  // Fuel
  { canonicalName: 'BP',                categoryName: 'Fuel & Petrol',          patterns: ['\\bBP\\b', 'BP CONNECT'],                                 isSubscription: false },
  { canonicalName: 'Shell',             categoryName: 'Fuel & Petrol',          patterns: ['SHELL ', 'VIVA ENERGY'],                                  isSubscription: false },
  { canonicalName: 'Caltex',            categoryName: 'Fuel & Petrol',          patterns: ['CALTEX', 'AMPOL'],                                        isSubscription: false },
  { canonicalName: '7-Eleven',          categoryName: 'Fuel & Petrol',          patterns: ['7-ELEVEN', '7 ELEVEN'],                                   isSubscription: false },
  { canonicalName: 'Puma Energy',       categoryName: 'Fuel & Petrol',          patterns: ['PUMA ENERGY', 'PUMA '],                                   isSubscription: false },

  // Fast food / Dining
  { canonicalName: "McDonald's",        categoryName: 'Dining & Takeaway',      patterns: ['MCDONALD', 'MACCA'],                                      isSubscription: false },
  { canonicalName: 'KFC',               categoryName: 'Dining & Takeaway',      patterns: ['\\bKFC\\b'],                                              isSubscription: false },
  { canonicalName: "Hungry Jack's",     categoryName: 'Dining & Takeaway',      patterns: ['HUNGRY JACK'],                                            isSubscription: false },
  { canonicalName: "Domino's",          categoryName: 'Dining & Takeaway',      patterns: ['DOMINO'],                                                 isSubscription: false },
  { canonicalName: 'Subway',            categoryName: 'Dining & Takeaway',      patterns: ['SUBWAY '],                                                isSubscription: false },
  { canonicalName: 'Guzman y Gomez',    categoryName: 'Dining & Takeaway',      patterns: ['GUZMAN', 'GYG '],                                         isSubscription: false },
  { canonicalName: 'Oporto',            categoryName: 'Dining & Takeaway',      patterns: ['OPORTO'],                                                 isSubscription: false },
  { canonicalName: 'Uber Eats',         categoryName: 'Dining & Takeaway',      patterns: ['UBER.*EATS', 'UBEREATS'],                                 isSubscription: false },

  // Streaming — isSubscription: true
  { canonicalName: 'Netflix',           categoryName: 'Streaming',              patterns: ['NETFLIX'],                                                isSubscription: true  },
  { canonicalName: 'Spotify',           categoryName: 'Streaming',              patterns: ['SPOTIFY'],                                                isSubscription: true  },
  { canonicalName: 'Disney+',           categoryName: 'Streaming',              patterns: ['DISNEY\\+', 'DISNEY PLUS'],                               isSubscription: true  },
  { canonicalName: 'Stan',              categoryName: 'Streaming',              patterns: ['\\bSTAN\\b.*STREAM', 'STAN ENTERTAIN'],                   isSubscription: true  },
  { canonicalName: 'Binge',             categoryName: 'Streaming',              patterns: ['\\bBINGE\\b'],                                            isSubscription: true  },
  { canonicalName: 'Apple TV+',         categoryName: 'Streaming',              patterns: ['APPLE TV', 'APPLE.*TV\\+'],                               isSubscription: true  },
  { canonicalName: 'YouTube Premium',   categoryName: 'Streaming',              patterns: ['YOUTUBE.*PREMIUM', 'GOOGLE.*YOUTUB'],                     isSubscription: true  },
  { canonicalName: 'Paramount+',        categoryName: 'Streaming',              patterns: ['PARAMOUNT\\+', 'PARAMOUNT PLUS'],                         isSubscription: true  },

  // Software / SaaS — isSubscription: true
  { canonicalName: 'Adobe CC',          categoryName: 'Software & Subscriptions', patterns: ['ADOBE'],                                               isSubscription: true  },
  { canonicalName: 'Microsoft 365',     categoryName: 'Software & Subscriptions', patterns: ['MICROSOFT 365', 'MSFT 365', 'MICROSOFT.*SUBSCR'],      isSubscription: true  },
  { canonicalName: 'Dropbox',           categoryName: 'Software & Subscriptions', patterns: ['DROPBOX'],                                             isSubscription: true  },
  { canonicalName: 'Anthropic',         categoryName: 'Software & Subscriptions', patterns: ['ANTHROPIC'],                                           isSubscription: true  },
  { canonicalName: 'OpenAI',            categoryName: 'Software & Subscriptions', patterns: ['OPENAI'],                                              isSubscription: true  },
  { canonicalName: 'GitHub',            categoryName: 'Software & Subscriptions', patterns: ['GITHUB'],                                              isSubscription: true  },

  // Utilities
  { canonicalName: 'AGL',               categoryName: 'Utilities',              patterns: ['\\bAGL\\b'],                                              isSubscription: false },
  { canonicalName: 'Origin Energy',     categoryName: 'Utilities',              patterns: ['ORIGIN ENERGY', 'ORIGIN ELECT'],                          isSubscription: false },
  { canonicalName: 'Sydney Water',      categoryName: 'Utilities',              patterns: ['SYDNEY WATER'],                                           isSubscription: false },
  { canonicalName: 'Ausgrid',           categoryName: 'Utilities',              patterns: ['AUSGRID'],                                                isSubscription: false },

  // Telco
  { canonicalName: 'Telstra',           categoryName: 'Telco',                  patterns: ['TELSTRA'],                                                isSubscription: false },
  { canonicalName: 'Optus',             categoryName: 'Telco',                  patterns: ['OPTUS'],                                                  isSubscription: false },
  { canonicalName: 'Vodafone',          categoryName: 'Telco',                  patterns: ['VODAFONE'],                                               isSubscription: false },
  { canonicalName: 'Belong',            categoryName: 'Telco',                  patterns: ['BELONG'],                                                 isSubscription: false },

  // Transport
  { canonicalName: 'Uber',              categoryName: 'Transport',              patterns: ['\\bUBER\\b(?!.*EATS)'],                                   isSubscription: false },
  { canonicalName: 'Opal',              categoryName: 'Transport',              patterns: ['OPAL CARD', 'TRANSPORT NSW'],                             isSubscription: false },
  { canonicalName: 'Myki',              categoryName: 'Transport',              patterns: ['MYKI'],                                                   isSubscription: false },

  // Pharmacy
  { canonicalName: 'Chemist Warehouse', categoryName: 'Pharmacy & Health',      patterns: ['CHEMIST WAREHOUSE', 'CHEMIST WH'],                        isSubscription: false },
  { canonicalName: 'Priceline',         categoryName: 'Pharmacy & Health',      patterns: ['PRICELINE'],                                              isSubscription: false },
];

export async function seedAuMerchants(db: Database): Promise<void> {
  // 1. Ensure system categories exist (idempotent via WHERE NOT EXISTS)
  for (const cat of SYSTEM_CATEGORIES) {
    await db.execute(sql`
      insert into categories (name, is_essential, is_discretionary, is_income, is_deductible_candidate)
      select ${cat.name}, ${cat.isEssential}, ${cat.isDiscretionary}, ${cat.isIncome}, false
      where not exists (
        select 1 from categories where name = ${cat.name} and user_id is null
      )
    `);
  }

  // 2. Seed merchants referencing those categories (idempotent via WHERE NOT EXISTS)
  for (const m of AU_MERCHANTS) {
    await db.execute(sql`
      insert into merchants (canonical_name, default_category_id, patterns, is_subscription)
      select
        ${m.canonicalName},
        (select id from categories where name = ${m.categoryName} and user_id is null limit 1),
        ${JSON.stringify(m.patterns)}::jsonb,
        ${m.isSubscription}
      where not exists (
        select 1 from merchants where canonical_name = ${m.canonicalName} and user_id is null
      )
    `);
  }
}
