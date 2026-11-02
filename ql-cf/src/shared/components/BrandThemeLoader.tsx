import { useEffect, useState, type ReactNode } from "react";
import { SalonBrandingContext } from "../context/SalonBrandingContext";
import { applyBrandTheme, isBrandTheme } from "../lib/brandTheme";

export function BrandThemeLoader({ children }: { children: ReactNode }) {
  const [logoDataUrl, setLogoDataUrl] = useState("");
  const [queueUrl, setQueueUrl] = useState("");

  useEffect(() => {
    let mounted = true;
    void fetch(`${import.meta.env.VITE_API_URL ?? ""}/api/catalog/theme`)
      .then(async (response) => {
        if (!response.ok) throw new Error(`Theme request failed with status ${response.status}.`);
        return response.json() as Promise<{ themeColor?: unknown; logoDataUrl?: unknown; queueUrl?: unknown }>;
      })
      .then(({ themeColor, logoDataUrl: loadedLogo, queueUrl: loadedQueueUrl }) => {
        if (!isBrandTheme(themeColor)) throw new Error("The salon theme response was invalid.");
        if (loadedLogo !== undefined && typeof loadedLogo !== "string") {
          throw new Error("The salon logo response was invalid.");
        }
        if (loadedQueueUrl !== undefined && typeof loadedQueueUrl !== "string") {
          throw new Error("The salon queue link response was invalid.");
        }
        if (mounted) {
          applyBrandTheme(themeColor);
          setLogoDataUrl(loadedLogo ?? "");
          setQueueUrl(loadedQueueUrl ?? "");
        }
      })
      .catch((error: unknown) => {
        console.error("Unable to load the salon theme:", error);
      });
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <SalonBrandingContext.Provider value={{ logoDataUrl, setLogoDataUrl, queueUrl, setQueueUrl }}>
      {children}
    </SalonBrandingContext.Provider>
  );
}
