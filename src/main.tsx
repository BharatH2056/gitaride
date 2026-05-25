import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { Toaster } from 'sonner';
import { ClerkProvider } from '@clerk/clerk-react';

const PUBLISHABLE_KEY = (import.meta as any).env.VITE_CLERK_PUBLISHABLE_KEY || "pk_test_cG9ldGljLWVsZXBoYW50LTIxLmNsZXJrLmFjY291bnRzLmRldiQ";

if (!PUBLISHABLE_KEY) {
  throw new Error("Missing Publishable Key")
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ClerkProvider 
      publishableKey={PUBLISHABLE_KEY} 
      signInUrl="/" 
      signUpUrl="/"
      afterSignOutUrl="/"
      signInFallbackRedirectUrl="/"
      signUpFallbackRedirectUrl="/"
    >
      <App />
      <Toaster position="top-center" richColors />
    </ClerkProvider>
  </StrictMode>,
);
