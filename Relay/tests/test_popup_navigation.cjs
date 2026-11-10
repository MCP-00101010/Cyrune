const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function fixture(mode) {
  const panes = ['send','focus','browser','timers','timers','activity','blocking'].map(id => ({dataset:{relayPane:id},hidden:false}));
  const buttons = [], content = {scrollTop:100};
  let focused;
  const navigation = {appendChild: button => buttons.push(button)};
  const context = vm.createContext({document:{
    getElementById: id => id === 'relayNavigation' ? navigation : null,
    querySelectorAll: () => panes, querySelector: () => content,
    createElement: () => ({dataset:{},attributes:{},listeners:{},
      setAttribute(key,value){this.attributes[key]=value;}, removeAttribute(key){delete this.attributes[key];},
      addEventListener(name,callback){this.listeners[name]=callback;}, focus(){focused=this.dataset.relayCategory;}})
  }});
  const source = fs.readFileSync(path.join(__dirname,'../popup/popup.js'),'utf8');
  vm.runInContext(source.slice(0,source.indexOf('async function main()')),context);
  context.setupRelayPopupNavigation(mode);
  return {panes,buttons,content,focused:()=>focused};
}

test('popup categories expose only their existing controls and never cross popup roles', () => {
  for (const mode of ['send','refresh']) {
    const f=fixture(mode), ids=mode==='refresh'?['timers','activity','blocking']:['send','focus','browser'];
    assert.deepEqual(f.buttons.map(button=>button.dataset.relayCategory),ids);
    f.buttons[1].listeners.click();
    assert.ok(f.panes.every(pane=>pane.hidden === (pane.dataset.relayPane!==ids[1])));
    assert.equal(f.buttons[1].attributes['aria-current'],'page');
    assert.equal(f.buttons[0].attributes['aria-current'],undefined);
    assert.equal(f.content.scrollTop,0);
  }
});

test('popup category keyboard navigation wraps, supports endpoints and leaves Tab unchanged', () => {
  const f=fixture('refresh');
  function key(index,key){let prevented=false;f.buttons[index].listeners.keydown({key,preventDefault(){prevented=true;}});return prevented;}
  assert.equal(key(0,'ArrowUp'),true);assert.equal(f.focused(),'blocking');
  key(2,'ArrowRight');assert.equal(f.focused(),'timers');
  key(0,'End');assert.equal(f.focused(),'blocking');
  key(2,'Home');assert.equal(f.focused(),'timers');
  assert.equal(key(0,'Tab'),false);
});
