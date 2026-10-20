/* Public essays and published video Notes, served from Kram.bio. */
(() => {
  'use strict';
  const frame = document.getElementById('knm-preview');
  if (!frame) return;
  let doc;
  let reader;
  let catalogue;
  let renderedSlug;
  let requestNumber = 0;
  let activeFilter = 'personal';
  let search = '';
  let externalWriting = [];
  let selectedIdea = 'x-second-brain';
  let ideaHistory = [];
  let archiveItems = [];
  const cache = new Map();
  const categories = [
    { id:'personal', label:'Personal essays' },
    { id:'work', label:'Work examples' },
    { id:'video', label:'Videos' }
  ];
  // An editorial reading order: complete pieces first, rather than newest first.
  const readingOrder = [
    'crete-friendship-and-what-technology',
    'ireland-and-the-emma-i-never-could',
    'two-weeks-in-liberia-venture-donations',
    'serifos-and-such',
    'in-croatia-there-is-a-town-called',
    'a-place-for-me-to-be-me',
    'kurate-1-the-website-of-patrick-collison',
    'kurate-2-grantland-2011-2015',
    'studying-tech-history-and-sci-fi',
    'kurate-3-vibecession',
    'kurate-4-internal-tech-emails',
    'an-essay-from-the-present-future',
    'da-optimistic-space-time-continuum',
    'krams-declassified-travel-survival',
    'unreality-reigns',
    '25-and-suchhhhh',
    'a-brotherly-biopic',
    'the-fish-stablecoins-are-much-smaller',
    'becoming-legible-plus-7-things-im',
    'q1-2024',
    'bitcoin-and-crypto',
    'layerzero-v2-deep-dive',
    'the-default-is-many-chains',
    'words-are-power-words-are-code',
    'the-great-marketing-divide-humans',
    'how-to-actually-get-attentionwhen',
    'so-you-raised-millions-why-should',
    'near-singularity-marketing-advice',
    'jumper',
    'crosschain-risk-framework',
    'how-to-choose-a-cryptocurrency',
    'video-361129384',
    'video-359973771',
    'video-362571491',
    'video-361712128',
    'video-359173007'
  ];
  readingOrder.splice(6, 0, 'x-second-brain', 'x-social-network-features');
  readingOrder.push('x-tech-founder-beer-matrix');
  const rank = new Map(readingOrder.map((slug, position) => [slug, position]));
  const displayTitles = {
    'kurate-4-internal-tech-emails':'Internal Tech Emails',
    'kurate-3-vibecession':'Vibecession',
    'kurate-2-grantland-2011-2015':'Grantland (2011–2015)',
    'kurate-1-the-website-of-patrick-collison':'The Website of Patrick Collison',
    'video-362571491':'Internal Tech Emails',
    'video-361712128':'Vibecession',
    'video-361129384':'Grantland (2011–2015)',
    'video-359973771':'The Website of Patrick Collison',
    'video-359173007':'Introducing the Series'
  };
  const desktopNames = {
    'crete-friendship-and-what-technology':'Crete',
    'ireland-and-the-emma-i-never-could':'Ireland',
    'two-weeks-in-liberia-venture-donations':'Liberia',
    'serifos-and-such':'Serifos',
    'in-croatia-there-is-a-town-called':'Bjelovar',
    'a-place-for-me-to-be-me':'A Place for Me',
    'x-second-brain':'A Better Second Brain',
    'x-social-network-features':'Four Features for Social Networks',
    'kurate-1-the-website-of-patrick-collison':'Patrick Collison’s Website',
    'kurate-2-grantland-2011-2015':'Grantland',
    'studying-tech-history-and-sci-fi':'Tech History & Sci-Fi',
    'kurate-3-vibecession':'Vibecession',
    'kurate-4-internal-tech-emails':'Internal Tech Emails',
    'an-essay-from-the-present-future':'The Present Future',
    'da-optimistic-space-time-continuum':'The Optimistic Space-Time Continuum',
    'krams-declassified-travel-survival':'Travel Survival Guide',
    'unreality-reigns':'Unreality Reigns',
    '25-and-suchhhhh':'25 and Such',
    'a-brotherly-biopic':'A Brotherly Biopic',
    'the-fish-stablecoins-are-much-smaller':'Stablecoins & Vaults',
    'becoming-legible-plus-7-things-im':'Becoming Legible',
    'q1-2024':'Q1 2024',
    'bitcoin-and-crypto':'Bitcoin & Crypto',
    'layerzero-v2-deep-dive':'LayerZero V2',
    'the-default-is-many-chains':'Many Chains',
    'words-are-power-words-are-code':'Words as Power & Code',
    'the-great-marketing-divide-humans':'Humans & Bots',
    'how-to-actually-get-attentionwhen':'Getting Attention',
    'so-you-raised-millions-why-should':'Announcing a Raise',
    'near-singularity-marketing-advice':'Near-Singularity Marketing',
    'jumper':'Jumper',
    'crosschain-risk-framework':'Crosschain Risk',
    'how-to-choose-a-cryptocurrency':'Choosing a Cryptocurrency',
    'x-tech-founder-beer-matrix':'The Tech Founder Beer Matrix',
    'video-361129384':'Grantland',
    'video-359973771':'Patrick Collison’s Website',
    'video-362571491':'Internal Tech Emails',
    'video-361712128':'Vibecession',
    'video-359173007':'Introducing the Series'
  };
  const topicNames = { friendship:'friendship', attention:'attention', place:'place', internet:'the internet', writing:'writing', culture:'culture', technology:'technology', futures:'the future', money:'money', infrastructure:'infrastructure', marketing:'marketing' };
  const topicMap = {
    'crete-friendship-and-what-technology':['friendship','attention','technology'],
    'ireland-and-the-emma-i-never-could':['friendship','place','attention'],
    'two-weeks-in-liberia-venture-donations':['place','infrastructure','money'],
    'serifos-and-such':['attention','friendship','place'],
    'in-croatia-there-is-a-town-called':['friendship','place'],
    'a-place-for-me-to-be-me':['internet','writing','attention'],
    'kurate-1-the-website-of-patrick-collison':['internet','writing','technology'],
    'kurate-2-grantland-2011-2015':['culture','writing','internet'],
    'studying-tech-history-and-sci-fi':['technology','futures','culture'],
    'kurate-3-vibecession':['money','culture','writing'],
    'kurate-4-internal-tech-emails':['writing','technology','culture'],
    'an-essay-from-the-present-future':['technology','culture','futures'],
    'da-optimistic-space-time-continuum':['futures','technology'],
    'krams-declassified-travel-survival':['place','technology'],
    'unreality-reigns':['culture','writing'],
    '25-and-suchhhhh':['place','friendship','culture'],
    'a-brotherly-biopic':['friendship','money','culture'],
    'the-fish-stablecoins-are-much-smaller':['money','infrastructure'],
    'becoming-legible-plus-7-things-im':['writing','internet','culture'],
    'q1-2024':['culture','writing'],
    'bitcoin-and-crypto':['money','technology','futures'],
    'layerzero-v2-deep-dive':['infrastructure','technology'],
    'the-default-is-many-chains':['infrastructure','technology','money'],
    'words-are-power-words-are-code':['writing','marketing','attention'],
    'the-great-marketing-divide-humans':['marketing','technology','attention'],
    'how-to-actually-get-attentionwhen':['attention','marketing','writing'],
    'so-you-raised-millions-why-should':['marketing','money','writing'],
    'near-singularity-marketing-advice':['marketing','futures','technology'],
    'jumper':['money','infrastructure','technology'],
    'crosschain-risk-framework':['infrastructure','technology','money'],
    'how-to-choose-a-cryptocurrency':['money','technology'],
    'video-361129384':['culture','writing','internet'],
    'video-359973771':['internet','writing','technology'],
    'video-362571491':['writing','technology','culture'],
    'video-361712128':['money','culture','writing'],
    'video-359173007':['culture','internet','writing'],
    'x-second-brain':['internet','writing','technology'],
    'x-social-network-features':['internet','attention','technology'],
    'x-tech-founder-beer-matrix':['culture','marketing','internet']
  };
  // Explicit first connections make each trail a reading choice, not random motion.
  const preferredConnections = {
    'crete-friendship-and-what-technology':['serifos-and-such','ireland-and-the-emma-i-never-could','studying-tech-history-and-sci-fi'],
    'ireland-and-the-emma-i-never-could':['in-croatia-there-is-a-town-called','crete-friendship-and-what-technology','serifos-and-such'],
    'layerzero-v2-deep-dive':['the-default-is-many-chains','crosschain-risk-framework','the-fish-stablecoins-are-much-smaller'],
    'words-are-power-words-are-code':['kurate-4-internal-tech-emails','how-to-actually-get-attentionwhen','a-place-for-me-to-be-me'],
    'kurate-2-grantland-2011-2015':['video-361129384','kurate-1-the-website-of-patrick-collison','q1-2024'],
    'video-361129384':['kurate-2-grantland-2011-2015','video-359973771','words-are-power-words-are-code'],
    'x-second-brain':['kurate-1-the-website-of-patrick-collison','x-social-network-features','a-place-for-me-to-be-me'],
    'x-social-network-features':['x-second-brain','how-to-actually-get-attentionwhen','kurate-1-the-website-of-patrick-collison']
  };
  // Verified public social clips are added here alongside the existing work.
  const socialClips = [
    { slug:'x-second-brain', title:'Someone Needs to Build a Better Second Brain', subtitle:'A library for humans to browse and LLMs to draw on.', category:'personal', kind:'essay', publisher:'X essay', url:'https://x.com/kramnotmark/status/2107911560899285441', external:true, cover:'/archive-library-v1.jpg' },
    { slug:'x-social-network-features', title:'Four Features I Want Social Networks to Build', category:'personal', kind:'essay', publisher:'X essay', url:'https://x.com/kramnotmark/status/2107503299079372894', external:true },
    { slug:'x-tech-founder-beer-matrix', title:'The Tech Founder Beer Matrix', category:'work', kind:'post', publisher:'2.7M views on X', url:'https://x.com/kramnotmark/status/2109925155397149145', external:true, viral:true }
  ];
  const escape = value => String(value || '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
  const titleFor = post => displayTitles[post.slug] || post.title.replace(/^(?:KURATE|KOMPLEX)\s*(?:#?\d+)?\s*[–—:\-]\s*/i, '').trim();
  const topicsFor = post => topicMap[post.slug] || (post.category === 'work' ? ['marketing','internet'] : ['culture','writing']);
  const labelFor = post => post.kind === 'video' ? duration(post.duration) : post.publisher || (['From the Archive','KURATE','Komplex'].includes(post.series) ? '' : post.series);
  const linkAttributes = post => `href="${post.external ? escape(post.url) : postURL(post.slug)}"${post.external ? ' target="_blank" rel="noopener"' : ` data-native-post="${post.slug}"`}`;
  const date = value => new Date(value).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric', timeZone:'UTC' });
  const duration = seconds => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  const currentSlug = () => {
    const fromPath = location.pathname.match(/\/writing-([a-z0-9-]+)\.html$/)?.[1];
    const fromQuery = new URL(location.href).searchParams.get('post');
    return fromPath || (/^[a-z0-9-]+$/.test(fromQuery || '') ? fromQuery : null);
  };
  const postURL = slug => `/writing-${slug}.html?era=${document.documentElement.dataset.era || 'signal'}`;
  const loadCatalogue = () => catalogue || (catalogue = fetch('/publication-index.json').then(response => {
    if (!response.ok) throw new Error('The archive could not load.');
    return response.json();
  }));

  function refreshLinks() {
    if (!doc) return;
    doc.querySelectorAll('a[data-native-post]').forEach(link => { link.href = postURL(link.dataset.nativePost); });
  }

  function stopVideo() {
    if (!reader) return;
    reader.querySelectorAll('video').forEach(video => { video.pause(); });
  }

  function setTitle(title) {
    document.title = `${title} — Kram.bio`;
    if (doc) doc.title = document.title;
  }

  async function showPost(slug) {
    if (!reader || !slug) return;
    if (renderedSlug === slug) {
      const post = cache.get(slug);
      if (post) setTitle(titleFor(post));
      return;
    }
    const request = ++requestNumber;
    renderedSlug = null;
    stopVideo();
    reader.setAttribute('aria-busy', 'true');
    reader.innerHTML = '<a href="/#writing" data-site-page="writing">Back to archive</a><p class="native-reader-body" role="status">Loading…</p>';
    try {
      const index = await loadCatalogue();
      const item = index.posts.find(post => post.slug === slug);
      if (!item) throw new Error('This page is not in the archive.');
      let post = cache.get(slug);
      if (!post) {
        const response = await fetch(`${item.data}?v=20261020c`);
        if (!response.ok) throw new Error('This page could not load.');
        post = await response.json();
        cache.set(slug, post);
      }
      if (request !== requestNumber || currentSlug() !== slug) return;
      const related = post.relatedVideo ? index.posts.find(item => item.slug === post.relatedVideo) : null;
      reader.innerHTML = `
        <a href="/#writing" data-site-page="writing">Back to archive</a>
        <header class="native-reader-head"><span class="native-post-kind">${post.kind === 'video' ? 'VIDEO' : (post.series === 'Kinetic' ? 'KINETIC' : 'ESSAY')}</span><time datetime="${escape(post.date)}">${date(post.date)}</time><h1>${escape(titleFor(post))}</h1>${post.subtitle ? `<p>${escape(post.subtitle)}</p>` : ''}${related ? `<a class="native-watch-link" href="${postURL(related.slug)}" data-native-post="${related.slug}">Watch the video · ${duration(related.duration)}</a>` : ''}</header>
        ${post.video ? `<figure class="native-video"><video controls playsinline preload="metadata" poster="${escape(post.video.poster)}" src="${escape(post.video.src)}" width="${post.video.width}" height="${post.video.height}" aria-label="${escape(post.title)}"><a href="${escape(post.video.src)}">Play video</a></video></figure>` : ''}
        <article class="native-reader-body">${post.html}</article>
        <footer class="native-reader-source"><a href="${escape(post.source)}" target="_blank" rel="noopener">Originally published on ${post.kind === 'video' ? 'Substack Notes' : 'Kram Not Mark'}</a><a href="/#writing" data-site-page="writing">Back to archive</a></footer>`;
      if (post.video) reader.querySelector('.native-video').style.setProperty('--native-video-ratio', `${post.video.width} / ${post.video.height}`);
      renderedSlug = slug;
      refreshLinks();
      setTitle(titleFor(post));
    } catch (error) {
      if (request !== requestNumber) return;
      reader.innerHTML = `<a href="/#writing" data-site-page="writing">Back to archive</a><div class="native-reader-body"><h1>This page could not load.</h1><p>Return to the archive or try this page again.</p><a href="${escape(location.href)}" target="_top">Try again</a></div>`;
    } finally {
      if (request === requestNumber) reader.removeAttribute('aria-busy');
    }
  }

  function compactRow(post) {
    const label = labelFor(post);
    return `<article class="native-post-row${post.kind === 'video' ? ' native-post-row-video' : ''}"><a ${linkAttributes(post)}><div class="native-post-info"><h3>${escape(titleFor(post))}</h3>${label ? `<p class="native-post-meta">${escape(label)}</p>` : ''}</div>${post.cover ? `<figure class="native-post-cover"><img src="${escape(post.cover)}" alt="" width="300" height="200" loading="lazy" decoding="async"></figure>` : ''}</a></article>`;
  }

  function fileLink(post) {
    const extension = post.kind === 'video' ? 'mp4' : post.kind === 'post' ? 'url' : post.external ? 'link' : 'txt';
    const caption = desktopNames[post.slug] || titleFor(post);
    const accessibleTitle = caption === titleFor(post) ? caption : `${caption}: ${titleFor(post)}`;
    return `<a class="native-file" ${linkAttributes(post)} title="${escape(titleFor(post))}" aria-label="${escape(accessibleTitle)}"><span class="native-file-icon native-file-icon-${extension}" aria-hidden="true"><span>${extension}</span></span><span class="native-file-title">${escape(caption)}</span>${post.kind === 'video' ? `<span class="native-file-size">${duration(post.duration)}</span>` : ''}</a>`;
  }

  function groupedResults(posts, render, isSearch, files = false) {
    return categories.filter(category => isSearch || category.id === activeFilter).map(category => {
      const entries = posts.filter(post => post.category === category.id);
      if (!entries.length) return '';
      const ordinary = entries.filter(post => !post.viral);
      const viral = entries.filter(post => post.viral);
      return `<section class="native-category" aria-labelledby="native-category-${category.id}"><h2 id="native-category-${category.id}"${isSearch ? '' : ' class="kram-sr-only"'}>${category.label}</h2><div${files ? ' class="native-file-grid"' : ''}>${ordinary.map(render).join('')}</div>${viral.length ? `<section class="native-viral" aria-label="Viral posts"><h3>Viral posts</h3><div${files ? ' class="native-file-grid"' : ''}>${viral.map(render).join('')}</div></section>` : ''}</section>`;
    }).join('');
  }

  function connectionsFor(post, items) {
    const primaryTopics = topicsFor(post);
    const preferred = preferredConnections[post.slug] || [];
    return items.filter(item => item.slug !== post.slug).map(item => {
      const shared = primaryTopics.filter(topic => topicsFor(item).includes(topic));
      const priority = preferred.indexOf(item.slug);
      return { item, shared, score:priority < 0 ? shared.length * 10 : 100 - priority };
    }).filter(connection => connection.shared.length).sort((a, b) => b.score - a.score).slice(0, 3);
  }

  function ideaMap(posts, allItems) {
    const focus = posts.find(post => post.slug === selectedIdea) || posts[0];
    selectedIdea = focus.slug;
    const connections = connectionsFor(focus, allItems);
    const image = focus.cover || (focus.category === 'work' ? '/work-bridge-v1.jpg' : '/archive-library-v1.jpg');
    const action = focus.kind === 'video' ? 'Watch video' : focus.kind === 'post' ? 'Open post' : 'Read essay';
    const category = categories.find(category => category.id === activeFilter);
    const indexButton = post => `<button type="button" data-idea-select="${post.slug}" aria-pressed="${post.slug === focus.slug}">${escape(titleFor(post))}${post.kind === 'video' ? `<span>${duration(post.duration)}</span>` : ''}</button>`;
    const ordinary = posts.filter(post => !post.viral);
    const viral = posts.filter(post => post.viral);
    return `<div class="native-idea-map">
      <svg class="native-idea-paths" viewBox="0 0 1000 500" preserveAspectRatio="none" aria-hidden="true"><path d="M530 250 C620 250 615 90 715 90"/><path d="M530 250 L715 250"/><path d="M530 250 C620 250 615 410 715 410"/></svg>
      <article class="native-idea-focus">${ideaHistory.length ? '<button type="button" class="native-idea-previous" data-idea-back>Previous idea</button>' : ''}<p class="native-idea-topics">${topicsFor(focus).map(topic => escape(topicNames[topic])).join(' · ')}</p><h3 tabindex="-1" data-idea-focus-title>${escape(titleFor(focus))}</h3>${focus.subtitle || focus.viral ? `<p class="native-idea-excerpt">${escape(focus.subtitle || focus.publisher)}</p>` : ''}<a class="native-idea-open" ${linkAttributes(focus)}>${action}${focus.kind === 'video' ? ` · ${duration(focus.duration)}` : ''}</a><figure><img src="${escape(image)}" alt="" width="720" height="400" loading="lazy" decoding="async"></figure></article>
      <nav class="native-idea-connections" aria-label="Connected ideas"><h4 class="native-connections-heading">Connected ideas</h4>${connections.map(({ item, shared }) => `<button type="button" data-idea-select="${item.slug}" aria-label="Explore ${escape(titleFor(item))}${item.kind === 'video' ? ', video' : ''}"><span class="native-connection-topic">${escape(topicNames[shared[0]])}${item.kind === 'video' ? ' · video' : ''}</span><span class="native-connection-title">${escape(titleFor(item))}</span></button>`).join('')}</nav>
    </div><details class="native-idea-index"><summary>All ${category.label.toLowerCase()} <span>${posts.length}</span></summary><div class="native-idea-index-list">${ordinary.map(indexButton).join('')}${viral.length ? `<h4>Viral posts</h4>${viral.map(indexButton).join('')}` : ''}</div></details>`;
  }

  async function renderArchive() {
    const index = await loadCatalogue();
    if (!doc) return;
    const archive = doc.querySelector('.native-archive');
    const list = doc.querySelector('.native-post-list');
    const era = doc.documentElement.dataset.era || document.documentElement.dataset.era || 'signal';
    archive.dataset.presentation = era;
    archiveItems = index.posts.map(post => ({
      ...post,
      category:post.kind === 'video' ? 'video' : post.series?.toLowerCase() === 'komplex' ? 'work' : 'personal'
    })).concat(externalWriting, socialClips).sort((a, b) => (rank.get(a.slug) ?? 100) - (rank.get(b.slug) ?? 100));
    const query = search.trim().toLocaleLowerCase();
    const filtered = archiveItems.filter(post => query
      ? `${post.title} ${post.subtitle || ''} ${post.series || ''} ${post.publisher || ''} ${topicsFor(post).map(topic => topicNames[topic]).join(' ')}`.toLocaleLowerCase().includes(query)
      : post.category === activeFilter);
    if (!filtered.length) list.innerHTML = '<p class="native-empty">No matches. Try another title, topic, or series.</p>';
    else if (era === 'desktop') list.innerHTML = `<div class="native-folder-path"><span>My documents / ${query ? 'Search results' : categories.find(category => category.id === activeFilter).label}</span><span>${filtered.length} files</span></div>${groupedResults(filtered, fileLink, query, true)}`;
    else if (era === 'signal' && !query) list.innerHTML = ideaMap(filtered, archiveItems);
    else list.innerHTML = groupedResults(filtered, compactRow, query);
    doc.querySelector('.native-result-count').textContent = query ? `${filtered.length} ${filtered.length === 1 ? 'match' : 'matches'} across the archive` : `${filtered.length} ${categories.find(category => category.id === activeFilter).label.toLowerCase()}, in selected reading order${era === 'signal' ? `. Exploring ${titleFor(archiveItems.find(post => post.slug === selectedIdea))}.` : ''}`;
    doc.querySelectorAll('[data-native-filter]').forEach(button => {
      const category = categories.find(category => category.id === button.dataset.nativeFilter);
      const count = archiveItems.filter(post => post.category === category.id).length;
      button.setAttribute('aria-pressed', String(!query && category.id === activeFilter));
      button.innerHTML = `<span class="native-folder-icon" aria-hidden="true"></span><span>${category.label}</span><span class="native-filter-count">${count}</span>`;
    });
  }

  function exploreIdea(slug, remember = true) {
    const target = archiveItems.find(post => post.slug === slug);
    if (!target) return;
    if (remember && selectedIdea && selectedIdea !== target.slug) ideaHistory.push(selectedIdea);
    selectedIdea = target.slug;
    activeFilter = target.category;
    return renderArchive().then(() => { doc.querySelector('[data-idea-focus-title]')?.focus(); });
  }

  function mount() {
    const nextDoc = frame.contentDocument;
    if (!nextDoc?.querySelector('.kram-site') || nextDoc.querySelector('.native-archive')) return;
    doc = nextDoc;
    const styles = doc.createElement('link');
    styles.rel = 'stylesheet';
    styles.href = '/native-content.css?v=20261020c';
    styles.dataset.keepEnabled = 'true';
    styles.dataset.nativeStyles = 'true';
    doc.head.appendChild(styles);
    const writing = doc.querySelector('[data-site-view="writing"]');
    const archive = doc.createElement('section');
    archive.className = 'native-archive';
    archive.setAttribute('aria-label', 'Writing archive');
    archive.innerHTML = `<div class="native-archive-controls"><nav class="native-filter" aria-label="Archive categories">${categories.map(category => `<button type="button" data-native-filter="${category.id}" aria-pressed="${category.id === activeFilter}" aria-controls="native-archive-results">${category.label}</button>`).join('')}</nav><label class="native-search"><span class="kram-sr-only">Search all writing and videos</span><input type="search" placeholder="Search all writing" aria-label="Search all writing and videos"></label></div><p class="native-result-count kram-sr-only" role="status" aria-live="polite"></p><div class="native-post-list" id="native-archive-results"><p>Loading the archive…</p></div>`;
    writing.querySelector('.kram-page-head').after(archive);
    // Fold the existing clips into the same categories; avoid older aliases of
    // essays already available in the native catalogue.
    externalWriting = [];
    const oldPersonal = writing.querySelector('.kram-personal-writing');
    oldPersonal?.querySelectorAll('.kram-work-index a').forEach(link => {
      if (link.href.includes('theworlduncertain.substack.com')) externalWriting.push({
        slug:'unreality-reigns', category:'personal', title:link.querySelector('strong').textContent, url:link.href, publisher:'With The World Uncertain', external:true
      });
    });
    const oldWork = writing.querySelector('.kram-professional-writing');
    const workSlugs = ['layerzero-v2-deep-dive', 'the-default-is-many-chains', 'jumper', 'crosschain-risk-framework', 'how-to-choose-a-cryptocurrency'];
    const publishers = ['LayerZero', 'LayerZero', 'LI.FI', 'Crosschain Risk Framework', 'Morning Brew'];
    oldWork?.querySelectorAll('.kram-professional-list a').forEach((link, position) => externalWriting.push({
      slug:workSlugs[position] || link.href, category:'work', title:link.querySelector('strong').textContent, url:link.href, publisher:publishers[position] || '', external:true
    }));
    oldPersonal?.remove();
    oldWork?.remove();
    reader = doc.createElement('main');
    reader.className = 'native-reader kram-view';
    reader.dataset.siteView = 'post';
    reader.hidden = true;
    doc.querySelector('.kram-footer').before(reader);
    doc.addEventListener('click', event => {
      const postLink = event.target.closest?.('a[data-native-post]');
      if (postLink && event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
        event.preventDefault();
        event.stopImmediatePropagation();
        window.dispatchEvent(new CustomEvent('kram:open-post', { detail:postLink.dataset.nativePost }));
      }
      const filter = event.target.closest?.('[data-native-filter]');
      if (filter) {
        activeFilter = filter.dataset.nativeFilter;
        selectedIdea = null;
        ideaHistory = [];
        search = '';
        archive.querySelector('input').value = '';
        renderArchive();
      }
      const idea = event.target.closest?.('[data-idea-select]');
      if (idea) exploreIdea(idea.dataset.ideaSelect);
      if (event.target.closest?.('[data-idea-back]')) exploreIdea(ideaHistory.pop(), false);
    }, true);
    archive.querySelector('input').addEventListener('input', event => { search = event.target.value; ideaHistory = []; renderArchive(); });
    const observer = new MutationObserver(() => { if (reader.hidden) stopVideo(); });
    observer.observe(reader, { attributes:true, attributeFilter:['hidden'] });
    const eraObserver = new MutationObserver(() => { renderArchive(); });
    eraObserver.observe(doc.documentElement, { attributes:true, attributeFilter:['data-era'] });
    renderArchive().catch(() => { archive.querySelector('.native-post-list').innerHTML = '<p>The archive could not load. <a href="https://kramnotmark.substack.com/archive" target="_blank" rel="noopener">Visit Kram Not Mark</a></p>'; });
  }

  window.KramPublication = { currentSlug, showPost, refreshLinks };
  frame.addEventListener('load', mount);
  if (frame.contentDocument?.querySelector('.knm-scene-home')) mount();
})();
