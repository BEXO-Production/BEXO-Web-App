/** Mobile bottom-nav tab resolution for the product app (<768px shell). */

export type MobileTabId = 'home' | 'edit' | 'updates' | 'inbox' | 'more';

export function resolveMobileTab(path: string): MobileTabId {
  const clean = (path || '/dashboard').split('?')[0].replace(/\/+$/, '') || '/dashboard';

  if (clean === '/dashboard/inbox' || clean.startsWith('/dashboard/inbox/')) {
    return 'inbox';
  }
  if (clean === '/dashboard/edit-profile' || clean.startsWith('/dashboard/edit-profile/')) {
    return 'edit';
  }
  if (
    clean === '/dashboard/updates' ||
    clean.startsWith('/dashboard/updates/') ||
    clean === '/dashboard/updates/parse'
  ) {
    return 'updates';
  }
  if (
    clean === '/dashboard/settings' ||
    clean.startsWith('/dashboard/settings/') ||
    clean === '/dashboard/analytics' ||
    clean.startsWith('/dashboard/analytics/') ||
    clean === '/billing' ||
    clean.startsWith('/billing/') ||
    clean === '/checkout' ||
    clean.startsWith('/checkout/')
  ) {
    return 'more';
  }
  if (clean === '/dashboard' || clean.startsWith('/dashboard/')) {
    return 'home';
  }
  return 'home';
}

/** Content padding so pages clear the fixed tab bar + home indicator. */
export const MOBILE_TAB_CONTENT_PAD =
  'pb-[calc(5.25rem+env(safe-area-inset-bottom,0px))] md:pb-12';
