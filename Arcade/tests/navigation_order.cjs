const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../web/navigation-order.js'), 'utf8');

for (const attribute of ['data-platform', 'data-emulator']) {
  test(`${attribute}: stationary drag-over events leave the preview mounted without restarting it`, () => {
    let insertions = 0;
    class Tile {
      constructor(value) {
        this.value=value; this.children=[]; this.title=value; this.style={}; this.handlers={};
        this.attributes=new Map(value ? [[attribute,value]] : []);
        const classes=new Set();
        this.classList={add:name=>classes.add(name),remove:name=>classes.delete(name),contains:name=>classes.has(name)};
      }
      matches(){return this.attributes.has(attribute);}
      getAttribute(name){return this.attributes.get(name);}
      setAttribute(name,value){this.attributes.set(name,value);}
      removeAttribute(name){this.attributes.delete(name);}
      querySelectorAll(){return [];}
      cloneNode(){return new Tile(this.value);}
      getBoundingClientRect(){const left=['a','b','c'].indexOf(this.value)*80;return {left,top:0,bottom:64,width:80,height:64};}
      closest(){return this;}
      append(tile){tile.remove();tile.parentElement=this;this.children.push(tile);}
      before(tile){this.parentElement.insertBefore(tile,this);}
      remove(){if(this.parentElement){this.parentElement.children=this.parentElement.children.filter(el=>el!==this);this.parentElement=null;}}
      insertBefore(tile,before){insertions++;tile.remove();tile.parentElement=this;this.children.splice(before ? this.children.indexOf(before) : this.children.length,0,tile);}
      addEventListener(name,fn){this.handlers[name]=fn;}
      removeEventListener(name){delete this.handlers[name];}
      focus(){}
      get nextElementSibling(){return this.parentElement?.children[this.parentElement.children.indexOf(this)+1] || null;}
    }
    const frames=[];
    const context=vm.createContext({localStorage:{getItem:()=>null,setItem(){}},requestAnimationFrame:fn=>frames.push(fn),setTimeout,clearTimeout});
    vm.runInContext(source,context);
    const grid=new Tile(''), a=new Tile('a'), b=new Tile('b'), c=new Tile('c');
    [a,b,c].forEach(tile=>grid.append(tile));
    context.ArcadeNavigationOrder.attach(grid,'platforms',attribute);
    const dataTransfer={setData(){},setDragImage(){}};
    grid.handlers.dragstart({target:c,clientX:170,clientY:10,dataTransfer});
    const over={clientX:1,clientY:10,dataTransfer,preventDefault(){}};
    grid.handlers.dragover(over);
    // A fast pointer move may arrive before the source is hidden on the first frame.
    frames.splice(0).forEach(fn=>fn());
    const preview=grid.children.find(el=>el.classList.contains('navigation-drag-preview'));
    assert.equal(grid.children[0],preview);
    insertions=0;
    for(let i=0;i<30;i++) grid.handlers.dragover(over);
    assert.equal(insertions,0,'unchanged insertion must not detach the preview and restart its CSS animation');
    assert.equal(grid.children[0],preview);
    grid.handlers.dragend();
    assert.deepEqual(grid.children.map(el=>el.value),['a','b','c']);
  });
}

test('navigation preferences validate IDs, retain missing entries and isolate emulator platforms', () => {
  let stored = JSON.stringify({'platforms':['st','st','../bad','spectrum'],
    'emulators:st':['steem','hatari'], 'emulators:zx':['fuse','eightyone'], 'invalid:scope':['bad']});
  const context = vm.createContext({localStorage:{getItem:()=>stored, setItem:(_,value)=>{stored=value;}},
    requestAnimationFrame:fn=>fn(), setTimeout, clearTimeout});
  vm.runInContext(source, context);
  const order = context.ArcadeNavigationOrder;
  assert.deepEqual(Array.from(order.ordered('platforms',['spectrum','st','gb'])), ['st','spectrum','gb']);
  assert.deepEqual(Array.from(order.ordered('emulators:st',['hatari'])), ['hatari']);
  assert.deepEqual(Array.from(order.ordered('emulators:zx',['eightyone','fuse'])), ['fuse','eightyone']);
  class Tile {
    constructor(id) { this.id=id; this.title=id; this.handlers={}; this.children=[]; }
    matches(){return true;}
    getAttribute(){return this.id;}
    querySelectorAll(){return [];}
    addEventListener(name,fn){this.handlers[name]=fn;}
    removeEventListener(name){delete this.handlers[name];}
    closest(){return this;}
    focus(){this.focused=true;}
    classList={contains:()=>false};
    get nextElementSibling(){return container.children[container.children.indexOf(this)+1] || null;}
  }
  const container = new Tile('container');
  container.append = tile => { container.children=container.children.filter(item=>item!==tile);container.children.push(tile); };
  container.insertBefore = (tile,before) => {
    container.children=container.children.filter(item=>item!==tile);
    container.children.splice(before ? container.children.indexOf(before) : container.children.length,0,tile);
  };
  const hatari=new Tile('hatari'), steem=new Tile('steem');
  container.children=[hatari,steem];
  order.attach(container,'emulators:st','data-emulator');
  assert.deepEqual(container.children.map(item=>item.id),['steem','hatari']);
  const key={target:hatari,altKey:true,key:'ArrowLeft',preventDefault(){}};
  container.handlers.keydown(key);
  assert.deepEqual(container.children.map(item=>item.id),['hatari','steem']);
  assert.equal(hatari.focused,true);
  // Hiding an emulator and reordering must not discard its saved position list.
  container.children=[hatari]; order.attach(container,'emulators:st','data-emulator');
  vm.runInContext(source, context);
  assert.deepEqual(Array.from(context.ArcadeNavigationOrder.ordered('emulators:st',['steem','hatari'])),['hatari','steem']);
  assert.deepEqual(JSON.parse(stored)['emulators:zx'],['fuse','eightyone']);
});
