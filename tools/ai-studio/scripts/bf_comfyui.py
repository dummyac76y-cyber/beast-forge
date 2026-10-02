"""ComfyUI engine adapter.

Integrates ComfyUI as an HTTP *service* rather than vendoring it: Beast Forge
never imports ComfyUI's code. We POST an API-format workflow (the JSON graph
ComfyUI itself exports via "Save (API Format)") to /prompt, poll /history, then
download the rendered image from /view.

This is the cleanest integration because:
  * ComfyUI can be installed anywhere, even on another machine on the LAN.
  * No vendored Python, no duplicated model code, no git bloat.
  * Swapping a workflow JSON swaps the whole generation graph.

Requires a running ComfyUI with a checkpoint present. If it is not running the
adapter reports that clearly and raises; it never silently degrades.
"""
from __future__ import annotations

import json
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from pathlib import Path

from bf_studio import http_probe, path_for


class ComfyUIUnavailable(RuntimeError):
    pass


class ComfyUIAdapter:
    def __init__(self, cfg: dict, log=print):
        self.cfg = cfg
        self.log = log
        self.base_url = str(cfg["comfyui"]["url"]).rstrip("/")
        self.timeout = int(cfg["comfyui"].get("timeout_sec", 1800))
        self.poll = float(cfg["comfyui"].get("poll_interval_sec", 3))

    # ---------------------------------------------------------------- probe
    def available(self) -> bool:
        return http_probe(self.base_url + "/system_stats", timeout=2.0)

    def checkpoints(self) -> list[str]:
        """Ask the running server which checkpoints it has loaded on disk."""
        try:
            with urllib.request.urlopen(self.base_url + "/object_info/CheckpointLoaderSimple",
                                        timeout=10) as r:
                info = json.loads(r.read().decode())
            node = info.get("CheckpointLoaderSimple", {})
            return list(node.get("input", {}).get("required", {})
                        .get("ckpt_name", [[]])[0])
        except Exception:
            return []

    def system_stats(self) -> dict:
        try:
            with urllib.request.urlopen(self.base_url + "/system_stats", timeout=10) as r:
                return json.loads(r.read().decode())
        except Exception:
            return {}

    # ------------------------------------------------------------ workflows
    def load_workflow(self, path: Path | None = None) -> dict:
        if path is None:
            path = path_for(self.cfg, "comfyui.default_workflow")
        with open(path, encoding="utf-8") as fh:
            return json.load(fh)

    @staticmethod
    def bind(graph: dict, **values) -> dict:
        """Bind values into a workflow by node input name.

        ComfyUI API workflows expose every editable input under
        node['inputs']['<name>'][0]. Writing there is stable across graph
        rearrangements, unlike hardcoding node ids.
        """
        graph = json.loads(json.dumps(graph))  # deep copy
        for key, value in values.items():
            node_id, _, input_name = key.partition(".")
            if node_id not in graph:
                raise KeyError(f"workflow has no node '{node_id}' (nodes: "
                               f"{', '.join(sorted(graph))})")
            inputs = graph[node_id].setdefault("inputs", {})
            if input_name not in inputs:
                raise KeyError(f"node '{node_id}' has no input '{input_name}'")
            slot = inputs[input_name]
            # Most inputs are [value, metadata]; flags are bare booleans.
            if isinstance(slot, list):
                slot[0] = value
            else:
                inputs[input_name] = value
        return graph

    # -------------------------------------------------------------- generate
    def queue(self, graph: dict) -> str:
        client_id = str(uuid.uuid4())
        payload = urllib.parse.urlencode({"json_data": json.dumps(graph),
                                          "client_id": client_id}).encode()
        req = urllib.request.Request(self.base_url + "/prompt", data=payload,
                                     headers={"Content-Type":
                                              "application/x-www-form-urlencoded"})
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                out = json.loads(r.read().decode())
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode(errors="replace")[:400]
            raise ComfyUIUnavailable(f"ComfyUI rejected the workflow ({exc.code}): {detail}")
        except Exception as exc:
            raise ComfyUIUnavailable(f"cannot reach ComfyUI at {self.base_url}: {exc}")
        return out["prompt_id"]

    def wait(self, prompt_id: str) -> dict:
        deadline = time.time() + self.timeout
        while time.time() < deadline:
            try:
                with urllib.request.urlopen(
                        self.base_url + f"/history/{prompt_id}", timeout=30) as r:
                    hist = json.loads(r.read().decode())
                if prompt_id in hist:
                    entry = hist[prompt_id]
                    status = entry.get("status", {})
                    if status.get("status_str") == "error":
                        raise ComfyUIUnavailable(
                            "ComfyUI reported a workflow error: "
                            + json.dumps(status.get("messages", []))[:400])
                    return entry
            except ComfyUIUnavailable:
                raise
            except Exception:
                pass
            time.sleep(self.poll)
        raise ComfyUIUnavailable(
            f"ComfyUI did not finish within {self.timeout}s. On CPU this is "
            f"often expected -- raise comfyui.timeout_sec if you want to wait longer.")

    def outputs(self, entry: dict) -> list[tuple[str, str]]:
        """Return (filename, subfolder, type) for each produced image."""
        found = []
        for node_out in entry.get("outputs", {}).values():
            for kind in ("images", "gifs"):
                for item in node_out.get(kind, []):
                    found.append((item.get("filename", ""),
                                  item.get("subfolder", ""),
                                  item.get("type", "output")))
        return found

    def download(self, filename: str, subfolder: str, kind: str, dest: Path) -> Path:
        params = urllib.parse.urlencode({"filename": filename, "subfolder": subfolder,
                                         "type": kind})
        url = f"{self.base_url}/view?{params}"
        dest.parent.mkdir(parents=True, exist_ok=True)
        with urllib.request.urlopen(url, timeout=300) as r:
            dest.write_bytes(r.read())
        return dest

    def generate_image(self, workflow_path: Path, bindings: dict,
                       dest: Path) -> Path:
        if not self.available():
            raise ComfyUIUnavailable(
                f"ComfyUI is not reachable at {self.base_url}. Start it with "
                f"'python main.py' in your ComfyUI checkout, or set BF_COMFYUI_URL.")
        graph = self.bind(self.load_workflow(workflow_path), **bindings)
        self.log(f"  queuing workflow {workflow_path.name}")
        prompt_id = self.queue(graph)
        self.log(f"  prompt_id={prompt_id}; waiting (this is the slow part on CPU)")
        entry = self.wait(prompt_id)
        items = self.outputs(entry)
        if not items:
            raise ComfyUIUnavailable("ComfyUI finished but produced no image.")
        filename, subfolder, kind = items[0]
        self.log(f"  downloading {filename}")
        return self.download(filename, subfolder, kind, dest)