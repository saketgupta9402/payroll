import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Lock, Shield } from "lucide-react";

const ResetPin = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    const tokenParam = searchParams.get('token');
    if (!tokenParam) {
      toast.error('Invalid reset link. Please request a new PIN reset.');
      navigate("/forgot-pin");
      return;
    }
    setToken(tokenParam);
  }, [searchParams, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    // Validate PINs
    if (!newPin || newPin.length !== 6) {
      toast.error('PIN must be exactly 6 digits');
      setIsLoading(false);
      return;
    }

    if (!/^\d{6}$/.test(newPin)) {
      toast.error('PIN must contain only numbers');
      setIsLoading(false);
      return;
    }

    if (newPin !== confirmPin) {
      toast.error('PINs do not match');
      setIsLoading(false);
      return;
    }

    if (!token) {
      toast.error('Invalid reset token');
      setIsLoading(false);
      return;
    }

    try {
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:4000';
      const response = await fetch(`${apiUrl}/sso/reset-pin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ token, newPin }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || data.error || 'Failed to reset PIN');
      }

      toast.success('PIN reset successfully! Please login with your new PIN.');
      
      // Redirect to login after successful reset
      setTimeout(() => {
        navigate("/pin-auth");
      }, 2000);
    } catch (error: any) {
      console.error('Error resetting PIN:', error);
      toast.error(error.message || 'Failed to reset PIN. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-accent/5 p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary mb-4">
            <Shield className="w-8 h-8 text-primary-foreground" />
          </div>
          <h1 className="text-3xl font-bold text-foreground mb-2">Reset PIN</h1>
          <p className="text-muted-foreground">Set a new 6-digit PIN</p>
        </div>

        <Card className="shadow-xl">
          <CardHeader>
            <CardTitle>Set New PIN</CardTitle>
            <CardDescription>
              Enter a new 6-digit PIN for your Payroll account
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="newPin">New PIN</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="newPin"
                    type="password"
                    inputMode="numeric"
                    maxLength={6}
                    placeholder="000000"
                    value={newPin}
                    onChange={(e) => {
                      const value = e.target.value.replace(/\D/g, '').slice(0, 6);
                      setNewPin(value);
                    }}
                    required
                    className="pl-10 text-center text-2xl tracking-widest"
                    autoComplete="off"
                    autoFocus
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPin">Confirm New PIN</Label>
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

              <Button
                type="submit"
                className="w-full"
                disabled={isLoading || newPin.length !== 6 || confirmPin.length !== 6}
              >
                {isLoading ? 'Resetting...' : 'Reset PIN'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ResetPin;


