import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Mail, Shield, ArrowLeft } from "lucide-react";

const ForgotPin = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [resetLink, setResetLink] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    if (!email || !email.includes('@')) {
      toast.error('Please enter a valid email address');
      setIsLoading(false);
      return;
    }

    try {
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:4000';
      const response = await fetch(`${apiUrl}/sso/forgot-pin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || data.error || 'Failed to process request');
      }

      setEmailSent(true);
      if (data.resetLink) {
        setResetLink(data.resetLink);
      }
      toast.success(data.message || 'If an account exists with this email, you will receive instructions to reset your PIN');
    } catch (error: any) {
      console.error('Error requesting PIN reset:', error);
      toast.error(error.message || 'Failed to process request. Please try again.');
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
          <h1 className="text-3xl font-bold text-foreground mb-2">Forgot PIN</h1>
          <p className="text-muted-foreground">Reset your 6-digit PIN</p>
        </div>

        <Card className="shadow-xl">
          <CardHeader>
            <CardTitle>Reset Your PIN</CardTitle>
            <CardDescription>
              {emailSent 
                ? 'Check your email for instructions to reset your PIN'
                : 'Enter your email address to receive instructions to reset your PIN'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {emailSent ? (
              <div className="space-y-4">
                <div className="bg-green-50 border border-green-200 rounded-md p-4 text-sm text-green-800">
                  <p className="font-semibold mb-2">Email sent!</p>
                  <p>If an account exists with this email, you will receive instructions to reset your PIN.</p>
                  {resetLink && (
                    <div className="mt-3 p-2 bg-green-100 rounded">
                      <p className="text-xs font-mono break-all">{resetLink}</p>
                      <p className="text-xs mt-1">(Development only - click to reset)</p>
                    </div>
                  )}
                </div>
                {resetLink && (
                  <Button
                    className="w-full"
                    onClick={() => window.location.href = resetLink}
                  >
                    Open Reset Link
                  </Button>
                )}
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    setEmailSent(false);
                    setEmail("");
                    setResetLink(null);
                  }}
                >
                  Request Another Reset
                </Button>
                <Button
                  variant="ghost"
                  className="w-full"
                  onClick={() => navigate("/pin-auth")}
                >
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back to Login
                </Button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email Address</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="email"
                      type="email"
                      placeholder="you@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      className="pl-10"
                      autoComplete="email"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Enter the email address associated with your Payroll account
                  </p>
                </div>

                <Button
                  type="submit"
                  className="w-full"
                  disabled={isLoading || !email}
                >
                  {isLoading ? 'Sending...' : 'Send Reset Instructions'}
                </Button>

                <Button
                  type="button"
                  variant="ghost"
                  className="w-full"
                  onClick={() => navigate("/pin-auth")}
                >
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back to Login
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ForgotPin;


