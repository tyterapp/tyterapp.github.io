import { test, expect } from '@playwright/test';
import { createProject } from '../src/data.js';
import { grantPro } from './helpers/pro-access.js';
import { unzipSync, strFromU8 } from 'fflate';
import { createCanvas } from '@napi-rs/canvas';
import { readFile } from 'node:fs/promises';
const p=(format,id,text)=>({type:'paragraph',attrs:{format,blockId:id},content:[{type:'text',text}]});
async function open(page){
  await grantPro(page); await page.route('**/__tyter_local/**',r=>r.fulfill({status:404}));
  const doc=createProject('Shortcut test');doc.id='story-actions';doc.content.content=[p('scene','one','INT. ROOM'),p('action','a','Hello world'),p('scene','two','EXT. PARK')];
  doc.content.content[1].content[0].marks=[{type:'comment',attrs:{id:'comment1'}}];
  doc.comments=[{id:'comment1',blockId:'a',anchor:12,quote:'Hello world',text:'Test comment',resolved:false}];
  const image=createCanvas(16,9).toDataURL('image/png');
  doc.sceneShots={one:{A:{frames:[{id:'f1',image,durationMs:1000}]}},two:{A:{frames:[{id:'f2',image,durationMs:1000}]}}};
  await page.addInitScript(doc=>{localStorage.setItem('tyter.projects.v1',JSON.stringify([doc]));localStorage.setItem('tyter.active',doc.id);localStorage.setItem('tyter.onboarding.v1','done');localStorage.setItem('tyter.editor-intro.v1','seen');localStorage.setItem('tyter.language.v1','ru')},doc);
  await page.goto('/beta', { waitUntil: 'domcontentloaded' }); await expect(page.locator('.screenplay-editor')).toBeVisible();
}
test('Ctrl+K adds a link to selected screenplay text',async({page})=>{
 await open(page);
 await page.locator('.screenplay-editor [data-block-id="a"]').evaluate(el=>{const range=document.createRange();range.selectNodeContents(el);const sel=window.getSelection();sel.removeAllRanges();sel.addRange(range)});
 await page.keyboard.press('Control+k');
 await page.getByLabel('Адрес ссылки').fill('https://example.com');
 await page.locator('.selection-link-form').getByRole('button',{name:'Добавить',exact:true}).click();
 await expect(page.locator('.screenplay-editor a[href="https://example.com/"]')).toContainText('Hello world');
});
test('storyboard scene actions can be cancelled and undone',async({page})=>{
 await open(page);await page.locator('.document-view-toggle').getByRole('button',{name:'Раскадровка',exact:true}).click();
 const card=page.locator('.story-card[data-scene="one"]');
 await card.click({button:'right'});await page.getByRole('menuitem',{name:'Дублировать'}).click();
 await expect(page.locator('.story-card')).toHaveCount(3);
 await page.getByRole('button',{name:'Отменить изменение'}).click();await expect(page.locator('.story-card')).toHaveCount(2);
 await card.click({button:'right'});await page.getByRole('menuitem',{name:'Кадры сцены'}).click();await expect(page.locator('.story-inspector')).toBeVisible();
 await card.click({button:'right'});await page.getByRole('menuitem',{name:'Удалить',exact:true}).click();await page.getByRole('button',{name:'Отменить',exact:true}).click();await expect(page.locator('.story-card')).toHaveCount(2);
 await card.click({button:'right'});await page.getByRole('menuitem',{name:'Удалить',exact:true}).click();await expect(page.locator('.story-card')).toHaveCount(1,{timeout:8000});
 await page.keyboard.press('Control+z');await expect(page.locator('.story-card')).toHaveCount(2);
});
test('storyboard exposes screenplay tools',async({page})=>{
 await open(page);await page.locator('.document-view-toggle').getByRole('button',{name:'Раскадровка',exact:true}).click();
 const nav=page.locator('.workspace-tools');
 for(const name of ['Поиск по сценарию','Статистика документа','Реплики персонажей','Компоненты','Комментарии']) await expect(nav.getByRole('button',{name,exact:true})).toBeVisible();
 await nav.getByRole('button',{name:'Статистика документа'}).click();await expect(page.getByRole('complementary',{name:'Статистика документа'})).toBeVisible();
});
test('comment highlight shortcut toggles highlighting while preserving comments and capital letters',async({page})=>{
 await open(page);
 const editor=page.locator('.screenplay-editor');
 await editor.click();
 await expect(editor.locator('.comment-open')).toHaveCount(1);
 await page.keyboard.press('Control+Shift+c');await expect(editor.locator('.comment-open')).toHaveCount(0);
 await expect(editor.locator('[data-comment-id="comment1"]')).toHaveCount(1);
 await page.keyboard.press('Control+Shift+c');await expect(editor.locator('.comment-open')).toHaveCount(1);
 await page.keyboard.press('Shift+C');await expect(editor).toContainText('C');
});
test('scene and page menus export correctly named frames and advertise future animatics',async({page})=>{
 await open(page);await page.locator('.document-view-toggle').getByRole('button',{name:'Раскадровка',exact:true}).click();
 await page.locator('.story-card[data-scene="one"]').click({button:'right'});
 let promise=page.waitForEvent('download');await page.getByRole('menuitem',{name:'Экспорт кадров сцены'}).click();
 let zip=unzipSync(new Uint8Array(await readFile(await (await promise).path())));
 expect(Object.keys(zip).filter(name=>name.endsWith('.png'))).toEqual([expect.stringMatching(/scene-001-A_.*_frame-001\.png$/)]);
 expect(JSON.parse(strFromU8(zip['storyboard.json'])).scenes).toHaveLength(1);
 await page.locator('.story-page-label').first().click({button:'right'});
 promise=page.waitForEvent('download');await page.getByRole('menuitem',{name:'Экспорт кадров страницы'}).click();
 zip=unzipSync(new Uint8Array(await readFile(await (await promise).path())));
 expect(Object.keys(zip).filter(name=>name.endsWith('.png'))).toHaveLength(2);
 await page.getByRole('button',{name:'Экспорт раскадровки'}).click();
 await expect(page.getByRole('button',{name:'Генерация аниматика — в разработке'})).toBeDisabled();
});
test('scene rows show frames and open their editor; aspect control changes frame shape',async({page})=>{
 await open(page);await page.locator('.document-view-toggle').getByRole('button',{name:'Раскадровка',exact:true}).click();
 const card=page.locator('.story-card[data-scene="one"]');
 await expect(card.locator('.story-card-slide')).toHaveCount(1);
 await page.getByLabel('Формат просмотра').selectOption('1:1');
 await expect(card.locator('.story-card-slide')).toHaveCSS('aspect-ratio','1 / 1');
 await card.getByRole('button',{name:'Открыть слайд 1'}).click();
 await expect(page.locator('.story-frame-workspace__canvas img')).toBeVisible();
 await expect(page.locator('.story-inspector')).toBeVisible();
 await page.getByRole('button',{name:'Закрыть редактор кадра'}).click();
 await expect(card).toBeVisible();
});
