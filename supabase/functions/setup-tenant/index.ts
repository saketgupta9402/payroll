import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { user, tenant } = await req.json();

    // Create tenant
    const { data: tenantData, error: tenantError } = await supabaseClient
      .from("tenants")
      .insert([
        {
          subdomain: tenant.subdomain,
          company_name: tenant.company_name,
          theme_color: "#1E40AF",
        },
      ])
      .select()
      .single();

    if (tenantError) throw tenantError;

    // Create profile
    const { error: profileError } = await supabaseClient
      .from("profiles")
      .insert([
        {
          id: user.id,
          tenant_id: tenantData.id,
          email: user.email,
          full_name: user.full_name,
        },
      ]);

    if (profileError) throw profileError;

    // Create user role (owner)
    const { error: roleError } = await supabaseClient
      .from("user_roles")
      .insert([
        {
          user_id: user.id,
          tenant_id: tenantData.id,
          role: "owner",
        },
      ]);

    if (roleError) throw roleError;

    return new Response(
      JSON.stringify({ success: true, tenant: tenantData }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error: any) {
    console.error("Setup tenant error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      }
    );
  }
});
