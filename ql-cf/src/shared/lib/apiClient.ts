import { supabaseClient } from "./supabaseClient";

const API_BASE = import.meta.env.VITE_API_URL ?? "";

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const { data: { session } } = await supabaseClient.auth.getSession();
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
      ...(init?.headers ?? {}),
    },
  });

  const payload = (await response.json().catch(() => ({}))) as {
    success?: boolean;
    message?: string;
  } & T;

  if (!response.ok || payload.success === false) {
    throw new ApiError(payload.message ?? "Request failed.", response.status);
  }

  return payload;
}

export async function apiRequestWithProgress<T>(
  path: string,
  onDownloadProgress: (progressPercent: number | null) => void,
): Promise<T> {
  const { data: { session } } = await supabaseClient.auth.getSession();

  return new Promise<T>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("GET", `${API_BASE}${path}`);
    request.responseType = "json";
    request.setRequestHeader("Content-Type", "application/json");
    if (session?.access_token) {
      request.setRequestHeader("Authorization", `Bearer ${session.access_token}`);
    }

    request.onprogress = (event) => {
      onDownloadProgress(event.lengthComputable && event.total > 0
        ? Math.min(100, Math.round((event.loaded / event.total) * 100))
        : null);
    };
    request.onerror = () => reject(new ApiError("Network request failed.", 0));
    request.onabort = () => reject(new ApiError("Request was cancelled.", 0));
    request.onload = () => {
      const payload = request.response as ({
        success?: boolean;
        message?: string;
      } & T) | null;
      if (request.status < 200 || request.status >= 300 || payload?.success === false) {
        reject(new ApiError(payload?.message ?? "Request failed.", request.status));
        return;
      }
      if (!payload) {
        reject(new ApiError("The server returned an invalid response.", request.status));
        return;
      }
      onDownloadProgress(100);
      resolve(payload);
    };
    request.send();
  });
}
