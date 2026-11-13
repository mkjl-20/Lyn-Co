export function normalizePhilippinePhoneInput(value: string): string {
  let digits = value.replace(/\D/g, "");
  if (digits.startsWith("63")) digits = digits.slice(2);
  if (digits.startsWith("9")) return `0${digits.slice(0, 10)}`;
  return digits.slice(0, 11);
}

export function formatPhilippinePhoneInput(value: string): string {
  if (value.startsWith("09")) return value.slice(1);
  if (value.startsWith("63")) return value.slice(2);
  return value;
}
