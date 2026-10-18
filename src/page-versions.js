import { Fragment, Schema, Slice } from "@tiptap/pm/model";
import { StepMap, Transform } from "@tiptap/pm/transform";
import { SCRIPT_VERSIONS } from "./script-version-colors.js";
import { mergeComponentExtraData } from "./component-data-extras.js";

const ids = new Set(SCRIPT_VERSIONS.map(({ id }) => id));
const copy = (value) => structuredClone(value);
const makeId = () =>
  globalThis.crypto?.randomUUID?.() ||
  `page-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
const activeVersion = (document) =>
  ids.has(document.scriptVersion) ? document.scriptVersion : "white";
const snapshotFields = [
  "content",
  "revisionRound",
  "sceneVariants",
  "sceneShots",
  "outline",
  "components",
  "relationships",
  "graphLayout",
  "componentLibraryId",
  "componentFolders",
  "collapsedComponentFolders",
  "props",
  "propFolders",
  "collapsedPropFolders",
  "comments",
  "settings",
  "metadata",
  "cover",
];
const snapshot = (document) =>
  copy(
    Object.fromEntries(
      snapshotFields
        .filter((key) => Object.hasOwn(document, key))
        .map((key) => [key, document[key]]),
    ),
  );

// This is the editor's persisted schema, without DOM or React dependencies.
// Slice openness is essential: a physical page can begin inside a paragraph.
export const pageVersionSchema = new Schema({
  nodes: {
    doc: { content: "paragraph+" },
    paragraph: {
      group: "block",
      content: "inline*",
      attrs: {
        format: { default: "action" },
        blockId: { default: null },
        sceneVariant: { default: null },
        scriptRevision: { default: null },
      },
    },
    text: { group: "inline" },
    hardBreak: { inline: true, group: "inline", selectable: false },
  },
  marks: {
    bold: {},
    italic: {},
    underline: {},
    strike: {},
    comment: {
      attrs: { id: { default: null } },
      inclusive: false,
      excludes: "",
    },
    entity: {
      attrs: {
        id: { default: null },
        color: { default: "#9b6ee7" },
        automatic: { default: false },
      },
      inclusive: false,
      excludes: "",
    },
    scriptRevision: {
      attrs: { version: { default: "white" }, round: { default: 0 } },
      inclusive: false,
      excludes: "",
    },
  },
});

const nodeCache = new WeakMap();
const nodeOf = (document) => {
  let node = nodeCache.get(document.content);
  if (!node) {
    node = pageVersionSchema.nodeFromJSON(document.content);
    nodeCache.set(document.content, node);
  }
  return node;
};
const emptyBlock = () => ({
  type: "paragraph",
  attrs: {
    format: "action",
    blockId: makeId(),
    sceneVariant: null,
    scriptRevision: null,
  },
});
const emptySlice = () => ({
  slice: { content: [emptyBlock()], openStart: 0, openEnd: 0 },
  firstBlockOffset: 0,
  firstBlockId: null,
  sceneVariants: {},
  sceneShots: {},
});
function sliceAt(node, from, to) {
  const resolved = node.resolve(from);
  const slice = node.slice(from, to, true);
  return {
    slice: slice.toJSON() || { content: [], openStart: 0, openEnd: 0 },
    firstBlockOffset: resolved.depth ? resolved.parentOffset : 0,
    firstBlockId: resolved.depth
      ? resolved.parent.attrs.blockId
      : slice.content.firstChild?.attrs.blockId || null,
  };
}
function normalizedStarts(starts, size) {
  return [
    ...new Set(
      [0, ...(Array.isArray(starts) ? starts : [])].filter(
        (at) => Number.isInteger(at) && at >= 0 && at < size,
      ),
    ),
  ].sort((a, b) => a - b);
}
function rangesFor(node, starts) {
  const positions = normalizedStarts(starts, node.content.size);
  return positions.map((from, index) => ({
    from,
    to: positions[index + 1] ?? node.content.size,
  }));
}
function checkedPages(document) {
  return document.pageVersions?.version === 1 &&
    Array.isArray(document.pageVersions.pages)
    ? document.pageVersions.pages
    : [];
}

// Explicitly selected page copies keep their own start. Automatic continuation
// pages flow with the preceding page until the user selects their version.
export function pageVersionBreaks(state) {
  return (state?.pages || [])
    .filter((page) => page.to > page.from)
    .slice(1)
    .filter((page) => page.flow !== true)
    .map((page) => page.from);
}

function ownedSceneIds(entry) {
  return (entry.slice.content || [])
    .filter(
      (block, index) =>
        block.attrs?.format === "scene" && (index || !entry.slice.openStart),
    )
    .map((block) => block.attrs.blockId);
}

function ownedSceneData(source, entry) {
  const headings = new Set(ownedSceneIds(entry));
  return Object.fromEntries(
    ["sceneVariants", "sceneShots"].map((key) => [
      key,
      copy(
        Object.fromEntries(
          Object.entries(source[key] || {}).filter(([id]) => headings.has(id)),
        ),
      ),
    ]),
  );
}

function completeSceneData(document, entry, versionId) {
  const legacy = document.pageVersions?.legacyVersions?.[versionId];
  const legacyHeadings = new Set(
    (legacy?.content?.content || [])
      .filter((block) => block.attrs?.format === "scene")
      .map((block) => block.attrs.blockId),
  );
  const result = { ...entry };
  for (const key of ["sceneVariants", "sceneShots"]) {
    if (Object.hasOwn(entry, key)) continue;
    result[key] = {};
    for (const id of ownedSceneIds(entry)) {
      const source = legacyHeadings.has(id) ? legacy : document;
      if (Object.hasOwn(source?.[key] || {}, id))
        result[key][id] = copy(source[key][id]);
    }
  }
  return result;
}

function normalizeLegacyResources(document, archives) {
  let next = document;
  const legacyVersions = {};
  const keys = [
    "componentFolders",
    "propFolders",
    "components",
    "relationships",
    "props",
    "comments",
  ];
  const known = Object.fromEntries(
    keys.map((key) => [
      key,
      new Map((document[key] || []).map((item) => [item.id, item])),
    ]),
  );
  for (const { id: version } of SCRIPT_VERSIONS) {
    if (!archives[version]) continue;
    const source = copy(archives[version]);
    if (version === activeVersion(document)) {
      legacyVersions[version] = source;
      continue;
    }
    const maps = {};
    const accept = (key, items) =>
      (items || []).map((item) => {
        let id = item.id;
        const existing = known[key].get(id);
        if (existing && JSON.stringify(existing) !== JSON.stringify(item)) {
          let counter = 0;
          const base = `${String(id).slice(0, 70)}-pv-${version}`;
          id = base;
          while (known[key].has(id)) id = `${base}-${++counter}`;
          (maps[key] ||= new Map()).set(item.id, id);
        }
        const result = { ...item, id };
        known[key].set(id, result);
        return result;
      });
    source.componentFolders = accept(
      "componentFolders",
      source.componentFolders,
    );
    source.propFolders = accept("propFolders", source.propFolders);
    source.components = accept(
      "components",
      (source.components || []).map((item) => ({
        ...item,
        folderId: maps.componentFolders?.get(item.folderId) || item.folderId,
      })),
    );
    source.relationships = accept(
      "relationships",
      (source.relationships || []).map((relationship) => ({
        ...relationship,
        sourceComponentId:
          maps.components?.get(relationship.sourceComponentId) ||
          relationship.sourceComponentId,
        targetComponentId:
          maps.components?.get(relationship.targetComponentId) ||
          relationship.targetComponentId,
      })),
    );
    if (
      source.graphLayout?.characterPositions &&
      typeof source.graphLayout.characterPositions === "object" &&
      !Array.isArray(source.graphLayout.characterPositions)
    )
      source.graphLayout = {
        ...source.graphLayout,
        characterPositions: Object.fromEntries(
          Object.entries(source.graphLayout.characterPositions).map(
            ([id, position]) => [maps.components?.get(id) || id, position],
          ),
        ),
      };
    source.props = accept(
      "props",
      (source.props || []).map((item) => ({
        ...item,
        folderId: maps.propFolders?.get(item.folderId) || item.folderId,
        componentId: maps.components?.get(item.componentId) || item.componentId,
      })),
    );
    source.comments = accept("comments", source.comments);
    source.collapsedComponentFolders = (
      source.collapsedComponentFolders || []
    ).map((id) => maps.componentFolders?.get(id) || id);
    source.collapsedPropFolders = (source.collapsedPropFolders || []).map(
      (id) => maps.propFolders?.get(id) || id,
    );
    const visit = (node) => {
      for (const mark of node.marks || []) {
        const mapped =
          mark.type === "comment"
            ? maps.comments?.get(mark.attrs?.id)
            : mark.type === "entity"
              ? maps.props?.get(mark.attrs?.id) ||
                maps.components?.get(mark.attrs?.id)
              : null;
        if (mapped) mark.attrs = { ...mark.attrs, id: mapped };
      }
      (node.content || []).forEach(visit);
    };
    visit(source.content);
    for (const variants of Object.values(source.sceneVariants || {}))
      for (const blocks of Object.values(variants)) blocks.forEach(visit);
    legacyVersions[version] = source;
    next = mergeResources(next, source);
  }
  return { document: next, legacyVersions };
}

export function pageVersionAt(document, position = 0) {
  const pages = checkedPages(document).filter((page) => page.to > page.from);
  return (
    pages.find((page) => position >= page.from && position < page.to) ||
    pages.at(-1) ||
    null
  );
}

export function pageVersionSlice(document, pageId, versionId) {
  const page = checkedPages(document).find(({ id }) => id === pageId);
  if (!page || !ids.has(versionId || page.active)) return null;
  if (!versionId || versionId === page.active) {
    const entry = sliceAt(nodeOf(document), page.from, page.to);
    return { ...entry, ...ownedSceneData(document, entry) };
  }
  return page.versions?.[versionId]
    ? completeSceneData(document, copy(page.versions[versionId]), versionId)
    : null;
}

// Old document-wide branches are archived in full until EACH branch has been
// measured. Offsets from one screenplay must never cut another screenplay.
export function ensurePageVersions(
  document,
  starts = [0],
  { legacyPlans } = {},
) {
  if (checkedPages(document).length)
    return syncPageVersions(document, starts, { legacyPlans });
  const node = nodeOf(document),
    active = activeVersion(document);
  const legacyVersions = copy(document.pageVersions?.legacyVersions || {});
  if (Object.keys(document.scriptVersions || {}).length) {
    legacyVersions[active] = snapshot(document);
    for (const { id } of SCRIPT_VERSIONS)
      if (document.scriptVersions?.[id])
        legacyVersions[id] = snapshot(document.scriptVersions[id]);
  }
  const normalized = normalizeLegacyResources(document, legacyVersions);
  const pages = rangesFor(node, starts).map((range) => ({
    id: makeId(),
    ...range,
    active,
    versions: {},
  }));
  return syncPageVersions(
    {
      ...normalized.document,
      sceneVariants: copy(document.sceneVariants || {}),
      sceneShots: copy(document.sceneShots || {}),
      scriptVersions: {},
      pageVersions: {
        version: 1,
        pages,
        legacyVersions: normalized.legacyVersions,
      },
    },
    starts,
    { legacyPlans },
  );
}

// Existing boundaries follow transactions, not paragraph indices or page
// numbers. Re-measuring an edited page cannot move another page's version.
export function mapPageVersionRanges(document, mapping, newContent) {
  const pages = checkedPages(document);
  if (!pages.length)
    return newContent ? { ...document, content: newContent } : document;
  const content = newContent || document.content;
  const size = pageVersionSchema.nodeFromJSON(content).content.size;
  const live = pages.filter((page) => page.to > page.from);
  const boundaries = live
    .slice(1)
    .map((page) => Math.max(0, Math.min(size, mapping.map(page.from, -1))));
  let previous = 0;
  let index = 0;
  const next = pages.map((page) => {
    if (page.to === page.from) return { ...page, from: previous, to: previous };
    const to =
      index === live.length - 1 ? size : Math.max(previous, boundaries[index]);
    const result = { ...page, from: previous, to };
    previous = to;
    index++;
    return result;
  });
  return {
    ...document,
    content,
    pageVersions: { ...document.pageVersions, pages: next },
  };
}

function importLegacyPlans(document, plans) {
  if (
    !plans ||
    !SCRIPT_VERSIONS.some(
      ({ id }) =>
        document.pageVersions.legacyVersions?.[id] &&
        Array.isArray(plans[id]) &&
        !document.pageVersions.migratedLegacy?.[id],
    )
  )
    return document;
  const state = document.pageVersions;
  const pages = state.pages.map((page) => ({
    ...page,
    versions: { ...page.versions },
  }));
  const migrated = { ...(state.migratedLegacy || {}) };
  for (const { id } of SCRIPT_VERSIONS) {
    const source = state.legacyVersions?.[id];
    if (!source || !Array.isArray(plans[id]) || migrated[id]) continue;
    const node = nodeOf(source),
      ranges = rangesFor(node, plans[id]);
    // A longer dormant branch remains available as additional blank page slots.
    while (pages.length < ranges.length) {
      const last = pages.at(-1),
        node = nodeOf(document),
        from = node.content.size;
      const block = pageVersionSchema.nodeFromJSON(emptyBlock());
      const content = new Transform(node).insert(from, block).doc.toJSON();
      document = { ...document, content };
      pages.push({
        id: makeId(),
        from,
        to: from + block.nodeSize,
        active: last?.active || activeVersion(document),
        versions: {},
      });
    }
    pages.forEach((page, index) => {
      if (page.active === id || page.versions[id]) return;
      if (ranges[index]) {
        const entry = sliceAt(node, ranges[index].from, ranges[index].to);
        page.versions[id] = { ...entry, ...ownedSceneData(source, entry) };
      } else page.versions[id] = emptySlice();
    });
    migrated[id] = true;
  }
  return {
    ...document,
    pageVersions: { ...state, pages, migratedLegacy: migrated },
  };
}

export function syncPageVersions(document, starts = [0], { legacyPlans } = {}) {
  if (!checkedPages(document).length)
    return ensurePageVersions(document, starts, { legacyPlans });
  return importLegacyPlans(document, legacyPlans);
}

function mergeResources(document, source) {
  if (!source) return document;
  const result = { ...document };
  for (const key of [
    "components",
    "relationships",
    "props",
    "comments",
    "componentFolders",
    "propFolders",
  ]) {
    const existing = new Set((document[key] || []).map(({ id }) => id));
    result[key] = [
      ...(document[key] || []),
      ...(source[key] || []).filter(({ id }) => !existing.has(id)).map(copy),
    ];
  }
  for (const key of ["sceneVariants", "sceneShots"])
    result[key] = { ...(source[key] || {}), ...(document[key] || {}) };
  if (source.graphLayout || document.graphLayout)
    result.graphLayout = mergeComponentExtraData(
      { graphLayout: source.graphLayout || {} },
      { graphLayout: document.graphLayout || {} },
    ).graphLayout;
  return result;
}

function repairPageBlockIds(document, pageId, legacySource) {
  const page = checkedPages(document).find(({ id }) => id === pageId);
  const node = nodeOf(document),
    groups = new Map(),
    entries = [];
  let sceneId = null;
  node.forEach((block, pos) => {
    const id = block.attrs.blockId;
    if (block.attrs.format === "scene") sceneId = id;
    const group = groups.get(id) || [];
    const entry = {
      block,
      pos,
      sceneId,
      inside: pos >= page.from && pos + block.nodeSize <= page.to,
    };
    group.push(entry);
    entries.push(entry);
    groups.set(id, group);
  });
  const transform = new Transform(node),
    renames = new Map(),
    known = new Set(groups.keys());
  // Block IDs and resource IDs have different uses, but reserving both prevents
  // an older imported resource from being shadowed by a deterministic copy ID.
  for (const item of [...(document.comments || []), ...(document.props || [])])
    known.add(item.id);
  for (const variants of Object.values(document.sceneVariants || {}))
    for (const blocks of Object.values(variants))
      for (const block of blocks) known.add(block.attrs?.blockId);
  const suffix = String(pageId)
    .replace(/[^\w-]/g, "")
    .slice(0, 36);
  const uniqueId = (old, salt = "") => {
    const base = `${String(old).slice(0, 45)}-pv-${suffix}${salt}`.slice(0, 95);
    let id = base,
      index = 0;
    while (known.has(id)) id = `${base}-${++index}`;
    known.add(id);
    return id;
  };
  for (const [old, blocks] of groups) {
    if (blocks.length < 2) continue;
    const keep = blocks.find((entry) => !entry.inside) || blocks[0];
    for (const entry of blocks) {
      if (entry === keep || !entry.inside) continue;
      const id = uniqueId(old);
      renames.set(old, id);
    }
  }
  if (!renames.size) return document;
  const sceneRenames = new Map(
    entries
      .filter(
        ({ block }) =>
          block.attrs.format === "scene" && renames.has(block.attrs.blockId),
      )
      .map(({ block }) => [
        block.attrs.blockId,
        renames.get(block.attrs.blockId),
      ]),
  );
  // The duplicate scene's cached alternatives belong to the new scene too.
  // Copy their body IDs now; otherwise choosing a scene alternative later would
  // silently recreate duplicate IDs and detach its comments from their text.
  for (const entry of entries) {
    const old = entry.block.attrs.blockId;
    if (entry.inside && sceneRenames.has(entry.sceneId) && !renames.has(old))
      renames.set(old, uniqueId(old));
  }
  const sceneVariants = { ...(document.sceneVariants || {}) },
    sceneShots = { ...(document.sceneShots || {}) };
  for (const [old, id] of sceneRenames) {
    const variants = Object.hasOwn(legacySource || {}, "sceneVariants")
      ? legacySource.sceneVariants?.[old]
      : sceneVariants[old];
    if (variants) {
      sceneVariants[id] = copy(variants);
      for (const blocks of Object.values(sceneVariants[id]))
        for (const block of blocks) {
          const blockId = block.attrs?.blockId;
          if (blockId && !renames.has(blockId))
            renames.set(blockId, uniqueId(blockId));
        }
    }
    const shots = Object.hasOwn(legacySource || {}, "sceneShots")
      ? legacySource.sceneShots?.[old]
      : sceneShots[old];
    if (shots) sceneShots[id] = copy(shots);
  }
  for (const entry of entries) {
    const id = renames.get(entry.block.attrs.blockId);
    if (id && entry.inside)
      transform.setNodeMarkup(entry.pos, undefined, {
        ...entry.block.attrs,
        blockId: id,
      });
  }
  const comments = [...(document.comments || [])],
    props = [...(document.props || [])];
  const commentIds = new Map(),
    propIds = new Map();
  const commentOwners = new Map();
  const rememberComment = (id, blockId, sceneId) => {
    if (!commentOwners.has(id)) commentOwners.set(id, { blockId, sceneId });
  };
  for (const entry of entries) {
    if (
      !entry.inside ||
      !(
        renames.has(entry.block.attrs.blockId) ||
        sceneRenames.has(entry.sceneId)
      )
    )
      continue;
    entry.block.descendants((child) => {
      for (const mark of child.marks)
        if (mark.type.name === "comment")
          rememberComment(
            mark.attrs.id,
            entry.block.attrs.blockId,
            entry.sceneId,
          );
    });
  }
  for (const [sceneId, copiedId] of sceneRenames)
    for (const blocks of Object.values(sceneVariants[copiedId] || {}))
      for (const block of blocks)
        for (const child of block.content || [])
          for (const mark of child.marks || [])
            if (mark.type === "comment")
              rememberComment(mark.attrs?.id, block.attrs?.blockId, sceneId);
  for (const comment of document.comments || []) {
    const owner = commentOwners.get(comment.id);
    if (
      !renames.has(comment.blockId) &&
      !sceneRenames.has(comment.sceneId) &&
      !owner
    )
      continue;
    const id = uniqueId(comment.id, "-comment");
    commentIds.set(comment.id, id);
    const blockId =
      renames.get(comment.blockId) ||
      renames.get(owner?.blockId) ||
      comment.blockId;
    const original = groups
      .get(comment.blockId)
      ?.find((entry) => !entry.inside);
    const replacement = entries.find(
      (entry) =>
        entry.inside && renames.get(entry.block.attrs.blockId) === blockId,
    );
    const offset =
      Number.isInteger(comment.anchor) &&
      original &&
      comment.anchor >= original.pos + 1 &&
      comment.anchor < original.pos + original.block.nodeSize
        ? comment.anchor - original.pos
        : 1;
    comments.push({
      ...comment,
      id,
      blockId,
      sceneId:
        sceneRenames.get(comment.sceneId) ||
        sceneRenames.get(owner?.sceneId) ||
        comment.sceneId,
      anchor: replacement
        ? Math.min(
            replacement.pos + offset,
            replacement.pos + replacement.block.nodeSize - 1,
          )
        : null,
    });
  }
  for (const prop of document.props || []) {
    if (!renames.has(prop.blockId)) continue;
    const id = uniqueId(prop.id, "-prop");
    propIds.set(prop.id, id);
    props.push({ ...prop, id, blockId: renames.get(prop.blockId) });
  }
  const mappedMark = (type, id) =>
    type === "comment"
      ? commentIds.get(id)
      : type === "entity"
        ? propIds.get(id)
        : null;
  for (const entry of entries) {
    if (
      !entry.inside ||
      !(
        renames.has(entry.block.attrs.blockId) ||
        sceneRenames.has(entry.sceneId)
      )
    )
      continue;
    entry.block.descendants((child, offset) => {
      if (!child.isInline) return;
      const pos = entry.pos + 1 + offset;
      for (const mark of child.marks) {
        const id = mappedMark(mark.type.name, mark.attrs.id);
        if (!id) continue;
        transform.removeMark(pos, pos + child.nodeSize, mark);
        transform.addMark(
          pos,
          pos + child.nodeSize,
          mark.type.create({ ...mark.attrs, id }),
        );
      }
    });
  }
  for (const id of sceneRenames.values()) {
    for (const blocks of Object.values(sceneVariants[id] || {})) {
      for (const block of blocks) {
        if (block.attrs?.blockId)
          block.attrs.blockId =
            renames.get(block.attrs.blockId) || block.attrs.blockId;
        for (const child of block.content || [])
          for (const mark of child.marks || []) {
            const mapped = mappedMark(mark.type, mark.attrs?.id);
            if (mapped) mark.attrs = { ...mark.attrs, id: mapped };
          }
      }
    }
  }
  return {
    ...document,
    content: transform.doc.toJSON(),
    comments,
    props,
    sceneVariants,
    sceneShots,
  };
}

function refreshCommentAnchors(document) {
  const anchors = new Map();
  nodeOf(document).descendants((node, pos) => {
    for (const mark of node.marks)
      if (mark.type.name === "comment" && !anchors.has(mark.attrs.id))
        anchors.set(mark.attrs.id, pos);
  });
  let changed = false;
  const comments = (document.comments || []).map((comment) => {
    if (!anchors.has(comment.id) || anchors.get(comment.id) === comment.anchor)
      return comment;
    changed = true;
    return { ...comment, anchor: anchors.get(comment.id) };
  });
  return changed ? { ...document, comments } : document;
}

function restoreOwnedSceneData(document, pageId, previous, target) {
  const page = checkedPages(document).find(({ id }) => id === pageId);
  const outsideHeadings = new Set();
  nodeOf(document).forEach((node, pos) => {
    if (node.attrs.format === "scene" && (pos < page.from || pos >= page.to))
      outsideHeadings.add(node.attrs.blockId);
  });
  const previousIds = ownedSceneIds(previous),
    targetIds = ownedSceneIds(target);
  const next = { ...document };
  for (const key of ["sceneVariants", "sceneShots"]) {
    const values = { ...(document[key] || {}) };
    for (const id of [...previousIds, ...targetIds])
      if (!outsideHeadings.has(id)) delete values[id];
    for (const id of targetIds)
      if (!outsideHeadings.has(id) && Object.hasOwn(target[key] || {}, id))
        values[id] = copy(target[key][id]);
    next[key] = values;
  }
  return next;
}

export function switchPageVersion(document, pageId, versionId) {
  if (!ids.has(versionId)) return document;
  const page = checkedPages(document).find(({ id }) => id === pageId);
  if (!page || page.active === versionId) return document;
  const current = pageVersionSlice(document, pageId, page.active);
  const target = pageVersionSlice(document, pageId, versionId) || current;
  const node = nodeOf(document);
  const source = Slice.fromJSON(pageVersionSchema, target.slice);
  // Fit the saved text to the live edges. Joining an open first/last paragraph
  // preserves the untouched prefix/suffix of a paragraph shared by two pages.
  const replacement = new Slice(
    source.content,
    node.resolve(page.from).depth,
    node.resolve(page.to).depth,
  );
  const transform = new Transform(node).replace(
    page.from,
    page.to,
    replacement,
  );
  let next = mapPageVersionRanges(
    document,
    transform.mapping,
    transform.doc.toJSON(),
  );
  if (page.from === page.to) {
    const index = document.pageVersions.pages.findIndex(
      ({ id }) => id === pageId,
    );
    const added = transform.doc.content.size - node.content.size;
    next.pageVersions = {
      ...next.pageVersions,
      pages: next.pageVersions.pages.map((item, at) => {
        const previous = document.pageVersions.pages[at];
        return at === index
          ? { ...item, from: page.from, to: page.from + added }
          : at < index && previous.to === page.from
            ? {
                ...item,
                to: page.from,
                ...(previous.from === page.from ? { from: page.from } : {}),
              }
            : at > index
              ? {
                  ...item,
                  ...(previous.from === page.from
                    ? { from: page.from + added }
                    : {}),
                  ...(previous.to === page.from
                    ? { to: page.from + added }
                    : {}),
                }
              : item;
      }),
    };
  }
  next.comments = (next.comments || []).map((comment) =>
    Number.isInteger(comment.anchor) &&
    (comment.anchor < page.from || comment.anchor >= page.to)
      ? { ...comment, anchor: transform.mapping.map(comment.anchor, 1) }
      : comment,
  );
  next = mergeResources(
    next,
    document.pageVersions.legacyVersions?.[versionId],
  );
  next.pageVersions = {
    ...next.pageVersions,
    pages: next.pageVersions.pages.map((item) =>
      item.id !== pageId
        ? item
        : {
            ...item,
            active: versionId,
            versions: Object.fromEntries(
              Object.entries({
                ...page.versions,
                [page.active]: current,
              }).filter(([id]) => id !== versionId),
            ),
          },
    ),
  };
  const targetIndex = next.pageVersions.pages.findIndex(
    (item) => item.id === pageId,
  );
  const followingIndex = next.pageVersions.pages.findIndex(
    (item, index) => index > targetIndex && item.to > item.from,
  );
  next.pageVersions = {
    ...next.pageVersions,
    pages: next.pageVersions.pages.map((item, index) =>
      index === targetIndex || index === followingIndex
        ? { ...item, flow: false }
        : item,
    ),
  };
  next = restoreOwnedSceneData(next, pageId, current, target);
  return refreshCommentAnchors(repairPageBlockIds(next, pageId, target));
}

function sourceEntry(document, page, index, versionId) {
  const entry = pageVersionSlice(document, page.id, versionId);
  if (!entry) return null;
  const content = {
    type: "doc",
    content: copy(
      entry.slice.content?.length ? entry.slice.content : [emptyBlock()],
    ),
  };
  const legacy =
    versionId !== page.active
      ? document.pageVersions.legacyVersions?.[versionId] || {}
      : {};
  // The archive supplies old per-version scene alternatives, while the shared
  // resource catalogue also includes copies made to avoid selected-page ID
  // collisions. Keep both so searching a saved page still resolves its marks
  // and its copied scene alternatives after switching back to another version.
  const resources = mergeResources(document, legacy);
  const originalSceneIds = new Set(
    (legacy.content?.content || [])
      .filter((block) => block.attrs?.format === "scene")
      .map((block) => block.attrs.blockId),
  );
  const ownedIds = new Set(ownedSceneIds(entry));
  const sharedSceneVariants = Object.fromEntries(
    Object.entries(document.sceneVariants || {}).filter(
      ([sceneId]) => !originalSceneIds.has(sceneId) && !ownedIds.has(sceneId),
    ),
  );
  const sharedSceneShots = Object.fromEntries(
    Object.entries(document.sceneShots || {}).filter(
      ([sceneId]) => !originalSceneIds.has(sceneId) && !ownedIds.has(sceneId),
    ),
  );
  return {
    id: page.id,
    pageId: page.id,
    pageNumber:
      checkedPages(document)
        .slice(0, index)
        .filter((item) => item.to > item.from).length + 1,
    versionId,
    activeVersionId: page.active,
    active: versionId === page.active,
    from: page.from,
    to: page.to,
    content,
    openStart: entry.slice.openStart || 0,
    openEnd: entry.slice.openEnd || 0,
    continuesPrevious: !!entry.slice.openStart,
    firstBlockOffset: entry.firstBlockOffset || 0,
    firstBlockId:
      entry.firstBlockId || content.content[0]?.attrs?.blockId || null,
    source: {
      ...document,
      ...legacy,
      ...Object.fromEntries(
        [
          "components",
          "relationships",
          "props",
          "comments",
          "componentFolders",
          "propFolders",
        ].map((key) => [key, resources[key]]),
      ),
      ...(resources.graphLayout ? { graphLayout: resources.graphLayout } : {}),
      sceneVariants: { ...sharedSceneVariants, ...entry.sceneVariants },
      sceneShots: { ...sharedSceneShots, ...entry.sceneShots },
      content,
      scriptVersion: versionId,
      scriptVersions: {},
      pageVersions: undefined,
    },
  };
}

export function selectedPageVersions(document) {
  return checkedPages(document).flatMap((page, index) =>
    page.to > page.from
      ? [sourceEntry(document, page, index, page.active)]
      : [],
  );
}

export function pageVersionSources(document, { allVersions = false } = {}) {
  return checkedPages(document).flatMap((page, index) => {
    // Collapsed ranges retain recovery data for undo/history, but are no
    // longer pages of the current document and must never enter search.
    if (page.to <= page.from) return [];
    return SCRIPT_VERSIONS.filter(
      ({ id }) => id === page.active || (allVersions && page.versions[id]),
    ).map(({ id }) => sourceEntry(document, page, index, id));
  });
}

// Plans are local offsets measured from each standalone Slice content doc.
// No plan => keep the whole alternative in its first slot, never silently cut it.
export function splitPageVersion(document, pageId, perVersionStarts) {
  const pages = checkedPages(document),
    index = pages.findIndex(({ id }) => id === pageId);
  if (index < 0) return document;
  const page = pages[index],
    alternatives = {};
  let count = 1;
  for (const { id } of SCRIPT_VERSIONS) {
    const entry = pageVersionSlice(document, pageId, id);
    if (!entry) continue;
    const content = {
      type: "doc",
      content: entry.slice.content?.length
        ? entry.slice.content
        : [emptyBlock()],
    };
    const node = pageVersionSchema.nodeFromJSON(content);
    const ranges = rangesFor(node, perVersionStarts?.[id] || [0]);
    alternatives[id] = ranges.map((range, part) => {
      const split = sliceAt(node, range.from, range.to);
      if (!part) {
        split.slice.openStart = entry.slice.openStart || 0;
        split.firstBlockOffset += entry.firstBlockOffset || 0;
        split.firstBlockId = entry.firstBlockId || split.firstBlockId;
      }
      if (part === ranges.length - 1)
        split.slice.openEnd = entry.slice.openEnd || 0;
      return {
        ...split,
        ...ownedSceneData(entry, split),
        localFrom: range.from,
        localTo: range.to,
      };
    });
    count = Math.max(count, ranges.length);
  }
  if (count === 1) return document;
  const activeParts = alternatives[page.active];
  let next = document,
    nextPages = pages,
    extraRanges = [];
  if (count > activeParts.length) {
    const blocks = Array.from({ length: count - activeParts.length }, () =>
      pageVersionSchema.nodeFromJSON(emptyBlock()),
    );
    const addedIds = new Set(blocks.map((block) => block.attrs.blockId));
    const transform = new Transform(nodeOf(document)).insert(
      page.to,
      Fragment.fromArray(blocks),
    );
    transform.doc.descendants((node, from) => {
      if (addedIds.has(node.attrs.blockId))
        extraRanges.push({ from, to: from + node.nodeSize });
    });
    next = mapPageVersionRanges(
      document,
      transform.mapping,
      transform.doc.toJSON(),
    );
    nextPages = next.pageVersions.pages.map((item, at) =>
      at === index
        ? { ...item, to: extraRanges[0].from }
        : at === index + 1
          ? { ...item, from: extraRanges.at(-1).to }
          : item,
    );
  }
  const open =
    pageVersionSlice(document, pageId, page.active).slice.openStart || 0;
  const records = Array.from({ length: count }, (_, part) => {
    const active = activeParts[part];
    const extra = extraRanges[part - activeParts.length];
    const from = extra
      ? extra.from
      : !part
        ? page.from
        : page.from + active.localFrom - open;
    const to = extra
      ? extra.to
      : part === activeParts.length - 1
        ? (extraRanges[0]?.from ?? page.to)
        : page.from + active.localTo - open;
    return {
      id: part ? makeId() : page.id,
      from,
      to,
      active: page.active,
      versions: Object.fromEntries(
        Object.entries(alternatives)
          .filter(([id]) => id !== page.active)
          .map(([id, entries]) => {
            const value = entries[part] || emptySlice();
            const { localFrom, localTo, ...entry } = value;
            return [id, entry];
          }),
      ),
    };
  });
  return {
    ...next,
    pageVersions: {
      ...next.pageVersions,
      pages: [
        ...nextPages.slice(0, index),
        ...records,
        ...nextPages.slice(index + 1),
      ],
    },
  };
}

// Burning may remove White too. A saved alternative keeps the page alive;
// only a page with no remaining alternatives is physically removed/reset.
export function burnPageVersion(document, pageId) {
  const page = checkedPages(document).find(({ id }) => id === pageId);
  if (!page || page.to <= page.from) return null;
  const fallback = SCRIPT_VERSIONS.find(
    ({ id }) => id !== page.active && page.versions[id],
  )?.id;
  if (fallback) {
    const next = switchPageVersion(document, pageId, fallback);
    return {
      ...next,
      pageVersions: {
        ...next.pageVersions,
        pages: next.pageVersions.pages.map((item) =>
          item.id !== pageId
            ? item
            : {
                ...item,
                versions: Object.fromEntries(
                  Object.entries(item.versions).filter(
                    ([id]) => id !== page.active,
                  ),
                ),
              },
        ),
      },
    };
  }
  const single =
    checkedPages(document).filter((item) => item.to > item.from).length === 1;
  const before = nodeOf(document);
  const transform = new Transform(before);
  if (single) {
    transform.replaceWith(
      0,
      before.content.size,
      ["scene", "action"].map((format) =>
        pageVersionSchema.nodes.paragraph.create({
          ...emptyBlock().attrs,
          format,
        }),
      ),
    );
  } else transform.delete(page.from, page.to);
  let next = mapPageVersionRanges(
    document,
    transform.mapping,
    transform.doc.toJSON(),
  );
  next = restoreOwnedSceneData(
    next,
    pageId,
    pageVersionSlice(document, pageId),
    emptySlice(),
  );
  return {
    ...next,
    pageVersions: {
      ...next.pageVersions,
      pages: single
        ? next.pageVersions.pages.map((item) =>
            item.id === pageId
              ? {
                  ...item,
                  from: 0,
                  to: transform.doc.content.size,
                  active: "white",
                  versions: {},
                }
              : item,
          )
        : next.pageVersions.pages.filter((item) => item.id !== pageId),
    },
  };
}

export function removePageVersion(document, pageId, versionId) {
  const page = checkedPages(document).find(({ id }) => id === pageId);
  if (
    !page ||
    versionId === "white" ||
    !ids.has(versionId) ||
    (page.active !== versionId && !page.versions[versionId])
  )
    return null;
  const saved = pageVersionSlice(document, pageId, versionId);
  const next =
    page.active === versionId
      ? switchPageVersion(document, pageId, "white")
      : document;
  return {
    document: {
      ...next,
      pageVersions: {
        ...next.pageVersions,
        pages: next.pageVersions.pages.map((item) =>
          item.id !== pageId
            ? item
            : {
                ...item,
                versions: Object.fromEntries(
                  Object.entries(item.versions).filter(
                    ([id]) => id !== versionId,
                  ),
                ),
              },
        ),
      },
    },
    snapshot: saved,
    wasActive: page.active === versionId,
    fallback: "white",
  };
}

export function restorePageVersion(
  document,
  pageId,
  versionId,
  saved,
  { activate = false } = {},
) {
  const page = checkedPages(document).find(({ id }) => id === pageId);
  if (
    !page ||
    versionId === "white" ||
    !ids.has(versionId) ||
    page.active === versionId ||
    page.versions[versionId] ||
    !saved?.slice
  )
    return document;
  const next = {
    ...document,
    pageVersions: {
      ...document.pageVersions,
      pages: document.pageVersions.pages.map((item) =>
        item.id !== pageId
          ? item
          : {
              ...item,
              versions: { ...item.versions, [versionId]: copy(saved) },
            },
      ),
    },
  };
  return activate ? switchPageVersion(next, pageId, versionId) : next;
}

export function rebasePageVersionContent(document, newContent) {
  if (!checkedPages(document).length)
    return { ...document, content: newContent };
  const before = nodeOf(document),
    after = pageVersionSchema.nodeFromJSON(newContent);
  const start = before.content.findDiffStart(after.content);
  if (start === null) return { ...document, content: newContent };
  const end = before.content.findDiffEnd(after.content);
  let a = end.a,
    b = end.b;
  const overlap = start - Math.min(a, b);
  if (overlap > 0) {
    a += overlap;
    b += overlap;
  }
  return mapPageVersionRanges(
    document,
    new StepMap([start, a - start, b - start]),
    newContent,
  );
}

// Sanitization is injected by data.js so its existing resource/mark validation
// also protects dormant page alternatives and full, lossless legacy archives.
export function cleanPageVersions(source, cleanSnapshot) {
  if (!source.pageVersions) return undefined;
  const state = source.pageVersions;
  if (
    state.version !== 1 ||
    !Array.isArray(state.pages) ||
    state.pages.length > 20000
  )
    throw new Error("Некорректные версии страниц в файле TYT.");
  const size = nodeOf(source).content.size,
    used = new Set();
  let previous = 0;
  const pages = state.pages.map((page, index) => {
    if (
      !page ||
      typeof page.id !== "string" ||
      !page.id.length ||
      page.id.length > 200 ||
      used.has(page.id) ||
      !ids.has(page.active) ||
      !Number.isInteger(page.from) ||
      !Number.isInteger(page.to) ||
      page.from !== previous ||
      page.to < page.from ||
      page.to > size ||
      (index === state.pages.length - 1 && page.to !== size)
    )
      throw new Error("Повреждены границы версий страниц в файле TYT.");
    used.add(page.id);
    previous = page.to;
    const versions = {};
    for (const { id } of SCRIPT_VERSIONS) {
      if (!Object.hasOwn(page.versions || {}, id) || id === page.active)
        continue;
      const value = page.versions[id],
        slice = value?.slice;
      if (
        !slice ||
        !Array.isArray(slice.content) ||
        ![0, 1, undefined].includes(slice.openStart) ||
        ![0, 1, undefined].includes(slice.openEnd)
      )
        throw new Error("Повреждена сохранённая версия страницы в файле TYT.");
      const cleaned = cleanSnapshot({
        ...source,
        ...(Object.hasOwn(value, "sceneVariants")
          ? { sceneVariants: value.sceneVariants }
          : {}),
        ...(Object.hasOwn(value, "sceneShots")
          ? { sceneShots: value.sceneShots }
          : {}),
        content: {
          type: "doc",
          content: slice.content.length ? slice.content : [emptyBlock()],
        },
        pageVersions: undefined,
        scriptVersions: {},
      });
      versions[id] = {
        slice: {
          content: cleaned.content.content,
          openStart: slice.openStart || 0,
          openEnd: slice.openEnd || 0,
        },
        firstBlockOffset:
          Number.isSafeInteger(value.firstBlockOffset) &&
          value.firstBlockOffset >= 0
            ? value.firstBlockOffset
            : 0,
        firstBlockId:
          typeof value.firstBlockId === "string"
            ? value.firstBlockId.slice(0, 200)
            : null,
        ...Object.fromEntries(
          ["sceneVariants", "sceneShots"]
            .filter((key) => Object.hasOwn(value, key))
            .map((key) => [
              key,
              ownedSceneData(cleaned, {
                slice: { ...slice, content: cleaned.content.content },
              })[key],
            ]),
        ),
      };
    }
    return {
      id: page.id,
      from: page.from,
      to: page.to,
      active: page.active,
      versions,
      ...(typeof page.flow === "boolean" ? { flow: page.flow } : {}),
    };
  });
  const legacyVersions = {};
  for (const { id } of SCRIPT_VERSIONS)
    if (Object.hasOwn(state.legacyVersions || {}, id))
      legacyVersions[id] = snapshot(
        cleanSnapshot({
          ...state.legacyVersions[id],
          id: source.id,
          title: source.title,
          scriptVersion: id,
          scriptVersions: {},
          pageVersions: undefined,
        }),
      );
  const migratedLegacy = Object.fromEntries(
    SCRIPT_VERSIONS.filter(({ id }) => state.migratedLegacy?.[id] === true).map(
      ({ id }) => [id, true],
    ),
  );
  return { version: 1, pages, legacyVersions, migratedLegacy };
}
