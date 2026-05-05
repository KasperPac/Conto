import { describe, it, expect } from 'vitest';
import { classifyTransaction } from '@/lib/domain/classification';
import type { LoadedRule, LoadedMerchant } from '@/lib/domain/classification';

const netflixMerchant: LoadedMerchant = {
  id: 'merch-netflix',
  canonicalName: 'Netflix',
  defaultCategoryId: 'cat-streaming',
  patterns: ['NETFLIX', 'NETFLIX\\.COM'],
  isSubscription: true,
};

const woolsMerchant: LoadedMerchant = {
  id: 'merch-wools',
  canonicalName: 'Woolworths',
  defaultCategoryId: 'cat-groceries',
  patterns: ['WOOLWORTHS', 'WW '],
  isSubscription: false,
};

const userRule: LoadedRule = {
  id: 'rule-1',
  pattern: 'NETFLIX',
  matchField: 'description_raw',
  categoryId: 'cat-entertainment',
  subcategoryId: null,
  priority: 10,
};

const lowPriorityRule: LoadedRule = {
  id: 'rule-2',
  pattern: 'NETFLIX',
  matchField: 'description_raw',
  categoryId: 'cat-streaming',
  subcategoryId: null,
  priority: 0,
};

describe('classifyTransaction', () => {
  it('user rule wins and returns ruleId', () => {
    const result = classifyTransaction(
      { descriptionRaw: 'NETFLIX.COM 123', descriptionClean: 'netflix.com 123', merchantId: null },
      [userRule],
      [netflixMerchant],
    );
    expect(result.source).toBe('user_rule');
    expect(result.categoryId).toBe('cat-entertainment');
    expect(result.ruleId).toBe('rule-1');
  });

  it('higher-priority rule wins', () => {
    const result = classifyTransaction(
      { descriptionRaw: 'NETFLIX.COM 123', descriptionClean: null, merchantId: null },
      [userRule, lowPriorityRule], // already sorted desc by priority
      [],
    );
    expect(result.categoryId).toBe('cat-entertainment');
    expect(result.ruleId).toBe('rule-1');
  });

  it('merchant default used when tx has merchantId and no rules match', () => {
    const result = classifyTransaction(
      { descriptionRaw: 'SOMETHING UNRELATED', descriptionClean: null, merchantId: 'merch-netflix' },
      [],
      [netflixMerchant],
    );
    expect(result.source).toBe('system_rule');
    expect(result.categoryId).toBe('cat-streaming');
    expect(result.merchantId).toBe('merch-netflix');
  });

  it('merchant pattern scan assigns merchant and category', () => {
    const result = classifyTransaction(
      { descriptionRaw: 'WOOLWORTHS 0423 SYDNEY', descriptionClean: null, merchantId: null },
      [],
      [woolsMerchant],
    );
    expect(result.source).toBe('system_rule');
    expect(result.merchantId).toBe('merch-wools');
    expect(result.categoryId).toBe('cat-groceries');
  });

  it('invalid regex pattern is silently skipped', () => {
    const badMerchant: LoadedMerchant = { ...netflixMerchant, patterns: ['[invalid('] };
    expect(() => classifyTransaction(
      { descriptionRaw: 'NETFLIX', descriptionClean: null, merchantId: null },
      [],
      [badMerchant],
    )).not.toThrow();
  });

  it('falls through to unclassified when nothing matches', () => {
    const result = classifyTransaction(
      { descriptionRaw: 'RANDOM PURCHASE XYZ', descriptionClean: null, merchantId: null },
      [],
      [],
    );
    expect(result.source).toBe('unclassified');
    expect(result.categoryId).toBeNull();
    expect(result.ruleId).toBeNull();
    expect(result.merchantId).toBeNull();
  });
});
