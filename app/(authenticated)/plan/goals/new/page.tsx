import { redirect } from 'next/navigation';
import { getCurrentUserId, UnauthenticatedError } from '@/lib/auth/server';
import { getAccounts } from '@/lib/db/queries/accounts';
import { AddGoalModal } from '@/components/add-goal-modal';

export default async function NewGoalPage() {
  let userId: string;
  try {
    userId = await getCurrentUserId();
  } catch (e) {
    if (e instanceof UnauthenticatedError) redirect('/sign-in');
    throw e;
  }

  const accounts = await getAccounts(userId);

  return <AddGoalModal accounts={accounts} />;
}
