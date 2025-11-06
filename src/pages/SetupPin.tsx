import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Lock, Shield } from "lucide-react";
import { api } from "@/lib/api";

const SetupPin = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSSO, setIsSSO] = useState(false);

  useEffect(() => {
    // Check if coming from SSO
    const sso = searchParams.get('sso');
    const welcome = searchParams.get('welcome');
    setIsSSO(sso === 'true');
    
    // Show welcome message if coming from SSO
    if (sso === 'true' && welcome === 'true') {
      toast.info('Welcome! Please set up your 6-digit PIN to secure your Payroll account.');
    } else if (sso === 'true') {
      toast.info('Please set up your 6-digit PIN to continue.');
    }
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    // Validate PIN
    if (!pin || pin.length !== 6) {
      toast.error('PIN must be exactly 6 digits');
      setIsLoading(false);
      return;
    }

    if (!/^\d{6}$/.test(pin)) {
      toast.error('PIN must contain only numbers');
      setIsLoading(false);
      return;
    }

    if (pin !== confirmPin) {
      toast.error('PINs do not match');
      setIsLoading(false);
      return;
    }

    try {
      // Call API to set PIN
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:4000';
      const response = await fetch(`${apiUrl}/sso/setup-pin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include', // Include cookies for session
        body: JSON.stringify({ pin }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || data.error || 'Failed to set PIN');
      }

      toast.success('PIN set successfully!');
      
      // Redirect to Dashboard - Dashboard will show content based on role
      console.log('[SetupPin] Full response data:', data);
      const payrollRole = data.payrollRole || data.role || 'payroll_employee';
      console.log('[SetupPin] Extracted role:', payrollRole);
      
      const redirectPath = '/dashboard';
      console.log('[SetupPin] PIN set, role:', payrollRole, 'redirecting to:', redirectPath);
      
      // Wait a moment for cookies to be set, then redirect
      // Use window.location.href for immediate, reliable redirect with full URL
      setTimeout(() => {
        const fullUrl = window.location.origin + redirectPath;
        console.log('[SetupPin] Full redirect URL:', fullUrl);
        window.location.href = fullUrl;
      }, 500); // Small delay to ensure cookies are set
    } catch (error: any) {
      console.error('Error setting PIN:', error);
      toast.error(error.message || 'Failed to set PIN. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-accent/5 p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary mb-4">
            <Shield className="w-8 h-8 text-primary-foreground" />
          </div>
          <h1 className="text-3xl font-bold text-foreground mb-2">Setup PIN</h1>
          <p className="text-muted-foreground">
            {isSSO 
              ? 'Set up a 6-digit PIN to secure your Payroll account' 
              : 'Create a 6-digit PIN for your Payroll account'}
          </p>
        </div>

        <Card className="shadow-xl">
          <CardHeader>
            <CardTitle>Create Your PIN</CardTitle>
            <CardDescription>
              Enter a 6-digit PIN that you'll remember. This PIN will be used to access your Payroll account.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="pin">6-Digit PIN</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="pin"
                    type="password"
                    inputMode="numeric"
                    maxLength={6}
                    placeholder="000000"
                    value={pin}
                    onChange={(e) => {
                      const value = e.target.value.replace(/\D/g, '').slice(0, 6);
                      setPin(value);
                    }}
                    required
                    className="pl-10 text-center text-2xl tracking-widest"
                    autoComplete="off"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Enter 6 digits (0-9)
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPin">Confirm PIN</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="confirmPin"
                    type="password"
                    inputMode="numeric"
                    maxLength={6}
                    placeholder="000000"
                    value={confirmPin}
                    onChange={(e) => {
                      const value = e.target.value.replace(/\D/g, '').slice(0, 6);
                      setConfirmPin(value);
                    }}
                    required
                    className="pl-10 text-center text-2xl tracking-widest"
                    autoComplete="off"
                  />
                </div>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-md p-3 text-sm text-blue-800">
                <p className="font-semibold mb-1">Security Tips:</p>
                <ul className="list-disc list-inside space-y-1 text-xs">
                  <li>Don't use obvious sequences (123456, 000000)</li>
                  <li>Don't share your PIN with anyone</li>
                  <li>Keep your PIN confidential</li>
                </ul>
              </div>

              <Button type="submit" className="w-full" disabled={isLoading || pin.length !== 6 || confirmPin.length !== 6}>
                {isLoading ? 'Setting up PIN...' : 'Set PIN'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default SetupPin;

