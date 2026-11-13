import { useEffect, useState } from "react";
import { apiRequest } from "@/shared/lib/apiClient";
import { isValidSalonHours, type SalonHours } from "@/shared/lib/salonHours";

export function useSalonHours() {
  const [salonHours, setSalonHours] = useState<SalonHours | null>(null);
  const [salonHoursError, setSalonHoursError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    apiRequest<SalonHours>("/api/catalog/hours")
      .then((hours) => {
        if (!isValidSalonHours(hours)) {
          throw new Error("The salon's business hours are invalid. Please contact the salon.");
        }
        if (active) setSalonHours(hours);
      })
      .catch((error: unknown) => {
        console.error("Salon hours load failed:", error);
        if (active) {
          setSalonHoursError(error instanceof Error ? error.message : "Unable to load salon business hours.");
        }
      });
    return () => {
      active = false;
    };
  }, []);

  return { salonHours, salonHoursError };
}
