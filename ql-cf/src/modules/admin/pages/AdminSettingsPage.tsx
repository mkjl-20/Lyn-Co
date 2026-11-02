import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { Check, Clock3, ImagePlus, Link2, Palette, Save, Store, Trash2, UsersRound } from "lucide-react";
import { apiRequest } from "@/shared/lib/apiClient";
import { applyBrandTheme, BRAND_THEMES, isBrandTheme, type BrandTheme } from "@/shared/lib/brandTheme";
import { useSalonBranding } from "@/shared/context/SalonBrandingContext";
import { SalonLogoImage } from "@/shared/components/SalonLogoImage";
import { QueueQrGenerator } from "../components/QueueQrGenerator";
import { AdminPageLayout } from "../components/AdminPageLayout";

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
}

const DEFAULT_SETTINGS: SalonSettings = {
  salonName: "Lyn & Co Salon and Spa",
  contactNumber: "",
  address: "",
  openingTime: "09:00",
  closingTime: "21:00",
  crowdThreshold: 8,
  queueUrl: import.meta.env.VITE_PUBLIC_QUEUE_URL?.trim() ?? "",
  themeColor: "monochrome",
  logoDataUrl: "",
};

const SETTINGS_SECTIONS = [
  { id: "salon", label: "Salon information", Icon: Store },
  { id: "theme", label: "Themes", Icon: Palette },
  { id: "qr", label: "QR code", Icon: Link2 },
  { id: "hours", label: "Hours & alerts", Icon: Clock3 },
] as const;

type SettingsSection = (typeof SETTINGS_SECTIONS)[number]["id"];

export function AdminSettingsPage() {
  const [activeSection, setActiveSection] = useState<SettingsSection>("salon");
  const [settings, setSettings] = useState<SalonSettings>(DEFAULT_SETTINGS);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [logoError, setLogoError] = useState<string | null>(null);
  const { setLogoDataUrl, setQueueUrl } = useSalonBranding();

  useEffect(() => {
    let isMounted = true;
    void apiRequest<{ settings: SalonSettings }>("/api/admin/workspace/settings")
      .then((result) => {
        if (isMounted) {
          const loadedSettings = { ...DEFAULT_SETTINGS, ...result.settings };
          loadedSettings.queueUrl = result.settings.queueUrl || DEFAULT_SETTINGS.queueUrl;
          if (!isBrandTheme(loadedSettings.themeColor)) loadedSettings.themeColor = DEFAULT_SETTINGS.themeColor;
          setSettings({
            ...loadedSettings,
          });
          setLogoDataUrl(loadedSettings.logoDataUrl);
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
  }, [setLogoDataUrl, setQueueUrl]);

  function updateSetting<K extends keyof SalonSettings>(key: K, value: SalonSettings[K]) {
    setSettings((current) => ({ ...current, [key]: value }));
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

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!window.confirm("Save these settings and apply them across the queue and customer updates?")) {
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
      setQueueUrl(savedSettings.queueUrl);
      if (isBrandTheme(savedSettings.themeColor)) applyBrandTheme(savedSettings.themeColor);
      setSuccessMessage("Settings saved. They are now active across the queue and customer updates.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to save settings.");
    } finally {
      setIsSaving(false);
    }
  }

  const fieldClass = "mt-1.5 min-h-11 w-full rounded-xl border border-mist bg-white px-3 text-base text-ink outline-none transition focus:border-sage focus:ring-2 focus:ring-sage/15 sm:text-sm";

  return (
    <AdminPageLayout title="Settings & Branding">
      <div className="mt-2 grid items-start gap-5 lg:grid-cols-[15rem_minmax(0,1fr)]">
        <nav aria-label="Settings sections" className="grid grid-cols-2 gap-2 lg:sticky lg:top-5 lg:grid-cols-1 lg:rounded-2xl lg:border lg:border-mist lg:bg-white lg:p-2">
          {SETTINGS_SECTIONS.map(({ id, label, Icon }) => {
            const selected = activeSection === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setActiveSection(id)}
                aria-current={selected ? "page" : undefined}
                className={`flex min-h-14 items-center gap-3 rounded-xl border px-3 py-2 text-left transition lg:border-0 ${
                  selected ? "border-sage-deep bg-sage-deep text-white lg:bg-sage-light lg:text-ink" : "border-mist bg-white text-ink/70 hover:bg-porcelain"
                }`}
              >
                <Icon size={18} aria-hidden="true" className="shrink-0" />
                <span className="truncate text-xs font-semibold sm:text-sm">{label}</span>
              </button>
            );
          })}
        </nav>

      <form onSubmit={handleSubmit} className="min-w-0 space-y-4 sm:space-y-5">
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
            <section className="overflow-hidden rounded-2xl border border-mist bg-white shadow-sm">
              <div className="flex items-center gap-3 border-b border-mist px-4 py-4 sm:px-6">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-sage-light text-sage-deep">
                  <ImagePlus size={19} aria-hidden="true" />
                </span>
                <div>
                  <h2 className="font-display text-base font-semibold text-ink">Logo</h2>
                </div>
              </div>
              <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:p-6">
                <div className="flex h-28 w-28 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-mist bg-porcelain text-3xl font-semibold text-ink/35">
                  {settings.logoDataUrl ? (
                    <SalonLogoImage src={settings.logoDataUrl} alt="Salon logo preview" className="h-full w-full object-contain p-2" />
                  ) : (
                    <span aria-hidden="true">L</span>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <label
                    htmlFor="salon-logo-upload"
                    className="dashboard-primary-action inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition hover:opacity-90"
                  >
                    <ImagePlus size={17} aria-hidden="true" />
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
                      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-mist px-4 text-sm font-medium text-ink/75 hover:bg-porcelain"
                    >
                      <Trash2 size={16} aria-hidden="true" />
                      Remove logo
                    </button>
                  )}
                  <p className="w-full text-xs text-ink/50">PNG, JPG, or WebP · Max 5 MB · Save settings to apply</p>
                  {logoError && <p className="w-full text-sm text-clay" role="alert">{logoError}</p>}
                </div>
              </div>
            </section>
            <section className="overflow-hidden rounded-2xl border border-mist bg-white shadow-sm">
              <div className="flex items-center gap-3 border-b border-mist px-4 py-4 sm:px-6">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-sage-light text-sage-deep">
                  <Store size={19} aria-hidden="true" />
                </span>
                <h2 className="font-display text-base font-semibold text-ink">Salon information</h2>
              </div>
              <div className="grid gap-4 p-4 sm:grid-cols-2 sm:p-6">
                <label className="text-xs font-semibold text-ink/65">
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
                  <input
                    maxLength={40}
                    type="tel"
                    value={settings.contactNumber}
                    onChange={(event) => updateSetting("contactNumber", event.target.value)}
                    placeholder="Salon phone number"
                    className={fieldClass}
                  />
                </label>
                <label className="text-xs font-semibold text-ink/65 sm:col-span-2">
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
              <div className="flex items-center gap-3 border-b border-mist px-4 py-4 sm:px-6">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-sage-light text-sage-deep">
                  <Link2 size={19} aria-hidden="true" />
                </span>
                <div>
                  <h2 className="font-display text-base font-semibold text-ink">Customer QR code</h2>
                </div>
              </div>
              <div className="p-4 sm:p-6">
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
                <p className="mt-2 text-xs text-ink/50">Use your public website or salon Wi-Fi address.</p>
                <QueueQrGenerator queueUrl={settings.queueUrl} />
              </div>
            </section>}

            {activeSection === "hours" && <section className="overflow-hidden rounded-2xl border border-mist bg-white shadow-sm">
              <div className="flex items-center gap-3 border-b border-mist px-4 py-4 sm:px-6">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gold-light text-ink/70">
                  <UsersRound size={19} aria-hidden="true" />
                </span>
                <div>
                  <h2 className="font-display text-base font-semibold text-ink">Business hours & queue alert</h2>
                </div>
              </div>
              <div className="grid gap-4 p-4 sm:grid-cols-2 sm:p-6">
                <label className="text-xs font-semibold text-ink/65">
                  Opens
                  <input
                    required
                    type="time"
                    value={settings.openingTime}
                    onChange={(event) => updateSetting("openingTime", event.target.value)}
                    className="dashboard-filter-control mt-1.5 w-full text-ink outline-none transition focus:border-sage focus:ring-2 focus:ring-sage/15"
                  />
                </label>
                <label className="text-xs font-semibold text-ink/65">
                  Closes
                  <input
                    required
                    type="time"
                    value={settings.closingTime}
                    onChange={(event) => updateSetting("closingTime", event.target.value)}
                    className="dashboard-filter-control mt-1.5 w-full text-ink outline-none transition focus:border-sage focus:ring-2 focus:ring-sage/15"
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
                  <span className="mt-1 block font-normal text-ink/45">Show a crowd alert when this many customers are waiting.</span>
                </label>
              </div>
            </section>}

            <div className="sticky bottom-2 z-10 flex justify-end rounded-2xl border border-mist/80 bg-white/95 p-2 shadow-lg backdrop-blur sm:static sm:border-0 sm:bg-transparent sm:p-0 sm:shadow-none">
              <button
                type="submit"
                disabled={isSaving}
                className="dashboard-primary-action inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold transition hover:bg-sage disabled:cursor-wait disabled:opacity-60 sm:w-auto"
              >
                <Save size={17} aria-hidden="true" />
                {isSaving ? "Saving settings…" : "Save settings"}
              </button>
            </div>
          </>
        )}
      </form>
      </div>
    </AdminPageLayout>
  );
}
