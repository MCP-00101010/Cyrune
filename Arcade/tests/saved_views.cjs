const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const c=vm.createContext({structuredClone});
vm.runInContext(fs.readFileSync(path.join(__dirname,'../web/saved-views.js'),'utf8'),c);
const app=fs.readFileSync(path.join(__dirname,'../web/app.js'),'utf8');
for(const name of ['filterSettings']) { const start=app.indexOf(`function ${name}(`);vm.runInContext(app.slice(start,app.indexOf('\n}',start)+2),c); }
function harness() {
  let value=null,fail=false;
  const storage={getItem:()=>value,setItem:(key,next)=>{if(fail)throw new Error('Quota');value=next;}};
  const adapters={storage,platforms:['zx-spectrum','atari-st'],filters:c.filterSettings,columns:v=>({columnOrder:v.columnOrder||['title'] }),sorts:['title','year']};
  return {store:c.ArcadeSavedViews.create(adapters),reload:()=>c.ArcadeSavedViews.create(adapters),data:()=>value,fail:()=>{fail=true;}};
}
const row={id:'one',name:'English favourites',platform:'zx-spectrum',filters:{search:'Jet',view:'favourites',multiFilters:{language:['EN']},excludedFilters:{system:['16K']},poks:'exclude'},columns:{columnOrder:['title','year']},sortRules:[{key:'year',dir:'desc'}]};
test('named views retain query, exclusions, columns and sorting across reload without game authority',()=>{
  const h=harness();h.store.save({...row,gameKey:'secret',nativePath:'private',emulator:'authority'});
  const saved=h.reload().list('zx-spectrum')[0];
  assert.equal(saved.filters.search,'Jet');assert.equal(saved.filters.poks,'exclude');
  assert.deepEqual(Array.from(saved.filters.excludedFilters.system),['16K']);
  assert.equal(saved.sortRules[0].dir,'desc');assert.equal(h.reload().list('atari-st').length,0);
  assert.doesNotMatch(h.data(),/secret|private|authority|gameKey|emulator/);
  saved.filters.search='Changed';assert.equal(h.store.list('zx-spectrum')[0].filters.search,'Jet');
});
test('updates and deletion persist, and failed writes retain the prior saved view',()=>{
  const h=harness();h.store.save(row);h.store.save({...row,name:'Updated'});assert.equal(h.reload().list('zx-spectrum').length,1);
  h.fail();assert.throws(()=>h.store.remove('one'),/Quota/);assert.equal(h.store.list('zx-spectrum')[0].name,'Updated');
  assert.throws(()=>h.store.save({...row,name:'Lost'}));assert.equal(h.reload().list('zx-spectrum')[0].name,'Updated');
  const good=harness();good.store.save(row);good.store.remove('one');assert.equal(good.reload().list('zx-spectrum').length,0);
});
test('corrupt storage, unknown platforms, invalid sort fields and retention limits are bounded',()=>{
  const adapters={platforms:['zx-spectrum'],filters:c.filterSettings,columns:()=>({}),sorts:['title']};
  const rows=c.ArcadeSavedViews.normalize([{...row,platform:'unknown'},row,{...row,id:'two',sortRules:[{key:'nativePath',dir:'asc'}]}],adapters);
  assert.equal(rows.length,2);assert.equal(rows[0].sortRules.length,0);assert.equal(rows[1].sortRules.length,0);
  const h=harness();for(let n=0;n<40;n++)h.store.save({...row,id:`view-${n}`});
  assert.throws(()=>h.store.save({...row,id:'overflow'}),/40 views/);h.store.save({...row,id:'view-0',name:'Updated'});
  assert.equal(h.reload().list('zx-spectrum').length,40);
});
