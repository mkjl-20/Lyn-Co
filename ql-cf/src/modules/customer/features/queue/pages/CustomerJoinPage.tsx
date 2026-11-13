import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { Brush, ChevronLeft, ChevronRight, Droplets, Hand, LayoutGrid, Package, Palette, Percent, Scissors, Sparkles, UserRound, Wind, X } from "lucide-react";

import { fetchJoinCatalog, fetchPublicPromotions, fetchQueueWaitEstimate, fetchWaitQuote, joinQueue, type CatalogPackage, type PublicPromotion, type WaitQuote } from "../services/joinQueueService";
import { useSalonBranding } from "@/shared/context/SalonBrandingContext";
import { useAuth } from "@/shared/context/useAuth";
import { SalonLogoImage } from "@/shared/components/SalonLogoImage";
import { PortalAccountMenu } from "@/shared/components/PortalAccountMenu";
import { PhilippinePhoneInput } from "@/shared/components/PhilippinePhoneInput";
import { ApiError, apiRequest } from "@/shared/lib/apiClient";
import { supabaseClient } from "@/shared/lib/supabaseClient";
import { useSalonHours } from "@/shared/hooks/useSalonHours";
import { formatSalonTime, isAppointmentTimeWithinSalonHours, isAppointmentWithinSalonHours, lastAppointmentTime } from "@/shared/lib/salonHours";
import { formatTicketNumber } from "@/shared/lib/ticketNumber";
import { useFeedback } from "@/shared/components/FeedbackContext";

/* =========================================================
   TYPES
========================================================= */

interface Service {
  id: string;
  category: string | null;
  name: string;
  description: string | null;
  price: number;
  price_type: "fixed" | "starting";
  duration_minutes: number | null;
  is_visible: boolean;
  is_available: boolean;
  display_order: number;
}

interface Staff {
  id: string;
  full_name: string;
  staff_role: string | null;
  staff_role_label: string | null;
  service_lane: "hair" | "nails" | "other";
  account_role: "admin" | "staff";
  is_active: boolean;
}

interface WaitQuoteSelection {
  key: string;
  quote: WaitQuote | null;
  unavailable: boolean;
}

interface CustomerOfferSlide {
  id: string;
  title: string;
  description: string | null;
  image: string | null;
  category: string;
  offer: string | null;
  rules: string[];
}

// Priority is now independent from arrival mode — a VIP can walk in OR book
// an appointment, so "appointment" no longer lives in this list.
type CustomerType = "regular" | "senior" | "pwd";

type ArrivalType = "walk_in" | "appointment";

type ServicePreferences = Record<string, string>;

function customerServiceLane(category: string | null | undefined) {
  const normalized = (category ?? "").trim().toLowerCase();
  if (/hair|rebond|hairstyl|make[\s_-]?up|brows?|eyebrows?|lash/.test(normalized)) return "hair";
  if (/nail|mani|pedi|foot/.test(normalized)) return "nails";
  return "other";
}

function staffForService(service: Service, staff: Staff[]) {
  const lane = customerServiceLane(service.category);
  return staff.filter((member) => {
    if (member.staff_role === "receptionist") return false;
    if (member.account_role === "admin" && member.staff_role !== "hairstylist") return false;
    if (lane === "hair") return member.service_lane === "hair";
    if (lane === "nails") return member.service_lane === "nails";
    return true;
  });
}

function iconForServiceCategory(category: string) {
  const normalized = category.toLowerCase();
  if (normalized === "all") return LayoutGrid;
  if (normalized === "promotions" || normalized === "sales") return Percent;
  if (normalized === "packages") return Package;
  if (normalized.includes("color")) return Palette;
  if (normalized.includes("straight")) return Wind;
  if (normalized.includes("hand") || normalized.includes("foot") || normalized.includes("nail")) return Hand;
  if (normalized.includes("make up") || normalized.includes("makeup")) return Brush;
  if (normalized.includes("treatment") || normalized.includes("spa")) return Sparkles;
  if (normalized.includes("shampoo")) return Droplets;
  if (normalized.includes("care") || normalized.includes("hair")) return Scissors;
  return Sparkles;
}

/* =========================================================
   SHARED STYLES
   One place to tweak the look of every text field.
   - outline-none / ring-0 / shadow-none remove the extra thick focus ring
   - focus:border-sage-deep/50 makes the focus border lighter
========================================================= */

const fieldClass =
  "w-full rounded-lg border border-mist bg-porcelain/40 px-3 py-2.5 text-base text-ink transition " +
  "outline-none focus:outline-none focus:ring-0 focus:shadow-none focus:border-sage-deep/50";

const customerInfoFieldClass =
  "w-full rounded-lg border border-mist bg-porcelain/40 px-3 py-2.5 text-base text-ink transition " +
  "outline-none focus:outline-none focus:ring-0 focus:shadow-none focus:border-sage/60";
const MAX_REFERENCE_PHOTO_SIZE = 5 * 1024 * 1024;
const REFERENCE_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];

/* =========================================================
   COMPONENT
========================================================= */

export function CustomerJoinPage() {
  const { logoDataUrl, bannerDataUrl } = useSalonBranding();
  const { salonHours, salonHoursError } = useSalonHours();
  const { user, logout } = useAuth();
  const { notify } = useFeedback();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const joinSource = location.pathname === "/kiosk" || searchParams.get("source") === "kiosk"
    ? "kiosk"
    : "qr_mobile";
  const customerUser = user?.user_metadata?.account_role === "customer" ? user : null;

  async function handleCustomerSignOut() {
    await logout();
    navigate("/");
  }

  /* =======================================================
     CUSTOMER INFORMATION
  ======================================================= */

  const [customerName, setCustomerName] = useState("");
  const [contactNumber, setContactNumber] = useState("");
  const [savedAccountLoaded, setSavedAccountLoaded] = useState(false);
  const [accountLoadError, setAccountLoadError] = useState<string | null>(null);
  const [partyEnabled, setPartyEnabled] = useState(false);
  const [partyMembers, setPartyMembers] = useState<{
    customerName: string;
    serviceIds: string[];
    servicePreferences: ServicePreferences;
  }[]>([]);
  const [joinedParty, setJoinedParty] = useState<{
    id: string;
    entries: { id: string; customer_name: string; ticket_number: number; ewtMinutes: number | null }[];
  } | null>(null);

  /* =======================================================
     ARRIVAL TYPE (walk-in vs appointment)
  ======================================================= */

  const [arrivalType, setArrivalType] = useState<ArrivalType>("walk_in");
  const [appointmentDate, setAppointmentDate] = useState(""); // "YYYY-MM-DD"
  const [appointmentTime, setAppointmentTime] = useState(""); // "HH:MM", 24h

  /* =======================================================
     SERVICES
  ======================================================= */

  const [services, setServices] = useState<Service[]>([]);
  const [packages, setPackages] = useState<CatalogPackage[]>([]);
  const [selectedPackageId, setSelectedPackageId] = useState("");
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);
  const [activeCategory, setActiveCategory] = useState("all");
  const [serviceSearch, setServiceSearch] = useState("");
  const [servicesLoading, setServicesLoading] = useState(true);
  const [waitQuoteSelection, setWaitQuoteSelection] = useState<WaitQuoteSelection | null>(null);
  const [promotions, setPromotions] = useState<PublicPromotion[]>([]);
  const [promotionLoadError, setPromotionLoadError] = useState(false);
  const [activeOfferSlide, setActiveOfferSlide] = useState(0);
  const offerSliderRef = useRef<HTMLDivElement>(null);
  const [privacyNoticeOpen, setPrivacyNoticeOpen] = useState(false);
  const [privacyConsent, setPrivacyConsent] = useState(false);
  const [marketingConsent, setMarketingConsent] = useState(false);
  const privacyDialogRef = useRef<HTMLElement>(null);
  const privacyConsentRef = useRef<HTMLInputElement>(null);

  /* =======================================================
     ADDITIONAL NOTES / ADD-ONS
  ======================================================= */

  const [additionalNotes, setAdditionalNotes] = useState("");
  const [referencePhotoDataUrl, setReferencePhotoDataUrl] = useState<string | null>(null);
  const [referencePhotoError, setReferencePhotoError] = useState<string | null>(null);

  /* =======================================================
     STAFF
  ======================================================= */

  const [staff, setStaff] = useState<Staff[]>([]);
  const [servicePreferences, setServicePreferences] = useState<ServicePreferences>({});
  const [staffLoading, setStaffLoading] = useState(true);

  /* =======================================================
     CUSTOMER TYPE (priority)
  ======================================================= */

  const [customerType, setCustomerType] = useState<CustomerType>("regular");

  /* =======================================================
     FORM STATE
  ======================================================= */

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    async function loadCustomerAccount() {
      if (joinSource === "kiosk" || !customerUser) return;
      const { data: { session } } = await supabaseClient.auth.getSession();
      if (!mounted || !session) return;
      try {
        const result = await apiRequest<{ account: { display_name: string; contact_number: string } }>("/api/customer/account");
        if (!mounted) return;
        setCustomerName(result.account.display_name);
        setContactNumber(result.account.contact_number);
        setSavedAccountLoaded(true);
      } catch (error) {
        if (!mounted || (error instanceof ApiError && [403, 404].includes(error.status))) return;
        console.error("Saved customer account load failed:", error);
        setAccountLoadError(error instanceof Error ? error.message : "Unable to load your saved customer details.");
      }
    }
    void loadCustomerAccount();
    return () => { mounted = false; };
  }, [customerUser, joinSource]);

  useEffect(() => {
    if (!privacyNoticeOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusFrame = window.requestAnimationFrame(() => {
      privacyDialogRef.current?.querySelector<HTMLButtonElement>("button[aria-label='Close privacy notice']")?.focus();
    });
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setPrivacyNoticeOpen(false);
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      window.removeEventListener("keydown", closeOnEscape);
      document.body.style.overflow = previousOverflow;
    };
  }, [privacyNoticeOpen]);

  /* =======================================================
     LOAD CATALOG (via Express application layer)
  ======================================================= */

  useEffect(() => {
    let mounted = true;

    async function loadCatalog() {
      setServicesLoading(true);
      setStaffLoading(true);

      try {
        const catalog = await fetchJoinCatalog();
        if (!mounted) return;
        setServices(catalog.services as Service[]);
        setPackages(catalog.packages);
        setStaff(catalog.staff as Staff[]);
      } catch (error) {
        console.error("Catalog loading error:", error);
        if (!mounted) return;
        setServices([]);
        setPackages([]);
        setStaff([]);
        setErrorMessage("Unable to load available services. Please try again.");
      }

      setServicesLoading(false);
      setStaffLoading(false);
    }

    loadCatalog();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    fetchPublicPromotions()
      .then(({ promotions: activePromotions }) => {
        if (mounted) setPromotions(activePromotions);
      })
      .catch((error) => {
        console.error("Promotion loading error:", error);
        if (mounted) setPromotionLoadError(true);
      });
    return () => {
      mounted = false;
    };
  }, []);

  /* =======================================================
     TOGGLE SERVICE
  ======================================================= */

  function toggleService(serviceId: string) {
    setSelectedPackageId("");
    setSelectedServiceIds((current) => {
      if (current.includes(serviceId)) {
        return current.filter((id) => id !== serviceId);
      }
      return [...current, serviceId];
    });
    setServicePreferences((current) => {
      if (!selectedServiceIds.includes(serviceId)) return current;
      return Object.fromEntries(Object.entries(current).filter(([id]) => id !== serviceId));
    });
  }

  function togglePartyMemberService(memberIndex: number, serviceId: string) {
    setPartyMembers((current) => current.map((member, index) => {
      if (index !== memberIndex) return member;
      const serviceIds = member.serviceIds.includes(serviceId)
        ? member.serviceIds.filter((id) => id !== serviceId)
        : [...member.serviceIds, serviceId];
      const servicePreferences = { ...member.servicePreferences };
      if (!serviceIds.includes(serviceId)) delete servicePreferences[serviceId];
      return { ...member, serviceIds, servicePreferences };
    }));
  }

  function selectPackage(packageItem: CatalogPackage) {
    if (partyEnabled) return;
    if (selectedPackageId === packageItem.id) {
      setSelectedPackageId("");
      setSelectedServiceIds([]);
      setServicePreferences({});
      return;
    }
    setSelectedPackageId(packageItem.id);
    setSelectedServiceIds(packageItem.service_package_items.flatMap((item) =>
      Array.from({ length: packageItem.package_type === "service_bundle" ? item.quantity : 1 }, () => item.service_id)
    ));
    setServicePreferences({});
  }

  /* =======================================================
     SELECTED SERVICES
  ======================================================= */

  const selectedServices = useMemo(() => {
    return services.filter((service) => selectedServiceIds.includes(service.id));
  }, [services, selectedServiceIds]);

  const selectedStaffId = selectedServiceIds[0] ? servicePreferences[selectedServiceIds[0]] ?? "" : "";
  const quoteSelectionKey = `${selectedServiceIds[0] ?? ""}:${selectedStaffId}`;
  const currentWaitQuoteSelection = waitQuoteSelection?.key === quoteSelectionKey
    ? waitQuoteSelection
    : null;
  const waitQuote = currentWaitQuoteSelection?.quote ?? null;
  const waitQuoteUnavailable = currentWaitQuoteSelection?.unavailable ?? false;
  const waitQuoteLoading = Boolean(selectedServiceIds[0]) && currentWaitQuoteSelection === null;

  useEffect(() => {
    const firstServiceId = selectedServiceIds[0];
    if (!firstServiceId) return;

    let active = true;
    const key = `${firstServiceId}:${selectedStaffId}`;

    const timer = window.setTimeout(() => {
      void fetchWaitQuote(firstServiceId, selectedStaffId || undefined)
        .then((quote) => {
          if (!active) return;
          setWaitQuoteSelection({
            key,
            quote: quote.minutes === null ? null : quote,
            unavailable: quote.minutes === null,
          });
        })
        .catch((error) => {
          console.error("Wait quote failed:", error);
          if (!active) return;
          setWaitQuoteSelection({ key, quote: null, unavailable: true });
        });
    }, 250);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [quoteSelectionKey, selectedServiceIds, selectedStaffId]);

  /* =======================================================
     TOTAL PRICE / DURATION
  ======================================================= */

  const totalPrice = useMemo(() => {
    const selectedPackage = packages.find((packageItem) => packageItem.id === selectedPackageId);
    if (selectedPackage) return Number(selectedPackage.price);
    return selectedServices.reduce((total, service) => total + Number(service.price || 0), 0);
  }, [packages, selectedPackageId, selectedServices]);

  const bestPromotion = useMemo(() => {
    if (selectedServices.length === 0) return null;
    const bookingServiceIds = selectedServices.map((service) => service.id);
    return promotions.reduce<{ promotion: PublicPromotion; discount: number } | null>((best, promotion) => {
      if (promotion.exclude_packages && selectedPackageId) return best;
      if (promotion.eligible_service_ids.length > 0
        && bookingServiceIds.some((serviceId) => !promotion.eligible_service_ids.includes(serviceId))) return best;
      if (promotion.minimum_spend !== null && totalPrice < Number(promotion.minimum_spend)) return best;
      if (promotion.one_per_customer && !contactNumber.trim()) return best;
      const discount = Math.min(
        totalPrice,
        Number(promotion.maximum_discount ?? Number.POSITIVE_INFINITY),
        Math.round((promotion.discount_type === "percent"
          ? totalPrice * Number(promotion.discount_value) / 100
          : Number(promotion.discount_value)) * 100) / 100,
      );
      return !best || discount > best.discount ? { promotion, discount } : best;
    }, null);
  }, [contactNumber, promotions, selectedPackageId, selectedServices, totalPrice]);
  const applicablePromotion = partyEnabled ? null : bestPromotion;

  const offerSlides = useMemo<CustomerOfferSlide[]>(() => [
    {
      id: "default",
      title: "Your moment starts here.",
      description: "Choose your service and we’ll take it from here.",
      image: bannerDataUrl || null,
      category: "Welcome",
      offer: null,
      rules: [],
    },
    ...packages.map((packageItem) => ({
      id: `package-${packageItem.id}`,
      title: packageItem.title,
      description: packageItem.description,
      image: packageItem.image_data_url,
      category: "Packages",
      offer: formatCurrency(Number(packageItem.price)),
      rules: [],
    })),
  ], [bannerDataUrl, packages]);

  const currentOfferSlide = Math.min(activeOfferSlide, Math.max(0, offerSlides.length - 1));

  const scrollToOffer = useCallback((index: number, behavior: ScrollBehavior = "smooth") => {
    const slider = offerSliderRef.current;
    const slide = slider?.children.item(index);
    if (!slider || !(slide instanceof HTMLElement)) return;
    const left = slide.getBoundingClientRect().left - slider.getBoundingClientRect().left + slider.scrollLeft;
    slider.scrollTo({ left, behavior });
  }, []);

  useEffect(() => {
    if (offerSlides.length < 2) return;
    const timer = window.setInterval(() => {
      const next = (activeOfferSlide + 1) % offerSlides.length;
      setActiveOfferSlide(next);
      scrollToOffer(next);
    }, 6000);
    return () => window.clearInterval(timer);
  }, [activeOfferSlide, offerSlides.length, scrollToOffer]);

  const totalDuration = useMemo(() => {
    if (selectedServices.some((service) => service.duration_minutes === null)) return null;
    return selectedServices.reduce(
      (total, service) => total + Number(service.duration_minutes),
      0
    );
  }, [selectedServices]);

  const serviceCategories = useMemo(
    () => {
      const offerCategories = [...new Set(promotions.map((promotion) =>
        promotion.discount_type === "percent" ? "Promotions" : "Sales"
      ))];
      return [
        ...offerCategories,
        ...(packages.length > 0 ? ["Packages"] : []),
        ...new Set(services.map((service) => service.category || "Services")),
      ];
    },
    [packages.length, promotions, services]
  );

  const visibleServices = services.filter((service) => {
    if (["Promotions", "Sales", "Packages"].includes(activeCategory)) return false;
    const matchesCategory = activeCategory === "all"
      || (service.category || "Services") === activeCategory;
    const query = serviceSearch.trim().toLocaleLowerCase();
    const matchesSearch = !query
      || `${service.name} ${service.description ?? ""}`.toLocaleLowerCase().includes(query);
    return matchesCategory && matchesSearch;
  });
  const availablePartyServices = visibleServices.filter((service) => service.is_visible && service.is_available);

  function addOfferToVisit(slideId: string) {
    if (partyEnabled) {
      document.getElementById("booking")?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }

    if (slideId === "default") {
      document.getElementById("booking")?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }

    if (slideId.startsWith("package-")) {
      const packageItem = packages.find((item) => `package-${item.id}` === slideId);
      if (packageItem) {
        selectPackage(packageItem);
        setActiveCategory("Packages");
        document.getElementById("booking")?.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }
    }
    document.getElementById("booking")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  /* =======================================================
     FORMATTERS
  ======================================================= */

  function formatCurrency(value: number) {
    return new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(value);
  }

  function localDateString(date: Date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function isPastAppointment(date: string, time: string) {
    const scheduled = new Date(`${date}T${time}:00`);
    return !Number.isNaN(scheduled.getTime()) && scheduled.getTime() <= Date.now();
  }

  function formatServicePrice(service: Service) {
    return formatCurrency(Number(service.price || 0));
  }

  function formatDuration(minutes: number | null) {
    if (minutes === null) return "Duration not set";
    if (minutes <= 0) return "—";
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    if (remainingMinutes === 0) return `${hours} hr${hours > 1 ? "s" : ""}`;
    return `${hours} hr${hours > 1 ? "s" : ""} ${remainingMinutes} min`;
  }

  /* =======================================================
     SUBMIT
  ======================================================= */

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setErrorMessage(null);
    setSuccessMessage(null);

    const cleanName = customerName.trim();
    const cleanContact = contactNumber.trim();
    const cleanNotes = additionalNotes.trim();

    if (cleanContact && !/^09\d{9}$/.test(cleanContact)) {
      setErrorMessage("Enter a valid Philippine mobile number: 11 digits starting with 09.");
      return;
    }

    if (!cleanName) {
      setErrorMessage("Please enter your name.");
      return;
    }

    if (!cleanContact) {
      setErrorMessage("Enter a mobile number so you can receive queue updates.");
      return;
    }

    if (!privacyConsent) {
      setErrorMessage("Please agree to the privacy notice before joining the queue.");
      privacyConsentRef.current?.focus();
      return;
    }

    if (selectedServiceIds.length === 0) {
      setErrorMessage(partyEnabled
        ? "Select at least one service for Member 1 (you) and each party member."
        : "Please select at least one service.");
      return;
    }

    if (selectedServices.length === 0) {
      setErrorMessage("The selected services are no longer available.");
      return;
    }

    if (partyEnabled) {
      if (partyMembers.length === 0 || partyMembers.length > 7) {
        setErrorMessage("A party must include between 2 and 8 members.");
        return;
      }
      const invalidMember = partyMembers.find((member) =>
        !member.customerName.trim()
        || member.customerName.trim().length > 100
        || member.serviceIds.length === 0
        || member.serviceIds.some((serviceId) => !services.some((service) => service.id === serviceId && service.is_visible && service.is_available))
      );
      if (invalidMember) {
        setErrorMessage("Enter each party member's name and choose at least one available service for them.");
        return;
      }
    }

    if (arrivalType === "appointment") {
      if (!appointmentDate || !appointmentTime) {
        notify("error", "Please select an appointment date and time.");
        return;
      }

      const scheduled = new Date(`${appointmentDate}T${appointmentTime}:00`);

      if (Number.isNaN(scheduled.getTime())) {
        notify("error", "Invalid appointment date or time.");
        return;
      }

      if (scheduled.getTime() <= Date.now()) {
        notify("error", "That appointment time has already passed. Choose a future time.");
        return;
      }

      if (!salonHours) {
        notify("error", salonHoursError ?? "Salon business hours are still loading. Please try again.");
        return;
      }

      if (!isAppointmentWithinSalonHours(`${appointmentDate}T${appointmentTime}`, salonHours)) {
        notify("error", `Appointments must start during salon hours (${formatSalonTime(salonHours.openingTime)}–${formatSalonTime(salonHours.closingTime)}).`);
        return;
      }
    }

    setIsSubmitting(true);

    try {
      const appointmentAt =
        arrivalType === "appointment" && appointmentDate && appointmentTime
          ? `${appointmentDate}T${appointmentTime}:00`
          : null;

      const result = await joinQueue({
        customerName: cleanName,
        contactNumber: cleanContact,
        additionalNotes: cleanNotes,
        ...(referencePhotoDataUrl ? { referencePhotoDataUrl } : {}),
        preferredStaffId: selectedStaffId,
        servicePreferences: Object.entries(servicePreferences)
          .filter(([serviceId, staffId]) => selectedServiceIds.includes(serviceId) && Boolean(staffId))
          .map(([serviceId, staffId]) => ({ serviceId, staffId })),
        serviceIds: selectedServiceIds,
        packageId: selectedPackageId || null,
        promotionId: partyEnabled ? null : bestPromotion?.promotion.id ?? null,
        arrivalType,
        priorityType: customerType,
        appointmentAt,
        source: joinSource,
        privacyConsent,
        marketingConsent,
        ...(partyEnabled ? {
          partyMembers: partyMembers.map((member) => ({
            customerName: member.customerName.trim(),
            serviceIds: member.serviceIds,
            servicePreferences: Object.entries(member.servicePreferences)
              .filter(([serviceId, staffId]) => member.serviceIds.includes(serviceId) && Boolean(staffId))
              .map(([serviceId, staffId]) => ({ serviceId, staffId })),
          })),
        } : {}),
      });

      if (result.party) {
        const partyId = result.party.id;
        const entries = result.party.entries.map(({ id, customer_name, ticket_number }) => ({
          id,
          customer_name,
          ticket_number,
          ewtMinutes: null as number | null,
        }));
        setJoinedParty({
          id: partyId,
          entries,
        });
        setSuccessMessage("Your party has joined the queue. Each member has a separate ticket.");
        void Promise.all(entries.map(async (entry) => {
          try {
            const { wait } = await fetchQueueWaitEstimate(entry.id);
            return { id: entry.id, ewtMinutes: wait.ewtMinutes };
          } catch (error) {
            console.error(`Party queue estimate failed for ${entry.id}:`, error);
            return { id: entry.id, ewtMinutes: null };
          }
        })).then((estimates) => {
          setJoinedParty((current) => {
            if (!current || current.id !== partyId) return current;
            return {
              ...current,
              entries: current.entries.map((entry) => ({
                ...entry,
                ewtMinutes: estimates.find((estimate) => estimate.id === entry.id)?.ewtMinutes ?? null,
              })),
            };
          });
        });
        return;
      }

      setSuccessMessage(
        arrivalType === "appointment"
          ? "Your appointment has been booked."
          : "You have successfully joined the queue."
      );

      navigate(joinSource === "kiosk"
        ? `/kiosk/queue-status/${result.entry.id}`
        : `/queue-status/${result.entry.id}`);
    } catch (error) {
      console.error("Join queue failed:", error);
      const message = error instanceof Error ? error.message : "Unable to join the queue.";
      if (arrivalType === "appointment") notify("error", message);
      else setErrorMessage(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  /* =========================================================
     UI
  ========================================================= */

  return (
    <div className="customer-gradient-page min-h-screen text-ink">
      <header className="sticky top-0 z-30 border-b border-mist/80 bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex min-h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <a href="/" className="flex items-center gap-2 font-display text-xl font-semibold text-ink">
            {logoDataUrl && <SalonLogoImage src={logoDataUrl} alt="" className="h-9 w-9 rounded-lg object-contain" />}
            Lyn &amp; Co
          </a>
          <nav className="flex items-center gap-1">
            {customerUser ? (
              <PortalAccountMenu
                fullName={String(customerUser.user_metadata.full_name ?? customerUser.email?.split("@")[0] ?? "Customer")}
                identifier={customerUser.email ?? "Customer account"}
                roleLabel="Customer"
                isActive
                accountHref="/customer-account"
                onSignOut={handleCustomerSignOut}
              />
            ) : (
              <a href="/customer-account" aria-label="Customer registration or sign in" title="Register / Sign in" className="dashboard-icon-control inline-flex min-h-11 min-w-11 items-center justify-center gap-2 px-3 text-sm font-semibold text-sage-deep hover:text-ink sm:text-base">
                <UserRound size={20} aria-hidden="true" />
                <span className="hidden sm:inline">Register / Sign in</span>
              </a>
            )}
          </nav>
        </div>
      </header>

      <section className="customer-banner relative isolate overflow-hidden text-white">
        <div className="relative">
          {offerSlides.length > 0 ? (
            <div className="relative">
              <div
                ref={offerSliderRef}
                onScroll={(event) => {
                  const slider = event.currentTarget;
                  const slides = Array.from(slider.children);
                  const currentLeft = slider.getBoundingClientRect().left;
                  const nextIndex = slides.reduce((closestIndex, slide, index) => {
                    const distance = Math.abs(slide.getBoundingClientRect().left - currentLeft);
                    const closestDistance = Math.abs(slides[closestIndex].getBoundingClientRect().left - currentLeft);
                    return distance < closestDistance ? index : closestIndex;
                  }, 0);
                  setActiveOfferSlide(nextIndex);
                }}
                className="flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                aria-label="Welcome and service packages"
              >
                {offerSlides.map((slide) => (
                  <article key={slide.id} className={`customer-banner-slide relative min-h-[25rem] w-full shrink-0 snap-start sm:min-h-[19rem] ${slide.image ? "has-photo" : ""}`}>
                    {slide.image && <img src={slide.image} alt="" aria-hidden="true" className="customer-banner-background" />}
                    <div className="customer-banner-copy flex min-h-[25rem] flex-col items-start justify-center px-6 pb-10 pt-6 sm:min-h-[19rem] sm:px-10 sm:py-6 sm:pl-10 sm:pr-14">
                      <h1 className="customer-banner-title mt-3 max-w-xl font-display text-4xl font-medium leading-[1.05] text-white sm:text-5xl">
                        {slide.title}
                      </h1>
                      {slide.offer && <p className="mt-3 text-sm font-semibold text-white">{slide.offer}</p>}
                      {slide.description && <p className="mt-3 max-w-md text-sm leading-relaxed text-white/85 sm:text-base">{slide.description}</p>}
                      {slide.rules.length > 0 && <p className="mt-2 max-w-md text-xs font-medium text-white/75">{slide.rules.join(" · ")}</p>}
                      <button
                        type="button"
                        onClick={() => addOfferToVisit(slide.id)}
                        className="customer-banner-action mt-5 inline-flex min-h-11 items-center px-5 text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                      >
                        {slide.id === "default" ? "Choose a service" : "Add to my visit"}
                      </button>
                    </div>
                  </article>
                ))}
              </div>
              {offerSlides.length > 1 && (
                <>
                  <button
                    type="button"
                    aria-label="Previous banner"
                    onClick={() => scrollToOffer((currentOfferSlide - 1 + offerSlides.length) % offerSlides.length)}
                    className="customer-banner-arrow left-3"
                  >
                    <ChevronLeft size={24} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    aria-label="Next banner"
                    onClick={() => scrollToOffer((currentOfferSlide + 1) % offerSlides.length)}
                    className="customer-banner-arrow right-3"
                  >
                    <ChevronRight size={24} aria-hidden="true" />
                  </button>
                  <div className="customer-banner-dots" role="group" aria-label="Choose banner slide">
                  {offerSlides.map((slide, index) => (
                    <button
                      key={slide.id}
                      type="button"
                      onClick={() => {
                        scrollToOffer(index);
                        setActiveOfferSlide(index);
                      }}
                      aria-label={`Show slide ${index + 1} of ${offerSlides.length}: ${slide.title}`}
                      aria-current={currentOfferSlide === index ? "true" : undefined}
                      className={`h-2.5 w-2.5 rounded-full transition-all ${currentOfferSlide === index ? "scale-110 bg-white" : "bg-white/45 hover:bg-white/75"}`}
                    />
                  ))}
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="customer-banner-copy flex min-h-64 flex-col items-start justify-center px-6 py-8">
              <h1 className="customer-banner-title mt-3 font-display text-4xl font-medium text-white">Your moment starts here.</h1>
              <p className="mt-3 text-sm text-white/85">Choose your service and we’ll take it from here.</p>
              <button type="button" onClick={() => addOfferToVisit("default")} className="customer-banner-action mt-5 inline-flex min-h-11 items-center px-5 text-sm font-semibold text-white">Choose a service</button>
            </div>
          )}
          {promotionLoadError && (
            <p role="status" className="mt-2 text-xs text-ink/70">Promotions are temporarily unavailable.</p>
          )}
        </div>
      </section>

      <main className="mx-auto max-w-7xl px-3 pb-6 pt-4 sm:px-6 sm:pb-12 sm:pt-8 lg:px-8">

        <form id="booking" onSubmit={handleSubmit} className="customer-booking-form grid items-start gap-3 sm:gap-4 lg:grid-cols-[minmax(0,1fr)_320px] xl:gap-6" aria-busy={isSubmitting}>
          <div className="min-w-0 space-y-4 sm:space-y-6">
            {errorMessage && (
              <div role="alert" className="dashboard-error-message">{errorMessage}</div>
            )}
            {successMessage && (
              <div role="status" className="border border-success/30 bg-success-soft px-4 py-3 text-sm text-success">{successMessage}</div>
            )}
            {joinedParty && (
              <section className="border border-success/30 bg-success-soft p-4" aria-label="Party queue tickets">
                <h2 className="font-semibold text-success">Party tickets</h2>
                <ul className="mt-2 space-y-2 text-sm text-ink">
                  {joinedParty.entries.map((entry) => (
                    <li key={entry.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                      <span>{entry.customer_name} · {formatTicketNumber(entry.ticket_number)}</span>
                      <span className="text-xs text-ink/60">
                        {entry.ewtMinutes === null ? "Wait estimate updating" : `About ${Math.round(entry.ewtMinutes / 5) * 5} min`}
                      </span>
                      <a
                        className="font-semibold text-sage-deep underline underline-offset-2"
                        href={`${joinSource === "kiosk" ? "/kiosk/queue-status" : "/queue-status"}/${entry.id}`}
                      >
                        View
                      </a>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section className="border-b border-mist pb-6">
              <h2 className="font-display text-xl font-semibold sm:text-2xl">Visit type</h2>
              <div className="mt-4 grid grid-cols-2 gap-2" role="group" aria-label="Visit type">
                <button
                  type="button"
                  onClick={() => setArrivalType("walk_in")}
                  aria-pressed={arrivalType === "walk_in"}
                  className={`min-h-11 rounded-md border px-3 text-sm font-semibold sm:min-h-12 sm:text-base ${arrivalType === "walk_in" ? "border-sage-deep bg-sage-deep text-white" : "border-mist bg-white text-ink/75 hover:border-sage-deep"}`}
                >Walk-in</button>
                <button
                  type="button"
                  onClick={() => setArrivalType("appointment")}
                  aria-pressed={arrivalType === "appointment"}
                  className={`min-h-11 rounded-md border px-3 text-sm font-semibold sm:min-h-12 sm:text-base ${arrivalType === "appointment" ? "border-sage-deep bg-sage-deep text-white" : "border-mist bg-white text-ink/75 hover:border-sage-deep"}`}
                >Appointment</button>
              </div>
              {arrivalType === "appointment" && (
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <label htmlFor="appointment-date" className="block text-sm font-semibold text-ink/80">Date
                    <input
                      id="appointment-date"
                      type="date"
                      value={appointmentDate}
                      onChange={(event) => {
                        const nextDate = event.target.value;
                        setAppointmentDate(nextDate);
                        setErrorMessage(null);
                        if (appointmentTime && isPastAppointment(nextDate, appointmentTime)) {
                          setAppointmentTime("");
                          notify("error", "That appointment time has already passed. Choose a future time.");
                        }
                      }}
                      min={localDateString(new Date())}
                      required
                      className="dashboard-filter-control mt-1.5 w-full focus:border-sage-deep"
                    />
                  </label>
                  <label htmlFor="appointment-time" className="block text-sm font-semibold text-ink/80">Time
                    <input
                      id="appointment-time"
                      type="time"
                      value={appointmentTime}
                      onChange={(event) => {
                        const nextTime = event.target.value;
                        if (nextTime && salonHours && !isAppointmentTimeWithinSalonHours(nextTime, salonHours)) {
                          setAppointmentTime("");
                          notify("error", `Choose a time during salon hours (${formatSalonTime(salonHours.openingTime)}–${formatSalonTime(salonHours.closingTime)}).`);
                          return;
                        }
                        if (nextTime && appointmentDate && isPastAppointment(appointmentDate, nextTime)) {
                          setAppointmentTime("");
                          notify("error", "That appointment time has already passed. Choose a future time.");
                          return;
                        }
                        setAppointmentTime(nextTime);
                        setErrorMessage(null);
                      }}
                      min={salonHours?.openingTime}
                      max={salonHours ? lastAppointmentTime(salonHours.closingTime) : undefined}
                      disabled={!salonHours}
                      required
                      className="dashboard-filter-control mt-1.5 w-full focus:border-sage-deep"
                    />
                  </label>
                  {salonHoursError
                    ? <p role="alert" className="dashboard-error-message sm:col-span-2">Unable to verify appointment times: {salonHoursError}</p>
                    : salonHours
                      ? <p className="text-sm text-ink/65 sm:col-span-2">Appointments must start during salon hours ({formatSalonTime(salonHours.openingTime)}–{formatSalonTime(salonHours.closingTime)}).</p>
                      : <p role="status" className="text-sm text-ink/65 sm:col-span-2">Loading salon hours…</p>}
                </div>
              )}
            </section>

            <section className="customer-details-card">
              <div className="mb-4 flex items-end justify-between gap-3">
                <h2 className="font-display text-xl font-semibold sm:text-2xl">Your details</h2>
              </div>
              {accountLoadError && <p role="status" className="mb-3 text-sm text-clay">{accountLoadError}</p>}
              {savedAccountLoaded && <p className="mb-3 text-sm text-sage-deep">Your saved account details will be attached to this visit.</p>}
              <div className="grid gap-3 sm:grid-cols-2">
                <label htmlFor="customer-name" className="text-sm font-semibold text-ink/80">
                  Name
                  <input
                    id="customer-name"
                    type="text"
                    value={customerName}
                    onChange={(event) => setCustomerName(event.target.value)}
                    readOnly={savedAccountLoaded}
                    placeholder="Your name"
                    autoComplete="name"
                    maxLength={100}
                    required
                    className={`${customerInfoFieldClass} mt-1.5 border-mist bg-white text-ink focus:border-sage-deep`}
                  />
                </label>
                <label htmlFor="contact-number" className="text-sm font-semibold text-ink/80">
                  Mobile number
                  <PhilippinePhoneInput
                    id="contact-number"
                    value={contactNumber}
                    onChange={setContactNumber}
                    readOnly={savedAccountLoaded}
                    required
                    className="mt-1.5"
                  />
                </label>
              </div>
            </section>

            <section className="border-b border-mist pb-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="font-display text-xl font-semibold sm:text-2xl">Joining as a party?</h2>
                  <p className="mt-1 text-sm text-ink/60">Member 1 is you; select your service below. Each added member gets a separate ticket and service selection.</p>
                </div>
                <button
                  type="button"
                  aria-pressed={partyEnabled}
                  onClick={() => {
                    const enableParty = !partyEnabled;
                    setPartyEnabled(enableParty);
                    if (enableParty) {
                      setPartyMembers((members) => members.length > 0 ? members : [{ customerName: "", serviceIds: [], servicePreferences: {} }]);
                      setSelectedPackageId("");
                      setActiveCategory("all");
                    }
                    setJoinedParty(null);
                  }}
                  className={`min-h-11 rounded-md border px-4 text-sm font-semibold ${partyEnabled ? "border-sage-deep bg-sage-deep text-white" : "border-mist bg-white text-ink/75 hover:border-sage-deep"}`}
                >
                  {partyEnabled ? "Party join on" : "Add party members"}
                </button>
              </div>
              {partyEnabled && (
                <div className="mt-4 space-y-4">
                  <p className="text-sm text-ink/65">Select at least one service for yourself and every added member. Each gets a separate ticket; SMS goes to your mobile number. Add up to 7 members.</p>
                  {partyMembers.map((member, memberIndex) => (
                    <fieldset key={memberIndex} aria-labelledby={`party-member-${memberIndex}`} className="rounded-2xl border border-mist bg-white p-4 shadow-sm sm:p-5">
                      <div className="flex items-center justify-between gap-3">
                        <span id={`party-member-${memberIndex}`} className="font-display text-lg font-semibold text-ink">Member {memberIndex + 2}</span>
                        <button
                          type="button"
                          aria-label={`Remove member ${memberIndex + 2}`}
                          onClick={() => setPartyMembers((members) => members.filter((_, index) => index !== memberIndex))}
                          className="ui-action-danger min-h-9 rounded-md px-2 text-sm font-semibold"
                        >
                          Remove
                        </button>
                      </div>
                      <label className="mt-2 block text-sm font-semibold text-ink/80">
                        Name
                        <input
                          type="text"
                          value={member.customerName}
                          onChange={(event) => setPartyMembers((members) => members.map((item, index) =>
                            index === memberIndex ? { ...item, customerName: event.target.value } : item
                          ))}
                          maxLength={100}
                          required
                          className={`${customerInfoFieldClass} mt-1.5 border-mist bg-white text-ink focus:border-sage-deep`}
                        />
                      </label>
                      <div className="mt-3">
                        <div className="flex items-end justify-between gap-3">
                          <h3 className="font-display text-xl font-semibold sm:text-2xl">Services</h3>
                          {member.serviceIds.length > 0 && <span className="text-xs font-semibold text-sage-deep">{member.serviceIds.length} selected</span>}
                        </div>
                        {servicesLoading ? (
                          <p className="py-8 text-sm text-ink/55" role="status">Loading services…</p>
                        ) : availablePartyServices.length === 0 ? (
                          <p className="py-8 text-sm text-ink/55">No matching services. Try another search or category.</p>
                        ) : (
                          <div className="mt-2 max-h-96 overflow-y-auto overscroll-contain px-1 py-1 pr-2">
                            <div className="grid gap-3 sm:grid-cols-2">
                              {availablePartyServices.map((service) => {
                                const selected = member.serviceIds.includes(service.id);
                                return (
                                  <button
                                    key={service.id}
                                    type="button"
                                    onClick={() => togglePartyMemberService(memberIndex, service.id)}
                                    aria-pressed={selected}
                                    className={`flex min-h-16 w-full items-center gap-2 rounded-lg border px-2.5 py-2.5 text-left transition sm:min-h-[76px] sm:gap-3 sm:px-3 sm:py-3 ${selected ? "border-sage-deep bg-sage-light" : "border-mist bg-white hover:border-sage/70 hover:bg-sage-light/40"}`}
                                  >
                                    <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border text-xs ${selected ? "border-sage-deep bg-sage-deep text-white" : "border-mist text-transparent"}`} aria-hidden="true">✓</span>
                                    <span className="min-w-0 flex-1">
                                      <span className="block text-sm font-semibold text-ink">{service.name}</span>
                                      <span className="mt-1 block text-sm text-ink/65">{formatDuration(service.duration_minutes)}</span>
                                    </span>
                                    <span className="shrink-0 text-sm font-semibold text-sage-deep">{formatServicePrice(service)}</span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                      {member.serviceIds.length > 0 && (
                        <div className="mt-4 rounded-xl bg-sage-light/60 p-3 sm:p-4">
                          <h4 className="text-sm font-semibold text-ink">Stylist preferences</h4>
                          <p className="mt-1 text-xs text-ink/60">Choose staff qualified for the service.</p>
                          <div className="mt-3 grid gap-3 sm:grid-cols-2">
                            {services.filter((service) => member.serviceIds.includes(service.id)).map((service) => {
                              const eligibleStaff = staffForService(service, staff);
                              return (
                                <label key={service.id} className="block text-xs font-semibold text-ink/75">
                                  {service.name}
                                  <select
                                    value={member.servicePreferences[service.id] ?? ""}
                                    onChange={(event) => setPartyMembers((members) => members.map((item, index) =>
                                      index === memberIndex
                                        ? {
                                          ...item,
                                          servicePreferences: {
                                            ...item.servicePreferences,
                                            ...(event.target.value
                                              ? { [service.id]: event.target.value }
                                              : Object.fromEntries(Object.entries(item.servicePreferences).filter(([id]) => id !== service.id))),
                                          },
                                        }
                                        : item
                                    ))}
                                    className="dashboard-filter-control mt-1.5 w-full text-sm"
                                  >
                                    <option value="">Any available specialist</option>
                                    {eligibleStaff.map((specialist) => (
                                      <option key={specialist.id} value={specialist.id}>
                                        {specialist.full_name} · {specialist.staff_role_label ?? "Specialist"}
                                      </option>
                                    ))}
                                  </select>
                                  {eligibleStaff.length === 0 && (
                                    <span className="mt-1 block font-normal text-ink/50">No matching specialist is listed; the salon team will assign one.</span>
                                  )}
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </fieldset>
                  ))}
                  {partyMembers.length < 7 && (
                    <button
                      type="button"
                      onClick={() => setPartyMembers((members) => [...members, { customerName: "", serviceIds: [], servicePreferences: {} }])}
                      className="min-h-11 rounded-md border border-sage-deep px-4 text-sm font-semibold text-sage-deep hover:bg-sage-light"
                    >
                      Add another member
                    </button>
                  )}
                </div>
              )}
            </section>

            <section className="border-b border-mist pb-6">
              <div className="flex items-end justify-between gap-3">
                <div>
                  <h2 className="font-display text-xl font-semibold sm:text-2xl">{partyEnabled ? "Member 1 (you): services" : "Services"}</h2>
                </div>
                {selectedServiceIds.length > 0 && <span className="text-xs font-semibold text-sage-deep">{selectedServiceIds.length} selected</span>}
              </div>

                <label htmlFor="service-search" className="mt-4 block text-sm font-semibold text-ink/80">
                Find a service
                <div className="relative mt-1.5">
                  <input
                    id="service-search"
                    type="search"
                    value={serviceSearch}
                    onChange={(event) => setServiceSearch(event.target.value)}
                    placeholder="Search services"
                    className="dashboard-filter-control w-full pr-10 font-normal outline-none placeholder:text-ink/50 focus:border-sage-deep"
                  />
                  {serviceSearch && (
                    <button
                      type="button"
                      onClick={() => setServiceSearch("")}
                      aria-label="Clear service search"
                      className="dashboard-icon-control absolute right-1 top-1 flex h-9 w-9 items-center justify-center text-lg text-ink/50 transition-colors hover:text-sage-deep"
                    >
                      ×
                    </button>
                  )}
                </div>
              </label>

              <div id="service-categories" className="mt-5 scroll-mt-5 grid grid-cols-4 gap-x-2 gap-y-4 sm:grid-cols-5 md:grid-cols-7" role="group" aria-label="Browse services, promotions, sales, and packages">
                {["all", ...serviceCategories].map((category) => {
                  if (partyEnabled && ["Promotions", "Sales", "Packages"].includes(category)) return null;
                  const selected = activeCategory === category;
                  const Icon = iconForServiceCategory(category);
                  const label = category === "all" ? "All services" : category;
                  return (
                    <button
                      key={category}
                      type="button"
                      onClick={() => setActiveCategory(category)}
                      aria-pressed={selected}
                      aria-label={`${label}${selected ? ", selected" : ""}`}
                      className="group flex min-h-20 min-w-0 flex-col items-center gap-1.5 rounded-lg px-1 py-1 text-center sm:min-h-24 sm:gap-2"
                    >
                      <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors sm:h-14 sm:w-14 ${selected ? "bg-sage-deep text-white" : "bg-sage-light text-sage-deep group-hover:bg-clay-light"}`}>
                        <Icon size={22} strokeWidth={1.8} aria-hidden="true" />
                      </span>
                      <span className={`max-w-full text-center text-sm leading-tight ${selected ? "font-bold text-sage-deep" : "font-medium text-ink/80"}`}>
                        {label}
                      </span>
                    </button>
                  );
                })}
              </div>

              {activeCategory === "Promotions" || activeCategory === "Sales" ? (
                <div className="mt-5 grid gap-3 sm:grid-cols-2" aria-label={`Current ${activeCategory.toLowerCase()}`}>
                  {promotions.filter((promotion) =>
                    activeCategory === "Promotions"
                      ? promotion.discount_type === "percent"
                      : promotion.discount_type === "fixed"
                  ).map((promotion) => (
                    <article key={promotion.id} className="overflow-hidden rounded-xl border border-sage/30 bg-white">
                      {promotion.image_data_url && <img src={promotion.image_data_url} alt="" className="h-40 w-full object-cover" />}
                      <div className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <h3 className="font-semibold text-ink">{promotion.title}</h3>
                        <span className="shrink-0 rounded-full bg-sage-light px-2.5 py-1 text-xs font-bold text-sage-deep">
                          {promotion.discount_type === "percent"
                            ? `${promotion.discount_value}% off`
                            : `${formatCurrency(Number(promotion.discount_value))} off`}
                        </span>
                      </div>
                      {promotion.description && <p className="mt-2 text-sm text-ink/65">{promotion.description}</p>}
                      {(promotion.eligible_service_ids.length > 0 || promotion.minimum_spend !== null || promotion.maximum_discount !== null || promotion.one_per_customer || promotion.exclude_packages) && (
                        <p className="mt-2 text-xs text-ink/50">
                          {[
                            promotion.eligible_service_ids.length > 0 ? "All booked services must qualify" : null,
                            promotion.minimum_spend !== null ? `Minimum spend ${formatCurrency(Number(promotion.minimum_spend))}` : null,
                            promotion.maximum_discount !== null ? `Discount up to ${formatCurrency(Number(promotion.maximum_discount))}` : null,
                            promotion.usage_limit !== null ? "Limited uses" : null,
                            promotion.one_per_customer ? "One per customer" : null,
                            promotion.exclude_packages ? "Packages excluded" : null,
                          ].filter((rule): rule is string => Boolean(rule)).join(" · ")}
                        </p>
                      )}
                      </div>
                    </article>
                  ))}
                </div>
              ) : activeCategory === "Packages" ? (
                <div className="mt-5 space-y-3" aria-label="Service packages">
                  {packages.length === 0 ? (
                    <p className="py-8 text-sm text-ink/55">No packages available right now.</p>
                  ) : (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {packages.map((packageItem) => {
                      const selected = selectedPackageId === packageItem.id;
                      const includedServices = packageItem.service_package_items.map((item) => {
                        const service = item.services;
                        return `${item.quantity > 1 && packageItem.package_type === "service_bundle" ? `${item.quantity} × ` : ""}${service?.name ?? "Service"}`;
                      }).join(" · ");
                      return (
                        <button
                          key={packageItem.id}
                          type="button"
                          onClick={() => selectPackage(packageItem)}
                          aria-pressed={selected}
                          className={`min-h-20 overflow-hidden rounded-xl border text-left transition sm:min-h-28 ${selected ? "border-sage-deep bg-sage-light" : "border-mist bg-white hover:border-sage/70 hover:bg-sage-light/40"}`}
                        >
                            {packageItem.image_data_url && <img src={packageItem.image_data_url} alt="" className="h-36 w-full object-cover" />}
                            <span className="block p-3 sm:p-4">
                            <span className="flex items-start justify-between gap-3">
                            <span className="font-semibold text-ink">{packageItem.title}</span>
                            <span className="shrink-0 font-semibold text-sage-deep">{formatCurrency(Number(packageItem.price))}</span>
                          </span>
                          {packageItem.description && <span className="mt-1 block text-sm text-ink/65">{packageItem.description}</span>}
                          <span className="mt-2 block text-sm text-ink/65">
                            {packageItem.package_type === "prepaid_sessions" ? `${packageItem.sessions_count} prepaid sessions · ` : ""}
                            {includedServices}
                          </span>
                          {packageItem.package_type === "prepaid_sessions" && (
                            <span className="mt-1 block text-xs text-ink/50">Staff will confirm your available sessions when service begins.</span>
                          )}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  )}
                </div>
              ) : servicesLoading ? (
                <p className="py-8 text-sm text-ink/55" role="status">Loading services…</p>
              ) : visibleServices.length === 0 ? (
                <p className="py-8 text-sm text-ink/55">No matching services. Try another search or category.</p>
              ) : (
                <div className="mt-2 max-h-96 overflow-y-auto overscroll-contain px-1 py-1 pr-2">
                  <div className="grid gap-3 sm:grid-cols-2">
                  {visibleServices.map((service) => {
                    const selected = selectedServiceIds.includes(service.id);
                    return (
                      <button
                        key={service.id}
                        type="button"
                        onClick={() => toggleService(service.id)}
                        aria-pressed={selected}
                        className={`flex min-h-16 w-full items-center gap-2 rounded-lg border px-2.5 py-2.5 text-left transition sm:min-h-[76px] sm:gap-3 sm:px-3 sm:py-3 ${selected ? "border-sage-deep bg-sage-light" : "border-mist bg-white hover:border-sage/70 hover:bg-sage-light/40"}`}
                      >
                        <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border text-xs ${selected ? "border-sage-deep bg-sage-deep text-white" : "border-mist text-transparent"}`} aria-hidden="true">✓</span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-semibold text-ink">{service.name}</span>
                          <span className="mt-1 block text-sm text-ink/65">{formatDuration(service.duration_minutes)}</span>
                        </span>
                        <span className="shrink-0 text-sm font-semibold text-sage-deep">{formatServicePrice(service)}</span>
                      </button>
                    );
                  })}
                  </div>
                </div>
              )}
            </section>

            <section className="rounded-2xl border border-mist bg-white p-4 shadow-sm sm:p-5">
              <div className="flex flex-wrap items-end justify-between gap-2">
                <div>
                  <h2 className="font-display text-xl font-semibold sm:text-2xl">Stylist preferences</h2>
                  <p className="mt-1 text-sm text-ink/60">Choose independently for each service, or leave it on any available specialist.</p>
                </div>
                <span className="text-xs font-medium text-ink/55">Optional</span>
              </div>
              {selectedServices.length === 0 ? (
                <p className="mt-4 rounded-xl bg-sage-light/50 p-3 text-sm text-ink/60">Select services first to choose a stylist for each one.</p>
              ) : (
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {selectedServices.map((service) => {
                    const eligibleStaff = staffForService(service, staff);
                    return (
                      <label key={service.id} className="block rounded-xl border border-mist p-3 text-sm font-semibold text-ink/80">
                        <span className="block">{service.name}</span>
                        <span className="mt-1 block text-xs font-normal text-ink/55">
                          {customerServiceLane(service.category) === "nails"
                            ? "Nail technician"
                            : customerServiceLane(service.category) === "hair"
                              ? "Hairstylist"
                              : "Salon specialist"}
                        </span>
                        <select
                          value={servicePreferences[service.id] ?? ""}
                          onChange={(event) => setServicePreferences((current) => ({
                            ...current,
                            ...(event.target.value
                              ? { [service.id]: event.target.value }
                              : Object.fromEntries(Object.entries(current).filter(([id]) => id !== service.id))),
                          }))}
                          disabled={staffLoading}
                          className="dashboard-filter-control mt-2 w-full text-sm"
                        >
                          <option value="">Any available specialist</option>
                          {eligibleStaff.map((member) => (
                            <option key={member.id} value={member.id}>
                              {member.full_name} · {member.staff_role_label ?? (member.account_role === "admin" ? "Manager / hairstylist" : "Specialist")}
                            </option>
                          ))}
                        </select>
                        {eligibleStaff.length === 0 && (
                          <span className="mt-1 block text-xs font-normal text-ink/50">No specialist is listed for this service; the salon team will assign one.</span>
                        )}
                      </label>
                    );
                  })}
                </div>
              )}
            </section>

            <section className="pb-2">
              <label htmlFor="additional-notes" className="text-sm font-semibold text-ink">Anything we should know? <span className="font-normal text-ink/55">Optional</span></label>
              <textarea
                id="additional-notes"
                value={additionalNotes}
                onChange={(event) => setAdditionalNotes(event.target.value)}
                placeholder="Add a note for the salon team"
                rows={3}
                maxLength={500}
                className={`${fieldClass} mt-2 resize-none border-mist bg-white text-ink focus:border-sage-deep`}
              />
              <p className="mt-1 text-right text-[10px] text-ink/50">{additionalNotes.length}/500</p>
              <div className="mt-4">
                <label htmlFor="reference-photo" className="text-sm font-semibold text-ink">
                  Reference photo <span className="font-normal text-ink/55">Optional · for the salon team</span>
                </label>
                <input
                  id="reference-photo"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="mt-2 block w-full text-sm leading-9 text-ink/70 file:mr-3 file:inline-flex file:min-h-9 file:items-center file:justify-center file:align-middle file:rounded-lg file:border-0 file:bg-sage-light file:px-3 file:py-0 file:font-semibold file:leading-none file:text-sage-deep file:transition-transform file:duration-150 hover:file:-translate-y-0.5 hover:file:bg-sage-light/70 active:file:translate-y-0 active:file:scale-[0.98]"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    setReferencePhotoError(null);
                    if (!file) {
                      setReferencePhotoDataUrl(null);
                      return;
                    }
                    if (!REFERENCE_PHOTO_TYPES.includes(file.type)) {
                      setReferencePhotoError("Choose a JPG, PNG, or WebP image.");
                      setReferencePhotoDataUrl(null);
                      event.currentTarget.value = "";
                      return;
                    }
                    if (file.size > MAX_REFERENCE_PHOTO_SIZE) {
                      setReferencePhotoError("The photo must be 5 MB or smaller.");
                      setReferencePhotoDataUrl(null);
                      event.currentTarget.value = "";
                      return;
                    }
                    const reader = new FileReader();
                    reader.onload = () => {
                      if (typeof reader.result === "string") setReferencePhotoDataUrl(reader.result);
                      else setReferencePhotoError("Unable to read this photo. Please try another image.");
                    };
                    reader.onerror = () => setReferencePhotoError("Unable to read this photo. Please try another image.");
                    reader.readAsDataURL(file);
                  }}
                />
                <p className="mt-1 text-xs text-ink/50">JPG, PNG, or WebP · up to 5 MB</p>
                {referencePhotoError && <p className="mt-1 text-sm text-red-700" role="alert">{referencePhotoError}</p>}
                {referencePhotoDataUrl && (
                  <div className="mt-3 flex items-start gap-3">
                    <img src={referencePhotoDataUrl} alt="Selected reference photo preview" className="h-24 w-24 rounded-lg border border-mist object-cover" />
                    <button
                      type="button"
                      onClick={() => {
                        setReferencePhotoDataUrl(null);
                        setReferencePhotoError(null);
                        const input = document.getElementById("reference-photo") as HTMLInputElement | null;
                        if (input) input.value = "";
                      }}
                      className="rounded-lg border border-mist px-3 py-2 text-sm font-medium text-ink/70 hover:bg-porcelain"
                    >
                      Remove photo
                    </button>
                  </div>
                )}
              </div>
            </section>
          </div>

          <aside className="customer-booking-summary lg:sticky lg:top-20">
            <section className="rounded-lg border border-mist bg-white p-3 sm:p-6">
              <p className="text-xs font-semibold text-sage-deep">YOUR VISIT</p>
              <p className="mt-2 text-base font-semibold text-ink">{arrivalType === "appointment" ? "Appointment" : "Walk-in"}</p>

              <label htmlFor="customer-type" className="mt-5 block text-sm font-semibold text-ink/80">Customer type
                <select id="customer-type" value={customerType} onChange={(event) => setCustomerType(event.target.value as CustomerType)} className="dashboard-filter-control mt-1.5 w-full focus:border-sage-deep">
                  <option value="regular">Regular</option>
                  <option value="senior">Senior Citizen</option>
                  <option value="pwd">Person with disability (PWD)</option>
                </select>
              </label>

              <div className="mt-5 border-t border-mist pt-4" aria-live="polite" aria-label="Selected services and estimated total">
                <h2 className="text-sm font-semibold">Your selection</h2>
                {selectedServices.length === 0 ? (
                  <p className="mt-3 text-sm text-ink/55">Choose a service to see your visit total.</p>
                ) : (
                  <>
                    {selectedPackageId && <p className="mt-3 text-xs font-semibold text-sage-deep">{packages.find((packageItem) => packageItem.id === selectedPackageId)?.title} package</p>}
                    <ul className="mt-3 space-y-2">
                      {selectedServices.map((service) => (
                        <li key={service.id} className="flex items-start justify-between gap-3 text-xs">
                          <span className="text-ink/65">{service.name}</span>
                          <span className="shrink-0 font-semibold text-ink">{selectedPackageId ? "Included" : formatServicePrice(service)}</span>
                        </li>
                      ))}
                    </ul>
                    <div className="mt-4 space-y-2 border-t border-mist pt-3">
                      <div className="flex justify-between gap-3 text-xs"><span className="text-ink/65">Estimated duration</span><span className="font-semibold">{formatDuration(totalDuration)}</span></div>
                      <div className="flex justify-between gap-3 text-sm"><span className="font-semibold">{selectedServices.some((service) => service.price_type === "starting") ? "Estimated starting total" : applicablePromotion ? "Estimated after offer" : "Estimated total"}</span><span className="font-semibold text-sage-deep">{formatCurrency(totalPrice - (applicablePromotion?.discount ?? 0))}</span></div>
                      {applicablePromotion && applicablePromotion.discount > 0 && <p className="text-right text-xs text-success">Best offer applied: {applicablePromotion.promotion.title} (−{formatCurrency(applicablePromotion.discount)})</p>}
                      {waitQuoteLoading && (
                        <p className="text-xs text-ink/60" role="status">Estimating wait…</p>
                      )}
                      {waitQuote?.minutes !== null && waitQuote && (
                        <div className="text-xs text-ink/70">
                          <p className="font-semibold">
                            Estimated wait: about {Math.round(waitQuote.minutes / 5) * 5} min
                          </p>
                          {waitQuote.method === "moving_average" && (
                            <p className="mt-1">Approximate (based on a moving average).</p>
                          )}
                        </div>
                      )}
                      {!waitQuoteLoading && waitQuoteUnavailable && (
                        <p className="text-xs text-ink/60">Wait estimate unavailable right now.</p>
                      )}
                    </div>
                  </>
                )}
                {arrivalType === "appointment" && appointmentDate && appointmentTime && (
                  <p className="mt-3 border-t border-mist pt-3 text-xs text-ink/65">
                    {new Date(`${appointmentDate}T${appointmentTime}`).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" })}
                  </p>
                )}
              </div>

              <div className="mt-5 rounded-xl border border-mist bg-porcelain/70 p-3">
                <label className="flex cursor-pointer items-start gap-3">
                  <input
                    ref={privacyConsentRef}
                    type="checkbox"
                    checked={privacyConsent}
                    onChange={(event) => setPrivacyConsent(event.target.checked)}
                    className="mt-1 h-4 w-4 shrink-0 accent-sage-deep"
                  />
                  <span className="text-xs leading-relaxed text-ink/80">
                    I agree that the salon may use my information to manage my queue and visit, as described in the privacy notice.
                  </span>
                </label>
                <button
                  type="button"
                  onClick={() => setPrivacyNoticeOpen(true)}
                  className="ml-7 mt-1 min-h-8 text-xs font-semibold text-sage-deep underline underline-offset-2 hover:text-ink"
                >
                  Read privacy notice
                </button>
              </div>

              <button
                type="submit"
                disabled={isSubmitting || Boolean(joinedParty) || servicesLoading || (!partyEnabled && selectedServiceIds.length === 0) || !privacyConsent}
                className="dashboard-primary-action mt-5 min-h-12 w-full rounded-md px-4 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40"
              >
                {isSubmitting ? "Working…" : joinedParty ? "Party joined" : arrivalType === "appointment" ? "Book appointment" : "Join the queue"}
              </button>
              {!privacyConsent && <p className="mt-2 text-center text-xs text-ink/55">Agree to the privacy notice to continue.</p>}
            </section>
          </aside>

        </form>

        {privacyNoticeOpen && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 backdrop-blur-sm sm:p-6"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setPrivacyNoticeOpen(false);
            }}
          >
            <section
              role="dialog"
              aria-modal="true"
              aria-labelledby="privacy-notice-title"
              ref={privacyDialogRef}
              className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-[var(--color-ink)] text-white shadow-2xl"
            >
              <header className="shrink-0 border-b border-white/10 px-5 py-4 sm:px-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/65">Data Privacy Act of 2012 · RA 10173</p>
                    <h2 id="privacy-notice-title" className="mt-1 font-display text-2xl font-semibold">Your privacy</h2>
                    <p className="mt-1 text-sm leading-relaxed text-white/65">Please review how we use your information to manage your visit.</p>
                  </div>
                  <button type="button" onClick={() => setPrivacyNoticeOpen(false)} aria-label="Close privacy notice" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-white/70 transition hover:bg-white/10 hover:text-white">
                    <X size={19} aria-hidden="true" />
                  </button>
                </div>
              </header>

              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4 sm:px-6">
                <p className="text-sm leading-relaxed text-white/75">
                  Lyn &amp; Co Salon and Spa collects and uses personal information in accordance with the Data Privacy Act of 2012 (Republic Act No. 10173) and its implementing rules.
                </p>
                <dl className="divide-y divide-white/10">
                  <div className="grid gap-1 py-3 sm:grid-cols-[9rem_1fr] sm:gap-4">
                    <dt className="text-sm font-semibold">What we collect</dt>
                    <dd className="text-sm leading-relaxed text-white/65">Your name, contact number if provided, selected services, visit or appointment details, queue status, and any optional note you submit. If you sign in, we may also use your saved customer account details.</dd>
                  </div>
                  <div className="grid gap-1 py-3 sm:grid-cols-[9rem_1fr] sm:gap-4">
                    <dt className="text-sm font-semibold">How we use it</dt>
                    <dd className="text-sm leading-relaxed text-white/65">To create and manage your queue or appointment, coordinate your requested salon services, provide wait updates, and maintain necessary service and transaction records.</dd>
                  </div>
                  <div className="grid gap-1 py-3 sm:grid-cols-[9rem_1fr] sm:gap-4">
                    <dt className="text-sm font-semibold">Who sees it</dt>
                    <dd className="text-sm leading-relaxed text-white/65">Authorized salon staff who need it to provide your visit, and service providers that host or support the booking system. We do not sell your personal information.</dd>
                  </div>
                  <div className="grid gap-1 py-3 sm:grid-cols-[9rem_1fr] sm:gap-4">
                    <dt className="text-sm font-semibold">Storage &amp; retention</dt>
                    <dd className="text-sm leading-relaxed text-white/65">We use reasonable safeguards and keep information only as needed to manage the visit and meet applicable record-keeping requirements.</dd>
                  </div>
                  <div className="grid gap-1 py-3 sm:grid-cols-[9rem_1fr] sm:gap-4">
                    <dt className="text-sm font-semibold">Your rights</dt>
                    <dd className="text-sm leading-relaxed text-white/65">You may ask salon staff to access, correct, or request deletion of your information, or withdraw consent for future processing. Some records may need to be retained where required by law.</dd>
                  </div>
                </dl>

                <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-white/15 p-3.5">
                  <input
                    type="checkbox"
                    checked={marketingConsent}
                    onChange={(event) => setMarketingConsent(event.target.checked)}
                    className="mt-1 h-4 w-4 shrink-0 accent-white"
                  />
                  <span>
                    <span className="block text-sm font-semibold leading-relaxed">Send me promotions and package offers by text message.</span>
                    <span className="mt-1 block text-xs text-white/55">Optional. You can still join the queue without this.</span>
                  </span>
                </label>
              </div>

              <footer className="flex shrink-0 flex-col-reverse gap-2 border-t border-white/10 px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
                <button
                  type="button"
                  onClick={() => setPrivacyNoticeOpen(false)}
                  className="min-h-11 rounded-lg bg-white px-5 text-sm font-semibold text-ink transition hover:bg-white/90"
                >
                  Close
                </button>
              </footer>
            </section>
          </div>
        )}

      </main>
    </div>
  );
}