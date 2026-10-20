import { test } from "node:test";
import assert from "node:assert/strict";
import {
  generateStoryboardFrames,
  hordeStoryboardRequest,
  generationDescription,
  generatedImageFile,
} from "../src/storyboard-generation.js";

const options = { description: "Rabbits on a hill", count: 2 };
const response = (data, status = 200) =>
  new Response(JSON.stringify(data), { status });
const job = "test-job-12345";
test("generation only includes reviewed scene description, validates limits and selects fitting image dimensions", () => {
  const scene = {
    title: "HILL",
    settings: {},
    blocks: [
      { attrs: { format: "action" }, content: [{ text: "Rabbits." }] },
      { attrs: { format: "speech" }, content: [{ text: "Private dialogue" }] },
    ],
  };
  assert.equal(generationDescription(scene), "HILL\nRabbits.");
  scene.settings.synopsis = "Reviewed synopsis";
  assert.equal(generationDescription(scene), "Reviewed synopsis");
  const request = hordeStoryboardRequest({ ...options, aspectRatio: 9 / 16 });
  assert.equal(request.params.width, 448);
  assert.equal(request.params.height, 768);
  assert.equal(request.params.n, 2);
  assert.equal(request.r2, false);
  assert.throws(() => hordeStoryboardRequest({ ...options, count: 1 }), {
    code: "count",
  });
  assert.throws(
    () => hordeStoryboardRequest({ ...options, description: " ".repeat(3) }),
    { code: "description" },
  );
  assert.throws(
    () => hordeStoryboardRequest({ ...options, description: "a".repeat(4001) }),
    { code: "description" },
  );
});
test("queue polling recovers from a network error, avoids duplicate submission and filters censored results", async () => {
  const calls = [],
    progress = [],
    delays = [];
  let checks = 0;
  const images = await generateStoryboardFrames(options, {
    delay: async (ms) => delays.push(ms),
    onProgress: (value) => progress.push(value.state),
    fetchImpl: async (url, init) => {
      calls.push([url, init.method]);
      assert.equal(init.credentials, "omit");
      assert.equal(init.headers.apikey, "0000000000");
      if (url.endsWith("/async")) return response({ id: job });
      if (url.includes("/check/")) {
        if (++checks === 1) throw new TypeError("offline");
        return response(
          checks === 2
            ? { done: false, processing: 1, wait_time: 10 }
            : { done: true, finished: 2 },
        );
      }
      return response({
        generations: [
          { img: "one" },
          { img: "hidden", censored: true },
          { img: "two" },
        ],
      });
    },
  });
  assert.deepEqual(
    images.map((item) => item.img),
    ["one", "two"],
  );
  assert.equal(calls.filter(([, method]) => method === "POST").length, 1);
  assert.equal(calls.filter(([, method]) => method === "DELETE").length, 0);
  assert.deepEqual(delays, [5000, 5000]);
  assert.ok(progress.includes("reconnecting"));
  assert.ok(progress.includes("generating"));
});
test("cancellation deletes the accepted job and never retrieves images", async () => {
  const controller = new AbortController(),
    methods = [];
  await assert.rejects(
    generateStoryboardFrames(options, {
      signal: controller.signal,
      delay: async () => controller.abort(),
      fetchImpl: async (url, init) => {
        methods.push(init.method);
        if (init.method === "POST") return response({ id: job });
        if (init.method === "DELETE") {
          assert.equal(init.signal.aborted, false);
          return response({});
        }
        assert.ok(url.includes("/check/"));
        return response({ done: false });
      },
    }),
    { name: "AbortError" },
  );
  assert.deepEqual(methods, ["POST", "GET", "DELETE"]);
});
test("busy responses, impossible jobs, censored batches and timeouts fail without keeping an abandoned job", async () => {
  for (const code of ["busy", "workers", "empty", "timeout"]) {
    const methods = [];
    let tick = 0;
    await assert.rejects(
      generateStoryboardFrames(options, {
        delay: async () => {},
        now: () => (code === "timeout" ? tick++ * 500000 : 0),
        fetchImpl: async (url, init) => {
          methods.push(init.method);
          if (init.method === "POST")
            return code === "busy" ? response({}, 429) : response({ id: job });
          if (init.method === "DELETE") return response({});
          if (url.includes("/check/"))
            return response(
              code === "workers" ? { is_possible: false } : { done: true },
            );
          return response({ generations: [{ img: "hidden", censored: true }] });
        },
      }),
      { code },
    );
    assert.equal(methods.includes("DELETE"), code !== "busy");
  }
});
test("generated image import rejects active content, credentials and oversized results", async () => {
  for (const img of [
    "javascript:alert(1)",
    "data:image/svg+xml;base64,PHN2Zz4=",
    "https://name:secret@example.com/image.png",
    "a".repeat(8 * 1024 * 1024 + 1),
  ])
    await assert.rejects(generatedImageFile({ img }), { code: "image" });
  const file = await generatedImageFile({ img: "iVBORw0KGgo=" });
  assert.equal(file.type, "image/png");
  assert.equal(file.size, 8);
});
