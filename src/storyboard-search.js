import { shotScenes, SHOT_FIELDS } from "./shot-info.js";
import { storyboardScenes } from "./storyboard-model.js";
import { storyboardFrames, STORY_STATUSES } from "./storyboard-data.js";

// Alternatives use the live heading's page, including when their archived text
// has a different length. Old page-version copies never enter this index.
export function storyboardSearchScenes(document) {
  const live = new Map(
    storyboardScenes(document).map((scene) => [scene.id, scene]),
  );
  return shotScenes(document, { allVariants: true }).map((scene) => {
    const source = live.get(scene.id);
    return {
      ...scene,
      page: source.page,
      pageId: document.pageVersions?.pages?.[source.page - 1]?.id || null,
      color: source.color,
    };
  });
}

export function storyboardSearchMatches(scenes, query, language = "ru") {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return [];
  const english = language === "en";
  const tr = (ru, en) => (english ? en : ru);
  const results = [];
  for (const scene of scenes) {
    const settings = scene.settings || {};
    const title = scene.title?.trim() || tr("Без названия", "Untitled");
    const fields = [];
    const add = (label, text) => {
      if (typeof text === "string" && text.trim()) fields.push({ label, text });
    };
    add(tr("Название сцены", "Scene title"), title);
    add(tr("Название кадра", "Shot name"), settings.name);
    add(tr("Синопсис", "Synopsis"), settings.synopsis);
    add(
      tr("Комментарий раскадровки", "Storyboard comment"),
      settings.frameComment,
    );
    for (const field of SHOT_FIELDS) {
      const option = field.options.find(
        ([value]) => value === settings[field.key],
      );
      if (option) add(field.label[english ? 1 : 0], option[english ? 2 : 1]);
    }
    const status = STORY_STATUSES.find(([id]) => id === settings.status);
    if (status) add(tr("Статус", "Status"), status[english ? 2 : 1]);
    add(tr("Дата съёмок", "Shooting date"), settings.shootingDate);
    add(tr("Локация", "Location"), settings.location?.name);
    const frames = storyboardFrames(settings);
    for (const [index, frame] of (frames.length ? frames : [null]).entries()) {
      const frameFields = [...fields];
      const addFrame = (label, text) => {
        if (typeof text === "string" && text.trim())
          frameFields.push({ label, text });
      };
      addFrame(tr("Подпись кадра", "Frame caption"), frame?.caption);
      for (const comment of frame?.comments || []) {
        addFrame(tr("Комментарий кадра", "Frame comment"), comment.text);
        for (const reply of comment.replies || [])
          addFrame(tr("Ответ на комментарий", "Comment reply"), reply.text);
      }
      for (const layer of frame?.layers || [])
        addFrame(tr("Слой", "Layer"), layer.name);
      const context = `${tr("Стр.", "Page")} ${scene.page || 1} · ${tr("Сцена", "Scene")} ${scene.number} ${scene.letter}${frame ? ` · ${tr("Кадр", "Frame")} ${index + 1}` : ""}`;
      addFrame(tr("Расположение", "Position"), context);
      const matches = frameFields.flatMap((field) => {
        const at = field.text.toLocaleLowerCase().indexOf(needle);
        return at >= 0 ? [{ ...field, at, length: needle.length }] : [];
      });
      if (!matches.length) continue;
      results.push({
        key: JSON.stringify([scene.id, scene.letter, frame?.id ?? null]),
        sceneId: scene.id,
        variant: scene.letter,
        sceneNumber: scene.number,
        pageNumber: scene.page || 1,
        pageId: scene.pageId || null,
        frameId: frame?.id ?? null,
        frameNumber: frame ? index + 1 : null,
        frame,
        aspectRatio: settings.aspectRatio,
        title,
        context,
        text: matches[0].text,
        at: matches[0].at,
        length: matches[0].length,
        fieldLabel: matches[0].label,
      });
    }
  }
  return results;
}
