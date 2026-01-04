/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";

type UploadState =
  | "idle"
  | "preparing"
  | "uploading"
  | "completing"
  | "done"
  | "error"
  | "canceled";

type CheckKey = "RESOLUTION" | "AVG_LOUDNESS" | "BITRATE" | "FPS";

type AnalysisState = "idle" | "creating" | "queued" | "running" | "completed" | "failed";

const CHECKS: { key: CheckKey; label: string; hint: string }[] = [
  { key: "RESOLUTION", label: "Rozlišení", hint: "Zkontroluje width × height" },
  { key: "FPS", label: "FPS", hint: "Zkontroluje snímkovou frekvenci" },
  { key: "BITRATE", label: "Bitrate", hint: "Zkontroluje datový tok videa" },
  { key: "AVG_LOUDNESS", label: "Průměrná hlasitost", hint: "EBU R128 / loudness (ffmpeg)" },
];

const CANCEL_MSG = "Upload canceled";

function mapJobStatusToAnalysisState(status?: string | null): AnalysisState {
  switch (status) {
    case "QUEUED":
      return "queued";
    case "RUNNING":
      return "running";
    case "COMPLETED":
      return "completed";
    case "FAILED":
      return "failed";
    default:
      return "idle";
  }
}

function analysisLabelFromState(s: AnalysisState, rawStatus?: string | null) {
  const status = rawStatus ?? "";
  switch (s) {
    case "idle":
      return "—";
    case "creating":
      return "Zakládám job…";
    case "queued":
      return `Ve frontě (${status || "QUEUED"})`;
    case "running":
      return `Zpracovávám (${status || "RUNNING"})`;
    case "completed":
      return `Hotovo (${status || "COMPLETED"}) ✅`;
    case "failed":
      return `Chyba (${status || "FAILED"})`;
  }
}

export default function UploadFilePage() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const [state, setState] = useState<UploadState>("idle");
  const [progress, setProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // checkboxes
  const [selectedChecks, setSelectedChecks] = useState<CheckKey[]>([
    "RESOLUTION",
    "FPS",
    "BITRATE",
    "AVG_LOUDNESS",
  ]);

  // analysis
  const [analysisState, setAnalysisState] = useState<AnalysisState>("idle");
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<string | null>(null);
  const [jobError, setJobError] = useState<string | null>(null);
  const [jobResultJson, setJobResultJson] = useState<any>(null);

  const xhrRef = useRef<XMLHttpRequest | null>(null);
  const videoIdRef = useRef<string | null>(null);
  const cancelRequestedRef = useRef(false);

  const resetAnalysisUi = () => {
    setAnalysisState("idle");
    setJobId(null);
    setJobStatus(null);
    setJobError(null);
    setJobResultJson(null);
  };

  const resetLocalUi = () => {
    setState("idle");
    setProgress(0);
    setErrorMsg(null);
    cancelRequestedRef.current = false;
    videoIdRef.current = null;
    resetAnalysisUi();
  };

  const toggleCheck = (key: CheckKey) => {
    setSelectedChecks((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) {
      setSelectedFile(file);
      resetLocalUi();
    }
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      resetLocalUi();
    }
  };

  const handleClearFile = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (xhrRef.current) xhrRef.current.abort();
    xhrRef.current = null;

    setSelectedFile(null);
    resetLocalUi();
  };

  const markFailedBestEffort = async (reason: string) => {
    const videoId = videoIdRef.current;
    if (!videoId) return;

    await fetch("/api/upload/fail", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ videoId, reason }),
      keepalive: true,
    }).catch(() => {});
  };

  const markCanceledBestEffort = async () => {
    const videoId = videoIdRef.current;
    if (!videoId) return;

    await fetch("/api/upload/cancel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ videoId }),
      keepalive: true,
    }).catch(() => {});
  };

  const handleCancel = async () => {
    if (state !== "uploading") return;

    cancelRequestedRef.current = true;

    if (xhrRef.current) {
      xhrRef.current.abort();
      xhrRef.current = null;
    }

    await markCanceledBestEffort();
    setState("canceled");
    setErrorMsg(null);
  };

  // když user zavře tab uprostřed uploadu
  useEffect(() => {
    const onPageHide = () => {
      if (state === "uploading" || state === "completing" || state === "preparing") {
        if (cancelRequestedRef.current) {
          void markCanceledBestEffort();
        } else {
          void markFailedBestEffort("pagehide");
        }
      }
    };

    window.addEventListener("pagehide", onPageHide);
    return () => window.removeEventListener("pagehide", onPageHide);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const createAnalysisJob = async (videoId: string) => {
    if (selectedChecks.length === 0) throw new Error("Vyber alespoň jednu kontrolu.");

    setAnalysisState("creating");
    setJobError(null);
    setJobResultJson(null);

    const res = await fetch("/api/analyses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ videoId, checks: selectedChecks }),
    });

    if (!res.ok) {
      const j = await res.json().catch(() => null);
      throw new Error(j?.error ?? `Failed to create analysis job (${res.status})`);
    }

    const j = await res.json();
    const id = j?.job?.id as string | undefined;
    const status = (j?.job?.status as string | undefined) ?? "QUEUED";

    if (!id) throw new Error("Analysis job created but no jobId returned.");

    setJobId(id);
    setJobStatus(status);

    // ✅ tady nastavujeme analysisState podle statusu hned
    setAnalysisState(mapJobStatusToAnalysisState(status));
  };

  // ✅ Polling jen dokud není terminal
  useEffect(() => {
    if (!jobId) return;

    let stopped = false;

    const tick = async () => {
      if (stopped) return;

      const res = await fetch(`/api/analyses/${jobId}`, { cache: "no-store" });
      if (!res.ok) return;

      const j = await res.json().catch(() => null);
      const job = j?.job;

      const status = (job?.status as string | undefined) ?? null;

      // ✅ TADY byl tvůj bug – musíš vždy aktualizovat status i UI state
      setJobStatus(status);
      setAnalysisState(mapJobStatusToAnalysisState(status));

      setJobError((job?.errorMessage as string | undefined) ?? null);
      setJobResultJson(job?.resultJson ?? null);

      if (status === "COMPLETED" || status === "FAILED") {
        stopped = true;
        clearInterval(interval);
      }
    };

    tick();
    const interval = window.setInterval(tick, 1500);

    return () => {
      stopped = true;
      clearInterval(interval);
    };
  }, [jobId]);

  const handleSend = async () => {
    if (!selectedFile) return;

    setErrorMsg(null);
    setProgress(0);
    setState("preparing");

    cancelRequestedRef.current = false;
    videoIdRef.current = null;
    resetAnalysisUi();

    try {
      // 1) init upload
      const initRes = await fetch("/api/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: selectedFile.name,
          contentType: selectedFile.type || "video/mp4",
          size: selectedFile.size,
        }),
      });

      if (!initRes.ok) {
        const j = await initRes.json().catch(() => null);
        throw new Error(j?.error ?? `Init failed (${initRes.status})`);
      }

      const { videoId, upload } = await initRes.json();
      videoIdRef.current = videoId;

      const { url, fields } = upload;

      // 2) upload do S3
      setState("uploading");

      const formData = new FormData();
      for (const [k, v] of Object.entries(fields)) formData.append(k, v as string);
      formData.append("file", selectedFile);

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhrRef.current = xhr;

        xhr.open("POST", url);

        xhr.upload.onprogress = (e) => {
          if (!e.lengthComputable) return;
          const pct = Math.round((e.loaded / e.total) * 100);
          setProgress(pct);
        };

        xhr.onload = () => {
          if (xhr.status === 201 || xhr.status === 204) resolve();
          else reject(new Error(`S3 upload failed (${xhr.status}): ${xhr.responseText}`));
        };

        xhr.onerror = () => reject(new Error("S3 upload network error"));
        xhr.onabort = () => reject(new Error(CANCEL_MSG));

        xhr.send(formData);
      });

      xhrRef.current = null;
      setProgress(100);

      // 3) complete
      setState("completing");
      const completeRes = await fetch("/api/upload/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoId }),
      });

      if (!completeRes.ok) {
        const j = await completeRes.json().catch(() => null);
        throw new Error(j?.error ?? `Complete failed (${completeRes.status})`);
      }

      setState("done");

      // 4) create analysis job
      await createAnalysisJob(videoId);
    } catch (err: any) {
      const msg = err?.message ?? "Unknown error";

      if (msg === CANCEL_MSG) {
        setState("canceled");
        setErrorMsg(null);
        if (!cancelRequestedRef.current) {
          await markCanceledBestEffort();
        }
      } else {
        setState("error");
        setErrorMsg(msg);
        if (!cancelRequestedRef.current) {
          await markFailedBestEffort(msg);
        }
      }
    }
  };

  const uploadStatusLabel = (() => {
    switch (state) {
      case "idle":
        return "Připraveno";
      case "preparing":
        return "Připravuji upload…";
      case "uploading":
        return `Nahrávám… ${progress}%`;
      case "completing":
        return "Ukládám stav…";
      case "done":
        return "Hotovo ✅";
      case "canceled":
        return "Zrušeno";
      case "error":
        return "Chyba";
    }
  })();

  const isBusy = state === "preparing" || state === "uploading" || state === "completing";
  const analysisLabel = analysisLabelFromState(analysisState, jobStatus);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-8 gap-8">
      <h1 className="text-2xl font-bold">Upload Video</h1>

      {/* CHECKBOXES */}
      <div className="w-full max-w-md space-y-3">
        <Label>Co chceš zkontrolovat</Label>
        <div className="rounded-lg border p-3 space-y-3">
          {CHECKS.map((c) => (
            <label key={c.key} className="flex items-start gap-3 cursor-pointer">
              <Checkbox
                checked={selectedChecks.includes(c.key)}
                onCheckedChange={() => toggleCheck(c.key)}
                disabled={isBusy || analysisState !== "idle"} // po startu jobu už neměnit
              />
              <div className="leading-tight">
                <div className="font-medium">{c.label}</div>
                <div className="text-sm text-muted-foreground">{c.hint}</div>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* UPLOAD */}
      <div className="w-full max-w-md space-y-2">
        <Label>Upload souboru</Label>
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`
            relative border-2 border-dashed rounded-lg h-32 flex items-center justify-center text-center cursor-pointer
            transition-colors duration-200
            ${isDragging ? "border-primary bg-primary/10" : "border-muted-foreground/25 hover:border-primary/50"}
            ${isBusy ? "opacity-60 pointer-events-none" : ""}
          `}
          onClick={() => document.getElementById("file-input")?.click()}
        >
          {selectedFile && (
            <button
              onClick={handleClearFile}
              className="absolute top-2 right-2 w-6 h-6 flex items-center justify-center text-red-500 hover:text-red-700 hover:bg-red-100 rounded-full transition-colors"
              aria-label="Remove file"
            >
              ✕
            </button>
          )}
          <input id="file-input" type="file" className="hidden" onChange={handleFileSelect} />
          {selectedFile ? (
            <p className="text-lg font-medium truncate max-w-[90%] px-4">{selectedFile.name}</p>
          ) : (
            <div className="space-y-2">
              <p className="text-lg font-medium">Drag and drop a file here</p>
              <p className="text-sm text-muted-foreground">or click to browse</p>
            </div>
          )}
        </div>

        <div className="mt-4 space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Upload</span>
            <span>{uploadStatusLabel}</span>
          </div>

          {(state === "uploading" || state === "completing" || state === "done") && (
            <Progress value={progress} />
          )}

          {errorMsg && <p className="text-sm text-red-600">{errorMsg}</p>}
        </div>
      </div>

      <div className="flex gap-3">
        <Button onClick={handleSend} disabled={!selectedFile || isBusy} size="lg" className="px-10">
          Send
        </Button>

        <Button
          type="button"
          variant="secondary"
          onClick={handleCancel}
          disabled={state !== "uploading"}
          size="lg"
        >
          Cancel
        </Button>
      </div>

      {/* ANALYSIS */}
      {jobId && (
        <div className="w-full max-w-md space-y-2">
          <Label>Analýza</Label>

          <div className="rounded-lg border p-3 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Stav</span>
              <span>{analysisLabel}</span>
            </div>

            <div className="text-sm text-muted-foreground">
              Job ID: <span className="font-mono text-foreground">{jobId}</span>
            </div>

            {jobError && <p className="text-sm text-red-600">{jobError}</p>}

            {jobResultJson && (
              <details open className="mt-2">
                <summary className="cursor-pointer select-none font-medium">Výsledek (JSON)</summary>
                <pre className="mt-2 max-h-[420px] overflow-auto rounded-md bg-muted p-3 text-xs">
{JSON.stringify(jobResultJson, null, 2)}
                </pre>
              </details>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
