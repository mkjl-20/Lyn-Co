import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

import { supabaseClient } from "@/shared/lib/supabaseClient";

import type {
  Session,
  User,
} from "@supabase/supabase-js";

export type UserRole = "admin" | "staff";

export type StaffRole =
  | "hairstylist"
  | "manicurist"
  | "pedicurist"
  | "receptionist"
  | null;

export interface Profile {
  id: string;
  username: string;
  full_name: string | null;
  account_role: UserRole;
  staff_role: StaffRole;
  is_active: boolean;
}

export interface CurrentUser {
  id: string;
  username: string;
  fullName: string;
  accountRole: UserRole;
  staffRole: StaffRole;
  isActive: boolean;
}

interface LoginCredentials {
  username: string;
  password: string;
}

interface LoginResult {
  accountRole: UserRole;
}

interface AuthContextType {
  user: User | null;
  currentUser: CurrentUser | null;
  session: Session | null;
  profile: Profile | null;
  role: UserRole | null;
  loading: boolean;

  loginWithUsername: (
    credentials: LoginCredentials
  ) => Promise<LoginResult>;

  logout: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext =
  createContext<AuthContextType | undefined>(
    undefined
  );

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
    };
  };

  /*
   * Load the application profile.
   *
   * This should only happen after the
   * user has an authenticated Supabase session.
   */
  const loadProfile = async (
    userId: string
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
        `)
        .eq("id", userId)
        .maybeSingle();

    if (error) {
      console.error(
        "Profile loading error:",
        error
      );

      setProfile(null);
      return;
    }

    if (!data) {
      console.error(
        "No profile found for user:",
        userId
      );

      setProfile(null);
      return;
    }

    console.log(
      "Profile loaded:",
      data
    );

    setProfile(
      data as Profile
    );
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
            currentUser.id
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
          console.log(
            "Auth state changed:",
            event
          );

          if (!mounted) {
            return;
          }

          setSession(
            newSession
          );

          const newUser =
            newSession?.user ?? null;

          setUser(
            newUser
          );

          if (!newUser) {
            setProfile(null);
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
              newUser.id
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
   * login Edge Function
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
      username.trim();

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
     * Ask the Edge Function to resolve
     * the username to the internal Supabase
     * Auth account.
     *
     * IMPORTANT:
     * The browser never directly queries
     * the profiles table here.
     */
    const {
      data,
      error,
    } =
      await supabaseClient.functions.invoke(
        "login",
        {
          body: {
            username: cleanUsername,
            password,
          },
        }
      );

    if (error) {
      console.error(
        "Login Edge Function error:",
        error
      );

      throw new Error(
        "Invalid username or password."
      );
    }

    if (!data?.success) {
      throw new Error(
        data?.message ??
          "Invalid username or password."
      );
    }

    /*
     * The Edge Function returns the
     * internal Auth email.
     *
     * The user never enters this email.
     */
    const internalEmail =
      data.email;

    if (!internalEmail) {
      console.error(
        "Login function did not return an email."
      );

      throw new Error(
        "Authentication account is not configured correctly."
      );
    }

    /*
     * Authenticate through Supabase Auth.
     *
     * Password verification is handled
     * by Supabase Auth.
     */
    const {
      data: authData,
      error: loginError,
    } =
      await supabaseClient.auth.signInWithPassword(
        {
          email: internalEmail,
          password,
        }
      );

    if (loginError) {
      console.error(
        "Supabase password authentication error:",
        loginError
      );

      throw new Error(
        "Invalid username or password."
      );
    }

    if (!authData.session) {
      throw new Error(
        "Login succeeded but no session was created."
      );
    }

    console.log(
      "Login successful."
    );

    return {
      accountRole:
        data.accountRole as UserRole,
    };
  };

  /*
   * LOGOUT
   */
  const logout = async () => {
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
    profile?.account_role ?? null;

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
        logout,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

/*
 * useAuth hook
 */
export function useAuth() {
  const context =
    useContext(AuthContext);

  if (!context) {
    throw new Error(
      "useAuth must be used inside AuthProvider"
    );
  }

  return context;
}