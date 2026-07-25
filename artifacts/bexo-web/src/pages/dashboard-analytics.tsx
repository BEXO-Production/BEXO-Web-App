import React, { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import {
  ArrowLeft,
  BarChart3,
  Inbox,
  Loader2,
  Lock,
  MousePointerClick,
  RefreshCw,
} from 'lucide-react';
import { Button } from '../design-system/primitives';
import { AppAtmosphere } from '../components/AppAtmosphere';
import { MobileTabBar } from '../components/MobileTabBar';
import { useToast } from '../hooks/use-toast';
import { apiUrl } from '../lib/api';
import { usePageSeo } from '../hooks/use-page-seo';
import { supabase } from '../lib/supabase';
import { useOnboarding } from '../context/OnboardingContext';

function Sparkline({ values }: { values: number[] }) {
  const w = 320;
  const h = 72;
  const max = Math.max(1, ...values);
  const pts = values
    .map((v, i) => {
      const x = values.length <= 1 ? 0 : (i / (values.length - 1)) * w;
      const y = h - (v / max) * (h - 8) - 4;
      return `${x},${y}`;
    })
    .join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-20 text-indigo-500" preserveAspectRatio="none">
      <polyline fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" points={pts} />
    </svg>
  );
}

export default function DashboardAnalytics() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { setToken } = useOnboarding();
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);

  const handleLogout = useCallback(async () => {
    try {
      await supabase.auth.signOut();
    } catch {
      /* ignore */
    }
    localStorage.removeItem('token');
    setToken(null);
    window.location.href = '/';
  }, [setToken]);

  usePageSeo({
    title: 'Portfolio analytics — BEXO',
    description: 'Visits, uniques, referrers, and leads for your portfolio.',
    noindex: true,
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(apiUrl(`/api/analytics/portfolio/summary?days=${days}`), {
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(result.error || 'Unable to load analytics');
      setSummary(result);
    } catch (err: any) {
      toast({ title: 'Analytics error', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [days, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const unlocked = !!summary?.unlocked;
  const series: Array<{ day: string; displayViews?: number; views?: number; leads?: number }> =
    Array.isArray(summary?.series) ? summary.series : [];
  const sparkValues = series.map((d) => Number(d.displayViews ?? d.views ?? 0));
  const totals = summary?.totals || {};

  return (
    <div className="relative min-h-[100dvh] overflow-x-hidden bexo-app-shell">
      <AppAtmosphere intensity="soft" />
      <div className="relative z-10">
      <header className="bexo-header-glass sticky top-0 z-20 pt-[env(safe-area-inset-top,0px)]">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setLocation('/dashboard')}
              className="hidden md:inline-flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-slate-900 min-h-11"
            >
              <ArrowLeft className="w-4 h-4" /> Dashboard
            </button>
            <div className="hidden md:block h-4 w-px bg-slate-200" />
            <div className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-indigo-500" />
              <h1 className="text-sm font-bold text-slate-900">Portfolio analytics</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-600"
            >
              <option value={7}>7 days</option>
              <option value={30}>30 days</option>
              <option value={90}>90 days</option>
            </select>
            <Button size="sm" variant="outline" className="h-8 text-xs gap-1" onClick={load} disabled={loading}>
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              Refresh
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] md:pb-6">
        {!unlocked && !loading ? (
          <div className="rounded-2xl border border-dashed border-indigo-200 bg-white p-8 text-center">
            <Lock className="w-10 h-10 text-indigo-400 mx-auto mb-3" />
            <h2 className="text-lg font-bold text-slate-900">Analytics unlocks on Essential & Growth</h2>
            <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto">
              See visits, approximate uniques, top referrers, and your leads inbox.
            </p>
            <Button className="mt-4" onClick={() => setLocation('/billing')}>
              Upgrade plan
            </Button>
          </div>
        ) : (
          <>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {[
                { label: 'Visits', value: totals.displayViews ?? 0, hint: 'Last period' },
                { label: 'Uniques', value: totals.uniquesApprox ?? 0, hint: 'Approx.' },
                { label: 'Leads', value: totals.leads ?? 0, hint: `${totals.leadsUnread ?? 0} unread` },
                { label: 'Window', value: `${days}d`, hint: 'Selected range' },
              ].map((card) => (
                <div key={card.label} className="rounded-2xl border border-slate-200 bg-white p-4">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{card.label}</p>
                  <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">
                    {loading ? '—' : card.value}
                  </p>
                  <p className="text-[11px] text-slate-400 mt-1">{card.hint}</p>
                </div>
              ))}
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-bold text-slate-900">Traffic pulse</h2>
                <button
                  type="button"
                  onClick={() => setLocation('/dashboard/inbox')}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-800"
                >
                  <Inbox className="w-3.5 h-3.5" /> Open inbox
                </button>
              </div>
              {loading ? (
                <div className="flex justify-center py-10">
                  <Loader2 className="w-5 h-5 animate-spin text-slate-300" />
                </div>
              ) : sparkValues.length > 0 ? (
                <Sparkline values={sparkValues} />
              ) : (
                <p className="text-xs text-slate-400 py-8 text-center">No visit data in this window yet.</p>
              )}
            </div>

            <div className="grid md:grid-cols-2 gap-3">
              <div className="rounded-2xl border border-slate-200 bg-white p-5">
                <h2 className="text-sm font-bold text-slate-900 mb-3">Top sources</h2>
                {Array.isArray(totals.topReferrers) && totals.topReferrers.length > 0 ? (
                  <ul className="space-y-2">
                    {totals.topReferrers.map((r: any) => (
                      <li key={r.host} className="flex items-center justify-between text-sm">
                        <span className="font-medium text-slate-700 truncate">{r.host}</span>
                        <span className="tabular-nums text-slate-400 text-xs">{r.count}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-slate-400">No referrer data yet.</p>
                )}
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-5">
                <h2 className="text-sm font-bold text-slate-900 mb-3">Devices</h2>
                {totals.devices && Object.keys(totals.devices).length > 0 ? (
                  <ul className="space-y-2">
                    {Object.entries(totals.devices as Record<string, number>)
                      .sort((a, b) => b[1] - a[1])
                      .map(([device, n]) => (
                        <li key={device} className="flex items-center justify-between text-sm">
                          <span className="font-medium text-slate-700 capitalize flex items-center gap-1.5">
                            <MousePointerClick className="w-3.5 h-3.5 text-slate-400" />
                            {device}
                          </span>
                          <span className="tabular-nums text-slate-400 text-xs">{n}</span>
                        </li>
                      ))}
                  </ul>
                ) : (
                  <p className="text-xs text-slate-400">No device breakdown yet.</p>
                )}
              </div>
            </div>
          </>
        )}
      </main>
      <MobileTabBar onLogout={handleLogout} />
      </div>
    </div>
  );
}
