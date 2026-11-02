interface QueueProgressProps {
  status: string;
  customerStage: string;
  services?: {
    id: string;
    name: string;
    status: string;
    customerStage: string;
  }[];
}

const PROGRESS_STEPS = ["Waiting", "Called", "In service", "Completed"];

function getProgressStep(
  status: string,
  customerStage: string,
  services: QueueProgressProps["services"],
) {
  if (status === "completed" || customerStage === "completed") return 3;
  if (status === "in_service" || customerStage === "in_service"
    || services?.some((service) => service.status === "in_service")) return 2;
  if (customerStage === "called" || services?.some((service) => service.customerStage === "called")) return 1;
  return 0;
}

export function QueueProgress({ status, customerStage, services = [] }: QueueProgressProps) {
  const currentStep = getProgressStep(status, customerStage, services);
  const isCancelled = status === "cancelled" || customerStage === "cancelled";
  const isNoShow = status === "no_show";
  const isStopped = isCancelled || isNoShow;
  const progressPercent = (currentStep / (PROGRESS_STEPS.length - 1)) * 100;
  const label = isCancelled ? "Cancelled" : isNoShow ? "No-show" : PROGRESS_STEPS[currentStep];
  const completedServices = services.filter((service) => service.status === "completed").length;

  return (
    <section
      className="w-full rounded-lg bg-porcelain/70 px-3 py-3"
      aria-label="Queue visit progress"
    >
      <div
        role="progressbar"
        aria-label="Queue visit progress"
        aria-valuemin={0}
        aria-valuemax={PROGRESS_STEPS.length - 1}
        aria-valuenow={currentStep}
        aria-valuetext={label}
        className="relative"
      >
        <div className="absolute left-[12.5%] right-[12.5%] top-2.5 h-1 rounded-full bg-mist" aria-hidden="true">
          <div
            className={`h-full rounded-full transition-[width] duration-500 ${isStopped ? "bg-clay" : "bg-sage-deep"}`}
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        <ol className="relative grid grid-cols-4 gap-1">
          {PROGRESS_STEPS.map((step, index) => {
            const isComplete = index <= currentStep && !isStopped;
            const isCurrent = index === currentStep && !isStopped;
            return (
              <li key={step} className="flex min-w-0 flex-col items-center gap-1.5 text-center">
                <span
                  className={`z-10 flex h-6 w-6 items-center justify-center rounded-full border-2 text-[10px] font-bold ${
                    isStopped && index === currentStep
                      ? "border-clay bg-clay text-white"
                      : isComplete
                        ? "border-sage-deep bg-sage-deep text-white"
                        : "border-mist bg-white text-ink/40"
                  }`}
                  aria-hidden="true"
                >
                  {index + 1}
                </span>
                <span className={`text-[10px] leading-tight sm:text-xs ${
                  isCurrent ? "font-semibold text-ink" : isComplete ? "text-sage-deep" : "text-ink/45"
                }`}>
                  {step}
                </span>
              </li>
            );
          })}
        </ol>
      </div>
      {services.length > 0 && (
        <div className="mt-3 border-t border-mist pt-2">
          <p className="text-center text-[11px] font-medium text-ink/60">
            {completedServices} of {services.length} {services.length === 1 ? "service" : "services"} completed
          </p>
          <ul className="mt-2 space-y-1">
            {services.map((service) => {
              const serviceStatus = service.status === "completed" ? "Completed"
                : service.status === "in_service" ? "In service"
                  : service.status === "cancelled" ? "Cancelled"
                    : status === "in_service" ? "Up next"
                      : service.customerStage === "called" ? "Called"
                        : "Waiting";
              return (
                <li key={service.id} className="flex items-center justify-between gap-2 text-xs">
                  <span className="min-w-0 break-words text-ink/75">{service.name}</span>
                  <span className={`shrink-0 font-medium ${
                    service.status === "completed" ? "text-sage-deep"
                      : service.status === "cancelled" ? "text-clay"
                        : service.status === "in_service" ? "text-sage-deep"
                          : "text-ink/50"
                  }`}>
                    {serviceStatus}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {isStopped && <p className="mt-2 text-center text-xs font-semibold text-clay">{label}</p>}
    </section>
  );
}
