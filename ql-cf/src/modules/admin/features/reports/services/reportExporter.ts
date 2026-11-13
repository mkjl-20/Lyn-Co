export interface ReportRow {
  [key: string]: string | number | boolean | null;
}

export function buildCsvReport(title: string, rows: ReportRow[]): string {
  if (rows.length === 0) {
    return `${title}\n`;
  }

  const headers = Object.keys(rows[0]);
  const lines = [headers.join(",")];

  for (const row of rows) {
    const values = headers.map((header) => {
      const value = row[header];
      const normalized = value === null || value === undefined ? "" : String(value);
      const escaped = normalized.replace(/"/g, '""');
      return `"${escaped}"`;
    });
    lines.push(values.join(","));
  }

  return `${title}\n${lines.join("\n")}`;
}

export function downloadCsvReport(fileName: string, title: string, rows: ReportRow[]): void {
  const csv = buildCsvReport(title, rows);
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();

  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
