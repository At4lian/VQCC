import json
import subprocess
import re

def _run(cmd: list[str], timeout_s: int = 300) -> tuple[int, str, str]:
    p = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout_s)
    return p.returncode, p.stdout, p.stderr

def _parse_fraction(fr: str) -> float | None:
    if not fr or fr == "0/0":
        return None
    if "/" in fr:
        a, b = fr.split("/", 1)
        try:
            return float(a) / float(b)
        except:
            return None
    try:
        return float(fr)
    except:
        return None

def ffprobe_info(path: str) -> dict:
    cmd = ["ffprobe", "-v", "error", "-show_streams", "-show_format", "-print_format", "json", path]
    code, out, err = _run(cmd, timeout_s=60)
    if code != 0:
        raise RuntimeError(f"ffprobe failed ({code}): {err[:500]}")
    return json.loads(out)

def check_resolution_fps_bitrate(path: str) -> dict:
    info = ffprobe_info(path)

    streams = info.get("streams", [])
    vstream = next((s for s in streams if s.get("codec_type") == "video"), None)

    width = vstream.get("width") if vstream else None
    height = vstream.get("height") if vstream else None

    fps = None
    if vstream:
        fps = _parse_fraction(vstream.get("avg_frame_rate") or vstream.get("r_frame_rate") or "")

    # bitrate: prefer format.bit_rate, fallback stream.bit_rate
    fmt = info.get("format", {}) or {}
    br = fmt.get("bit_rate") or (vstream.get("bit_rate") if vstream else None)
    bitrate_bps = int(br) if br and str(br).isdigit() else None

    return {
        "ffprobe": info,
        "resolution": {"width": width, "height": height},
        "fps": {"value": fps},
        "bitrate": {
            "bps": bitrate_bps,
            "kbps": (bitrate_bps / 1000.0) if bitrate_bps else None,
        },
    }

def check_avg_loudness(path: str) -> dict:
    # loudnorm umí vypsat JSON do stderr
    cmd = [
        "ffmpeg", "-hide_banner", "-i", path,
        "-af", "loudnorm=print_format=json",
        "-f", "null", "-"
    ]
    code, out, err = _run(cmd, timeout_s=600)
    if code != 0:
        raise RuntimeError(f"ffmpeg loudnorm failed ({code}): {err[:800]}")

    # najdi JSON blok ve stderr
    m = re.search(r"(\{[\s\S]*?\})\s*$", err.strip())
    if not m:
        # někdy je JSON uprostřed; zkus najít poslední '{'
        last = err.rfind("{")
        if last == -1:
            raise RuntimeError("Could not parse loudnorm JSON output")
        candidate = err[last:]
        m2 = re.search(r"(\{[\s\S]*\})", candidate)
        if not m2:
            raise RuntimeError("Could not parse loudnorm JSON output")
        data = json.loads(m2.group(1))
    else:
        data = json.loads(m.group(1))

    return {"loudnorm": data}
