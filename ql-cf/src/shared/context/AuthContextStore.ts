import { createContext } from "react";
import type { Session, User } from "@supabase/supabase-js";

export type UserRole = "admin" | "staff";

export type StaffRole =
  | "hairstylist"
  | "nail_technician"
  | "receptionist"
  | null;

export interface Profile {
  id: string;
  username: string;
  full_name: string | null;
  account_role: UserRole;
  staff_role: StaffRole;
  is_active: boolean;
  must_change_password: boolean;
}

export interface CurrentUser {
  id: string;
  username: string;
  fullName: string;
  accountRole: UserRole;
  staffRole: StaffRole;
  isActive: boolean;
  mustChangePassword: boolean;
  contactEmail: string;
  avatarUrl: string;
}

export interface ProfileUpdate {
  fullName: string;
  contactEmail: string;
  avatarFile?: File | null;
  removeAvatar?: boolean;
}

export interface LoginCredentials {
  username: string;
  password: string;
}

export interface LoginResult {
  accountRole: UserRole;
}

export interface AuthContextValue {
  user: User | null;
  currentUser: CurrentUser | null;
  session: Session | null;
  profile: Profile | null;
  role: UserRole | null;
  loading: boolean;
  loginWithUsername: (credentials: LoginCredentials) => Promise<LoginResult>;
  updateCurrentProfile: (update: ProfileUpdate) => Promise<void>;
  logout: () => Promise<void>;
  signOut: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);
