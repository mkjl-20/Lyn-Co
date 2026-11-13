import { useEffect, useState, type ReactNode } from "react";
import { SalonBrandingContext } from "../context/SalonBrandingContext";
import { applyBrandTheme, isBrandTheme } from "../lib/brandTheme";
import { resolveCustomerQueueBaseUrl } from "../lib/queueQr";

export function BrandThemeLoader({ children }: { children: ReactNode }) {
  const [logoDataUrl, setLogoDataUrl] = useState("");
  const [bannerDataUrl, setBannerDataUrl] = useState("");
  const [queueUrl, setQueueUrl] = useState("");

  useEffect(() => {
    document.title = "Lyn & Co Salon and Spa";
    const favicon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!favicon) {
      console.error("The salon browser-tab icon link is missing.");
      return;
    }

    favicon.href = logoDataUrl || "/lynq-mark.svg";
    favicon.type = logoDataUrl.match(/^data:(image\/(?:png|jpeg|webp));base64,/i)?.[1] ?? "image/svg+xml";
  }, [logoDataUrl]);

  useEffect(() => {
    let mounted = true;
    void fetch(`${import.meta.env.VITE_API_URL ?? ""}/api/catalog/theme`)
      .then(async (response) => {
        if (!response.ok) throw new Error(`Theme request failed with status ${response.status}.`);
        return response.json() as Promise<{ themeColor?: unknown; logoDataUrl?: unknown; bannerDataUrl?: unknown; queueUrl?: unknown }>;
      })
      .then(({ themeColor, logoDataUrl: loadedLogo, bannerDataUrl: loadedBanner, queueUrl: loadedQueueUrl }) => {
        if (!isBrandTheme(themeColor)) throw new Error("The salon theme response was invalid.");
        if (loadedLogo !== undefined && typeof loadedLogo !== "string") {
          throw new Error("The salon logo response was invalid.");
        }
        if (loadedQueueUrl !== undefined && typeof loadedQueueUrl !== "string") {
          throw new Error("The salon queue link response was invalid.");
        }
        if (loadedBanner !== undefined && typeof loadedBanner !== "string") {
          throw new Error("The customer banner image response was invalid.");
        }
        const resolvedQueueUrl = resolveCustomerQueueBaseUrl(
          loadedQueueUrl ?? "",
          window.location.origin,
        );
        if (mounted) {
          applyBrandTheme(themeColor);
          setLogoDataUrl(loadedLogo ?? "");
          setBannerDataUrl(loadedBanner ?? "");
          setQueueUrl(resolvedQueueUrl);
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
    <SalonBrandingContext.Provider value={{ logoDataUrl, setLogoDataUrl, bannerDataUrl, setBannerDataUrl, queueUrl, setQueueUrl }}>
      {children}
    </SalonBrandingContext.Provider>
  );
}
