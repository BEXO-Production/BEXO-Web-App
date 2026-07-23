import React, { useState, useEffect } from 'react';
import { useOnboarding } from '../context/OnboardingContext';
import { Label, cn } from '../design-system/primitives';
import { ArrowRight, User, Globe, CheckCircle2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { PLATFORM_DOMAIN } from '../lib/platform';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const DAYS = Array.from({ length: 31 }, (_, i) => String(i + 1));

const currentYear = new Date().getFullYear();
// Generate years from 16 years ago down to 100 years ago
const YEARS = Array.from({ length: 85 }, (_, i) => String(currentYear - 16 - i));

const COUNTRIES = [
  'India',
  'United States',
  'United Kingdom',
  'Canada',
  'Australia',
  'Singapore',
  'Germany',
  'France',
  'Japan',
  'United Arab Emirates',
  'Saudi Arabia',
  'South Africa',
  'New Zealand',
  'Ireland',
  'Netherlands'
];

export default function Step3Info() {
  const { data, updateData, nextStep } = useOnboarding();

  // Helper to parse initial dob (YYYY-MM-DD) into Day, Month, Year
  const parseInitialDob = () => {
    let day = '';
    let month = '';
    let year = '';

    if (data.dob && data.dob.includes('-')) {
      const [y, m, d] = data.dob.split('-');
      const monthIdx = parseInt(m, 10) - 1;
      if (monthIdx >= 0 && monthIdx < 12) {
        month = MONTHS[monthIdx];
      }
      day = String(parseInt(d, 10));
      year = y;
    }
    return { day, month, year };
  };

  const initialDob = parseInitialDob();

  const [handle, setHandle] = useState(() => {
    if (data.handle) return data.handle;
    try {
      return localStorage.getItem('bexo_claim_handle') || '';
    } catch {
      return '';
    }
  });
  const [handleAvailability, setHandleAvailability] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle');
  const [firstName, setFirstName] = useState(data.firstName || '');
  const [lastName, setLastName] = useState(data.lastName || '');
  const [dobDay, setDobDay] = useState(initialDob.day);
  const [dobMonth, setDobMonth] = useState(initialDob.month);
  const [dobYear, setDobYear] = useState(initialDob.year);
  const [nationality, setNationality] = useState(data.nationality || 'India');
  const [pronouns, setPronouns] = useState(data.pronouns || 'She/Her');
  const [email, setEmail] = useState('');

  const [firstNameError, setFirstNameError] = useState('');
  const [lastNameError, setLastNameError] = useState('');
  const [handleError, setHandleError] = useState('');
  const [emailError, setEmailError] = useState('');
  const [dobError, setDobError] = useState('');
  const [pronounsError, setPronounsError] = useState('');
  const [isSwooshing, setIsSwooshing] = useState(false);
  const [isHandleManuallyEdited, setIsHandleManuallyEdited] = useState(() => {
    try {
      return !!(localStorage.getItem('bexo_claim_handle') || data.handle);
    } catch {
      return !!data.handle;
    }
  });

  // Fetch unique handle suggestion from backend
  const fetchSuggestedHandle = async (fName: string, lName: string) => {
    if (!fName.trim()) return;
    try {
      // Never overwrite a claimed/pre-filled handle
      if (isHandleManuallyEdited) return;
      try {
        if (localStorage.getItem('bexo_claim_handle')) return;
      } catch { /* ignore */ }

      const token = localStorage.getItem('token');
      const headers: HeadersInit = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      const res = await fetch(`/api/profile/suggest-handle?firstName=${encodeURIComponent(fName)}&lastName=${encodeURIComponent(lName)}`, { headers });
      if (res.ok) {
        const result = await res.json();
        if (result.suggestedHandle) {
          setHandle(result.suggestedHandle);
        }
      }
    } catch (err) {
      console.error('Error fetching suggested handle:', err);
    }
  };

  // Debounce handle suggestion as user types name
  useEffect(() => {
    if (isHandleManuallyEdited || !firstName.trim()) return;
    const timer = setTimeout(() => {
      fetchSuggestedHandle(firstName, lastName);
    }, 400);
    return () => clearTimeout(timer);
  }, [firstName, lastName, isHandleManuallyEdited]);

  useEffect(() => {
    const fetchGoogleDetails = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session || !session.user) return;
        const emailVal = session.user.email || '';
        if (emailVal) setEmail(emailVal);

        let fName = '';
        let lName = '';

        // 1. Try to fetch the display name from Google People API.
        //    Basic details only — we never request birthdays or genders.
        if (session.provider_token) {
          try {
            const response = await fetch(
              'https://people.googleapis.com/v1/people/me?personFields=names',
              {
                headers: {
                  Authorization: `Bearer ${session.provider_token}`,
                },
              }
            );

            if (response.ok) {
              const personData = await response.json();
              const nameObj = personData.names?.[0];
              if (nameObj) {
                fName = nameObj.givenName || '';
                lName = nameObj.familyName || '';
              }
            }
          } catch (apiErr) {
            console.warn('Google People API fetch failed:', apiErr);
          }
        }

        // 2. Fall back to Supabase user_metadata for names if still empty
        const metadata = session.user.user_metadata;
        if ((!fName || !lName) && metadata?.full_name) {
          const nameParts = metadata.full_name.trim().split(/\s+/);
          if (!fName) fName = nameParts[0] || '';
          if (!lName) lName = nameParts.slice(1).join(' ') || '';
        }

        // 3. Set state only if not already set by user/db (pronouns + DOB stay manual)
        setFirstName(prev => prev || fName);
        setLastName(prev => prev || lName);

        // 4. Query suggested handle from backend
        if (fName && !handle) {
          await fetchSuggestedHandle(fName, lName);
        }

      } catch (err) {
        console.error('Error fetching Google profile details:', err);
      }
    };

    fetchGoogleDetails();
  }, []);

  React.useEffect(() => {
    if (!handle.trim()) {
      setHandleAvailability('idle');
      setHandleError('');
      return;
    }

    setHandleAvailability('checking');
    setHandleError('');

    const token = localStorage.getItem('token');
    const headers: HeadersInit = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/profile/check-handle?handle=${encodeURIComponent(handle.trim())}`, { headers });
        if (!res.ok) {
          setHandleAvailability('idle');
          setHandleError('Could not verify handle right now. Try again.');
          return;
        }
        const result = await res.json();
        if (result.available) {
          setHandleAvailability('available');
          setHandleError('');
        } else {
          setHandleAvailability('taken');
          setHandleError(result.reason === 'reserved' ? 'That handle is reserved' : 'Handle is already taken');
        }
      } catch (err) {
        console.error(err);
        setHandleAvailability('idle');
        setHandleError('Could not verify handle right now. Try again.');
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [handle]);

  const validateDate = (dayStr: string, monthStr: string, yearStr: string) => {
    const day = parseInt(dayStr, 10);
    const monthIndex = MONTHS.indexOf(monthStr);
    const year = parseInt(yearStr, 10);

    if (isNaN(day) || monthIndex === -1 || isNaN(year)) {
      return false;
    }

    const d = new Date(year, monthIndex, day);
    // Date auto-wraps (e.g. Feb 30 becomes Mar 2), so check if it matched the input
    return d.getFullYear() === year && d.getMonth() === monthIndex && d.getDate() === day;
  };

  const calculateAge = (dayStr: string, monthStr: string, yearStr: string) => {
    const day = parseInt(dayStr, 10);
    const monthIndex = MONTHS.indexOf(monthStr);
    const year = parseInt(yearStr, 10);

    const birthDate = new Date(year, monthIndex, day);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    let valid = true;

    if (!firstName.trim()) {
      setFirstNameError('First name is required');
      valid = false;
    } else {
      setFirstNameError('');
    }

    if (!lastName.trim()) {
      setLastNameError('Last name is required');
      valid = false;
    } else {
      setLastNameError('');
    }

    if (!pronouns.trim()) {
      setPronounsError('Please select your pronouns');
      valid = false;
    } else {
      setPronounsError('');
    }

    // DOB is mandatory
    if (!dobDay || !dobMonth || !dobYear) {
      setDobError('Please select your date of birth');
      valid = false;
    } else if (!validateDate(dobDay, dobMonth, dobYear)) {
      setDobError('Please select a valid date of birth');
      valid = false;
    } else {
      const age = calculateAge(dobDay, dobMonth, dobYear);
      if (age < 16 || age > 100) {
        setDobError('Please enter a valid date of birth (must be at least 16 years old)');
        valid = false;
      } else {
        setDobError('');
      }
    }

    if (!handle.trim()) {
      setHandleError('Handle is required');
      valid = false;
    } else if (handle.length < 3) {
      setHandleError('Handle must be at least 3 characters');
      valid = false;
    }

    if (!valid) return;

    setIsSwooshing(true);

    // Save handle (+ Google email if we have one) and check uniqueness first
    let emailToSave = email;
    try {
      const token = localStorage.getItem('token');
      if (token) {
        const res = await fetch('/api/profile', {
          method: 'PATCH',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ handle, ...(email ? { email } : {}) })
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          if (res.status === 409) {
            // Email belongs to another account — keep going without it.
            setEmailError(errData.error || 'This email is already linked to another BEXO account, so we left it blank.');
            setEmail('');
            emailToSave = '';
            const retry = await fetch('/api/profile', {
              method: 'PATCH',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
              },
              body: JSON.stringify({ handle })
            });
            if (!retry.ok && retry.status !== 401) {
              const retryErr = await retry.json().catch(() => ({}));
              setHandleError(retryErr.error || 'Handle already taken');
              setIsSwooshing(false);
              return;
            }
          } else if (res.status !== 401) {
            setHandleError(errData.error || 'Handle already taken');
            setIsSwooshing(false);
            return;
          }
        }
      }
    } catch (e) {
      console.error(e);
    }

    const monthNum = String(MONTHS.indexOf(dobMonth) + 1).padStart(2, '0');
    const dayNum = String(parseInt(dobDay, 10)).padStart(2, '0');
    const dobString = `${dobYear}-${monthNum}-${dayNum}`;

    updateData({
      handle,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      name: `${firstName.trim()} ${lastName.trim()}`,
      email: emailToSave || undefined,
      dob: dobString,
      nationality,
      pronouns
    });

    // Navigate
    setTimeout(() => {
      nextStep(3);
    }, 600);
  };

  const selectClassName = "flex h-11 sm:h-12 w-full rounded-xl border border-slate-200 bg-white pl-10 sm:pl-11 pr-8 sm:pr-10 py-2 text-xs sm:text-sm text-slate-900 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 appearance-none bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%236b7280%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E')] bg-[length:8px_8px] sm:bg-[length:10px_10px] bg-[position:right_12px_center] sm:bg-[position:right_16px_center] bg-no-repeat cursor-pointer";

  const dobSelectClassName = "flex h-11 sm:h-12 w-full rounded-xl border border-slate-200 bg-white px-2.5 sm:px-3.5 pr-6 sm:pr-8 py-2 text-xs sm:text-sm text-slate-900 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 appearance-none bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%236b7280%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E')] bg-[length:8px_8px] sm:bg-[length:10px_10px] bg-[position:right_8px_center] sm:bg-[position:right_12px_center] bg-no-repeat cursor-pointer";

  return (
    <div className="flex flex-col lg:flex-row gap-6 lg:gap-12 h-full pb-4 max-w-full overflow-hidden">
      
      {/* Left Column: Heading + Illustration */}
      <div className="lg:w-2/5 flex flex-col justify-start pt-1 sm:pt-2">
        <p className="font-serif italic text-indigo-500 text-base sm:text-lg mb-1 sm:mb-2">Nice to meet you,</p>
        <h1 className="font-serif text-2xl sm:text-3xl md:text-4xl lg:text-[2.6rem] font-bold text-slate-900 mb-2 sm:mb-4 leading-tight tracking-tight">
          Let's tell the world who you are.
        </h1>
        <p className="text-slate-500 text-xs sm:text-sm leading-relaxed mb-4 sm:mb-8">
          Just the basics — your name, email, BEXO URL, and date of birth. You can edit your details anytime later.
        </p>
      </div>

      {/* Right Column: Form */}
      <div className="lg:w-3/5 flex flex-col min-w-0">
        <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-5 flex-1">
          {/* Name Fields */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
            <div className="space-y-1.5 sm:space-y-2">
              <Label htmlFor="firstName" className={firstNameError ? "text-red-500 font-semibold text-xs" : "text-slate-700 font-semibold text-xs"}>
                First name <span className="text-indigo-500">*</span>
              </Label>
              <div className="input-with-icon">
                <User className="input-icon w-4 h-4" />
                <input
                  id="firstName"
                  placeholder="Priya"
                  className={cn(
                    "flex h-11 sm:h-12 w-full rounded-xl border bg-white pl-10 sm:pl-11 pr-4 py-2 text-xs sm:text-sm text-slate-900 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 placeholder:text-slate-400",
                    firstNameError ? "border-red-500 focus-visible:ring-red-500" : "border-slate-200"
                  )}
                  value={firstName}
                  onChange={(e) => {
                    setFirstName(e.target.value);
                    if (e.target.value.trim()) setFirstNameError('');
                  }}
                  autoFocus
                />
              </div>
              {firstNameError && <p className="text-red-500 text-xs mt-1">{firstNameError}</p>}
            </div>

            <div className="space-y-1.5 sm:space-y-2">
              <Label htmlFor="lastName" className={lastNameError ? "text-red-500 font-semibold text-xs" : "text-slate-700 font-semibold text-xs"}>
                Last name <span className="text-indigo-500">*</span>
              </Label>
              <div className="input-with-icon">
                <User className="input-icon w-4 h-4" />
                <input
                  id="lastName"
                  placeholder="Sharma"
                  className={cn(
                    "flex h-11 sm:h-12 w-full rounded-xl border bg-white pl-10 sm:pl-11 pr-4 py-2 text-xs sm:text-sm text-slate-900 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 placeholder:text-slate-400",
                    lastNameError ? "border-red-500 focus-visible:ring-red-500" : "border-slate-200"
                  )}
                  value={lastName}
                  onChange={(e) => {
                    setLastName(e.target.value);
                    if (e.target.value.trim()) setLastNameError('');
                  }}
                />
              </div>
              {lastNameError && <p className="text-red-500 text-xs mt-1">{lastNameError}</p>}
            </div>
          </div>

          {/* Handle Field */}
          <div className="space-y-1.5 sm:space-y-2 pb-1 sm:pb-2">
            <Label htmlFor="handle" className={handleError ? "text-red-500 font-semibold text-xs" : "text-slate-700 font-semibold text-xs"}>
              BEXO URL <span className="text-indigo-500">*</span>
            </Label>
            <div className="flex h-11 sm:h-12 w-full rounded-xl border border-slate-200 bg-white overflow-hidden focus-within:ring-2 focus-within:ring-indigo-500 transition-colors">
              <input
                id="handle"
                placeholder="priyasharma"
                className="flex-1 min-w-0 bg-transparent pl-3.5 sm:pl-4 py-2 text-xs sm:text-sm text-slate-900 focus-visible:outline-none placeholder:text-slate-400"
                value={handle}
                onChange={(e) => {
                  setHandle(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''));
                  setIsHandleManuallyEdited(true);
                  if (e.target.value.trim()) setHandleError('');
                }}
              />
              <div className="flex items-center px-3 sm:px-4 bg-slate-50 border-l border-slate-200 text-slate-500 text-xs sm:text-sm font-medium shrink-0">
                .{PLATFORM_DOMAIN}
              </div>
            </div>
            {handleAvailability === 'checking' && (
              <p className="text-slate-400 text-xs mt-1 animate-pulse">Checking availability...</p>
            )}
            {handleAvailability === 'available' && (
              <p className="text-emerald-500 text-xs mt-1 font-medium">✓ Handle is available!</p>
            )}
            {handleError && handleAvailability === 'taken' && (
              <p className="text-red-500 text-xs mt-1">{handleError}</p>
            )}
          </div>

          {/* Date of Birth Field */}
          <div className="space-y-1.5 sm:space-y-2">
            <Label className={dobError ? "text-red-500 font-semibold text-xs" : "text-slate-700 font-semibold text-xs"}>
              Date of birth <span className="text-indigo-500">*</span>
            </Label>
            <div className="grid grid-cols-3 gap-2 sm:gap-3">
              {/* Day */}
              <select
                id="dobDay"
                className={cn(dobSelectClassName, dobError ? "border-red-500 focus-visible:ring-red-500" : "")}
                value={dobDay}
                onChange={(e) => {
                  setDobDay(e.target.value);
                  setDobError('');
                }}
              >
                <option value="">Day</option>
                {DAYS.map(d => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>

              {/* Month */}
              <select
                id="dobMonth"
                className={cn(dobSelectClassName, dobError ? "border-red-500 focus-visible:ring-red-500" : "")}
                value={dobMonth}
                onChange={(e) => {
                  setDobMonth(e.target.value);
                  setDobError('');
                }}
              >
                <option value="">Month</option>
                {MONTHS.map(m => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>

              {/* Year */}
              <select
                id="dobYear"
                className={cn(dobSelectClassName, dobError ? "border-red-500 focus-visible:ring-red-500" : "")}
                value={dobYear}
                onChange={(e) => {
                  setDobYear(e.target.value);
                  setDobError('');
                }}
              >
                <option value="">Year</option>
                {YEARS.map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
            <p className="text-[11px] sm:text-xs text-slate-400 mt-1">
              Used to verify academic eligibility. Never shown publicly.
            </p>
            {dobError && <p className="text-red-500 text-xs mt-1">{dobError}</p>}
          </div>

          {/* Nationality Field */}
          <div className="space-y-1.5 sm:space-y-2">
            <Label htmlFor="nationality" className="text-slate-700 font-semibold text-xs">
              Nationality <span className="text-indigo-500">*</span>
            </Label>
            <div className="input-with-icon">
              <Globe className="input-icon w-4 h-4" />
              <select
                id="nationality"
                className={selectClassName}
                value={nationality}
                onChange={(e) => setNationality(e.target.value)}
              >
                {COUNTRIES.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Pronouns Field */}
          <div className="space-y-2 sm:space-y-3">
            <Label className={pronounsError ? "text-red-500 font-semibold text-xs" : "text-slate-700 font-semibold text-xs"}>
              Pronouns <span className="text-indigo-500">*</span>
            </Label>
            <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2 sm:gap-2.5">
              {['She/Her', 'He/Him', 'They/Them', 'Prefer not to say'].map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => {
                    setPronouns(option);
                    setPronounsError('');
                  }}
                  className={cn(
                    "flex items-center justify-center sm:justify-start gap-1.5 sm:gap-2 px-3 sm:px-5 py-2 sm:py-2.5 rounded-full border text-xs sm:text-sm transition-all font-medium duration-200 cursor-pointer text-center truncate",
                    pronouns === option
                      ? "bg-indigo-600 border-indigo-600 text-white shadow-sm"
                      : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300",
                    pronounsError ? "border-red-500" : ""
                  )}
                >
                  <CheckCircle2 className={cn(
                    "w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0",
                    pronouns === option ? "text-white" : "text-slate-300"
                  )} />
                  <span className="truncate">{option}</span>
                </button>
              ))}
            </div>
            {pronounsError && <p className="text-red-500 text-xs mt-1">{pronounsError}</p>}
          </div>

          {emailError && (
            <p className="text-amber-600 text-xs bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              {emailError}
            </p>
          )}

          {/* Dark Submit Button */}
          <div className="pt-2 sm:pt-4 onboarding-cta">
            <button
              type="submit"
              disabled={!firstName.trim() || !lastName.trim() || !dobDay || !dobMonth || !dobYear || !pronouns.trim() || isSwooshing || handleAvailability === 'checking' || handleAvailability === 'taken'}
              className={`w-full h-12 sm:h-14 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl font-semibold text-sm sm:text-base transition-all duration-200 flex items-center justify-center gap-3 group disabled:opacity-50 disabled:pointer-events-none cursor-pointer shadow-lg shadow-slate-900/20 btn-continue-wrap px-4 sm:px-6${isSwooshing ? ' is-swooshing' : ''}`}
            >
              <div className="w-8 h-8 sm:w-9 sm:h-9 bg-indigo-500 rounded-xl flex items-center justify-center arrow-box shrink-0">
                <ArrowRight className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
              </div>
              <span className="btn-label">Save & Continue</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
