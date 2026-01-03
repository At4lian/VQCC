/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useState, useCallback, useRef, useEffect } from "react";
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

export default function UploadFilePage() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const [state, setState] = useState<UploadState>("idle");
  const [progress, setProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // checkboxes (MVP default)
  const [selectedChecks, setSelectedChecks] = useState<CheckKey[]>(["RESOLUTION", "FPS"]);

  // analysis job UI
  const [analysisState, setAnalysisState] = useState<AnalysisState>("idle");
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<string | null>(null);
  const [jobError, setJobError] = useState<string | null>(null);
  const [jobResultJson, setJobResultJson] = useState<any>(null);

  const xhrRef = useRef<XMLHttpRequest | null>(null);

  // držíme videoId mimo React state, aby bylo okamžitě dostupné v catch/handlers
  const videoIdRef = useRef<string | null>(null);

  // rozlišení "uživatel klikl Cancel" vs. "něco upload abortnulo samo"
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

    // zruš probíhající upload
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
    }).catch(() => {});
  };

  const markCanceledBestEffort = async () => {
    const videoId = videoIdRef.current;
    if (!videoId) return;

    await fetch("/api/upload/cancel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ videoId }),
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

  const createAnalysisJob = async (videoId: string) => {
    if (selectedChecks.length === 0) {
      throw new Error("Vyber alespoň jednu kontrolu.");
    }

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
    const status = j?.job?.status as string | undefined;

    if (!id) throw new Error("Analysis job created but no jobId returned.");

    setJobId(id);
    setJobStatus(status ?? "QUEUED");
    setAnalysisState(status === "RUNNING" ? "running" : "queued");
  };

  const handleSend = async () => {
    if (!selectedFile) return;

    setErrorMsg(null);
    setProgress(0);
    setState("preparing");

    cancelRequestedRef.current = false;
    videoIdRef.current = null;
    resetAnalysisUi();

    try {
      // 1) init -> presigned POST
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

      // 2) upload -> přímo do S3 s progress
      setState("uploading");

      const formData = new FormData();
      for (const [k, v] of Object.entries(fields)) formData.append(k, v as string);

      if (!("Content-Type" in fields) && selectedFile.type) {
        formData.append("Content-Type", selectedFile.type);
      }

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

      // 3) complete -> ověření HeadObject + DB
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

      // 4) vytvoř analysis job (FÁZE 1/2: DB + enqueue do SQS)
      await createAnalysisJob(videoId);

      setState("done");
      videoIdRef.current = null;
      cancelRequestedRef.current = false;
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : typeof err === "string" ? err : "Unknown error";

      if (message === CANCEL_MSG || cancelRequestedRef.current) {
        setState("canceled");
        setErrorMsg(null);
        await markCanceledBestEffort();
        return;
      }

      await markFailedBestEffort(message);

      setState("error");
      setErrorMsg(message);
    } finally {
      xhrRef.current = null;
    }
  };

  // Best-effort: když uživatel zavře tab / refreshne stránku během uploadu
  useEffect(() => {
    const onPageHide = () => {
      const videoId = videoIdRef.current;
      if (!videoId) return;
      if (state !== "preparing" && state !== "uploading") return;

      try {
        const payload = JSON.stringify({
          videoId,
          reason: "Page closed during upload",
        });

        navigator.sendBeacon(
          "/api/upload/fail",
          new Blob([payload], { type: "application/json" })
        );
      } catch {
        // ignore
      }
    };

    window.addEventListener("pagehide", onPageHide);
    return () => window.removeEventListener("pagehide", onPageHide);
  }, [state]);

  // Poll job status (FÁZE 1: pouze DB; FÁZE 3: worker bude měnit statusy)
useEffect(() => {
  if (!jobId) return;

  let stopped = false;

  const tick = async () => {
    if (stopped) return;

    const res = await fetch(`/api/analyses/${jobId}`, { cache: "no-store" });
    if (!res.ok) return;

    const j = await res.json();
    const s = j?.job?.status as string | undefined;

    setJobStatus(s ?? null);
    setJobError(j?.job?.errorMessage ?? null);
    setJobResultJson(j?.job?.resultJson ?? null);

    if (s === "COMPLETED" || s === "FAILED") {
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


  const statusLabel = (() => {
    switch (state) {
      case "idle":
        return "Připraveno";
      case "preparing":
        return "Připravuji upload…";
      case "uploading":
        return `Nahrávám… ${progress}%`;
      case "completing":
        return "Ověřuji upload…";
      case "done":
        return "Hotovo ✅";
      case "canceled":
        return "Zrušeno";
      case "error":
        return "Chyba";
    }
  })();

  const analysisLabel = (() => {
    if (!jobId) return "—";
    if (analysisState === "creating") return "Vytvářím job…";
    if (analysisState === "queued") return "Ve frontě (QUEUED)";
    if (analysisState === "running") return "Zpracovává se (RUNNING)";
    if (analysisState === "completed") return "Dokončeno (COMPLETED)";
    if (analysisState === "failed") return "Selhalo (FAILED)";
    return jobStatus ?? "—";
  })();

  const isBusyUpload = state === "preparing" || state === "uploading" || state === "completing";
  const isBusy = isBusyUpload || analysisState === "creating";
  const canSend = !!selectedFile && selectedChecks.length > 0 && !isBusy;

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-8 gap-8">
      <h1 className="text-2xl font-bold">Upload & Analyze</h1>

      <div className="w-full max-w-md space-y-4">
        {/* DROPZONE */}
        <div className="space-y-2">
          <Label>Upload a file</Label>
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`
              relative border-2 border-dashed rounded-lg h-32 flex items-center justify-center text-center cursor-pointer
              transition-colors duration-200
              ${isDragging ? "border-primary bg-primary/10" : "border-muted-foreground/25 hover:border-primary/50"}
              ${isBusyUpload ? "opacity-60 pointer-events-none" : ""}
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
        </div>

        {/* CHECKBOXES */}
        <div className="space-y-2">
          <Label>Co zkontrolovat</Label>
          <div className={`space-y-2 rounded-lg border p-4 ${isBusy ? "opacity-60" : ""}`}>
            {CHECKS.map((c) => (
              <label key={c.key} className="flex items-start gap-3 cursor-pointer select-none">
                <Checkbox
                  checked={selectedChecks.includes(c.key)}
                  disabled={isBusy}
                  onCheckedChange={(v) => {
                    // shadcn může poslat boolean nebo "indeterminate"
                    if (v === "indeterminate") return;
                    toggleCheck(c.key);
                  }}
                />
                <div className="flex flex-col">
                  <span className="font-medium">{c.label}</span>
                  <span className="text-sm text-muted-foreground">{c.hint}</span>
                </div>
              </label>
            ))}
            {selectedChecks.length === 0 && (
              <p className="text-sm text-red-600 mt-2">Vyber alespoň jednu kontrolu.</p>
            )}
          </div>
        </div>

        {/* UPLOAD STATUS + PROGRESS */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Upload</span>
            <span>{statusLabel}</span>
          </div>

          {(state === "uploading" || state === "completing" || state === "done") && (
            <Progress value={progress} />
          )}

          {errorMsg && <p className="text-sm text-red-600">{errorMsg}</p>}
        </div>

        {/* JOB STATUS */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Analýza</span>
            <span>{analysisLabel}</span>
          </div>

          {jobId && (
            <div className="text-xs text-muted-foreground flex items-center justify-between">
              <span>Job ID</span>
              <span className="font-mono">{jobId}</span>
            </div>
          )}

          {jobError && <p className="text-sm text-red-600">{jobError}</p>}

          {jobResultJson && (
            <details className="rounded-md border p-3">
              <summary className="cursor-pointer text-sm">Výsledek (JSON)</summary>
              <pre className="mt-2 text-xs overflow-auto whitespace-pre-wrap">
                {JSON.stringify(jobResultJson, null, 2)}
              </pre>
            </details>
          )}
        </div>

        {/* ACTIONS */}
        <div className="flex gap-3">
          <Button onClick={handleSend} disabled={!canSend} size="lg" className="flex-1">
            Upload & Analyze
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
      </div>
    </div>
  );
}
