
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import vm from 'node:vm';
import {stringTransport,monitorHealth,supplement} from './hourly-outage-monitor.mjs';
import {publish} from './publish-cyber-situation.mjs';

test('public quota remains enforced and rollover does not reuse yesterday credits',async()=>{
 const now=Date.parse('2026-11-18T22:00:00Z');
 let calls=0;const t=stringTransport({now,previous:{mode:'public',window:Math.floor(now/86400000),requests:42,credits:90},fetchImpl:async()=>{calls++;}});
 await assert.rejects(()=>t.fetchString('https://request.usestring.ai/v1/search',{body:'{}'}),{code:'BUDGET'});
 assert.equal(calls,0);
 const fresh=stringTransport({now:now+86400000,previous:t.state,fetchImpl:async()=>new Response('{}')});
 await fresh.fetchString('https://request.usestring.ai/v1/fetch',{body:'{}'});
 assert.equal(fresh.state.credits,1);
 const snapshot={webAccessUsage:t.state,sync:{channels:{watchlists:{lastAttemptAt:'2026-11-18T21:25:00Z',lastSuccessAt:'2026-11-18T20:01:00Z'}}}};
 const h=monitorHealth(snapshot,now,false);
 assert.equal(h.status,'paused');assert.equal(h.lastAttemptAt,'2026-11-18T21:25:00Z');
 assert.equal(h.webAccessKeyConfigured,false);
 assert.equal(monitorHealth(snapshot,now+86400000,false).status,'limited');
});

test('half-hour workflow does not double the public followup allowance',async()=>{
 const now=Date.parse('2026-11-18T22:17:00Z');assert.equal(Math.floor(now/3600000)%3,1);
 const snapshot={start:'2026-11-09',records:[],sync:{channels:{}}};let checks=0;
 const opts={snapshot,now,transport:{fetchString:async()=>{throw Error('unexpected request');}},runDiscovery:async()=>({leads:[],state:{},diagnostics:{channels:[]}}),
  runFollowups:async o=>{checks++;assert.equal(o.search,undefined);return {state:{},stats:{checked:1},updates:[]};},accept:()=>false,verify:()=>{},readPage:()=>''};
 await supplement(opts);await supplement({...opts,now:now+30*60000});assert.equal(checks,1);
});

test('publisher accepts verified water events as context without creating a cyber denial',async()=>{
 const temp=await mkdtemp(join(tmpdir(),'water-publish-'));
 try{
  const sourceHtml=await readFile(new URL('../not-a-cyber-attack/index.html',import.meta.url),'utf8');
  const input=join(temp,'index.html'),output=join(temp,'feed.json');await writeFile(input,sourceHtml);
  const seed=JSON.parse(sourceHtml.match(/<script id="snapshot" type="application\/json">([\s\S]*?)<\/script>/)[1]);
  const now=Math.max(Date.parse('2026-11-18T22:00:00Z'),Date.parse(seed.asOf))+3600000,url='https://cedarwater.org/notices/boil-water-2026-11-18';
  const row={org:'Cedar Water',title:'Cedar Water issues boil-water advisory',date:'2026-11-18',sector:'Water',incident_id:'water-fixture',source_name:'Cedar Water',source_kind:'Operator statement',source_date:'2026-11-18',source_url:url,summary:'Cedar Water has issued a boil-water advisory after a water-main break.'};
  const result=await publish({html:input,output,feedName:'news.cyber_evidence_wire',scheduled:true,webKey:'fixture-key',now,
   fetchImpl:async()=>{throw Error('No external requests in this fixture');},
   modules:{assessments:{discoverOfficialAssessments:async()=>({assessments:[],state:{},diagnostics:{status:'checked'}})},discovery:{ownsWatchlistSource:()=>true,discoverIndustryOutages:async()=>({leads:[{row,page:'<article>Cedar Water has issued a boil-water advisory after a water-main break on November 18, 2026.</article>'}],state:{},diagnostics:{channels:[{status:'ok',channel:'utilityDiscovery',accepted:1}]}})},
   followup:{runFollowups:async()=>({state:{},stats:{checked:0},updates:[]})}}});
  const data=JSON.parse(await readFile(output,'utf8')),record=data.records.find(r=>r.id==='water-fixture');
  assert.ok(record);assert.equal(record.sector,'Water');assert.equal(record.tier,'unresolved');assert.equal(record.denial,undefined);
  assert.equal(result.automation.webAccessKeyConfigured,true);
  assert.equal(data.records.filter(r=>r.id==='mocksville-water-1118').length,1);
 }finally{await rm(temp,{recursive:true,force:true});}
});

test('reviewed water records remain in the feed and browser scripts compile',async()=>{
 const html=await readFile(new URL('../not-a-cyber-attack/index.html',import.meta.url),'utf8');
 const data=JSON.parse(await readFile(new URL('../not-a-cyber-attack/situation-feed.json',import.meta.url),'utf8'));
 const embedded=JSON.parse(html.match(/<script id="snapshot" type="application\/json">([\s\S]*?)<\/script>/)[1]);
 for(const record of embedded.records)assert.ok(data.records.some(r=>r.id===record.id));
 assert.ok(embedded.records.some(r=>r.id==='mocksville-water-1118'));
 assert.ok(embedded.records.some(r=>r.id==='spartanburg-water-1118'));
 for(const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)){
  if(!/application\/json/.test(m[1]) && m[2].trim()) new vm.Script(m[2]);
 }
 assert.ok(html.includes("sections('Update status',monitorHealthContent())"));
 assert.ok(data.records.filter(r=>r.sector==='Water').every(r=>!r.denial && r.tier==='unresolved'));
});

test('reassurance clock selects a newer report but excludes observation timestamps',async()=>{
 const html=await readFile(new URL('../not-a-cyber-attack/index.html',import.meta.url),'utf8');
 const code=[...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].find(m=>m[2].includes('window.DeskMetrics ='))[2];
 const sandbox={window:{},Intl,URL};vm.runInNewContext(code,sandbox);
 const make=(id,when,timeBasis)=>({id,kind:'official-assessment',org:'Public authority',title:'Outage reassurance',date:when,verifiedOutageDenial:true,
  sources:[{name:'News source',url:'https://www.cnn.com/'+id,date:when}],
  denial:{type:'qualified',when,basis:'report',speaker:'Public authority',speakerRole:'authority',paraphrase:'No evidence of a cyberattack was identified.',sourceName:'News source',sourceUrl:'https://www.cnn.com/'+id,...(timeBasis?{timeBasis}:{})}});
 const old=make('old','2026-11-18T17:25:00Z'),later=make('later','2026-11-18T19:38:26Z'),untimed=make('untimed','2026-11-18'),observed=make('observed','2026-11-18T22:00:00Z','observed');
 const now=Date.parse('2026-11-18T22:10:00Z'),clock=sandbox.window.DeskMetrics.clock([],now,now,[old,untimed,later,observed]);
 assert.equal(clock.when,'2026-11-18T19:38:26Z');assert.equal(clock.value,'02:31:34');
});


