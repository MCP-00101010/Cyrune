require('../web/platforms.js');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../web/app.js'), 'utf8');
function context() {
  const state = {activeCollection:{kind:'atari-compilations-v1', platform_id:'atari-st'},
    multiFilters:{compilation_group:['SuperGAU'],series:['SuperGAU Speak Disk']},
    excludedFilters:{compilation_condition:['Marked bad']},recentIds:new Set()};
  const ctx = vm.createContext({state,URL,ArcadePlatforms:globalThis.ArcadePlatforms,
    els:{search:{value:''},filterView:{value:'all'},filterPoks:{dataset:{}}},
    platformColumnAvailable:()=>false,gameLanguageCodes:()=>[],gameYear:()=>'',gameTags:g=>g.tags || []});
  for (const name of ['isCompilationCollection','collectionPlatform','canScrapeMetadata','filterSettings','selectedFilterValues',
    'activeFiltersSnapshot','intersects','matchesExcludedFilters','matchesActiveFilters','matchesQuery',
    'escapeHtml','compilationSourceLink','uniqueCompilationTitles','compilationContentName','compilationContentGroups','renderCompilationContents','countBy','buildSimpleOptions']) {
    const start = source.indexOf(`function ${name}(`);
    vm.runInContext(source.slice(start, source.indexOf('\n}', start)+2), ctx);
  }
  return ctx;
}
test('group and series combine; condition exclusion filters only the matching boot images', () => {
  const c = context(), filters = c.activeFiltersSnapshot();
  const game = {compilation_group:'SuperGAU',series:'SuperGAU Speak Disk',compilation_condition:'Unverified'};
  assert.equal(c.matchesActiveFilters(game,'',filters),true);
  assert.equal(c.matchesActiveFilters({...game,series:'SuperGAU User Disk'},'',filters),false);
  assert.equal(c.matchesActiveFilters({...game,compilation_condition:'Marked bad'},'',filters),false);
  assert.equal(c.matchesActiveFilters({...game,compilation_group:'Fuzion'},'compilation_group',filters),true);
  assert.equal(c.canScrapeMetadata(),false);
  const saved = c.filterSettings({multiFilters:c.state.multiFilters,excludedFilters:c.state.excludedFilters});
  assert.equal(saved.multiFilters.series[0],game.series);
});
test('compilation filters cannot hide ordinary Atari games after a collection switch', () => {
  const c = context();
  c.state.activeCollection={platform_id:'atari-st'};
  assert.equal(c.matchesActiveFilters({title:'Game'}),true);
  assert.equal(c.canScrapeMetadata(),true);
});
test('image conditions and part labels are searchable', () => {
  const c = context();
  assert.equal(c.matchesQuery({compilation_condition:'Corrupt menu'},'corrupt'),true);
  assert.equal(c.matchesQuery({compilation_part:'Part B'},'part b'),true);
});

test('catalogue titles are searchable while groups and series remain separate', () => {
  const c = context();
  const game = {title:'Menu 1',compilation_group:'Automation',series:'Automation Menu',compilation_titles:['Test Adventure']};
  assert.equal(c.matchesQuery(game,'test adventure'),true);
  assert.equal(c.buildSimpleOptions('compilation_group',[game])[0].label,'Automation');
  assert.equal(c.buildSimpleOptions('series',[game])[0].label,'Automation Menu');
});

test('catalogue contents use a card with safe titles and no source or instructional text', () => {
  const c = context();
  const html = c.renderCompilationContents({compilation_catalogue_status:'Menu label match',compilation_catalogue:{
    disk_id:'al:1',provider:'Atari Legend',url:'https://www.atarilegend.com/menusets/1',
    source_date:'2026-09-13',contents:[{title:'<script>bad</script>',url:'javascript:alert(1)',kind:'Utility'}]}});
  assert.match(html,/&lt;script&gt;/);
  assert.doesNotMatch(html,/href="javascript:|<script>/);
  assert.match(html,/<div class="scraped-meta"><div class="compilation-contents">/);
  assert.doesNotMatch(html,/Atari Legend|Menu label match|2026-09-13|Search includes|verified|after booting/);
  assert.match(c.compilationSourceLink('https://www.atarilegend.com/games/1','Game'),/target="_blank" rel="noopener noreferrer"/);
  assert.equal(c.compilationSourceLink('https://www.atarilegend.com.attacker.invalid/x','Source'),'Source');
  assert.match(c.renderCompilationContents({}),/No contents catalogued/);
});

test('disk file indexes remain distinct from catalogue identification and searchable', () => {
  const c = context();
  const game = {compilation_catalogue_status:'Disk file index', compilation_titles:['TOOLS/DISKTOOL.PRG'],
    compilation_catalogue:{disk_id:'files:abc',provider:'Disk directory',url:'',file_count:300,
      contents:[{title:'TOOLS/DISKTOOL.PRG',kind:'File',url:''}]}};
  const html = c.renderCompilationContents(game);
  assert.match(html,/>Disk files<\/h2>/);
  assert.match(html,/Showing 1 of 300 disk entries/);
  assert.doesNotMatch(html,/hash matches|Matched by menu|href=/);
  assert.equal(c.matchesQuery(game,'disktool'),true);
  assert.match(c.compilationSourceLink('https://www.atariuptodate.de/en/atari-pd-serie/floppyshop-utility?page=6','AtariUpToDate'),/href=/);
});

test('CD software titles lead the card, with file names collapsed and technical notes omitted', () => {
  const c = context();
  const html = c.renderCompilationContents({compilation_catalogue_status:'CD contents checked',compilation_catalogue:{
    disk_id:'sg:USER_001',provider:'SuperGAU Systems Archive-CD Volume 1',verification:'contents',source_date:'1997-04-20',
    contents:[{title:'NEOCHROME V0.6a & PICTURES',kind:'Software'}],file_index:['NEO.PRG'],notes:['Original <note>']}});
  assert.ok(html.indexOf('NEOCHROME') < html.indexOf('<details>'));
  assert.match(html,/<summary>Disk files \(1\)<\/summary>/);
  assert.doesNotMatch(html,/CD contents checked|SuperGAU Systems|1997-04-20|Original|file contents were checked/);
  assert.doesNotMatch(html,/href="file:|Matched by menu series/);
});

test('the Contents column appears beside Title on upgrade and only in compilations', () => {
  const c = context();
  c.COLUMN_DEFS = [{key:'title',visible:true,width:340},{key:'contents',visible:true,width:380},{key:'year',visible:true,width:72}];
  c.COLUMN_MAP = new Map(c.COLUMN_DEFS.map(v=>[v.key,v]));
  for (const name of ['columnSettings','platformColumnAvailable','sortValue']) {
    const start = source.indexOf(`function ${name}(`);
    vm.runInContext(source.slice(start,source.indexOf('\n}',start)+2),c);
  }
  const upgraded = c.columnSettings({columnOrder:['year','title']});
  assert.equal(upgraded.columnOrder.join(','),'year,title,contents');
  assert.equal(c.columnSettings({columnOrder:['contents','year','title']}).columnOrder.join(','),'contents,year,title');
  assert.equal(c.platformColumnAvailable('contents'),true);
  assert.equal(c.sortValue({compilation_titles:['Neochrome']},'contents'),'Neochrome');
  c.state.activeCollection = {platform_id:'atari-st'};
  assert.equal(c.platformColumnAvailable('contents'),false);
});


test('same-game disk contents combine types while retaining distinct targets and edition information', () => {
  const c = context();
  const items = [
    {title:'R-Type',kind:'Game',url:'https://www.atarilegend.com/games/242'},
    {title:'H.A.T.E',kind:'Game'},
    {title:'R-Type',kind:'Game',subtype:'doc',url:'https://www.atarilegend.com/games/242'},
    {title:'R-Type',kind:'Documentation'},
    {title:'R-Type',kind:'Game',subtype:'walkthrough'},
    {title:'H.A.T.E',kind:'Game',subtype:'doc'}
  ];
  const original = JSON.stringify(items);
  const html = c.renderCompilationContents({compilation_catalogue:{disk_id:'al:1',contents:items}});
  assert.equal((html.match(/<li>/g) || []).length,2);
  assert.match(html,/Game, Documentation, Walkthrough/);
  assert.match(html,/compilation-content-kinds/);
  assert.equal((html.match(/>R-Type<\/a>/g) || []).length,1);
  assert.equal(JSON.stringify(items),original);
  assert.equal(c.uniqueCompilationTitles(['R-Type','H.A.T.E','R-Type',' r-type ']).join(' · '),'R-Type · H.A.T.E');
  const editions = c.compilationContentGroups([
    {title:'Game',kind:'Game',url:'https://www.atarilegend.com/games/1',version:'v1',sequence:1},
    {title:'Game',kind:'Game',url:'https://www.atarilegend.com/games/2',version:'v2',requirements:'STE'}
  ]);
  assert.equal(editions.length,2);
  assert.equal(editions[0].title,'Game v1');
  assert.equal(editions[1].title,'Game v2');
  assert.match(editions[0].labels[0],/Game part 1/);
  assert.match(editions[1].labels[0],/STE/);
});

test('content versions appear once in the name and distinct versions keep their own types', () => {
  const c = context();
  const html = c.renderCompilationContents({compilation_catalogue:{contents:[
    {title:'Proflight',kind:'Game',version:'1.2'},
    {title:'Proflight',kind:'Game',subtype:'doc',version:'1.2'}
  ]}});
  assert.equal((html.match(/1\.2/g) || []).length,1);
  assert.match(html,/Proflight 1\.2/);
  assert.match(html,/Game, Documentation/);
  assert.equal(c.compilationContentName({title:'Tool v1.2',version:'1.2'}),'Tool v1.2');
  assert.equal(c.compilationContentName({title:'Tool (1.2)',version:'v1.2'}),'Tool (1.2)');
  assert.equal(c.compilationContentName({title:'Tool 11.2',version:'1.2'}),'Tool 11.2 1.2');
  const editions = c.compilationContentGroups([
    {title:'Tool',version:'1.2',kind:'Game'}, {title:'Tool',version:'1.3',kind:'Documentation'}
  ]);
  assert.equal(editions.length,2);
  assert.equal(editions[0].title,'Tool 1.2');
  assert.equal(editions[1].title,'Tool 1.3');
});
