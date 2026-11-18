import assert from 'node:assert/strict';
import {runFollowups} from './follow-up-outages.mjs';
const now=Date.parse('2026-11-18T22:00:00Z');
const seed=()=>({id:'water-1118',org:'Spartanburg Water',date:'2026-11-18T10:00:00Z',title:'Water service interruption',summary:'A main break disrupted service.',sector:'Water',impact:'multiservice',tier:'unresolved',verifiedOutageContext:true,sources:[{name:'Spartanburg Water',kind:'Operator statement',url:'https://www.spartanburgwater.org/news/incident-1118',date:'2026-11-18T10:00:00Z'}],history:[]});
async function run(page,{kind,record=seed(),state}={}) {
  if(kind)record.sources[0].kind=kind;
  const result=await runFollowups({records:[record],now,state,fetchPage:async()=>page,verify:async({source,record})=>({source,record:{...record,denial:undefined},sourceIdentity:{original:source.kind==='Operator statement'}})});
  return {record,result};
}
let v=await run('Spartanburg Water has issued a boil-water advisory for main-system customers.');
assert.equal(v.result.updates[0].status,'advisory-active');
assert.equal(v.record.tier,'unresolved');assert.equal(v.record.denial,undefined);assert.equal(v.record.changes,undefined);
assert.equal(v.record.history[0].timeBasis,'observed');assert.equal(v.record.history[0].date,'2026-11-18T22:00:00.000Z');
assert.equal(v.result.updates[0].sourceDate,undefined);
let repeat=await run('Spartanburg Water has issued a boil-water advisory for main-system customers.',{record:v.record});
assert.equal(repeat.result.updates.length,0);assert.equal(repeat.record.history.length,1);
v=await run('Spartanburg Water has lifted the boil-water advisory for main-system customers.');
assert.equal(v.result.updates[0].status,'advisory-lifted');
v=await run('Spartanburg Water has fully restored water service.');
assert.equal(v.result.updates[0].status,'service-restored');
for(const page of [
  'Spartanburg Water is repairing a main break. A notice lifting this boil-water advisory will be issued when testing is complete.',
  'Spartanburg Water has issued a boil-water advisory during scheduled maintenance.',
  'Spartanburg Water says Another Utility has issued a boil-water advisory.',
  'Spartanburg Water water-main break. Another Utility has fully restored water service.',
  'Spartanburg Water has not restored water service.',
  'Spartanburg Water has issued a boil-water advisory. Spartanburg Water has lifted the boil-water advisory.',
  '<nav>Spartanburg Water has lifted the boil-water advisory.</nav><article>Spartanburg Water crews are repairing a main break.</article>'
])assert.equal((await run(page)).result.updates.length,0,page);
assert.equal((await run('Spartanburg Water has fully restored water service.',{kind:'News'})).result.updates.length,0);
console.log('Operational followup fixtures passed (active, lifted, restored, observed timing, dedup, negatives, unchanged cyber tier).');
