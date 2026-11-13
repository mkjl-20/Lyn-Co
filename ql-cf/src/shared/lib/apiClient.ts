import { supabaseClient } from "./supabaseClient";

const API_BASE = import.meta.env.VITE_API_URL ?? "";

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

function getXhrResponseHeaders(request: XMLHttpRequest): Headers {
  const headers = new Headers();
  for (const header of request.getAllResponseHeaders().trim().split(/[\r\n]+/).filter(Boolean)) {
    const separator = header.indexOf(":");
    if (separator >= 0) {
      headers.set(header.slice(0, separator), header.slice(separator + 1).trim());
    }
  }
  return headers;
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
  onDownloadProgress: (progressPercent: number | null, headers: Headers) => void,
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
        : null, getXhrResponseHeaders(request));
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
      onDownloadProgress(100, getXhrResponseHeaders(request));
      resolve(payload);
    };
    request.send();
  });
}

export async function apiDownload(path: string, fileName: string): Promise<void> {
  const { data: { session } } = await supabaseClient.auth.getSession();
  const headers: HeadersInit = {};
  if (session?.access_token) {
    headers.Authorization = "Bearer " + session.access_token;
  }
  const response = await fetch(API_BASE + path, { headers });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({})) as { message?: string };
    throw new ApiError(payload.message ?? "Unable to download the file.", response.status);
  }

  const file = await response.blob();
  const url = URL.createObjectURL(file);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
