import { useEffect, useRef } from "react";
import { t } from "./i18n.js";
import "./screenplay-scene-drag.css";

const headings = '.screenplay-editor > [data-format="scene"][data-block-id]';
const handles = ".scene-drag-handle, .scene-shot-button";
const element = (className, text) => {
  const node = document.createElement("div");
  node.className = className;
  if (text) node.textContent = text;
  return node;
};

// Decorations remain owned by ProseMirror. The drag layer lives outside the
// editable document so pagination, clipboard and exports never contain it.
export function useScreenplaySceneDrag(ref, enabled, scope, onMove) {
  const callback = useRef(onMove);
  callback.current = onMove;
  useEffect(() => {
    const column = ref.current;
    if (!column || !enabled) return;
    let drag = null;
    let suppressClick = false;
    let clickTimer;
    let hover;
    const clearHover = () => {
      hover?.remove();
      hover = null;
    };
    const clear = () => {
      const current = drag;
      if (!current) return;
      drag = null;
      clearTimeout(current.timer);
      cancelAnimationFrame(current.frame);
      current.layer?.remove();
      current.handle.removeAttribute("aria-pressed");
      current.scroller.style.scrollBehavior = current.scrollBehavior;
      document.body.classList.remove("screenplay-scene-dragging");
      if (current.handle.hasPointerCapture(current.pointerId))
        current.handle.releasePointerCapture(current.pointerId);
      if (current.active) {
        suppressClick = true;
        clearTimeout(clickTimer);
        clickTimer = setTimeout(() => (suppressClick = false), 0);
      }
    };
    const viewportBounds = (current) => {
      const rect = current.scroller.getBoundingClientRect();
      const footer = column.querySelector(".minimal-footer");
      return {
        left: Math.max(0, rect.left),
        right: Math.min(
          window.innerWidth,
          rect.left + current.scroller.clientWidth,
        ),
        top: Math.max(0, rect.top),
        bottom: Math.min(
          window.innerHeight,
          rect.bottom,
          footer?.getClientRects().length
            ? footer.getBoundingClientRect().top
            : Infinity,
        ),
      };
    };
    const activate = (current) => {
      if (drag !== current || !current.handle.isConnected) return;
      current.active = true;
      current.scroller.scrollTop = current.scrollTop;
      clearHover();
      current.blocks = [];
      for (
        let block = current.handle.closest(headings);
        block;
        block = block.nextElementSibling
      ) {
        if (current.blocks.length && block.matches('[data-format="scene"]'))
          break;
        current.blocks.push(block);
      }
      current.handle.setAttribute("aria-pressed", "true");
      current.scroller.style.scrollBehavior = "auto";
      current.handle.setPointerCapture(current.pointerId);
      document.body.classList.add("screenplay-scene-dragging");
      const layer = element("scene-reorder-layer");
      layer.setAttribute("aria-hidden", "true");
      const sourceStyle = document.createElement("style");
      sourceStyle.textContent =
        current.blocks
          .map(
            (block) =>
              `.screenplay-editor > [data-block-id=${CSS.escape(block.dataset.blockId)}]`,
          )
          .join(",") + " { opacity: 0 !important; }";
      layer.append(sourceStyle);
      const zones = element("scene-reorder-zones");
      const preview = element("scene-reorder-preview");
      const image = current.handle
        .closest(headings)
        ?.querySelector(".scene-shot-button img");
      if (image) {
        const thumbnail = image.cloneNode();
        thumbnail.className = "scene-reorder-thumbnail";
        preview.append(thumbnail);
      }
      const meta = element(
        "scene-reorder-meta",
        t("Сцена {0}", current.index + 1) + " · " + current.letter,
      );
      const title = element(
        "scene-reorder-title",
        current.title || t("Без названия"),
      );
      const hint = element(
        "scene-reorder-hint",
        t("Выберите место · Esc — отмена"),
      );
      preview.append(meta, title, hint);
      const marker = element("scene-reorder-insertion");
      marker.hidden = true;
      layer.append(zones, marker, preview);
      document.body.append(layer);
      Object.assign(current, {
        layer,
        zones,
        preview,
        hint,
        marker,
        lastTime: performance.now(),
        speed: 0,
      });
      const follow = (now) => {
        if (drag !== current) return;
        if (
          !current.handle.isConnected ||
          !current.scroller.getClientRects().length
        ) {
          clear();
          return;
        }
        const dt = Math.min(34, Math.max(1, now - current.lastTime));
        // Keep a distant editing caret from pulling the viewport back while
        // the user is moving a scene. Edge scrolling and explicit wheel input
        // both update the drag's own scroll position.
        if (Math.abs(current.scroller.scrollTop - current.scrollTop) > 1)
          current.scroller.scrollTop = current.scrollTop;
        current.lastTime = now;
        const viewport = viewportBounds(current);
        const insideX =
          current.x >= viewport.left && current.x <= viewport.right;
        const edge = Math.min(72, (viewport.bottom - viewport.top) / 4);
        let pressure = 0;
        if (insideX) {
          if (current.y < viewport.top + edge)
            pressure = -Math.min(1.6, (viewport.top + edge - current.y) / edge);
          else if (current.y > viewport.bottom - edge)
            pressure = Math.min(
              1.6,
              (current.y - viewport.bottom + edge) / edge,
            );
        }
        const desired = Math.sign(pressure) * 650 * Math.abs(pressure) ** 1.5;
        current.speed += (desired - current.speed) * (1 - Math.exp(-dt / 110));
        if (Math.abs(current.speed) > 1) {
          current.scrollTop = Math.max(
            0,
            Math.min(
              current.scroller.scrollHeight - current.scroller.clientHeight,
              current.scrollTop + (current.speed * dt) / 1000,
            ),
          );
          // Retain subpixel movement instead of losing slow edge scrolling
          // when the browser quantizes scrollTop to whole pixels.
          current.scroller.scrollTop = current.scrollTop;
        }
        const paper = current.scroller
          .querySelector(".script-paper")
          .getBoundingClientRect();
        const left = Math.max(viewport.left + 8, paper.left + 12);
        const right = Math.min(viewport.right - 8, paper.right - 12);
        const items = Array.from(column.querySelectorAll(headings));
        const rects = items.map((node) => node.getBoundingClientRect());
        const lastBottom =
          column
            .querySelector(".screenplay-editor")
            .lastElementChild.getBoundingClientRect().bottom + 12;
        const sourceIndex = items.findIndex(
          (node) => node.dataset.blockId === current.id,
        );
        const visible = new Set();
        current.target = null;
        current.marker.hidden = true;
        for (let index = 0; index < items.length; index++) {
          const id = items[index].dataset.blockId;
          const top = Math.max(viewport.top + 4, rects[index].top - 10);
          const bottom = Math.min(
            viewport.bottom - 4,
            rects[index + 1] ? rects[index + 1].top - 14 : lastBottom,
          );
          if (bottom <= top || right <= left) continue;
          visible.add(id);
          let zone = current.zoneNodes.get(id);
          if (!zone) {
            zone = element("scene-reorder-zone");
            zone.append(element("scene-reorder-zone-label"));
            current.zoneNodes.set(id, zone);
            zones.append(zone);
          }
          Object.assign(zone.style, {
            left: `${left}px`,
            top: `${top}px`,
            width: `${right - left}px`,
            height: `${bottom - top}px`,
          });
          const source = id === current.id;
          zone.dataset.source = String(source);
          zone.dataset.target = "false";
          zone.firstChild.textContent = source
            ? t("Перемещается")
            : t("Сцена {0}", index + 1);
          if (
            source ||
            !insideX ||
            current.x < left ||
            current.x > right ||
            current.y < top ||
            (current.y > bottom &&
              !(index === items.length - 1 && current.y < viewport.bottom))
          )
            continue;
          const placement = current.y < (top + bottom) / 2 ? "before" : "after";
          let at = index + (placement === "after" ? 1 : 0);
          if (sourceIndex < at) at--;
          if (at === sourceIndex) continue;
          current.target = { id, placement };
          zone.dataset.target = "true";
          current.hint.textContent = t(
            placement === "before"
              ? "Перед сценой {0} · Esc — отмена"
              : "После сцены {0} · Esc — отмена",
            index + 1,
          );
          current.marker.hidden = false;
          Object.assign(current.marker.style, {
            left: `${left}px`,
            top: `${placement === "before" ? top : bottom}px`,
            width: `${right - left}px`,
          });
        }
        for (const [id, node] of current.zoneNodes)
          if (!visible.has(id)) {
            node.remove();
            current.zoneNodes.delete(id);
          }
        if (!current.target)
          current.hint.textContent = t("Выберите место · Esc — отмена");
        preview.dataset.valid = String(!!current.target);
        const x = Math.max(
          8,
          Math.min(window.innerWidth - preview.offsetWidth - 8, current.x + 18),
        );
        const y = Math.max(
          8,
          Math.min(
            window.innerHeight - preview.offsetHeight - 8,
            current.y + 20,
          ),
        );
        preview.style.transform = `translate(${x}px, ${y}px)`;
        current.frame = requestAnimationFrame(follow);
      };
      current.paint = follow;
      current.frame = requestAnimationFrame(follow);
    };
    const down = (event) => {
      if (
        event.button !== 0 ||
        event.pointerType !== "mouse" ||
        !event.isPrimary
      )
        return;
      const handle = event.target.closest(handles);
      const heading = handle?.closest(headings);
      if (
        !heading ||
        !column.contains(heading) ||
        heading.closest('[contenteditable="false"]')
      )
        return;
      const items = Array.from(column.querySelectorAll(headings));
      if (items.length < 2) return;
      clear();
      suppressClick = false;
      event.preventDefault();
      const scroller = heading.closest(".minimal-scroll");
      const copy = heading.cloneNode(true);
      copy
        .querySelectorAll("button,.scene-gutter")
        .forEach((node) => node.remove());
      drag = {
        handle,
        scroller,
        pointerId: event.pointerId,
        id: heading.dataset.blockId,
        index: items.indexOf(heading),
        letter:
          heading.querySelector(".scene-variant-select")?.dataset.value || "A",
        title: copy.textContent,
        x: event.clientX,
        y: event.clientY,
        startX: event.clientX,
        startY: event.clientY,
        scrollBehavior: scroller.style.scrollBehavior,
        scrollTop: scroller.scrollTop,
        zoneNodes: new Map(),
      };
      const current = drag;
      current.timer = setTimeout(() => activate(current), 180);
    };
    const move = (event) => {
      if (!drag) {
        clearHover();
        const handle = event.target.closest?.(handles);
        const heading = handle?.closest(headings);
        if (!heading || !column.contains(heading)) return;
        const rect = heading.getBoundingClientRect();
        let next = heading.nextElementSibling;
        while (next && !next.matches('[data-format="scene"]'))
          next = next.nextElementSibling;
        const viewport = heading
          .closest(".minimal-scroll")
          .getBoundingClientRect();
        const paper = heading.closest(".script-paper").getBoundingClientRect();
        const top = Math.max(viewport.top, rect.top - 10);
        const bottom = Math.min(
          viewport.bottom,
          next?.getBoundingClientRect().top - 14 ||
            heading.parentElement.lastElementChild.getBoundingClientRect()
              .bottom + 12,
        );
        hover = element("scene-hover-highlight");
        Object.assign(hover.style, {
          left: `${Math.max(viewport.left + 8, paper.left + 12)}px`,
          top: `${top}px`,
          width: `${Math.min(viewport.right, paper.right) - Math.max(viewport.left, paper.left) - 24}px`,
          height: `${Math.max(0, bottom - top)}px`,
        });
        document.body.append(hover);
        return;
      }
      if (event.pointerId !== drag.pointerId) return;
      drag.x = event.clientX;
      drag.y = event.clientY;
      if (
        !drag.active &&
        Math.hypot(drag.x - drag.startX, drag.y - drag.startY) >= 6
      ) {
        clearTimeout(drag.timer);
        activate(drag);
      }
      if (drag?.active) event.preventDefault();
    };
    const finish = (event) => {
      if (!drag || event.pointerId !== drag.pointerId) return;
      if (drag.active) {
        drag.x = event.clientX;
        drag.y = event.clientY;
        cancelAnimationFrame(drag.frame);
        drag.paint(performance.now());
      }
      if (!drag) return;
      const { id, active, target } = drag;
      clear();
      if (active && target) callback.current(id, target.id, target.placement);
    };
    const key = (event) => {
      if (
        !drag &&
        event.altKey &&
        ["ArrowUp", "ArrowDown"].includes(event.key) &&
        event.target.closest(".scene-drag-handle")
      ) {
        const items = Array.from(column.querySelectorAll(headings));
        const heading = event.target.closest(headings);
        const index = items.indexOf(heading);
        const target = items[index + (event.key === "ArrowUp" ? -1 : 1)];
        event.preventDefault();
        event.stopPropagation();
        if (target)
          callback.current(
            heading.dataset.blockId,
            target.dataset.blockId,
            event.key === "ArrowUp" ? "before" : "after",
          );
        return;
      }
      if (!drag?.active) return;
      event.preventDefault();
      if (event.key === "Escape") {
        event.stopPropagation();
        clear();
      }
    };
    const click = (event) => {
      if (!suppressClick) return;
      event.preventDefault();
      event.stopPropagation();
      suppressClick = false;
    };
    const preventDrag = (event) => {
      if (event.target.closest(handles)) event.preventDefault();
    };
    const wheel = (event) => {
      if (!drag?.active) return;
      event.preventDefault();
      // Keep browser/editor zoom from changing the captured drag geometry.
      if (event.ctrlKey || event.metaKey) return;
      const scroller = drag.scroller;
      const unit =
        event.deltaMode === 2
          ? scroller.clientHeight
          : event.deltaMode === 1
            ? parseFloat(getComputedStyle(scroller).lineHeight) || 16
            : 1;
      const delta = (event.deltaY || event.deltaX) * unit;
      if (!delta) return;
      drag.scrollTop = Math.max(
        0,
        Math.min(
          scroller.scrollHeight - scroller.clientHeight,
          drag.scrollTop + delta,
        ),
      );
      scroller.scrollTop = drag.scrollTop;
      drag.scrollTop = scroller.scrollTop;
      drag.speed = 0;
    };
    column.addEventListener("pointerdown", down, true);
    column.addEventListener("dragstart", preventDrag);
    column.addEventListener("wheel", wheel, {
      capture: true,
      passive: false,
    });
    document.addEventListener("pointermove", move, { passive: false });
    document.addEventListener("pointerup", finish);
    document.addEventListener("pointercancel", clear);
    document.addEventListener("click", click, true);
    document.addEventListener("keydown", key, true);
    window.addEventListener("blur", clear);
    window.addEventListener("blur", clearHover);
    column.addEventListener("pointerleave", clearHover);
    column.addEventListener("scroll", clearHover, true);
    return () => {
      clear();
      clearHover();
      clearTimeout(clickTimer);
      column.removeEventListener("pointerdown", down, true);
      column.removeEventListener("dragstart", preventDrag);
      column.removeEventListener("wheel", wheel, true);
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", finish);
      document.removeEventListener("pointercancel", clear);
      document.removeEventListener("click", click, true);
      document.removeEventListener("keydown", key, true);
      window.removeEventListener("blur", clear);
      window.removeEventListener("blur", clearHover);
      column.removeEventListener("pointerleave", clearHover);
      column.removeEventListener("scroll", clearHover, true);
    };
  }, [ref, enabled, scope]);
}
