import React, { useState } from 'react';
import '../signin.css';
import { useSignIn, useSignUp, AuthenticateWithRedirectCallback } from '@clerk/clerk-react';

interface CustomSignInProps {
  onBypass?: () => void;
}

export default function CustomSignIn({ onBypass }: CustomSignInProps) {
  const [loginRole, setLoginRole] = useState<'rider' | 'driver'>(() => {
    const saved = localStorage.getItem('pending_role');
    return (saved === 'rider' || saved === 'driver') ? saved : 'rider';
  });

  const setRole = (role: 'rider' | 'driver') => {
    localStorage.setItem('pending_role', role);
    localStorage.setItem('user_role', role);
    setLoginRole(role);
  };

  const [isSignUp, setIsSignUp] = useState(false);
  const [signUpStep, setSignUpStep] = useState<'form' | 'verification'>('form');
  const [verificationCode, setVerificationCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Connect with Clerk Headless for actual functionality
  const { signIn, setActive: setSignInActive, isLoaded: isSignInLoaded } = useSignIn();
  const { signUp, setActive: setSignUpActive, isLoaded: isSignUpLoaded } = useSignUp();

  const handleSignInSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isSignInLoaded) return;
    setLoading(true);
    setErrorMsg('');
    
    // Save role FIRST before any async Clerk call
    localStorage.setItem("user_role", loginRole);
    
    try {
      const result = await signIn.create({
        identifier: email,
        password,
      });

      if (result.status === 'complete') {
        await setSignInActive({ session: result.createdSessionId });
      } else {
        console.log('Result status:', result.status, result);
        setErrorMsg(`More steps required: ${result.status}. Please check console.`);
      }
    } catch (err: any) {
      localStorage.removeItem("user_role"); // remove if login failed
      console.error('Error signing in', err);
      if (err.errors && err.errors.length > 0) {
        setErrorMsg(err.errors[0].message);
      } else {
        setErrorMsg('Failed to sign in. Check your credentials.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSignUpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isSignUpLoaded) return;
    setLoading(true);
    setErrorMsg('');
    
    // Save role FIRST before any async Clerk call
    localStorage.setItem("user_role", loginRole);
    
    try {
      let result = await signUp.create({
        emailAddress: email,
        password,
      });

      // Self-heal any missing required profile fields before proceeding to verification
      if (result.status === 'missing_requirements' && result.missingFields && result.missingFields.length > 0) {
        const updateParams: any = {};
        if (result.missingFields.includes('first_name')) {
          updateParams.firstName = 'Rider';
        }
        if (result.missingFields.includes('last_name')) {
          updateParams.lastName = 'User';
        }
        if (result.missingFields.includes('username')) {
          updateParams.username = `rider_${Math.random().toString(36).substring(2, 8)}`;
        }
        if (result.missingFields.includes('phone_number')) {
          updateParams.phoneNumber = '+11234567890';
        }
        if (Object.keys(updateParams).length > 0) {
          result = await signUp.update(updateParams);
        }
      }

      if (result.status === 'complete') {
        await setSignUpActive({ session: result.createdSessionId });
      } else if (result.status === 'missing_requirements') {
        // Prepare/send verification email code
        await signUp.prepareEmailAddressVerification({ strategy: 'email_code' });
        setSignUpStep('verification');
      } else {
        setErrorMsg(`Sign up status: ${result.status}`);
      }
    } catch (err: any) {
      localStorage.removeItem("user_role"); // remove if login failed
      console.error('Error signing up', err);
      if (err.errors && err.errors.length > 0) {
        setErrorMsg(err.errors[0].message);
      } else {
        setErrorMsg('Failed to sign up. Passwords should be 8+ characters.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleVerificationSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isSignUpLoaded) return;
    setLoading(true);
    setErrorMsg('');
    
    // Save role FIRST before any async Clerk call
    localStorage.setItem("user_role", loginRole);
    
    try {
      let result = await signUp.attemptEmailAddressVerification({
        code: verificationCode.trim(),
      });

      // Self-heal any missing required profile fields after verification completes
      if (result.status === 'missing_requirements' && result.missingFields && result.missingFields.length > 0) {
        const updateParams: any = {};
        if (result.missingFields.includes('first_name')) {
          updateParams.firstName = 'Rider';
        }
        if (result.missingFields.includes('last_name')) {
          updateParams.lastName = 'User';
        }
        if (result.missingFields.includes('username')) {
          updateParams.username = `rider_${Math.random().toString(36).substring(2, 8)}`;
        }
        if (result.missingFields.includes('phone_number')) {
          updateParams.phoneNumber = '+11234567890';
        }
        if (Object.keys(updateParams).length > 0) {
          result = await signUp.update(updateParams);
        }
      }

      if (result.status === 'complete') {
        await setSignUpActive({ session: result.createdSessionId });
      } else {
        setErrorMsg(`Verification code accepted, but registration status is still: ${result.status}. Missing required fields: ${result.missingFields?.join(', ')}. Try using "Access Instantly with Demo Mode" to bypass Clerk setup.`);
      }
    } catch (err: any) {
      localStorage.removeItem("user_role"); // remove if login failed
      console.error('Error verifying email', err);
      if (err.errors && err.errors.length > 0) {
        setErrorMsg(err.errors[0].message);
      } else {
        setErrorMsg('Invalid verification code. Please check your email and retry.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleOauth = async (provider: 'oauth_google' | 'oauth_apple' | 'oauth_facebook' | 'oauth_linkedin_oidc') => {
    if (!isSignInLoaded) return;

    // In AI Studio preview (iframe), Google/Clerk OAuth blocks rendering via X-Frame-Options
    if (window !== window.top) {
      setErrorMsg('OAuth redirects are blocked in the preview window. Please open the app in a new tab (click the ↗️ icon) to use Google/Apple sign in.');
      return;
    }

    try {
      await signIn.authenticateWithRedirect({
        strategy: provider,
        redirectUrl: window.location.href,
        redirectUrlComplete: window.location.href,
      });
    } catch (err) {
      console.error(err);
      setErrorMsg('OAuth initialization failed.');
    }
  };

  const isAdmin = false;
  const isLoaded = isSignInLoaded && isSignUpLoaded;

  const isClerkCallback = window.location.search.includes('__clerk') || window.location.hash.includes('__clerk');

  return (
    <div className="signin-shell">
      {isClerkCallback && <AuthenticateWithRedirectCallback />}
      {/* LEFT: Branding panel */}
      <div className="signin-left">
        <div className="signin-map-bg"></div>
        <div className="signin-car-dot"></div>
        <div className="signin-route-anim">
          <svg viewBox="0 0 260 180">
            <path className="signin-route-path" d="M 0 140 Q 80 100 140 60 Q 200 20 260 0" />
          </svg>
        </div>

        <div className="signin-logo">RideX</div>

        <div className="signin-left-copy">
          <h1>Move the<br /><em>world</em><br />forward.</h1>
          <p>Join millions of riders and drivers on the platform that's redefining urban mobility.</p>
        </div>

        <div className="signin-stat-row">
          <div className="signin-stat">
            <span className="signin-stat-num">137M+</span>
            <span className="signin-stat-label">Monthly Users</span>
          </div>
          <div className="signin-stat">
            <span className="signin-stat-num">72</span>
            <span className="signin-stat-label">Countries</span>
          </div>
          <div className="signin-stat">
            <span className="signin-stat-num">9.4B</span>
            <span className="signin-stat-label">Trips Completed</span>
          </div>
        </div>
      </div>

      {/* RIGHT: Auth panel */}
      <div className="signin-right">
        {/* Role selector */}
        <div className="flex gap-2 mb-6">
          <button
            type="button"
            onClick={() => setRole("rider")}
            className={`flex-1 py-2.5 rounded-xl font-black text-sm transition-all ${
              loginRole === "rider"
                ? "bg-black text-white"
                : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200"
            }`}
          >
            🧍 I'm a Rider
          </button>
          <button
            type="button"
            onClick={() => setRole("driver")}
            className={`flex-1 py-2.5 rounded-xl font-black text-sm transition-all ${
              loginRole === "driver"
                ? "bg-emerald-600 text-white"
                : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200"
            }`}
          >
            🚗 I'm a Driver
          </button>
        </div>

        {/* Admin badge */}
        {isAdmin && (
          <div className="signin-admin-badge">
            <span className="signin-admin-dot"></span>
            Secure Admin Portal — Enhanced verification required
          </div>
        )}

        {/* Header */}
        <div className="signin-form-header">
          <h2>{isAdmin ? 'Admin Security' : (isSignUp ? (signUpStep === 'verification' ? 'Verify your Email' : 'Create Account') : 'Welcome Back')}</h2>
          <p>{isAdmin ? 'Enter your credentials & 2FA token' : (isSignUp ? (signUpStep === 'verification' ? 'Enter the code sent to your email' : 'Get started with a free RideX account') : 'Sign in to your RideX account')}</p>
        </div>

        {/* Form */}
        <form
          className="signin-clerk-form"
          onSubmit={isSignUp ? (signUpStep === 'verification' ? handleVerificationSubmit : handleSignUpSubmit) : handleSignInSubmit}
        >

          {/* Social logins */}
          {!isAdmin && signUpStep !== 'verification' && (
            <>
              <div className="signin-social-row">
                <button type="button" className="signin-social-btn" onClick={() => handleOauth('oauth_google')}>
                  <svg className="signin-social-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                  </svg>
                  Google
                </button>
                <button type="button" className="signin-social-btn" onClick={() => handleOauth('oauth_apple')}>
                  <svg className="signin-social-icon" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.7 9.05 7.41c1.32.07 2.22.79 2.98.84.92-.17 1.81-.9 3.06-.9 1.7 0 2.95.72 3.72 1.85-3.34 2.04-2.72 6.49.53 7.7-.44 1.15-.87 2.29-2.29 3.38zM13 3.5c.18 1.8-1.6 3.36-3.27 3.21-.23-1.78 1.6-3.3 3.27-3.21z" />
                  </svg>
                  Apple
                </button>
              </div>

              <div className="signin-divider">or</div>
            </>
          )}

          {signUpStep === 'verification' ? (
            <div className="signin-field">
              <label htmlFor="verificationCode">Verification Code</label>
              <input
                type="text"
                id="verificationCode"
                placeholder="6-digit OTP code"
                required
                value={verificationCode}
                onChange={(e) => setVerificationCode(e.target.value)}
              />
            </div>
          ) : (
            <>
              <div className="signin-field">
                <label htmlFor="email">Email address</label>
                <input
                  type="email"
                  id="email"
                  placeholder="name@example.com"
                  autoComplete="email"
                  required
                  className={isAdmin ? "admin-focus" : ""}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>

              <div className="signin-field">
                <label htmlFor="password">Password</label>
                <input
                  type="password"
                  id="password"
                  placeholder="••••••••••"
                  autoComplete="current-password"
                  required
                  className={isAdmin ? "admin-focus" : ""}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </>
          )}

          {/* 2FA (admin only) */}
          {isAdmin && (
            <div className="signin-twofa-row">
              <div className="signin-field">
                <label htmlFor="twofa">Authenticator Code</label>
                <input
                  type="text"
                  id="twofa"
                  placeholder="6-digit code"
                  maxLength={6}
                  autoComplete="one-time-code"
                  required
                  className="admin-focus"
                />
              </div>
            </div>
          )}

          {errorMsg && (
            <div className="text-red-500 text-xs mt-1 bg-red-50 p-2 rounded-md border border-red-100">
              {errorMsg}
            </div>
          )}

          {!isSignUp && <a href="#" className="signin-forgot">Forgot password?</a>}

          <button
            type="submit"
            className={`signin-submit-btn ${isAdmin ? 'admin' : ''} ${loading ? 'loading' : ''}`}
          >
            <span className="signin-btn-text">
              {isAdmin ? 'Verify & Access' : (isSignUp ? (signUpStep === 'verification' ? 'Verify Code' : 'Sign Up') : 'Continue')}
            </span>
            <div className="signin-spinner"></div>
          </button>

          {!isAdmin && (
            <p className="signin-sign-up">
              {isSignUp ? (
                <>
                  Already have an account?{' '}
                  <a
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      setIsSignUp(false);
                      setSignUpStep('form');
                      setErrorMsg('');
                    }}
                  >
                    Sign in
                  </a>
                </>
              ) : (
                <>
                  Don't have an account?{' '}
                  <a
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      setIsSignUp(true);
                      setErrorMsg('');
                    }}
                  >
                    Sign up
                  </a>
                </>
              )}
            </p>
          )}

          {/* Simulated Bypass Button */}
          <div className="flex flex-col gap-2 mt-4 pt-4 border-t border-zinc-200 dark:border-zinc-800 text-left">
            <button
              type="button"
              onClick={() => {
                localStorage.setItem("user_role", loginRole);
                if (onBypass) {
                  onBypass();
                } else {
                  sessionStorage.setItem("demo_bypass", "true");
                  window.location.reload();
                }
              }}
              className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-sm font-extrabold text-zinc-950 bg-amber-400 hover:bg-amber-300 active:bg-amber-500 hover:scale-[1.01] active:scale-[0.99] transition-all shadow-md border border-amber-500/20"
            >
              <svg className="w-4 h-4 text-zinc-950 animate-bounce" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              Access Instantly with Demo Mode
            </button>
            <p className="text-[10px] font-semibold text-zinc-400 text-center leading-normal">
              Bypass Clerk auth & CAPTCHA. Access the live simulation instantly.
            </p>
          </div>
        </form>

        {/* Clerk branding */}
        <div className="signin-clerk-brand">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M10.556 3.444L9.333 4.667C8.778 4.111 8.0 3.778 7.0 3.778c-1.867 0-3.222 1.466-3.222 3.222S5.133 10.222 7.0 10.222c1.0 0 1.778-.333 2.333-.889l1.223 1.223C9.556 11.556 8.356 12.222 7.0 12.222 4.0 12.222 1.778 10.0 1.778 7.0S4.0 1.778 7.0 1.778c1.356 0 2.556.666 3.556 1.666z" fill="currentColor" />
          </svg>
          Secured by Clerk
        </div>

      </div>
    </div>
  );
}
