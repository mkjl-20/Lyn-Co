export interface SalonHours {
  openingTime: string;
  closingTime: string;
}

export function isValidSalonHours(hours: SalonHours) {
  const isValidTime = (time: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(time);
  return isValidTime(hours.openingTime)
    && isValidTime(hours.closingTime)
    && hours.openingTime < hours.closingTime;
}

export function isAppointmentWithinSalonHours(appointmentAt: string, hours: SalonHours) {
  const match = /^\d{4}-\d{2}-\d{2}T(\d{2}:\d{2})/.exec(appointmentAt);
  return Boolean(match && isAppointmentTimeWithinSalonHours(match[1], hours));
}

export function isAppointmentTimeWithinSalonHours(time: string, hours: SalonHours) {
  return /^\d{2}:\d{2}$/.test(time) && time >= hours.openingTime && time < hours.closingTime;
}

export function formatSalonTime(time: string) {
  const [hourText, minute] = time.split(":");
  const hour = Number(hourText);
  const period = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${minute} ${period}`;
}

export function lastAppointmentTime(closingTime: string) {
  const [hour, minute] = closingTime.split(":").map(Number);
  const lastMinute = hour * 60 + minute - 1;
  return `${String(Math.floor(lastMinute / 60)).padStart(2, "0")}:${String(lastMinute % 60).padStart(2, "0")}`;
}
