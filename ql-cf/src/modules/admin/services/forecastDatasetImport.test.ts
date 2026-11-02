import { describe, expect, it } from "vitest";
import { parseForecastDatasetCsv } from "./forecastDatasetImport";

const header = "Date,Service_Category,Service,Staff_Name,Seat_No,Staff_Experience_Level,Customer_Group,Customer_Type,Stylist_Request,Add_On_Service,Queue_Length,Arrival_Rate_Per_Hr,Station_Prep_Min,Hour_of_Day,Holiday,Payday,Time_Arrived,Service_Start,Service_End,Waiting_Time_Min,Service_Duration_Min";
const row = '2026-10-30,Hair,"Cut, wash",Mia,2,3,regular,Walk-in,true,0,2,4.5,2,10,false,true,9:20 AM,10:00 AM,10:30 AM,40,30';

describe("parseForecastDatasetCsv", () => {
  it("parses quoted CSV values and converts Manila local times", () => {
    const [parsed] = parseForecastDatasetCsv(`${header}\n${row}`);

    expect(parsed.service).toBe("Cut, wash");
    expect(parsed.hour_of_day).toBe(10);
    expect(parsed.arrived_at).toBe("2026-10-30T01:20:00.000Z");
    expect(parsed.started_at).toBe("2026-10-30T02:00:00.000Z");
    expect(parsed.stylist_request).toBe(true);
    expect(parsed.add_on).toBe(false);
  });

  it("rejects missing headers, malformed times, and reversed service times", () => {
    expect(() => parseForecastDatasetCsv("Date,Service\n2026-10-30,Cut")).toThrow(/Missing CSV columns/);
    expect(() => parseForecastDatasetCsv(`${header}\n${row.replace("10:00 AM", "bad")}`)).toThrow(/invalid time/);
    expect(() => parseForecastDatasetCsv(`${header}\n${row.replace("10:00 AM", "9:00 AM")}`)).toThrow(/times must be ordered/);
  });
});
