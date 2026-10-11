"""
FLUX.1 [schnell] (Apache 2.0) as a serverless GPU endpoint for Influenci's
"Your serverless GPU" image provider. Runs on Modal, inside its free monthly
compute allowance for light use, then pay-per-second.

Deploy:
    pip install modal
    modal setup                         # once, links your Modal account
    modal secret create influenci-image IMAGE_GPU_TOKEN=<long random string>
    modal deploy scripts/modal_flux_schnell.py

Then in Influenci → Settings → Platform apps → AI → Image generator:
    provider  = Your serverless GPU
    endpoint  = the https://…modal.run URL printed by the deploy
    token     = the same IMAGE_GPU_TOKEN

Contract (what Influenci sends / expects):
    POST <endpoint>   Authorization: Bearer <token>
    { "prompt": str, "negative_prompt": str, "width": int, "height": int, "seed": int|null, "steps": int }
    → 200 { "image": "<base64 png>", "mime": "image/png", "seed": int }
"""
import base64
import io
import os
import random

import modal

MODEL = "black-forest-labs/FLUX.1-schnell"

image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install("torch", "diffusers>=0.30", "transformers", "accelerate", "sentencepiece", "protobuf", "fastapi[standard]")
)

app = modal.App("influenci-flux-schnell", image=image)
weights = modal.Volume.from_name("influenci-flux-weights", create_if_missing=True)


@app.cls(gpu="L4", timeout=300, scaledown_window=120, volumes={"/weights": weights}, secrets=[modal.Secret.from_name("influenci-image")])
class Flux:
    @modal.enter()
    def load(self):
        import torch
        from diffusers import FluxPipeline

        self.pipe = FluxPipeline.from_pretrained(MODEL, torch_dtype=torch.bfloat16, cache_dir="/weights")
        self.pipe.to("cuda")
        weights.commit()

    @modal.fastapi_endpoint(method="POST")
    def generate(self, body: dict, request=None):
        from fastapi import HTTPException, Request  # noqa: F401

        expected = os.environ.get("IMAGE_GPU_TOKEN")
        auth = (request.headers.get("authorization") if request is not None else "") or ""
        if expected and auth != f"Bearer {expected}":
            raise HTTPException(status_code=401, detail="bad token")

        import torch

        prompt = str(body.get("prompt") or "").strip()
        if not prompt:
            raise HTTPException(status_code=400, detail="prompt required")
        width = int(body.get("width") or 896)
        height = int(body.get("height") or 1120)
        steps = max(1, min(8, int(body.get("steps") or 4)))
        seed = body.get("seed")
        seed = int(seed) if seed is not None else random.randint(0, 2**31 - 1)
        gen = torch.Generator("cuda").manual_seed(seed)
        out = self.pipe(prompt, width=width - width % 16, height=height - height % 16, num_inference_steps=steps, guidance_scale=0.0, generator=gen).images[0]
        buf = io.BytesIO()
        out.save(buf, format="PNG")
        return {"image": base64.b64encode(buf.getvalue()).decode("ascii"), "mime": "image/png", "seed": seed}
