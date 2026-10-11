import { describe, it, expect, vi, afterEach } from "vitest";
import fs from "node:fs";
import { aspectToSize, sniffImageType, normalizeImage, generateWithGpuEndpoint, IMAGE_PROVIDERS } from "../src/lib/render/image-providers.js";

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

describe("image providers", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("lists the three generators with two free ones", () => {
    expect(Object.keys(IMAGE_PROVIDERS)).toEqual(["zerogpu", "gpu", "wavespeed"]);
    expect(Object.values(IMAGE_PROVIDERS).filter((p) => p.free)).toHaveLength(2);
  });

  it("maps aspects to FLUX-friendly sizes (multiples of 16)", () => {
    for (const a of ["4:5", "9:16", "16:9", "1:1", "3:4", "weird"]) {
      const { width, height } = aspectToSize(a);
      expect(width % 16).toBe(0);
      expect(height % 16).toBe(0);
      expect(width * height).toBeLessThanOrEqual(1.2e6);
    }
    expect(aspectToSize("9:16").height).toBeGreaterThan(aspectToSize("9:16").width);
    expect(aspectToSize("16:9").width).toBeGreaterThan(aspectToSize("16:9").height);
  });

  it("converts a Space's WebP output to PNG and passes JPEG/PNG through", async () => {
    const webp = fs.readFileSync("public/seed/apex/1.webp");
    expect(sniffImageType(webp)).toBe("image/webp");
    const out = await normalizeImage({ buffer: webp, contentType: "image/webp" });
    expect(out.contentType).toBe("image/png");
    expect(out.buffer.subarray(0, 4).equals(PNG)).toBe(true);
    const png = fs.readFileSync("public/seed/apex/21.png");
    const same = await normalizeImage({ buffer: png, contentType: "application/octet-stream" });
    expect(same.contentType).toBe("image/png");
    expect(same.buffer).toBe(png);
  }, 30000);

  it("reads the serverless GPU contract: image body, { url } or { image, mime }", async () => {
    const calls = [];
    vi.stubGlobal("fetch", async (url, init) => {
      calls.push({ url, init });
      const body = JSON.parse(init.body);
      if (body.prompt === "png-body") return new Response(PNG, { status: 200, headers: { "content-type": "image/png" } });
      if (body.prompt === "json-url") return Response.json({ url: "https://example.com/out.png" });
      if (body.prompt === "json-b64") return Response.json({ image: PNG.toString("base64"), mime: "image/png", seed: 7 });
      return new Response("bad token", { status: 401 });
    });
    const base = { endpoint: "https://gpu.example/generate", token: "t0k", width: 896, height: 1120, seed: 3 };
    const a = await generateWithGpuEndpoint({ ...base, prompt: "png-body" });
    expect(a.contentType).toBe("image/png");
    expect(a.buffer.equals(PNG)).toBe(true);
    const b = await generateWithGpuEndpoint({ ...base, prompt: "json-url" });
    expect(b.url).toBe("https://example.com/out.png");
    const c = await generateWithGpuEndpoint({ ...base, prompt: "json-b64" });
    expect(c.buffer.equals(PNG)).toBe(true);
    await expect(generateWithGpuEndpoint({ ...base, prompt: "nope" })).rejects.toThrow(/401/);
    expect(calls[0].init.headers.Authorization).toBe("Bearer t0k");
    expect(JSON.parse(calls[0].init.body)).toMatchObject({ prompt: "png-body", width: 896, height: 1120, seed: 3, steps: 4 });
    await expect(generateWithGpuEndpoint({ ...base, endpoint: "", prompt: "x" })).rejects.toThrow(/No serverless GPU endpoint/);
  });
});
