import assert from 'node:assert/strict';
import test from 'node:test';
import {discoverIndustryOutages, WATCHLIST} from './discover-industry-outages.mjs';

const now=Date.parse('2026-11-18T22:00:00Z'), hour=Math.floor(now/3600000);
const url='https://localdaily.org/news/water-alert';
const title='Lakeshore Water Authority issues boil-water advisory';
const body='Lakeshore Water Authority has issued a boil-water advisory today after a water main break.';

// All requests terminate in this fixture transport. Search is only a lead;
// event identity, date and evidence must come from the fetched article.
async function discoverArticle({headline=title,articleBody=body,published='2026-11-18T20:00:00Z',searchHeadline=headline}={}) {
  const calls=[];
  const result=await discoverIndustryOutages({now,start:'2026-11-09',
    state:{searchHour:hour,operatorHour:hour,operatorDiscoveryHour:hour},
    fetchImpl:async(target,options)=>{
      const request=JSON.parse(options.body);calls.push({target,request});
      if(target.endsWith('/search'))return new Response(JSON.stringify({results:[{url,title:searchHeadline,source:'Local Daily'}]}),
        {headers:{'content-type':'application/json'}});
      assert.equal(request.url,url);
      assert.equal(request.solveCaptcha,false);
      return new Response('<html>'+(published?'<meta property="article:published_time" content="'+published+'">':'')+
        '<article><h1>'+headline+'</h1><p>'+articleBody+'</p></article></html>',{headers:{'content-type':'text/html'}});
    }});
  assert(calls.length<=2,'one search and at most one underlying article');
  assert(calls.every(call=>!call.target.includes('integrations')),'no anonymous X requests');
  assert.equal(result.diagnostics.channels.find(channel=>channel.channel==='utilityDiscovery').sector,'Water');
  return {...result,calls};
}

test('new water providers are discovered from the dated article',async()=>{
  const {leads}=await discoverArticle();
  assert.equal(leads.length,1);
  assert.equal(leads[0].row.org,'Lakeshore Water Authority');
  assert.equal(leads[0].row.date,'2026-11-18');
  assert.equal(leads[0].row.sector,'Water');
  assert.match(leads[0].page,/water main break/);
});

test('unknown utilities provider can report loss of water pressure',async()=>{
  const {leads}=await discoverArticle({headline:'Juniper Utilities issues boil-water notice',
    articleBody:'Juniper Utilities has issued a boil-water notice following loss of water pressure today.'});
  assert.equal(leads.length,1);
  assert.equal(leads[0].row.org,'Juniper Utilities');
});

test('a municipality directly issuing the notice is a water operator',async()=>{
  const {leads}=await discoverArticle({headline:'Boil-water advisory issued in Mocksville',
    articleBody:'The Town of Mocksville has issued a boil-water advisory today following loss of water pressure.'});
  assert.equal(leads.length,1);
  assert.equal(leads[0].row.org,'Town of Mocksville');
});

test('multiword municipality names and explicit event dates are preserved',async()=>{
  const {leads}=await discoverArticle({headline:'Water main break prompts boil-water advisory',
    articleBody:'The City of New Haven reported a water main break on November 18, 2026.'});
  assert.equal(leads.length,1);
  assert.equal(leads[0].row.org,'City of New Haven');
  assert.equal(leads[0].row.date,'2026-11-18');
});

test('known water operators still support ordinary interruption notices',async()=>{
  const {leads}=await discoverArticle({headline:'Spartanburg Water customers can expect widespread water service interruptions',
    articleBody:'Spartanburg Water warned of water service interruptions on November 18, 2026 after a power disturbance.'});
  assert.equal(leads.length,1);
  assert.equal(leads[0].row.org,'Spartanburg Water');
});

for(const [name,options] of [
  ['planned work',{headline:'Lakeshore Water Authority plans scheduled water outage',articleBody:'Lakeshore Water Authority plans scheduled water outage today.'}],
  ['routine preparation advice',{headline:'How to prepare for a boil-water advisory',articleBody:'Lakeshore Water Authority issues tips for a boil-water advisory today.'}],
  ['lifted-only notice',{headline:'Lakeshore Water Authority boil-water advisory lifted',articleBody:'Lakeshore Water Authority lifted its boil-water advisory today.'}],
  ['headline without body evidence',{articleBody:'Lakeshore Water Authority published customer service information.'}],
  ['multiple unknown utility actors',{headline:'Boil-water advisories issued after pressure loss',articleBody:'Lakeshore Water Authority has issued a boil-water advisory today. Juniper Utilities has issued a boil-water notice today.'}],
  ['multiple municipal actors',{headline:'Boil-water advisory issued after pressure loss',articleBody:'Town of Mocksville has issued a boil-water advisory today with help from City of New Haven.'}],
  ['public official instead of municipal actor',{headline:'Boil-water advisory issued in Mocksville',articleBody:'Town of Mocksville Mayor John Smith has issued a boil-water advisory today.'}],
  ['unrelated municipal mention',{headline:'Boil-water advisory issued after pressure loss',articleBody:'Town of Mocksville has a council meeting today. Residents have a boil-water advisory today.'}],
  ['stale source behind a current search result',{published:'2026-10-18T20:00:00Z'}],
  ['undated underlying source',{published:''}],
  ['future-dated underlying source',{published:'2026-11-19T20:00:00Z'}],
  ['body without an event-date anchor',{articleBody:'Lakeshore Water Authority issued a boil-water advisory after a break.'}],
  ['search claim contradicted by fetched title',{headline:'Customer service hours',searchHeadline:title,articleBody:body}]
])test('rejects '+name,async()=>assert.equal((await discoverArticle(options)).leads.length,0));

test('public channels honor 4/6/8/12-hour pacing without making requests early',async()=>{
  let calls=0;
  await discoverIndustryOutages({now,start:'2026-11-09',
    state:{searchHour:hour-3,utilityDiscoveryHour:hour-5,operatorHour:hour-7,operatorDiscoveryHour:hour-11},
    fetchImpl:async()=>{calls++;throw Error('not due');}});
  assert.equal(calls,0);
  assert.equal(WATCHLIST.findIndex(lane=>lane.sector==='Water'),12,'existing lane indices are stable');
});

test('authenticated utility search retains article allowance and shared story cap',async()=>{
  const calls=[];
  const result=await discoverIndustryOutages({now,start:'2026-11-09',webKey:'fixture-only',
    state:{operatorHour:hour,operatorDiscoveryHour:hour,xHour:hour},
    fetchImpl:async(target,options)=>{
      const request=JSON.parse(options.body);calls.push({target,request});
      if(target.endsWith('/search')){
        const water=request.query.includes('boil water');
        return new Response(JSON.stringify({results:[1,2].map(i=>({url:'https://localdaily.org/'+(water?'water':'tech')+i,
          title:water?title:'GitHub outage today',source:'Local Daily'}))}),{headers:{'content-type':'application/json'}});
      }
      const water=request.url.includes('water');
      return new Response('<meta property="article:published_time" content="2026-11-18T20:00:00Z"><article><h1>'+
        (water?title:'GitHub outage today')+'</h1><p>'+(water?body:'GitHub is experiencing an outage today.')+'</p></article>',
        {headers:{'content-type':'text/html'}});
    }});
  assert(calls[0].request.query.includes('NTT Docomo'),'main search retains its org filter');
  assert(result.leads.some(lead=>lead.row.org==='Lakeshore Water Authority'));
  assert.equal(calls.filter(call=>call.request.url?.includes('water')).length,1);
  assert(calls.filter(call=>call.target.endsWith('/fetch')).length<=4);
});
