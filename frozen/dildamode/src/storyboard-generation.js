const BASE = "https://aihorde.net/api/v2";
const HEADERS = {
  apikey: "0000000000",
  "Client-Agent": "Tyter:1.0:https://tyterapp.github.io",
};
const abortError = () => new DOMException("Generation cancelled", "AbortError");
export class StoryboardGenerationError extends Error {
  constructor(code) {
    super(code);
    this.name = "StoryboardGenerationError";
    this.code = code;
  }
}
export function generationDescription(scene) {
  return (
    scene.settings.synopsis ||
    [
      scene.title,
      ...scene.blocks
        .filter((node) => ["action", "plain"].includes(node.attrs?.format))
        .map((node) =>
          (node.content || [])
            .map((part) => part.text || (part.type === "hardBreak" ? "\n" : ""))
            .join(""),
        ),
    ]
      .filter(Boolean)
      .join("\n")
  ).slice(0, 4000);
}
export function hordeStoryboardRequest({
  description,
  count = 3,
  style = "sketch",
  aspectRatio,
}) {
  const text = String(description || "").trim();
  if (!text || text.length > 4000)
    throw new StoryboardGenerationError("description");
  if (!Number.isInteger(count) || count < 2 || count > 4)
    throw new StoryboardGenerationError("count");
  const ratio = Number(aspectRatio) || 16 / 9;
  const [width, height] =
    ratio < 0.9 ? [448, 768] : ratio < 1.2 ? [640, 640] : [768, 448];
  const visual =
    style === "cinematic"
      ? "cinematic film still, natural light, detailed composition"
      : "professional storyboard drawing, expressive pencil sketch, grayscale, clear silhouettes";
  return {
    prompt: `${visual}, single frame, one coherent scene. ${text} ### text, watermark, logo, collage, grid, split screen, multiple panels`,
    params: {
      width,
      height,
      steps: 20,
      n: count,
      cfg_scale: 6,
      sampler_name: "k_euler",
      karras: true,
    },
    models: ["stable_diffusion", "Deliberate"],
    nsfw: false,
    censor_nsfw: true,
    trusted_workers: true,
    r2: false,
    allow_downgrade: true,
  };
}
const wait = (ms, signal) =>
  new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(abortError());
    const end = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", cancel);
      resolve();
    };
    const cancel = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", cancel);
      reject(abortError());
    };
    const timer = setTimeout(end, ms);
    signal?.addEventListener("abort", cancel, { once: true });
  });
function errorForStatus(status) {
  return new StoryboardGenerationError(
    status === 429
      ? "busy"
      : status === 400
        ? "request"
        : [401, 403, 402].includes(status)
          ? "anonymous"
          : "service",
  );
}
async function api(path, { signal, method = "GET", body, fetchImpl }) {
  const timeout = AbortSignal.timeout(30000);
  let response;
  try {
    response = await fetchImpl(`${BASE}${path}`, {
      method,
      headers: {
        ...HEADERS,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      credentials: "omit",
      referrerPolicy: "no-referrer",
      cache: "no-store",
    });
  } catch {
    if (signal?.aborted) throw abortError();
    throw new StoryboardGenerationError("network");
  }
  if (!response.ok) throw errorForStatus(response.status);
  try {
    return await response.json();
  } catch {
    throw new StoryboardGenerationError("service");
  }
}
export async function generateStoryboardFrames(
  options,
  {
    fetchImpl = fetch,
    delay = wait,
    now = Date.now,
    onProgress = () => {},
    signal,
  } = {},
) {
  const body = hordeStoryboardRequest(options);
  let id,
    completed = false;
  try {
    if (signal?.aborted) throw abortError();
    onProgress({ state: "submitting", finished: 0, total: body.params.n });
    const accepted = await api("/generate/async", {
      method: "POST",
      body,
      fetchImpl,
      signal,
    });
    if (typeof accepted.id !== "string" || !/^[\w-]{8,100}$/.test(accepted.id))
      throw new StoryboardGenerationError("service");
    id = accepted.id;
    const started = now();
    let errors = 0;
    while (true) {
      if (signal?.aborted) throw abortError();
      if (now() - started > 8 * 60 * 1000)
        throw new StoryboardGenerationError("timeout");
      let status;
      try {
        status = await api(`/generate/check/${id}`, { fetchImpl, signal });
        errors = 0;
      } catch (error) {
        if (error.name === "AbortError") throw error;
        if (++errors > 3) throw error;
        onProgress({
          state: "reconnecting",
          finished: 0,
          total: body.params.n,
        });
        await delay(5000 * errors, signal);
        continue;
      }
      if (status.faulted) throw new StoryboardGenerationError("service");
      onProgress({
        state: status.processing ? "generating" : "queued",
        finished: Math.max(
          0,
          Math.min(body.params.n, Number(status.finished) || 0),
        ),
        total: body.params.n,
        waitSeconds: Math.max(0, Number(status.wait_time) || 0),
      });
      if (status.done) break;
      if (status.is_possible === false)
        throw new StoryboardGenerationError("workers");
      await delay(5000, signal);
    }
    const result = await api(`/generate/status/${id}`, { fetchImpl, signal });
    const images = (Array.isArray(result.generations) ? result.generations : [])
      .filter((entry) => !entry.censored && entry.img)
      .slice(0, body.params.n);
    if (!images.length) throw new StoryboardGenerationError("empty");
    completed = true;
    return images;
  } finally {
    if (id && !completed) {
      try {
        await api(`/generate/status/${id}`, { method: "DELETE", fetchImpl });
      } catch {
        /* The provider also expires abandoned jobs. */
      }
    }
  }
}
export async function generatedImageFile(
  generation,
  { fetchImpl = fetch, signal } = {},
) {
  let blob;
  if (/^https:\/\//.test(generation.img)) {
    const url = new URL(generation.img);
    if (url.username || url.password)
      throw new StoryboardGenerationError("image");
    const response = await fetchImpl(url.href, {
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(30000)])
        : AbortSignal.timeout(30000),
      credentials: "omit",
      referrerPolicy: "no-referrer",
    });
    if (!response.ok) throw new StoryboardGenerationError("image");
    blob = await response.blob();
  } else {
    const data = String(generation.img).replace(
      /^data:image\/(?:webp|png|jpeg);base64,/,
      "",
    );
    if (data.length > 8 * 1024 * 1024 || !/^[A-Za-z0-9+/=]+$/.test(data))
      throw new StoryboardGenerationError("image");
    const bytes = Uint8Array.from(atob(data), (char) => char.charCodeAt(0));
    const type =
      bytes[0] === 137
        ? "image/png"
        : bytes[0] === 0xff
          ? "image/jpeg"
          : "image/webp";
    blob = new Blob([bytes], { type });
  }
  if (
    !blob.size ||
    blob.size > 5 * 1024 * 1024 ||
    !["image/png", "image/jpeg", "image/webp"].includes(blob.type)
  )
    throw new StoryboardGenerationError("image");
  return new File([blob], "storyboard-generation", { type: blob.type });
}
