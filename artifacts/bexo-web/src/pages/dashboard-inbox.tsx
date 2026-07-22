import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation } from 'wouter';
import {
  ArrowLeft,
  CheckCircle2,
  Circle,
  Inbox,
  Loader2,
  Lock,
  Mail,
  Phone,
  Reply,
  Search,
  Send,
  X,
} from 'lucide-react';
import { Button } from '../design-system/primitives';
import { useToast } from '../hooks/use-toast';
import { apiUrl } from '../lib/api';
import { usePageSeo } from '../hooks/use-page-seo';

type Lead = {
  id: string;
  senderName: string;
  senderEmail: string;
  senderPhone?: string | null;
  message: string;
  handle?: string;
  deliveryStatus?: string;
  readAt?: string | null;
  createdAt?: string | null;
};

type LeadReply = {
  id: string;
  subject: string;
  body: string;
  toEmail: string;
  toName?: string | null;
  fromName?: string | null;
  status: string;
  lastError?: string | null;
  createdAt?: string | null;
  sentAt?: string | null;
};

/** Strip HTML / normalize contact messages for readable mail body. */
function formatMailBody(raw: string): string {
  if (!raw) return '';
  let text = raw;
  if (/<[a-z][\s\S]*>/i.test(text)) {
    text = text
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<\/div>/gi, '\n')
      .replace(/<\/tr>/gi, '\n')
      .replace(/<\/h[1-6]>/gi, '\n\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
      .replace(/\u20b9|Rs\.?/g, '₹');
  }
  return text.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

function previewLine(raw: string, max = 90): string {
  const body = formatMailBody(raw).replace(/\s+/g, ' ').trim();
  if (body.length <= max) return body || '(No message)';
  return `${body.slice(0, max)}…`;
}

function formatWhen(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) {
    return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }
  return d.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  });
}

function statusLabel(status: string) {
  if (status === 'sent') return 'Delivered';
  if (status === 'queued') return 'Sending…';
  if (status === 'skipped') return 'Saved (email offline)';
  if (status === 'failed') return 'Failed';
  return status;
}

export default function DashboardInbox() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [mobileShowDetail, setMobileShowDetail] = useState(false);

  const [replies, setReplies] = useState<LeadReply[]>([]);
  const [threadLoading, setThreadLoading] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const [replyBody, setReplyBody] = useState('');
  const [replySubject, setReplySubject] = useState('');
  const [sending, setSending] = useState(false);

  usePageSeo({
    title: 'Leads inbox — BEXO',
    description: 'Contact form inquiries from your portfolio.',
    noindex: true,
  });

  const loadLeads = useCallback(async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(apiUrl('/api/analytics/leads'), {
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = await res.json().catch(() => ({}));
      if (res.status === 403) {
        setForbidden(true);
        setLeads([]);
        return;
      }
      if (!res.ok) throw new Error(result.error || 'Unable to load inbox');
      const list: Lead[] = result.leads || [];
      setLeads(list);
      setForbidden(false);
      setSelectedId((prev) => prev || (list[0]?.id ?? null));
    } catch (err: any) {
      toast({ title: 'Inbox error', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const loadThread = useCallback(
    async (leadId: string) => {
      setThreadLoading(true);
      try {
        const token = localStorage.getItem('token');
        const res = await fetch(apiUrl(`/api/analytics/leads/${leadId}/thread`), {
          headers: { Authorization: `Bearer ${token}` },
        });
        const result = await res.json().catch(() => ({}));
        if (res.status === 403) {
          setReplies([]);
          return;
        }
        if (!res.ok) throw new Error(result.error || 'Unable to load conversation');
        setReplies(result.replies || []);
      } catch (err: any) {
        console.error(err);
        setReplies([]);
      } finally {
        setThreadLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    loadLeads();
  }, [loadLeads]);

  useEffect(() => {
    if (!selectedId) {
      setReplies([]);
      setComposeOpen(false);
      return;
    }
    setComposeOpen(false);
    setReplyBody('');
    loadThread(selectedId);
  }, [selectedId, loadThread]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return leads;
    return leads.filter(
      (l) =>
        l.senderName?.toLowerCase().includes(q) ||
        l.senderEmail?.toLowerCase().includes(q) ||
        l.message?.toLowerCase().includes(q),
    );
  }, [leads, query]);

  const selected = leads.find((l) => l.id === selectedId) || null;
  const unreadCount = leads.filter((l) => !l.readAt).length;

  const markRead = async (id: string) => {
    const lead = leads.find((l) => l.id === id);
    if (!lead || lead.readAt) return;
    try {
      const token = localStorage.getItem('token');
      await fetch(apiUrl(`/api/analytics/leads/${id}/read`), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      setLeads((prev) =>
        prev.map((l) => (l.id === id ? { ...l, readAt: new Date().toISOString() } : l)),
      );
    } catch {
      /* non-blocking */
    }
  };

  const openLead = (id: string) => {
    setSelectedId(id);
    setMobileShowDetail(true);
    markRead(id);
  };

  const openCompose = () => {
    if (!selected) return;
    setReplySubject(
      `Re: Your message on ${selected.handle ? `${selected.handle}.atbexo.com` : 'BEXO'}`,
    );
    setReplyBody('');
    setComposeOpen(true);
  };

  const sendReply = async () => {
    if (!selected) return;
    const body = replyBody.trim();
    if (body.length < 2) {
      toast({ title: 'Write a reply', description: 'Add a short message before sending.', variant: 'destructive' });
      return;
    }
    setSending(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(apiUrl(`/api/analytics/leads/${selected.id}/reply`), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ body, subject: replySubject.trim() }),
      });
      const result = await res.json().catch(() => ({}));
      if (res.status === 403) {
        toast({
          title: 'Upgrade required',
          description: result.error || 'In-app replies unlock on Essential and Growth.',
          variant: 'destructive',
        });
        return;
      }
      if (!res.ok) throw new Error(result.error || 'Failed to send reply');

      if (result.reply) {
        setReplies((prev) => [...prev, result.reply]);
      } else {
        await loadThread(selected.id);
      }
      setLeads((prev) =>
        prev.map((l) => (l.id === selected.id ? { ...l, readAt: l.readAt || new Date().toISOString() } : l)),
      );
      setComposeOpen(false);
      setReplyBody('');
      toast({
        title: 'Reply sent',
        description: result.message || `Delivered to ${selected.senderEmail}`,
      });
    } catch (err: any) {
      toast({ title: 'Send failed', description: err.message, variant: 'destructive' });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setLocation('/dashboard')}
              className="inline-flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-slate-900"
            >
              <ArrowLeft className="w-4 h-4" /> Dashboard
            </button>
            <div className="h-4 w-px bg-slate-200" />
            <div className="flex items-center gap-2 min-w-0">
              <Inbox className="w-4 h-4 text-indigo-500 shrink-0" />
              <h1 className="text-sm font-bold text-slate-900 truncate">Leads inbox</h1>
              {unreadCount > 0 && (
                <span className="text-[10px] font-bold uppercase tracking-wider bg-indigo-50 text-indigo-700 border border-indigo-100 px-2 py-0.5 rounded-full">
                  {unreadCount} unread
                </span>
              )}
            </div>
          </div>
          <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => loadLeads()} disabled={loading}>
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Refresh'}
          </Button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-4 sm:py-6">
        {forbidden ? (
          <div className="rounded-2xl border border-dashed border-indigo-200 bg-white p-8 text-center">
            <Lock className="w-10 h-10 text-indigo-400 mx-auto mb-3" />
            <h2 className="text-lg font-bold text-slate-900">Inbox & replies unlock on Essential</h2>
            <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto">
              Collect recruiter inquiries and reply from BEXO — delivered by email and logged in your conversation history.
            </p>
            <Button className="mt-4" onClick={() => setLocation('/billing')}>
              Upgrade to Essential
            </Button>
          </div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden min-h-[70vh] grid md:grid-cols-[340px_1fr]">
            <div
              className={`border-r border-slate-100 flex flex-col min-h-[70vh] ${
                mobileShowDetail ? 'hidden md:flex' : 'flex'
              }`}
            >
              <div className="p-3 border-b border-slate-100">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search mail"
                    className="w-full h-9 rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
                  />
                </div>
                <p className="text-[11px] text-slate-400 mt-2 px-0.5">
                  {filtered.length} message{filtered.length === 1 ? '' : 's'}
                </p>
              </div>

              <div className="flex-1 overflow-y-auto">
                {loading ? (
                  <div className="flex justify-center py-16">
                    <Loader2 className="w-5 h-5 animate-spin text-slate-300" />
                  </div>
                ) : filtered.length === 0 ? (
                  <p className="text-xs text-slate-400 text-center py-16 px-6">
                    No contact form leads yet. Share your live portfolio URL to start collecting inquiries.
                  </p>
                ) : (
                  filtered.map((lead) => {
                    const active = lead.id === selectedId;
                    const unread = !lead.readAt;
                    return (
                      <button
                        key={lead.id}
                        type="button"
                        onClick={() => openLead(lead.id)}
                        className={`w-full text-left px-4 py-3.5 border-b border-slate-50 transition-colors ${
                          active ? 'bg-indigo-50/70' : 'hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            {unread ? (
                              <Circle className="w-2 h-2 fill-indigo-500 text-indigo-500 shrink-0" />
                            ) : (
                              <span className="w-2 shrink-0" />
                            )}
                            <p
                              className={`text-sm truncate ${
                                unread ? 'font-bold text-slate-900' : 'font-medium text-slate-700'
                              }`}
                            >
                              {lead.senderName || 'Unknown'}
                            </p>
                          </div>
                          <span className="text-[10px] text-slate-400 tabular-nums shrink-0">
                            {formatWhen(lead.createdAt)}
                          </span>
                        </div>
                        <p
                          className={`text-xs mt-0.5 truncate pl-4 ${
                            unread ? 'text-slate-700 font-medium' : 'text-slate-500'
                          }`}
                        >
                          {lead.senderEmail}
                        </p>
                        <p className="text-xs text-slate-400 mt-1 line-clamp-2 pl-4 leading-relaxed">
                          {previewLine(lead.message)}
                        </p>
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            <div className={`flex flex-col min-h-[70vh] ${mobileShowDetail ? 'flex' : 'hidden md:flex'}`}>
              {!selected ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
                  <Mail className="w-10 h-10 text-slate-200 mb-3" />
                  <p className="text-sm font-semibold text-slate-500">Select a message</p>
                  <p className="text-xs text-slate-400 mt-1">Choose a lead to read and reply from BEXO.</p>
                </div>
              ) : (
                <>
                  <div className="px-4 sm:px-6 py-4 border-b border-slate-100 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <button
                        type="button"
                        className="md:hidden text-xs font-semibold text-indigo-600 mb-2"
                        onClick={() => setMobileShowDetail(false)}
                      >
                        ← Back to inbox
                      </button>
                      <h2 className="text-lg font-bold text-slate-900 truncate">
                        Message from {selected.senderName}
                      </h2>
                      <p className="text-xs text-slate-400 mt-1">
                        {selected.createdAt
                          ? new Date(selected.createdAt).toLocaleString(undefined, {
                              weekday: 'short',
                              day: 'numeric',
                              month: 'short',
                              year: 'numeric',
                              hour: 'numeric',
                              minute: '2-digit',
                            })
                          : ''}
                      </p>
                    </div>
                    {!composeOpen && (
                      <button
                        type="button"
                        onClick={openCompose}
                        className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 shrink-0"
                      >
                        <Reply className="w-3.5 h-3.5" /> Reply
                      </button>
                    )}
                  </div>

                  <div className="px-4 sm:px-6 py-4 border-b border-slate-50 space-y-2 bg-slate-50/50">
                    <div className="flex items-center gap-2 text-sm text-slate-700">
                      <Mail className="w-3.5 h-3.5 text-slate-400" />
                      <span className="font-medium">From</span>
                      <span className="text-indigo-600 truncate">
                        {selected.senderName} &lt;{selected.senderEmail}&gt;
                      </span>
                    </div>
                    {selected.senderPhone && (
                      <div className="flex items-center gap-2 text-sm text-slate-700">
                        <Phone className="w-3.5 h-3.5 text-slate-400" />
                        <span className="font-medium">Phone</span>
                        <a href={`tel:${selected.senderPhone}`} className="text-slate-800">
                          {selected.senderPhone}
                        </a>
                      </div>
                    )}
                    {selected.handle && (
                      <p className="text-xs text-slate-400">Via portfolio · {selected.handle}.atbexo.com</p>
                    )}
                  </div>

                  <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-6 space-y-5">
                    <article>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">
                        Incoming
                      </p>
                      <pre className="whitespace-pre-wrap font-sans text-[15px] leading-relaxed text-slate-800 bg-transparent p-0 m-0 border-0">
                        {formatMailBody(selected.message) || '(Empty message)'}
                      </pre>
                    </article>

                    {threadLoading ? (
                      <div className="flex justify-center py-4">
                        <Loader2 className="w-4 h-4 animate-spin text-slate-300" />
                      </div>
                    ) : replies.length > 0 ? (
                      <div className="space-y-3 pt-2 border-t border-slate-100">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                          Your replies · logged
                        </p>
                        {replies.map((r) => (
                          <div
                            key={r.id}
                            className="rounded-2xl border border-indigo-100 bg-indigo-50/40 p-4"
                          >
                            <div className="flex items-center justify-between gap-2 mb-2">
                              <p className="text-xs font-semibold text-indigo-800">
                                You → {r.toName || r.toEmail}
                              </p>
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                                {r.status === 'sent' && <CheckCircle2 className="w-3 h-3 text-emerald-500" />}
                                {statusLabel(r.status)} · {formatWhen(r.sentAt || r.createdAt)}
                              </span>
                            </div>
                            {r.subject && (
                              <p className="text-[11px] text-slate-500 mb-2">Subject: {r.subject}</p>
                            )}
                            <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-slate-800">
                              {r.body}
                            </pre>
                            {r.lastError && (
                              <p className="text-[11px] text-rose-600 mt-2">{r.lastError}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>

                  {composeOpen && (
                    <div className="border-t border-slate-200 bg-white p-4 sm:p-5 space-y-3 shadow-[0_-8px_24px_rgba(15,23,42,0.06)]">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <p className="text-sm font-bold text-slate-900">Compose reply</p>
                          <p className="text-[11px] text-slate-400">
                            Sent via BEXO email · logged in this thread · Essential feature
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setComposeOpen(false)}
                          className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                          aria-label="Close compose"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                      <div>
                        <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                          To
                        </label>
                        <p className="text-sm text-slate-700 mt-0.5">
                          {selected.senderName} &lt;{selected.senderEmail}&gt;
                        </p>
                      </div>
                      <div>
                        <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                          Subject
                        </label>
                        <input
                          value={replySubject}
                          onChange={(e) => setReplySubject(e.target.value)}
                          className="mt-1 w-full h-9 rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
                          maxLength={160}
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                          Message
                        </label>
                        <textarea
                          value={replyBody}
                          onChange={(e) => setReplyBody(e.target.value)}
                          rows={5}
                          maxLength={4000}
                          placeholder="Write a clear, friendly reply…"
                          className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm leading-relaxed outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100 resize-y min-h-[120px]"
                        />
                        <p className="text-[10px] text-slate-400 mt-1 text-right">
                          {replyBody.length}/4000
                        </p>
                      </div>
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-9 text-xs"
                          onClick={() => setComposeOpen(false)}
                          disabled={sending}
                        >
                          Cancel
                        </Button>
                        <Button
                          size="sm"
                          className="h-9 text-xs gap-1.5"
                          onClick={sendReply}
                          disabled={sending || replyBody.trim().length < 2}
                        >
                          {sending ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Send className="w-3.5 h-3.5" />
                          )}
                          Send reply
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
