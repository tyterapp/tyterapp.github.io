import { test, expect } from "@playwright/test";
import {
  cleanComponentRelationships,
  deleteCharacterRelationship,
  relationshipsForComponent,
  saveCharacterRelationship,
  undoRelationshipChange,
  validateRelationshipDraft,
} from "../src/component-relationships.js";
import { createProject } from "../src/data.js";
import { grantPro } from "./helpers/pro-access.js";

const timestamp = "2026-10-18T10:00:00.000Z";
const fixture = () => ({
  components: [
    {
      id: "anna",
      name: "Анна",
      type: "character",
      characterPayload: { bio: "Сохранить", layout: { x: 10, y: 20 } },
    },
    { id: "boris", name: "Борис", type: "character" },
    { id: "room", name: "Комната", type: "place" },
  ],
  relationships: [],
});
const draft = (extra = {}) => ({
  sourceComponentId: "anna",
  targetComponentId: "boris",
  type: "друзья",
  label: "С детства",
  direction: "bidirectional",
  state: "доверяют",
  description: "Давняя дружба.",
  ...extra,
});

test("relationships model: categories only hide endpoints and keep all stored relationships and character payload", () => {
  let document = fixture();
  document.relationships = saveCharacterRelationship(document, draft(), {
    id: "relation-1",
    now: timestamp,
  }).relationships;
  const original = JSON.stringify(document.relationships);
  expect(relationshipsForComponent(document, "anna")).toHaveLength(1);
  document.components[1].type = "place";
  expect(relationshipsForComponent(document, "anna")).toEqual([]);
  expect(relationshipsForComponent(document, "boris")).toEqual([]);
  expect(JSON.stringify(document.relationships)).toBe(original);
  document = JSON.parse(
    JSON.stringify({
      ...document,
      relationships: cleanComponentRelationships(document.relationships),
    }),
  );
  document.components[1].type = "character";
  expect(relationshipsForComponent(document, "anna")[0].relationship.id).toBe(
    "relation-1",
  );
  document.components[0].type = "place";
  document.components[1].type = "place";
  expect(relationshipsForComponent(document, "anna")).toEqual([]);
  document.components[0].type = "character";
  expect(relationshipsForComponent(document, "anna")).toEqual([]);
  document.components[1].type = "character";
  expect(relationshipsForComponent(document, "anna")).toHaveLength(1);
  expect(document.components[0].characterPayload).toEqual({
    bio: "Сохранить",
    layout: { x: 10, y: 20 },
  });
  expect(JSON.stringify(document.relationships)).toBe(original);
  document.components[1].enabled = false;
  expect(relationshipsForComponent(document, "anna")).toEqual([]);
  expect(relationshipsForComponent(document, "boris")).toEqual([]);
  expect(
    saveCharacterRelationship(document, draft(), { id: "hidden" }).error,
  ).toBe("endpoint");
  document.components[1].enabled = true;
  expect(relationshipsForComponent(document, "anna")).toHaveLength(1);
  expect(JSON.stringify(document.relationships)).toBe(original);
});

test("relationships model: different types coexist while self-links, inactive targets and exact duplicates are rejected", () => {
  let document = fixture();
  expect(
    validateRelationshipDraft(document, draft({ targetComponentId: "anna" })),
  ).toBe("self");
  expect(
    validateRelationshipDraft(document, draft({ targetComponentId: "room" })),
  ).toBe("endpoint");
  expect(
    validateRelationshipDraft(
      document,
      draft({ targetComponentId: "missing" }),
    ),
  ).toBe("endpoint");
  document.relationships = saveCharacterRelationship(document, draft(), {
    id: "friends",
    now: timestamp,
  }).relationships;
  expect(
    validateRelationshipDraft(
      document,
      draft({
        sourceComponentId: "boris",
        targetComponentId: "anna",
        type: " ДРУЗЬЯ ",
      }),
    ),
  ).toBe("duplicate");
  const result = saveCharacterRelationship(
    document,
    draft({ type: "соперники", direction: "directed" }),
    { id: "rivals", now: timestamp },
  );
  expect(result.relationships).toHaveLength(2);
  document.relationships = result.relationships;
  expect(
    validateRelationshipDraft(
      document,
      draft({
        sourceComponentId: "boris",
        targetComponentId: "anna",
        type: "соперники",
        direction: "directed",
      }),
    ),
  ).toBe("");
  expect(
    relationshipsForComponent(document, "boris").find(
      ({ relationship }) => relationship.id === "rivals",
    ).orientation,
  ).toBe("incoming");
});

test("relationships model: create/edit/delete undo changes only its record and refuses to overwrite a newer edit", () => {
  let document = fixture();
  const created = saveCharacterRelationship(document, draft(), {
    id: "one",
    now: timestamp,
  });
  document.relationships = created.relationships;
  const edited = saveCharacterRelationship(
    document,
    { ...created.relationship, label: "Новая подпись" },
    { now: "2026-10-18T11:00:00.000Z" },
  );
  expect(edited.relationship.createdAt).toBe(timestamp);
  expect(edited.relationship.updatedAt).toBe("2026-10-18T11:00:00.000Z");
  const unrelated = { ...created.relationship, id: "other", type: "коллеги" };
  const restored = undoRelationshipChange(
    [...edited.relationships, unrelated],
    edited.change,
  );
  expect(restored.relationships).toEqual([created.relationship, unrelated]);
  const removed = deleteCharacterRelationship(restored.relationships, "one");
  expect(
    undoRelationshipChange(removed.relationships, removed.change).relationships,
  ).toEqual(restored.relationships);
  const newer = [{ ...edited.relationship, label: "Чужая правка" }, unrelated];
  expect(undoRelationshipChange(newer, edited.change)).toEqual({
    error: "changed",
  });
  expect(newer[0].label).toBe("Чужая правка");
  expect(
    undoRelationshipChange(created.relationships, created.change).relationships,
  ).toEqual([]);
});

test("relationships model: unavailable endpoints and removed scenes survive serialization and can be repaired or deleted", () => {
  let document = fixture();
  document.relationships = cleanComponentRelationships([
    {
      ...draft({
        targetComponentId: "removed",
        sourceSceneId: "deleted-scene",
      }),
      id: "dangling",
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  ]);
  const [entry] = relationshipsForComponent(document, "anna");
  expect(entry.unresolved).toBe(true);
  expect(entry.other).toBeNull();
  expect(entry.relationship.sourceSceneId).toBe("deleted-scene");
  const repaired = saveCharacterRelationship(
    document,
    { ...entry.relationship, targetComponentId: "boris" },
    { now: timestamp },
  );
  expect(repaired.relationship.sourceSceneId).toBe("deleted-scene");
  expect(repaired.relationship.id).toBe("dangling");
  expect(
    deleteCharacterRelationship(document.relationships, "dangling")
      .relationships,
  ).toEqual([]);
});

test("relationships model: library identity survives serialization and editing hidden relationship metadata", () => {
  const document = fixture();
  const librarySource = {
    libraryId: "library",
    relationshipId: "original-relation",
    sourceComponentId: "original-anna",
    targetComponentId: "original-boris",
  };
  document.relationships = saveCharacterRelationship(
    document,
    draft({ librarySource }),
    { id: "linked", now: timestamp },
  ).relationships;
  document.relationships = cleanComponentRelationships(
    JSON.parse(JSON.stringify(document.relationships)),
  );
  expect(document.relationships[0].librarySource).toEqual(librarySource);
  const edited = saveCharacterRelationship(
    document,
    { ...document.relationships[0], label: "Локальная подпись" },
    { now: timestamp },
  );
  expect(edited.relationship.librarySource).toEqual(librarySource);
  document.components[1].type = "place";
  expect(relationshipsForComponent(document, "anna")).toEqual([]);
  expect(
    cleanComponentRelationships(edited.relationships)[0].librarySource,
  ).toEqual(librarySource);
});

async function open(page, language = "ru", relationships = []) {
  await grantPro(page);
  await page.route("**/__tyter_local/**", (route) =>
    route.fulfill({ status: 404 }),
  );
  const document = {
    ...createProject("Связи персонажей"),
    ...fixture(),
    relationships,
    id: "relationships-ui",
  };
  await page.addInitScript(
    ({ document, language }) => {
      localStorage.setItem("tyter.projects.v1", JSON.stringify([document]));
      localStorage.setItem("tyter.active", document.id);
      localStorage.setItem("tyter.onboarding.v1", "done");
      localStorage.setItem("tyter.language.v1", language);
      localStorage.setItem(
        "tyter.editor-preferences.v1",
        JSON.stringify({ theme: "dark" }),
      );
    },
    { document, language },
  );
  await page.goto("/pro");
  await expect(page.locator(".screenplay-editor")).toBeVisible();
  await page
    .getByRole("navigation", {
      name: language === "ru" ? "Инструменты редактора" : "Editor tools",
    })
    .getByRole("button", {
      name: language === "ru" ? "Компоненты" : "Components",
      exact: true,
    })
    .click();
  await page.locator('[data-component-id="anna"] .component-item').click();
}

for (const language of ["ru", "en"])
  test(`${language}: relationship cards create, edit, delete with Undo and navigate to the other character`, async ({
    page,
  }) => {
    await open(page, language);
    const english = language === "en";
    const section = page.getByRole("region", {
      name: english ? "Relationships" : "Связи",
      exact: true,
    });
    await expect(section).toBeVisible();
    await section
      .getByRole("button", {
        name: english ? "Add relationship" : "Добавить связь",
        exact: true,
      })
      .click();
    const form = section.getByRole("form", {
      name: english ? "New relationship" : "Новая связь",
      exact: true,
    });
    const target = form.getByLabel(english ? "Character" : "Персонаж", {
      exact: true,
    });
    expect(await target.locator("option").allTextContents()).toEqual([
      english ? "Choose a character" : "Выберите персонажа",
      "Борис",
    ]);
    await form
      .getByLabel(english ? "Relationship type" : "Тип связи", { exact: true })
      .fill("друзья");
    await form
      .getByLabel(english ? "Direction" : "Направление", { exact: true })
      .selectOption("bidirectional");
    await form
      .getByLabel(english ? "Label" : "Подпись", { exact: false })
      .fill("С детства");
    await form
      .getByRole("button", {
        name: english ? "Save" : "Сохранить",
        exact: true,
      })
      .click();
    const card = section.locator(".relationship-card");
    await expect(card).toHaveCount(1);
    await expect(card).toContainText("друзья · С детства");
    await card
      .getByRole("button", {
        name: english ? "Edit relationship" : "Редактировать связь",
        exact: true,
      })
      .click();
    await section
      .getByLabel(english ? "State" : "Состояние", { exact: false })
      .fill("Конфликт");
    await section
      .getByRole("button", {
        name: english ? "Save" : "Сохранить",
        exact: true,
      })
      .click();
    await expect(card).toContainText("Конфликт");
    await card
      .getByRole("button", {
        name: english ? "Edit relationship" : "Редактировать связь",
        exact: true,
      })
      .click();
    await section
      .getByRole("button", {
        name: english ? "Delete relationship" : "Удалить связь",
        exact: true,
      })
      .click();
    await expect(card).toHaveCount(0);
    await section
      .getByRole("button", { name: english ? "Undo" : "Отменить", exact: true })
      .click();
    await expect(card).toHaveCount(1);
    await expect(card).toContainText("Конфликт");
    await card.getByRole("button", { name: "Борис", exact: true }).click();
    await expect(page.locator(".component-detail-heading h2")).toHaveText(
      "Борис",
    );
    await expect(
      page.locator(
        '[data-relationships-component="boris"] .relationship-character-link',
      ),
    ).toHaveText("Анна");
  });

test("category changes hide a relationship and returning to Characters restores the same record", async ({
  page,
}) => {
  const relationships = cleanComponentRelationships([
    { ...draft(), id: "preserved", createdAt: timestamp, updatedAt: timestamp },
  ]);
  await open(page, "ru", relationships);
  const section = page.locator(".component-relationships");
  await expect(
    section.locator('[data-relationship-id="preserved"]'),
  ).toHaveCount(1);
  const profile = page.locator(".component-editor form");
  await profile.getByLabel("Папка", { exact: true }).selectOption("place");
  await profile.getByRole("button", { name: "Сохранить", exact: true }).click();
  await page.locator('[data-component-id="anna"] .component-item').click();
  await expect(section).toHaveCount(0);
  await profile.getByLabel("Папка", { exact: true }).selectOption("character");
  await profile.getByRole("button", { name: "Сохранить", exact: true }).click();
  await page.locator('[data-component-id="anna"] .component-item').click();
  await expect(
    section.locator('[data-relationship-id="preserved"]'),
  ).toHaveCount(1);
  await expect(section.locator(".relationship-character-link")).toHaveText(
    "Борис",
  );
});

test("an unavailable endpoint can be replaced without losing the relationship identity or scene reference", async ({
  page,
}) => {
  const relationships = cleanComponentRelationships([
    {
      ...draft({
        targetComponentId: "removed",
        sourceSceneId: "removed-scene",
      }),
      id: "repair",
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  ]);
  await open(page, "ru", relationships);
  const section = page.locator(".component-relationships");
  const card = section.locator('[data-relationship-id="repair"]');
  await expect(card).toContainText("Персонаж недоступен");
  await card
    .getByRole("button", { name: "Редактировать связь", exact: true })
    .click();
  await expect(
    section.getByRole("button", { name: "Сохранить", exact: true }),
  ).toBeDisabled();
  await section.getByLabel("Персонаж", { exact: true }).selectOption("boris");
  const scene = section.getByLabel(/Сцена-основание/);
  await expect(scene).toHaveValue("removed-scene");
  await expect(scene.locator('option[value="removed-scene"]')).toHaveText(
    "Сцена недоступна",
  );
  await section.getByRole("button", { name: "Сохранить", exact: true }).click();
  await expect(card).toHaveCount(1);
  await expect(card).not.toContainText("Персонаж недоступен");
  await expect(card.locator(".relationship-character-link")).toHaveText(
    "Борис",
  );
});
