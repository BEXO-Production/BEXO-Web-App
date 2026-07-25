import React, { useState } from 'react';
import { Button, Input, Card } from '../design-system/primitives';
import { LifeBuoy, Loader2, Check } from 'lucide-react';
import { useToast } from '../hooks/use-toast';
import { apiUrl } from '../lib/api';

/** In-app support ticket form — creates a row in admin Support. */
export function ContactSupportCard() {
  const { toast } = useToast();
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [sending, setSending] = useState(false);
  const [ticketNumber, setTicketNumber] = useState<string | null>(null);

  const submit = async () => {
    const sub = subject.trim();
    const desc = description.trim();
    if (sub.length < 3) {
      toast({ title: 'Add a subject', description: 'At least 3 characters.', variant: 'destructive' });
      return;
    }
    if (desc.length < 5) {
      toast({ title: 'Describe the issue', description: 'At least 5 characters.', variant: 'destructive' });
      return;
    }
    setSending(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(apiUrl('/api/support/tickets'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ subject: sub, description: desc, channel: 'app', priority: 'normal' }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Could not create ticket');
      setTicketNumber(body.ticket?.ticketNumber || body.ticketNumber || null);
      setSubject('');
      setDescription('');
      toast({
        title: 'Ticket submitted',
        description: body.ticket?.ticketNumber
          ? `Reference ${body.ticket.ticketNumber}. Our team will reply by email.`
          : 'Our team will reply by email.',
      });
    } catch (err: any) {
      toast({ title: 'Could not send', description: err.message || 'Try again.', variant: 'destructive' });
    } finally {
      setSending(false);
    }
  };

  return (
    <Card className="p-6 bg-white border border-slate-200 shadow-sm space-y-4">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center shrink-0">
          <LifeBuoy className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <h3 className="font-bold text-slate-900 text-base">Contact support</h3>
          <p className="text-sm text-slate-500 mt-0.5">
            Raise a ticket — it shows up in our support inbox. We reply to your account email.
          </p>
        </div>
      </div>

      {ticketNumber ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 flex items-start gap-2">
          <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
          <div className="text-sm text-emerald-900">
            <p className="font-semibold">Ticket {ticketNumber} created</p>
            <p className="text-emerald-800 text-xs mt-1">
              Check your email for updates. You can submit another request below anytime.
            </p>
            <button
              type="button"
              className="text-xs font-semibold text-emerald-700 underline mt-2"
              onClick={() => setTicketNumber(null)}
            >
              Submit another
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Subject</label>
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="e.g. Autopay charge question"
              className="h-10 text-sm"
              disabled={sending}
              maxLength={120}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">How can we help?</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Share details so we can help faster…"
              rows={4}
              disabled={sending}
              maxLength={4000}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 resize-y min-h-[96px]"
            />
          </div>
          <Button type="button" size="sm" className="h-9 text-xs" disabled={sending} onClick={submit}>
            {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Submit ticket'}
          </Button>
        </div>
      )}
    </Card>
  );
}
