"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";

type UploadState =
  | "idle"
  | "preparing"
  | "uploading"
  | "completing"
  | "done"
  | "error"
  | "canceled";

const CANCEL_MSG = "Upload canceled";

export default function UploadFilePage() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const [state, setState] = useState<UploadState>("idle");
  const [progress, setProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const xhrRef = useRef<XMLHttpRequest | null>(null);

  // držíme videoId mimo React state, aby bylo okamžitě dostupné v catch/handlers
  const videoIdRef = useRef<string | null>(null);

  // rozlišení "uživatel klikl Cancel" vs. "něco upload abortnulo samo"
  const cancelRequestedRef = useRef(false);

  const resetLocalUi = () => {
    setState("idle");
    setProgress(0);
    setErrorMsg(null);
    cancelRequestedRef.current = false;
    videoIdRef.current = null;
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

    // best-effort: neblokuj UI, ignoruj chyby
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
    // cancel může dávat smysl jen při uploadingu
    if (state !== "uploading") return;

    cancelRequestedRef.current = true;

    // 1) Abort XHR
    if (xhrRef.current) {
      xhrRef.current.abort();
      xhrRef.current = null;
    }

    // 2) Řekni backendu "cancel" (best-effort)
    await markCanceledBestEffort();

    setState("canceled");
    setErrorMsg(null);
  };

  const handleSend = async () => {
    if (!selectedFile) return;

    setErrorMsg(null);
    setProgress(0);
    setState("preparing");

    cancelRequestedRef.current = false;
    videoIdRef.current = null;

    try {
      // 1) init -> získej presigned POST
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

      // pokud backend nepřidal Content-Type do fields, přidej ho ty (ale jen jednou)
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
          // S3 presigned POST často vrací 204 nebo 201
          if (xhr.status === 201 || xhr.status === 204) resolve();
          else reject(new Error(`S3 upload failed (${xhr.status}): ${xhr.responseText}`));
        };

        xhr.onerror = () => reject(new Error("S3 upload network error"));
        xhr.onabort = () => reject(new Error(CANCEL_MSG));

        xhr.send(formData);
      });

      xhrRef.current = null;
      setProgress(100);

      // 3) complete -> DB status UPLOADED (tady už backend dělá HeadObject verifikaci)
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
      // po úspěchu vyčisti ref, ať se omylem nepošle fail
      videoIdRef.current = null;
      cancelRequestedRef.current = false;
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : typeof err === "string" ? err : "Unknown error";

      // pokud to bylo explicitní zrušení
      if (message === CANCEL_MSG || cancelRequestedRef.current) {
        setState("canceled");
        setErrorMsg(null);
        // cancel endpoint už voláme v handleCancel; kdyby k abortu došlo jinak, zkus i tak cancel
        await markCanceledBestEffort();
        return;
      }

      // jinak je to fail -> zapiš do DB (best-effort)
      await markFailedBestEffort(message);

      setState("error");
      setErrorMsg(message);
    } finally {
      xhrRef.current = null;
    }
  };

  // Best-effort: když uživatel zavře tab / refreshne stránku během uploadu,
  // zkusíme "fail" poslat přes sendBeacon (není garantované, ale pomáhá).
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

        // sendBeacon posílá POST a snaží se doručit i při zavírání stránky
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

  const statusLabel = (() => {
    switch (state) {
      case "idle":
        return "Připraveno";
      case "preparing":
        return "Připravuji upload…";
      case "uploading":
        return `Nahrávám… ${progress}%`;
      case "completing":
        return "Ověřuji upload a ukládám stav…";
      case "done":
        return "Hotovo ✅";
      case "canceled":
        return "Zrušeno";
      case "error":
        return "Chyba";
    }
  })();

  const isBusy = state === "preparing" || state === "uploading" || state === "completing";

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-8 gap-8">
      <h1 className="text-2xl font-bold">Upload Video</h1>

      <div className="w-full max-w-md space-y-2">
        <Label>Upload a file</Label>
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

        {/* Status + progress */}
        <div className="mt-4 space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Stav</span>
            <span>{statusLabel}</span>
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
    </div>
  );
}
