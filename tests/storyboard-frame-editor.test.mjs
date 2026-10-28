import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanFrames } from '../src/storyboard-data.js';
test('frame drawings and comments survive validation with bounded safe geometry',()=>{
 const [frame]=cleanFrames([{id:'f',layers:[{id:'layer',name:'Sketch',type:'path',points:[[0.1,0.2],[0.8,0.9]],color:'#123456',width:3}],comments:[{id:'c',x:.5,y:.25,text:'Fix this',replies:[{id:'r',text:'Okay'}]}]}]);
 assert.equal(frame.layers[0].name,'Sketch'); assert.deepEqual(frame.layers[0].points,[[.1,.2],[.8,.9]]); assert.equal(frame.comments[0].replies[0].text,'Okay');
});
