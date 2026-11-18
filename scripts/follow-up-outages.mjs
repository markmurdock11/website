import {createHash} from 'node:crypto';
import {isIP} from 'node:net';

const HOUR = 3_600_000;
const MILESTONES = [6, 24, 72];
const norm = value => String(value || '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const digest = text => createHash('sha256').update(text).digest('hex').slice(0,24);
const DATED = /^\d{4}-\d{2}-\d{2}(?:T\d\d:\d\d(?::\d\d(?:\.\d{1,9})?)?(?:Z|[+-]\d\d:\d\d))?$/;
function stamp(value, now = Infinity) {
  if (typeof value !== 'string' || !DATED.test(value) || !Number.isFinite(Date.parse(value)) || Date.parse(value) > now) return '';
  if (new Date(Date.parse(value.slice(0,10))).toISOString().slice(0,10) !== value.slice(0,10)) return '';
  return value.length === 10 ? value : new Date(value).toISOString();
}
function urlOf(value) {
  try {
    const u = new URL(value);
    const host = u.hostname;
    if (!['http:','https:'].includes(u.protocol) || u.username || u.password || u.port || isIP(host) ||
      !/^(?:[a-z\d](?:[a-z\d-]*[a-z\d])?\.)+[a-z][a-z\d-]+$/i.test(host) ||
      /(?:^|\.)(?:localhost|local|internal|invalid|test|example|onion|home\.arpa)$/i.test(host)) return '';
    for (const name of [...u.searchParams.keys()]) {
      if (/token|secret|signature|api.?key|credential/i.test(name)) return '';
      if (/^(?:utm_|fbclid|gclid)/i.test(name)) u.searchParams.delete(name);
    }
    u.hash = '';
    return u.href;
  } catch { return ''; }
}
const eventTime = e => e.sourceDate || e.detectedAt || '';
function definitelyBefore(earlier,later) {
  const a=eventTime(earlier), b=eventTime(later);
  if (!a || !b) return false;
  if (a.length===10 || b.length===10) return a.slice(0,10)<b.slice(0,10);
  return Date.parse(a)<Date.parse(b);
}
function eventFor(d, detectedAt) {
  const observed = d.timeBasis === 'observed';
  const sourceDate = observed ? '' : stamp(d.when);
  const observedDate = stamp(detectedAt) || (observed ? stamp(d.when) : '');
  const sourceUrl = urlOf(d.sourceUrl);
  const quote = d.quote || d.paraphrase;
  if (!sourceUrl || !quote || !d.speaker || !d.sourceName || (!sourceDate && !observedDate)) return null;
  const kind=d.kind || 'denial';
  const id=digest([kind,sourceUrl,norm(d.speaker),norm(quote)].join('|'));
  return {id,kind,...(kind==='denial'?{denialType:d.type}:{}),speaker:d.speaker,quote,
    ...(d.speakerRole?{speakerRole:d.speakerRole}:{}),
    ...(d.quoteType||d.quoteKind?{quoteType:d.quoteType||d.quoteKind}:{}),
    ...(d.translation?{translation:d.translation}:{}),
    sourceUrl,sourceName:d.sourceName,...(sourceDate?{sourceDate}:{}),...(observedDate?{detectedAt:observedDate}:{})};
}
function sameEvidence(a,b) {
  if (!a || !b || a.kind!==b.kind || a.sourceUrl!==b.sourceUrl || a.denialType!==b.denialType) return false;
  if (a.id===b.id) return true;
  const x=norm(a.quote), y=norm(b.quote);
  // Publishers may surround an already quoted phrase with attribution and context.
  return Math.min(x.length,y.length)>=18 && ((' '+x+' ').includes(' '+y+' ') || (' '+y+' ').includes(' '+x+' '));
}
function claims(record) {
  const result=[];
  for (const claim of [record.denial,...(record.denialHistory||[])]) {
    if (!claim || !['qualified','explicit'].includes(claim.type) || !record.sources?.some(s=>urlOf(s.url)===urlOf(claim.sourceUrl))) continue;
    const e=eventFor(claim);
    if (e && !result.some(previous=>sameEvidence(previous,e))) result.push(e);
  }
  return result;
}
const byDate = (a,b) => Date.parse(eventTime(a))-Date.parse(eventTime(b)) || a.id.localeCompare(b.id);
function withPrior(event, known) {
  const prior = known.filter(entry=>!sameEvidence(entry,event) && definitelyBefore(entry,event))
    .sort(byDate).at(-1);
  if (!prior) return event;
  const {speaker,quote,sourceName,sourceUrl,kind}=prior;
  return {...event,previous:{speaker,quote,sourceName,sourceUrl,kind,...(prior.sourceDate?{sourceDate:prior.sourceDate}:{})}};
}
// Return changes already documented in an edition without inventing a scan time.
export function reviewedChanges(record) {
  const documented=claims(record).sort(byDate);
  const changes=[...(record.changes||[])];
  for (const e of documented) {
    if (changes.some(existing=>sameEvidence(existing,e))) continue;
    const change=withPrior(e,documented);
    if (change.previous) changes.push(change);
  }
  return changes.sort(byDate);
}

function initialSchedule(record,now) {
  const times=[record.date,...(record.sources||[]).filter(s=>s.timeBasis!=='observed').map(s=>s.date)]
    .map(value=>stamp(value,now)).filter(value=>value.length>10).sort();
  return {anchorAt:times[0] || new Date(now).toISOString(),anchorBasis:times.length?'dated evidence':'first tracked',throughHours:0,checks:[]};
}
function chooseSource(record,entry) {
  const sources=(record.sources||[]).filter(s=>urlOf(s.url));
  const original=sources.filter(s=>/official|operator|regulator|authority|status|primary/i.test(s.kind));
  const chosen=original.length ? original : sources;
  // Rotate official incident records when there is more than one to check.
  return chosen[(entry.checks?.length||0)%chosen.length];
}
const generic = new Set(('a an and are as at before during evidence external failure for from has how impact in incident increased issue issues it late local no of on or outage outages over partial possible public region related reported service services some system technical the to update was week were with after down access after suspected cyber cyberattack cyberattacks attack attacks disruption error errors restored website').split(' '));
const meaningful = str => [...new Set(norm(str).split(' ').filter(w=>w.length>=3&&!generic.has(w)))];
function sourceMatches(record,page,published='') {
  const text=norm(page);
  if (!text || !meaningful(record.org).some(w=>(' '+text+' ').includes(' '+w+' '))) return false;
  // A linked original incident bulletin is especially useful for repeated outages at one firm.
  if ((record.sources||[]).some(s=>{
    const u=urlOf(s.url); return u && new URL(u).pathname.length>10 && page.includes(u);
  })) return true;
  const date = new Date(record.date);
  if (!Number.isFinite(+date)) return false;
  const year=date.getUTCFullYear(),month=date.getUTCMonth()+1,day=date.getUTCDate();
  const full=date.toLocaleString('en-US',{month:'long',timeZone:'UTC'});
  const abbr=full.slice(0,3);
  const monthPattern='(?:'+full+'|'+abbr+'\\.?)';
  const dateWords=new RegExp('\\b(?:'+monthPattern+'\\s+'+day+'(?:st|nd|rd|th)?|'+day+'\\s+'+monthPattern+')\\b(?:,?\\s+(\\d{4})\\b)?','gi');
  const iso=record.date.slice(0,10);
  // A same-named outage in another year can rank first for this query. An
  // unqualified month/day needs independently dated evidence for its year.
  const dates=page.includes(iso) || page.includes(year+'年'+month+'月'+day+'日') ||
    [...page.matchAll(dateWords)].some(m => m[1] ? Number(m[1])===year : Number(published.slice(0,4))===year);
  if (!dates) return false;
  const orgWords=new Set(meaningful(record.org));
  const detail=meaningful(record.title).filter(w=>!orgWords.has(w));
  const hits=detail.filter(w=>(' '+text+' ').includes(' '+w+' ')).length;
  return detail.length>0 && hits>=Math.min(2,detail.length);
}
function sourceQuery(record) {
  const anchor = new Date(record.date).toLocaleString('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'});
  const org=String(record.org).replace(/["\r\n]/g,' ').slice(0,120);
  const details=meaningful(record.title).slice(0,5).join(' ');
  return '"'+org+'" '+details+' '+anchor+' outage update cause statement';
}
function resultSource(hit,now) {
  const url=urlOf(hit?.url);
  if (!url || new URL(url).hostname==='news.google.com') return null;
  const reported=hit.date||hit.publishedAt||hit.published_at||'';
  let date=stamp(reported,now);
  if (!date && /^(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2},\s+\d{4}$/i.test(reported)) {
    const t=Date.parse(reported+' 00:00 UTC');
    if (Number.isFinite(t) && t<=now) date=new Date(t).toISOString().slice(0,10);
  }
  return {url,name:String(hit.sourceName||hit.publisher||new URL(url).hostname.replace(/^www\./,'')).slice(0,130),
    kind:'Published source',date,title:String(hit.title||'').slice(0,300)};
}
function isDedicatedPage(url) {
  return !/^(?:\/(?:en|news|newsroom|updates|status|health|press|blog|support|incidents|outages|en-us))?\/?$/i.test(new URL(url).pathname);
}
function priorInfo(record) {
  return [...claims(record),...(record.changes||[])];
}
function recordProposal(record,source,item,knownPage,now) {
  const detectedAt=new Date(now).toISOString();
  const freshDate=knownPage ? '' : stamp(source.date,now);
  const original=priorInfo(record), accepted=[];
  if (!item?.record || !item.source || urlOf(item.source.url)!==source.url) return accepted;
  for (const d of [item.record.denial,...(item.record.denialHistory||[])]) {
    if (!d || !['explicit','qualified'].includes(d.type) || urlOf(d.sourceUrl)!==source.url) continue;
    const claim={...d,when:freshDate||detectedAt,...(!freshDate?{timeBasis:'observed'}:{})};
    const ev=eventFor(claim,detectedAt);
    if (!ev || [...original,...accepted].some(old=>sameEvidence(old,ev))) continue;
    if (record.denial) {
      const historic = record.denialHistory || [];
      if (!historic.some(old=>old.sourceUrl===record.denial.sourceUrl&&old.quote===record.denial.quote)) historic.push(record.denial);
      historic.push(claim);
      record.denialHistory=historic;
    }
    if (!record.denial || (record.denial.type==='qualified' && claim.type==='explicit')) record.denial=claim;
    record.verifiedOutageDenial=true;
    delete record.verifiedOutageContext;
    // Third-party opinions and quotes do not replace an operator's published assessment.
    accepted.push(withPrior(ev,original));
  }
  if (item.corrected && item.record.speaker && item.record.quote) {
    const ev=eventFor({kind:'confirmation',speaker:item.record.speaker,quote:item.record.quote,when:freshDate||detectedAt,
      timeBasis:freshDate?'reported':'observed',sourceUrl:source.url,sourceName:source.name}, detectedAt);
    if (ev && ![...original,...accepted].some(e=>sameEvidence(e,ev)) &&
      !(record.tier==='confirmed' && record.sources.some(s=>urlOf(s.url)===source.url))) {
      accepted.push(withPrior(ev,original));
      record.tier='confirmed'; record.rationale=item.record.rationale||item.record.quote;
      record.speaker=item.record.speaker;record.quote=item.record.quote;
    }
  }
  if (accepted.length) {
    if (!record.sources.some(s=>urlOf(s.url)===source.url))
      record.sources.push({...source,date:freshDate||detectedAt,...(!freshDate?{timeBasis:'observed'}:{})});
    const official=accepted.find(e=>e.kind==='confirmation' && e.sourceDate && item.corrected);
    if (official) {
      const reference=record.sources.find(s=>urlOf(s.url)===source.url);
      reference.officialAssessment={when:official.sourceDate,speaker:official.speaker,type:'confirmed'};
    }
    record.changes=[...(record.changes||[]),...accepted].sort(byDate);
    for (const e of accepted) {
      const line={date:e.sourceDate||e.detectedAt,text:e.speaker+' — '+e.quote,url:e.sourceUrl,...(!e.sourceDate?{timeBasis:'observed'}:{})};
      if (!(record.history||[]).some(h=>h.url===line.url && h.text===line.text)) (record.history ||= []).push(line);
    }
    record.evidenceUpdatedAt = detectedAt;
  }
  return accepted;
}

export async function runFollowups({records,state={},now=Date.now(),fetchPage,search,verify,limit=3}) {
  if (!Array.isArray(records)||typeof fetchPage!=='function'||typeof verify!=='function'||!Number.isFinite(now))
    throw Error('Follow-ups require records, source verification and a valid observation time');
  const entries=Object.create(null), checkedAt=new Date(now).toISOString();
  const stats={due:0,attempted:0,checked:0,rescheduled:0,fetched:0,searched:0,unavailable:0,changes:0};
  const queue=[], updates=[];
  for (const record of records) {
    if (!record?.id || !stamp(record.date,now)) continue;
    const retained=Object.hasOwn(state?.incidents||{},record.id) ? state.incidents[record.id] : null;
    const entry=retained && stamp(retained.anchorAt,now) && [0,...MILESTONES].includes(retained.throughHours) ?
      {...retained,checks:[...(retained.checks||[])]} : initialSchedule(record,now);
    entries[record.id]=entry;
    const due=MILESTONES.filter(h=>h>entry.throughHours && Date.parse(entry.anchorAt)+h*HOUR<=now);
    if (!due.length) continue;
    stats.due++;
    if (Date.parse(entry.retryAfter)>now) continue;
    queue.push({record,entry,due});
  }
  queue.sort((a,b)=>(Date.parse(a.entry.lastAttemptAt)||0)-(Date.parse(b.entry.lastAttemptAt)||0) ||
    (Date.parse(a.entry.anchorAt)+a.due[0]*HOUR)-(Date.parse(b.entry.anchorAt)+b.due[0]*HOUR) || a.record.id.localeCompare(b.record.id));
  for (const {record,entry,due} of queue.slice(0,Math.max(0,Math.floor(limit)))) {
    entry.lastAttemptAt=checkedAt;
    stats.attempted++;
    let readable=false,failed=false,budget=false;
    async function inspect(original,known) {
      const url=urlOf(original?.url);
      if (!url) return;
      const source={...original,url};
      stats.fetched++;
      const page=await fetchPage(url);
      if (typeof page!=='string'||!page.trim()) {stats.unavailable++;return;}
      if ((!known || !isDedicatedPage(url)) && !sourceMatches(record,page,source.date||'')) return;
      const row={org:record.org,incident_id:record.id,title:record.title,date:record.date,sector:record.sector,impact:record.impact,
        source_name:source.name,source_kind:source.kind,source_url:url,source_date:source.date||checkedAt,summary:record.summary};
      const item=await verify({record,source,page,candidate:row});
      if (!item) return;
      readable=true;
      for (const change of recordProposal(record,source,item,known,now)) updates.push({incidentId:record.id,...change});
    }
    try {
      const source=chooseSource(record,entry);
      if (source) await inspect(source,true);
      if (typeof search==='function') {
        stats.searched++;
        const hits=await search(sourceQuery(record));
        if (!Array.isArray(hits)) throw Error('Follow-up search unavailable');
        const next=hits.map(h=>resultSource(h,now)).find(s=>s && (!s.date||s.date.slice(0,10)>=record.date.slice(0,10)) &&
          !(record.sources||[]).some(old=>urlOf(old.url)===s.url));
        if (next) await inspect(next,false);
      }
    } catch (error) {
      failed=true;budget=error?.code==='BUDGET';
    }
    if (readable&&!failed) {
      const hour=due.at(-1);
      entry.throughHours=hour;entry.checks.push({hour,checkedAt,...(due.length>1?{coalesced:due.slice(0,-1)}:{})});
      delete entry.retryAfter;
      stats.checked++;
    } else {
      entry.retryAfter=new Date(now+(budget?1:2)*HOUR).toISOString();stats.rescheduled++;
    }
    if (budget) break;
  }
  stats.changes=updates.length;
  return {state:{version:1,incidents:entries},updates,stats};
}
