import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Save, Loader2 } from "lucide-react";
// Fix: Use relative path for the API client
import { api } from "../lib/api";
import { toast } from "sonner";

// Define the shape of the settings
type PayrollSettingsData = {
  pf_rate: string;
  esi_rate: string;
  pt_rate: string;
  tds_threshold: string;
  hra_percentage: string;
  special_allowance_percentage: string;
  basic_salary_percentage: string;
};

const PayrollSettings = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(true);
  const [settings, setSettings] = useState<PayrollSettingsData>({
    pf_rate: "12.00",
    esi_rate: "3.25",
    pt_rate: "200.00",
    tds_threshold: "250000.00",
    hra_percentage: "40.00",
    special_allowance_percentage: "30.00",
    basic_salary_percentage: "40.00"
  });

  // Helper function to format numbers from the DB
  const formatForInput = (data: any) => {
    const formatted: any = {};
    for (const key in settings) {
      const dataKey = key as keyof PayrollSettingsData;
      formatted[key] = data[dataKey] ? Number(data[dataKey]).toFixed(2) : settings[dataKey];
    }
    return formatted as PayrollSettingsData;
  };


  useEffect(() => {
    const fetchData = async () => {
      try {
        // Check for session and PIN cookies (cookie-based auth)
        const cookies = document.cookie || "";
        const hasSession = /(?:^|; )session=/.test(cookies);
        const hasPinOk = /(?:^|; )pin_ok=/.test(cookies);
        
        if (!hasSession || !hasPinOk) {
          navigate("/pin-auth");
          return;
        }

        // Fetch existing settings
        const { settings: fetchedSettings } = await api.payrollSettings.get();
        if (fetchedSettings) {
          setSettings(formatForInput(fetchedSettings));
        } else {
          // No settings found, use defaults
          toast.info("No existing settings found. Using defaults.");
        }
      } catch (error: any) {
        console.error("Error fetching settings:", error);
        // No settings found, use defaults - this is not an error
        if (!error.message.includes("404")) {
          toast.error("Failed to load settings");
        }
      } finally {
        setIsFetching(false);
      }
    };

    fetchData();
  }, [navigate]);

  const handleSave = async () => {
    // Validate percentage sum before submitting
    const total = (parseFloat(settings.basic_salary_percentage || '0') + 
                   parseFloat(settings.hra_percentage || '0') + 
                   parseFloat(settings.special_allowance_percentage || '0'));
    
    if (Math.abs(total - 100) > 0.01) {
      toast.error(`Salary component percentages must sum to 100%. Current sum: ${total.toFixed(2)}%`);
      return;
    }

    setLoading(true);
    try {
      // Convert string values back to numbers for the DB
      const payload: any = {};
      for (const key in settings) {
        payload[key] = parseFloat(settings[key as keyof PayrollSettingsData]);
      }
      
      await api.payrollSettings.save(payload);
      toast.success("Payroll settings saved successfully!");
      navigate("/payroll");
    } catch (error: any) {
      toast.error(error.message || "Failed to save settings");
    } finally {
      setLoading(false);
    }
  };

  const handleSettingChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { id, value } = e.target;
    setSettings(prev => ({ ...prev, [id]: value }));
  };

  if (isFetching) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-accent/5">
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4">
          <Button variant="ghost" onClick={() => navigate("/payroll")} className="mb-2">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Payroll
          </Button>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-foreground">Payroll Configuration</h1>
              <p className="text-muted-foreground">Configure payroll rules and statutory compliance</p>
            </div>
            <Button onClick={handleSave} disabled={loading}>
              {loading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              Save Settings
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="grid gap-6 md:grid-cols-2">
          {/* Statutory Deductions */}
          <Card className="shadow-md">
            <CardHeader>
              <CardTitle>Statutory Deductions</CardTitle>
              <CardDescription>Configure PF, ESI, PT, and TDS rates</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="pf_rate">PF Rate (%)</Label>
                <Input
                  id="pf_rate"
                  type="number"
                  step="0.01"
                  value={settings.pf_rate}
                  onChange={handleSettingChange}
                />
                <p className="text-xs text-muted-foreground">Standard PF rate is 12%</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="esi_rate">ESI Rate (%)</Label>
                <Input
                  id="esi_rate"
                  type="number"
                  step="0.01"
                  value={settings.esi_rate}
                  onChange={handleSettingChange}
                />
                <p className="text-xs text-muted-foreground">Standard ESI rate is 3.25%</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="pt_rate">Professional Tax (₹)</Label>
                <Input
                  id="pt_rate"
                  type="number"
                  step="0.01"
                  value={settings.pt_rate}
                  onChange={handleSettingChange}
                />
                <p className="text-xs text-muted-foreground">Varies by state (e.g., ₹200.00/month in Karnataka)</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="tds_threshold">TDS Threshold (₹)</Label>
                <Input
                  id="tds_threshold"
                  type="number"
                  step="0.01"
                  value={settings.tds_threshold}
                  onChange={handleSettingChange}
                />
                <p className="text-xs text-muted-foreground">Annual income threshold for TDS applicability</p>
              </div>
            </CardContent>
          </Card>

          {/* Salary Structure Defaults */}
          <Card className="shadow-md">
            <CardHeader>
              <CardTitle>Salary Structure Defaults</CardTitle>
              <CardDescription>Default percentages for salary components</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="basic_salary_percentage">Basic Salary (%)</Label>
                <Input
                  id="basic_salary_percentage"
                  type="number"
                  step="0.01"
                  value={settings.basic_salary_percentage}
                  onChange={handleSettingChange}
                />
                <p className="text-xs text-muted-foreground">Percentage of CTC for basic salary</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="hra_percentage">HRA (%)</Label>
                <Input
                  id="hra_percentage"
                  type="number"
                  step="0.01"
                  value={settings.hra_percentage}
                  onChange={handleSettingChange}
                />
                <p className="text-xs text-muted-foreground">Percentage of CTC for House Rent Allowance</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="special_allowance_percentage">Special Allowance (%)</Label>
                <Input
                  id="special_allowance_percentage"
                  type="number"
                  step="0.01"
                  value={settings.special_allowance_percentage}
                  onChange={handleSettingChange}
                />
                <p className="text-xs text-muted-foreground">Percentage of CTC for special allowance</p>
              </div>

              <div className="p-4 bg-muted/50 rounded-lg">
                <p className="text-sm font-medium mb-2">Quick Calculation Example:</p>
                <p className="text-xs text-muted-foreground">
                  For CTC of ₹5,00,000:
                  <br />• Basic: ₹{(500000 * parseFloat(settings.basic_salary_percentage || '0') / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                  <br />• HRA: ₹{(500000 * parseFloat(settings.hra_percentage || '0') / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                  <br />• Special: ₹{(500000 * parseFloat(settings.special_allowance_percentage || '0') / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                </p>
                {(() => {
                  const total = (parseFloat(settings.basic_salary_percentage || '0') + 
                                parseFloat(settings.hra_percentage || '0') + 
                                parseFloat(settings.special_allowance_percentage || '0'));
                  const isInvalid = Math.abs(total - 100) > 0.01;
                  return (
                    <div className={`mt-3 p-2 rounded text-xs ${isInvalid ? 'bg-destructive/10 text-destructive border border-destructive/20' : 'bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800'}`}>
                      <p className="font-medium">Total: {total.toFixed(2)}%</p>
                      {isInvalid && (
                        <p className="mt-1">⚠️ Salary components must sum to exactly 100%</p>
                      )}
                      {!isInvalid && (
                        <p className="mt-1">✓ All components sum to 100%</p>
                      )}
                    </div>
                  );
                })()}
              </div>
            </CardContent>
          </Card>

          {/* Compliance Information */}
          <Card className="shadow-md md:col-span-2">
            <CardHeader>
              <CardTitle>Compliance Information</CardTitle>
              <CardDescription>Important guidelines for payroll compliance</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-3 md:grid-cols-2">
                <div className="p-4 bg-blue-50 dark:bg-blue-950 rounded-lg border border-blue-200 dark:border-blue-800">
                  <h4 className="font-semibold text-sm mb-2">PF Compliance</h4>
                  <ul className="text-xs space-y-1 text-muted-foreground">
                    <li>• Applicable for employees earning up to ₹15,000/month basic</li>
                    <li>• Employee contribution: 12% of basic</li>
                    <li>• Employer contribution: 12% of basic (3.67% to EPF, 8.33% to EPS)</li>
                    <li>• Due date: 15th of every month</li>
                  </ul>
                </div>

                <div className="p-4 bg-green-50 dark:bg-green-950 rounded-lg border border-green-200 dark:border-green-800">
                  <h4 className="font-semibold text-sm mb-2">ESI Compliance</h4>
                  <ul className="text-xs space-y-1 text-muted-foreground">
                    <li>• Applicable for employees earning up to ₹21,000/month</li>
                    <li>• Employee contribution: 0.75% of gross</li>
                    <li>• Employer contribution: 3.25% of gross</li>
                    <li>• Due date: 15th of every month</li>
                  </ul>
                </div>

                <div className="p-4 bg-purple-50 dark:bg-purple-950 rounded-lg border border-purple-200 dark:border-purple-800">
                  <h4 className="font-semibold text-sm mb-2">TDS Compliance</h4>
                  <ul className="text-xs space-y-1 text-muted-foreground">
                    <li>• Deduct TDS based on employee's tax slab</li>
                    <li>• Consider employee declarations and investments</li>
                    <li>• Issue Form 16 by June 15th every year</li>
                    <li>• Due date: 7th of every month</li>
                  </ul>
                </div>

                <div className="p-4 bg-orange-50 dark:bg-orange-950 rounded-lg border border-orange-200 dark:border-orange-800">
                  <h4 className="font-semibold text-sm mb-2">Professional Tax</h4>
                  <ul className="text-xs space-y-1 text-muted-foreground">
                    <li>• State-specific tax (varies by state)</li>
                    <li>• Karnataka: ₹200/month (₹300 in February)</li>
                    <li>• Maharashtra: ₹200/month (₹300 in February)</li>
                    <li>• Due date: Varies by state</li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
};

export default PayrollSettings;

