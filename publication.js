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
  const rank = new Map(readingOrder.map((slug, position) => [slug, position]));
  const escape = value => String(value || '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
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
      if (post) setTitle(post.title);
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
        const response = await fetch(item.data);
        if (!response.ok) throw new Error('This page could not load.');
        post = await response.json();
        cache.set(slug, post);
      }
      if (request !== requestNumber || currentSlug() !== slug) return;
      const related = post.relatedVideo ? index.posts.find(item => item.slug === post.relatedVideo) : null;
      reader.innerHTML = `
        <a href="/#writing" data-site-page="writing">Back to archive</a>
        <header class="native-reader-head"><span class="native-post-kind">${post.kind === 'video' ? 'VIDEO' : (escape(post.series) || 'ESSAY')}</span><time datetime="${escape(post.date)}">${date(post.date)}</time><h1>${escape(post.title)}</h1>${post.subtitle ? `<p>${escape(post.subtitle)}</p>` : ''}${related ? `<a class="native-watch-link" href="${postURL(related.slug)}" data-native-post="${related.slug}">Watch the video · ${duration(related.duration)}</a>` : ''}</header>
        ${post.video ? `<figure class="native-video"><video controls playsinline preload="metadata" poster="${escape(post.video.poster)}" src="${escape(post.video.src)}" width="${post.video.width}" height="${post.video.height}" aria-label="${escape(post.title)}"><a href="${escape(post.video.src)}">Play video</a></video></figure>` : ''}
        <article class="native-reader-body">${post.html}</article>
        <footer class="native-reader-source"><a href="${escape(post.source)}" target="_blank" rel="noopener">Originally published on ${post.kind === 'video' ? 'Substack Notes' : 'Kram Not Mark'}</a><a href="/#writing" data-site-page="writing">Back to archive</a></footer>`;
      if (post.video) reader.querySelector('.native-video').style.setProperty('--native-video-ratio', `${post.video.width} / ${post.video.height}`);
      renderedSlug = slug;
      refreshLinks();
      setTitle(post.title);
    } catch (error) {
      if (request !== requestNumber) return;
      reader.innerHTML = `<a href="/#writing" data-site-page="writing">Back to archive</a><div class="native-reader-body"><h1>This page could not load.</h1><p>Return to the archive or try this page again.</p><a href="${escape(location.href)}" target="_top">Try again</a></div>`;
    } finally {
      if (request === requestNumber) reader.removeAttribute('aria-busy');
    }
  }

  async function renderArchive() {
    const index = await loadCatalogue();
    if (!doc) return;
    const list = doc.querySelector('.native-post-list');
    const items = index.posts.map(post => ({
      ...post,
      category:post.kind === 'video' ? 'video' : post.series?.toLowerCase() === 'komplex' ? 'work' : 'personal'
    })).concat(externalWriting).sort((a, b) => (rank.get(a.slug) ?? 100) - (rank.get(b.slug) ?? 100));
    const query = search.trim().toLocaleLowerCase();
    const filtered = items.filter(post => query
      ? `${post.title} ${post.subtitle || ''} ${post.series || ''} ${post.publisher || ''}`.toLocaleLowerCase().includes(query)
      : post.category === activeFilter);
    const row = post => {
      const label = post.kind === 'video' ? duration(post.duration) : post.publisher || (post.series === 'From the Archive' ? '' : post.series);
      return `<article class="native-post-row${post.kind === 'video' ? ' native-post-row-video' : ''}"><a href="${post.external ? escape(post.url) : postURL(post.slug)}"${post.external ? ' target="_blank" rel="noopener"' : ` data-native-post="${post.slug}"`}><div class="native-post-info"><h3>${escape(post.title)}</h3>${label ? `<p class="native-post-meta">${escape(label)}</p>` : ''}</div>${post.cover ? `<figure class="native-post-cover"><img src="${escape(post.cover)}" alt="" width="300" height="200" loading="lazy" decoding="async">${post.kind === 'video' ? '<span class="native-play-mark" aria-hidden="true">▶</span>' : ''}</figure>` : ''}</a></article>`;
    };
    list.innerHTML = filtered.length ? categories.filter(category => query || category.id === activeFilter).map(category => {
      const posts = filtered.filter(post => post.category === category.id);
      if (!posts.length) return '';
      return `<section class="native-category" aria-labelledby="native-category-${category.id}"><h2 id="native-category-${category.id}"${query ? '' : ' class="kram-sr-only"'}>${category.label}</h2>${posts.map(row).join('')}</section>`;
    }).join('') : '<p class="native-empty">No matches. Try another title, topic, or series.</p>';
    doc.querySelector('.native-result-count').textContent = query ? `${filtered.length} ${filtered.length === 1 ? 'match' : 'matches'} across the archive` : `${filtered.length} ${categories.find(category => category.id === activeFilter).label.toLowerCase()}, in selected reading order`;
    doc.querySelectorAll('[data-native-filter]').forEach(button => {
      const category = categories.find(category => category.id === button.dataset.nativeFilter);
      const count = items.filter(post => post.category === category.id).length;
      button.setAttribute('aria-pressed', String(!query && category.id === activeFilter));
      button.innerHTML = `${category.label}<span class="native-filter-count">${count}</span>`;
    });
  }

  function mount() {
    const nextDoc = frame.contentDocument;
    if (!nextDoc?.querySelector('.kram-site') || nextDoc.querySelector('.native-archive')) return;
    doc = nextDoc;
    const styles = doc.createElement('link');
    styles.rel = 'stylesheet';
    styles.href = '/native-content.css?v=20261019c';
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
        search = '';
        archive.querySelector('input').value = '';
        renderArchive();
      }
    }, true);
    archive.querySelector('input').addEventListener('input', event => { search = event.target.value; renderArchive(); });
    const observer = new MutationObserver(() => { if (reader.hidden) stopVideo(); });
    observer.observe(reader, { attributes:true, attributeFilter:['hidden'] });
    renderArchive().catch(() => { archive.querySelector('.native-post-list').innerHTML = '<p>The archive could not load. <a href="https://kramnotmark.substack.com/archive" target="_blank" rel="noopener">Visit Kram Not Mark</a></p>'; });
  }

  window.KramPublication = { currentSlug, showPost, refreshLinks };
  frame.addEventListener('load', mount);
  if (frame.contentDocument?.querySelector('.knm-scene-home')) mount();
})();
