// Scheduled checks of public notices. Search results are leads; publication requires the source itself.
import {createHash} from 'node:crypto';
const HOUR = 3600000, DAY = HOUR * 24;
const origin = 'https://request.usestring.ai/v1';

export const WATCHLIST = [
  {sector:'Aviation', org:'FAA', aliases:['Federal Aviation Administration'], board:'https://www.faa.gov/newsroom', account:'FAANews', locale:'en-US', peers:['United Airlines','Air Canada','NAV CANADA']},
  {sector:'Education', org:'Vanderbilt', aliases:['Vanderbilt University'], board:'https://news.vanderbilt.edu/', account:'VanderbiltU', locale:'de-DE', peers:['Universität Hamburg','Washington University','University of Toronto']},
  {sector:'Energy', org:'BC Hydro', board:'https://www.bchydro.com/news/press_centre/news_releases.html', account:'bchydro', locale:'fr-CA', peers:['Hydro-Québec','Hydro One','National Grid']},
  {sector:'Finance', org:'Federal Reserve', aliases:['Federal Reserve Financial Services','Fedwire'], board:'https://www.frbservices.org/service-status/', account:'FederalReserve', locale:'en-US', peers:['Charles Schwab','JPMorgan Chase','Westpac']},
  {sector:'Government', org:'USPS', aliases:['United States Postal Service','US Postal Service'], board:'https://about.usps.com/newsroom/service-alerts/', account:'USPS', locale:'de-DE', peers:['BundID','ELSTER','Lithuanian Customs']},
  {sector:'Healthcare', org:'NHS England', board:'https://uptime.england.nhs.uk/', account:'NHSEngland', locale:'nl-BE', peers:['UZ Brussel','UZ Leuven','Greiz-Ronneburg']},
  {sector:'Hospitality', org:'Marriott Bonvoy', aliases:['Marriott International','Marriott'], board:'https://marriott.pressarea.com/en/search', account:'MarriottIntl', locale:'es-ES', peers:['Meliá','Accor','Hilton']},
  {sector:'Retail', org:'Walmart', board:'https://corporate.walmart.com/news', account:'WalmartInc', locale:'ja-JP', peers:['GoQSystem','GoQSystem株式会社','イオン','楽天市場']},
  {sector:'Sport', org:'IIHF', aliases:['International Ice Hockey Federation'], board:'https://www.iihf.com/en/news', account:'IIHFHockey', locale:'fr-CA', peers:['LNH','NHL','Ligue nationale de hockey']},
  {sector:'Technology', org:'GitHub', board:'https://www.githubstatus.com/api/v2/incidents.json', statusPage:true, account:'githubstatus', locale:'en-US', peers:['Microsoft 365','OpenAI','Anthropic','Workday']},
  {sector:'Telecom', org:'NTT Docomo', aliases:['NTTドコモ','ドコモ','Docomo'], board:'https://www.docomo.ne.jp/info/network/', locale:'ja-JP', peers:['KDDI','SoftBank'], socialOrg:'T-Mobile', account:'TMobileNews'},
  {sector:'Transport', org:'Amtrak', board:'https://www.amtrak.com/service-alerts-and-notices', account:'AmtrakNECAlerts', locale:'it-IT', peers:['Trenitalia','Rete Ferroviaria Italiana','Deutsche Bahn']}
];
const searchTerms = {
  en:'outage OR "service disruption" OR "went offline" OR "ground stop"',
  de:'Ausfall OR Störung OR Systemausfall', fr:'panne OR interruption OR indisponible',
  es:'caída OR avería OR interrupción', it:'guasto OR interruzione OR disservizio',
  nl:'storing OR uitval OR onderbreking', ja:'通信障害 OR システム障害 OR 利用しづらい'
};
const outage = /\boutage|ground stop|interruption|disruption|degraded (?:service|performance)|elevated (?:errors?|error rates?)|(?:login|sign[- ]in) (?:errors?|failures?)|unavailable|inaccessible|offline|service (?:halt|suspension)|power (?:cut|failure)|flights? (?:grounded|cancelled)|störung|ausfall|\bpanne\b|interrupción|indisponible|avería|\bstoring\b|uitval|onderbreking|\bguasto\b|\bdisservizio\b|interruzione|障害|利用しづらい|ご利用できない/iu;
const nonEvent = /\bplanned (?:outage|interruption|maintenance)|scheduled maintenance|(?:test|testing|simulation) (?:of )?(?:an? )?(?:outage|disruption)|no (?:outages?|disruption)(?:\b|s)|(?:how to|what to do|prepare for|risk of|could (?:face|cause)) (?:an? )?(?:outage|disruption)|\bmaintenance window\b/i;
const isOutage = s => outage.test(s) && !nonEvent.test(s);
const fold = s => String(s??'').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const label = s => fold(s).replaceAll(' ','');
const normalizedHost = url => new URL(url).hostname.replace(/^www\./,'');
function urlOf(raw, base) {
  if (!raw) return '';
  try {
    const u = new URL(raw,base), host = u.hostname;
    if (u.protocol!=='https:' || u.username || u.password || u.port || !/^(?:[a-z0-9-]+\.)+[a-z]{2,}$/i.test(host) ||
        /(?:^|\.)(?:local|internal|localhost|onion|test|example|invalid|localdomain|home\.arpa|example\.com|example\.net|example\.org)$/.test(host)) return '';
    for(const name of [...u.searchParams.keys()]){
      if(/^(?:token|key|api_key|access_token|signature|x-amz-signature|x-goog-signature)$/i.test(name))return '';
      if(/^(?:utm_|fbclid$|gclid$)/i.test(name))u.searchParams.delete(name);
    }
    u.hash='';return u.href;
  } catch { return ''; }
}
export function ownsWatchlistSource(org,url) {
  const safe=urlOf(url); if(!safe)return false;
  const u=new URL(safe);
  return WATCHLIST.some(s => {
    if (/^(?:www\.)?(?:twitter|x)\.com$/i.test(u.hostname))
      return label(org)===label(s.socialOrg||s.org) && new RegExp('^/'+s.account+'/status/[0-9]+/?$','i').test(u.pathname);
    return label(org)===label(s.org) && normalizedHost(safe)===normalizedHost(s.board);
  });
}
function unescape(s='') {
  return s.replace(/&(#x[\da-f]+|#\d+|amp|quot|apos|lt|gt|nbsp|ndash|mdash|rsquo|ldquo|rdquo);/gi,(all,k)=>{
    if(k[0]==='#'){const n=k[1]?.toLowerCase()==='x'?parseInt(k.slice(2),16):Number(k.slice(1));return n>0&&n<=0x10ffff?String.fromCodePoint(n):' ';}
    return ({amp:'&',quot:'"',apos:"'",lt:'<',gt:'>',nbsp:' ',ndash:'–',mdash:'—',rsquo:'’',ldquo:'“',rdquo:'”'})[k.toLowerCase()]||all;
  });
}
function plain(s) {
  return unescape(String(s||'').replace(/<(script|style|nav|footer|aside)\b[^>]*>[\s\S]*?<\/\1>/gi,' ')
    .replace(/<\/(?:p|div|section|h[1-6]|li|time)>|<br\s*\/?>/gi,'\n').replace(/<[^>]+>/g,' '))
    .replace(/[\t \u00a0]+/g,' ').replace(/ *\n */g,'\n').replace(/\n{3,}/g,'\n\n').trim();
}
function attr(tag,name) {
  const m=tag.match(new RegExp('(?:^|\\s)'+name+'\\s*=\\s*(?:"([^"]*)"|\'([^\']*)\'|([^\\s>]+))','i'));
  return m?unescape(m[1]??m[2]??m[3]):'';
}
const iso = t => new Date(t).toISOString();
function dateValue(raw) {
  if(typeof raw!=='string')return '';
  const s=raw.trim(),jp=s.match(/^(20\d\d)年(\d{1,2})月(\d{1,2})日/);
  if(jp)return dateValue([jp[1],jp[2].padStart(2,'0'),jp[3].padStart(2,'0')].join('-'));
  if(/^20\d\d-\d\d-\d\d$/.test(s)) return Number.isFinite(Date.parse(s)) && iso(Date.parse(s)).slice(0,10)===s?s:'';
  if(/^20\d\d-\d\d-\d\d[T ][\d:.]+(?:Z|[+-]\d\d:?\d\d)$/i.test(s)&&Number.isFinite(Date.parse(s)))return iso(Date.parse(s));
  return '';
}
function pageInfo(raw) {
  const content=String(raw);
  let published='', title='', body='';
  for (const tag of content.match(/<meta\b[^>]+>/gi)||[]) {
    const property=(attr(tag,'property')||attr(tag,'name')).toLowerCase();
    if(property==='article:published_time')published=dateValue(attr(tag,'content'))||published;
    if(property==='og:title')title=attr(tag,'content')||title;
  }
  const articleNodes=[];
  for (const m of content.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try{const json=JSON.parse(m[1]);for(const node of (Array.isArray(json)?json:json['@graph']||[json]))
      if(node&&[].concat(node['@type']||[]).some(t=>/^(?:NewsArticle|Article|BlogPosting|ReportageNewsArticle|Report)$/i.test(t)))articleNodes.push(node);
    }catch{/* A page may contain several unrelated metadata blocks. */}
  }
  if(articleNodes.length===1){
    const node=articleNodes[0]; published ||= dateValue(node.datePublished); title ||= node.headline;
    if(typeof node.articleBody==='string')body=plain(node.articleBody);
  }
  title=plain(String(title||content.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1]||'')).slice(0,300);
  const article=content.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i)?.[1]||content.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1];
  body ||= plain(article||content.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1]||content);
  if(!published){
    const t=(article||'').match(/<time\b[^>]*datetime=[^>]+>/gi)||[];
    if(t.length===1)published=dateValue(attr(t[0],'datetime'));
  }
  if(!published && title && isOutage(title) && /[ぁ-んァ-ン]/.test(title)){
    const index=body.indexOf(title), byline=index<0?'':body.slice(index+title.length,index+title.length+120).trim();
    published=dateValue(byline);
  }
  return {title,body:body.slice(0,80000),published};
}
function reportDay(sentence,pub) {
  const date=sentence.match(/\b20\d\d-\d\d-\d\d\b|20\d\d年\d{1,2}月\d{1,2}日/);
  if(date)return dateValue(date[0]);
  const full=sentence.match(/\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+\d{1,2}(?:,?\s+20\d\d)?\b/i);
  if(full){const at=Date.parse(full[0]+(/20\d\d/.test(full[0])?'':' '+pub.slice(0,4))+' UTC');if(Number.isFinite(at))return iso(at).slice(0,10);}
  const jp=sentence.match(/(\d{1,2})月(\d{1,2})日/);
  if(jp)return dateValue(pub.slice(0,4)+'-'+jp[1].padStart(2,'0')+'-'+jp[2].padStart(2,'0'));
  if(/\b(?:today|currently|ongoing|this (?:morning|evening|afternoon)|(?:is|are|we.re) (?:experiencing|investigating|unavailable|down|offline)|remains? (?:offline|unavailable)|à l.heure actuelle|actuellement|derzeit|aktuell|momenteel|attualmente|actualmente)\b|現在/.test(sentence.toLowerCase()))return pub.slice(0,10);
  return '';
}
function orgHit(text,lane) {
  const entries=[[lane.org,...lane.aliases||[]],...lane.peers.map(p=>[p])],hay=' '+fold(text)+' ';
  const matches=entries.filter(names=>names.some(n=>/[\u3040-\u30ff\u3400-\u9fff]/.test(n)?hay.includes(fold(n)):hay.includes(' '+fold(n)+' ')));
  return matches.length===1?matches[0][0]:'';
}
function makeLead({org,lane,title,evidence,detail,date,published,url,name,kind,id},ctx) {
  if(!dateValue(date)||!dateValue(published)||!urlOf(url)||!isOutage(detail)||!title||!org)return;
  if(Date.parse(date)<ctx.start||Date.parse(published)<ctx.recent||Date.parse(published)>ctx.now||
      date.slice(0,10)>published.slice(0,10))return;
  const same=ctx.records.filter(r=>r.org===org && r.sources?.some(s=>s.url===url));
  if(same.length>1)return;
  const sourceNote=String(detail).trim().slice(0,1000);
  const row={org,sector:lane.sector,title:title.slice(0,300),summary:sourceNote,impact_note:sourceNote,
    date,source_date:published,source_url:url,source_name:name,source_kind:kind};
  // Distinct notices on the same day stay distinct unless an operator supplies a stable incident URL/ID.
  row.incident_id=same[0]?.id||id||'watch-'+createHash('sha256').update(org+'|'+url).digest('hex').slice(0,20);
  return {row,page:evidence};
}
function statusRows(data,lane,ctx) {
  const incidents=data?.incidents;if(!Array.isArray(incidents))throw Error('Invalid status board response');
  const rows=[];
  for(const item of incidents.slice(0,40)){
    const date=dateValue(item.started_at||item.created_at);
    if(!date||!/^\w{6,32}$/.test(item.id||'')||typeof item.name!=='string')continue;
    const url=new URL('/incidents/'+item.id,lane.board).href;
    const updates=(item.incident_updates||[]).filter(u=>typeof u.body==='string' && dateValue(u.display_at||u.created_at))
      .sort((a,b)=>Date.parse(b.display_at||b.created_at)-Date.parse(a.display_at||a.created_at));
    for(const update of updates){
      const detail=plain(update.body);
      const lead=makeLead({org:lane.org,lane,title:item.name,evidence:item.name+'. '+detail,detail:isOutage(detail)?detail:item.name,
        date,published:dateValue(update.display_at||update.created_at),url,name:lane.org+' Status',kind:'Operator status'},ctx);
      if(lead){rows.push(lead);break;}
    }
  }
  return rows;
}
async function readBounded(response,limit=4_000_000) {
  let size=0;const chunks=[];
  for await(const chunk of response.body){size+=chunk.length;if(size>limit)throw Error('Oversized String response');chunks.push(chunk);}
  return Buffer.concat(chunks).toString('utf8');
}
function errStatus(e) {return e.code==='BUDGET'||e.status===429?'budget':'unavailable';}
async function request(path,body,ctx) {
  const headers={'Content-Type':'application/json'};
  if(ctx.webKey)headers.Authorization='Bearer '+ctx.webKey;
  const res=await ctx.fetchImpl(origin+path,{method:'POST',headers,body:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(22000)});
  if(!res.ok)throw Object.assign(Error('String request failed'),{status:res.status});
  if(path==='/fetch'){
    const served=res.headers.get('x-final-url'),destination=Number(res.headers.get('x-status-code'));
    if((served&&(!urlOf(served)||normalizedHost(served)!==normalizedHost(body.url))) ||
       (destination&&(destination<200||destination>=300)))throw Error('Source unavailable');
  }
  const text=await readBounded(res),type=res.headers.get('content-type')||'';
  return /application\/(?:[^;]+\+)?json/.test(type)?JSON.parse(text):text;
}
async function fetchPage(url,ctx) {
  const result=await request('/fetch',{url,format:'raw'},ctx);
  if(result && typeof result==='object' && 'statusCode' in result){
    if(result.statusCode<200||result.statusCode>=300)throw Error('Source unavailable');
    if(result.finalUrl && normalizedHost(result.finalUrl)!==normalizedHost(url))throw Error('Source changed publisher');
    return result.data;
  }
  return result;
}
async function readStory(candidate,lane,ctx) {
  const {url,source,owner}=candidate;
  const info=pageInfo(await fetchPage(url,ctx));
  if(!info.title || !info.published || Date.parse(info.published)<ctx.recent)return;
  const org=orgHit(info.title,lane)|| (owner?lane.org:'');
  if(!org||(!owner&&!isOutage(info.title)))return;
  const lines=info.body.split(/\n+|(?<=[.!?。])\s+/).map(l=>l.trim()).filter(l=>l.length>12&&l.length<=1250);
  for(const line of [info.title,...lines]){
    if(!isOutage(line))continue;
    const actor=orgHit(line,lane);
    const selfReport=owner && !actor && (/\b(?:we(?:['’]re| are| have)|our (?:systems?|customers?|services?|users?))\b|当社|弊社/i.test(line) ||
      (new URL(url).hostname==='www.docomo.ne.jp' && new URL(url).pathname.startsWith('/info/network/')));
    if(actor!==org && !selfReport)continue;
    const date=reportDay(line,info.published);
    if(!date)continue;
    const lead=makeLead({org,lane,title:info.title,evidence:info.title+'. '+info.body,detail:line,date,published:info.published,
      url,name:owner?lane.org:source||normalizedHost(url),kind:owner?'Official bulletin':'News report'},ctx);
    if(lead)return lead;
  }
}
function boardLinks(html,lane) {
  const out=new Set();
  for(const m of String(html).matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)){
    const title=plain(m[2]),url=urlOf(attr(m[1],'href'),lane.board);
    if(!isOutage(title)||title.length<8||!url||normalizedHost(url)!==normalizedHost(lane.board)||url===lane.board)continue;
    if(/\.(?:pdf|png|svg|jpg|gif|webp|zip)$/i.test(new URL(url).pathname))continue;
    out.add(url);
  }
  return [...out].map(url=>({url,owner:true}));
}
function searchCandidates(results,lane) {
  if(!Array.isArray(results?.results))throw Error('Invalid search results');
  return results.results.flatMap(hit=>{
    const url=urlOf(hit.url);
    if(!url||!isOutage(String(hit.title))||!orgHit(hit.title,lane)||/(?:^|\.)(?:youtube\.com|youtu\.be|facebook\.com|x\.com|twitter\.com|news\.google\.com)$/.test(normalizedHost(url)))return [];
    return [{url,owner:normalizedHost(url)===normalizedHost(lane.board),source:hit.source}];
  });
}
function socialRows(result,lane,ctx) {
  const items=Array.isArray(result)?result:result?.data;
  if(!Array.isArray(items))throw Error('Invalid X timeline');
  const org=lane.socialOrg||lane.org,rows=[];
  for(const p of items.slice(0,100)){
    if(p.repost||p.authorHandle?.toLowerCase()!==lane.account.toLowerCase()||!ownsWatchlistSource(org,p.url)||
      typeof p.text!=='string'||!isOutage(p.text)||p.text.length>1300)continue;
    // Organization accounts frequently discuss third parties. Require self-attribution of this disruption.
    if(!/\b(?:we(?:'re| are| have|.re)|our|nous|notre|wir|unser)\b|当社|弊社/i.test(p.text) &&
      !(' '+fold(p.text)+' ').includes(' '+fold(org)+' '))continue;
    const published=dateValue(p.createdAt);if(!published)continue;
    const date=reportDay(p.text,published);if(!date)continue;
    const lead=makeLead({org,lane,title:plain(p.text).split(/[\n.!?]/)[0].slice(0,200),evidence:p.text,detail:p.text,date,published,
      url:p.url,name:'@'+lane.account+' on X',kind:'Official public post'},ctx);
    if(lead)rows.push(lead);
  }
  return rows;
}
export async function discoverIndustryOutages({now=Date.now(),start,records=[],webKey,fetchImpl=fetch,state={}}={}) {
  const hour=Math.floor(now/HOUR),keyed=Boolean(webKey);
  const ctx={now,start:Date.parse(start)||now-7*DAY,recent:now-3*DAY,records,webKey,fetchImpl};
  const leads=[],channels=[],seen=new Set(),next={...state};
  let storyBudget=keyed?4:2;
  const add=lead=>{if(!seen.has(lead.row.source_url)){leads.push(lead);seen.add(lead.row.source_url);}};
  async function run(channel,frequency,initial,operation){
    const key=channel+'Hour',cursorKey=channel+'Index';
    const index=Number.isSafeInteger(next[cursorKey])&&next[cursorKey]>=0?next[cursorKey]%WATCHLIST.length:initial;
    const lane=WATCHLIST[index];
    const log={channel,sector:lane.sector,candidates:0,accepted:0};channels.push(log);
    if(channel==='x' && !keyed){log.status='requires_key';return;}
    if(next[key]===hour){log.status='already_checked';return;}
    if(Number.isSafeInteger(next[key]) && hour-next[key]<frequency){log.status='not_due';return;}
    next[key]=hour;
    try{
      await operation(lane,log);
      log.status ||= 'ok';
    }catch(e){log.status=errStatus(e);if(Number.isInteger(e.status))log.httpStatus=e.status;}
    // A single unavailable publisher must not starve other industries. Resume the same lane after quota exhaustion.
    if(log.status!=='budget')next[cursorKey]=(index+1)%WATCHLIST.length;
  }
  async function articles(candidates,lane,log){
    log.candidates=candidates.length;
    const allowance=Math.min(storyBudget,keyed?2:1);
    for(const c of candidates.slice(0,allowance)){
      storyBudget--;
      try{const lead=await readStory(c,lane,ctx);if(lead){add(lead);log.accepted++;}}
      catch(e){if(errStatus(e)==='budget')throw e;log.status='partial';}
    }
  }
  async function search(lane,log){
    const [language,country]=lane.locale.split('-');
    const entities=[lane.org,...lane.peers].map(x=>'"'+x+'"').join(' OR ');
    const query='('+entities+') ('+searchTerms[language]+') after:'+iso(now-4*DAY).slice(0,10);
    const result=await request('/search',{query,language,...(keyed?{country}: {})},ctx);
    await articles(searchCandidates(result,lane),lane,log);
  }
  await run('search',keyed?1:3,10,search);
  if(keyed)await run('regionalSearch',1,4,search);
  await run('operator',keyed?1:2,9,async(lane,log)=>{
    const content=await fetchPage(lane.board,ctx);
    if(lane.statusPage){const events=typeof content==='string'?JSON.parse(content):content;
      const rows=statusRows(events,lane,ctx);log.candidates=events.incidents.length;rows.forEach(add);log.accepted=rows.length;
    }else{await articles(boardLinks(content,lane),lane,log);}
  });
  await run('x',1,8,async(lane,log)=>{
    const result=await request('/integrations/x/posts',{account:lane.account,maxPages:1,includeReposts:false},ctx);
    const rows=socialRows(result,lane,ctx);log.candidates=(Array.isArray(result)?result:result.data).length;rows.forEach(add);log.accepted=rows.length;
  });
  return {leads,state:next,diagnostics:{checkedAt:iso(now),channels,leads:leads.length}};
}
