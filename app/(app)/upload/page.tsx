"use client";

import { useState, useCallback, useRef } from "react";
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

export default function UploadFilePage() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const [state, setState] = useState<UploadState>("idle");
  const [progress, setProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const xhrRef = useRef<XMLHttpRequest | null>(null);

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
      setState("idle");
      setProgress(0);
      setErrorMsg(null);
    }
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setState("idle");
      setProgress(0);
      setErrorMsg(null);
    }
  };

  const handleClearFile = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (xhrRef.current) xhrRef.current.abort();
    xhrRef.current = null;

    setSelectedFile(null);
    setState("idle");
    setProgress(0);
    setErrorMsg(null);
  };

  const handleCancel = () => {
    if (xhrRef.current) {
      xhrRef.current.abort();
      xhrRef.current = null;
      setState("canceled");
      setErrorMsg(null);
    }
  };

  const handleSend = async () => {
    if (!selectedFile) return;

    setErrorMsg(null);
    setProgress(0);
    setState("preparing");

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
      const { url, fields } = upload;

      // 2) upload -> přímo do S3 s progress
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
          // S3 presigned POST často vrací 204 nebo 201
          if (xhr.status === 201 || xhr.status === 204) resolve();
          else reject(new Error(`S3 upload failed (${xhr.status}): ${xhr.responseText}`));
        };

        xhr.onerror = () => reject(new Error("S3 upload network error"));
        xhr.onabort = () => reject(new Error("Upload canceled"));

        xhr.send(formData);
      });

      xhrRef.current = null;
      setProgress(100);

      // 3) complete -> DB status UPLOADED
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      setState(err?.message === "Upload canceled" ? "canceled" : "error");
      setErrorMsg(err?.message ?? "Unknown error");
    }
  };

  const statusLabel = (() => {
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
