import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Lock, Shield, ArrowLeft } from "lucide-react";

const ChangePin = () => {
  const navigate = useNavigate();
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    // Validate PINs
    if (!currentPin || currentPin.length !== 6) {
      toast.error('Current PIN must be exactly 6 digits');
      setIsLoading(false);
      return;
    }

    if (!newPin || newPin.length !== 6) {
      toast.error('New PIN must be exactly 6 digits');
      setIsLoading(false);
      return;
    }

    if (!/^\d{6}$/.test(currentPin) || !/^\d{6}$/.test(newPin)) {
      toast.error('PIN must contain only numbers');
      setIsLoading(false);
      return;
    }

    if (currentPin === newPin) {
      toast.error('New PIN must be different from current PIN');
      setIsLoading(false);
      return;
    }

    if (newPin !== confirmPin) {
      toast.error('New PINs do not match');
      setIsLoading(false);
      return;
    }

    try {
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:4000';
      const response = await fetch(`${apiUrl}/sso/change-pin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include', // Include cookies for session
        body: JSON.stringify({ currentPin, newPin }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || data.error || 'Failed to change PIN');
      }

      toast.success('PIN changed successfully!');
      
      // Redirect back to previous page or dashboard
      setTimeout(() => {
        navigate(-1); // Go back to previous page
      }, 1000);
    } catch (error: any) {
      console.error('Error changing PIN:', error);
      toast.error(error.message || 'Failed to change PIN. Please try again.');
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
          <h1 className="text-3xl font-bold text-foreground mb-2">Change PIN</h1>
          <p className="text-muted-foreground">Update your 6-digit PIN</p>
        </div>

        <Card className="shadow-xl">
          <CardHeader>
            <CardTitle>Change Your PIN</CardTitle>
            <CardDescription>
              Enter your current PIN and choose a new 6-digit PIN
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="currentPin">Current PIN</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="currentPin"
                    type="password"
                    inputMode="numeric"
                    maxLength={6}
                    placeholder="000000"
                    value={currentPin}
                    onChange={(e) => {
                      const value = e.target.value.replace(/\D/g, '').slice(0, 6);
                      setCurrentPin(value);
                    }}
                    required
                    className="pl-10 text-center text-2xl tracking-widest"
                    autoComplete="off"
                  />
                </div>
              </div>

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

              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={() => navigate(-1)}
                >
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Cancel
                </Button>
                <Button
                  type="submit"
                  className="flex-1"
                  disabled={isLoading || currentPin.length !== 6 || newPin.length !== 6 || confirmPin.length !== 6}
                >
                  {isLoading ? 'Changing...' : 'Change PIN'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ChangePin;


