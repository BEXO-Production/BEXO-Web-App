import React, { useEffect, useId, useRef, useState } from 'react';
import { Loader2, MapPin, Search, X } from 'lucide-react';
import { Input, cn } from '../design-system/primitives';

export type BillingAddressValue = {
  line1: string;
  line2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
};

type AddressSuggestion = {
  id: string;
  label: string;
  line1: string;
  line2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
};

type Props = {
  value: BillingAddressValue;
  onChange: (patch: Partial<BillingAddressValue>) => void;
  disabled?: boolean;
  authToken: string | null;
};

const fieldClass =
  'h-12 text-base sm:text-sm touch-manipulation'; // 16px on mobile avoids iOS zoom

export function BillingAddressFields({ value, onChange, disabled, authToken }: Props) {
  const listId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [pinLoading, setPinLoading] = useState(false);
  const [pinHint, setPinHint] = useState<string | null>(null);
  const [areas, setAreas] = useState<string[]>([]);
  const [activeIdx, setActiveIdx] = useState(-1);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pinReqRef = useRef(0);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setActiveIdx(-1);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = query.trim();
    if (q.length < 3 || !authToken || disabled) {
      setSuggestions([]);
      setSearching(false);
      return;
    }

    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/geo/address-suggest?q=${encodeURIComponent(q)}`, {
          headers: { Authorization: `Bearer ${authToken}` },
        });
        const json = await res.json().catch(() => ({}));
        setSuggestions(Array.isArray(json.suggestions) ? json.suggestions : []);
        setOpen(true);
        setActiveIdx(-1);
      } catch {
        setSuggestions([]);
      } finally {
        setSearching(false);
      }
    }, 320);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, authToken, disabled]);

  useEffect(() => {
    const pin = value.postalCode.replace(/\D/g, '');
    if (pin.length !== 6 || !/^[1-9][0-9]{5}$/.test(pin) || !authToken) {
      setPinHint(null);
      setAreas([]);
      return;
    }

    const reqId = ++pinReqRef.current;
    setPinLoading(true);
    setPinHint(null);

    (async () => {
      try {
        const res = await fetch(`/api/geo/pincode/${pin}`, {
          headers: { Authorization: `Bearer ${authToken}` },
        });
        const json = await res.json().catch(() => ({}));
        if (reqId !== pinReqRef.current) return;
        if (!res.ok) {
          setPinHint(json.error || 'PIN not found');
          setAreas([]);
          return;
        }
        onChange({
          city: json.city || value.city,
          state: json.state || value.state,
          country: 'IN',
          postalCode: pin,
        });
        setAreas(Array.isArray(json.areas) ? json.areas : []);
        setPinHint(`${json.city}, ${json.state}`);
      } catch {
        if (reqId === pinReqRef.current) {
          setPinHint('Could not look up PIN — enter city & state manually');
          setAreas([]);
        }
      } finally {
        if (reqId === pinReqRef.current) setPinLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.postalCode, authToken]);

  const applySuggestion = (s: AddressSuggestion) => {
    onChange({
      line1: s.line1 || value.line1,
      line2: s.line2 || value.line2,
      city: s.city || value.city,
      state: s.state || value.state,
      postalCode: s.postalCode || value.postalCode,
      country: s.country || 'IN',
    });
    setQuery('');
    setSuggestions([]);
    setOpen(false);
    setActiveIdx(-1);
  };

  const onSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || !suggestions.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((i) => (i + 1) % suggestions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
    } else if (e.key === 'Enter' && activeIdx >= 0) {
      e.preventDefault();
      applySuggestion(suggestions[activeIdx]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div className="space-y-3 sm:space-y-3.5">
      <div ref={wrapRef} className="relative">
        <label className="block text-xs text-slate-500 mb-1.5">Search address</label>
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => suggestions.length && setOpen(true)}
            onKeyDown={onSearchKeyDown}
            placeholder="Start typing area, street, or landmark"
            disabled={disabled}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
            className={cn(fieldClass, 'pl-10 pr-10')}
          />
          <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
            {searching ? <Loader2 className="w-4 h-4 animate-spin text-slate-400" /> : null}
            {query ? (
              <button
                type="button"
                className="p-1.5 -mr-1 rounded-lg text-slate-400 hover:text-slate-600 touch-manipulation"
                aria-label="Clear search"
                onClick={() => {
                  setQuery('');
                  setSuggestions([]);
                  setOpen(false);
                }}
              >
                <X className="w-4 h-4" />
              </button>
            ) : null}
          </div>
        </div>
        {open && suggestions.length > 0 ? (
          <ul
            id={listId}
            role="listbox"
            className="absolute z-30 left-0 right-0 mt-1.5 max-h-56 sm:max-h-64 overflow-y-auto overscroll-contain rounded-xl border border-slate-200 bg-white shadow-lg divide-y divide-slate-100"
          >
            {suggestions.map((s, idx) => (
              <li key={s.id} role="option" aria-selected={idx === activeIdx}>
                <button
                  type="button"
                  className={cn(
                    'w-full text-left px-3.5 py-3 min-h-[48px] flex gap-2.5 items-start touch-manipulation',
                    idx === activeIdx ? 'bg-indigo-50' : 'hover:bg-slate-50 active:bg-slate-100',
                  )}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => applySuggestion(s)}
                >
                  <MapPin className="w-4 h-4 text-indigo-500 shrink-0 mt-0.5" />
                  <span className="text-sm text-slate-800 leading-snug">{s.label}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        <p className="text-[11px] text-slate-400 mt-1.5 leading-snug">
          Pick a suggestion to autofill, or type the street below.
        </p>
      </div>

      <div>
        <label className="block text-xs text-slate-500 mb-1.5">Address line 1</label>
        <Input
          value={value.line1}
          onChange={(e) => onChange({ line1: e.target.value })}
          placeholder="House / street"
          disabled={disabled}
          autoComplete="address-line1"
          className={fieldClass}
        />
      </div>

      <div>
        <label className="block text-xs text-slate-500 mb-1.5">Address line 2 (optional)</label>
        <Input
          value={value.line2}
          onChange={(e) => onChange({ line2: e.target.value })}
          placeholder="Landmark / area"
          disabled={disabled}
          autoComplete="address-line2"
          className={fieldClass}
        />
        {areas.length > 0 ? (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {areas.slice(0, 6).map((area) => (
              <button
                key={area}
                type="button"
                disabled={disabled}
                onClick={() => onChange({ line2: area })}
                className="px-2.5 py-1.5 rounded-lg bg-slate-100 text-slate-700 text-xs font-medium touch-manipulation active:bg-slate-200"
              >
                {area}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div>
        <label className="block text-xs text-slate-500 mb-1.5">PIN code</label>
        <div className="relative">
          <Input
            value={value.postalCode}
            onChange={(e) =>
              onChange({ postalCode: e.target.value.replace(/\D/g, '').slice(0, 6) })
            }
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="postal-code"
            placeholder="6-digit PIN"
            disabled={disabled}
            className={cn(fieldClass, 'pr-10 tracking-wider')}
            maxLength={6}
          />
          {pinLoading ? (
            <Loader2 className="w-4 h-4 absolute right-3.5 top-1/2 -translate-y-1/2 animate-spin text-indigo-500" />
          ) : null}
        </div>
        {pinHint ? (
          <p
            className={cn(
              'text-[11px] mt-1.5 leading-snug',
              pinHint.includes('not') || pinHint.includes('Could')
                ? 'text-amber-700'
                : 'text-emerald-700',
            )}
          >
            {pinLoading ? 'Looking up…' : pinHint}
          </p>
        ) : (
          <p className="text-[11px] text-slate-400 mt-1.5">
            Enter PIN to autofill city &amp; state
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-slate-500 mb-1.5">City</label>
          <Input
            value={value.city}
            onChange={(e) => onChange({ city: e.target.value })}
            disabled={disabled}
            autoComplete="address-level2"
            className={fieldClass}
          />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1.5">State</label>
          <Input
            value={value.state}
            onChange={(e) => onChange({ state: e.target.value })}
            placeholder="e.g. Tamil Nadu"
            disabled={disabled}
            autoComplete="address-level1"
            className={fieldClass}
          />
        </div>
      </div>

      {!value.line1 && query.length === 0 ? (
        <div className="rounded-xl bg-slate-50 border border-slate-100 px-3 py-2.5 text-[11px] text-slate-500 leading-snug sm:hidden">
          Tip: search your area, or enter PIN first — city and state fill in automatically.
        </div>
      ) : null}
    </div>
  );
}
