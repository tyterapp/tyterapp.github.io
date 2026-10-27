export const TELEGRAPH_FREQUENCY = 600;

// A held key owns one oscillator. No sample is looped or restarted mid-press.
export function createTelegraphAudio(
  Context = globalThis.AudioContext || globalThis.webkitAudioContext,
) {
  let context,
    voice,
    requested = false,
    disposed = false,
    generation = 0;
  const stop = () => {
    requested = false;
    generation++;
    if (!voice) return;
    const { oscillator, gain } = voice;
    voice = null;
    const now = context.currentTime;
    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(gain.gain.value, now);
    gain.gain.linearRampToValueAtTime(0, now + 0.008);
    oscillator.stop(now + 0.01);
  };
  return {
    supported: !!Context,
    async unlock(resume = true) {
      if (disposed || !Context) return false;
      try {
        context ||= new Context();
        if (context.state !== "running" && resume) await context.resume();
        return !disposed && context.state === "running";
      } catch {
        return false;
      }
    },
    start() {
      if (disposed || requested || !Context) return;
      requested = true;
      const current = ++generation;
      try {
        context ||= new Context();
        const play = () => {
          if (disposed || !requested || current !== generation) return;
          const oscillator = context.createOscillator(),
            gain = context.createGain();
          oscillator.type = "sine";
          oscillator.frequency.value = TELEGRAPH_FREQUENCY;
          gain.gain.setValueAtTime(0, context.currentTime);
          gain.gain.linearRampToValueAtTime(0.12, context.currentTime + 0.006);
          oscillator.connect(gain).connect(context.destination);
          oscillator.onended = () => {
            oscillator.disconnect();
            gain.disconnect();
          };
          voice = { oscillator, gain };
          oscillator.start();
        };
        if (context.state === "running") play();
        else
          context
            .resume()
            .then(play)
            .catch(() => {});
      } catch {
        // Audio availability must never interrupt Morse input.
        requested = false;
      }
    },
    stop,
    dispose() {
      if (disposed) return;
      stop();
      disposed = true;
      context?.close().catch(() => {});
    },
  };
}
