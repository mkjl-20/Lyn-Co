export type AccountRole = "admin" | "staff";
export type StaffRole = string;

export interface UserProfile {
  id: string;
  username: string;
  fullName: string;
  accountRole: AccountRole;
  staffRole: StaffRole | null;
  isActive: boolean;
}

export interface LoginCredentials {
  username: string;
  password: string;
}

export interface CreateStaffAccountPayload {
  username: string;
  fullName: string;
  staffRole: StaffRole;
  temporaryPassword: string;
}