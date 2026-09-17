import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { fetchJoinCatalog, joinQueue } from "../services/joinQueueService";

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
  duration_minutes: number;
  is_visible: boolean;
  is_available: boolean;
  display_order: number;
}

interface Staff {
  id: string;
  full_name: string;
  staff_role:
    | "hairstylist"
    | "manicurist"
    | "pedicurist"
    | "receptionist"
    | null;
  is_active: boolean;
}

// Priority is now independent from arrival mode — a VIP can walk in OR book
// an appointment, so "appointment" no longer lives in this list.
type CustomerType = "regular" | "senior" | "pwd";

type ArrivalType = "walk_in" | "appointment";

/* =========================================================
   COMPONENT
========================================================= */

export function CustomerJoinPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const joinSource = searchParams.get("source") === "kiosk" ? "kiosk" : "qr_mobile";

  /* =======================================================
     CUSTOMER INFORMATION
  ======================================================= */

  const [customerName, setCustomerName] = useState("");
  const [contactNumber, setContactNumber] = useState("");

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
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);
  const [servicesLoading, setServicesLoading] = useState(true);

  /* =======================================================
     ADDITIONAL NOTES / ADD-ONS
  ======================================================= */

  const [additionalNotes, setAdditionalNotes] = useState("");

  /* =======================================================
     STAFF
  ======================================================= */

  const [staff, setStaff] = useState<Staff[]>([]);
  const [selectedStaffId, setSelectedStaffId] = useState("");
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
        setStaff(catalog.staff as Staff[]);
      } catch (error) {
        console.error("Catalog loading error:", error);
        if (!mounted) return;
        setServices([]);
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

  /* =======================================================
     TOGGLE SERVICE
  ======================================================= */

  function toggleService(serviceId: string) {
    setSelectedServiceIds((current) => {
      if (current.includes(serviceId)) {
        return current.filter((id) => id !== serviceId);
      }
      return [...current, serviceId];
    });
  }

  /* =======================================================
     SELECTED SERVICES
  ======================================================= */

  const selectedServices = useMemo(() => {
    return services.filter((service) => selectedServiceIds.includes(service.id));
  }, [services, selectedServiceIds]);

  /* =======================================================
     TOTAL PRICE / DURATION
  ======================================================= */

  const totalPrice = useMemo(() => {
    return selectedServices.reduce((total, service) => total + Number(service.price || 0), 0);
  }, [selectedServices]);

  const totalDuration = useMemo(() => {
    return selectedServices.reduce(
      (total, service) => total + Number(service.duration_minutes || 0),
      0
    );
  }, [selectedServices]);

  /* =======================================================
     FORMATTERS
  ======================================================= */

  function formatCurrency(value: number) {
    return new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(value);
  }

  function formatServicePrice(service: Service) {
    const price = formatCurrency(Number(service.price || 0));
    return service.price_type === "starting" ? `${price}+` : price;
  }

  function formatDuration(minutes: number) {
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

    if (!cleanName) {
      setErrorMessage("Please enter your name.");
      return;
    }

    if (selectedServiceIds.length === 0) {
      setErrorMessage("Please select at least one service.");
      return;
    }

    if (selectedServices.length === 0) {
      setErrorMessage("The selected services are no longer available.");
      return;
    }

    if (arrivalType === "appointment") {
      if (!appointmentDate || !appointmentTime) {
        setErrorMessage("Please select an appointment date and time.");
        return;
      }

      const scheduled = new Date(`${appointmentDate}T${appointmentTime}:00`);

      if (Number.isNaN(scheduled.getTime())) {
        setErrorMessage("Invalid appointment date or time.");
        return;
      }

      if (scheduled.getTime() <= Date.now()) {
        setErrorMessage("Appointment time must be in the future.");
        return;
      }

      const hour = scheduled.getHours();
      if (hour < 9 || hour >= 19) {
        setErrorMessage("Appointments are available between 9:00 AM and 7:00 PM.");
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
        preferredStaffId: selectedStaffId,
        serviceIds: selectedServiceIds,
        arrivalType,
        priorityType: customerType,
        appointmentAt,
        source: joinSource,
      });

      setSuccessMessage(
        arrivalType === "appointment"
          ? "Your appointment has been booked."
          : "You have successfully joined the queue."
      );

      navigate(`/queue-status/${result.entry.id}`);
    } catch (error) {
      console.error("Join queue failed:", error);
      setErrorMessage(error instanceof Error ? error.message : "Unable to join the queue.");
    } finally {
      setIsSubmitting(false);
    }
  }

  /* =========================================================
     UI
  ========================================================= */

  return (
    <div className="min-h-screen bg-mist px-4 py-6 sm:px-6 sm:py-10">
      <div className="mx-auto w-full max-w-3xl">
        {/* ================================================= HEADER ================================================= */}
        <div className="mb-6 text-center">
          <h1 className="font-display text-2xl font-semibold text-ink sm:text-3xl">Join LynQ</h1>
          <p className="mt-2 text-sm text-ink/55">
            Join the Lyn & Co Salon and Spa queue without downloading an app.
          </p>
        </div>

        {/* ================================================= CARD ================================================= */}
        <div className="overflow-hidden rounded-2xl bg-white shadow-xl sm:rounded-3xl">
          <form onSubmit={handleSubmit} className="space-y-7 p-5 sm:p-8">
            {errorMessage && (
              <div role="alert" className="rounded-lg border border-clay/20 bg-clay/5 px-4 py-3 text-sm text-clay">
                {errorMessage}
              </div>
            )}

            {successMessage && (
              <div role="status" className="rounded-lg border border-sage/30 bg-sage/10 px-4 py-3 text-sm text-sage-deep">
                {successMessage}
              </div>
            )}

            {/* ================================================= ARRIVAL TYPE ================================================= */}
            <section>
              <div className="mb-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => setArrivalType("walk_in")}
                  className={[
                    "flex-1 rounded-lg border py-2.5 text-sm font-medium transition",
                    arrivalType === "walk_in"
                      ? "border-sage-deep bg-sage/10 text-sage-deep"
                      : "border-mist text-ink/60",
                  ].join(" ")}
                >
                  Walk-in
                </button>
                <button
                  type="button"
                  onClick={() => setArrivalType("appointment")}
                  className={[
                    "flex-1 rounded-lg border py-2.5 text-sm font-medium transition",
                    arrivalType === "appointment"
                      ? "border-sage-deep bg-sage/10 text-sage-deep"
                      : "border-mist text-ink/60",
                  ].join(" ")}
                >
                  Appointment
                </button>
              </div>

              {arrivalType === "appointment" && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="appointment-date" className="mb-1.5 block text-xs font-medium text-ink/70">
                      Date
                    </label>
                    <input
                      id="appointment-date"
                      type="date"
                      value={appointmentDate}
                      onChange={(e) => setAppointmentDate(e.target.value)}
                      min={new Date().toISOString().split("T")[0]}
                      required
                      className="w-full rounded-lg border border-mist bg-porcelain/40 px-3 py-3 text-sm text-ink outline-none focus:border-sage-deep"
                    />
                  </div>
                  <div>
                    <label htmlFor="appointment-time" className="mb-1.5 block text-xs font-medium text-ink/70">
                      Time
                    </label>
                    <input
                      id="appointment-time"
                      type="time"
                      value={appointmentTime}
                      onChange={(e) => setAppointmentTime(e.target.value)}
                      min="09:00"
                      max="19:00"
                      required
                      className="w-full rounded-lg border border-mist bg-porcelain/40 px-3 py-3 text-sm text-ink outline-none focus:border-sage-deep"
                    />
                  </div>
                  <p className="col-span-full text-[11px] text-ink/40">
                    Available 9:00 AM – 7:00 PM. If you selected a preferred staff member below,
                    we'll check they're free at this time when you submit.
                  </p>
                </div>
              )}
            </section>

            {/* ================================================= CUSTOMER INFORMATION ================================================= */}
            <section>
              <div className="mb-4">
                <h2 className="text-base font-semibold text-ink">Customer Information</h2>
                <p className="mt-1 text-xs text-ink/45">Enter your information to join the queue.</p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="customer-name" className="mb-1.5 block text-xs font-medium text-ink/70">
                    Full Name
                  </label>
                  <input
                    id="customer-name"
                    type="text"
                    value={customerName}
                    onChange={(event) => setCustomerName(event.target.value)}
                    placeholder="Enter your name"
                    autoComplete="name"
                    maxLength={100}
                    required
                    className="w-full rounded-lg border border-mist bg-porcelain/40 px-3 py-3 text-sm text-ink outline-none transition focus:border-sage-deep"
                  />
                </div>

                <div>
                  <label htmlFor="contact-number" className="mb-1.5 block text-xs font-medium text-ink/70">
                    Contact Number
                    <span className="ml-2 text-[10px] font-normal text-ink/40">Optional</span>
                  </label>
                  <input
                    id="contact-number"
                    type="tel"
                    value={contactNumber}
                    onChange={(event) => setContactNumber(event.target.value)}
                    placeholder="09XX XXX XXXX"
                    autoComplete="tel"
                    maxLength={20}
                    className="w-full rounded-lg border border-mist bg-porcelain/40 px-3 py-3 text-sm text-ink outline-none transition focus:border-sage-deep"
                  />
                </div>
              </div>
            </section>

            {/* ================================================= SERVICES ================================================= */}
            <section>
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-ink">Select Services</h2>
                  <p className="mt-1 text-xs text-ink/45">Select one or more services.</p>
                </div>

                {selectedServiceIds.length > 0 && (
                  <span className="rounded-full bg-sage/20 px-3 py-1 text-xs font-medium text-sage-deep">
                    {selectedServiceIds.length} selected
                  </span>
                )}
              </div>

              {servicesLoading && (
                <div className="rounded-xl border border-mist bg-porcelain/30 p-6 text-center text-sm text-ink/45">
                  Loading services...
                </div>
              )}

              {!servicesLoading && services.length === 0 && (
                <div className="rounded-xl border border-mist bg-porcelain/30 p-6 text-center text-sm text-ink/45">
                  No services are currently available.
                </div>
              )}

              {!servicesLoading && services.length > 0 && (
                <div className="space-y-5">
                  {Object.entries(
                    services.reduce((groups, service) => {
                      const category = service.category || "Services";
                      if (!groups[category]) groups[category] = [];
                      groups[category].push(service);
                      return groups;
                    }, {} as Record<string, Service[]>)
                  ).map(([category, categoryServices]) => (
                    <div key={category}>
                      <h3 className="mb-3 text-sm font-semibold text-ink">{category}</h3>
                      <div className="grid gap-3 sm:grid-cols-2">
                        {categoryServices.map((service) => {
                          const selected = selectedServiceIds.includes(service.id);
                          return (
                            <button
                              key={service.id}
                              type="button"
                              onClick={() => toggleService(service.id)}
                              className={[
                                "w-full rounded-xl border p-4 text-left transition",
                                selected
                                  ? "border-sage-deep bg-sage/10"
                                  : "border-mist bg-white hover:border-sage/50",
                              ].join(" ")}
                            >
                              <div className="flex items-start gap-3">
                                <div
                                  className={[
                                    "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border",
                                    selected ? "border-sage-deep bg-sage-deep text-white" : "border-ink/20",
                                  ].join(" ")}
                                >
                                  {selected && (
                                    <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none">
                                      <path
                                        d="M4 10.5l3.5 3.5L16 5.5"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                      />
                                    </svg>
                                  )}
                                </div>

                                <div className="min-w-0 flex-1">
                                  <div className="flex items-start justify-between gap-3">
                                    <h4 className="text-sm font-semibold text-ink">{service.name}</h4>
                                    <span className="shrink-0 text-sm font-semibold text-sage-deep">
                                      {formatServicePrice(service)}
                                    </span>
                                  </div>

                                  {service.description && (
                                    <p className="mt-1 text-xs leading-relaxed text-ink/45">
                                      {service.description}
                                    </p>
                                  )}

                                  <p className="mt-2 text-[11px] text-ink/40">
                                    Estimated duration: {formatDuration(Number(service.duration_minutes))}
                                  </p>
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* ================================================= ADDITIONAL NOTES ================================================= */}
            <section>
              <div className="mb-3">
                <h2 className="text-base font-semibold text-ink">
                  Add-ons / Special Requests
                  <span className="ml-2 text-xs font-normal text-ink/40">Optional</span>
                </h2>
                <p className="mt-1 text-xs text-ink/45">Add-ons are entered as notes for the salon staff.</p>
              </div>

              <textarea
                id="additional-notes"
                value={additionalNotes}
                onChange={(event) => setAdditionalNotes(event.target.value)}
                placeholder="Example: Hair wash, scalp massage, or other special request..."
                rows={4}
                maxLength={500}
                className="w-full resize-none rounded-lg border border-mist bg-porcelain/40 px-3 py-3 text-sm text-ink outline-none transition focus:border-sage-deep"
              />

              <div className="mt-1 flex justify-end">
                <span className="text-[10px] text-ink/35">{additionalNotes.length}/500</span>
              </div>
            </section>

            {/* ================================================= PREFERRED STAFF ================================================= */}
            <section>
              <div className="mb-3">
                <h2 className="text-base font-semibold text-ink">Preferred Staff</h2>
                <p className="mt-1 text-xs text-ink/45">
                  Optional. Leave as "No preference" if you do not have a preferred staff member.
                </p>
              </div>

              <select
                value={selectedStaffId}
                onChange={(event) => setSelectedStaffId(event.target.value)}
                disabled={staffLoading}
                className="w-full rounded-lg border border-mist bg-porcelain/40 px-3 py-3 text-sm text-ink outline-none focus:border-sage-deep"
              >
                <option value="">No preference</option>
                {staff.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.full_name}
                    {member.staff_role ? ` — ${member.staff_role}` : ""}
                  </option>
                ))}
              </select>
            </section>

            {/* ================================================= CUSTOMER TYPE (PRIORITY) ================================================= */}
            <section>
              <div className="mb-3">
                <h2 className="text-base font-semibold text-ink">Customer Type</h2>
              </div>

              <select
                value={customerType}
                onChange={(event) => setCustomerType(event.target.value as CustomerType)}
                className="w-full rounded-lg border border-mist bg-porcelain/40 px-3 py-3 text-sm text-ink outline-none focus:border-sage-deep"
              >
                <option value="regular">Regular</option>
                <option value="senior">Senior Citizen</option>
                <option value="pwd">PWD</option>
              </select>
            </section>

            {/* ================================================= SUMMARY ================================================= */}
            {selectedServices.length > 0 && (
              <section className="rounded-xl bg-sage/10 p-4">
                <h2 className="mb-3 text-sm font-semibold text-ink">Queue Summary</h2>

                <div className="space-y-2">
                  {selectedServices.map((service) => (
                    <div key={service.id} className="flex items-center justify-between gap-3 text-xs">
                      <span className="text-ink/60">{service.name}</span>
                      <span className="font-medium text-ink">{formatServicePrice(service)}</span>
                    </div>
                  ))}

                  <div className="my-2 border-t border-sage/20" />

                  <div className="flex items-center justify-between">
                    <span className="text-xs text-ink/60">Estimated Duration</span>
                    <span className="text-sm font-semibold text-ink">{formatDuration(totalDuration)}</span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-xs text-ink/60">Estimated Total</span>
                    <span className="text-base font-semibold text-sage-deep">
                      {formatCurrency(totalPrice)}
                      {selectedServices.some((service) => service.price_type === "starting") && "+"}
                    </span>
                  </div>

                  {arrivalType === "appointment" && appointmentDate && appointmentTime && (
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-ink/60">Appointment</span>
                      <span className="text-xs font-medium text-ink">
                        {new Date(`${appointmentDate}T${appointmentTime}`).toLocaleString("en-PH", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}
                      </span>
                    </div>
                  )}
                </div>
              </section>
            )}

            {/* ================================================= SUBMIT ================================================= */}
            <button
              type="submit"
              disabled={isSubmitting || servicesLoading || selectedServiceIds.length === 0}
              className="w-full rounded-xl bg-sage-deep py-3.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isSubmitting
                ? arrivalType === "appointment"
                  ? "Booking Appointment..."
                  : "Joining Queue..."
                : arrivalType === "appointment"
                ? "Book Appointment"
                : "Join Queue"}
            </button>

            <p className="text-center text-[11px] leading-relaxed text-ink/35">
              By joining the queue, you agree to provide accurate information for your service request.
            </p>
          </form>
        </div>

        {/* ================================================= FOOTER ================================================= */}
        <p className="mt-5 text-center text-xs text-ink/35">Lyn & Co Salon and Spa</p>
      </div>
    </div>
  );
}