const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function fixture() {
  const overlays = [], observers = [], queued = [];
  const style = {setProperty() {}};
  const root = {style, dataset:{}};
  const document = {documentElement:root, activeElement:null, body:{style,
    appendChild(overlay) { overlays.push(overlay); overlay.isConnected = true; }},
    querySelector:() => null, querySelectorAll:() => overlays.filter(overlay => overlay.isConnected)};
  const previous = {isConnected:true,focus() {document.activeElement=this;}};
  document.activeElement = previous;
  const context = vm.createContext({document,innerWidth:1280,MutationObserver:class {
    constructor(callback){observers.push(callback);} observe(){} disconnect(){}
  },getComputedStyle:el => ({fontSize:el === root ? '16px' : '14px'}),
    queueMicrotask:callback => queued.push(callback), CustomEvent:class {},
    window:{addEventListener(){},dispatchEvent(){}},console});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../web/ui-foundation.js'),'utf8'),context);
  const overlay = {hidden:false,isConnected:false,listeners:{},
    addEventListener(name,callback) {(this.listeners[name] ||= []).push(callback);},
    getClientRects:() => [1], matches:() => false,
    remove(){this.isConnected=false;observers.forEach(callback=>callback());},
    querySelector(selector) {return selector === '.modal' ? dialog : selector.includes('data-action') ? cancel : null;},
    querySelectorAll:() => [first,cancel]};
  const dialog = {attributes:{},setAttribute(key,value){this.attributes[key]=value;},hasAttribute:() => false,
    querySelector:() => null,contains:el => [first,cancel].includes(el)};
  const control = () => ({disabled:false,tabIndex:0,getClientRects:() => [1],focus(){document.activeElement=this;}});
  const first=control(), cancel=control();cancel.click=()=>overlay.remove();
  const key = (key,shiftKey=false) => {
    const event={key,shiftKey,preventDefault(){this.prevented=true;},stopImmediatePropagation(){}};
    overlay.listeners.keydown[0](event);return event;
  };
  return {context,overlay,dialog,document,previous,first,cancel,key,flush:()=>queued.splice(0).forEach(callback=>callback())};
}

test('dialog entry, bidirectional Tab containment, Escape and focus return share one lifecycle', () => {
  const f=fixture();f.context.ArcadeDialogs.mount(f.overlay);f.flush();
  assert.equal(f.dialog.attributes.role,'dialog');
  assert.equal(f.document.activeElement,f.first);
  f.key('Tab',true);assert.equal(f.document.activeElement,f.cancel);
  f.key('Tab');assert.equal(f.document.activeElement,f.first);
  f.key('Escape');assert.equal(f.overlay.isConnected,false);
  assert.equal(f.document.activeElement,f.previous);
});

test('an outstanding request blocks dismissal and recovers after failure', async () => {
  const f=fixture();f.context.ArcadeDialogs.mount(f.overlay);f.flush();
  let reject;
  const request=f.context.ArcadeDialogs.request(()=>new Promise((_resolve,fail)=>{reject=fail;}));
  f.key('Escape');assert.equal(f.overlay.isConnected,true);
  reject(new Error('fixture failure'));await assert.rejects(request,/fixture failure/);
  f.key('Escape');assert.equal(f.overlay.isConnected,false);
});

test('browser-local editors remain usable while unrelated native requests finish', async () => {
  const f=fixture();f.context.ArcadeDialogs.mount(f.overlay,{localOnly:true});f.flush();
  let release;
  const request=f.context.ArcadeDialogs.request(()=>new Promise(resolve=>{release=resolve;}));
  f.key('Escape');assert.equal(f.overlay.isConnected,false);
  release();await request;
});

test('a draft-aware close delegate retains the dialog until explicit discard', () => {
  const f=fixture();let closes=0;
  f.context.ArcadeDialogs.mount(f.overlay,{close:()=>{closes++;}});f.flush();
  f.key('Escape');assert.equal(closes,1);assert.equal(f.overlay.isConnected,true);
});
