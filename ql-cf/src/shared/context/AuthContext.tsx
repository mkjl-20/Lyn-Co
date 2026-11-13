import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { supabaseClient } from "@/shared/lib/supabaseClient";
import { apiRequest } from "@/shared/lib/apiClient";
import { removeObsoleteProfileAvatars, uploadProfileAvatar } from "@/shared/lib/profileAvatar";
import { AuthContext } from "./AuthContextStore";
import type { CurrentUser, LoginCredentials, LoginResult, Profile, ProfileUpdate, UserRole } from "./AuthContextStore";
import type { Session, User } from "@supabase/supabase-js";

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({
  children,
}: AuthProviderProps) {
  const [user, setUser] =
    useState<User | null>(null);

  const [session, setSession] =
    useState<Session | null>(null);

  const [profile, setProfile] =
    useState<Profile | null>(null);

  const [loading, setLoading] =
    useState(true);
  const profileReadyForUserId = useRef<string | null>(null);

  /*
   * Convert database profile into the
   * object expected by the application.
   */
  const buildCurrentUser = (
    profileData: Profile
  ): CurrentUser => {
    return {
      id: profileData.id,
      username: profileData.username,
      fullName:
        profileData.full_name ??
        profileData.username,
      accountRole:
        profileData.account_role,
      staffRole:
        profileData.staff_role,
      isActive:
        profileData.is_active,
      mustChangePassword:
        profileData.must_change_password,
      contactEmail: typeof user?.user_metadata?.contact_email === "string"
        ? user.user_metadata.contact_email
        : "",
      avatarUrl: typeof user?.user_metadata?.avatar_url === "string"
        ? user.user_metadata.avatar_url
        : "",
    };
  };

  /*
   * Load the application profile.
   *
   * This should only happen after the
   * user has an authenticated Supabase session.
   */
  const loadProfile = async (
    userId: string,
    fallbackUser?: User
  ) => {
    console.log(
      "Loading profile:",
      userId
    );

    const {
      data,
      error,
    } =
      await supabaseClient
        .from("profiles")
        .select(`
          id,
          username,
          full_name,
          account_role,
          staff_role,
          is_active
          , must_change_password
        `)
        .eq("id", userId)
        .maybeSingle();

    if (error) {
      console.error(
        "Profile loading error:",
        error
      );

      const metadata = fallbackUser?.user_metadata;
      setProfile(metadata?.account_role ? {
        id: userId,
        username: metadata.username ?? fallbackUser?.email?.split("@")[0] ?? "",
        full_name: metadata.full_name ?? null,
        account_role: metadata.account_role,
        staff_role: metadata.staff_role ?? null,
        is_active: metadata.is_active ?? true,
        must_change_password: metadata.must_change_password ?? false,
      } as Profile : null);
      profileReadyForUserId.current = userId;
      return;
    }

    if (!data) {
      console.error(
        "No profile found for user:",
        userId
      );

      const metadata = fallbackUser?.user_metadata;
      setProfile(metadata?.account_role ? {
        id: userId,
        username: metadata.username ?? fallbackUser?.email?.split("@")[0] ?? "",
        full_name: metadata.full_name ?? null,
        account_role: metadata.account_role,
        staff_role: metadata.staff_role ?? null,
        is_active: metadata.is_active ?? true,
        must_change_password: metadata.must_change_password ?? false,
      } as Profile : null);
      profileReadyForUserId.current = userId;
      return;
    }

    console.log(
      "Profile loaded:",
      data
    );

    setProfile(
      data as Profile
    );
    profileReadyForUserId.current = userId;
  };

  /*
   * Initialize authentication when
   * the application starts.
   */
  useEffect(() => {
    let mounted = true;

    const initializeAuth =
      async () => {
        console.log(
          "Initializing authentication..."
        );

        const {
          data,
          error,
        } =
          await supabaseClient.auth.getSession();

        if (error) {
          console.error(
            "Session error:",
            error
          );

          if (mounted) {
            setLoading(false);
          }

          return;
        }

        if (!mounted) {
          return;
        }

        const currentSession =
          data.session;

        const currentUser =
          currentSession?.user ?? null;

        setSession(
          currentSession
        );

        setUser(
          currentUser
        );

        if (currentUser) {
          await loadProfile(
            currentUser.id,
            currentUser
          );
        } else {
          setProfile(null);
        }

        if (mounted) {
          setLoading(false);
        }
      };

    initializeAuth();

    /*
     * Listen for Supabase Auth changes.
     */
    const {
      data: authListener,
    } =
      supabaseClient.auth.onAuthStateChange(
        (
          event,
          newSession
        ) => {
          if (event === "INITIAL_SESSION") {
            return;
          }

          console.log(
            "Auth state changed:",
            event
          );

          if (!mounted) {
            return;
          }

          setLoading(true);

          setSession(
            newSession
          );

          const newUser =
            newSession?.user ?? null;

          setUser(
            newUser
          );

          if (!newUser) {
            profileReadyForUserId.current = null;
            setProfile(null);
            setLoading(false);
            return;
          }

          if (profileReadyForUserId.current === newUser.id) {
            setLoading(false);
            return;
          }

          /*
           * Delay the profile query slightly
           * so we don't perform another Supabase
           * operation inside the auth callback.
           */
          setTimeout(() => {
            if (!mounted) {
              return;
            }

            loadProfile(
              newUser.id,
              newUser
            ).finally(() => {
              if (mounted) {
                setLoading(false);
              }
            });
          }, 0);
        }
      );

    return () => {
      mounted = false;

      authListener.subscription.unsubscribe();
    };
  }, []);

  /*
   * LOGIN WITH USERNAME + PASSWORD
   *
   * The browser does NOT query profiles
   * before authentication.
   *
   * Instead:
   *
   * username/password
   *       ↓
  * Express login endpoint
   *       ↓
   * username → internal Auth email
   *       ↓
   * signInWithPassword()
   */
  const loginWithUsername = async ({
    username,
    password,
  }: LoginCredentials): Promise<LoginResult> => {
    const cleanUsername =
      username.trim().toLowerCase();

    if (!cleanUsername) {
      throw new Error(
        "Username is required."
      );
    }

    if (!password) {
      throw new Error(
        "Password is required."
      );
    }

    console.log(
      "Attempting username login:",
      cleanUsername
    );

    /*
    * Ask the Express API to resolve
     * the username to the internal Supabase
     * Auth account.
     *
     * IMPORTANT:
     * The browser never directly queries
     * the profiles table here.
     */
    const data = await apiRequest<{
      success?: boolean;
      message?: string;
      accountRole?: string;
      session?: Session;
      profile?: Profile;
    }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username: cleanUsername, password }),
    });

    if (!data?.success) {
      throw new Error(
        data?.message ??
          "Invalid username or password."
      );
    }

    if (!data.session) {
      throw new Error("Login succeeded but no session was created.");
    }

    const { error: sessionError } = await supabaseClient.auth.setSession(data.session);
    if (sessionError) throw new Error(sessionError.message);

    if (data.profile) {
      profileReadyForUserId.current = data.profile.id;
      setProfile(data.profile);
    }

    console.log(
      "Login successful."
    );

    return {
      accountRole:
        data.accountRole as UserRole,
    };
  };

  const updateCurrentProfile = async (update: ProfileUpdate) => {
    const contactEmail = update.contactEmail.trim().toLowerCase();
    if (contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) {
      throw new Error("Enter a valid email address or leave it blank.");
    }
    if (!user) throw new Error("Sign in to update your profile.");

    const avatarUrl = update.avatarFile
      ? await uploadProfileAvatar(user.id, update.avatarFile)
      : update.removeAvatar ? null : user.user_metadata?.avatar_url ?? null;
    const { profile: updatedProfile } = await apiRequest<{ profile: Profile }>("/api/auth/profile", {
      method: "PATCH",
      body: JSON.stringify({ fullName: update.fullName }),
    });
    const { data, error } = await supabaseClient.auth.updateUser({
      data: {
        ...user.user_metadata,
        contact_email: contactEmail || null,
        avatar_url: avatarUrl,
      },
    });
    if (error) throw error;
    await removeObsoleteProfileAvatars(user.id, avatarUrl);
    if (data.user) setUser(data.user);
    setProfile(updatedProfile);
  };

  /*
   * LOGOUT
   */
  const logout = async () => {
    try {
      await apiRequest("/api/auth/logout", { method: "POST" });
    } catch (auditError) {
      console.error("Logout audit request failed:", auditError);
    }

    const {
      error,
    } =
      await supabaseClient.auth.signOut();

    if (error) {
      console.error(
        "Logout error:",
        error
      );

      throw error;
    }

    setUser(null);
    setSession(null);
    setProfile(null);
    profileReadyForUserId.current = null;
  };

  const signOut = logout;

  /*
   * UI-friendly current user.
   */
  const currentUser =
    profile
      ? buildCurrentUser(profile)
      : null;

  /*
   * Current application role.
   */
  const role =
    profile?.account_role ?? (user?.user_metadata?.account_role as UserRole | null) ?? null;

  return (
    <AuthContext.Provider
      value={{
        user,
        currentUser,
        session,
        profile,
        role,
        loading,
        loginWithUsername,
        updateCurrentProfile,
        logout,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
