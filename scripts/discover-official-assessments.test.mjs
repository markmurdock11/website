import test from 'node:test';
import assert from 'node:assert/strict';
import {discoverOfficialAssessments} from './discover-official-assessments.mjs';

const now=Date.parse('2026-11-18T22:00:00Z');
const url='https://www.cbsnews.com/news/network-outage-assessment/';
const words='Homeland Security Secretary Jane Carter said the outages were not a cyberattack.';
function article({body=words,published='2026-11-18T20:00:00Z',modified='',jsonPublished='',title='Officials assess recent outages',live=false}={}) {
  return '<html>'+(published?'<meta property="article:published_time" content="'+published+'">':'')+
    (modified?'<meta property="article:modified_time" content="'+modified+'">':'')+
    (jsonPublished||modified||live?'<script type="application/ld+json">'+JSON.stringify({'@type':live?'LiveBlogPosting':'NewsArticle',
      ...(jsonPublished?{datePublished:jsonPublished}:{}),...(modified?{dateModified:modified}:{})})+'</script>':'')+
    '<article><h1>'+title+'</h1><p>'+body+'</p></article></html>';
}
async function run({html=article(),urls=[url],existing=[],key='fixture-only',state={},fetchStatus=200}={}) {
  const calls=[];
  const result=await discoverOfficialAssessments({now,start:'2026-11-09',webKey:key,state,assessments:existing,
    fetchString:async(target,options)=>{
      const body=JSON.parse(options.body);calls.push({target,body});
      assert.equal(options.redirect,'error');
      assert.equal(options.headers.Authorization,'Bearer fixture-only');
      if(target.endsWith('/search'))return new Response(JSON.stringify({results:urls.map(link=>({url:link,title:'Fresh reassurance',snippet:words,timestamp:'2026-11-18T21:59:59Z'}))}),{headers:{'content-type':'application/json'}});
      assert.equal(body.solveCaptcha,false);
      return new Response(html,{status:fetchStatus,headers:{'content-type':'text/html'}});
    }});
  assert(calls.length<=3,'bounded to one search and two source reads');
  return {...result,calls};
}

test('a dated attributed report produces a compatible timed assessment',async()=>{
  const result=await run();
  assert.equal(result.assessments.length,1);
  const record=result.assessments[0];
  assert.equal(record.kind,'official-assessment');
  assert.equal(record.verifiedOutageDenial,true);
  assert.equal(record.denial.when,'2026-11-18T20:00:00.000Z');
  assert.equal(record.denial.basis,'report');
  assert.equal(record.denial.type,'explicit');
  assert.equal(record.denial.speakerRole,'authority');
  assert.equal(record.sources[0].publishedAt,record.denial.when);
  assert(record.denial.quoteExcerpt.split(/\s+/).length<=12);
});

test('modification timestamps never advance publication time',async()=>{
  const {assessments}=await run({html:article({modified:'2026-11-18T21:59:00Z'})});
  assert.equal(assessments[0].denial.when,'2026-11-18T20:00:00.000Z');
});
test('dateModified alone cannot timestamp a reassurance',async()=>{
  assert.equal((await run({html:article({published:'',modified:'2026-11-18T21:59:00Z'})})).assessments.length,0);
});
test('day-only datePublished remains day-only',async()=>{
  const {assessments}=await run({html:article({published:'',jsonPublished:'2026-11-18'})});
  assert.equal(assessments[0].denial.when,'2026-11-18');
});
test('conflicting exact times on one day cannot manufacture an exact reset',async()=>{
  const {assessments}=await run({html:article({jsonPublished:'2026-11-18T21:00:00Z'})});
  assert.equal(assessments[0].denial.when,'2026-11-18');
});
test('government primary sources identify statement publication',async()=>{
  const {assessments}=await run({urls:['https://www.dhs.gov/news/outage-update'],html:article({body:'DHS said the network outages were not a cyberattack.'})});
  assert.equal(assessments.length,1);
  assert.equal(assessments[0].denial.basis,'statement');
});
test('qualified no-evidence assessment stays qualified',async()=>{
  const {assessments}=await run({html:article({body:'A senior administration official told reporters there was no evidence of a cyberattack behind the outages.'})});
  assert.equal(assessments.length,1);
  assert.equal(assessments[0].denial.type,'qualified');
});
test('known CNN Newsource syndication requires explicit source attribution',async()=>{
  const ktvz='https://ktvz.com/politics/cnn-us-politics/2026/11/18/hearing/';
  const body='By CNN Newsource\nHomeland Security Secretary Jane Carter said the outages were not a cyberattack.';
  assert.equal((await run({urls:[ktvz],html:article({body})})).assessments.length,1);
  assert.equal((await run({urls:[ktvz],html:article()})).assessments.length,0);
});
test('confidence about no nefarious activity is qualified',async()=>{
  const {assessments}=await run({html:article({body:'Homeland Security Secretary Jane Carter said of the outages, “We’re 98% confident that there is no nefarious activity going on.”'})});
  assert.equal(assessments.length,1);
  assert.equal(assessments[0].denial.type,'qualified');
});

for(const [name,options] of [
  ['unqualified private opinion',{html:article({body:'Analyst Jane Carter said the outages were not a cyberattack.'})}],
  ['former official opinion',{html:article({body:'Former Homeland Security Secretary Jane Carter said the outages were not a cyberattack.'})}],
  ['unrelated attack in the next sentence',{html:article({body:'Homeland Security Secretary Jane Carter said the outages were being investigated. The bomb scare was not a cyberattack.'})}],
  ['cannot rule out an attack',{html:article({body:'Homeland Security Secretary Jane Carter said officials cannot rule out a cyberattack behind the outages.'})}],
  ['double-negative absence of evidence',{html:article({body:'Homeland Security Secretary Jane Carter said there was no evidence that the outages were not a cyberattack.'})}],
  ['denied confidence',{html:article({body:'Homeland Security Secretary Jane Carter said she was not confident the outages were not a cyberattack.'})}],
  ['not-only attack attribution',{html:article({body:'Homeland Security Secretary Jane Carter said the outages were not only caused by a cyberattack but also a hardware fault.'})}],
  ['no evidence about a different cause',{html:article({body:'Homeland Security Secretary Jane Carter said there was no evidence of hardware faults, but the outages were caused by a cyberattack.'})}],
  ['snippet without underlying evidence',{html:article({body:'Officials attended a hearing today.'})}],
  ['liveblog page timestamp',{html:article({live:true})}],
  ['stale publication',{html:article({published:'2026-10-18T20:00:00Z'})}],
  ['future publication',{html:article({published:'2026-11-19T20:00:00Z'})}],
  ['non-allowlisted source',{urls:['https://unverified-paper.org/news/assessment']}],
  ['private address',{urls:['https://127.0.0.1/reassurance']}]
])test('rejects '+name,async()=>assert.equal((await run(options)).assessments.length,0));

test('renewed publication of a known claim is deduplicated by source and speaker',async()=>{
  const first=await run();
  const existing=structuredClone(first.assessments);
  existing[0].denial.speaker='Jane Carter, Homeland Security Secretary';
  const second=await run({existing,html:article({published:'2026-11-18T21:00:00Z'})});
  assert.equal(second.assessments.length,0);
  assert.equal((await run()).assessments[0].id,first.assessments[0].id);
});
test('one search and two underlying reads is a strict upper bound',async()=>{
  const {calls,assessments}=await run({urls:[1,2,3,4,5].map(i=>url+i)});
  assert.equal(calls.length,3);
  assert.equal(assessments.length,2);
});
test('missing authentication never uses public allowance',async()=>{
  const {calls,diagnostics}=await run({key:''});
  assert.equal(calls.length,0);
  assert.equal(diagnostics.status,'requires_key');
});
test('already checked hour makes no calls',async()=>{
  const {calls,diagnostics}=await run({state:{checkedHour:Math.floor(now/3600000)}});
  assert.equal(calls.length,0);
  assert.equal(diagnostics.status,'not_due');
});
test('access denial stops the candidate without a bypass retry',async()=>{
  const {calls,diagnostics,assessments}=await run({fetchStatus:403});
  assert.equal(calls.length,2);
  assert.equal(assessments.length,0);
  assert.equal(diagnostics.status,'partial');
});
test('shared quota failure stops the invocation',async()=>{
  let calls=0;
  const {diagnostics}=await discoverOfficialAssessments({now,webKey:'fixture-only',fetchString:async()=>{calls++;return new Response('limited',{status:429});}});
  assert.equal(calls,1);
  assert.equal(diagnostics.status,'budget');
});
test('no implicit unbudgeted network transport exists',async()=>{
  await assert.rejects(discoverOfficialAssessments({now,webKey:'fixture-only'}),/shared authenticated String transport/);
});
