# Dilda Mode — frozen 2026-10-27

Independent snapshot of Tyter's editor at `/dildamode/`. Canonical requested address: `https://tyter.github.io/dildamode/`.

Open Coins → Shop → Miscellaneous → Dilda Mode. It costs 100 locally earned coins once. After purchase, use the same tile to open the game. Choose the voxel item or tomato, aim and click/tap the screenplay. Every shot plays a synthesized “УУУУ”. Tomato hits leave red splats; hits on paper are counted. Close or Escape restores editing. The visual effects never modify screenplay content.

The model is 186 colored, depth-tested WebGL voxels sampled from the supplied reference. The tomato is a low-poly sphere with block leaves. Rendering sleeps while idle and stops on exit. A static fallback is available without WebGL. The sound is a local PCM WAV, with no external speech/voice service.

Storage, wallet, history, browser file handles and libraries use independent names. This edition starts with its own empty document; import a local TYT copy to use an existing screenplay. It never automatically reads the main editor's filesystem connection.

`public/dildamode/` contains the compiled app plus a frozen copy of its assets. Its sources and fonts never resolve to the main `src/` or root assets. There is no service worker registration. Main builds copy the compiled directory and verify its SHA-256 manifest; they do not compile this source. No new dependencies were added.

**Never update this edition.** Future general Tyter requests exclude both this source directory and the public output. The historical one-time build and freeze commands are intentionally locked after FROZEN.json exists.
