"""IV Studio in the cloud, on the user's own RunPod account: what every IV Studio pod runs.

IV Studio starts a pod from RunPod's official PyTorch image with the user's network volume at /workspace,
passing this folder (packed into the IV_BUNDLE variable, so the pod runs exactly this app version's files)
and the start command `bash -c "<unpack IV_BUNDLE into /opt/iv> && python3 /opt/iv/runpod_boot.py"`.
Standard library only: it runs before anything is installed.

  1. gate.py starts at once on port 8189, so IV Studio can follow the boot through /iv/health
  2. the first time (or after an update changes cloud.json): a Python, torch, ComfyUI at its pinned tag and
     every pinned node pack, installed into /workspace/iv on the volume, so later pods skip it
  3. every H3 model the volume lacks, downloaded into /workspace/models and checked against the SHA-256
     Hugging Face publishes (the same list Modal's fetch_models uses)
  4. ComfyUI on 127.0.0.1:8188, reading models through extra_model_paths.yaml (/models -> /workspace/models),
     with its input and output folders on the volume
The gate deletes the pod after IV_IDLE_SECONDS with nothing to do; the volume keeps everything.
"""
import hashlib
import json
import os
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

HERE = Path(__file__).parent
W = Path("/workspace/iv")
VENV = W / "venv"
PY = VENV / "bin" / "python"
COMFY = W / "comfy"
MODELS = Path("/workspace/models")
STATUS = Path("/tmp/iv-status.json")
CLOUD = json.loads((HERE / "cloud.json").read_text())


def status(stage, detail="", **extra):
    tmp = STATUS.with_suffix(".tmp")
    tmp.write_text(json.dumps({"stage": stage, "detail": detail, "at": int(time.time()), **extra}))
    tmp.replace(STATUS)
    print(f"[iv] {stage}: {detail}", flush=True)


def sh(cmd, **kw):
    print(f"[iv] $ {cmd}", flush=True)
    subprocess.run(cmd, shell=True, check=True, **kw)


def start_gate():
    try:
        import aiohttp  # noqa: F401
    except ImportError:
        sh(f"{sys.executable} -m pip install -q --break-system-packages aiohttp")
    env = {**os.environ, "IV_PLATFORM": "runpod", "IV_STATUS_FILE": str(STATUS), "IV_MODELS_DIR": str(MODELS)}
    return subprocess.Popen([sys.executable, str(HERE / "gate.py")], env=env)


def system_packages():
    if shutil.which("ffmpeg") and shutil.which("unzip"):
        return
    status("installing", "system packages (ffmpeg)")
    sh("apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq --no-install-recommends ffmpeg unzip libgl1 libglib2.0-0 >/dev/null")


def stamp():
    """What the install on the volume must match: this version's cloud.json."""
    return hashlib.sha256((HERE / "cloud.json").read_bytes()).hexdigest()[:16]


def wait_for_other_install():
    """Two pods on one volume must not install at once. A lock older than an hour is a crashed pod's."""
    lock = W / "install.lock"
    while True:
        try:
            fd = os.open(lock, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
            os.write(fd, os.environ.get("RUNPOD_POD_ID", "?").encode())
            os.close(fd)
            return lock
        except FileExistsError:
            if time.time() - lock.stat().st_mtime > 3600:
                lock.unlink(missing_ok=True)
                continue
            status("installing", "another IV Studio pod is installing; waiting for it")
            time.sleep(20)


def install():
    W.mkdir(parents=True, exist_ok=True)
    if (W / "stamp").exists() and (W / "stamp").read_text().strip() == stamp() and PY.exists():
        return
    lock = wait_for_other_install()
    try:
        if (W / "stamp").exists() and (W / "stamp").read_text().strip() == stamp() and PY.exists():
            return
        status("installing", "Python and torch (first time only, about 5 minutes)")
        if not shutil.which("uv"):
            sh(f"{sys.executable} -m pip install -q --break-system-packages uv")
        shutil.rmtree(VENV, ignore_errors=True)
        shutil.rmtree(COMFY, ignore_errors=True)
        sh(f"uv venv {VENV} --python 3.12 --seed")
        torch = CLOUD.get("torch", {"index": "https://download.pytorch.org/whl/cu128", "packages": ["torch", "torchvision", "torchaudio"]})
        sh(f"uv pip install --python {PY} {' '.join(torch['packages'])} --index-url {torch['index']}")
        comfy = CLOUD.get("comfyui", {"repo": "https://github.com/Comfy-Org/ComfyUI", "tag": "v0.42.5"})
        status("installing", f"ComfyUI {comfy['tag']}")
        sh(f"git clone --depth 1 --branch {comfy['tag']} {comfy['repo']} {COMFY}")
        sh(f"uv pip install --python {PY} -r {COMFY}/requirements.txt")
        packs = CLOUD.get("packs", [])
        for i, p in enumerate(packs, 1):
            status("installing", f"node pack {i} of {len(packs)}: {p['dir']}")
            dest = COMFY / "custom_nodes" / p["dir"]
            if "git" in p:
                sh(f"git clone {p['git']} {dest} && git -C {dest} checkout -q {p['commit']}")
            else:
                # registry archives are usually zips whatever their extension says; try zip, then tar
                sh(f"mkdir -p {dest} && curl -fsSL {p['registry']} -o /tmp/pack && (unzip -q -o /tmp/pack -d {dest} || tar -xzf /tmp/pack -C {dest}) && rm /tmp/pack")
            if (dest / "requirements.txt").exists():
                sh(f"uv pip install --python {PY} -r {dest}/requirements.txt")
        (W / "stamp").write_text(stamp())
    finally:
        lock.unlink(missing_ok=True)


def hf_sha256(url):
    """SHA-256 Hugging Face publishes for an LFS file (X-Linked-ETag), or None."""

    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, *args, **kwargs):
            return None

    try:
        r = urllib.request.build_opener(NoRedirect).open(urllib.request.Request(url, method="HEAD"), timeout=30)
        headers = r.headers
    except urllib.error.HTTPError as e:
        headers = e.headers
    etag = (headers.get("X-Linked-ETag") or "").strip('"')
    return etag if len(etag) == 64 else None


def fetch_models():
    manifest = json.loads((HERE / "models.json").read_text())
    # optional models (character design stills) run on the local PC only, as on Modal
    models = [m for m in manifest["models"] if not m.get("optional")] + CLOUD.get("extraModels", [])
    missing = [m for m in models if not (MODELS / m["folder"] / m["match"]).exists()]
    for i, m in enumerate(missing, 1):
        dest = MODELS / m["folder"] / m["match"]
        dest.parent.mkdir(parents=True, exist_ok=True)
        part = dest.with_name(dest.name + ".part")
        want = hf_sha256(m["url"]) if "huggingface.co" in m["url"] else None
        h = hashlib.sha256()
        try:
            r = urllib.request.urlopen(m["url"], timeout=60)
        except urllib.error.HTTPError as e:
            raise RuntimeError(f"{m['label']}: the host answered {e.code} for {m['url']}") from None
        with r, open(part, "wb") as f:
            total = int(r.headers.get("Content-Length") or 0)
            got, last = 0, 0.0
            while chunk := r.read(1 << 22):
                f.write(chunk)
                h.update(chunk)
                got += len(chunk)
                if time.time() - last > 5:
                    pct = int(got * 100 / total) if total else 0
                    status("models", f"{m['label']} ({i} of {len(missing)}), {pct}%", model=m["id"], percent=pct, done=len(models) - len(missing) + i - 1, total=len(models))
                    last = time.time()
        if want and h.hexdigest() != want:
            part.unlink()
            raise RuntimeError(f"{m['label']} did not match its published checksum; it was removed.")
        part.replace(dest)
        print(f"[iv] model ready: {m['label']}{' (checksum verified)' if want else ''}", flush=True)


def start_comfy():
    nodes = COMFY / "custom_nodes" / "ComfyUI-IV-Studio"  # this version's own small node pack, every boot
    shutil.rmtree(nodes, ignore_errors=True)
    shutil.copytree(HERE / "ComfyUI-IV-Studio", nodes)
    for d in ("input", "output"):
        (W / "data" / d).mkdir(parents=True, exist_ok=True)
    if not Path("/models").exists():
        os.symlink(MODELS, "/models")
    status("starting", "ComfyUI is loading")
    return subprocess.Popen(
        [str(PY), str(COMFY / "main.py"), "--listen", "127.0.0.1", "--port", "8188", "--disable-auto-launch", "--preview-method", "none",
         "--input-directory", str(W / "data" / "input"), "--output-directory", str(W / "data" / "output"),
         "--extra-model-paths-config", str(HERE / "extra_model_paths.yaml")]
    )


def wait_ready(proc):
    while proc.poll() is None:
        try:
            with urllib.request.urlopen("http://127.0.0.1:8188/system_stats", timeout=5):
                status("ready", "ComfyUI is ready", pod=os.environ.get("RUNPOD_POD_ID"))
                return True
        except Exception:  # noqa: BLE001 - not up yet
            time.sleep(3)
    status("error", f"ComfyUI stopped while starting (exit {proc.returncode})")
    return False


def main():
    MODELS.mkdir(parents=True, exist_ok=True)
    status("booting", "starting the gate")
    gate = start_gate()
    try:
        system_packages()
        install()
        fetch_models()
        comfy = start_comfy()
        wait_ready(comfy)
        comfy.wait()
        status("error", f"ComfyUI stopped (exit {comfy.returncode})")
    except Exception as e:  # noqa: BLE001 - the gate stays up so IV Studio can show what went wrong
        status("error", str(e)[:400])
    gate.wait()


if __name__ == "__main__":
    main()
