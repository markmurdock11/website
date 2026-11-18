// Runs public source monitoring and optionally imports a private String Composer feed.
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

const scope = 'outage-monitor-v2';
const socialDomain = /(?:^|\.)(?:x\.com|twitter\.com)$/i;
const knownHandles = new Map([['msft365status','microsoft'],['clamanna','microsoft'],['faa','faa'],['united','united airlines'],['chase','chase'],['nttdocomo','docomo']]);
const words = value => key(value).split(' ').filter(w=>w.length>2&&!['the','and','for','organization','corporation','service','services','group','inc','spokesperson'].includes(w));
const contains = (text,part) => (' '+text+' ').includes(' '+part+' ');
const interruption = /\b(?:outages?|degraded (?:service|performance)|elevated (?:error rates?|errors)|sign[ -]?in failures?|service degradation|power cuts?|ground stop|interruption|disruption|shutdown|unavailable|inaccessible|offline|went down|lost access|could not (?:log in|sign in|access)|unable to (?:log in|sign in|access)|cancelled flights?|flights? (?:stopped|cancelled)|disrupted|suspended (?:operations|service|flights)|service (?:failed|stopped))\b/i;
const hypothetical = /\b(?:outage drill|exercise|simulation|simulated|hypothetical|averted an outage|prevented an outage|no (?:actual |operational )?(?:outage|disruption)|no (?:evidence|indication) of (?:a |any )?(?:broad |widespread )?(?:outage|service disruption)|(?:remained|were) (?:fully )?unaffected)\b/i;
const interruptionOther = /ausfall|störung|\bpanne\b|\bstoring\b|uitval|onderbreking|avería|interrupción|障害|(?:ご)?利用しづらい/iu;
const hasInterruption = text => (interruption.test(text) || interruptionOther.test(text)) && !hypothetical.test(text);
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
  for (const sentence of quote.replace(/[’‘]/g,"'").split(/(?<=[.!?;])/)) {
    if (denyWrongIssue.test(sentence) || /(?:not|n['’]t)\s+(?:yet\s+)?ruled?\s+out/i.test(sentence) || /\?\s*["']?$/.test(sentence)) continue;
    const m=qualified.exec(sentence);
    if (m) {
      if (/\b(?:cyber[ -]?attack|malicious activity)\s+(?:involved|exposed|accessed|compromised|stole|targeted|affected the data)\b/i.test(sentence)) continue;
      const rest=sentence.slice(m.index+m[0].length), target=cyber.exec(rest);
      if (target && /^(?:(?:a|an|at|this|that|the|it|our|of|to|by|in|any|due|for|as|time|present|moment|result|related|linked|caused|was|is|were|being|been|be|there|has|have|involved|involving|indicate|suggest|suggesting|disruption|incident|outage|issue|failure|system|service|potential|possible|coordinated)\s*){0,18}$/.test(rest.slice(0,target.index).trim().toLowerCase())) result ??= 'qualified';
    } else {
      const negative = explicit.test(sentence) ||
        /\b(?:it|this|outage|disruption|issue|incident|interruption)\s+(?:is|was)(?: not|n't)\s+cyber[ -]related\b/i.test(sentence) ||
        /(?:^|[:“"—–-])\s*not (?:an? )?cyber[ -]?attack(?=\s*[,.”"!;]|$)|\bden(?:y|ies|ied) (?:that )?(?:an? )?cyber[ -]?attack (?:caused|was behind|was responsible)/i.test(sentence);
      if (negative) result = /\b(?:think|believe|suspect|apparently|possibly)\b/i.test(sentence) ? (result || 'qualified') : 'explicit';
    }
  }
  return result;
}
const socialSite = /(?:^|\.)(?:x\.com|twitter\.com|reddit\.com|bsky\.app|threads\.(?:net|com)|facebook\.com|tiktok\.com|mastodon\.social)$/i;
function sourceIdentity(source, org, ownsSource) {
  const url = new URL(source.url), host = url.hostname.replace(/^www\./, '');
  const social = socialSite.test(host);
  const handle = socialDomain.test(host) && url.pathname.match(/^\/([\w]+)\/status\/\d+\/?$/i)?.[1];
  const government = /(?:^|\.)gov(?:\.[a-z]{2})?$/.test(host);
  const officialKind = /official|operator|primary|regulator|authority|agency|government|status/i.test(source.kind);
  const brand = key(org), hostParts = host.split('.');
  const initials = brand.split(' ').map(w => w[0]).join('');
  const orgHost = words(org).some(w => hostParts.includes(w)) || (initials.length > 1 && hostParts.includes(initials));
  const original = ownsSource?.(org,source.url) || (officialKind && orgHost) || (handle && knownHandles.get(handle.toLowerCase()) === brand);
  const role = original ? (government ? 'Public authority' : 'Operator') : government ? 'Public authority' : social ? 'Public post' :
    /news|press|wire|journalis|reporting/i.test(source.kind) ? 'News outlet' : 'Published source';
  return {original, role, handle, government};
}
function candidate(row, start, now, ownsSource) {
  if (!row || row.approved === false || row.approved === 'false' || /^(?:rejected|excluded|invalid|discarded)$/i.test(row.review_status)) return;
  const org = clean(row.org || row.organization || row.organisation || row.entity, 150);
  const title = clean(row.title || row.headline, 320);
  const incident = date(row.date || row.incident_date || row.outage_date, now);
  const url = publicLink(row.source_url || row.source?.url || row.url);
  const published = date(row.source_date || row.source?.date || row.published_at || row.publication_date, now);
  const summary = clean(row.summary || row.description || row.impact_note) || title;
  if (!org || !title || !incident || time(incident) < time(start) || !url || !published ||
      published.slice(0,10) < incident.slice(0,10) || row.impact === 'none') return;
  const link = new URL(url);
  if (link.hostname === 'news.google.com' || (socialDomain.test(link.hostname) && !/\/status\/\d+\/?$/.test(link.pathname))) return;
  const name = clean(row.source_name || row.source?.name || row.publisher, 150) || link.hostname.replace(/^www\./,'');
  const kind = clean(row.source_kind || row.source?.kind || row.kind || row.source_type, 60) || (socialSite.test(link.hostname) ? 'Social' : 'Published source');
  const source = {name,kind,url,date:published,...(row.timeBasis==='observed'?{timeBasis:'observed'}:{})};
  const details = [title, summary, clean(row.impact_note)].join(' ');
  if (hypothetical.test(details)) return;
  const record = {org,title,date:incident,summary,impact:impacts.has(row.impact) ? row.impact : 'service',
    impactNote:clean(row.impact_note) || summary, tier:'unresolved'};
  if (clean(row.sector || row.industry,100)) record.sector = clean(row.sector || row.industry,100);
  const id = clean(row.incident_id || row.id,180);
  record.id = /^[\w-]{1,100}$/.test(id) ? id : 'case-'+hash(id || identity(record));
  if (id) record.composerIncidentId = record.id;
  const incomingQuote = clean(row.quote || row.denial_quote || row.denial?.quote || row.source_quote);
  const namedSpeaker = clean(row.speaker || row.denial?.speaker || row.attributed_to,200);
  return {record,source,matchKey:identity(record),incomingQuote,namedSpeaker,sourceIdentity:sourceIdentity(source, org, ownsSource)};
}
function evidenceText(text) {
  return text.normalize('NFKC').replace(/\[([^\]]+)\]\(https?:\/\/[^)]+\)/g, '$1')
    .replace(/[*_]/g,'').replace(/[’‘]/g,"'").replace(/[“”]/g,'"').replace(/\s+/g,' ').trim();
}
const says = /\b(?:said|says|told|stated|according to|statement|spokesperson|confirmed|wrote|posted|announced|reported|ruled out|sagte|erklärte|déclaré|afirmó|verklaarde)\b/i;
const declines = /\b(?:can(?:not|'t)|unable to|declined to|did not|would not|could not)\s+(?:yet\s+)?(?:say|confirm|conclude|claim)(?:\s+that)?[\s'":]*$/i;
const affirmative = /\b(?:confirm(?:ed)?|detect(?:ed)?|attribut(?:ed|e)|caused by|result of|disrupted by|compromised by)\b.{0,70}\b(?:cyber[ -]?attack|ransomware|malicious activity)\b/i;
function citedOutage(item, page) {
  const article = evidenceText(page), search = article.toLowerCase();
  const {record, source, namedSpeaker, sourceIdentity: publisher} = item;
  const brand = words(record.org);
  if (!brand.length) brand.push(key(record.org));
  const mentionsOrg = text => brand.some(w => contains(key(text),w));
  const pieces = article.split(/(?<=[.!?。])\s+|(?<=。)/u);
  const outage = pieces.find(part => part.length < 1800 && hasInterruption(part) && mentionsOrg(part));
  if (!outage && !pieces.some(part => publisher.original && part.length < 1800 && hasInterruption(part))) return;
  const supplied = evidenceText(item.incomingQuote);
  const phrases = [];
  if (supplied.length >= 12 && supplied.length <= 1200) phrases.push(supplied);
  for (const part of pieces) {
    if (part.length > 500 || part.length < 12 || (!denialType(part) && !affirmative.test(part))) continue;
    if (!phrases.some(p => part.includes(p))) phrases.push(part.trim());
  }
  const claims = [], corrections = [];
  for (const phrase of phrases) {
    const target = phrase.toLowerCase(), type = denialType(phrase);
    const confirmation = !type && affirmative.test(phrase) && !/\b(?:not|no|unconfirmed|might|possibly|suspect\w*)\b/i.test(phrase);
    if (!type && !confirmation) continue;
    for (let at = search.indexOf(target); at !== -1; at = search.indexOf(target, at + target.length)) {
      const lead = article.slice(Math.max(0,at-220),at).split(/[.!?]\s+/).at(-1);
      const tail = article.slice(at+target.length,at+target.length+180).split(/[.!?]\s+/)[0];
      const nearby = lead + ' ' + phrase + ' ' + tail;
      const previousSentence = article.slice(Math.max(0,at-450),at-lead.length).trim().split(/(?<=[.!?。])\s+/).at(-1) || '';
      const newSubject = nearby.trim().match(/^(?:Separately,\s*|Meanwhile,\s*)?([A-Z][\w’-]*(?:\s+[A-Z][\w’-]*){0,4})\s+(?:said|reported|announced|confirmed|suffered|experienced|saw|denied)\s+(?:that\s+)?(?:its|their|its own|their own)\s+(?:\w+\s+){0,2}(?:outage|disruption|interruption)/);
      if (newSubject && !mentionsOrg(newSubject[1]) && !/^(?:It|We|They|The (?:company|operator|airline|agency|department|bank))$/i.test(newSubject[1])) continue;
      const attached = hasInterruption(nearby) && mentionsOrg(nearby);
      const continued = hasInterruption(previousSentence) && mentionsOrg(previousSentence) &&
        (mentionsOrg(nearby) || (!/\b(?:[A-Z][\w’-]+'s|[A-Z]{2,}'s)\s/i.test(nearby) && (
          /\b(?:this|that|the|our|its|it)\b/i.test(phrase) || /^[\s"'“”:-]*(?:not a cyber|no (?:evidence|indication))/i.test(phrase))));
      if (!(attached || continued || (publisher.original && hasInterruption(nearby+' '+previousSentence))) || declines.test(lead)) continue;
      const credited = namedSpeaker && says.test(nearby) && words(namedSpeaker).some(w => contains(key(nearby),w));
      const speaker = credited ? namedSpeaker : publisher.government ? source.name :
        publisher.original ? record.org : publisher.handle ? '@'+publisher.handle : source.name;
      const role = credited && key(speaker) === key(record.org) ? 'Operator' :
        credited && key(speaker) !== key(source.name) ? 'Quoted source' : publisher.role;
      const basis = publisher.original || (publisher.handle && !credited) ? 'statement' : 'report';
      if (confirmation) {
        if (publisher.original || (credited && key(speaker) === key(record.org) && publisher.role === 'News outlet'))
          corrections.push({speaker,quote:article.slice(at,at+target.length)});
        continue;
      }
      const quote = article.slice(at,at+target.length);
      claims.push({type,when:source.date,speaker,speakerRole:role,quote,sourceUrl:source.url,sourceName:source.name,basis,quoteKind:'verbatim'});
      break;
    }
  }
  if (claims.length) {
    preserveDenials(record,{denialHistory:claims});
    const d = record.denial;
    Object.assign(record, {speaker:d.speaker,quote:d.quote,rationale:source.name+' published this assessment: “'+d.quote+'”',
      tier:d.type === 'explicit' && publisher.original ? 'ruled-out' : 'unresolved'});
  } else record.verifiedOutageContext = true;
  if (corrections.length) {
    const {speaker,quote} = corrections[0];
    Object.assign(record, {speaker,quote,tier:'confirmed',rationale:quote});
    item.corrected = true;
    if (source.timeBasis !== 'observed') source.officialAssessment = {when:source.date,speaker,type:'confirmed'};
  } else if (!claims.length) {
    record.rationale = source.name + ' documented the service disruption.';
    // No unauthenticated cyber-cause assertion should escape in the feed's free text.
    const unverifiable = /cyber|ransomware|malicious|hack(?:er|ed|ing)?|breach/i;
    if (unverifiable.test(record.title)) record.title = record.org + ' service disruption';
    if (unverifiable.test(record.summary)) record.summary = record.rationale;
    if (unverifiable.test(record.impactNote)) record.impactNote = record.rationale;
  }
  return true;
}
async function readSource(url,fetchImpl,webKey) {
  const headers={'Content-Type':'application/json'};
  if(webKey) headers.Authorization='Bearer '+webKey;
  const response=await fetchImpl('https://request.usestring.ai/v1/fetch',{method:'POST',headers,redirect:'error',signal:AbortSignal.timeout(45000),body:JSON.stringify({url,format:'markdown'})});
  if([401,402,429].includes(response.status)||response.status>=500) throw Error('String Web Access temporarily unavailable (HTTP '+response.status+')');
  if (!response.ok) return '';
  const raw=(await bytes(response,4e6)).toString('utf8');
  if (!(response.headers.get('content-type')||'').includes('application/json')) return raw;
  try {const j=JSON.parse(raw);if(Number(j.statusCode)>=400)return '';return clean(j.markdown||j.data?.markdown||j.content||j.data?.content||(typeof j.data==='string'?j.data:''),4e6)}catch{return ''}
}
function validRecord(record) {
  if (!impacts.has(record.impact) || record.impact === 'none' || !record.sources?.some(s => publicLink(s.url))) return false;
  if (record.denial || record.verifiedOutageDenial) {
    const d = record.denial;
    return record.verifiedOutageDenial === true && ['explicit','qualified'].includes(d?.type) &&
      time(d.when) && clean(d.speaker,200) && clean(d.quote) && publicLink(d.sourceUrl) &&
      record.sources.some(source => publicLink(source.url) === publicLink(d.sourceUrl));
  }
  return record.verifiedOutageContext === true;
}
function preserveDenials(target, ...records) {
  const claims = new Map();
  for (const record of records) {
    for (const d of [...(record.denialHistory || []), record.denial]) {
      if (!d || !['explicit','qualified'].includes(d.type) || !time(d.when)) continue;
      const id = [d.type, publicLink(d.sourceUrl), d.when.slice(0,10), key(d.speaker || ''), key(d.quote || '')].join('|');
      const previous = claims.get(id);
      if (!previous || (d.when.length > previous.when.length)) claims.set(id,d);
    }
  }
  if (!claims.size) return;
  const ordered = [...claims.values()].sort((a,b) => time(a.when)-time(b.when));
  target.denial = ordered.find(d => d.type === 'explicit') || ordered[0];
  target.verifiedOutageDenial = true;
  delete target.verifiedOutageContext;
  if (ordered.length > 1) target.denialHistory = ordered;
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
  const {record,source} = item;
  const sameSource = r => r.sources.some(s => publicLink(s.url) === source.url);
  const previous = records.find(r => r.id === record.id || (record.composerIncidentId && r.composerIncidentId === record.composerIncidentId)) ||
    records.find(r => identity(r) === item.matchKey ||
      (key(r.org) === key(record.org) && r.date.slice(0,10) === record.date.slice(0,10) && sameSource(r)));
  const historyEntry = {date:source.date,text:record.rationale,url:source.url};
  if (!previous) {
    records.push({...record,sources:[source],history:[historyEntry],evidenceUpdatedAt:source.date});
    return true;
  }
  if (key(previous.org) !== key(record.org) || !validRecord(previous)) return false;
  const previousJSON = JSON.stringify(previous);
  const oldClaims = {denial:previous.denial,denialHistory:previous.denialHistory};
  const sources = unionSources(previous.sources,[source]);
  const history = [...(previous.history || [])];
  const existingEntry = history.some(h => h.url === source.url && h.date === source.date && h.text === historyEntry.text);
  if (!existingEntry) history.push(historyEntry);
  const initialDate = time(record.date) < time(previous.date) ? record.date : previous.date;
  const recent = time(source.date) >= time(latest(previous));
  const richer = !!record.denial && !previous.denial;
  const keepAssessment = previous.tier === 'confirmed' && !item.corrected;
  if (!keepAssessment && (item.corrected || richer || (recent && (record.denial || !previous.denial)))) {
    const savedId = previous.id;
    Object.assign(previous,record,{id:savedId});
  }
  if (!previous.composerIncidentId && record.composerIncidentId) previous.composerIncidentId = record.composerIncidentId;
  previous.date = initialDate;
  previous.sources = sources;
  previous.history = history.sort((a,b) => time(a.date)-time(b.date));
  if (recent) previous.evidenceUpdatedAt = source.date;
  preserveDenials(previous,oldClaims,record);
  return previousJSON !== JSON.stringify(previous);
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

async function importComposer({snapshot,seed,feedName,token,fetchImpl,now,readPage,scheduled,ownsSource}) {
  if (!token) return {status:'awaiting_credential'};
  const oldWatermark = time(snapshot.publisherCursor?.lastFileAt);
  const lower = Math.max(time(seed.start), oldWatermark - 2*day);
  const collection = await collect(feedName,token,lower,now,fetchImpl);
  if (collection.awaitingSubscription) {
    if (oldWatermark) throw Error('Composer subscription unavailable');
    return {status:'awaiting_subscription'};
  }
  if (!collection.files.length && !oldWatermark) return {status:'awaiting_first_export'};
  let accepted=0, files=0, watermark=oldWatermark;
  const progress = scheduled ? (snapshot.publisherCursor?.files || {}) : {};
  const commitProgress = () => {
    const recent = Object.fromEntries(Object.entries(progress).filter(([, entry]) => time(entry.version)>=Math.max(time(seed.start),watermark-2*day)));
    snapshot.publisherCursor = {feedHash:hash(feedName),...(watermark?{lastFileAt:new Date(watermark).toISOString()}:{}),
      ...(scheduled?{files:recent}:{})};
    if (watermark) snapshot.sync.lastExportAt = new Date(watermark).toISOString();
  };
  for (const f of collection.files) {
    const id = hash(f.path);
    const checkpoint = scheduled && progress[id]?.version === f.updated_at ? progress[id] : {version:f.updated_at,offset:0};
    if (checkpoint.complete) continue;
    const rows = await collection.rows(f);
    for (let i=checkpoint.offset; i<rows.length; i++) {
      const item = candidate(rows[i],seed.start,now,ownsSource);
      if (item) {
        const cached=snapshot.records.find(r=>r.id===item.record.id&&key(r.org)===key(item.record.org)&&r.sources.some(s=>s.url===item.source.url&&s.date===item.source.date)&&
          [r.denial,...(r.denialHistory||[])].some(d=>d?.sourceUrl===item.source.url&&d.quote===item.incomingQuote&&d.speaker===item.namedSpeaker));
        if (!cached) {
          let page;
          try {page=await readPage(item.source.url);}
          catch (error) {
            if (!scheduled) throw error;
            progress[id] = {...checkpoint,offset:i};
            commitProgress();
            return {status:error.code==='BUDGET'?'budget':'partial',accepted,files};
          }
          if (citedOutage(item,page) && merge(snapshot.records,item)) accepted++;
        }
      }
      checkpoint.offset = i+1;
    }
    files++;
    progress[id] = {...checkpoint,complete:true};
    watermark = Math.max(watermark,time(f.updated_at));
  }
  commitProgress();
  return {status:files?'received':'checked',files,accepted};
}

export function reconcileReviewed(saved, reviewed) {
  const fresher = time(latest(reviewed)) > time(latest(saved));
  const merged = fresher ? {...saved,...reviewed} : {...saved};
  const sourceMap = new Map(saved.sources.map(source => [publicLink(source.url),source]));
  for (const source of reviewed.sources) {
    const url = publicLink(source.url), current = sourceMap.get(url);
    if (!current) { sourceMap.set(url,source); continue; }
    const preferred = time(source.date)>time(current.date) ? {...current,...source} : {...source,...current};
    for (const field of ['publishedAt','officialAssessment','byline','originalPublisher']) {
      if(source[field])preferred[field]=source[field];
    }
    sourceMap.set(url,preferred);
  }
  merged.sources=[...sourceMap.values()];
  const changes = new Map([...(reviewed.changes || []), ...(saved.changes || [])].map(c=>[c.id||JSON.stringify(c),c]));
  if(changes.size)merged.changes=[...changes.values()];
  const history = new Map([...(reviewed.history || []), ...(saved.history || [])].map(h=>[[h.date,h.text,h.url].join('|'),h]));
  if(history.size)merged.history=[...history.values()].sort((a,b)=>time(a.date)-time(b.date));
  if(reviewed.sector)merged.sector=reviewed.sector;
  preserveDenials(merged,saved,reviewed);
  // A source review can carry several different claims, all displayed in history.
  // Keep the already chosen primary claim unless the existing record gains its first one.
  const main=fresher?(reviewed.denial||saved.denial):(saved.denial||reviewed.denial);
  if(main)merged.denial=main;
  return merged;
}

export async function publish({html,output,feedName,token,webKey,fetchImpl=fetch,now=Date.now(),scheduled=false,modules}) {
  if (!feedName || !/^[A-Za-z0-9_.-]+$/.test(feedName) || ['.','..'].includes(feedName)) throw Error('Set a valid STRING_FEED_NAME on the server');
  if (resolve(html)===resolve(output)) throw Error('Use a separate JSON output path');
  const lockPath=output+'.lock', tmp=output+'.'+randomUUID()+'.tmp';
  const lock=await open(lockPath,'wx').catch(e=>{if(e.code==='EEXIST')throw Error('Another publisher holds the output lock');throw e});
  try {
    const seed=loadSeed(await readFile(html,'utf8'));
    check(seed,now);
    if(seed.scope!==scope||!seed.records.every(validRecord))throw Error('A reviewed outage-monitor seed is required');
    let prior;
    try {prior=JSON.parse(await readFile(output,'utf8'));check(prior,now);}
    catch(e){if(e.code!=='ENOENT')throw e;}
    if(!scheduled&&!token)return {status:'awaiting_credential',records:prior?.records.length??seed.records.length};
    if(prior?.publisherCursor?.feedHash&&prior.publisherCursor.feedHash!==hash(feedName))throw Error('Output belongs to a different feed');
    if(prior&&prior.scope!==scope)prior={...seed,records:prior.records.filter(r=>time(r.date)>=time(seed.start)&&validRecord(r))};
    if(prior&&!prior.records.every(validRecord))throw Error('Invalid existing evidence; preserving the last edition');
    let snapshot=prior||structuredClone(seed);
    const originalRecords=JSON.stringify(snapshot.records);
    if(prior)for(const r of seed.records){
      const i=snapshot.records.findIndex(old=>old.id===r.id);
      if(i<0)snapshot.records.push(r);
      else snapshot.records[i]=reconcileReviewed(snapshot.records[i],r);
    }
    const stamp=new Date(now).toISOString();
    // Leave time for writing, committing and deploying the edition before the scheduled job times out.
    if(scheduled){
      const sourceFetch=fetchImpl, deadline=Date.now()+18*60*1000;
      fetchImpl=(url,opts={})=>{
        const left=deadline-Date.now();
        if(left<=0)throw Object.assign(Error('Hourly job time budget reached'),{code:'BUDGET'});
        const timeout=AbortSignal.timeout(left);
        return sourceFetch(url,{...opts,signal:opts.signal?AbortSignal.any([opts.signal,timeout]):timeout});
      };
    }
    const runtime=scheduled?await import('./hourly-outage-monitor.mjs'):null;
    const discovery=scheduled?(modules?.discovery||await import('./discover-industry-outages.mjs')):null;
    const transport=scheduled?runtime.stringTransport({fetchImpl,webKey,now,previous:snapshot.webAccessUsage}):null;
    const sourceCache=new Map();
    const readPage=async url=>{
      const safe=publicLink(url);
      if(!safe)return '';
      if(!sourceCache.has(safe))sourceCache.set(safe,await readSource(safe,transport?.fetchString||fetchImpl,webKey));
      return sourceCache.get(safe);
    };
    const verify=({candidate:row,page})=>{
      const item=candidate(row,seed.start,now,discovery?.ownsWatchlistSource);
      return item&&typeof page==='string'&&citedOutage(item,page)?item:null;
    };
    snapshot.sync={...snapshot.sync,channels:{...snapshot.sync?.channels}};
    const composer=structuredClone(snapshot);
    let composerReads=0;
    const verifyComposerPage=async url=>{
      if(scheduled && !sourceCache.has(url) && composerReads >= (webKey?24:2))throw Object.assign(Error('Composer verification budget reached'),{code:'BUDGET'});
      if(!sourceCache.has(url))composerReads++;
      return readPage(url);
    };
    let result;
    try{
      result=await importComposer({snapshot:composer,seed,feedName,token,now,fetchImpl,scheduled,readPage:verifyComposerPage,ownsSource:discovery?.ownsWatchlistSource});
      if(!scheduled&&!['received','checked'].includes(result.status))return {...result,records:snapshot.records.length};
      snapshot=composer;
    }catch(error){
      if(!scheduled)throw error;
      result={status:error.code==='BUDGET'?'budget':'unavailable',files:0,accepted:0};
    }
    if(scheduled){
      snapshot.sync.channels.composer=runtime.composerChannel(snapshot.sync.channels.composer,stamp,result);
      const follow=modules?.followup||await import('./follow-up-outages.mjs');
      await runtime.supplement({snapshot,now,webKey,transport,readPage,verify,
        runDiscovery:discovery.discoverIndustryOutages,runFollowups:follow.runFollowups,
        accept:(row,page)=>{const i=verify({candidate:row,page});return i?merge(snapshot.records,i):false;}});
      if(follow.reviewedChanges)for(const record of snapshot.records){
        const changes=follow.reviewedChanges(record);
        if(changes.length)record.changes=changes;
      }
      snapshot.webAccessUsage=transport.state;
    }
    if(!snapshot.records.every(validRecord))throw Error('Invalid outage or missing source evidence');
    const evidenceChanged=originalRecords!==JSON.stringify(snapshot.records);
    snapshot.start=seed.start;
    const newest=snapshot.records.reduce((t,r)=>Math.max(t,time(latest(r)),...r.sources.map(s=>time(s.date)),...(r.changes||[]).map(c=>time(c.detectedAt))),Math.max(time(seed.asOf),time(snapshot.asOf)));
    if(newest>time(snapshot.asOf))snapshot.asOf=new Date(newest).toISOString();
    if(['received','checked','awaiting_first_export','awaiting_subscription'].includes(result.status))snapshot.sync.checkedAt=stamp;
    if(evidenceChanged)snapshot.sync.publishedAt=stamp;
    const exported=!!snapshot.sync.lastExportAt;
    snapshot.sync.publisher=exported?'String Composer and Web Access':(snapshot.sync.channels.watchlists?.lastSuccessAt||snapshot.sync.channels.followups?.lastSuccessAt)?'String Web Access':'Source-reviewed edition';
    snapshot.sync.statusDetail=exported?'The website has received a private Composer export. The public-source checks are tracked separately.':
      'The website monitors public sources with String Web Access. The private Composer import has its own delivery status.';
    if(scheduled)snapshot.sync.deliveryNote=exported?'A Composer export has been received.':'The latest private Composer export has not been received.';
    await writeFile(tmp,JSON.stringify(snapshot)+'\n',{flag:'wx'});await rename(tmp,output);
    return {...result,records:snapshot.records.length,asOf:snapshot.asOf,...(scheduled?{channels:snapshot.sync.channels}:{})};
  }finally{await rm(tmp,{force:true});await lock.close();await rm(lockPath,{force:true});}
}

if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
  const [html,output]=process.argv.slice(2);
  if(!html||!output){console.error('Usage: node scripts/publish-cyber-situation.mjs DASHBOARD.html SNAPSHOT.json');process.exitCode=2;}
  else try{
    const result=await publish({html,output,feedName:process.env.STRING_FEED_NAME||'news.cyber_evidence_wire',token:process.env.STRING_FEED_BUILDER_KEY,
      webKey:process.env.STRING_WEB_ACCESS_KEY,scheduled:true});
    console.log(JSON.stringify(result));
    for(const [name,detail] of Object.entries(result.channels||{})){
      if(['awaiting_credential','budget','unavailable','partial'].includes(detail.status))console.warn('::warning::String '+name+' status: '+detail.status);
    }
  }catch(error){console.error(error.message);process.exitCode=1;}
}
