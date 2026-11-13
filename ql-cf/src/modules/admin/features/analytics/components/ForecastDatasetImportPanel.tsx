import { useCallback, useEffect, useState, type ChangeEvent } from "react";
import { apiRequest } from "@/shared/lib/apiClient";
import {
  FORECAST_DATASET_TEMPLATE_HEADERS,
  parseForecastDatasetCsv,
  type ForecastImportRow,
} from "../services/forecastDatasetImport";

interface ModelStatus {
  id: string;
  n_train: number;
  n_test: number;
  r2_test: number | null;
  mae_test: number;
  baseline_mae: number;
  created_at: string;
}

interface TrainingResult {
  nTrain: number;
  nTest: number;
  r2Test: number;
  maeTest: number;
  baselineMae: number;
}

const IMPORT_BATCH_SIZE = 200;
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MIN_TRAINING_RECORDS = 35;

export function ForecastDatasetImportPanel() {
  const [rows, setRows] = useState<ForecastImportRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [status, setStatus] = useState<{ recordCount: number; activeModel: ModelStatus | null } | null>(null);
  const [trainingResult, setTrainingResult] = useState<TrainingResult | null>(null);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const [isTraining, setIsTraining] = useState(false);
  const [importProgress, setImportProgress] = useState(0);

  const loadStatus = useCallback(async () => {
    try {
      const result = await apiRequest<{ recordCount: number; activeModel: ModelStatus | null }>("/api/forecast/dataset/status");
      setStatus(result);
    } catch (error) {
      setErrorMessage(error instanceof Error
        ? `${error.message} Apply migration 20261102110000_add_forecast_training_datasets.sql if the training tables are missing.`
        : "Unable to load training data status.");
    }
  }, []);

  useEffect(() => {
    // Load persisted training status on mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadStatus();
  }, [loadStatus]);

  async function selectFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setErrorMessage("");
    setMessage("");
    setTrainingResult(null);
    setRows([]);
    setFileName("");
    if (file.size > MAX_FILE_BYTES) {
      setErrorMessage("CSV files must be 5 MB or smaller.");
      return;
    }
    try {
      const parsed = parseForecastDatasetCsv(await file.text());
      setRows(parsed);
      setFileName(file.name);
      setMessage(`${parsed.length.toLocaleString()} rows ready to import.`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to read this CSV file.");
    }
  }

  function downloadTemplate() {
    const blob = new Blob([`${FORECAST_DATASET_TEMPLATE_HEADERS.join(",")}\r\n`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "lynq-forecast-training-template.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  async function importRows() {
    if (!rows.length) return;
    setIsImporting(true);
    setImportProgress(0);
    setErrorMessage("");
    setMessage("");
    let inserted = 0;
    try {
      for (let offset = 0; offset < rows.length; offset += IMPORT_BATCH_SIZE) {
        const batch = rows.slice(offset, offset + IMPORT_BATCH_SIZE);
        const result = await apiRequest<{ insertedCount: number; duplicateCount: number }>("/api/forecast/dataset/import", {
          method: "POST",
          body: JSON.stringify({ rows: batch }),
        });
        inserted += result.insertedCount;
        setImportProgress(Math.min(100, Math.round(((offset + batch.length) / rows.length) * 100)));
      }
      setMessage(`${inserted.toLocaleString()} rows imported. Duplicates skipped.`);
      setRows([]);
      setFileName("");
      await loadStatus();
    } catch (error) {
      setErrorMessage(`${error instanceof Error ? error.message : "Import failed."} ${inserted} new rows were imported before the failure; retrying safely skips duplicates.`);
      await loadStatus();
    } finally {
      setIsImporting(false);
    }
  }

  async function trainModel() {
    setIsTraining(true);
    setTrainingResult(null);
    setErrorMessage("");
    setMessage("");
    try {
      const result = await apiRequest<{ result: TrainingResult }>("/api/forecast/dataset/train", {
        method: "POST",
        body: JSON.stringify({}),
      });
      setTrainingResult(result.result);
      setMessage("Model trained.");
      await loadStatus();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to train the model.");
    } finally {
      setIsTraining(false);
    }
  }

  const busy = isImporting || isTraining;
  const recordCount = status?.recordCount ?? 0;
  const recordsNeeded = Math.max(0, MIN_TRAINING_RECORDS - recordCount);

  return (
    <section className="h-full overflow-hidden rounded-xl border border-neutral-200 bg-white p-3 shadow-sm" aria-labelledby="forecast-dataset-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="forecast-dataset-title" className="text-base font-semibold text-[var(--color-ink)]">Training data</h2>
          <p className="mt-1 text-xs text-[var(--app-ink-muted)]">Import past services to train wait-time predictions.</p>
        </div>
        <div className="rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--app-ink-muted)]">Records</p>
          <p className="mt-1 text-xl font-bold text-[var(--color-ink)]">{status?.recordCount.toLocaleString() ?? "—"}</p>
          <p className="mt-1 text-xs text-[var(--app-ink-muted)]">
            {status
              ? recordsNeeded > 0 ? `${recordsNeeded} more to train` : "Ready to train"
              : errorMessage ? "Unavailable" : "Loading…"}
          </p>
        </div>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <label className="block text-xs font-medium text-[var(--color-ink)]">
          CSV file
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(event) => void selectFile(event)}
            disabled={busy}
            className="mt-1 block min-h-9 w-full rounded-lg border border-neutral-200 bg-white p-1.5 text-xs"
          />
          <span className="mt-1 block text-xs text-[var(--app-ink-muted)]">Use the template · 5 MB max</span>
        </label>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={downloadTemplate} disabled={busy} className="min-h-9 rounded-lg border border-neutral-200 px-3 text-xs font-semibold text-[var(--color-ink)] disabled:opacity-50">
            CSV template
          </button>
          <button type="button" onClick={() => void importRows()} disabled={busy || rows.length === 0} className="min-h-9 rounded-lg bg-black px-3 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">
            {isImporting ? `Importing ${importProgress}%` : rows.length ? `Import ${rows.length.toLocaleString()} rows` : "Import data"}
          </button>
          <button type="button" onClick={() => void trainModel()} disabled={busy || recordCount < MIN_TRAINING_RECORDS} className="min-h-9 rounded-lg border border-neutral-200 px-3 text-xs font-semibold text-[var(--color-ink)] disabled:cursor-not-allowed disabled:opacity-50">
            {isTraining ? "Training…" : "Train model"}
          </button>
        </div>
      </div>

      {isImporting && (
        <div className="mt-4" role="status" aria-live="polite">
          <div className="mb-1 flex justify-between text-xs text-[var(--app-ink-muted)]"><span>Importing {fileName}</span><span>{importProgress}%</span></div>
          <progress className="h-2 w-full accent-sage-deep" max={100} value={importProgress}>{importProgress}%</progress>
        </div>
      )}
      {errorMessage && <p role="alert" className="mt-3 rounded-lg border border-clay/20 bg-clay-light p-2 text-xs text-clay">{errorMessage}</p>}
      {message && <p role="status" className="mt-3 rounded-lg border border-neutral-200 bg-neutral-50 p-2 text-xs text-[var(--color-ink)]">{message}</p>}

      {trainingResult && (
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="Train / test rows" value={`${trainingResult.nTrain} / ${trainingResult.nTest}`} />
          <Metric label="Holdout R²" value={trainingResult.r2Test.toFixed(3)} />
          <Metric label="Model MAE" value={`${trainingResult.maeTest.toFixed(1)} min`} />
          <Metric label="Mean baseline MAE" value={`${trainingResult.baselineMae.toFixed(1)} min`} />
        </div>
      )}
      {status?.activeModel && !trainingResult && (
        <p className="mt-4 text-sm text-[var(--app-ink-muted)]">
          Latest trained model: MAE {Number(status.activeModel.mae_test).toFixed(1)} min, baseline MAE {Number(status.activeModel.baseline_mae).toFixed(1)} min, trained {new Date(status.activeModel.created_at).toLocaleString()}.
        </p>
      )}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-[var(--app-surface-soft)] p-3">
      <p className="text-xs text-[var(--app-ink-muted)]">{label}</p>
      <p className="mt-1 font-semibold text-[var(--color-ink)]">{value}</p>
    </div>
  );
}
