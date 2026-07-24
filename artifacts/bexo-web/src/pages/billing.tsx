import React from 'react';
import { useLocation } from 'wouter';
import Step9Plan from './step-9';

/**
 * Dedicated /billing route shell.
 * Payment / Autopay logic stays inside Step9Plan — this only wraps navigation.
 */
export default function BillingPage() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-[100dvh] bg-slate-50 px-4 py-8">
      <div className="mx-auto mb-6 flex w-full max-w-lg items-center justify-between">
        <button
          type="button"
          onClick={() => setLocation('/dashboard/settings/billing')}
          className="text-xs font-bold uppercase tracking-wider text-slate-500 hover:text-slate-900"
        >
          Back to settings
        </button>
        <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Billing</span>
      </div>
      <Step9Plan />
    </div>
  );
}
