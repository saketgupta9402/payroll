import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Building2, Users, Shield, TrendingUp, CheckCircle2 } from "lucide-react";

const Index = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/10 via-background to-accent/10">
      {/* Hero Section */}
      <section className="container mx-auto px-4 py-20 text-center">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-primary mb-6 shadow-xl">
          <Building2 className="w-10 h-10 text-primary-foreground" />
        </div>
        <h1 className="text-5xl md:text-6xl font-bold mb-6 bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
          PayrollPro
        </h1>
        <p className="text-xl md:text-2xl text-muted-foreground mb-8 max-w-2xl mx-auto">
          Enterprise-grade payroll management for modern businesses. India-first, global-ready.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Button size="lg" onClick={() => navigate("/auth")} className="text-lg px-8">
            Get Started
          </Button>
          <Button size="lg" variant="outline" onClick={() => navigate("/auth")} className="text-lg px-8">
            Sign In
          </Button>
        </div>
      </section>

      {/* Features Grid */}
      <section className="container mx-auto px-4 py-16">
        <h2 className="text-3xl font-bold text-center mb-12">Powerful Features</h2>
        <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
          <div className="p-6 rounded-xl bg-card border shadow-md hover:shadow-lg transition-shadow">
            <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
              <Users className="w-6 h-6 text-primary" />
            </div>
            <h3 className="text-xl font-semibold mb-2">Multi-Tenant Architecture</h3>
            <p className="text-muted-foreground">
              Complete isolation with subdomain provisioning and tenant-specific branding
            </p>
          </div>

          <div className="p-6 rounded-xl bg-card border shadow-md hover:shadow-lg transition-shadow">
            <div className="w-12 h-12 rounded-lg bg-success/10 flex items-center justify-center mb-4">
              <Shield className="w-6 h-6 text-success" />
            </div>
            <h3 className="text-xl font-semibold mb-2">Enterprise Security</h3>
            <p className="text-muted-foreground">
              Role-based access control, audit logs, and row-level security for data protection
            </p>
          </div>

          <div className="p-6 rounded-xl bg-card border shadow-md hover:shadow-lg transition-shadow">
            <div className="w-12 h-12 rounded-lg bg-info/10 flex items-center justify-center mb-4">
              <TrendingUp className="w-6 h-6 text-info" />
            </div>
            <h3 className="text-xl font-semibold mb-2">India Statutory Compliance</h3>
            <p className="text-muted-foreground">
              Built-in support for PF, ESI, PT, TDS with automatic updates and compliance reports
            </p>
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section className="container mx-auto px-4 py-16">
        <div className="bg-card rounded-2xl p-12 shadow-xl border">
          <h2 className="text-3xl font-bold text-center mb-12">Why PayrollPro?</h2>
          <div className="grid gap-6 md:grid-cols-2">
            <div className="flex items-start space-x-4">
              <CheckCircle2 className="w-6 h-6 text-success flex-shrink-0 mt-1" />
              <div>
                <h3 className="font-semibold mb-1">Automated Payroll Cycles</h3>
                <p className="text-muted-foreground text-sm">
                  Draft, validate, approve, and process payroll with built-in error checking
                </p>
              </div>
            </div>
            <div className="flex items-start space-x-4">
              <CheckCircle2 className="w-6 h-6 text-success flex-shrink-0 mt-1" />
              <div>
                <h3 className="font-semibold mb-1">Flexible Compensation Structures</h3>
                <p className="text-muted-foreground text-sm">
                  Configure CTC breakdowns with custom components and tax optimization
                </p>
              </div>
            </div>
            <div className="flex items-start space-x-4">
              <CheckCircle2 className="w-6 h-6 text-success flex-shrink-0 mt-1" />
              <div>
                <h3 className="font-semibold mb-1">Integrated Payouts</h3>
                <p className="text-muted-foreground text-sm">
                  Direct bank transfers with reconciliation and failed payment handling
                </p>
              </div>
            </div>
            <div className="flex items-start space-x-4">
              <CheckCircle2 className="w-6 h-6 text-success flex-shrink-0 mt-1" />
              <div>
                <h3 className="font-semibold mb-1">Employee Self-Service</h3>
                <p className="text-muted-foreground text-sm">
                  Empower employees with payslip downloads, tax forms, and profile management
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="container mx-auto px-4 py-16 text-center">
        <h2 className="text-3xl font-bold mb-4">Ready to streamline your payroll?</h2>
        <p className="text-xl text-muted-foreground mb-8">
          Join modern businesses using PayrollPro for hassle-free payroll management
        </p>
        <Button size="lg" onClick={() => navigate("/auth")} className="text-lg px-12">
          Start Free Trial
        </Button>
      </section>
    </div>
  );
};

export default Index;
