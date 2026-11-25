import React, { useState } from 'react';
import { ShieldCheck, Mail, Code2, Layers, ArrowRight } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { BrosDevLogo } from './shared/Logo';

export const AuthGate: React.FC<{ isAdminRoute: boolean }> = ({ isAdminRoute }) => {
  const { signInWithGoogle, signInWithEmail, registerWithEmail, error, clearError } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const effectiveMode = isAdminRoute ? 'login' : mode;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (effectiveMode === 'register') {
        await registerWithEmail(email.trim(), password, displayName.trim());
      } else {
        await signInWithEmail(email.trim(), password);
      }
    } catch {
      // Error surfaced via AuthContext
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F5F5F5] flex flex-col">
      <header className="bg-white border-b border-[#E5E5E5] px-6 md:px-10 h-16 flex items-center justify-between gap-8">
        <div className="flex items-center gap-2.5 whitespace-nowrap shrink-0">
          <BrosDevLogo className="w-8 h-8" />
          <span className="font-bold text-lg tracking-tight text-[#111111]">
            BrosDev Forms
          </span>
        </div>
        <div className="text-sm text-[#525252] whitespace-nowrap shrink-0">
          {isAdminRoute ? 'Super Admin Portal' : 'Form Builder & Email Routing'}
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center p-6 md:p-12">
        <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-12 bg-white border border-[#E5E5E5] rounded-xl overflow-hidden">
          {/* Left Narrative */}
          <div className="lg:col-span-6 p-8 md:p-12 flex flex-col justify-between border-b lg:border-b-0 lg:border-r border-[#E5E5E5]">
            <div>
              <p className="text-xs font-medium text-[#A90706] tracking-wide mb-3">
                {isAdminRoute ? 'Authorized Platform Operations' : 'Form Backend & Email Delivery'}
              </p>
              <h1
                className="text-3xl md:text-4xl font-bold text-[#111111] leading-tight mb-4"
                style={{ textWrap: 'balance' }}
              >
                {isAdminRoute
                  ? 'Manage BrosDev Forms infrastructure, Resend routing, and billing.'
                  : 'Build custom forms and route submissions straight to your inbox.'}
              </h1>
              <p className="text-[15px] text-[#525252] leading-relaxed">
                {isAdminRoute
                  ? 'Restricted to verified Super Admin, Admin, and Support personnel. Every administrative action is role-verified and recorded in the platform audit ledger.'
                  : 'Design forms visually, generate unique endpoints for HTML, JavaScript, or REST APIs, and deliver notifications reliably through managed Resend infrastructure.'}
              </p>
            </div>

            <div className="mt-10 pt-8 border-t border-[#E5E5E5] grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div className="flex items-start gap-3">
                <Layers className="w-4 h-4 text-[#A90706] mt-0.5 shrink-0" />
                <div>
                  <div className="text-sm font-semibold text-[#111111]">Drag-and-drop builder</div>
                  <div className="text-xs text-[#525252] mt-0.5">15 field types, validation rules, and live preview.</div>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Mail className="w-4 h-4 text-[#A90706] mt-0.5 shrink-0" />
                <div>
                  <div className="text-sm font-semibold text-[#111111]">Verified Resend routing</div>
                  <div className="text-xs text-[#525252] mt-0.5">Server-side delivery, auto-replies, and webhook tracking.</div>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Code2 className="w-4 h-4 text-[#A90706] mt-0.5 shrink-0" />
                <div>
                  <div className="text-sm font-semibold text-[#111111]">Instant integration code</div>
                  <div className="text-xs text-[#525252] mt-0.5">HTML, Fetch API, REST API keys, and embed widgets.</div>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <ShieldCheck className="w-4 h-4 text-[#A90706] mt-0.5 shrink-0" />
                <div>
                  <div className="text-sm font-semibold text-[#111111]">Spam &amp; domain protection</div>
                  <div className="text-xs text-[#525252] mt-0.5">Honeypots, domain allowlists, and idempotent delivery.</div>
                </div>
              </div>
            </div>
          </div>

          {/* Right Sign-in / Register Panel */}
          <div className="lg:col-span-6 p-8 md:p-12 flex flex-col justify-center bg-[#FAFAFA]">
            {!isAdminRoute && (
              <div className="flex items-center gap-1 p-1 bg-[#EFEFEF] rounded-lg mb-6">
                <button
                  type="button"
                  onClick={() => {
                    setMode('login');
                    clearError();
                  }}
                  className={`flex-1 py-2 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                    effectiveMode === 'login'
                      ? 'bg-white text-[#111111] shadow-xs'
                      : 'text-[#525252] hover:text-[#111111]'
                  }`}
                >
                  Sign In
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMode('register');
                    clearError();
                  }}
                  className={`flex-1 py-2 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                    effectiveMode === 'register'
                      ? 'bg-white text-[#111111] shadow-xs'
                      : 'text-[#525252] hover:text-[#111111]'
                  }`}
                >
                  Create Account
                </button>
              </div>
            )}

            <h2 className="text-xl font-bold text-[#111111] mb-1.5">
              {isAdminRoute
                ? 'Administrator Sign In'
                : effectiveMode === 'register'
                  ? 'Create your BrosDev Forms account'
                  : 'Sign in to your workspace'}
            </h2>
            <p className="text-xs text-[#525252] mb-6">
              {isAdminRoute
                ? 'Sign in with your administrator email and password or authorized Google account.'
                : effectiveMode === 'register'
                  ? 'Start on the Free plan immediately with 2 forms and 100 monthly submissions.'
                  : 'Enter your email and password or continue with Google.'}
            </p>

            {error && (
              <div className="mb-5 p-3.5 bg-[#FEF2F2] border border-[#FECACA] rounded-lg text-xs text-[#A90706]">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {effectiveMode === 'register' && (
                <div>
                  <label className="block text-xs font-semibold text-[#111111] mb-1">
                    Full Name
                  </label>
                  <input
                    type="text"
                    required
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Alex Morgan"
                    className="w-full px-3.5 py-2.5 text-sm bg-white border border-[#D4D4D4] rounded-lg focus:outline-none focus:border-[#111111]"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-[#111111] mb-1">
                  Email Address
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  autoComplete="email"
                  className="w-full px-3.5 py-2.5 text-sm bg-white border border-[#D4D4D4] rounded-lg focus:outline-none focus:border-[#111111]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#111111] mb-1">
                  Password
                </label>
                <input
                  type="password"
                  required
                  minLength={effectiveMode === 'register' ? 8 : 1}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={effectiveMode === 'register' ? 'Minimum 8 characters' : 'Enter your password'}
                  autoComplete={effectiveMode === 'register' ? 'new-password' : 'current-password'}
                  className="w-full px-3.5 py-2.5 text-sm bg-white border border-[#D4D4D4] rounded-lg focus:outline-none focus:border-[#111111]"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full flex items-center justify-center gap-2 px-5 py-2.5 bg-[#A90706] hover:bg-[#8C0605] text-white font-semibold text-sm rounded-lg transition-colors cursor-pointer disabled:opacity-60 whitespace-nowrap"
              >
                <span>
                  {submitting
                    ? effectiveMode === 'register'
                      ? 'Creating Account...'
                      : 'Signing In...'
                    : effectiveMode === 'register'
                      ? 'Create Account'
                      : 'Sign In with Email'}
                </span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>

            <div className="my-5 flex items-center gap-3">
              <div className="h-px bg-[#E5E5E5] flex-1" />
              <span className="text-[11px] font-medium text-[#737373]">or</span>
              <div className="h-px bg-[#E5E5E5] flex-1" />
            </div>

            <button
              type="button"
              onClick={signInWithGoogle}
              className="w-full flex items-center justify-center gap-2.5 px-5 py-2.5 bg-white hover:bg-[#F5F5F5] text-[#111111] border border-[#D4D4D4] font-semibold text-sm rounded-lg transition-colors cursor-pointer whitespace-nowrap"
            >
              <span>Continue with Google</span>
            </button>

            <p className="text-[11px] text-[#737373] mt-6 leading-relaxed">
              Protected by Firebase Authentication, Cloud Firestore security rules, and server-side
              Resend email delivery.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
};
