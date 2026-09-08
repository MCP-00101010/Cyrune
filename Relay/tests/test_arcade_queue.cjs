const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../background.js'),'utf8');

test('Arcade keeps complete transfers within two slots and never runs expired queued work', async()=>{
  const timers=new Map();let timer=0;
  const context=vm.createContext({setTimeout:fn=>{timers.set(++timer,fn);return timer;},clearTimeout:id=>timers.delete(id)});
  const start=source.indexOf('const arcadeTransferGate =');
  vm.runInContext(source.slice(start,source.indexOf('function runEmuGuiPageRpc',start))+'globalThis.gate=arcadeTransferGate;',context);
  const releases=[];let active=0,maximum=0;
  const work=()=>new Promise(resolve=>{active++;maximum=Math.max(maximum,active);releases.push(()=>{active--;resolve();});});
  const first=context.gate(work),second=context.gate(work);let dispatched=false;
  const third=context.gate(()=>{dispatched=true;});
  const rejected=assert.rejects(third,/expired/);
  await new Promise(setImmediate);assert.equal(maximum,2);
  for(const callback of timers.values())callback();
  await rejected;releases.forEach(release=>release());await Promise.all([first,second]);
  assert.equal(dispatched,false);
});
