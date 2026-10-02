"""Shared helpers for the Beast Forge AI Studio.

Everything here is dependency-free (stdlib only) so `ai-studio doctor` works
even when no AI tooling, pip module or venv exists at all. That is deliberate:
the doctor must never crash, because its whole job is to report what is
missing.

Design rules enforced by this module:
  * Model weights and tool installs live under `model_root`, which defaults
    OUTSIDE the repo and outside /tmp. /tmp is wiped on container reset and
    git would otherwise see multi-GB files.
  * Generated output is written to a staging directory first and only
    promoted into the game asset tree by an explicit `promote` command, so
    nothing ever silently overwrites shipped game assets.
"""
from __future__ import annotations

import json
import os
import shutil
import socket
import subprocess
import sys
from pathlib import Path

# tools/ai-studio/scripts/ -> repo root
STUDIO_DIR = Path(__file__).resolve().parent.parent
REPO_ROOT = STUDIO_DIR.parent.parent

# Keys that may be overridden by environment variables.
_ENV_PREFIX = "BF_"


# --------------------------------------------------------------------------
# configuration
# --------------------------------------------------------------------------
def load_config() -> dict:
    """Read config/studio.json, applying BF_* environment overrides."""
    cfg_path = STUDIO_DIR / "config" / "studio.json"
    with open(cfg_path, encoding="utf-8") as fh:
        raw = json.load(fh)

    # $comment keys are documentation only; keep them but never resolve them.
    def walk(node, prefix=""):
        for key, val in list(node.items()):
            if key == "$comment":
                continue
            if isinstance(val, dict):
                walk(val, prefix + key + ".")
            else:
                env_key = _ENV_PREFIX + (prefix + key).upper().replace(".", "_")
                if env_key in os.environ:
                    node[key] = os.environ[env_key]
    walk(raw)

    # Fill in anything absent rather than letting callers KeyError.
    raw.setdefault("paths", {})
    raw["paths"].setdefault("repo_root", ".")
    raw["paths"].setdefault("model_root", "~/.local/share/beast-forge-ai")
    return raw


def _expand(value: str) -> Path:
    p = Path(str(value)).expanduser()
    if not p.is_absolute():
        p = REPO_ROOT / p
    return p.resolve()


def path_for(cfg: dict, dotted: str, default: str | None = None) -> Path:
    """Resolve a dotted config path, e.g. path_for(cfg, 'comfyui.install_dir')."""
    node = cfg
    for part in dotted.split("."):
        if not isinstance(node, dict) or part not in node:
            if default is None:
                raise KeyError(f"config key not found: {dotted}")
            node = default
            break
        node = node[part]
    return _expand(node)


def model_root(cfg: dict) -> Path:
    root = path_for(cfg, "paths.model_root")
    root.mkdir(parents=True, exist_ok=True)
    return root


def staging_root(cfg: dict) -> Path:
    root = path_for(cfg, "paths.staging_root")
    root.mkdir(parents=True, exist_ok=True)
    return root


# --------------------------------------------------------------------------
# process / capability probes
# --------------------------------------------------------------------------
def have(binary: str) -> bool:
    return shutil.which(binary) is not None


def python_modules() -> dict:
    """Probe importability of optional modules without importing the heavy ones."""
    probe = (
        "import importlib.util,sys;"
        "mods=['torch','onnxruntime','piper','kokoro','requests','PIL','soundfile',"
        "'numpy','comfy','playwright'];"
        "print(' '.join(m+'='+str(1 if importlib.util.find_spec(m) else 0) for m in mods))"
    )
    out = subprocess.run([sys.executable, "-c", probe], capture_output=True, text=True)
    if out.returncode != 0:
        return {}
    mods = {}
    for token in out.stdout.split():
        if "=" in token:
            k, v = token.split("=", 1)
            mods[k] = v == "1"
    return mods


def http_probe(url: str, timeout: float = 2.0) -> bool:
    """True if an HTTP endpoint answers. Never raises."""
    try:
        import urllib.error
        import urllib.request
        with urllib.request.urlopen(url, timeout=timeout) as resp:
            return 200 <= resp.status < 500
    except urllib.error.HTTPError:
        # A 4xx still proves something is listening and speaking HTTP.
        return True
    except Exception:
        return False


def port_open(host: str, port: int, timeout: float = 1.0) -> bool:
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except OSError:
        return False


def gpu_info() -> dict:
    """Best-effort GPU detection. Returns a dict, never raises."""
    info = {"present": False, "vendor": None, "name": None, "vram_mb": None}
    if have("nvidia-smi"):
        try:
            out = subprocess.run(
                ["nvidia-smi", "--query-gpu=name,memory.total", "--format=csv,noheader,nounits"],
                capture_output=True, text=True, timeout=15,
            )
            if out.returncode == 0 and out.stdout.strip():
                name, mem = out.stdout.strip().splitlines()[0].split(",")
                info.update(present=True, vendor="nvidia", name=name.strip(),
                            vram_mb=int(float(mem)))
                return info
        except Exception:
            pass
    if Path("/dev/kfd").exists():
        info.update(present=True, vendor="amd")
    return info


def host_resources() -> dict:
    cpus = os.cpu_count() or 0
    ram_mb = None
    try:
        for line in Path("/proc/meminfo").read_text().splitlines():
            if line.startswith("MemTotal:"):
                ram_mb = int(line.split()[1]) // 1024
                break
    except Exception:
        pass
    free_gb = None
    try:
        st = os.statvfs(str(REPO_ROOT))
        free_gb = round(st.f_bavail * st.f_frsize / (1024 ** 3), 1)
    except Exception:
        pass
    return {"cpus": cpus, "ram_mb": ram_mb, "disk_free_gb": free_gb, "gpu": gpu_info()}


# --------------------------------------------------------------------------
# status model
# --------------------------------------------------------------------------
READY = "READY"
RUNNING = "RUNNING (service not reachable)"
NOT_INSTALLED = "NOT INSTALLED"
NOT_RUNNING = "NOT RUNNING"
NOT_AVAILABLE = "NOT AVAILABLE (not supported on this machine)"


def status_line(label: str, state: str, detail: str = "") -> str:
    text = f"{label:<12}{state}"
    if detail:
        text += f"  -- {detail}"
    return text


# --------------------------------------------------------------------------
# output staging + promotion
# --------------------------------------------------------------------------
def next_versioned(dest_dir: Path, stem: str, suffix: str) -> Path:
    """Return a non-colliding path: stem.ogg, stem-2.ogg, ...

    Never overwrites an existing asset, which is a hard requirement for
    generated music and voices.
    """
    dest_dir.mkdir(parents=True, exist_ok=True)
    candidate = dest_dir / f"{stem}{suffix}"
    n = 2
    while candidate.exists():
        candidate = dest_dir / f"{stem}-{n}{suffix}"
        n += 1
    return candidate


def promote(src: Path, dest_dir: Path, stem: str, suffix: str | None = None,
            force: bool = False) -> Path:
    """Copy a staged file into the game asset tree under a versioned name.

    Refuses to overwrite unless force=True.
    """
    if suffix is None:
        suffix = src.suffix
    if not force:
        dest = next_versioned(dest_dir, stem, suffix)
    else:
        dest_dir.mkdir(parents=True, exist_ok=True)
        dest = dest_dir / f"{stem}{suffix}"
    shutil.copy2(src, dest)
    return dest


def eprint(*args) -> None:
    print(*args, file=sys.stderr)