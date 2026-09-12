// Native maintenance helper: transform stdin with Portal's real migration code.
// The caller owns backups, locking and atomic publication; stdout is data only.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const context = vm.createContext({
  structuredClone, crypto:webcrypto, setTimeout, clearTimeout,
  console:{warn(){}, log(){}}, window:{innerWidth:1600, dispatchEvent(){}},
  localStorage:{getItem(){return null;}, setItem(){}, removeItem(){}}
});
for (const name of ['themes.js', 'state-schema.js', 'state.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../Portal/source', name), 'utf8'), context, {filename:name});
}
context.input = fs.readFileSync(0, 'utf8');
const result = vm.runInContext('JSON.stringify(parseStateJson(input, {throwOnError:true}))', context);
process.stdout.write(result);
