const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../source/bookmark-tools.js'), 'utf8');
test('normal links honour current-tab while explicit and modified opens retain their targets and activity', () => {
  const visits = [], opens = [], navigation = [];
  const c = vm.createContext({CyruneSettings:{get:() => ({values:{behaviour:{externalLinks:'current-tab'}}})},
    recordBookmarkOpen:item => visits.push(item.id), window:{open:(...args) => opens.push(args),location:{assign:url => navigation.push(url)}}});
  for (const name of ['openHubBookmark','handleHubBookmarkClick']) {
    const start = source.indexOf(`function ${name}(`);
    vm.runInContext(source.slice(start, source.indexOf('\n}',start) + 2),c);
  }
  const item = {id:'link',url:'https://example.com'};
  c.openHubBookmark(item);
  c.openHubBookmark(item,'_blank');
  let prevented = 0;
  c.handleHubBookmarkClick({preventDefault(){prevented++;}},item);
  c.handleHubBookmarkClick({ctrlKey:true,preventDefault(){prevented++;}},item);
  assert.equal(navigation.length,2);
  assert.equal(opens.length,1);
  assert.equal(opens[0][1],'_blank');
  assert.equal(prevented,1);
  assert.equal(visits.length,4);
});
