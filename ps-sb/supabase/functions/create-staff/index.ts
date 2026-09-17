import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods":
    "POST, OPTIONS",
};

Deno.serve(async (req) => {
  // -------------------------------------------------------
  // CORS
  // -------------------------------------------------------

  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders,
    });
  }

  try {
    // -----------------------------------------------------
    // ENVIRONMENT VARIABLES
    // -----------------------------------------------------

    const supabaseUrl =
      Deno.env.get("SUPABASE_URL");

    const serviceRoleKey =
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceRoleKey) {
      console.error(
        "Missing Supabase environment variables."
      );

      return new Response(
        JSON.stringify({
          error:
            "Server configuration error.",
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

    // -----------------------------------------------------
    // ADMIN CLIENT
    // -----------------------------------------------------

    const supabaseAdmin =
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

    // -----------------------------------------------------
    // GET REQUEST BODY
    // -----------------------------------------------------

    const body = await req.json();

    console.log(
      "Create staff request:",
      {
        username: body.username,
        full_name: body.full_name,
        staff_role: body.staff_role,
      }
    );

    const {
      username,
      password,
      full_name,
      staff_role,
    } = body;

    // -----------------------------------------------------
    // VALIDATION
    // -----------------------------------------------------

    if (
      typeof username !== "string" ||
      !username.trim()
    ) {
      return new Response(
        JSON.stringify({
          error: "Username is required.",
        }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type":
              "application/json",
          },
        }
      );
    }

    if (
      typeof password !== "string" ||
      password.length < 6
    ) {
      return new Response(
        JSON.stringify({
          error:
            "Password must be at least 6 characters.",
        }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type":
              "application/json",
          },
        }
      );
    }

    if (
      typeof full_name !== "string" ||
      !full_name.trim()
    ) {
      return new Response(
        JSON.stringify({
          error:
            "Full name is required.",
        }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type":
              "application/json",
          },
        }
      );
    }

    const allowedStaffRoles = [
      "hairstylist",
      "manicurist",
      "pedicurist",
      "receptionist",
    ];

    if (
      !allowedStaffRoles.includes(
        staff_role
      )
    ) {
      return new Response(
        JSON.stringify({
          error:
            "Invalid staff role.",
        }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type":
              "application/json",
          },
        }
      );
    }

    const cleanUsername =
      username.trim().toLowerCase();

    const cleanFullName =
      full_name.trim();

    // -----------------------------------------------------
    // CHECK USERNAME
    // -----------------------------------------------------

    const {
      data: existingProfile,
      error: usernameCheckError,
    } = await supabaseAdmin
      .from("profiles")
      .select("id, username")
      .eq(
        "username",
        cleanUsername
      )
      .maybeSingle();

    if (usernameCheckError) {
      console.error(
        "Username check failed:",
        usernameCheckError
      );

      return new Response(
        JSON.stringify({
          error:
            "Unable to check username.",
          details:
            usernameCheckError.message,
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

    if (existingProfile) {
      return new Response(
        JSON.stringify({
          error:
            "Username is already taken.",
        }),
        {
          status: 409,
          headers: {
            ...corsHeaders,
            "Content-Type":
              "application/json",
          },
        }
      );
    }

    // -----------------------------------------------------
    // INTERNAL EMAIL
    //
    // The customer/staff never needs to see this.
    //
    // Example:
    //
    // username = maria
    // internal email =
    // maria@lynq.internal
    // -----------------------------------------------------

    const internalEmail =
      `${cleanUsername}@lynq.internal`;

    // -----------------------------------------------------
    // CREATE SUPABASE AUTH USER
    // -----------------------------------------------------

    const {
      data: authData,
      error: authError,
    } =
      await supabaseAdmin.auth.admin.createUser(
        {
          email: internalEmail,
          password,
          email_confirm: true,
          user_metadata: {
            username:
              cleanUsername,
            full_name:
              cleanFullName,
            account_role:
              "staff",
            staff_role:
              staff_role,
          },
        }
      );

    if (authError) {
      console.error(
        "Auth user creation failed:",
        authError
      );

      return new Response(
        JSON.stringify({
          error:
            authError.message ||
            "Unable to create staff authentication account.",
        }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type":
              "application/json",
          },
        }
      );
    }

    if (!authData.user) {
      console.error(
        "Auth user was not returned."
      );

      return new Response(
        JSON.stringify({
          error:
            "Authentication user was not created.",
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

    const authUserId =
      authData.user.id;

    // -----------------------------------------------------
    // CREATE PROFILE
    // -----------------------------------------------------

    const {
      data: profileData,
      error: profileError,
    } = await supabaseAdmin
      .from("profiles")
      .insert({
        id: authUserId,
        username:
          cleanUsername,
        full_name:
          cleanFullName,
        account_role:
          "staff",
        staff_role:
          staff_role,
        is_active: true,
      })
      .select(
        `
          id,
          username,
          full_name,
          account_role,
          staff_role,
          is_active
        `
      )
      .single();

    // -----------------------------------------------------
    // IF PROFILE CREATION FAILS
    // DELETE AUTH USER
    // -----------------------------------------------------

    if (profileError) {
      console.error(
        "Profile creation failed:",
        profileError
      );

      await supabaseAdmin.auth.admin.deleteUser(
        authUserId
      );

      return new Response(
        JSON.stringify({
          error:
            "Profile creation failed.",
          details:
            profileError.message,
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

    // -----------------------------------------------------
    // SUCCESS
    // -----------------------------------------------------

    console.log(
      "Staff account created:",
      {
        id: authUserId,
        username:
          cleanUsername,
        staff_role:
          staff_role,
      }
    );

    return new Response(
      JSON.stringify({
        success: true,
        message:
          "Staff account created successfully.",
        staff: profileData,
      }),
      {
        status: 201,
        headers: {
          ...corsHeaders,
          "Content-Type":
            "application/json",
        },
      }
    );
  } catch (error) {
    console.error(
      "Unexpected create-staff error:",
      error
    );

    return new Response(
      JSON.stringify({
        error:
          error instanceof Error
            ? error.message
            : "Unexpected server error.",
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