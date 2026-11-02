import { test, expect } from '@playwright/test';
import { createProject } from '../src/data.js';
import { grantPro } from './helpers/pro-access.js';

async function open(page) {
  await grantPro(page);
  await page.route('**/__tyter_local/**', r => r.fulfill({ status: 404 }));
  const doc = createProject('Workspace regression');
  doc.id = 'workspace-regression';
  doc.content.content = [
    { type: 'paragraph', attrs: { format: 'scene', blockId: 'scene' } },
    { type: 'paragraph', attrs: { format: 'action', blockId: 'action' }, content: [{ type: 'text', text: 'An empty room.' }] },
  ];
  doc.components = [{ id: 'hero', type: 'character', name: 'Alice', description: '', aliases: [], enabled: true, folderId: 'character' }];
  doc.sceneShots = { scene: { A: { frames: [{ id: 'drawing', image: '', layers: [{ id: 'rect', name: 'Room', type: 'rectangle', points: [[0.1,0.1],[0.5,0.5]], color: '#000000', width: 3 }], comments: [{ id: 'note', text: 'Change framing', x: 0.3, y: 0.3, replies: [] }], durationMs: 1000 }] } } };
  await page.addInitScript(doc => {
    if (sessionStorage.getItem('workspace-seeded')) return;
    sessionStorage.setItem('workspace-seeded', '1');
    localStorage.setItem('tyter.projects.v1', JSON.stringify([doc]));
    localStorage.setItem('tyter.active', doc.id);
    localStorage.setItem('tyter.onboarding.v1', 'done');
    localStorage.setItem('tyter.editor-intro.v1', 'seen');
    localStorage.setItem('tyter.language.v1', 'ru');
  }, doc);
  await page.goto('/beta', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.screenplay-editor')).toBeVisible();
}
const storyboard = page => page.locator('.document-view-toggle').getByRole('button', { name: 'Раскадровка', exact: true }).click();

test('drama belongs to screenplay and storyboard scene sidebar contains structure only', async ({ page }) => {
  await open(page);
  await expect(page.getByRole('button', { name: 'График драматичности', exact: true })).toBeVisible();
  await storyboard(page);
  await expect(page.getByRole('button', { name: 'График драматичности', exact: true })).toHaveCount(0);
  await page.locator('.story-card-select').first().click();
  await expect(page.locator('.story-structure')).toBeVisible();
  await expect(page.locator('.story-inspector .story-filmstrip')).toHaveCount(0);
  await expect(page.locator('.story-inspector').getByRole('tab', { name: 'Инфо', exact: true })).toHaveCount(0);
  await expect(page.locator('.story-inspector').getByRole('tab', { name: 'FRAMES', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Открыть слайд 1', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Вернуться к раскадровке', exact: true })).toBeVisible();
  await expect(page.locator('.story-inspector')).toHaveCount(0);
});

test('comment visibility also controls pins in a frame and layer-only frames can play', async ({ page }) => {
  await open(page); await storyboard(page);
  const play = page.getByRole('button', { name: 'Воспроизвести страницу 1' });
  await expect(play).toBeEnabled();
  await play.click();
  await expect(page.locator('.story-player')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Открыть слайд 1', exact: true }).click();
  const pin = page.locator('.story-canvas-editor__marker');
  await expect(pin).toHaveCount(1);
  await page.keyboard.press('Control+Shift+c');
  await expect(pin).toHaveCount(0);
  await page.keyboard.press('Control+Shift+c');
  await expect(pin).toHaveCount(1);
});

test('Ctrl+0 resets document and board zoom without changing text', async ({ page }) => {
  await open(page);
  const paper = page.locator('.script-paper');
  await paper.hover();
  await page.keyboard.down('Control'); await page.mouse.wheel(0, -100); await page.keyboard.up('Control');
  await expect(paper).toHaveCSS('zoom', '1.1');
  await page.keyboard.press('Control+0'); await expect(paper).toHaveCSS('zoom', '1');
  await storyboard(page);
  const zoom = page.getByRole('slider', { name: 'Масштаб раскадровки' });
  await zoom.fill('75');
  await page.keyboard.press('Control+0'); await expect(zoom).toHaveValue('50');
  await expect(page.locator('.story-card')).toHaveCount(1);
});

test('component drag inserts its named reference at the drop position and supports undo', async ({ page }) => {
  await open(page);
  await page.locator('.workspace-tools').getByRole('button', { name: 'Компоненты', exact: true }).click();
  const source = page.locator('.component-item').filter({ hasText: 'Alice' });
  await expect(source).toHaveAttribute('draggable', 'true');
  const target = page.locator('.screenplay-editor [data-block-id="action"]');
  await source.dragTo(target);
  await expect(target).toContainText('Alice');
  await expect(target.locator('[data-entity-id="hero"]')).toHaveCount(1);
  await page.keyboard.press('Control+z');
  await expect(target).not.toContainText('Alice');
});
