// The daily allowance is shared by all anonymous String requests on the site.
const publicOrigin = 'https://request.usestring.ai';
const hourMs = 3600000;
const dayMs = 24 * hourMs;

export function stringTransport({fetchImpl, webKey, now, previous = {}}) {
  const window = Math.floor(now / (webKey ? hourMs : dayMs));
  const mode = webKey ? 'authenticated' : 'public';
  const state = previous.window === window && previous.mode === mode
    ? {...previous} : {mode, window, requests:0, credits:0};
  const maxRequests = webKey ? 36 : 45, maxCredits = 90;
  const fetchString = async (url, options) => {
    const target = new URL(url);
    if (target.origin !== publicOrigin) throw Error('Unexpected String Web Access destination');
    const isSearch = target.pathname === '/v1/search';
    const isFetch = target.pathname === '/v1/fetch';
    if (!webKey && !isSearch && !isFetch) throw Error('String site integration requires a Web Access key');
    const cost = isSearch || !isFetch || JSON.parse(options.body || '{}').executeJS ? 5 : 1;
    if (state.requests >= maxRequests || state.credits + cost > maxCredits || state.retryAfter > now) {
      throw Object.assign(Error('String request budget reached'), {code:'BUDGET'});
    }
    state.requests++;
    state.credits += cost;
    const response = await fetchImpl(url, options);
    if (response.status === 429) {
      const seconds = Number(response.headers.get('retry-after'));
      state.retryAfter = now + (seconds > 0 && Number.isFinite(seconds) ? Math.min(seconds,86400)*1000 : hourMs);
    }
    return response;
  };
  return {fetchString, state};
}

export async function searchForFollowup(query, {fetchString, webKey}) {
  const headers = {'Content-Type':'application/json'};
  if (webKey) headers.Authorization = 'Bearer '+webKey;
  const res = await fetchString(publicOrigin+'/v1/search', {method:'POST',headers,redirect:'error',
    signal:AbortSignal.timeout(45000),body:JSON.stringify({query,dateRange:'week'})});
  if (!res.ok) throw Error('String search returned HTTP '+res.status);
  const body = await res.json();
  const rows = body.results || body.data?.results;
  if (!Array.isArray(rows)) throw Error('String search returned an unexpected response');
  return rows.slice(0,12).map(r => ({url:r.url,title:r.title,snippet:r.snippet,
    // Search result date strings can have only day-level precision. The follow-up
    // module preserves this precision and checks the article before publication.
    date:r.publishedAt || r.date || r.timestamp || '', sourceName:r.source || r.publisher || ''}));
}

function channel(previous, now, status, success, extra) {
  return {...(previous?.lastSuccessAt ? {lastSuccessAt:previous.lastSuccessAt} : {}),
    lastAttemptAt:now, status, ...(success ? {lastSuccessAt:now} : {}), ...extra};
}
export function composerChannel(previous, now, result) {
  return channel(previous,now,result.status, ['received','checked','awaiting_first_export'].includes(result.status),
    {files:result.files || 0, accepted:result.accepted || 0});
}
export function failedChannel(previous, now, error) {
  return channel(previous,now,error?.code==='BUDGET'?'budget':'unavailable',false,{});
}

export function monitorHealth(snapshot, now, webKey) {
  const usage=snapshot.webAccessUsage||{};
  const publicWindow=Math.floor(now/dayMs);
  const used=!webKey && usage.mode==='public' && usage.window===publicWindow ? Number(usage.credits)||0 : 0;
  const channels=snapshot.sync?.channels||{};
  const successes=[channels.watchlists?.lastSuccessAt,channels.followups?.lastSuccessAt].filter(t=>Number.isFinite(Date.parse(t)));
  const attempts=[channels.watchlists?.lastAttemptAt,channels.followups?.lastAttemptAt].filter(t=>Number.isFinite(Date.parse(t)));
  const exhausted=!webKey && (used>=90 || (usage.window===publicWindow && (usage.requests>=45 || usage.retryAfter>now)));
  const degraded=[channels.watchlists,channels.followups].some(c=>['budget','unavailable','deferred'].includes(c?.status));
  return {status:exhausted?'paused':degraded?'degraded':webKey?'configured':'limited',mode:webKey?'authenticated':'public',
    webAccessKeyConfigured:Boolean(webKey),...(attempts.length?{lastAttemptAt:attempts.sort((a,b)=>Date.parse(b)-Date.parse(a))[0]}:{}),
    ...(successes.length?{lastSuccessfulCheckAt:successes.sort((a,b)=>Date.parse(b)-Date.parse(a))[0]}:{}),
    ...(!webKey?{dailyCreditsUsed:used,dailyCreditLimit:90}:{}),
    detail:exhausted?'Automatic source checks are paused because the public allowance is exhausted or rate-limited.':
      degraded?'Some automatic source checks could not complete.':webKey?'Authenticated source checks are configured; individual checks can still be delayed or unavailable.':
      'Automatic checks use a limited public allowance; authenticated String Web Access is not configured.'};
}

export async function supplement({snapshot, now, webKey, transport, runDiscovery, runFollowups, accept, verify, readPage}) {
  const stamp = new Date(now).toISOString();
  const channels = snapshot.sync.channels;
  try {
    const {leads,state,diagnostics} = await runDiscovery({now,start:snapshot.start,webKey,fetchImpl:transport.fetchString,
      records:snapshot.records,state:snapshot.watchlistState});
    const accepted = leads.reduce((count, lead) => count + Number(accept(lead.row, lead.page)), 0);
    snapshot.watchlistState = state;
    const attempted = diagnostics.channels.filter(c=>!['requires_key','already_checked','not_due'].includes(c.status));
    const good = attempted.filter(c=>c.status==='ok' || (c.status==='partial' && c.candidates>0));
    const status = attempted.length === 0 ? 'not_due' : attempted.every(c=>c.status==='ok') ? 'checked' :
      good.length ? 'partial' : attempted.some(c=>c.status==='budget') ? 'budget' : 'unavailable';
    channels.watchlists = channel(channels.watchlists,stamp,status,good.length>0,{accepted, ...diagnostics});
  } catch (error) {
    channels.watchlists = failedChannel(channels.watchlists,stamp,error);
  }
  try {
    // Reserve public credits for cross-industry discovery. Authenticated jobs
    // can search every run; public followups inspect one known page every 3h.
    const hour = Math.floor(now / hourMs);
    if(!webKey && (hour % 3 !== 1 || snapshot.sync.channels.followups?.lastAttemptAt?.slice(0,13)===stamp.slice(0,13))) return;
    const search = webKey ? query => searchForFollowup(query,{fetchString:transport.fetchString,webKey}) : undefined;
    const records = structuredClone(snapshot.records);
    const result = await runFollowups({records,state:snapshot.followupState,now,fetchPage:readPage,search,verify,limit:webKey?3:1});
    snapshot.followupState = result.state;
    snapshot.records = records;
    const s = result.stats;
    const completed = Number(s.checked || 0);
    const failed = Number(s.failed || s.deferred || s.rescheduled || 0);
    const status = completed ? (failed ? 'partial' : 'checked') : failed ? 'deferred' : 'not_due';
    channels.followups = channel(channels.followups,stamp,status,completed>0,{...s,updates:result.updates.length});
  } catch (error) {
    channels.followups = failedChannel(channels.followups,stamp,error);
  }
}

