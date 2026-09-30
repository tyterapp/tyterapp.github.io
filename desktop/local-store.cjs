const path = require("node:path");
const { createHash } = require("node:crypto");
const {
  mkdir,
  readdir,
  readFile,
  writeFile,
  rename,
  access,
} = require("node:fs/promises");

const FILE_PATTERN = /^document-[a-f0-9]{20}\.tyter\.json$/;
const TOMBSTONE_PATTERN = /^document-[a-f0-9]{20}\.tyter\.json\.deleted$/;
const validId = (id) => typeof id === "string" && /^[\w-]{1,100}$/.test(id);

function createLocalStore(directory, openFolder) {
  let queue = Promise.resolve();
  const fileFor = (id) =>
    path.join(
      directory,
      `document-${createHash("sha256").update(id).digest("hex").slice(0, 20)}.tyter.json`,
    );
  const validate = async (value) => {
    const { validateImport } = await import("../src/data.js");
    return validateImport(value);
  };
  const enqueue = (operation) => {
    const next = queue.catch(() => {}).then(operation);
    queue = next.catch(() => {});
    return next;
  };
  return async (endpoint, body) => {
    if (endpoint === "documents" && body === undefined) {
      await queue;
      await mkdir(directory, { recursive: true });
      const names = await readdir(directory);
      const documents = await Promise.all(
        names
          .filter((name) => FILE_PATTERN.test(name))
          .map(async (name) =>
            validate(
              JSON.parse(await readFile(path.join(directory, name), "utf8")),
            ),
          ),
      );
      const deletedIds = await Promise.all(
        names
          .filter((name) => TOMBSTONE_PATTERN.test(name))
          .map(
            async (name) =>
              JSON.parse(await readFile(path.join(directory, name), "utf8")).id,
          ),
      );
      return { directory, documents, deletedIds };
    }
    if (endpoint === "open-folder") {
      await queue;
      await mkdir(directory, { recursive: true });
      const error = await openFolder(directory);
      if (error) throw new Error(error);
      return { directory };
    }
    if (endpoint === "delete-document") {
      if (!validId(body?.id)) throw new Error("Некорректный идентификатор.");
      return enqueue(async () => {
        const target = fileFor(body.id);
        try {
          await rename(target, target + ".deleted");
        } catch (error) {
          if (error.code !== "ENOENT") throw error;
        }
        return { deleted: body.id };
      });
    }
    if (endpoint === "documents") {
      if (
        !Array.isArray(body?.documents) ||
        body.documents.some((doc) => !validId(doc?.id))
      )
        throw new Error("Некорректные документы.");
      const documents = await Promise.all(body.documents.map(validate));
      return enqueue(async () => {
        await mkdir(directory, { recursive: true });
        for (const doc of documents) {
          const target = fileFor(doc.id);
          try {
            await access(target + ".deleted");
            continue;
          } catch (error) {
            if (error.code !== "ENOENT") throw error;
          }
          try {
            const existing = await validate(
              JSON.parse(await readFile(target, "utf8")),
            );
            if (existing.updatedAt > doc.updatedAt) continue;
          } catch (error) {
            if (error.code !== "ENOENT") throw error;
          }
          const temp = target + ".tmp";
          await writeFile(temp, JSON.stringify(doc, null, 2), "utf8");
          await rename(temp, target);
        }
        return { directory };
      });
    }
    throw new Error("Неподдерживаемый запрос.");
  };
}

module.exports = { createLocalStore };
