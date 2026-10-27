import { useEffect, useRef } from "react";

export function useLampSwitchSound(enabled) {
  const context = useRef(null);
  useEffect(
    () => () => {
      context.current?.close().catch(() => {});
      context.current = null;
    },
    [enabled],
  );
  return () => {
    if (!enabled) return;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      const audio = (context.current ??= new AudioContext());
      if (audio.state === "suspended") audio.resume().catch(() => {});
      const buffer = audio.createBuffer(
        1,
        Math.ceil(audio.sampleRate * 0.035),
        audio.sampleRate,
      );
      const samples = buffer.getChannelData(0);
      for (let i = 0; i < samples.length; i++)
        samples[i] =
          (Math.random() * 2 - 1) * Math.exp(-i / (audio.sampleRate * 0.004));
      const source = audio.createBufferSource(),
        gain = audio.createGain();
      source.buffer = buffer;
      gain.gain.value = 0.16;
      source.connect(gain).connect(audio.destination);
      source.onended = () => {
        source.disconnect();
        gain.disconnect();
      };
      source.start();
    } catch {
      /* Audio may be unavailable; the switch still works. */
    }
  };
}
