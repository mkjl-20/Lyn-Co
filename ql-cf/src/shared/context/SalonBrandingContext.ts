import { createContext, useContext } from "react";

export interface SalonBrandingContextValue {
  logoDataUrl: string;
  setLogoDataUrl: (logoDataUrl: string) => void;
  bannerDataUrl: string;
  setBannerDataUrl: (bannerDataUrl: string) => void;
  queueUrl: string;
  setQueueUrl: (queueUrl: string) => void;
}

export const SalonBrandingContext = createContext<SalonBrandingContextValue | null>(null);

export function useSalonBranding() {
  const branding = useContext(SalonBrandingContext);
  if (!branding) throw new Error("useSalonBranding must be used inside BrandThemeLoader.");
  return branding;
}
