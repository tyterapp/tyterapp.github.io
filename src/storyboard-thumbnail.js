// ProseMirror widgets use native DOM. Keep their previews layered without
// mounting a React root or rasterizing an image on each hover playback step.
export function renderStoryboardThumbnail(container, frame) {
  const doc = container.ownerDocument;
  const svgNode = (tag, attrs) => {
    const node = doc.createElementNS("http://www.w3.org/2000/svg", tag);
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
    return node;
  };
  const svg = svgNode("svg", { viewBox: "0 0 1000 1000", preserveAspectRatio: "none", "aria-hidden": "true" });
  if (frame.image) svg.append(svgNode("image", { href: frame.image, width: 1000, height: 1000, preserveAspectRatio: "xMidYMid slice" }));
  for (const layer of frame.layers || []) {
    const points = layer.points || [];
    if (layer.visible === false || points.length < 2) continue;
    const [x, y] = points[0].map((value) => value * 1000);
    const [endX, endY] = points.at(-1).map((value) => value * 1000);
    const box = { x: Math.min(x, endX), y: Math.min(y, endY), width: Math.abs(endX - x), height: Math.abs(endY - y) };
    if (layer.type === "image") {
      svg.append(svgNode("image", { ...box, href: layer.image, preserveAspectRatio: "none" }));
      continue;
    }
    const attrs = { stroke: layer.color, "stroke-width": layer.width, fill: "none", "vector-effect": "non-scaling-stroke", "stroke-linecap": "round", "stroke-linejoin": "round" };
    if (layer.type === "rectangle") svg.append(svgNode("rect", { ...attrs, ...box }));
    else if (layer.type === "ellipse") svg.append(svgNode("ellipse", { ...attrs, cx: (x + endX) / 2, cy: (y + endY) / 2, rx: box.width / 2, ry: box.height / 2 }));
    else svg.append(svgNode("polyline", { ...attrs, points: points.map(([px, py]) => `${px * 1000},${py * 1000}`).join(" ") }));
  }
  container.replaceChildren(svg);
}
