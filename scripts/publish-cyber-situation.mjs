// Run on the website's publisher with a private STRING_FEED_BUILDER_KEY.
// Expects String-storage default gzipped JSONL exports; cadence is configured in Composer.
import { createHash, randomUUID } from 'node:crypto';
import { open, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { isIP } from 'node:net';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gunzipSync } from 'node:zlib';

const origin = 'https://feedbuilder.usestring.ai';
const day = 86400000;
const tiers = new Set(['confirmed', 'indications', 'unresolved', 'rumor', 'ruled-out']);
const assessed = new Set(['confirmed', 'indications', 'ruled-out']);
const impacts = new Set(['systemwide', 'multiservice', 'service', 'limited', 'none']);
const clean = (s, max = 1500) => typeof s === 'string' && s.trim().length <= max ? s.trim() : '';
const key = s => s.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const identity = r => [key(r.org), r.date.slice(0, 10), key(r.title)].join('|');
const hash = s => createHash('sha256').update(s).digest('hex').slice(0, 24);
const time = s => Date.parse(s) || 0;

function date(value, now) {
  const s = clean(value, 40);
  if (!/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2}))?$/.test(s)) return '';
  const t = Date.parse(s), localDay = Date.parse(s.slice(0, 10));
  if (!Number.isFinite(t) || !Number.isFinite(localDay) || t > now || new Date(localDay).toISOString().slice(0, 10) !== s.slice(0, 10)) return '';
  return s.length === 10 ? s : new Date(t).toISOString();
}

function publicLink(value) {
  try {
    const url = new URL(clean(value, 2048));
    const host = url.hostname.toLowerCase();
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.port ||
        isIP(host) || !/^(?:[a-z\d](?:[a-z\d-]*[a-z\d])?\.)+[a-z][a-z\d-]+$/i.test(host) ||
        /(?:^|\.)(?:local|localhost|internal|test|invalid|example|onion|home\.arpa|example\.com|example\.net|example\.org)$/.test(host)) return '';
    url.hash = '';
    for (const name of [...url.searchParams.keys()]) {
      if (/^(?:access_token|token|api_key|signature|x-amz-signature|x-goog-signature)$/i.test(name)) return "";
      if (/^(utm_.+|fbclid|gclid)$/i.test(name)) url.searchParams.delete(name);
    }
    return url.href;
  } catch { return ''; }
}

const scope = 'outage-denials-v1';
const newsDomain = /(?:^|\.)(?:reuters\.com|apnews\.com|nytimes\.com|wsj\.com|bbc\.(?:com|co\.uk)|theguardian\.com|cnn\.com|cnbc\.com|bloomberg\.com|abcnews\.(?:com|go\.com)|abc\.net\.au|cbc\.ca|9news\.com\.au|aljazeera\.com|therecord\.media|bleepingcomputer\.com|techcrunch\.com|skift\.com|ft\.com|washingtonpost\.com)$/i;
const socialDomain = /(?:^|\.)(?:x\.com|twitter\.com)$/i;
const knownHandles = new Map([['msft365status','microsoft'],['clamanna','microsoft'],['faa','faa'],['united','united airlines'],['chase','chase'],['nttdocomo','docomo']]);
const words = value => key(value).split(' ').filter(w=>w.length>2&&!['the','and','for','organization','corporation','service','services','group','inc','spokesperson'].includes(w));
const contains = (text,part) => (' '+text+' ').includes(' '+part+' ');
const interruption = /\b(?:outages?|ground stop|interruption|disruption|shutdown|unavailable|inaccessible|offline|went down|lost access|could not (?:log in|sign in|access)|unable to (?:log in|sign in|access)|cancelled flights?|flights? (?:stopped|cancelled)|disrupted|suspended (?:operations|service|flights)|service (?:failed|stopped))\b/i;
const hypothetical = /\b(?:outage drill|exercise|simulation|simulated|hypothetical|averted an outage|prevented an outage|no (?:actual |operational )?(?:outage|disruption)|no (?:evidence|indication) of (?:a |any )?(?:broad |widespread )?(?:outage|service disruption)|(?:remained|were) (?:fully )?unaffected)\b/i;
function denialType(quote) {
  const explicit = /\b(?:(?:was|were|is|are)(?: not|n't) (?:the result of |due to |caused by |related to |linked to )?(?:an? )?(?:cyber[ -]?(?:attack|incident|intrusion)|malicious activity)|(?:ruled|rule) out (?:an? )?cyber[ -]?attack|there (?:was|is) no cyber[ -]?attack|no cyber[ -]?attack (?:occurred|took place))\b/i;
  const qualified = /\b(?:no (?:current |present |credible |immediate )?(?:evidence|signs?|indications?)|not aware of (?:any )?(?:evidence|signs?|indications?)|(?:have|has) not (?:found|seen|identified|detected) (?:any )?(?:evidence|signs?|indications?)|does(?: not|n't) (?:currently )?appear to (?:be|have been))\b/i;
  const cyber = /\b(?:cyber[ -]?(?:attack|incident|intrusion|related)|cybersecurity[ -]?(?:incident|related)|malicious activity|unauthori[sz]ed access)\b/i;
  const denyWrongIssue = /\b(?:another|unrelated|different|previous|hypothetical|exercise|simulation|speculat\w*|unconfirmed|would|might|probably|if|whether|not ruled out|(?:cannot|could not|unable to|can't|did not|didn't) (?:rule out|confirm|conclude|say)|not (?:accurate|true|correct|possible) to)\b/i;
  const negativeContext=/\b(?:andere[rmns]?|nicht ausschließen|autre incident|ne (?:peut|pouvons) pas exclure|otro incidente|no (?:se )?puede descartar|eerder incident|niet uitsluiten)\b/i;
  if (!negativeContext.test(quote)) {
    if (/(?:keine[nr]? (?:Hinweise|Anzeichen)(?: auf| für) (?:einen? )?Cyberangriff|geen (?:aanwijzingen|signalen) (?:voor|van) een cyberaanval|(?:aucun indice|aucun élément) (?:d['’]une |ne suggère une )cyberattaque|no (?:hay|existen) (?:indicios|evidencias?) (?:de (?:que se trate de |que haya sido |un )?)?(?:un )?ciberataque|サイバー攻撃を示す事象は確認されておりません)/iu.test(quote)) return 'qualified';
    if (/(?:war kein Cyberangriff|(?:es )?handelt (?:es )?sich nicht um einen Cyberangriff|geen sprake van een cyberaanval|(?:n['’]était pas|n['’]est pas) une cyberattaque|no (?:fue|se trató de) un ciberataque)/iu.test(quote)) return 'explicit';
  }
  let result;
  for (const sentence of quote.replace(/[’‘]/g,"'").split(/[.!?;]/)) {
    if (denyWrongIssue.test(sentence)) continue;
    const m=qualified.exec(sentence);
    if (m) {
      if (/\b(?:cyber[ -]?attack|malicious activity)\s+(?:involved|exposed|accessed|compromised|stole|targeted|affected the data)\b/i.test(sentence)) continue;
      const rest=sentence.slice(m.index+m[0].length), target=cyber.exec(rest);
      if (target && /^(?:(?:a|an|at|this|that|the|it|our|of|to|by|in|any|due|for|as|time|present|moment|result|related|linked|caused|was|is|were|being|been|be|there|has|have|involved|involving|indicate|suggest|suggesting|disruption|incident|outage|issue|failure|system|service|potential|possible|coordinated)\s*){0,18}$/.test(rest.slice(0,target.index).trim().toLowerCase())) result ??= 'qualified';
    } else if((explicit.test(sentence)||/\b(?:it|this|outage|disruption|issue|incident|interruption)\s+(?:is|was)(?: not|n't)\s+cyber[ -]related\b/i.test(sentence)) && !/\b(?:may|might|probably|believe|think|suggest|unlikely|potentially|possibly)\b/i.test(sentence)) result='explicit';
  }
  return result;
}
function attribution(org,speaker,source,reviewed,trustedDomains) {
  if (!speaker || /\b(?:anonymous|unnamed|unidentified|commentator|analyst|observer|critic|unaffiliated)\b/i.test(speaker)) return;
  const url=new URL(source.url),host=url.hostname.replace(/^www\./,'');
  if (/^(?:news\.google\.com|.*downdetector\.[a-z.]+)$/.test(host)) return;
  const who=key(speaker),brand=key(org),brandWords=words(org);
  const related=contains(who,brand)||brandWords.some(w=>contains(who,w));
  const authority=/\b(?:fbi|cisa|ncsc|police|white house|department of|national cyber security centre|federal aviation administration)\b/i.test(speaker);
  if (!related&&!authority || /^(?:police|local police|officials|investigators|security officials)$/i.test(speaker)) return;
  const kind=key(source.kind);
  if (socialDomain.test(host)) {
    const handle=url.pathname.match(/^\/([A-Za-z0-9_]+)\/status\/\d+\/?$/)?.[1].toLowerCase();
    const account=knownHandles.get(handle);
    return account&&(contains(brand,account)||contains(who,account))&&(related||authority)?'statement':undefined;
  }
  if (/(?:reddit\.com|bsky\.app|threads\.(?:net|com)|facebook\.com|tiktok\.com)$/.test(host)) return;
  if (newsDomain.test(host)||trustedDomains.has(host)||(reviewed&&/\b(?:news|newsroom|wire|press|journalist|reporting)\b/.test(kind))) return 'report';
  if (/\b(?:official|operator|primary|regulator|authority|agency|government|status)\b/.test(kind)) {
    const domainWords=host.split('.'),acronym=brand.split(' ').map(w=>w[0]).join('');
    if (brandWords.some(w=>domainWords.includes(w))||(acronym.length>1&&domainWords.includes(acronym))||(/(?:^|\.)gov(?:\.[a-z]{2})?$/.test(host)&&(authority||related))) return 'statement';
  }
}
function candidate(row,start,now,trustedDomains) {
  if (!row||row.approved===false||row.approved==='false'||(row.review_status&&!['approved','verified'].includes(row.review_status))) return;
  const org=clean(row.org,150),title=clean(row.title,320),incident=date(row.date,now);
  const url=publicLink(row.source_url),name=clean(row.source_name,150),kind=clean(row.source_kind||row.kind,60),published=date(row.source_date,now);
  const speaker=clean(row.speaker,200),quote=clean(row.quote),summary=clean(row.summary),rationale=clean(row.rationale);
  if (!org||!title||!incident||time(incident)<time(start)||!url||!name||!kind||!published||published.slice(0,10)<incident.slice(0,10)||!summary||!speaker||quote.length<15) return;
  const source={name,kind,url,date:published};
  const basis=attribution(org,speaker,source,row.review_status==='verified'||row.approved===true,trustedDomains);
  if (!basis||row.tier==='rumor') return;
  const type=denialType(quote);
  const correction=!type && row.tier==='confirmed' && (row.correction===true||/\b(?:correction|retraction|revised assessment)\b/i.test(rationale))
    && /\b(?:confirmed?|detected?|attributed?|caused by|result of|disrupted by|compromised by)\b/i.test(quote)
    && /\b(?:cyber[ -]?attack|ransomware|malicious activity)\b/i.test(quote) && !/\b(?:not|no|unconfirmed|simulat\w*|might|possibly|suspect\w*)\b/i.test(quote);
  if (!type&&!correction) return;
  // A breach or a forecast on its own does not establish service interruption.
  const operational=[title,summary,clean(row.impact_note)].filter(Boolean).join(' ');
  if (hypothetical.test(operational)||!interruption.test(operational)||row.impact==='none') return;
  const record={org,title,date:incident,speaker,quote,summary,rationale:rationale||quote,tier:type==='explicit'?'ruled-out':type?'unresolved':'confirmed'};
  record.impact=impacts.has(row.impact)?row.impact:'service';
  record.impactNote=clean(row.impact_note)||summary;
  if (clean(row.sector,100)) record.sector=clean(row.sector,100);
  if (clean(row.cause)) record.cause=clean(row.cause);
  const id=clean(row.incident_id||row.id,180);
  record.id=/^[a-zA-Z0-9_-]{1,100}$/.test(id)?id:'case-'+hash(id||identity(record));
  if (id) record.composerIncidentId=record.id;
  if (type) {
    record.verifiedOutageDenial=true;
    record.denial={type,when:published,sourceName:name,sourceUrl:url,basis,speaker,quote,quoteKind:'verbatim'};
  }
  return {record,source,matchKey:identity(record),corrected:correction,attributed:true,basis};
}
function normalizeEvidence(text) {
  return text.normalize('NFKC').replace(/\[([^\]]+)\]\(https?:\/\/[^)]+\)/g,'$1').replace(/[*_]/g,'').replace(/[’‘]/g,"'").replace(/[“”]/g,'"').replace(/\s+/g,' ').trim().toLowerCase();
}
function citedOutage(item,page) {
  const article=normalizeEvidence(page),target=normalizeEvidence(item.record.quote);
  if (target.length<15 || target.length>1200) return false;
  const brand=words(item.record.org),speakers=words(item.record.speaker);
  for(let at=article.indexOf(target);at!==-1;at=article.indexOf(target,at+target.length)) {
    const excerpt=article.slice(Math.max(0,at-350),at+target.length+350);
    if (!(interruption.test(excerpt)||/ausfall|störung|\bpanne\b|\bstoring\b|uitval|onderbreking|avería|interrupción|通信障害|利用しづらい/.test(excerpt))||hypothetical.test(excerpt)) continue;
    const wordsHere=key(excerpt);
    if (brand.length&&!brand.some(w=>contains(wordsHere,w))&&item.basis!=='statement') continue;
    const lead=article.slice(Math.max(0,at-220),at).split(/[.!?]\s+/).at(-1);
    if (/\b(?:can(?:not|'t)|unable to|declined to|did not|would not|could not)\s+(?:yet\s+)?(?:say|confirm|conclude|claim)(?:\s+that)?[\s'"“”‘’:]*$/i.test(lead)) continue;
    if (item.basis==='report') {
      const tail=article.slice(at+target.length,at+target.length+200).replace(/^['"”.]+\s*(?=,)/,'').split(/[.!?]\s+/)[0];
      const statement=key(lead+' '+tail);
      if (!speakers.some(w=>contains(statement,w))||!/\b(?:said|says|told|stated|according to|statement|spokesperson|confirmed|wrote|posted|announced|reported|ruled out|sagte|erklärte|déclaré|afirmó|verklaarde)\b/i.test(statement)) continue;
    }
    return true;
  }
  return false;
}
async function readSource(url,fetchImpl,webKey) {
  const headers={'Content-Type':'application/json'};
  if(webKey) headers.Authorization='Bearer '+webKey;
  const response=await fetchImpl('https://request.usestring.ai/v1/fetch',{method:'POST',headers,redirect:'error',signal:AbortSignal.timeout(45000),body:JSON.stringify({url,format:'markdown'})});
  if(response.status===429||response.status>=500) throw Error('String Web Access temporarily unavailable (HTTP '+response.status+')');
  if (!response.ok) return '';
  const raw=(await bytes(response,4e6)).toString('utf8');
  if (!(response.headers.get('content-type')||'').includes('application/json')) return raw;
  try {const j=JSON.parse(raw);return clean(j.markdown||j.data?.markdown||j.content||j.data?.content,4e6)}catch{return ''}
}
function validDenialRecord(r) {
  const d=r.denial;
  return r.verifiedOutageDenial===true&&impacts.has(r.impact)&&r.impact!=='none'&&['explicit','qualified'].includes(d?.type)&&time(d.when)&&
    clean(d.speaker,200)&&clean(d.quote)&&publicLink(d.sourceUrl)&&r.sources?.some(s=>publicLink(s.url)===publicLink(d.sourceUrl));
}

function preserveDenials(target, ...records) {
  const first = new Map();
  for (const r of records) {
    for (const item of [...(r.denialHistory || []), r.denial]) {
      if (!item || !['explicit','qualified'].includes(item.type) || !time(item.when)) continue;
      const old = first.get(item.type);
      const sameSourceDay = old && old.sourceUrl === item.sourceUrl && old.when.slice(0,10) === item.when.slice(0,10);
      const addsClock = sameSourceDay && old.when.length === 10 && item.when.includes('T');
      const losesClock = sameSourceDay && item.when.length === 10 && old.when.includes('T');
      if (!old || addsClock || (!losesClock && time(item.when) < time(old.when)) ||
          (time(item.when) === time(old.when) && old.basis !== 'statement' && item.basis === 'statement')) first.set(item.type, item);
    }
  }
  if (!first.size) return;
  target.denial = first.get('explicit') || first.get('qualified');
  if (first.size > 1) target.denialHistory = [...first.values()].sort((a,b) => time(a.when)-time(b.when));
}
function unionSources(existing, incoming) {
  const byUrl = new Map(existing.map(s => [publicLink(s.url) || s.url, s]));
  for (const s of incoming) {
    const u = publicLink(s.url);
    if (!u) continue;
    const prior = byUrl.get(u);
    if (!prior || time(s.date) > time(prior.date) || (!prior.note && s.note && time(s.date) === time(prior.date))) byUrl.set(u, { ...prior, ...s });
  }
  return [...byUrl.values()];
}
const latest = r => r.evidenceUpdatedAt || [r.date, ...(r.sources || []).map(s => s.date)].filter(Boolean).sort((a,b) => time(b)-time(a))[0];

function merge(records, item) {
  const { record, source, corrected, attributed } = item;
  const evidenceDate = source.date || record.date;
  const previous = records.find(r => r.id === record.id || (record.composerIncidentId && r.composerIncidentId === record.composerIncidentId) || identity(r) === item.matchKey);
  if (!previous) {
    if (!record.verifiedOutageDenial) return false;
    records.push({ ...record, sources: [source], history: [{ date: evidenceDate, text: record.rationale, url:source.url }], evidenceUpdatedAt: evidenceDate });
    return true;
  }
  if (key(previous.org) !== key(record.org) || !validDenialRecord(previous)) return false; // conflicting upstream ID
  const firstDate = time(record.date) < time(previous.date) ? record.date : previous.date;
  if (record.composerIncidentId) previous.composerIncidentId = record.composerIncidentId;
  const currentTime = time(latest(previous)), incomingTime = time(evidenceDate);
  const change = incomingTime > currentTime || (incomingTime === currentTime && (corrected || (attributed && !assessed.has(previous.tier))));
  const canReplace = change && (record.tier === previous.tier || attributed ||
    (!assessed.has(previous.tier) && previous.tier !== 'unresolved' && record.tier === 'unresolved'));
  const isNewSource = !(previous.sources || []).some(s => publicLink(s.url) === source.url);
  const sources = unionSources(previous.sources || [], [source]);
  const priorDenials = { denial:previous.denial, denialHistory:previous.denialHistory };
  if (canReplace) {
    const history = [...(previous.history || [])];
    if (!history.some(h => h.date === evidenceDate && h.text === record.rationale)) history.push({ date: evidenceDate, text: record.rationale, url:source.url });
    if (previous.tier !== record.tier) {
      delete previous.quote; delete previous.speaker; delete previous.cause;
    }
    Object.assign(previous, record, { id: previous.id, history, evidenceUpdatedAt: evidenceDate });
  } else if (!previous.evidenceUpdatedAt && incomingTime > currentTime) {
    previous.evidenceUpdatedAt = latest(previous);
  }
  if (!canReplace && isNewSource) {
    const entry = { date:evidenceDate, text:source.name + ' published additional coverage.', url:source.url };
    previous.history = [...(previous.history || []), entry];
  }
  preserveDenials(previous, priorDenials, record);
  previous.date = firstDate;
  previous.sources = sources;
  return true;
}

async function bytes(response, limit) {
  const chunks = [];
  let total = 0;
  for await (const chunk of response.body) {
    total += chunk.byteLength;
    if (total > limit) throw Error('Composer response exceeds size limit');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function collect(feedName, token, start, now, fetchImpl) {
  const base = origin + '/v1/feeds/' + encodeURIComponent(feedName);
  async function get(url, limit, firstListing = false) {
    const res = await fetchImpl(url, { headers: { Authorization: 'Bearer ' + token }, redirect: 'error', signal: AbortSignal.timeout(45000) });
    if (firstListing && res.status === 404) return null;
    if (!res.ok || (res.url && new URL(res.url).origin !== origin)) throw Error('Composer request failed (HTTP ' + res.status + ')');
    return bytes(res, limit);
  }
  const files = new Map(), tokens = new Set();
  let pageToken;
  do {
    const u = new URL(base + '/data');
    u.searchParams.set('page_size', '1000');
    u.searchParams.set('updated_after', new Date(start).toISOString());
    u.searchParams.set('updated_before', new Date(now).toISOString());
    if (pageToken) u.searchParams.set('page_token', pageToken);
    const response = await get(u, 8e6, !pageToken);
    if (response === null) return {awaitingSubscription:true};
    const page = JSON.parse(response);
    if (page.feed !== feedName || !Array.isArray(page.data) || typeof page.truncated !== 'boolean') throw Error('Invalid Composer listing');
    for (const f of page.data) {
      if (!clean(f.path, 1024) || !date(f.updated_at, now)) throw Error('Invalid Composer file entry');
      if (!files.has(f.path) || time(files.get(f.path).updated_at) < time(f.updated_at)) files.set(f.path, f);
    }
    pageToken = page.truncated ? clean(page.next_page_token, 4000) : '';
    if (page.truncated && (!pageToken || tokens.has(pageToken))) throw Error('Incomplete Composer pagination');
    tokens.add(pageToken);
  } while (pageToken);
  return { files: [...files.values()].sort((a,b) => time(a.updated_at)-time(b.updated_at) || a.path.localeCompare(b.path)),
    async rows(file) {
      const u = new URL(base + '/download');
      u.searchParams.set('path', file.path);
      const compressed = await get(u, 8e6);
      const body = gunzipSync(compressed, { maxOutputLength: 32e6 }).toString('utf8');
      return body.split(/\r?\n/).filter(s => s.trim()).map(s => JSON.parse(s));
    } };
}

function loadSeed(html) {
  const source = html.match(/<script\b(?=[^>]*\bid\s*=\s*["']snapshot["'])[^>]*>([\s\S]*?)<\/script>/i);
  if (!source) throw Error('Dashboard is missing its embedded snapshot');
  return JSON.parse(source[1]);
}
function check(snapshot, now) {
  if (!snapshot || !date(snapshot.start, now) || !date(snapshot.asOf, now) || !Array.isArray(snapshot.records) ||
      !snapshot.records.every(r => clean(r.id) && clean(r.org) && clean(r.title) && date(r.date, now) && tiers.has(r.tier) &&
        Array.isArray(r.sources))) throw Error('Invalid existing snapshot; preserving it unchanged');
}

export async function publish({ html, output, feedName, token, webKey, fetchImpl = fetch, now = Date.now() }) {
  if (!feedName || !/^[A-Za-z0-9_.-]+$/.test(feedName) || ['.', '..'].includes(feedName)) throw Error('Set a valid STRING_FEED_NAME on the server');
  if (resolve(html) === resolve(output)) throw Error('Use a separate JSON output path');
  const lockPath = output + '.lock', tmp = output + '.' + randomUUID() + '.tmp';
  const lock = await open(lockPath, 'wx').catch(e => { if (e.code === 'EEXIST') throw Error('Another publisher holds the output lock. Clear a leftover lock only after verifying the previous process exited.'); throw e });
  try {
    await lock.writeFile(String(process.pid));
    const seed = loadSeed(await readFile(html, 'utf8')); check(seed, now);
    if (seed.scope!==scope||!seed.records.every(validDenialRecord)) throw Error('A reviewed outage-denial seed is required');
    let prior;
    try { prior = JSON.parse(await readFile(output, 'utf8')); check(prior, now); }
    catch (e) { if (e.code !== 'ENOENT') throw e; }
    // Discard the previous broad desk and its cursor before processing or claiming delivery.
    // This removal is valid even if credentials are missing or a later fetch fails.
    if (prior && (prior.scope!==scope || !prior.records.every(validDenialRecord))) {
      await writeFile(tmp, JSON.stringify(seed)+'\n', {flag:'wx'});
      await rename(tmp, output);
      prior=undefined;
    }
    if (!token) return {status:'awaiting_credential',records:seed.records.length};
    if (prior?.publisherCursor?.feedHash && prior.publisherCursor.feedHash !== hash(feedName)) throw Error('Output belongs to a different feed');
    const snapshot = prior || structuredClone(seed);
    const originalRecords = JSON.stringify(snapshot.records);
    if (prior) for (const r of seed.records) {
      const i = snapshot.records.findIndex(old => old.id === r.id);
      if (i < 0) snapshot.records.push(r);
      else {
        const old = snapshot.records[i];
        if (time(latest(r)) > time(latest(old))) {
          snapshot.records[i] = { ...old, ...r, sources:unionSources(old.sources, r.sources) };
        }
        if (r.sector) snapshot.records[i].sector = r.sector;
        preserveDenials(snapshot.records[i], old, r);
      }
    }
    const watermark = time(prior?.publisherCursor?.lastFileAt);
    const lower = Math.max(time(seed.start), watermark - 2 * day);
    const collection = await collect(feedName, token, lower, now, fetchImpl);
    if (collection.awaitingSubscription) {
      if (watermark) throw Error('The previously published Composer subscription is unavailable; preserving the last edition');
      return { status:'awaiting_subscription', records:snapshot.records.length };
    }
    if (!collection.files.length && !watermark) return {status:'awaiting_first_export', records:snapshot.records.length};
    const trustedDomains = new Set();
    for (const r of seed.records) for (const s of r.sources) {
      if (/\b(?:news|press|wire|reporting)\b/i.test(s.kind)&&publicLink(s.url)) trustedDomains.add(new URL(s.url).hostname.replace(/^www\./,''));
    }
    const sources = new Map(), corrections=[];
    let lastFileAt=watermark,accepted=0;
    for (const f of collection.files) {
      for (const row of await collection.rows(f)) {
        const item=candidate(row,seed.start,now,trustedDomains);
        if (!item) continue;
        const cached=snapshot.records.find(r=>r.id===item.record.id&&key(r.org)===key(item.record.org)&&r.sources.some(s=>s.url===item.source.url&&s.date===item.source.date)&&
          [r.denial,...(r.denialHistory||[])].some(d=>d?.sourceUrl===item.source.url&&d.quote===item.record.quote&&d.speaker===item.record.speaker));
        if (cached) continue;
        if (!sources.has(item.source.url)) sources.set(item.source.url,await readSource(item.source.url,fetchImpl,webKey));
        if (!citedOutage(item,sources.get(item.source.url))) continue;
        if (item.corrected) corrections.push(item);
        else if (merge(snapshot.records,item)) accepted++;
      }
      lastFileAt=Math.max(lastFileAt,time(f.updated_at));
    }
    for (const item of corrections) if(merge(snapshot.records,item)) accepted++;
    if (!snapshot.records.every(validDenialRecord)) throw Error('Invalid outage or missing denial evidence');
    const evidenceChanged = originalRecords !== JSON.stringify(snapshot.records);
    snapshot.start = seed.start;
    const newest = snapshot.records.reduce((t,r) => Math.max(t, time(latest(r)), ...r.sources.map(s => time(s.date))), Math.max(time(seed.asOf), time(snapshot.asOf)));
    if (newest > time(snapshot.asOf)) snapshot.asOf = new Date(newest).toISOString();
    snapshot.publisherCursor = { feedHash: hash(feedName), ...(lastFileAt ? { lastFileAt: new Date(lastFileAt).toISOString() } : {}) };
    snapshot.sync = { ...snapshot.sync, publisher: 'String Composer', checkedAt: new Date(now).toISOString(),
      ...(lastFileAt ? {lastExportAt:new Date(lastFileAt).toISOString()} : {}),
      ...(evidenceChanged ? {publishedAt:new Date(now).toISOString()} : {}),
      statusDetail: lastFileAt ? 'The website checked the subscribed Composer feed. The latest export time records when String wrote a file. Each source carries its own publication date when available.' : 'The website checked the subscribed Composer feed. No retained export has been delivered in the coverage window yet.' };
    const serialized = JSON.stringify(snapshot);
    await writeFile(tmp, serialized + '\n', { flag: 'wx' });
    await rename(tmp, output);
    return { files: collection.files.length, accepted, records: snapshot.records.length, asOf: snapshot.asOf };
  } finally {
    await rm(tmp, { force:true }); await lock.close(); await rm(lockPath, { force:true });
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const [html, output] = process.argv.slice(2);
  if (!html || !output) { console.error('Usage: node scripts/publish-cyber-situation.mjs DASHBOARD.html SNAPSHOT.json'); process.exitCode = 2; }
  else try {
    console.log(JSON.stringify(await publish({ html, output, feedName:process.env.STRING_FEED_NAME, token:process.env.STRING_FEED_BUILDER_KEY,
      webKey:process.env.STRING_WEB_ACCESS_KEY })));
  } catch (e) { console.error(e.message); process.exitCode = 1; }
}
