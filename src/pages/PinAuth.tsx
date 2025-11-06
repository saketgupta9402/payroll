import { useEffect, useState, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Lock, Shield } from "lucide-react";
import { api } from "@/lib/api";

const PinAuth = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [isLoading, setIsLoading] = useState(false);
  const [pin, setPin] = useState("");
  const [checkingSession, setCheckingSession] = useState(true);
  const [isSSO, setIsSSO] = useState(false);
  const hasCheckedAuth = useRef(false); // Prevent multiple auth checks
  const isChecking = useRef(false); // Prevent concurrent checks

  useEffect(() => {
    // Prevent multiple auth checks using sessionStorage
    const checkKey = 'payroll_pinauth_checked';
    if (sessionStorage.getItem(checkKey)) {
      setCheckingSession(false);
      return;
    }

    // Prevent multiple auth checks
    if (hasCheckedAuth.current || isChecking.current) {
      return;
    }

    // Check if coming from SSO
    const sso = searchParams.get('sso');
    setIsSSO(sso === 'true');
    
    // If coming from SSO, immediately show PIN form (session cookie is set by backend)
    if (sso === 'true') {
      hasCheckedAuth.current = true;
      sessionStorage.setItem(checkKey, 'true');
      setCheckingSession(false);
      toast.info('Please enter your PIN to continue');
      return;
    }
    
    // If not from SSO, check for existing session using API
    const checkSession = async () => {
      // Prevent multiple checks
      if (hasCheckedAuth.current || isChecking.current) {
        return;
      }

      isChecking.current = true;

      // Wait a bit for cookies to be set
      setTimeout(async () => {
        if (hasCheckedAuth.current) {
          isChecking.current = false;
          return;
        }

        try {
          // Use API call to check authentication instead of reading cookies
          // Cookies are httpOnly, so we can't read them with document.cookie
          try {
            const profileRes: any = await api.me.profile();
            if (profileRes?.profile) {
              // User is authenticated, redirect to dashboard
              hasCheckedAuth.current = true;
              sessionStorage.setItem(checkKey, 'true');
              console.log('[PinAuth] User already authenticated, redirecting to dashboard');
              const fullUrl = window.location.origin + '/dashboard';
              window.location.href = fullUrl;
              return;
            }
          } catch (profileError: any) {
            // If profile fetch fails, show PIN form
            hasCheckedAuth.current = true;
            sessionStorage.setItem(checkKey, 'true');
            console.log('[PinAuth] User needs authentication, showing PIN form');
            setCheckingSession(false);
          }
        } catch (error) {
          console.error("Error checking session:", error);
          hasCheckedAuth.current = true;
          sessionStorage.setItem(checkKey, 'true');
          setCheckingSession(false);
        } finally {
          isChecking.current = false;
        }
      }, 500); // Wait 500ms for cookies to be set
    };

    checkSession();
  }, [searchParams, navigate]);

  const handleVerifyPin = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate PIN format
    if (!pin || pin.length !== 6) {
      toast.error("Please enter a 6-digit PIN");
      return;
    }
    
    // Ensure PIN is numeric
    if (!/^\d{6}$/.test(pin)) {
      toast.error("PIN must contain only numbers (0-9)");
      return;
    }
    
    setIsLoading(true);
    try {
      const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:4000";
      const response = await fetch(`${apiUrl}/sso/verify-pin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ pin })
      });
      
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.message || data.error || 'Invalid PIN');
      }
      
      const data = await response.json();
      toast.success("PIN verified successfully!");
      
      // Backend sets pin_ok cookie; get role from response or fetch profile
      // payroll_admin (CEO/HR/Admin) -> /employees
      // payroll_employee (Director/Employee/Manager) -> /employee-portal
      console.log('[PinAuth] Full response data:', data);
      
      // Try to get role from response, otherwise fetch from profile
      let payrollRole = data.payrollRole || data.role || null;
      
      if (!payrollRole) {
        // If role not in response, fetch profile to get role
        try {
          const profileRes: any = await api.me.profile();
          payrollRole = profileRes?.profile?.payroll_role || 'payroll_employee';
          console.log('[PinAuth] Fetched role from profile:', payrollRole);
        } catch (profileError) {
          console.error('[PinAuth] Failed to fetch profile:', profileError);
          // Default to employee-portal if profile fetch fails
          payrollRole = 'payroll_employee';
        }
      }
      
      // Clear sessionStorage to allow Dashboard to load
      sessionStorage.removeItem('payroll_index_redirected');
      sessionStorage.removeItem('payroll_pinauth_checked');
      
      // Redirect to Dashboard - Dashboard will show content based on role
      const redirectPath = '/dashboard';
      console.log('[PinAuth] PIN verified, role:', payrollRole, 'redirecting to:', redirectPath);
      
      // Wait a moment for cookies to be set by backend response
      // Backend sets pin_ok cookie in the response, so we need to wait for it
      console.log('[PinAuth] Waiting for cookies to be set...');
      
      // Wait longer to ensure cookies are set before redirecting
      setTimeout(() => {
        // Redirect to Dashboard - Dashboard will show content based on role
        const fullUrl = window.location.origin + redirectPath;
        console.log('[PinAuth] Redirecting to:', fullUrl);
        // Use replace to prevent back button issues
        window.location.replace(fullUrl);
      }, 1000); // Wait 1 second to ensure cookies are set
    } catch (err: any) {
      toast.error(err.message || 'Failed to verify PIN');
      setPin(""); // Clear PIN on error
    } finally {
      setIsLoading(false);
    }
  };

  if (checkingSession) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-center">
          <div className="text-lg">Checking session...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-accent/5 p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary mb-4 shadow-xl">
            <Shield className="w-8 h-8 text-primary-foreground" />
          </div>
          <h1 className="text-3xl font-bold text-foreground mb-2">PayrollPro</h1>
          <p className="text-muted-foreground">Enter your 6-digit PIN to continue</p>
        </div>

        <Card className="shadow-xl">
          <CardHeader>
            <CardTitle>{isSSO ? 'Welcome Back!' : 'PIN Verification'}</CardTitle>
            <CardDescription>
              {isSSO 
                ? 'Enter your 6-digit PIN to access your Payroll account' 
                : 'Enter your 6-digit PIN to continue'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleVerifyPin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="pin">6-Digit PIN</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="pin"
                    type="password"
                    inputMode="numeric"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    placeholder="000000"
                    value={pin}
                    onChange={(e) => {
                      const value = e.target.value.replace(/[^0-9]/g, '').slice(0, 6);
                      setPin(value);
                    }}
                    onKeyDown={(e) => {
                      // Allow only numeric keys and backspace/delete
                      if (!/[0-9]/.test(e.key) && !['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.key)) {
                        e.preventDefault();
                      }
                    }}
                    autoFocus
                    className="pl-10 text-center text-2xl tracking-widest font-mono"
                    autoComplete="off"
                    required
                  />
                </div>
                <p className="text-xs text-muted-foreground text-center">
                  Enter 6 digits (0-9)
                </p>
              </div>
              
              <Button type="submit" className="w-full" disabled={isLoading || pin.length !== 6}>
                {isLoading ? 'Verifying...' : 'Verify PIN'}
              </Button>
              
              <div className="flex flex-col gap-2 text-center text-sm">
                <Button
                  type="button"
                  variant="link"
                  className="text-xs"
                  onClick={() => navigate("/forgot-pin")}
                >
                  Forgot PIN?
                </Button>
                <p className="text-muted-foreground text-xs">
                  Access Payroll through the HR system to set up your PIN
                </p>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default PinAuth;

