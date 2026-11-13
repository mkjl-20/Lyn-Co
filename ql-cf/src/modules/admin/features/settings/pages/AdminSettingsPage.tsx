import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { Check, Clock3, ImagePlus, Link2, Palette, Save, Store, Trash2 } from "lucide-react";
import { apiRequest } from "@/shared/lib/apiClient";
import { applyBrandTheme, BRAND_THEMES, isBrandTheme, type BrandTheme } from "@/shared/lib/brandTheme";
import { useSalonBranding } from "@/shared/context/SalonBrandingContext";
import { SalonLogoImage } from "@/shared/components/SalonLogoImage";
import { QueueQrGenerator } from "../../queue/components/QueueQrGenerator";
import { AdminPageLayout } from "../../../components/AdminPageLayout";
import { PhilippinePhoneInput } from "@/shared/components/PhilippinePhoneInput";
import { buildCustomerQueueUrl, resolveCustomerQueueBaseUrl } from "@/shared/lib/queueQr";
import { useFeedback } from "@/shared/components/FeedbackContext";

interface SalonSettings {
  salonName: string;
  contactNumber: string;
  address: string;
  openingTime: string;
  closingTime: string;
  crowdThreshold: number;
  queueUrl: string;
  themeColor: BrandTheme;
  logoDataUrl: string;
  bannerDataUrl: string;
}

const DEFAULT_SETTINGS: SalonSettings = {
  salonName: "Lyn & Co Salon and Spa",
  contactNumber: "",
  address: "",
  openingTime: "09:00",
  closingTime: "21:00",
  crowdThreshold: 8,
  queueUrl: import.meta.env.VITE_PUBLIC_QUEUE_URL?.trim()
    || (typeof window !== "undefined" ? window.location.origin : ""),
  themeColor: "monochrome",
  logoDataUrl: "",
  bannerDataUrl: "",
};

const SETTINGS_SECTIONS = [
  { id: "salon", label: "Salon information", Icon: Store },
  { id: "theme", label: "Themes", Icon: Palette },
  { id: "qr", label: "QR code", Icon: Link2 },
] as const;

type SettingsSection = (typeof SETTINGS_SECTIONS)[number]["id"];

export function AdminSettingsPage() {
  const { confirm } = useFeedback();
  const [activeSection, setActiveSection] = useState<SettingsSection>("salon");
  const [settings, setSettings] = useState<SalonSettings>(DEFAULT_SETTINGS);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [queueUrlSaveState, setQueueUrlSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [queueUrlSaveError, setQueueUrlSaveError] = useState<string | null>(null);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [bannerError, setBannerError] = useState<string | null>(null);
  const { setLogoDataUrl, setBannerDataUrl, setQueueUrl } = useSalonBranding();
  const lastSavedQueueUrl = useRef(DEFAULT_SETTINGS.queueUrl);
  const queueUrlSaveQueue = useRef(Promise.resolve());
  const queueUrlSaveInFlight = useRef(false);
  const queueUrlRevision = useRef(0);

  useEffect(() => {
    let isMounted = true;
    void apiRequest<{ settings: SalonSettings }>("/api/admin/workspace/settings")
      .then((result) => {
        if (isMounted) {
          const loadedSettings = { ...DEFAULT_SETTINGS, ...result.settings };
          loadedSettings.queueUrl = resolveCustomerQueueBaseUrl(
            result.settings.queueUrl || DEFAULT_SETTINGS.queueUrl,
            window.location.origin,
          );
          lastSavedQueueUrl.current = loadedSettings.queueUrl;
          if (!isBrandTheme(loadedSettings.themeColor)) loadedSettings.themeColor = DEFAULT_SETTINGS.themeColor;
          setSettings({
            ...loadedSettings,
          });
          setLogoDataUrl(loadedSettings.logoDataUrl);
          setBannerDataUrl(loadedSettings.bannerDataUrl);
          setQueueUrl(loadedSettings.queueUrl);
          applyBrandTheme(loadedSettings.themeColor);
        }
      })
      .catch((error: unknown) => {
        if (isMounted) {
          setErrorMessage(error instanceof Error ? error.message : "Unable to load settings.");
        }
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });
    return () => {
      isMounted = false;
    };
  }, [setBannerDataUrl, setLogoDataUrl, setQueueUrl]);

  useEffect(() => {
    const revision = ++queueUrlRevision.current;
    const queueUrl = settings.queueUrl.trim();
    if (isLoading || (queueUrl === lastSavedQueueUrl.current && !queueUrlSaveInFlight.current)) return;
    try {
      buildCustomerQueueUrl(queueUrl);
    } catch {
      return;
    }

    const saveTimer = window.setTimeout(() => {
      setQueueUrlSaveState("saving");
      setQueueUrlSaveError(null);
      queueUrlSaveQueue.current = queueUrlSaveQueue.current.then(async () => {
        if (queueUrlRevision.current !== revision) return;
        queueUrlSaveInFlight.current = true;
        try {
          const result = await apiRequest<{ settings: SalonSettings }>("/api/admin/workspace/settings/queue-url", {
            method: "PATCH",
            body: JSON.stringify({ queueUrl }),
          });
          lastSavedQueueUrl.current = result.settings.queueUrl;
          if (queueUrlRevision.current === revision) {
            setSettings((current) => ({ ...current, queueUrl: result.settings.queueUrl }));
            setQueueUrl(result.settings.queueUrl);
            setQueueUrlSaveState("saved");
          }
        } catch (error) {
          console.error("Public queue address autosave failed:", error);
          if (queueUrlRevision.current === revision) {
            setQueueUrlSaveState("error");
            setQueueUrlSaveError(error instanceof Error ? error.message : "Unable to save the queue address.");
          }
        } finally {
          queueUrlSaveInFlight.current = false;
        }
      });
    }, 500);

    return () => window.clearTimeout(saveTimer);
  }, [isLoading, settings.queueUrl, setQueueUrl]);

  function updateSetting<K extends keyof SalonSettings>(key: K, value: SalonSettings[K]) {
    setSettings((current) => ({ ...current, [key]: value }));
    if (key === "queueUrl") {
      queueUrlRevision.current += 1;
      setQueueUrlSaveState("idle");
      setQueueUrlSaveError(null);
    }
    setSuccessMessage(null);
  }

  async function handleLogoChange(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    setLogoError(null);
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      setLogoError("Choose a PNG, JPG, or WebP image.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setLogoError("Choose an image smaller than 5 MB.");
      return;
    }

    try {
      const bitmap = await createImageBitmap(file);
      const scale = Math.min(1, 512 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Image preview is unavailable in this browser.");
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close();
      const logoDataUrl = canvas.toDataURL("image/webp", 0.82);
      if (logoDataUrl.length > 500_000) {
        setLogoError("This image is still too large after resizing. Choose a simpler or smaller image.");
        return;
      }
      updateSetting("logoDataUrl", logoDataUrl);
      setLogoDataUrl(logoDataUrl);
    } catch (error) {
      console.error("Salon logo processing failed:", error);
      setLogoError(error instanceof Error ? error.message : "Unable to process this logo image.");
    }
  }

  async function handleBannerChange(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    setBannerError(null);
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      setBannerError("Choose a PNG, JPG, or WebP image.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setBannerError("Choose an image smaller than 5 MB.");
      return;
    }

    try {
      const bitmap = await createImageBitmap(file);
      const scale = Math.min(1, 1200 / Math.max(bitmap.width, bitmap.height));
      const width = Math.max(1, Math.round(bitmap.width * scale));
      const height = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Banner image processing is unavailable in this browser.");
      context.drawImage(bitmap, 0, 0, width, height);
      bitmap.close();

      for (const quality of [0.85, 0.75, 0.65, 0.55, 0.45]) {
        const bannerDataUrl = canvas.toDataURL("image/jpeg", quality);
        const encoded = bannerDataUrl.slice(bannerDataUrl.indexOf(",") + 1);
        if (Math.floor(encoded.length * 3 / 4) <= 500_000) {
          updateSetting("bannerDataUrl", bannerDataUrl);
          setBannerDataUrl(bannerDataUrl);
          return;
        }
      }
      throw new Error("This image could not be compressed enough. Choose a smaller or simpler image.");
    } catch (error) {
      console.error("Customer banner image processing failed:", error);
      setBannerError(error instanceof Error ? error.message : "Unable to process this banner image.");
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (activeSection === "qr") return;
    if (!await confirm({
      title: "Save salon settings",
      message: "Save these settings and apply them across the queue and customer updates?",
      confirmLabel: "Save settings",
    })) {
      return;
    }
    setIsSaving(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const result = await apiRequest<{ settings: SalonSettings }>("/api/admin/workspace/settings", {
        method: "PUT",
        body: JSON.stringify({ settings }),
      });
      const savedSettings = { ...settings, ...result.settings, logoDataUrl: result.settings.logoDataUrl ?? settings.logoDataUrl };
      setSettings(savedSettings);
      setLogoDataUrl(savedSettings.logoDataUrl);
      setBannerDataUrl(savedSettings.bannerDataUrl);
      setQueueUrl(savedSettings.queueUrl);
      if (isBrandTheme(savedSettings.themeColor)) applyBrandTheme(savedSettings.themeColor);
      setSuccessMessage("Settings saved. They are now active across the queue and customer updates.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to save settings.");
    } finally {
      setIsSaving(false);
    }
  }

  const fieldClass = "mt-1 min-h-9 w-full rounded-xl border border-mist bg-white px-3 text-sm text-ink outline-none transition focus:border-sage focus:ring-2 focus:ring-sage/15";

  return (
    <AdminPageLayout title="Settings & Branding" fullHeight>
      <div className="mt-1 flex min-h-0 flex-1 flex-col">
        <div className="mb-2 flex shrink-0 flex-wrap items-center justify-between gap-3">
          <nav aria-label="Settings sections" className="flex min-w-0 flex-wrap items-center gap-1 rounded-xl border border-mist/70 bg-white p-1">
            {SETTINGS_SECTIONS.map(({ id, label, Icon }) => {
              const selected = activeSection === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setActiveSection(id)}
                  aria-current={selected ? "page" : undefined}
                  className={`flex min-h-10 items-center gap-2 rounded-lg px-3 py-2 text-left transition ${
                    selected ? "bg-sage-deep text-white" : "text-ink/70 hover:bg-porcelain"
                  }`}
                >
                  <Icon size={16} aria-hidden="true" className="shrink-0" />
                  <span className="truncate text-xs font-semibold">{label}</span>
                </button>
              );
            })}
          </nav>
          {activeSection !== "qr" && (
            <button
              type="submit"
              form="salon-settings-form"
              disabled={isSaving}
              className="dashboard-primary-action inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-4 text-xs font-semibold transition hover:bg-sage disabled:cursor-wait disabled:opacity-60"
            >
              <Save size={16} aria-hidden="true" />
              {isSaving ? "Saving…" : "Save settings"}
            </button>
          )}
        </div>

      <form
        id="salon-settings-form"
        onSubmit={handleSubmit}
        className="flex min-h-0 flex-1 flex-col items-center justify-start overflow-x-hidden overflow-y-auto"
      >
        {errorMessage && (
          <div role="alert" className="rounded-xl border border-clay/20 bg-clay-light px-4 py-3 text-sm text-clay">
            {errorMessage}
          </div>
        )}
        {successMessage && (
          <div role="status" className="rounded-xl border border-success/20 bg-success-soft px-4 py-3 text-sm text-success">
            {successMessage}
          </div>
        )}

        {isLoading ? (
          <div className="h-72 animate-pulse rounded-2xl bg-white/80" aria-label="Loading settings" />
        ) : (
          <>
            {activeSection === "salon" && <>
            <div className="grid w-full max-w-6xl gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] xl:items-stretch">
            <section className="rounded-2xl border border-mist/70 bg-white p-4 shadow-sm sm:p-5">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-sm font-semibold text-ink">Brand &amp; customer banner</h2>
                <span className="text-[10px] font-medium uppercase tracking-wide text-ink/40">Visual identity</span>
              </div>
              <div className="mt-4 flex items-center gap-3">
                <ImagePlus size={18} aria-hidden="true" className="shrink-0 text-sage-deep" />
                <h3 className="font-display text-sm font-semibold text-ink">Logo</h3>
              </div>
              <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-center">
                <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-mist bg-porcelain text-3xl font-semibold text-ink/35 sm:h-24 sm:w-24">
                  {settings.logoDataUrl ? (
                    <SalonLogoImage src={settings.logoDataUrl} alt="Salon logo preview" className="h-full w-full object-contain p-2" />
                  ) : (
                    <span aria-hidden="true">L</span>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <label
                    htmlFor="salon-logo-upload"
                    className="dashboard-primary-action inline-flex min-h-10 cursor-pointer items-center justify-center gap-2 rounded-lg px-3 text-xs font-semibold transition hover:opacity-90"
                  >
                    <ImagePlus size={16} aria-hidden="true" />
                    {settings.logoDataUrl ? "Choose a different logo" : "Upload salon logo"}
                  </label>
                  <input
                    id="salon-logo-upload"
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={(event) => void handleLogoChange(event)}
                    className="sr-only"
                  />
                  {settings.logoDataUrl && (
                    <button
                      type="button"
                      onClick={() => {
                        updateSetting("logoDataUrl", "");
                        setLogoDataUrl("");
                        setLogoError(null);
                      }}
                      className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-3 text-xs font-medium text-ink/65 transition hover:bg-porcelain"
                    >
                      <Trash2 size={15} aria-hidden="true" />
                      Remove logo
                    </button>
                  )}
                  <p className="w-full text-xs text-ink/50">PNG, JPG, or WebP · Max 5 MB · Save settings to apply.</p>
                  {logoError && <p className="w-full text-sm text-clay" role="alert">{logoError}</p>}
                </div>
              </div>
              <div className="mt-4">
                <div className="flex items-center gap-3">
                  <ImagePlus size={18} aria-hidden="true" className="shrink-0 text-sage-deep" />
                  <div>
                    <h3 className="font-display text-sm font-semibold text-ink">Customer banner photo</h3>
                    <p className="mt-0.5 text-xs text-ink/50">Optional · uses a flat color when no photo is set.</p>
                  </div>
                </div>
              </div>
              <div className="mt-3 grid gap-3">
                <div className="relative flex aspect-[4/1] min-h-24 overflow-hidden rounded-xl bg-[#505050] text-white">
                  {settings.bannerDataUrl && (
                    <img src={settings.bannerDataUrl} alt="Customer banner photo preview" className="absolute inset-0 h-full w-full object-cover" />
                  )}
                  <div className="relative z-10 flex min-h-24 w-full flex-col items-center justify-center bg-black/35 px-3 py-1.5 text-center">
                    <span className="text-xs font-medium">Lyn &amp; Co Salon and Spa</span>
                    <span className="mt-2 border border-white px-2 py-1 text-sm font-semibold">SKIP THE WAIT</span>
                    <span className="mt-2 text-xs">Join the queue from your phone.</span>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <label
                    htmlFor="customer-banner-upload"
                    className="dashboard-primary-action inline-flex min-h-10 cursor-pointer items-center justify-center gap-2 rounded-lg px-3 text-xs font-semibold transition hover:opacity-90"
                  >
                    <ImagePlus size={16} aria-hidden="true" />
                    {settings.bannerDataUrl ? "Choose a different photo" : "Upload banner photo"}
                  </label>
                  <input
                    id="customer-banner-upload"
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={(event) => void handleBannerChange(event)}
                    className="sr-only"
                  />
                  {settings.bannerDataUrl && (
                    <button
                      type="button"
                      onClick={() => {
                        updateSetting("bannerDataUrl", "");
                        setBannerDataUrl("");
                        setBannerError(null);
                      }}
                      className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-3 text-xs font-medium text-ink/65 transition hover:bg-porcelain"
                    >
                      <Trash2 size={15} aria-hidden="true" />
                      Use flat color
                    </button>
                  )}
                  <p className="text-xs text-ink/50">PNG, JPG, or WebP · Max 5 MB</p>
                  {bannerError && <p className="w-full text-sm text-clay" role="alert">{bannerError}</p>}
                </div>
              </div>
            </section>
            <div className="flex flex-col gap-4">
              <section className="overflow-hidden rounded-2xl border border-mist/70 bg-white shadow-sm">
                <div className="flex items-center gap-2 px-4 pt-4">
                  <Store size={17} aria-hidden="true" className="text-sage-deep" />
                  <div>
                    <h2 className="font-display text-base font-semibold text-ink">Salon information</h2>
                  </div>
                </div>
                <p className="px-4 pt-2 text-xs text-ink/50">The details shown to your customers.</p>
                <div className="grid gap-3 p-4 sm:grid-cols-2 sm:p-5">
                  <label className="text-xs font-semibold text-ink/65 sm:col-span-2">
                    Salon name
                    <input
                      required
                      maxLength={100}
                      value={settings.salonName}
                      onChange={(event) => updateSetting("salonName", event.target.value)}
                      className={fieldClass}
                    />
                  </label>
                  <label className="text-xs font-semibold text-ink/65">
                    Contact number
                    <PhilippinePhoneInput
                      value={settings.contactNumber}
                      onChange={(value) => updateSetting("contactNumber", value)}
                      className="mt-2"
                    />
                  </label>
                  <label className="text-xs font-semibold text-ink/65">
                    Address
                    <input
                      maxLength={240}
                      value={settings.address}
                      onChange={(event) => updateSetting("address", event.target.value)}
                      placeholder="Street, city"
                      className={fieldClass}
                    />
                  </label>
                </div>
              </section>
              <section className="overflow-hidden rounded-2xl border border-mist/70 bg-white shadow-sm">
                <div className="flex items-center gap-2 px-4 pt-4">
                  <Clock3 size={17} aria-hidden="true" className="text-sage-deep" />
                  <div>
                    <h2 className="font-display text-base font-semibold text-ink">Hours &amp; queue alerts</h2>
                  </div>
                </div>
                <p className="px-4 pt-2 text-xs text-ink/50">Choose when you’re open and when to flag a busy queue.</p>
                <div className="grid gap-3 p-4 sm:grid-cols-2 sm:p-5">
                  <label className="text-xs font-semibold text-ink/65">
                    Opens
                    <input
                      required
                      type="time"
                      value={settings.openingTime}
                      onChange={(event) => updateSetting("openingTime", event.target.value)}
                      className={fieldClass}
                    />
                  </label>
                  <label className="text-xs font-semibold text-ink/65">
                    Closes
                    <input
                      required
                      type="time"
                      value={settings.closingTime}
                      onChange={(event) => updateSetting("closingTime", event.target.value)}
                      className={fieldClass}
                    />
                  </label>
                  <label className="text-xs font-semibold text-ink/65 sm:col-span-2">
                    Queue crowd alert threshold
                    <input
                      required
                      type="number"
                      min={1}
                      max={1000}
                      step={1}
                      value={settings.crowdThreshold}
                      onChange={(event) => updateSetting("crowdThreshold", Number(event.target.value))}
                      className={fieldClass}
                    />
                    <span className="mt-1 block font-normal text-ink/45">Show an alert when this many customers are waiting.</span>
                  </label>
                </div>
              </section>
            </div>
            </div>
            </>}

            {activeSection === "theme" && <section className="overflow-hidden rounded-2xl border border-mist bg-white shadow-sm">
              <div className="flex items-center gap-3 border-b border-mist px-4 py-4 sm:px-6">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gold-light text-ink/70">
                  <Palette size={19} aria-hidden="true" />
                </span>
                <div>
                  <h2 className="font-display text-base font-semibold text-ink">System theme</h2>
                </div>
              </div>
              <fieldset className="grid gap-3 p-4 sm:grid-cols-2 sm:p-6 lg:grid-cols-3">
                <legend className="sr-only">System theme</legend>
                {(Object.entries(BRAND_THEMES) as [BrandTheme, (typeof BRAND_THEMES)[BrandTheme]][]).map(([theme, palette]) => {
                  const selected = settings.themeColor === theme;
                  return (
                    <label
                      key={theme}
                      className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border px-3 py-2 text-sm font-medium transition focus-within:ring-2 focus-within:ring-sage-deep/30 ${
                        selected ? "border-sage-deep bg-sage-light text-ink" : "border-mist bg-white text-ink/75 hover:bg-porcelain"
                      }`}
                    >
                      <input
                        type="radio"
                        name="themeColor"
                        value={theme}
                        checked={selected}
                        onChange={() => {
                          updateSetting("themeColor", theme);
                          applyBrandTheme(theme);
                        }}
                        className="sr-only"
                      />
                      <span
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-black/10"
                        style={{ backgroundColor: palette.accent }}
                        aria-hidden="true"
                      >
                        {selected && <Check size={16} className="text-white" />}
                      </span>
                      {palette.label}
                    </label>
                  );
                })}
              </fieldset>
            </section>}

            {activeSection === "qr" && <section className="overflow-hidden rounded-2xl border border-mist bg-white shadow-sm">
              <div className="flex items-center gap-3 border-b border-mist px-3 py-3 sm:px-4">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-sage-light text-sage-deep">
                  <Link2 size={19} aria-hidden="true" />
                </span>
                <div>
                  <h2 className="font-display text-base font-semibold text-ink">Customer QR code</h2>
                </div>
              </div>
              <div className="p-3 sm:p-4">
                <label className="block text-xs font-semibold text-ink/65">
                  Public queue address
                  <input
                    type="url"
                    maxLength={300}
                    value={settings.queueUrl}
                    onChange={(event) => updateSetting("queueUrl", event.target.value)}
                    placeholder="http://192.168.x.x:5173 or https://your-salon-site.com"
                    className={fieldClass}
                  />
                </label>
                <p className="mt-2 text-xs text-ink/55">
                  The QR updates as you edit. A valid queue address is saved automatically.
                  {queueUrlSaveState === "saving" && " Saving…"}
                  {queueUrlSaveState === "saved" && " Saved."}
                </p>
                {queueUrlSaveState === "error" && queueUrlSaveError && (
                  <p role="alert" className="mt-1 text-xs text-clay">{queueUrlSaveError}</p>
                )}
                <button
                  type="button"
                  onClick={() => updateSetting("queueUrl", window.location.origin)}
                  className="mt-2 min-h-9 rounded-md border border-mist px-3 text-xs font-semibold text-ink/70 hover:bg-sage-light"
                >
                  Use this site
                </button>
                <QueueQrGenerator queueUrl={settings.queueUrl} />
              </div>
            </section>}

          </>
        )}
      </form>
      </div>
    </AdminPageLayout>
  );
}
