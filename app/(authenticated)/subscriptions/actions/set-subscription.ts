'use server';
import { revalidatePath } from 'next/cache';
import { getCurrentUserId } from '@/lib/auth/server';
import { setMerchantIsSubscription } from '@/lib/db/queries/merchants';

export async function setSubscription(merchantId: string, isSubscription: boolean): Promise<void> {
  await getCurrentUserId(); // throws UnauthenticatedError if no session
  await setMerchantIsSubscription(merchantId, isSubscription);
  revalidatePath('/subscriptions');
}
