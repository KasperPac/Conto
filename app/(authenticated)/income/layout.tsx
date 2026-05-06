import Link from 'next/link';
import { headers } from 'next/headers';

const tabs = [
  { label: 'Overview', href: '/income' },
  { label: 'Payslips', href: '/income/payslips' },
  { label: 'WFH', href: '/income/wfh' },
  { label: 'Receipts', href: '/income/receipts' },
];

export default async function IncomeLayout({ children }: { children: React.ReactNode }) {
  const pathname = (await headers()).get('x-pathname') ?? '';

  return (
    <div>
      <nav className="flex gap-4 border-b mb-6">
        {tabs.map(tab => {
          const active = tab.href === '/income'
            ? pathname === '/income'
            : pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={active
                ? 'pb-2 border-b-2 border-primary font-medium text-sm'
                : 'pb-2 text-sm text-muted-foreground hover:text-foreground'}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
      {children}
    </div>
  );
}
