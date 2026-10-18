import { test, expect } from "@playwright/test";

test("forced page boundaries reflow mid-paragraph text and preserve overflow, neighbours and empty pages", async ({
  page,
}) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const { screenplayPagePlan } = await import("/src/pagination.js");
    const { pageVersionSchema: schema } = await import("/src/page-versions.js");
    const text = "The quick brown fox jumps over the lazy dog. ".repeat(100);
    const doc = schema.node("doc", null, [
      schema.node("paragraph", { blockId: "long" }, schema.text(text)),
      schema.node(
        "paragraph",
        { blockId: "neighbour" },
        schema.text("Neighbour must stay on its own page."),
      ),
      schema.node("paragraph", { blockId: "empty" }),
    ]);
    const paper = document.createElement("section");
    Object.assign(paper.style, {
      position: "absolute",
      top: "0",
      left: "0",
      width: "400px",
      boxSizing: "border-box",
      padding: "88px 32px",
      font: "16px/20px monospace",
      whiteSpace: "pre-wrap",
      overflowWrap: "break-word",
    });
    const elements = new Map(),
      textPositions = new WeakMap();
    const starts = [];
    doc.forEach((node, from) => {
      starts.push(from);
      const p = document.createElement("p");
      Object.assign(p.style, { margin: "0", padding: "0", minHeight: "20px" });
      if (node.textContent) {
        const text = document.createTextNode(node.textContent);
        p.append(text);
        textPositions.set(text, from + 1);
      } else p.append(document.createElement("br"));
      paper.append(p);
      elements.set(from, p);
    });
    document.body.append(paper);
    const options = {
      doc,
      nodeDOM: (from) => elements.get(from),
      posAtDOM: (text, offset) => textPositions.get(text) + offset,
      paper,
      fontSize: 12,
    };
    const natural = screenplayPagePlan(options);
    const forcedAt = 334;
    const plan = screenplayPagePlan({
      ...options,
      forcedStarts: [forcedAt, starts[1], starts[2]],
    });
    for (const { kind, pos, gap, text, offset } of [...plan.breaks].reverse()) {
      if (kind === "node") elements.get(pos).style.paddingTop = `${gap}px`;
      else {
        const tail = text.splitText(offset);
        textPositions.set(tail, textPositions.get(text) + offset);
        const spacer = document.createElement("span");
        spacer.contentEditable = "false";
        Object.assign(spacer.style, { display: "block", height: `${gap}px` });
        tail.before(spacer);
      }
    }
    const rangeAt = (position) => {
      const walker = document.createTreeWalker(paper, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const node = walker.currentNode,
          from = textPositions.get(node);
        if (position < from || position >= from + node.length) continue;
        const range = document.createRange();
        range.setStart(node, position - from);
        range.setEnd(node, position - from + 1);
        return (
          range.getBoundingClientRect().top - paper.getBoundingClientRect().top
        );
      }
      return null;
    };
    const points = plan.starts
      .slice(1)
      .map((from, index) => ({
        from,
        page: index + 1,
        y:
          from === starts[2]
            ? elements.get(from).getBoundingClientRect().bottom -
              20 -
              paper.getBoundingClientRect().top
            : rangeAt(from === starts[1] ? from + 1 : from),
      }));
    const original = paper.textContent;
    paper.remove();
    return {
      starts: plan.starts,
      naturalStarts: natural.starts,
      forced: [forcedAt, starts[1], starts[2]],
      points,
      expectedText: text + "Neighbour must stay on its own page.",
      original,
      height: plan.height,
    };
  });
  expect(result.original).toBe(result.expectedText);
  for (const forced of result.forced) expect(result.starts).toContain(forced);
  expect(
    result.starts.filter((at) => at > result.forced[0] && at < result.forced[1])
      .length,
  ).toBeGreaterThan(0);
  expect(new Set(result.starts).size).toBe(result.starts.length);
  expect(result.naturalStarts[0]).toBe(0);
  for (const point of result.points) {
    expect(
      point.y,
      `Boundary ${point.from} on page ${point.page}`,
    ).not.toBeNull();
    expect(
      Math.abs(point.y - (point.page * result.height + 88)),
      JSON.stringify(point),
    ).toBeLessThanOrEqual(5);
  }
});

test("saved boundaries beside hard breaks remain physical page boundaries", async ({
  page,
}) => {
  await page.goto("/");
  const results = await page.evaluate(async () => {
    const { screenplayPagePlan } = await import("/src/pagination.js");
    const { pageVersionSchema: schema } = await import("/src/page-versions.js");
    return ["before", "after", "trailing"].map((kind) => {
      const children = [schema.text("First line"), schema.node("hardBreak")];
      if (kind !== "trailing") children.push(schema.text("Second line"));
      const doc = schema.node("doc", null, [
        schema.node("paragraph", { blockId: "lines" }, children),
        schema.node("paragraph", { blockId: "next" }, schema.text("Next page")),
      ]);
      const boundary = 1 + "First line".length + (kind === "before" ? 0 : 1);
      const paper = document.createElement("section");
      Object.assign(paper.style, {
        position: "absolute",
        top: "0",
        width: "400px",
        boxSizing: "border-box",
        padding: "88px 32px",
        font: "16px/20px monospace",
        whiteSpace: "pre-wrap",
      });
      const elements = new Map(),
        positions = new WeakMap();
      doc.forEach((node, from) => {
        const p = document.createElement("p");
        Object.assign(p.style, {
          margin: "0",
          padding: "0",
          minHeight: "20px",
        });
        node.forEach((child, offset) => {
          const element = child.isText
            ? document.createTextNode(child.text)
            : document.createElement("br");
          p.append(element);
          if (child.isText) positions.set(element, from + 1 + offset);
        });
        if (node.lastChild.type.name === "hardBreak") {
          const br = document.createElement("br");
          br.className = "ProseMirror-trailingBreak";
          p.append(br);
        }
        elements.set(from, p);
        paper.append(p);
      });
      document.body.append(paper);
      const plan = screenplayPagePlan({
        doc,
        nodeDOM: (at) => elements.get(at),
        posAtDOM: (text, offset) => positions.get(text) + offset,
        paper,
        fontSize: 12,
        forcedStarts: [boundary],
      });
      for (const { kind, pos, gap, text, offset, element, after } of [
        ...plan.breaks,
      ].reverse()) {
        if (kind === "node") elements.get(pos).style.paddingTop = `${gap}px`;
        else {
          const spacer = document.createElement("span");
          Object.assign(spacer.style, { display: "block", height: `${gap}px` });
          if (kind === "inline") {
            if (after) element.after(spacer);
            else element.before(spacer);
          } else text.splitText(offset).before(spacer);
        }
      }
      const first = elements.get(0),
        br = first.querySelector("br"),
        range = document.createRange();
      if (kind === "before") range.selectNode(br);
      else if (kind === "after") range.selectNodeContents(first.lastChild);
      else range.selectNode(first.querySelector(".ProseMirror-trailingBreak"));
      const y =
        range.getBoundingClientRect().top - paper.getBoundingClientRect().top;
      const result = {
        kind,
        starts: plan.starts,
        boundary,
        y,
        target: plan.height + 88,
      };
      paper.remove();
      return result;
    });
  });
  for (const result of results) {
    expect(result.starts, result.kind).toEqual([0, result.boundary]);
    expect(
      Math.abs(result.y - result.target),
      JSON.stringify(result),
    ).toBeLessThanOrEqual(2);
  }
});
