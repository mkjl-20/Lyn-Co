export interface ForecastImportRow {
  service_date: string;
  service_category: string;
  service: string;
  staff_name: string;
  seat_no: number | null;
  staff_experience: number;
  customer_group: string | null;
  customer_type: string | null;
  stylist_request: boolean;
  add_on: boolean;
  queue_length: number;
  arrival_rate_per_hr: number;
  station_prep_min: number;
  hour_of_day: number;
  holiday: boolean;
  payday: boolean;
  arrived_at: string;
  started_at: string;
  ended_at: string;
  waiting_min: number;
  duration_min: number;
}

export const FORECAST_DATASET_TEMPLATE_HEADERS = [
  "Date", "Service_Category", "Service", "Staff_Name", "Staff_Experience_Level",
  "Stylist_Request", "Add_On_Service", "Queue_Length", "Arrival_Rate_Per_Hr",
  "Station_Prep_Min", "Hour_of_Day", "Holiday", "Payday", "Time_Arrived",
  "Service_Start", "Service_End", "Waiting_Time_Min", "Service_Duration_Min",
];
const REQUIRED_HEADERS = FORECAST_DATASET_TEMPLATE_HEADERS;

function parseCsvRows(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
    } else if (character === '"' && field.length === 0) {
      quoted = true;
    } else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n" || character === "\r") {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(field);
      field = "";
      if (row.some((cell) => cell.trim() !== "")) rows.push(row);
      row = [];
    } else {
      field += character;
    }
  }
  if (quoted) throw new Error("CSV contains an unclosed quoted field.");
  if (field !== "" || row.length > 0) {
    row.push(field);
    if (row.some((cell) => cell.trim() !== "")) rows.push(row);
  }
  return rows;
}

function parseNumber(value: string, label: string, rowNumber: number) {
  if (value.trim() === "") throw new Error(`Row ${rowNumber}: ${label} is required.`);
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`Row ${rowNumber}: ${label} must be a number.`);
  return number;
}

function parseBoolean(value: string, label: string, rowNumber: number) {
  const normalized = value.trim().toLowerCase();
  if (["1", "true"].includes(normalized)) return true;
  if (["0", "false"].includes(normalized)) return false;
  throw new Error(`Row ${rowNumber}: ${label} must be true/false or 1/0.`);
}

function parseTime(value: string, rowNumber: number) {
  const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i.exec(value.trim());
  if (!match) throw new Error(`Row ${rowNumber}: invalid time "${value}".`);
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = Number(match[3] ?? 0);
  const meridiem = match[4]?.toUpperCase();
  if (minute > 59 || second > 59 || (meridiem && (hour < 1 || hour > 12)) || hour > 23) {
    throw new Error(`Row ${rowNumber}: invalid time "${value}".`);
  }
  if (meridiem === "PM" && hour < 12) hour += 12;
  if (meridiem === "AM" && hour === 12) hour = 0;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:${String(second).padStart(2, "0")}`;
}

function parseRow(record: Record<string, string>, rowNumber: number): ForecastImportRow {
  const date = record.Date;
  const parsedDate = /^\d{4}-\d{2}-\d{2}$/.test(date)
    ? new Date(`${date}T00:00:00Z`)
    : null;
  if (!parsedDate || Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== date) {
    throw new Error(`Row ${rowNumber}: Date must use YYYY-MM-DD.`);
  }
  const requiredText = (key: string) => {
    const value = record[key]?.trim();
    if (!value || value.length > 120) throw new Error(`Row ${rowNumber}: ${key} is required (max 120 characters).`);
    return value;
  };
  const arrivedAt = `${date}T${parseTime(record.Time_Arrived, rowNumber)}+08:00`;
  const startedAt = `${date}T${parseTime(record.Service_Start, rowNumber)}+08:00`;
  const endedAt = `${date}T${parseTime(record.Service_End, rowNumber)}+08:00`;
  const arrivedMs = Date.parse(arrivedAt);
  const startedMs = Date.parse(startedAt);
  const endedMs = Date.parse(endedAt);
  if (startedMs < arrivedMs || endedMs <= startedMs) {
    throw new Error(`Row ${rowNumber}: service times must be ordered arrival, start, then end on the same day.`);
  }

  const staffExperience = parseNumber(record.Staff_Experience_Level, "Staff_Experience_Level", rowNumber);
  const queueLength = parseNumber(record.Queue_Length, "Queue_Length", rowNumber);
  const arrivalRate = parseNumber(record.Arrival_Rate_Per_Hr, "Arrival_Rate_Per_Hr", rowNumber);
  const stationPrep = parseNumber(record.Station_Prep_Min, "Station_Prep_Min", rowNumber);
  const hour = parseNumber(record.Hour_of_Day, "Hour_of_Day", rowNumber);
  const waiting = parseNumber(record.Waiting_Time_Min, "Waiting_Time_Min", rowNumber);
  const duration = parseNumber(record.Service_Duration_Min, "Service_Duration_Min", rowNumber);
  if (!Number.isInteger(staffExperience) || staffExperience < 1 || staffExperience > 3
    || !Number.isInteger(queueLength) || queueLength < 0
    || arrivalRate < 0 || stationPrep < 0
    || !Number.isInteger(hour) || hour < 0 || hour > 23
    || waiting < 0 || duration <= 0) {
    throw new Error(`Row ${rowNumber}: one or more numeric fields are outside the allowed range.`);
  }
  const seat = record.Seat_No?.trim() ? parseNumber(record.Seat_No, "Seat_No", rowNumber) : null;
  if (seat !== null && (!Number.isInteger(seat) || seat < 0)) {
    throw new Error(`Row ${rowNumber}: Seat_No must be a non-negative integer.`);
  }

  return {
    service_date: date,
    service_category: requiredText("Service_Category"),
    service: requiredText("Service"),
    staff_name: requiredText("Staff_Name"),
    seat_no: seat,
    staff_experience: staffExperience,
    customer_group: record.Customer_Group?.trim() || null,
    customer_type: record.Customer_Type?.trim() || null,
    stylist_request: parseBoolean(record.Stylist_Request, "Stylist_Request", rowNumber),
    add_on: parseBoolean(record.Add_On_Service, "Add_On_Service", rowNumber),
    queue_length: queueLength,
    arrival_rate_per_hr: arrivalRate,
    station_prep_min: stationPrep,
    hour_of_day: hour,
    holiday: parseBoolean(record.Holiday, "Holiday", rowNumber),
    payday: parseBoolean(record.Payday, "Payday", rowNumber),
    arrived_at: new Date(arrivedMs).toISOString(),
    started_at: new Date(startedMs).toISOString(),
    ended_at: new Date(endedMs).toISOString(),
    waiting_min: waiting,
    duration_min: duration,
  };
}

export function parseForecastDatasetCsv(text: string): ForecastImportRow[] {
  const rows = parseCsvRows(text.replace(/^\uFEFF/, ""));
  if (rows.length < 2) throw new Error("CSV must include a header and at least one data row.");
  const headers = rows[0].map((header) => header.trim());
  const missingHeaders = REQUIRED_HEADERS.filter((header) => !headers.includes(header));
  if (missingHeaders.length) throw new Error(`Missing CSV columns: ${missingHeaders.join(", ")}.`);
  if (rows.length - 1 > 20_000) throw new Error("Import a maximum of 20,000 rows per CSV file.");

  return rows.slice(1).map((cells, index) => {
    const record = Object.fromEntries(headers.map((header, column) => [header, (cells[column] ?? "").trim()]));
    return parseRow(record, index + 2);
  });
}
