import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  cleanWalletExtras,
  purchaseWalletDilda,
  walletHasDilda,
} from "../frozen/dildamode/src/writing-wallet.js";
import {
  frozenFileHashes,
  verifyFrozenDildaMode,
} from "../scripts/verify-frozen-dildamode.mjs";

test("100-coin isolated unlock rejects insufficient coins and charges exactly once across persisted reload", () => {
  const poor = { coins: 99, session: null };
  assert.equal(purchaseWalletDilda(poor, 10).ok, false);
  assert.equal(poor.coins, 99);
  const first = purchaseWalletDilda({ coins: 200, session: null }, 10);
  assert.equal(first.wallet.coins, 100);
  assert.equal(walletHasDilda(first.wallet), true);
  const stored = JSON.parse(JSON.stringify(first.wallet));
  const restored = {
    coins: stored.coins,
    session: null,
    ...cleanWalletExtras(stored),
  };
  assert.equal(walletHasDilda(restored), true);
  const again = purchaseWalletDilda(restored, 20);
  assert.equal(again.wallet.coins, 100);
  assert.equal(again.alreadyOwned, true);
});

test("frozen verifier rejects changed, removed and newly injected files", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "tyter-frozen-test-"));
  try {
    const trees = {};
    for (const relative of ["frozen/dildamode", "public/dildamode"]) {
      await mkdir(path.join(directory, relative), { recursive: true });
      await writeFile(
        path.join(directory, relative, "index.html"),
        "frozen editor",
      );
      trees[relative] = await frozenFileHashes(path.join(directory, relative));
    }
    await writeFile(
      path.join(directory, "frozen/dildamode/FROZEN.json"),
      JSON.stringify({ trees }),
    );
    assert.equal(await verifyFrozenDildaMode(directory), 2);
    const file = path.join(directory, "public/dildamode/index.html");
    await writeFile(file, "changed");
    await assert.rejects(
      verifyFrozenDildaMode(directory),
      /changed or missing/,
    );
    await rm(file);
    await assert.rejects(
      verifyFrozenDildaMode(directory),
      /changed or missing/,
    );
    await writeFile(file, "frozen editor");
    await writeFile(
      path.join(directory, "public/dildamode/new.js"),
      "injected",
    );
    await assert.rejects(
      verifyFrozenDildaMode(directory),
      /changed or missing/,
    );
  } finally {
    assert.ok(
      path
        .resolve(directory)
        .startsWith(
          path.resolve(os.tmpdir()) + path.sep + "tyter-frozen-test-",
        ),
    );
    await rm(directory, { recursive: true, force: true });
  }
});
