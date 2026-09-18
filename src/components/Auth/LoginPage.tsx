import React, { useEffect, useState } from 'react';
import {
  Zap,
  Eye,
  EyeOff,
  Loader2,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import {
  auth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  googleProvider,
  signInWithPopup,
} from '../../lib/supabase';
import { useApp } from '../../context/AppContext';
import { TermsModal } from './TermsModal';

interface LoginPageProps {
  onSuccess?: () => void;
}

type AuthMode = 'signin' | 'signup';

export const LoginPage: React.FC<LoginPageProps> = ({ onSuccess }) => {
  const { setIsGuestMode, firebaseUser, setFirebaseUser } = useApp();

  const [authMode, setAuthMode] = useState<AuthMode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [termsModalType, setTermsModalType] = useState<'terms' | 'privacy' | null>(null);

  useEffect(() => {
    if (!firebaseUser) return;
    setIsGuestMode(false);
    onSuccess?.();
  }, [firebaseUser, onSuccess, setIsGuestMode]);

  const resetMessages = () => {
    setErrorMsg(null);
    setSuccessMsg(null);
  };

  const switchMode = (mode: AuthMode) => {
    setAuthMode(mode);
    setPassword('');
    setConfirmPassword('');
    resetMessages();
  };

  const handleGoogleSignIn = async () => {
    resetMessages();
    setIsLoading(true);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err: any) {
      const message = String(err?.message || '');
      if (message.toLowerCase().includes('provider') && message.toLowerCase().includes('disabled')) {
        setErrorMsg('Google sign-in is not enabled in Supabase yet.');
      } else {
        setErrorMsg(message || 'Google sign-in failed.');
      }
      setIsLoading(false);
    }
  };

  const handleEmailPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    resetMessages();

    const cleanEmail = email.trim();
    if (!cleanEmail) {
      setErrorMsg('Please enter your email address.');
      return;
    }
    if (!password) {
      setErrorMsg('Please enter your password.');
      return;
    }
    if (password.length < 6) {
      setErrorMsg('Password must be at least 6 characters.');
      return;
    }
    if (authMode === 'signup' && password !== confirmPassword) {
      setErrorMsg('Passwords do not match.');
      return;
    }
    if (!auth) {
      setErrorMsg('Authentication service is not available.');
      return;
    }

    setIsLoading(true);
    try {
      if (authMode === 'signup') {
        const cred = await createUserWithEmailAndPassword(auth, cleanEmail, password);
        setFirebaseUser(cred.user);
        setIsGuestMode(false);
        setSuccessMsg(`Account created for ${cred.user.email}.`);
        onSuccess?.();
        return;
      }

      const cred = await signInWithEmailAndPassword(auth, cleanEmail, password);
      setFirebaseUser(cred.user);
      setIsGuestMode(false);
      setSuccessMsg(`Welcome back, ${cred.user.email}!`);
      onSuccess?.();
    } catch (err: any) {
      if (err?.code === 'auth/email-confirmation-required') {
        setSuccessMsg('Account created. Check your email to confirm it, then come back and Sign In.');
        setAuthMode('signin');
        setPassword('');
        setConfirmPassword('');
      } else if (err?.code === 'auth/email-already-in-use') {
        setErrorMsg('An account already exists with this email. Switch to Sign In.');
      } else if (err?.code === 'auth/user-not-found' || err?.code === 'auth/invalid-credential') {
        setErrorMsg('Email or password is incorrect. New users should choose Create account.');
      } else if (err?.code === 'auth/wrong-password') {
        setErrorMsg('Incorrect password. Use Forgot password if needed.');
      } else if (err?.code === 'auth/invalid-email') {
        setErrorMsg('Please enter a valid email address.');
      } else if (err?.code === 'auth/weak-password') {
        setErrorMsg('Please choose a stronger password with at least 6 characters.');
      } else if (err?.code === 'auth/operation-not-allowed') {
        setErrorMsg('Email/password authentication is not enabled in Supabase Auth.');
      } else {
        setErrorMsg(err?.message || (authMode === 'signup' ? 'Could not create account.' : 'Sign in failed.'));
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    const cleanEmail = email.trim();
    if (!cleanEmail) {
      setErrorMsg('Enter your email above first, then click Forgot password.');
      return;
    }
    if (!auth) {
      setErrorMsg('Authentication service is not available.');
      return;
    }

    try {
      await sendPasswordResetEmail(auth, cleanEmail);
      setSuccessMsg(`Password reset instructions were sent to ${cleanEmail}.`);
      setErrorMsg(null);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Could not send password reset email.');
    }
  };

  return (
    <div className="min-h-screen w-full bg-[#F8FAFC] flex flex-col justify-center items-center px-4 py-12 select-none">
      <div className="flex items-center justify-center gap-3 mb-8">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 via-blue-500 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-blue-500/20">
          <Zap className="w-5 h-5 fill-white stroke-[2.2]" />
        </div>
        <span className="text-2xl font-bold text-slate-900 tracking-tight">autoreply.io</span>
      </div>

      <div className="w-full max-w-[440px] bg-white rounded-3xl shadow-xl shadow-slate-200/60 border border-slate-200/90 p-8 sm:p-10">
        <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-xl mb-6">
          <button
            type="button"
            onClick={() => switchMode('signin')}
            className={`py-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              authMode === 'signin' ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => switchMode('signup')}
            className={`py-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              authMode === 'signup' ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            Create account
          </button>
        </div>

        <h1 className="text-2xl font-bold text-slate-900 text-center tracking-tight">
          {authMode === 'signup' ? 'Create your account' : 'Welcome back'}
        </h1>
        <p className="text-xs text-slate-500 text-center mt-2 mb-6 leading-relaxed">
          {authMode === 'signup'
            ? 'Create your account with email and password'
            : 'Sign in with your email and password'}
        </p>

        {errorMsg && (
          <div className="mb-5 p-3.5 rounded-2xl bg-rose-50 border border-rose-200/80 text-rose-700 text-xs font-medium flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
            <span className="leading-snug">{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div className="mb-5 p-3 rounded-2xl bg-emerald-50 border border-emerald-200/80 text-emerald-700 text-xs font-medium flex items-start gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <span className="leading-snug">{successMsg}</span>
          </div>
        )}

        <button
          type="button"
          onClick={handleGoogleSignIn}
          disabled={isLoading}
          className="w-full mb-5 py-3 px-4 bg-white hover:bg-slate-50 text-slate-800 font-bold text-sm rounded-xl border border-slate-300 transition-all shadow-sm flex items-center justify-center gap-3 cursor-pointer disabled:opacity-60"
        >
          <span className="w-5 h-5 rounded-full bg-white border border-slate-200 flex items-center justify-center text-[11px] font-black text-blue-600">
            G
          </span>
          <span>Continue with Google</span>
        </button>

        <div className="flex items-center gap-3 mb-5">
          <div className="h-px flex-1 bg-slate-200" />
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">or</span>
          <div className="h-px flex-1 bg-slate-200" />
        </div>

        <form onSubmit={handleEmailPasswordSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-800 mb-1.5">Email</label>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@company.com"
              className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition-all font-medium"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-bold text-slate-800">Password</label>
              {authMode === 'signin' && (
                <button
                  type="button"
                  onClick={handleForgotPassword}
                  className="text-xs font-semibold text-blue-600 hover:text-blue-700 hover:underline cursor-pointer"
                >
                  Forgot password?
                </button>
              )}
            </div>
            <div className="relative flex items-center">
              <input
                type={showPassword ? 'text' : 'password'}
                required
                minLength={6}
                autoComplete={authMode === 'signup' ? 'new-password' : 'current-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-3.5 py-2.5 pr-10 bg-white border border-slate-300 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition-all font-medium"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 p-1 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                title={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {authMode === 'signup' && (
            <div>
              <label className="block text-xs font-bold text-slate-800 mb-1.5">Confirm password</label>
              <input
                type="password"
                required
                minLength={6}
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition-all font-medium"
              />
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full mt-2 py-3 px-4 bg-blue-600 hover:bg-blue-700 active:scale-[0.99] text-white font-semibold text-sm rounded-xl transition-all shadow-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-white" />
                <span>{authMode === 'signup' ? 'Creating account...' : 'Signing in...'}</span>
              </>
            ) : (
              <span>{authMode === 'signup' ? 'Create account' : 'Sign in'}</span>
            )}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-slate-500 leading-relaxed">
          By continuing you agree to our{' '}
          <button
            type="button"
            onClick={() => setTermsModalType('terms')}
            className="text-blue-600 hover:underline font-medium cursor-pointer"
          >
            Terms
          </button>{' '}
          and{' '}
          <button
            type="button"
            onClick={() => setTermsModalType('privacy')}
            className="text-blue-600 hover:underline font-medium cursor-pointer"
          >
            Privacy Policy
          </button>
        </p>
      </div>

      <TermsModal
        isOpen={termsModalType !== null}
        onClose={() => setTermsModalType(null)}
        type={termsModalType || 'terms'}
      />
    </div>
  );
};
