import os
import json
import time
import tempfile
import traceback
import requests
import boto3

from checks import check_resolution_fps_bitrate, check_avg_loudness

API_BASE_URL = os.environ.get("API_BASE_URL", "http://localhost:3000").rstrip("/")
WORKER_TOKEN = os.environ["WORKER_TOKEN"]
SQS_QUEUE_URL = os.environ["SQS_QUEUE_URL"]
AWS_REGION = os.environ.get("AWS_REGION", "eu-central-1")

sqs = boto3.client("sqs", region_name=AWS_REGION)
s3 = boto3.client("s3", region_name=AWS_REGION)

def api_post(path: str, payload: dict | None = None):
    url = f"{API_BASE_URL}{path}"
    r = requests.post(
        url,
        json=payload,
        headers={"Authorization": f"Bearer {WORKER_TOKEN}"},
        timeout=30,
        allow_redirects=False,   # 👈 důležité
    )

    if 300 <= r.status_code < 400:
        raise RuntimeError(f"Redirected ({r.status_code}) to: {r.headers.get('location')}")

    ct = (r.headers.get("content-type") or "").lower()
    if "application/json" not in ct:
        raise RuntimeError(f"Non-JSON response ({r.status_code}) content-type={ct} body={r.text[:200]}")

    return r


def process_job(job_id: str):
    # 1) claim
    r = api_post(f"/api/internal/jobs/{job_id}/claim")
    if r.status_code == 409:
        # už někdo claimnul / hotovo => idempotence: OK, můžeme smazat zprávu
        print(f"[{job_id}] not claimable: {r.text}")
        return "noop"
    r.raise_for_status()

    print("CLAIM", r.status_code, r.url, r.headers.get("content-type"))
    print("BODY", (r.text or "")[:200])
    print("HISTORY", [h.status_code for h in r.history])


    job = r.json()["job"]
    requested = job["requested"]
    va = job["videoAsset"]
    bucket = va["storageBucket"]
    key = va["storageKey"]

    print(f"[{job_id}] claimed, checks={requested}, s3={bucket}/{key}")

    with tempfile.TemporaryDirectory() as td:
        local_path = os.path.join(td, "video")
        # 2) download video
        s3.download_file(bucket, key, local_path)

        # 3) run checks
        result = {
            "jobId": job_id,
            "requested": requested,
            "checks": {},
        }

        # ffprobe “kombinovaný” běh (rychlé)
        combined = check_resolution_fps_bitrate(local_path)

        if "RESOLUTION" in requested:
            result["checks"]["RESOLUTION"] = combined["resolution"]

        if "FPS" in requested:
            result["checks"]["FPS"] = combined["fps"]

        if "BITRATE" in requested:
            result["checks"]["BITRATE"] = combined["bitrate"]

        # loudness (pomalejší)
        if "AVG_LOUDNESS" in requested:
            loud = check_avg_loudness(local_path)
            result["checks"]["AVG_LOUDNESS"] = loud["loudnorm"]

        # 4) complete
        rc = api_post(f"/api/internal/jobs/{job_id}/complete", {"resultJson": result})
        rc.raise_for_status()
        print(f"[{job_id}] completed")

    return "completed"

def main():
    print("Worker started")
    while True:
        resp = sqs.receive_message(
            QueueUrl=SQS_QUEUE_URL,
            MaxNumberOfMessages=1,
            WaitTimeSeconds=20,  # long polling
        )

        msgs = resp.get("Messages", [])
        if not msgs:
            continue

        msg = msgs[0]
        receipt = msg["ReceiptHandle"]

        try:
            body = json.loads(msg["Body"])
            job_id = body["jobId"]
        except Exception:
            # špatná zpráva -> smaž
            print("Invalid message body, deleting:", msg.get("Body"))
            sqs.delete_message(QueueUrl=SQS_QUEUE_URL, ReceiptHandle=receipt)
            continue

        try:
            outcome = process_job(job_id)
            # smaž zprávu až po complete/noop
            sqs.delete_message(QueueUrl=SQS_QUEUE_URL, ReceiptHandle=receipt)
        except Exception as e:
            err = f"{type(e).__name__}: {str(e)}"
            tb = traceback.format_exc(limit=5)
            print(f"[{job_id}] FAILED: {err}\n{tb}")

            # best effort fail update (ať job nezůstane RUNNING navždy)
            try:
                api_post(f"/api/internal/jobs/{job_id}/fail", {"errorMessage": err})
            except Exception:
                pass

            # NEmažeme zprávu -> SQS retry; po maxReceiveCount skončí v DLQ
            # malý sleep proti okamžitému re-pollingu
            time.sleep(2)

if __name__ == "__main__":
    main()
