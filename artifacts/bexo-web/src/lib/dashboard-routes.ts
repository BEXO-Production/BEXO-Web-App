/** Dedicated dashboard paths — refresh-safe, shareable. */

export type DashboardView = 'overview' | 'edit-profile' | 'updates' | 'settings';
export type UpdatesTab = 'post' | 'parse';
export type SettingsTab = 'profile' | 'design' | 'storage' | 'assets' | 'billing';

const SETTINGS_TABS: SettingsTab[] = ['profile', 'design', 'storage', 'assets', 'billing'];

export function isSettingsTab(value: string | null | undefined): value is SettingsTab {
  return !!value && (SETTINGS_TABS as string[]).includes(value);
}

export function parseDashboardPath(path: string): {
  view: DashboardView;
  updatesTab: UpdatesTab;
  settingsTab: SettingsTab;
} {
  const clean = (path || '/dashboard').split('?')[0].replace(/\/+$/, '') || '/dashboard';

  if (clean === '/dashboard/edit-profile' || clean.startsWith('/dashboard/edit-profile/')) {
    return { view: 'edit-profile', updatesTab: 'post', settingsTab: 'profile' };
  }

  if (clean === '/dashboard/updates/parse' || clean.startsWith('/dashboard/updates/parse/')) {
    return { view: 'updates', updatesTab: 'parse', settingsTab: 'profile' };
  }

  if (clean === '/dashboard/updates' || clean.startsWith('/dashboard/updates/')) {
    return { view: 'updates', updatesTab: 'post', settingsTab: 'profile' };
  }

  const settingsMatch = clean.match(/^\/dashboard\/settings\/([^/]+)/);
  if (settingsMatch && isSettingsTab(settingsMatch[1])) {
    return { view: 'settings', updatesTab: 'post', settingsTab: settingsMatch[1] };
  }

  if (clean === '/dashboard/settings' || clean.startsWith('/dashboard/settings/')) {
    return { view: 'settings', updatesTab: 'post', settingsTab: 'profile' };
  }

  return { view: 'overview', updatesTab: 'post', settingsTab: 'profile' };
}

export function dashboardPath(
  view: DashboardView,
  opts?: { updatesTab?: UpdatesTab; settingsTab?: SettingsTab },
): string {
  switch (view) {
    case 'edit-profile':
      return '/dashboard/edit-profile';
    case 'updates':
      return opts?.updatesTab === 'parse' ? '/dashboard/updates/parse' : '/dashboard/updates';
    case 'settings':
      return `/dashboard/settings/${opts?.settingsTab || 'profile'}`;
    case 'overview':
    default:
      return '/dashboard';
  }
}

/** Convert legacy ?view=&tab= bookmarks into dedicated paths. */
export function legacyDashboardQueryToPath(search: string): string | null {
  const params = new URLSearchParams(search.startsWith('?') ? search : `?${search}`);
  const view = params.get('view');
  const tab = params.get('tab');
  if (!view && !tab) return null;

  if (view === 'edit-profile') return dashboardPath('edit-profile');
  if (view === 'updates') {
    return dashboardPath('updates', { updatesTab: tab === 'parse' ? 'parse' : 'post' });
  }
  if (view === 'settings') {
    return dashboardPath('settings', {
      settingsTab: isSettingsTab(tab) ? tab : 'profile',
    });
  }
  if (view === 'overview') return dashboardPath('overview');

  if (tab === 'parse' || tab === 'post') {
    return dashboardPath('updates', { updatesTab: tab });
  }
  if (isSettingsTab(tab)) {
    return dashboardPath('settings', { settingsTab: tab });
  }

  return null;
}
