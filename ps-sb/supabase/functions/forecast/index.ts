import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(
        JSON.stringify({ success: false, message: "Server configuration error." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data, error } = await supabase.rpc("compute_hybrid_forecast", {
      p_window: 7,
    });

    if (error) {
      return new Response(
        JSON.stringify({ success: false, message: error.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    await supabase.from("forecast_logs").insert({
      method: "hybrid_ma_linear_regression",
      source: "edge_function",
      slope: data?.slope ?? null,
      intercept: data?.intercept ?? null,
      ewt_minutes: data?.ewtMinutes ?? null,
      waiting_count: data?.waitingCount ?? null,
      payload: data,
    });

    return new Response(JSON.stringify({ success: true, forecast: data }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({
        success: false,
        message: error instanceof Error ? error.message : "Unexpected forecast error.",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
