import { useEffect, useId, useRef, useState } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  ArrowLeft,
  ArrowLeftRight,
  Pencil,
  Plus,
  Trash2,
  Undo2,
} from "lucide-react";
import { useLanguage } from "./i18n.js";
import messages from "./component-relationships-messages.js";
import {
  characterComponents,
  deleteCharacterRelationship,
  relationshipsForComponent,
  relationshipScenes,
  saveCharacterRelationship,
  undoRelationshipChange,
} from "./component-relationships.js";
import "./component-relationships.css";

export default function ComponentRelationships({
  document,
  component,
  onChange,
  onOpenComponent,
}) {
  const language = useLanguage();
  const copy = messages[language];
  const [draft, setDraft] = useState(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [undo, setUndo] = useState(null);
  const [status, setStatus] = useState("");
  const form = useRef(null);
  const errorId = useId();
  const draftRef = useRef(draft);
  draftRef.current = draft;
  useEffect(() => {
    setDraft(null);
    setError("");
    setUndo(null);
    setStatus("");
  }, [component?.id]);
  useEffect(() => {
    if (!draft) return;
    form.current?.scrollIntoView({ block: "nearest" });
    form.current?.querySelector("select")?.focus({ preventScroll: true });
  }, [draft?.id, !!draft]);
  if (component?.type !== "character") return null;
  const targets = characterComponents(document).filter(
    ({ id }) => id !== component.id,
  );
  const entries = relationshipsForComponent(document, component.id);
  const scenes = relationshipScenes(document);
  const setField = (key, value) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setError("");
  };
  const begin = (entry = null) => {
    const relationship = entry?.relationship;
    setError("");
    setStatus("");
    setDraft({
      id: relationship?.id || null,
      targetComponentId: entry
        ? entry.other?.id ||
          (relationship.sourceComponentId === component.id
            ? relationship.targetComponentId
            : relationship.sourceComponentId)
        : targets[0]?.id || "",
      orientation: entry?.orientation || "outgoing",
      type: relationship?.type || "",
      label: relationship?.label || "",
      state: relationship?.state || "",
      description: relationship?.description || "",
      sourceSceneId: relationship?.sourceSceneId || "",
    });
  };
  const commit = async (result, message) => {
    if (result.error) {
      setError(result.error);
      return false;
    }
    setPending(true);
    setError("");
    try {
      if ((await onChange(result.relationships)) === false)
        throw new Error("save");
      setUndo(result.change || null);
      setStatus(message);
      return true;
    } catch {
      setError("save");
      return false;
    } finally {
      setPending(false);
    }
  };
  const save = async (event) => {
    event.preventDefault();
    if (pending || !draftRef.current) return;
    const value = draftRef.current;
    const incoming = value.orientation === "incoming";
    const result = saveCharacterRelationship(document, {
      ...(value.id ? { id: value.id } : {}),
      sourceComponentId: incoming ? value.targetComponentId : component.id,
      targetComponentId: incoming ? component.id : value.targetComponentId,
      direction:
        value.orientation === "bidirectional" ? "bidirectional" : "directed",
      type: value.type,
      label: value.label,
      state: value.state,
      description: value.description,
      sourceSceneId: value.sourceSceneId,
    });
    if (await commit(result, "saved")) setDraft(null);
  };
  const remove = async (id) => {
    if (pending) return;
    if (
      await commit(
        deleteCharacterRelationship(document.relationships, id),
        "deleted",
      )
    )
      setDraft(null);
  };
  const restore = async () => {
    if (pending || !undo) return;
    await commit(
      undoRelationshipChange(document.relationships, undo),
      "undone",
    );
  };
  const selectedTarget = targets.find(
    ({ id }) => id === draft?.targetComponentId,
  );
  const errorText = copy.errors[error] || copy.errors.save;
  return (
    <section
      className="component-relationships"
      aria-label={copy.title}
      data-relationships-component={component.id}
    >
      <div className="relationship-section-heading">
        <h3>{copy.title}</h3>
        {!draft && (
          <button
            type="button"
            className="icon-button"
            aria-label={copy.add}
            data-tooltip={copy.add}
            disabled={pending || !targets.length}
            onClick={() => begin()}
          >
            <Plus size={17} />
          </button>
        )}
      </div>
      {error && (
        <p className="form-error relationship-error" role="alert" id={errorId}>
          {errorText}
        </p>
      )}
      {draft ? (
        <form
          ref={form}
          className="relationship-form"
          onSubmit={save}
          aria-label={draft.id ? copy.edit : copy.new}
          aria-describedby={error ? errorId : undefined}
        >
          <div className="relationship-editor-heading">
            <button
              type="button"
              className="icon-button"
              aria-label={copy.back}
              disabled={pending}
              onClick={() => {
                setDraft(null);
                setError("");
              }}
            >
              <ArrowLeft size={16} />
            </button>
            <h4>{draft.id ? copy.edit : copy.new}</h4>
          </div>
          <label>
            {copy.character}
            <select
              aria-label={copy.character}
              value={draft.targetComponentId}
              required
              disabled={pending}
              onChange={(event) =>
                setField("targetComponentId", event.target.value)
              }
            >
              <option value="">{copy.choose}</option>
              {!selectedTarget && draft.targetComponentId && (
                <option value={draft.targetComponentId} disabled>
                  {copy.missing}
                </option>
              )}
              {targets.map((target) => (
                <option key={target.id} value={target.id}>
                  {target.name}
                </option>
              ))}
            </select>
          </label>
          {!selectedTarget && draft.targetComponentId && (
            <p className="relationship-hint">{copy.missingHelp}</p>
          )}
          <label>
            {copy.type}
            <input
              value={draft.type}
              required
              maxLength={200}
              placeholder={copy.typeHint}
              disabled={pending}
              onChange={(event) => setField("type", event.target.value)}
            />
          </label>
          <label>
            {copy.direction}
            <select
              aria-label={copy.direction}
              value={draft.orientation}
              disabled={pending}
              onChange={(event) => setField("orientation", event.target.value)}
            >
              <option value="outgoing">
                {component.name} → {selectedTarget?.name || copy.character}
              </option>
              <option value="incoming">
                {component.name} ← {selectedTarget?.name || copy.character}
              </option>
              <option value="bidirectional">
                {component.name} ↔ {selectedTarget?.name || copy.character}
              </option>
            </select>
          </label>
          <label>
            {copy.label}
            <span className="muted"> · {copy.optional}</span>
            <input
              value={draft.label}
              maxLength={200}
              disabled={pending}
              onChange={(event) => setField("label", event.target.value)}
            />
          </label>
          <label>
            {copy.state}
            <span className="muted"> · {copy.optional}</span>
            <input
              value={draft.state}
              maxLength={200}
              disabled={pending}
              onChange={(event) => setField("state", event.target.value)}
            />
          </label>
          <label>
            {copy.description}
            <span className="muted"> · {copy.optional}</span>
            <textarea
              value={draft.description}
              rows={3}
              maxLength={5000}
              disabled={pending}
              onChange={(event) => setField("description", event.target.value)}
            />
          </label>
          <label>
            {copy.scene}
            <span className="muted"> · {copy.optional}</span>
            <select
              aria-label={copy.scene}
              value={draft.sourceSceneId}
              disabled={pending}
              onChange={(event) =>
                setField("sourceSceneId", event.target.value)
              }
            >
              <option value="">{copy.noScene}</option>
              {draft.sourceSceneId &&
                !scenes.some(({ id }) => id === draft.sourceSceneId) && (
                  <option value={draft.sourceSceneId}>
                    {copy.missingScene}
                  </option>
                )}
              {scenes.map((scene, index) => (
                <option key={scene.id} value={scene.id}>
                  {index + 1}. {scene.title}
                </option>
              ))}
            </select>
          </label>
          <div className="dialog-actions relationship-actions">
            {draft.id && (
              <button
                type="button"
                className="icon-button delete-component"
                aria-label={copy.remove}
                disabled={pending}
                onClick={() => remove(draft.id)}
              >
                <Trash2 size={16} />
              </button>
            )}
            <button
              type="button"
              className="quiet-button"
              disabled={pending}
              onClick={() => {
                setDraft(null);
                setError("");
              }}
            >
              {copy.cancel}
            </button>
            <button
              type="submit"
              className="primary-button"
              disabled={pending || !selectedTarget || !draft.type.trim()}
            >
              {copy.save}
            </button>
          </div>
        </form>
      ) : (
        <div className="relationship-list">
          {entries.map((entry) => {
            const { relationship, other, orientation, unresolved } = entry;
            const Direction =
              orientation === "bidirectional"
                ? ArrowLeftRight
                : orientation === "incoming"
                  ? ArrowDownLeft
                  : ArrowUpRight;
            return (
              <article
                className={`relationship-card${unresolved ? " is-unresolved" : ""}`}
                key={relationship.id}
                data-relationship-id={relationship.id}
              >
                <div className="relationship-card-heading">
                  <button
                    type="button"
                    className="relationship-character-link"
                    disabled={!other || !onOpenComponent || pending}
                    onClick={() => onOpenComponent?.(other)}
                  >
                    <Direction size={15} aria-hidden="true" />
                    <strong>{other?.name || copy.missing}</strong>
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={copy.edit}
                    data-tooltip={copy.edit}
                    disabled={pending}
                    onClick={() => begin(entry)}
                  >
                    <Pencil size={15} />
                  </button>
                  {unresolved && (
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={copy.remove}
                      disabled={pending}
                      onClick={() => remove(relationship.id)}
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  className="relationship-summary"
                  aria-label={`${copy.edit}: ${relationship.label || relationship.type}`}
                  disabled={pending}
                  onClick={() => begin(entry)}
                >
                  <span>
                    {relationship.type}
                    {relationship.label ? ` · ${relationship.label}` : ""}
                  </span>
                  {relationship.state && <small>{relationship.state}</small>}
                  {relationship.description && (
                    <p>{relationship.description}</p>
                  )}
                </button>
                {unresolved && (
                  <p className="relationship-hint">{copy.missingHelp}</p>
                )}
              </article>
            );
          })}
          {!entries.length && (
            <p className="relationship-empty">
              {copy.empty}
              {!targets.length ? `. ${copy.none}` : ""}
            </p>
          )}
        </div>
      )}
      {status && (
        <div className="relationship-feedback" role="status">
          <span>{copy[status]}</span>
          {undo && (
            <button
              type="button"
              className="quiet-button"
              disabled={pending}
              onClick={restore}
            >
              <Undo2 size={14} />
              {copy.undo}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
