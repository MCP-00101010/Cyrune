const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.join(__dirname, '..');

test('one navigation platform, distinct search systems and compatible launch choices', () => {
  const context = vm.createContext({state:{emulators:[
    {id:'sameboy',type:'generic',available:true,supported_extensions:['.gb','.gbc']},
    {id:'vbam',type:'generic',available:true,supported_extensions:['.gb','.gbc','.gba']},
    {id:'spectrum',type:'eightyone',available:true,supported_extensions:[]},
    {id:'default',type:'default',available:true,supported_extensions:[]},
  ]}});
  vm.runInContext(fs.readFileSync(path.join(root,'web/platforms.js'),'utf8'),context);
  const platforms = context.ArcadePlatforms;
  assert.equal(platforms.collection({adapter:'gameboy-cartridges-v1'}),'game-boy');
  assert.equal(Object.keys(platforms.libraries).filter(key => key.startsWith('game-boy')).length,1);
  const source = fs.readFileSync(path.join(root,'web/app.js'),'utf8');
  vm.runInContext(source.slice(source.indexOf('function compatibleGameEmulators('),source.indexOf('async function showContextMenu(')),context);
  for (const [system,extension,label] of [['GB','.gb','Game Boy'],['GBC','.gbc','Game Boy Color'],['GBA','.gba','Game Boy Advance']]) {
    const game = {type:'Game Boy',system,extension};
    assert.equal(platforms.searchLabel(game),label);
    assert.deepEqual(Array.from(context.compatibleGameEmulators(game), e=>e.id),system==='GBA'?['vbam']:['sameboy','vbam']);
  }
});
