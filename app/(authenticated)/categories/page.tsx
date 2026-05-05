import { redirect } from 'next/navigation';
import { or, isNull, eq } from 'drizzle-orm';
import { getCurrentUserId, UnauthenticatedError } from '@/lib/auth/server';
import { db } from '@/lib/db/client';
import { categories } from '@/lib/db/schema';
import { createCategory, deleteCategory } from '@/app/actions/categories';
import { Button } from '@/components/ui/button';

export default async function CategoriesPage() {
  let userId: string;
  try {
    userId = await getCurrentUserId();
  } catch (e) {
    if (e instanceof UnauthenticatedError) redirect('/login');
    throw e;
  }

  const all = await db.select().from(categories)
    .where(or(isNull(categories.userId), eq(categories.userId, userId)))
    .orderBy(categories.name);

  const systemCats = all.filter(c => c.userId === null);
  const userCats = all.filter(c => c.userId !== null);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Categories</h1>

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-zinc-700">Your categories</h2>
        {userCats.length === 0 && <p className="text-sm text-zinc-500">None yet.</p>}
        {userCats.length > 0 && (
          <ul className="divide-y border rounded-lg">
            {userCats.map(c => (
              <li key={c.id} className="flex items-center justify-between p-3 text-sm">
                <span>{c.name}</span>
                <form action={deleteCategory.bind(null, c.id)}>
                  <Button variant="ghost" size="sm" type="submit" className="text-red-500 hover:text-red-700">
                    Delete
                  </Button>
                </form>
              </li>
            ))}
          </ul>
        )}

        <form
          action={async (fd: FormData) => {
            'use server';
            await createCategory({
              name: fd.get('name') as string,
              isIncome: fd.get('isIncome') === 'on',
              isEssential: fd.get('isEssential') === 'on',
              isDiscretionary: fd.get('isDiscretionary') === 'on',
            });
          }}
          className="flex flex-wrap gap-2 items-center"
        >
          <input name="name" required placeholder="Category name" className="border rounded px-2 py-1 text-sm flex-1 min-w-32" />
          <label className="text-xs flex items-center gap-1">
            <input type="checkbox" name="isIncome" /> Income
          </label>
          <label className="text-xs flex items-center gap-1">
            <input type="checkbox" name="isEssential" /> Essential
          </label>
          <label className="text-xs flex items-center gap-1">
            <input type="checkbox" name="isDiscretionary" /> Discretionary
          </label>
          <Button type="submit" size="sm">Add</Button>
        </form>
      </section>

      {systemCats.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-medium text-zinc-500">System categories (read-only)</h2>
          <ul className="divide-y border rounded-lg opacity-60">
            {systemCats.map(c => (
              <li key={c.id} className="p-3 text-sm">{c.name}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
