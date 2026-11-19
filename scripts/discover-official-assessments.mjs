// A search result is a lead. Only an attributed reassurance in a dated source
// can become an assessment; observation times never reset the public clock.
import {createHash} from 'node:crypto';
import {isIP} from 'node:net';

const ORIGIN='https://request.usestring.ai/v1', HOUR=3600000, DAY=24*HOUR;
const fold=value=>String(value||'').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const speakerKey=value=>fold(value).split(' ').sort().join(' ');
const iso=value=>new Date(value).toISOString();
function sourceUrl(value) {
  try {
    const url=new URL(value), host=url.hostname.toLowerCase();
    if(url.protocol!=='https:' || url.username || url.password || url.port || isIP(host) ||
      !/^(?:[a-z0-9-]+\.)+[a-z]{2,}$/.test(host))return '';
    if(!/(?:^|\.)(?:cnn\.com|cbsnews\.com|apnews\.com|reuters\.com|ktvz\.com)$/.test(host) &&
      !/\.(?:gov|gov\.uk|gc\.ca|gov\.au|govt\.nz)$/.test(host))return '';
    for(const name of [...url.searchParams.keys()]) {
      if(/token|secret|signature|api.?key|credential/i.test(name))return '';
      if(/^(?:utm_|fbclid$|gclid$)/i.test(name))url.searchParams.delete(name);
    }
    url.hash='';return url.href;
  } catch { return ''; }
}
const government=url=>/\.(?:gov|gov\.uk|gc\.ca|gov\.au|govt\.nz)$/.test(new URL(url).hostname);
function publisher(url) {
  const host=new URL(url).hostname;
  return /(?:^|\.)cnn\.com$/.test(host)?'CNN':/(?:^|\.)cbsnews\.com$/.test(host)?'CBS News':
    /(?:^|\.)apnews\.com$/.test(host)?'Associated Press':/(?:^|\.)reuters\.com$/.test(host)?'Reuters':
    /(?:^|\.)ktvz\.com$/.test(host)?'CNN Newsource / KTVZ':host.replace(/^www\./,'');
}
function unescape(text) {
  return String(text||'').replace(/&(#x[\da-f]+|#\d+|amp|quot|apos|lt|gt|nbsp|rsquo|lsquo|ldquo|rdquo);/gi,(all,key)=>{
    if(key[0]==='#') {const n=key[1]?.toLowerCase()==='x'?parseInt(key.slice(2),16):Number(key.slice(1));return n>0&&n<=0x10ffff?String.fromCodePoint(n):' ';}
    return ({amp:'&',quot:'"',apos:"'",lt:'<',gt:'>',nbsp:' ',rsquo:'’',lsquo:'‘',ldquo:'“',rdquo:'”'})[key.toLowerCase()]||all;
  });
}
const plain=text=>unescape(String(text||'').replace(/<(script|style|nav|footer|aside)\b[^>]*>[\s\S]*?<\/\1>/gi,' ')
  .replace(/<\/(?:p|div|section|h[1-6]|li)>|<br\s*\/?>/gi,'\n').replace(/<[^>]+>/g,' ')).replace(/[ \t]+/g,' ').trim();
function attribute(tag,name) {
  const match=tag.match(new RegExp('(?:^|\\s)'+name+'\\s*=\\s*(?:"([^"]*)"|\'([^\']*)\')','i'));
  return match?unescape(match[1]??match[2]):'';
}
function dated(value) {
  if(typeof value!=='string' || !/^20\d\d-\d\d-\d\d(?:T\d\d:\d\d(?::\d\d(?:\.\d+)?)?(?:Z|[+-]\d\d:\d\d))?$/.test(value))return '';
  const time=Date.parse(value);
  if(!Number.isFinite(time) || iso(Date.parse(value.slice(0,10))).slice(0,10)!==value.slice(0,10))return '';
  return value.length===10?value:iso(time);
}
function pageInfo(raw) {
  const html=String(raw||''), dates=[], articles=[];
  let title='',live=false;
  for(const tag of html.match(/<meta\b[^>]+>/gi)||[]) {
    const key=(attribute(tag,'property')||attribute(tag,'name')).toLowerCase();
    if(key==='article:published_time')dates.push(dated(attribute(tag,'content')));
    if(key==='og:title')title=attribute(tag,'content');
  }
  function visit(node) {
    if(!node||typeof node!=='object')return;
    if(Array.isArray(node)){node.forEach(visit);return;}
    const types=[].concat(node['@type']||[]);
    if(types.includes('LiveBlogPosting'))live=true;
    if(types.some(type=>/^(?:NewsArticle|Article|ReportageNewsArticle|BlogPosting)$/.test(type)))articles.push(node);
    if(node['@graph'])visit(node['@graph']);
  }
  for(const match of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try{visit(JSON.parse(match[1]));}catch{/* Ignore unrelated invalid metadata, never infer a date. */}
  }
  if(articles.length>1)return null;
  const article=articles[0];
  if(article){dates.push(dated(article.datePublished));title ||= article.headline||'';}
  title=plain(title||html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1]||'');
  if(live || /\blive (?:updates|coverage|blog)\b/i.test(title))return null;
  const actual=[...new Set(dates.filter(Boolean))], days=new Set(actual.map(value=>value.slice(0,10)));
  if(days.size!==1)return null;
  const exact=actual.filter(value=>value.length>10);
  // Conflicting exact metadata on the same date has day-level precision only.
  const published=exact.length===1?exact[0]:[...days][0];
  const body=plain(typeof article?.articleBody==='string'?article.articleBody:
    html.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i)?.[1]||html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1]||'');
  if(!title||!body||body.length>120000)return null;
  return {title,published,body};
}

const person="[A-Z][\\p{L}’'-]+(?:\\s+[A-Z][\\p{L}’'-]+){1,3}";
const role='(?:(?:U[.]S[.]|US|United States)\\s+)?(?:(?:Homeland Security|Defense|State|Treasury|Transportation|Energy|Commerce) Secretary|Secretary of (?:State|Defense|Transportation|Homeland Security)|Director of National Intelligence|FBI Director|CIA Director|CISA Director|President|Vice President|Governor|White House (?:spokesperson|press secretary))';
const verb='(?:said|told|testified|stated|wrote|announced|confirmed)';
const namedFirst=new RegExp('('+person+'),\\s+('+role+'),?\\s+'+verb+'\\b','u');
const roleFirst=new RegExp('('+role+')\\s+('+person+')\\s+'+verb+'\\b','u');
const unnamed=new RegExp('\\b((?:[Aa] |[Tt]he )?(?:senior )?(?:administration|government|White House|DHS|FBI|CISA) official)\\s+'+verb+'\\b','u');
const agency=new RegExp('\\b((?:The )?(?:Department of Homeland Security|Cybersecurity and Infrastructure Security Agency|Federal Bureau of Investigation|DHS|CISA|FBI|White House))\\s+'+verb+'\\b','u');
function attribution(sentence,official) {
  let match=roleFirst.exec(sentence)||namedFirst.exec(sentence)||unnamed.exec(sentence);
  if(!match && official)match=agency.exec(sentence);
  if(!match || /(?:former|ex-|retired|candidate)\s*$/i.test(sentence.slice(Math.max(0,match.index-20),match.index)))return null;
  return {speaker:match.slice(1).filter(Boolean).join(', '),speech:sentence.slice(match.index+match[0].length)};
}
function claim(sentence,official) {
  if(!/\b(?:outages?|(?:network|system|service|communications?) disruptions?)\b/i.test(sentence))return null;
  const attributed=attribution(sentence,official);if(!attributed)return null;
  const speech=attributed.speech;
  if(/\b(?:cannot|can't|not|never) rul(?:e|ed|ing) out|no evidence to rule out|\bnot (?:confident|certain|sure|only)\b|\buncertain\b|\b(?:drill|hypothetical|simulation)\b/i.test(speech))return null;
  const cyber=/\bcyber[- ]?attacks?\b/i.test(speech), malicious=/\b(?:malicious|hostile|nefarious) (?:activity|actors?|intent)|\bforeign (?:interference|adversar(?:y|ies))\b/i.test(speech);
  if(!cyber&&!malicious)return null;
  if(/\bno evidence\b.{0,70}\b(?:not|wasn't|weren't)\b/i.test(speech))return null;
  const absent=speech.match(/\bno (?:evidence|indication|signs?)\b([^.!?]{0,100})\b(?:cyber[- ]?attacks?|(?:malicious|hostile|nefarious) (?:activity|actors?|intent)|foreign interference)\b/i);
  const noEvidence=!!absent && !/\b(?:but|however|although)\b/i.test(absent[1]);
  const qualified=noEvidence||/\b(?:confiden(?:t|ce)|certain(?:ty)?)\b[^.!?]{0,100}\b(?:not|no)\b/i.test(speech);
  const explicit=/\b(?:not|wasn't|weren't|isn't|aren't)\b[\s\S]{0,90}\b(?:cyber[- ]?attacks?|malicious activity|hostile activity)\b/i.test(speech)||
    /\b(?:cyber[- ]?attacks?|malicious activity|hostile activity)\b[\s\S]{0,50}\b(?:not|didn't|did not)\b/i.test(speech);
  if(!qualified&&!explicit)return null;
  const target=cyber?'a cyberattack':'malicious activity';
  const paraphrase=qualified?noEvidence?
    attributed.speaker+' reported no evidence linking the outages to '+target+'.':
    attributed.speaker+' expressed confidence that the outages were not caused by '+target+'.':
    attributed.speaker+' said the outages were not caused by '+target+'.';
  const excerpt=speech.match(/\b\d{1,3}% (?:confident|certain)\b|\bno (?:evidence|indication|signs?)\b|\bnot a cyber[- ]?attack\b/i)?.[0];
  return {speaker:attributed.speaker,type:qualified?'qualified':'explicit',paraphrase,...(excerpt?{quoteExcerpt:excerpt}: {})};
}
async function request(path,body,{webKey,fetchString}) {
  const headers={'Content-Type':'application/json'};
  if(webKey)headers.Authorization='Bearer '+webKey;
  const response=await fetchString(ORIGIN+path,{method:'POST',redirect:'error',headers,
    body:JSON.stringify(body),signal:AbortSignal.timeout(25000)});
  if(!response.ok)throw Object.assign(Error('String request unavailable'),{status:response.status});
  if(path==='/fetch') {
    const destination=Number(response.headers.get('x-status-code')), final=response.headers.get('x-final-url');
    if(destination&&(destination<200||destination>=300)||final&&sourceUrl(final)!==sourceUrl(body.url))throw Error('Source unavailable or redirected');
  }
  let size=0;const chunks=[];
  for await(const chunk of response.body){size+=chunk.length;if(size>2000000)throw Error('Oversized source');chunks.push(chunk);}
  const text=Buffer.concat(chunks).toString('utf8');
  return /json/.test(response.headers.get('content-type')||'')?JSON.parse(text):text;
}
export async function discoverOfficialAssessments({now=Date.now(),start,assessments=[],webKey,fetchString,canSpend,state={}}={}) {
  const next={...state}, diagnostics={checkedAt:iso(now),status:'checked',searched:0,candidates:0,fetched:0,accepted:0,unavailable:0};
  const result=[];
  const done=()=>{diagnostics.accepted=result.length;return {assessments:result,state:next,diagnostics};};
  if(typeof fetchString!=='function')throw Error('Use the shared String transport');
  const hour=Math.floor(now/HOUR);
  if(next.checkedHour===hour || (!webKey && now-Date.parse(next.lastPublicAttemptAt)<6*HOUR)){
    diagnostics.status='not_due';return done();
  }
  if(!webKey){
    // One search costs five credits. Leave room to verify a hit with one raw read.
    if(typeof canSpend!=='function')throw Error('Use the shared public String budget');
    if(!canSpend(2,6)){diagnostics.status='budget';return done();}
    next.lastPublicAttemptAt=iso(now);
  }
  next.checkedHour=hour;next.lastAttemptAt=iso(now);
  const lower=Math.max(Date.parse(start)||now-3*DAY,now-3*DAY);
  try {
    const query='(outages OR "network disruptions") ("not a cyberattack" OR "not a cyber attack" OR "no evidence" OR "not malicious") (government OR secretary OR official OR intelligence) after:'+iso(lower).slice(0,10);
    diagnostics.searched=1;
    const search=await request('/search',{query,language:'en',dateRange:'day'},{webKey,fetchString});
    const hits=search?.results||search?.data?.results;
    if(!Array.isArray(hits))throw Error('Invalid search results');
    const urls=[...new Set(hits.map(hit=>sourceUrl(hit?.url)).filter(Boolean))];
    diagnostics.candidates=urls.length;
    let candidates=urls.slice(0,2);
    if(!webKey){
      const known=new Set(assessments.flatMap(r=>[r.denial,...(r.denialHistory||[])].map(d=>sourceUrl(d?.sourceUrl))));
      candidates=urls.filter(url=>!known.has(url)).slice(0,1);
    }
    for(const url of candidates) {
      try {
        diagnostics.fetched++;
        const options={url,format:'raw'};
        if(webKey)options.solveCaptcha=false;
        let raw=await request('/fetch',options,{webKey,fetchString});
        if(raw&&typeof raw==='object') {
          if(raw.statusCode&&(raw.statusCode<200||raw.statusCode>=300)||raw.finalUrl&&sourceUrl(raw.finalUrl)!==url)throw Error('Source blocked or redirected');
          raw=raw.data;
        }
        const page=pageInfo(raw);
        if(!page||Date.parse(page.published)<lower||Date.parse(page.published)>now)continue;
        if(/(?:^|\.)ktvz\.com$/.test(new URL(url).hostname) && !/\bBy\s+CNN(?:\s+Newsource|\s+Wire)\b/i.test(page.body))continue;
        const official=government(url);
        for(const sentence of page.body.split(/\n+|(?<!U\.S\.)(?<=[.!?])\s+(?=[A-Z“"])|(?<=[.!?][”"])\s+(?=[A-Z“"])/).map(value=>value.trim()).filter(value=>value.length>30&&value.length<1800)) {
          const assessment=claim(sentence,official);if(!assessment)continue;
          if(assessments.some(record=>[record.denial,...record.denialHistory||[]].some(d=>d&&sourceUrl(d.sourceUrl)===url&&
            speakerKey(d.speaker)===speakerKey(assessment.speaker)&&d.type===assessment.type)))break;
          const name=publisher(url), basis=official?'statement':'report', id='assessment-'+createHash('sha256').update(url+'|'+speakerKey(assessment.speaker)+'|'+assessment.type).digest('hex').slice(0,20);
          result.push({id,kind:'official-assessment',org:assessment.speaker,title:'Official assessment of recent outages',date:page.published,
            verifiedOutageDenial:true,summary:assessment.paraphrase,
            denial:{...assessment,when:page.published,basis,speakerRole:'authority',sourceName:name,sourceUrl:url,
              note:(official?'Official statement publication':'Report publication')+' time; the exact time the official spoke is not established. The source publication date is used without its modification time.'},
            sources:[{name,url,date:page.published,publishedAt:page.published,kind:official?'Government statement':'News'}]});
          break;
        }
      } catch(error) {
        if(error.code==='BUDGET'||error.status===429)throw error;
        diagnostics.unavailable++;diagnostics.status=webKey?'partial':'unavailable';
      }
    }
    diagnostics.accepted=result.length;
    if(diagnostics.status==='checked')next.lastSuccessAt=iso(now);
  } catch(error) {diagnostics.status=error.code==='BUDGET'||error.status===429?'budget':'unavailable';}
  return done();
}
