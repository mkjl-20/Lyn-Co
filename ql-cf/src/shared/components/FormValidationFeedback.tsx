import { useEffect } from "react";

type ValidatedControl = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
let nextValidationErrorId = 0;

function isValidatedControl(target: EventTarget | null): target is ValidatedControl {
  return target instanceof HTMLInputElement
    || target instanceof HTMLSelectElement
    || target instanceof HTMLTextAreaElement;
}

function fieldLabel(control: ValidatedControl): string {
  const label = control.labels?.[0]?.textContent?.trim().replace(/\s+/g, " ");
  return label || control.getAttribute("aria-label") || control.name || control.id || "this field";
}

function validationMessage(control: ValidatedControl): string {
  const label = fieldLabel(control);
  if (control.validity.valueMissing) return `Please enter ${label}.`;
  if (control.validity.typeMismatch || control.validity.patternMismatch) {
    return `Enter a valid ${label}.`;
  }
  if (control.validity.tooShort) {
    return `${label} must be at least ${control.getAttribute("minlength")} characters.`;
  }
  if (control.validity.tooLong) {
    return `${label} must be no more than ${control.getAttribute("maxlength")} characters.`;
  }
  if (control.validity.rangeUnderflow || control.validity.rangeOverflow) {
    return `Enter a valid value for ${label}.`;
  }
  return control.validationMessage || `Check ${label}.`;
}

function showValidationError(control: ValidatedControl) {
  const existingId = control.dataset.validationErrorId;
  const errorId = existingId || `field-error-${++nextValidationErrorId}`;
  control.dataset.validationErrorId = errorId;
  control.setAttribute("aria-invalid", "true");
  const descriptionIds = new Set((control.getAttribute("aria-describedby") ?? "").split(/\s+/).filter(Boolean));
  descriptionIds.add(errorId);
  control.setAttribute("aria-describedby", [...descriptionIds].join(" "));

  const container = control.closest("label") ?? control.parentElement;
  if (!container) return;
  let message = document.getElementById(errorId);
  if (!message) {
    message = document.createElement("span");
    message.id = errorId;
    message.className = "form-field-error";
    message.setAttribute("role", "alert");
    container.append(message);
  }
  message.textContent = validationMessage(control);
}

function clearValidationError(control: ValidatedControl) {
  if (!control.validity.valid) return;
  const errorId = control.dataset.validationErrorId;
  if (!errorId) return;

  document.getElementById(errorId)?.remove();
  delete control.dataset.validationErrorId;
  control.removeAttribute("aria-invalid");
  const descriptionIds = (control.getAttribute("aria-describedby") ?? "")
    .split(/\s+/)
    .filter((id) => id && id !== errorId);
  if (descriptionIds.length) control.setAttribute("aria-describedby", descriptionIds.join(" "));
  else control.removeAttribute("aria-describedby");
}

export function FormValidationFeedback() {
  useEffect(() => {
    function handleInvalid(event: Event) {
      if (!isValidatedControl(event.target)) return;
      event.preventDefault();
      showValidationError(event.target);
    }

    function handleInput(event: Event) {
      if (!isValidatedControl(event.target)) return;
      if (event.target.validity.valid) clearValidationError(event.target);
      else if (event.target.dataset.validationErrorId) showValidationError(event.target);
    }

    document.addEventListener("invalid", handleInvalid, true);
    document.addEventListener("input", handleInput, true);
    document.addEventListener("change", handleInput, true);
    return () => {
      document.removeEventListener("invalid", handleInvalid, true);
      document.removeEventListener("input", handleInput, true);
      document.removeEventListener("change", handleInput, true);
    };
  }, []);

  return null;
}
