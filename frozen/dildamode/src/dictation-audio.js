// Local amplitude only: no recording, playback, or audio uploads from this meter.
export function createDictationAudio() {
  let context,
    source,
    analyser,
    samples,
    stream,
    closed = false;
  try {
    const Audio = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (Audio) {
      context = new Audio({ latencyHint: "interactive" });
      context.resume().catch(() => {});
    }
  } catch {
    /* Speech events remain available if Web Audio is unavailable. */
  }
  return {
    async start() {
      if (closed || !context || !navigator.mediaDevices?.getUserMedia) return;
      try {
        const input = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true },
          video: false,
        });
        if (closed) {
          input.getTracks().forEach((track) => track.stop());
          return;
        }
        stream = input;
        source = context.createMediaStreamSource(input);
        analyser = context.createAnalyser();
        analyser.fftSize = 256;
        samples = new Uint8Array(analyser.fftSize);
        source.connect(analyser);
      } catch {
        /* A meter failure must not stop browser dictation. */
      }
    },
    sample() {
      if (closed || !analyser || context.state !== "running") return null;
      analyser.getByteTimeDomainData(samples);
      let power = 0;
      for (const value of samples) power += ((value - 128) / 128) ** 2;
      return Math.min(
        1,
        Math.max(0, (Math.sqrt(power / samples.length) - 0.012) * 7),
      );
    },
    dispose() {
      if (closed) return;
      closed = true;
      stream?.getTracks().forEach((track) => track.stop());
      source?.disconnect();
      analyser?.disconnect();
      context?.close().catch(() => {});
      analyser = null;
    },
  };
}
