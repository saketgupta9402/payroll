import { useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "@/lib/api";

/**
 * Index/Redirect Component
 * 
 * This component handles root path access and redirects users based on their authentication status:
 * - If SSO token is present: redirects to backend SSO endpoint
 * - If authenticated (session + PIN): redirects to Dashboard
 * - If not authenticated: redirects to /pin-auth
 * 
 * No landing page is shown - payroll is only accessible through HR system.
 */
const Index = () => {
  const [searchParams] = useSearchParams();
  const hasRedirected = useRef(false); // Prevent multiple redirects
  const isChecking = useRef(false); // Prevent concurrent checks

  useEffect(() => {
    // Prevent multiple redirects using sessionStorage
    const redirectKey = 'payroll_index_redirected';
    if (sessionStorage.getItem(redirectKey)) {
      return;
    }

    // Prevent multiple redirects
    if (hasRedirected.current || isChecking.current) {
      return;
    }

    // Check for SSO token in URL
    const token = searchParams.get('token');
    if (token) {
      hasRedirected.current = true;
      sessionStorage.setItem(redirectKey, 'true');
      // Redirect to backend SSO endpoint - backend will handle SSO, set cookies, and redirect to /pin-auth or /setup-pin
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:4000';
      window.location.href = `${apiUrl}/sso?token=${encodeURIComponent(token)}`;
      return;
    }
    
    // Use API call to check authentication instead of reading cookies
    // Cookies are httpOnly, so we can't read them with document.cookie
    const checkAuth = async () => {
      // Prevent multiple calls
      if (hasRedirected.current || isChecking.current) {
        return;
      }

      isChecking.current = true;

      try {
        // Try to fetch profile - if this succeeds, user is authenticated
        const profileRes: any = await api.me.profile();
        if (profileRes?.profile) {
          // User is authenticated, redirect to dashboard
          hasRedirected.current = true;
          sessionStorage.setItem(redirectKey, 'true');
          console.log('[Index] User authenticated, redirecting to dashboard');
          const fullUrl = window.location.origin + '/dashboard';
          window.location.href = fullUrl;
        } else {
          // No profile, redirect to pin-auth
          hasRedirected.current = true;
          sessionStorage.setItem(redirectKey, 'true');
          console.log('[Index] No profile found, redirecting to pin-auth');
          window.location.href = window.location.origin + '/pin-auth';
        }
      } catch (error: any) {
        // If API call fails, check if it's an auth error
        if (hasRedirected.current) {
          isChecking.current = false;
          return;
        }
        
        console.log('[Index] Profile fetch failed:', error.message);
        hasRedirected.current = true;
        sessionStorage.setItem(redirectKey, 'true');
        
        // Redirect to pin-auth for any error (user needs to authenticate)
        console.log('[Index] Redirecting to pin-auth');
        window.location.href = window.location.origin + '/pin-auth';
      } finally {
        isChecking.current = false;
      }
    };
    
    // Small delay before checking auth
    const timeoutId = setTimeout(() => {
      checkAuth();
    }, 100);
    
    return () => {
      clearTimeout(timeoutId);
      // Clear sessionStorage on unmount if redirect didn't happen
      if (!hasRedirected.current) {
        sessionStorage.removeItem(redirectKey);
      }
    };
  }, [searchParams]);

  // Show loading state while redirecting
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
        <p className="text-muted-foreground">Redirecting...</p>
      </div>
    </div>
  );
};

export default Index;
