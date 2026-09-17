import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods":
    "POST, OPTIONS",
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders,
    });
  }

  try {
    // Only allow POST
    if (req.method !== "POST") {
      return new Response(
        JSON.stringify({
          success: false,
          message: "Method not allowed.",
        }),
        {
          status: 405,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    const body = await req.json();

    const username =
      typeof body.username === "string"
        ? body.username.trim()
        : "";

    const password =
      typeof body.password === "string"
        ? body.password
        : "";

    if (!username) {
      return new Response(
        JSON.stringify({
          success: false,
          message: "Username is required.",
        }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    if (!password) {
      return new Response(
        JSON.stringify({
          success: false,
          message: "Password is required.",
        }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    /*
     * Supabase environment variables
     */
    const supabaseUrl =
      Deno.env.get("SUPABASE_URL");

    const serviceRoleKey =
      Deno.env.get(
        "SUPABASE_SERVICE_ROLE_KEY"
      );

    if (
      !supabaseUrl ||
      !serviceRoleKey
    ) {
      console.error(
        "Missing Supabase environment variables."
      );

      return new Response(
        JSON.stringify({
          success: false,
          message:
            "Server authentication configuration is missing.",
        }),
        {
          status: 500,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    /*
     * IMPORTANT:
     *
     * This client uses the SERVICE ROLE KEY.
     * It must NEVER be placed in frontend code.
     */
    const adminClient =
      createClient(
        supabaseUrl,
        serviceRoleKey,
        {
          auth: {
            autoRefreshToken: false,
            persistSession: false,
          },
        }
      );

    /*
     * Find the account using username.
     *
     * The browser cannot do this anymore.
     * The Edge Function does it securely.
     */
    const {
      data: profile,
      error: profileError,
    } =
      await adminClient
        .from("profiles")
        .select(`
          id,
          username,
          account_role,
          staff_role,
          is_active
        `)
        .eq(
          "username",
          username
        )
        .maybeSingle();

    if (profileError) {
      console.error(
        "Profile lookup error:",
        profileError
      );

      return new Response(
        JSON.stringify({
          success: false,
          message:
            "Unable to process login.",
        }),
        {
          status: 500,
          headers: {
            ...corsHeaders,
            "Content-Type":
              "application/json",
          },
        }
      );
    }

    /*
     * Don't reveal whether the username exists.
     */
    if (!profile) {
      return new Response(
        JSON.stringify({
          success: false,
          message:
            "Invalid username or password.",
        }),
        {
          status: 401,
          headers: {
            ...corsHeaders,
            "Content-Type":
              "application/json",
          },
        }
      );
    }

    /*
     * Check account status.
     */
    if (!profile.is_active) {
      return new Response(
        JSON.stringify({
          success: false,
          message:
            "This account is inactive.",
        }),
        {
          status: 403,
          headers: {
            ...corsHeaders,
            "Content-Type":
              "application/json",
          },
        }
      );
    }

    /*
     * The profiles.id should match auth.users.id.
     *
     * Get the Supabase Auth user.
     */
    const {
      data: authUserData,
      error: authUserError,
    } =
      await adminClient.auth.admin.getUserById(
        profile.id
      );

    if (
      authUserError ||
      !authUserData.user
    ) {
      console.error(
        "Auth user lookup error:",
        authUserError
      );

      return new Response(
        JSON.stringify({
          success: false,
          message:
            "This account is not properly configured.",
        }),
        {
          status: 500,
          headers: {
            ...corsHeaders,
            "Content-Type":
              "application/json",
          },
        }
      );
    }

    const authEmail =
      authUserData.user.email;

    if (!authEmail) {
      return new Response(
        JSON.stringify({
          success: false,
          message:
            "This account is missing its internal authentication email.",
        }),
        {
          status: 500,
          headers: {
            ...corsHeaders,
            "Content-Type":
              "application/json",
          },
        }
      );
    }

    /*
     * Return the internal email to the frontend.
     *
     * The user never enters or sees this.
     *
     * The frontend immediately uses it with
     * Supabase signInWithPassword().
     */
    return new Response(
      JSON.stringify({
        success: true,
        email: authEmail,
        accountRole:
          profile.account_role,
      }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type":
            "application/json",
        },
      }
    );
  } catch (error) {
    console.error(
      "Unexpected login error:",
      error
    );

    return new Response(
      JSON.stringify({
        success: false,
        message:
          "An unexpected error occurred.",
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type":
            "application/json",
        },
      }
    );
  }
});