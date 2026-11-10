const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = name => fs.readFileSync(path.join(__dirname,'../source',name),'utf8');
function fixture() {
  const item = {id:'bookmark',type:'bookmark',title:'Docs',url:'https://docs.example/page'};
  const folder = {id:'folder',type:'folder',title:'Docs',children:[]};
  const column = {id:'column',items:[folder]}, inbox = {id:'inbox-tab',items:[item]};
  const tab = {id:'tab',columns:[column],inbox}, board = {id:'board',tabs:[tab],speedDial:[]};
  const state = {boards:[board],essentials:[],settings:{essentialsDisplayCount:2},importManager:{items:[]},tags:[]};
  let saves=0, undo=0;
  const c = vm.createContext({state,crypto:require('node:crypto').webcrypto,URL,structuredClone,
    bridge:{storageIsAvailable:()=>true},sharedDiskSyncIsBlocked:()=>false,
    getSpeedDialSlotCount:()=>2,getBoardTabs:b=>b.tabs,getBoardForContext:ct=>state.boards.find(b=>b.id===ct.boardId),
    getBoardItemContainers:(b,t)=>[...t.columns,t.inbox],isDynamicFolder:f=>f.folderMode==='dynamic',canInsertIntoFolder:()=>true,
    pushUndoSnapshot:()=>undo++,invalidateDerivedCaches(){},renderContentSurfaces(){},saveState:async()=>{saves++;return {ok:true};}});
  const source=read('state.js');
  for(const name of ['findBoardItemInList','findBoardItemInColumns','resolvePortalItemContext']) {
    const start=source.indexOf(`function ${name}(`); vm.runInContext(source.slice(start,source.indexOf('\n}',start)+2),c);
  }
  vm.runInContext(read('search-placement.js'),c);
  return {c,state,item,folder,column,tab,board,inbox,counts:()=>({saves,undo})};
}
const sourceMeta={area:'board-item',boardId:'board',tabId:'tab',columnId:'inbox-tab'};
const destination={boardId:'board',tabId:'tab',columnId:'column',folderId:'folder'};
test('search moves the exact source into a nested folder with one Undo and authoritative save',async()=>{
  const h=fixture(); await h.c.moveSearchItem(sourceMeta,'bookmark',destination);
  assert.equal(h.inbox.items.length,0); assert.equal(h.folder.children[0],h.item);
  assert.deepEqual(h.counts(),{undo:1,saves:1});
});
test('a stale source or destination and inherited locks never remove the source',async()=>{
  for(const change of [h=>h.board.locked=true,h=>h.tab.locked=true,h=>h.column.locked=true,
    h=>h.folder.locked=true,h=>h.folder.folderMode='dynamic',h=>h.column.items=[],h=>h.inbox.locked=true]) {
    const h=fixture();change(h);
    await assert.rejects(h.c.moveSearchItem(sourceMeta,'bookmark',destination));
    assert.equal(h.inbox.items[0],h.item);assert.deepEqual(h.counts(),{saves:0,undo:0});
  }
  const h=fixture();h.inbox.items=[];await assert.rejects(h.c.moveSearchItem(sourceMeta,'bookmark',destination));
  assert.deepEqual(h.counts(),{saves:0,undo:0});
});
test('launcher placement rejects occupied slots and moves without replacing existing data',async()=>{
  const h=fixture(); h.state.essentials=[{id:'keep',type:'game',gameKey:'opaque'}];
  await assert.rejects(h.c.moveSearchItem(sourceMeta,'bookmark',{kind:'essential',slot:0}));
  assert.equal(h.state.essentials[0].id,'keep');assert.equal(h.inbox.items.length,1);
  await h.c.moveSearchItem(sourceMeta,'bookmark',{kind:'essential',slot:1});
  assert.equal(h.state.essentials[1],h.item);assert.equal(h.inbox.items.length,0);
});
test('catalogue placements persist compact cards into folders, Inbox, Essentials and Speed Dial',async()=>{
  for(const target of [destination,{...destination,folderId:undefined,columnId:'inbox-tab'},
    {kind:'essential',slot:0},{kind:'speed-dial',boardId:'board',slot:0}]) {
    const h=fixture();const resolved=h.c.resolveSearchPlacement(target,'game');
    await h.c.persistSearchGames(target,[{title:'Jetpac',gameKey:'game_abcdefghijkl',systemId:'zx-spectrum',systemName:'ZX Spectrum',catalogueId:'public',nativePath:'private',arguments:['secret']}]);
    const card=resolved.slot===null ? resolved.list.at(-1):resolved.list[resolved.slot];
    assert.equal(card.type,'game');assert.equal(card.catalogueId,'public');
    assert.doesNotMatch(JSON.stringify(card),/private|secret|nativePath|arguments/);
    assert.deepEqual(h.counts(),{undo:1,saves:1});
  }
});
test('failed saves report uncertainty and never retry a move implicitly',async()=>{
  const h=fixture();let calls=0;h.c.saveState=async()=>{calls++;return {ok:false,conflict:true};};
  await assert.rejects(h.c.moveSearchItem(sourceMeta,'bookmark',destination),/could not be confirmed/);
  assert.equal(calls,1);assert.equal(h.folder.children.length,1);
});
test('rule explanations capture sequential matching and the stop boundary without mutating previews',()=>{
  const c=vm.createContext({URL,structuredClone});const source=read('phase2-tools.js');vm.runInContext(source.slice(0,source.indexOf('// --- Phase 2 UI ---')),c);
  const item={type:'bookmark',title:'Original',url:'https://docs.example/page'};
  const rules=[{id:'rename',name:'Rename',stop:false,conditions:{hostname:'docs.example'},actions:{titlePrefix:'Docs '}},
    {id:'second',name:'Next',conditions:{titleText:'Docs Original'},actions:{addTags:['read']}},
    {id:'later',conditions:{},actions:{titleReplacement:'Never'}}];
  const result=c.evaluateAutomationRules([{item,source:'inbox',locked:true}],rules)[0];
  assert.deepEqual(Array.from(result.matchedRules),['rename','second']);
  assert.equal(result.explanations[1].matchedTitle,'Docs Original');
  assert.match(result.explanations[0].reason,/website is docs.example/);
  assert.equal(result.explanations[1].stops,true);assert.equal(item.title,'Original');
  assert.ok(result.conflicts.includes('Item is locked'));
});
test('Inbox recommendations use exact-host organised placements and never create automation',()=>{
  const c=vm.createContext({URL,structuredClone,state:{automationRules:[]},
    searchPlacementChoices:()=>[{label:'Docs',destination:{columnId:'docs'}},{label:'Other',destination:{columnId:'other'}}],
    resolveSearchPlacement:d=>({list:d.columnId==='docs'?[{id:'old',type:'bookmark',url:'https://docs.example/old'}]:[{id:'x',type:'bookmark',url:'https://other.example/'}]}),isInboxColumnId:()=>false});
  const source=read('phase2-tools.js');vm.runInContext(source.slice(0,source.indexOf('// --- Phase 2 UI ---')),c);
  const results=c.phaseTwoSuggestedDestinations({id:'new',url:'https://docs.example/new'});
  assert.equal(results.length,1);assert.equal(results[0].label,'Docs');assert.match(results[0].reason,/1 docs.example link/);
  assert.equal(c.state.automationRules.length,0);
});
