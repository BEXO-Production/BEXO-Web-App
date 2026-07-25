import React, { useState } from 'react';
import { useLocation } from 'wouter';
import {
  BarChart3,
  CreditCard,
  ExternalLink,
  FileText,
  Home,
  Inbox,
  LogOut,
  MoreHorizontal,
  Settings,
  User,
} from 'lucide-react';
import { cn } from '../design-system/primitives';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from './ui/sheet';
import { resolveMobileTab, type MobileTabId } from '../lib/mobile-nav';

type Props = {
  visitUrl?: string | null;
  onLogout?: () => void;
  className?: string;
};

const TABS: Array<{
  id: Exclude<MobileTabId, 'more'>;
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
}> = [
  { id: 'home', label: 'Home', href: '/dashboard', icon: Home },
  { id: 'edit', label: 'Edit', href: '/dashboard/edit-profile', icon: User },
  { id: 'updates', label: 'Updates', href: '/dashboard/updates', icon: FileText },
  { id: 'inbox', label: 'Inbox', href: '/dashboard/inbox', icon: Inbox },
];

/**
 * Fixed bottom tab bar for phones only (hidden from md up).
 * "More" opens a sheet for secondary destinations — keeps the primary IA thumb-reachable.
 */
export function MobileTabBar({ visitUrl, onLogout, className }: Props) {
  const [location, setLocation] = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);
  const active = resolveMobileTab(location);

  const go = (href: string) => {
    setMoreOpen(false);
    if (location !== href) setLocation(href);
  };

  return (
    <>
      <nav
        className={cn('bexo-mobile-tabbar md:hidden', className)}
        aria-label="Primary"
      >
        <div className="bexo-mobile-tabbar__inner">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = active === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => go(tab.href)}
                className={cn(
                  'bexo-mobile-tab',
                  isActive && 'bexo-mobile-tab--active',
                )}
                aria-current={isActive ? 'page' : undefined}
              >
                <span className="bexo-mobile-tab__icon-wrap" aria-hidden>
                  <Icon className="bexo-mobile-tab__icon" strokeWidth={isActive ? 2.25 : 1.75} />
                </span>
                <span className="bexo-mobile-tab__label">{tab.label}</span>
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            className={cn(
              'bexo-mobile-tab',
              active === 'more' && 'bexo-mobile-tab--active',
            )}
            aria-haspopup="dialog"
            aria-expanded={moreOpen}
          >
            <span className="bexo-mobile-tab__icon-wrap" aria-hidden>
              <MoreHorizontal
                className="bexo-mobile-tab__icon"
                strokeWidth={active === 'more' ? 2.25 : 1.75}
              />
            </span>
            <span className="bexo-mobile-tab__label">More</span>
          </button>
        </div>
      </nav>

      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent
          side="bottom"
          className="bexo-mobile-more-sheet rounded-t-2xl border-slate-200 bg-white p-0 gap-0 md:hidden"
        >
          <SheetHeader className="px-5 pt-5 pb-3 text-left border-b border-slate-100">
            <SheetTitle className="text-base font-bold text-slate-900 tracking-tight">
              More
            </SheetTitle>
            <SheetDescription className="text-sm text-slate-500">
              Settings, analytics, and account
            </SheetDescription>
          </SheetHeader>

          <div className="px-2 py-2">
            <MoreRow
              icon={BarChart3}
              label="Analytics"
              onClick={() => go('/dashboard/analytics')}
            />
            <MoreRow
              icon={Settings}
              label="Settings"
              onClick={() => go('/dashboard/settings/profile')}
            />
            <MoreRow
              icon={CreditCard}
              label="Billing"
              onClick={() => go('/billing')}
            />
            {visitUrl ? (
              <a
                href={visitUrl}
                target="_blank"
                rel="noreferrer"
                className="bexo-mobile-more-row"
                onClick={() => setMoreOpen(false)}
              >
                <ExternalLink className="w-5 h-5 text-slate-400 shrink-0" strokeWidth={1.75} />
                <span className="flex-1 text-left">Visit live site</span>
              </a>
            ) : null}
          </div>

          {onLogout ? (
            <div className="border-t border-slate-100 px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              <button
                type="button"
                onClick={() => {
                  setMoreOpen(false);
                  onLogout();
                }}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-rose-50 px-4 py-3 text-sm font-bold text-rose-600 active:scale-[0.98] transition-transform duration-150"
              >
                <LogOut className="w-4 h-4" strokeWidth={2} />
                Sign out
              </button>
            </div>
          ) : (
            <div className="h-[env(safe-area-inset-bottom,0px)]" />
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}

function MoreRow({
  icon: Icon,
  label,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  label: string;
  onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick} className="bexo-mobile-more-row">
      <Icon className="w-5 h-5 text-slate-400 shrink-0" strokeWidth={1.75} />
      <span className="flex-1 text-left">{label}</span>
    </button>
  );
}
