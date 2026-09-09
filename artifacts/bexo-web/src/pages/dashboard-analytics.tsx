import React, { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import {
  ArrowLeft,
  BarChart3,
  Calendar,
  Eye,
  Inbox,
  Loader2,
  Lock,
  Mail,
  MousePointerClick,
  RefreshCw,
  TrendingUp,
  Users,
} from 'lucide-react';
import { Button } from '../design-system/primitives';
import { AppAtmosphere } from '../components/AppAtmosphere';
import { MobileTabBar } from '../components/MobileTabBar';
import { useToast } from '../hooks/use-toast';
import { apiUrl } from '../lib/api';
import { usePageSeo } from '../hooks/use-page-seo';
import { supabase } from '../lib/supabase';
import { useOnboarding } from '../context/OnboardingContext';

function PulseChart({
  series,
}: {
  series: Array<{ day: string; displayViews?: number; views?: number; leads?: number }>;
}) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const w = 640;
  const h = 180;
  const padTop = 20;
  const padBottom = 28;
  const padX = 20;

  const values = series.map((d) => Number(d.displayViews ?? d.views ?? 0));
  const maxVal = Math.max(5, ...values);

  const points = values.map((v, i) => {
    const x = values.length <= 1 ? padX : padX + (i / (values.length - 1)) * (w - padX * 2);
    const y = padTop + (1 - v / maxVal) * (h - padTop - padBottom);
    return { x, y, v, day: series[i]?.day || '' };
  });

  let linePath = '';
  if (points.length === 1) {
    linePath = `M ${padX},${points[0].y} L ${w - padX},${points[0].y}`;
  } else if (points.length > 1) {
    linePath = `M ${points[0].x.toFixed(1)},${points[0].y.toFixed(1)}`;
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[Math.max(0, i - 1)];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = points[Math.min(points.length - 1, i + 2)];

      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;

      linePath += ` C ${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
    }
  }

  const areaPath =
    points.length > 1
      ? `${linePath} L ${points[points.length - 1].x.toFixed(1)},${h - padBottom} L ${points[0].x.toFixed(1)},${h - padBottom} Z`
      : '';

  const activePoint = hoverIndex !== null && points[hoverIndex] ? points[hoverIndex] : null;

  return (
    <div className="relative w-full overflow-hidden select-none">
      {/* Active tooltip / badge */}
      {activePoint && (
        <div
          className="absolute z-20 pointer-events-none -translate-x-1/2 -translate-y-full mb-2 px-2.5 py-1 rounded-lg bg-slate-900/90 text-white text-[11px] font-semibold shadow-lg backdrop-blur-sm border border-white/10 flex items-center gap-1.5 transition-all duration-150"
          style={{
            left: `${(activePoint.x / w) * 100}%`,
            top: `${(activePoint.y / h) * 100}%`,
          }}
        >
          <span className="text-indigo-300 font-mono">{activePoint.day}</span>
          <span className="w-1 h-1 rounded-full bg-slate-400" />
          <span className="font-bold text-white">{activePoint.v} visits</span>
        </div>
      )}

      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="w-full h-44 sm:h-52 overflow-visible"
        preserveAspectRatio="none"
        onMouseLeave={() => setHoverIndex(null)}
      >
        <defs>
          <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#6366F1" stopOpacity="0.32" />
            <stop offset="50%" stopColor="#818CF8" stopOpacity="0.12" />
            <stop offset="100%" stopColor="#C7D2FE" stopOpacity="0.0" />
          </linearGradient>
          <linearGradient id="strokeGradient" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#4F46E5" />
            <stop offset="50%" stopColor="#6366F1" />
            <stop offset="100%" stopColor="#8B5CF6" />
          </linearGradient>
        </defs>

        {/* Horizontal grid lines */}
        <line
          x1={padX}
          y1={padTop}
          x2={w - padX}
          y2={padTop}
          stroke="#E2E8F0"
          strokeDasharray="4 4"
          strokeWidth="1"
        />
        <line
          x1={padX}
          y1={padTop + (h - padTop - padBottom) / 2}
          x2={w - padX}
          y2={padTop + (h - padTop - padBottom) / 2}
          stroke="#F1F5F9"
          strokeDasharray="4 4"
          strokeWidth="1"
        />
        <line
          x1={padX}
          y1={h - padBottom}
          x2={w - padX}
          y2={h - padBottom}
          stroke="#E2E8F0"
          strokeWidth="1"
        />

        {/* Gradient fill area */}
        {areaPath && <path d={areaPath} fill="url(#chartGradient)" />}

        {/* Smooth Bézier curve */}
        {linePath && (
          <path
            d={linePath}
            fill="none"
            stroke="url(#strokeGradient)"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}

        {/* Interactive nodes & vertical guidelines */}
        {points.map((pt, i) => {
          const isHovered = hoverIndex === i;
          return (
            <g key={i}>
              {isHovered && (
                <line
                  x1={pt.x}
                  y1={padTop}
                  x2={pt.x}
                  y2={h - padBottom}
                  stroke="#818CF8"
                  strokeWidth="1.5"
                  strokeDasharray="3 3"
                />
              )}
              {/* Visible node point */}
              <circle
                cx={pt.x}
                cy={pt.y}
                r={isHovered ? 6 : points.length > 30 ? 2 : 3.5}
                className={`transition-all duration-150 ${
                  isHovered ? 'fill-indigo-600 stroke-white stroke-[3px]' : 'fill-white stroke-indigo-500 stroke-2'
                }`}
              />
              {/* Invisible wider hit target for effortless hover */}
              <rect
                x={pt.x - (w / points.length) / 2}
                y={0}
                width={w / points.length}
                height={h}
                fill="transparent"
                className="cursor-pointer"
                onMouseEnter={() => setHoverIndex(i)}
                onClick={() => setHoverIndex(i)}
              />
            </g>
          );
        })}

        {/* Date labels at bottom */}
        {points.length > 0 && (
          <>
            <text
              x={points[0].x}
              y={h - 8}
              fontSize="10"
              fontWeight="600"
              fill="#94A3B8"
              textAnchor="start"
            >
              {points[0].day}
            </text>
            {points.length > 2 && (
              <text
                x={points[Math.floor(points.length / 2)].x}
                y={h - 8}
                fontSize="10"
                fontWeight="600"
                fill="#94A3B8"
                textAnchor="middle"
              >
                {points[Math.floor(points.length / 2)].day}
              </text>
            )}
            <text
              x={points[points.length - 1].x}
              y={h - 8}
              fontSize="10"
              fontWeight="600"
              fill="#94A3B8"
              textAnchor="end"
            >
              {points[points.length - 1].day}
            </text>
          </>
        )}
      </svg>
    </div>
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
  const totals = summary?.totals || {};

  return (
    <div className="relative min-h-[100dvh] overflow-x-clip bexo-app-shell">
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
              <div className="w-7 h-7 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
                <BarChart3 className="w-4 h-4" />
              </div>
              <div>
                <h1 className="text-sm font-bold text-slate-900 leading-none">Portfolio analytics</h1>
                <p className="text-[11px] text-slate-400 font-medium mt-0.5">Real-time traffic & conversions</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              className="h-8 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 shadow-sm focus:border-indigo-500 focus:outline-none"
            >
              <option value={7}>Last 7 days</option>
              <option value={30}>Last 30 days</option>
              <option value={90}>Last 90 days</option>
            </select>
            <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5 shadow-sm" onClick={load} disabled={loading}>
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-600" /> : <RefreshCw className="w-3.5 h-3.5" />}
              Refresh
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] md:pb-6">
        {!unlocked && !loading ? (
          <div className="rounded-2xl border border-dashed border-indigo-200 bg-white p-8 text-center shadow-sm">
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
                { label: 'Visits', value: totals.displayViews ?? 0, hint: 'Total page impressions', icon: Eye, color: 'text-blue-600 bg-blue-50 border-blue-100' },
                { label: 'Uniques', value: totals.uniquesApprox ?? 0, hint: 'Unique visitors approx.', icon: Users, color: 'text-violet-600 bg-violet-50 border-violet-100' },
                { label: 'Leads', value: totals.leads ?? 0, hint: `${totals.leadsUnread ?? 0} unread enquiries`, icon: Mail, color: 'text-emerald-600 bg-emerald-50 border-emerald-100' },
                { label: 'Range', value: `${days} Days`, hint: 'Active window', icon: Calendar, color: 'text-amber-600 bg-amber-50 border-amber-100' },
              ].map((card) => {
                const IconComp = card.icon;
                return (
                  <div key={card.label} className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm hover:shadow-md transition-shadow">
                    <div className="flex items-center justify-between">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{card.label}</p>
                      <div className={`w-7 h-7 rounded-lg border flex items-center justify-center ${card.color}`}>
                        <IconComp className="w-3.5 h-3.5" />
                      </div>
                    </div>
                    <p className="mt-2 text-2xl font-black tracking-tight tabular-nums text-slate-900">
                      {loading ? '—' : card.value}
                    </p>
                    <p className="text-[11px] text-slate-400 mt-1 font-medium">{card.hint}</p>
                  </div>
                );
              })}
            </div>

            <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-indigo-600" />
                  <h2 className="text-sm font-bold text-slate-900">Traffic pulse</h2>
                </div>
                <button
                  type="button"
                  onClick={() => setLocation('/dashboard/inbox')}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-800 bg-indigo-50/80 px-2.5 py-1 rounded-lg hover:bg-indigo-100 transition-colors"
                >
                  <Inbox className="w-3.5 h-3.5" /> Open leads inbox
                </button>
              </div>
              {loading ? (
                <div className="flex flex-col items-center justify-center py-16 gap-2">
                  <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
                  <span className="text-xs text-slate-400">Loading traffic metrics...</span>
                </div>
              ) : series.length > 0 ? (
                <PulseChart series={series} />
              ) : (
                <p className="text-xs text-slate-400 py-12 text-center">No visit data in this window yet.</p>
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
