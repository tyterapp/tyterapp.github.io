import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createProject } from '../src/data.js';
import { duplicateStoryboardScene, deleteStoryboardScene } from '../src/storyboard-model.js';
const p = (format, id, text) => ({ type: 'paragraph', attrs: {format, blockId:id}, content:[{type:'text',text}] });
function fixture() {
  const doc=createProject('Test');
  doc.content.content=[p('scene','one','INT. ROOM'),p('action','a','Hello'),p('scene','two','EXT. PARK')];
  doc.sceneShots={one:{A:{frames:[{id:'frame',image:'data:image/png;base64,aGVsbG8=',durationMs:1000}]}}};
  doc.sceneVariants={one:{B:[p('scene','one','ALT'),p('action','alt','Other')]}};
  doc.comments=[{id:'c',blockId:'a',anchor:12,text:'Comment'}];
  return doc;
}
test('duplicating a scene keeps its slides and variants with independent block identities',()=>{
  const doc=fixture(), result=duplicateStoryboardScene(doc,'one');
  assert.equal(result.document.content.content.length,5);
  assert.notEqual(result.id,'one');
  assert.equal(result.document.content.content[2].attrs.blockId,result.id);
  assert.notEqual(result.document.content.content[3].attrs.blockId,'a');
  assert.equal(result.document.sceneShots[result.id].A.frames[0].image,doc.sceneShots.one.A.frames[0].image);
  assert.equal(result.document.sceneVariants[result.id].B[0].attrs.blockId,result.id);
  assert.notEqual(result.document.sceneVariants[result.id].B[1].attrs.blockId,'alt');
  assert.deepEqual(doc.comments,result.document.comments);
});
test('deleting a scene removes its own resources without touching other scenes',()=>{
  const doc=fixture(), next=deleteStoryboardScene(doc,'one');
  assert.deepEqual(next.content.content.map(x=>x.attrs.blockId),['two']);
  assert.equal(next.sceneShots.one,undefined);
  assert.equal(next.sceneVariants.one,undefined);
  assert.equal(next.comments.length,0);
  assert.equal(doc.comments.length,1);
});
