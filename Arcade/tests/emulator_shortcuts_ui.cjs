const test = require('node:test');
const assert = require('node:assert/strict');
require('../web/emulator-shortcuts.js');

class Element {
  children=[]; events={};
  append(...items) { this.children.push(...items); }
  replaceChildren() { this.children=[]; }
  setAttribute(key,value) { this[key]=value; }
  addEventListener(key,fn) { this.events[key]=fn; }
}
globalThis.document={createElement:()=>new Element()};

test('emulator links use installed icons, launch only IDs and ignore old-platform responses', async () => {
  const container=new Element(),status=new Element(); let selected='gb'; let finish;
  const calls=[];
  const view=ArcadeEmulatorShortcuts.create({container,status,collectionId:()=>selected,api:async(path,options)=>{
    calls.push([path,options]);
    if(path==='/api/launch-emulator')return {ok:true};
    if(path.includes('emulator-icon'))return {icon:'data:image/png;base64,aWNvbg=='};
    if(selected==='slow')return new Promise(resolve=>{finish=resolve;});
    return {shortcuts:[{id:selected,name:selected==='gb'?'SameBoy':'ScummVM',iconRevision:'1'}]};
  }});
  await view.refresh();
  const button=container.children[0];
  assert.equal(button.children[0].src,'data:image/png;base64,aWNvbg==');
  assert.equal(button.children[1].textContent,'SameBoy');
  await button.events.click();
  assert.deepEqual(JSON.parse(calls.find(([p])=>p==='/api/launch-emulator')[1].body),{collection_id:'gb',emulator_id:'gb'});
  selected='slow';const pending=view.refresh();await new Promise(setImmediate);
  selected='scummvm';await view.refresh();
  finish({shortcuts:[{id:'old',name:'Wrong emulator'}]});await pending;
  assert.equal(container.children[0].children[1].textContent,'ScummVM');
  const launches=calls.filter(([p])=>p==='/api/launch-emulator').length;
  await button.events.click();
  assert.equal(calls.filter(([p])=>p==='/api/launch-emulator').length,launches);
});
