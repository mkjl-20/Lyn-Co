import { createContext, useContext } from "react";

export type NotificationKind = "success" | "error";

export interface ConfirmationOptions {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}

export interface FeedbackContextValue {
  notify: (kind: NotificationKind, message: string) => void;
  confirm: (options: ConfirmationOptions) => Promise<boolean>;
}

export const FeedbackContext = createContext<FeedbackContextValue | null>(null);

export function useFeedback() {
  const value = useContext(FeedbackContext);
  if (!value) throw new Error("useFeedback must be used within FeedbackProvider.");
  return value;
}
