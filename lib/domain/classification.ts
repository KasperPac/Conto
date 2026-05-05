export interface LoadedRule {
  id: string;
  pattern: string;
  matchField: string; // 'description_raw' | 'description_clean'
  categoryId: string | null;
  subcategoryId: string | null;
  priority: number;
}

export interface LoadedMerchant {
  id: string;
  canonicalName: string;
  defaultCategoryId: string | null;
  patterns: string[] | null;
  isSubscription: boolean;
}

export interface ClassificationResult {
  categoryId: string | null;
  subcategoryId: string | null;
  merchantId: string | null;
  source: 'user_rule' | 'system_rule' | 'unclassified';
  ruleId: string | null;
}

export function classifyTransaction(
  tx: { descriptionRaw: string; descriptionClean: string | null; merchantId: string | null },
  rules: LoadedRule[],
  merchants: LoadedMerchant[],
): ClassificationResult {
  // 1. User rules — already sorted by priority desc
  for (const rule of rules) {
    const field = rule.matchField === 'description_clean'
      ? (tx.descriptionClean ?? tx.descriptionRaw)
      : tx.descriptionRaw;
    try {
      if (new RegExp(rule.pattern, 'i').test(field)) {
        return {
          categoryId: rule.categoryId,
          subcategoryId: rule.subcategoryId,
          merchantId: tx.merchantId,
          source: 'user_rule',
          ruleId: rule.id,
        };
      }
    } catch {
      // invalid regex — skip
    }
  }

  // 2. Merchant default (tx already has a matched merchantId)
  if (tx.merchantId) {
    const merchant = merchants.find(m => m.id === tx.merchantId);
    if (merchant?.defaultCategoryId) {
      return {
        categoryId: merchant.defaultCategoryId,
        subcategoryId: null,
        merchantId: tx.merchantId,
        source: 'system_rule',
        ruleId: null,
      };
    }
  }

  // 3. Merchant pattern scan
  for (const merchant of merchants) {
    for (const pat of merchant.patterns ?? []) {
      try {
        if (new RegExp(pat, 'i').test(tx.descriptionRaw)) {
          return {
            categoryId: merchant.defaultCategoryId,
            subcategoryId: null,
            merchantId: merchant.id,
            source: 'system_rule',
            ruleId: null,
          };
        }
      } catch {
        // invalid regex — skip
      }
    }
  }

  // 4. Fall-through
  return { categoryId: null, subcategoryId: null, merchantId: null, source: 'unclassified', ruleId: null };
}
