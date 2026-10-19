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
  let activeFilter = 'all';
  let search = '';
  const cache = new Map();
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
    reader.innerHTML = '<a href="/#writing" data-site-page="writing">← archive</a><p class="native-reader-body" role="status">Loading…</p>';
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
        <a href="/#writing" data-site-page="writing">← archive</a>
        <header class="native-reader-head"><span class="native-post-kind">${post.kind === 'video' ? 'VIDEO' : (escape(post.series) || 'ESSAY')}</span><time datetime="${escape(post.date)}">${date(post.date)}</time><h1>${escape(post.title)}</h1>${post.subtitle ? `<p>${escape(post.subtitle)}</p>` : ''}${related ? `<a class="native-watch-link" href="${postURL(related.slug)}" data-native-post="${related.slug}">Watch the video · ${duration(related.duration)} ↗</a>` : ''}</header>
        ${post.video ? `<figure class="native-video"><video controls playsinline preload="metadata" poster="${escape(post.video.poster)}" src="${escape(post.video.src)}" width="${post.video.width}" height="${post.video.height}" aria-label="${escape(post.title)}"><a href="${escape(post.video.src)}">Play video</a></video></figure>` : ''}
        <article class="native-reader-body">${post.html}</article>
        <footer class="native-reader-source"><a href="${escape(post.source)}" target="_blank" rel="noopener">Originally published on ${post.kind === 'video' ? 'Substack Notes' : 'Kram Not Mark'} ↗</a><a href="/#writing" data-site-page="writing">back to the archive →</a></footer>`;
      if (post.video) reader.querySelector('.native-video').style.setProperty('--native-video-ratio', `${post.video.width} / ${post.video.height}`);
      renderedSlug = slug;
      refreshLinks();
      setTitle(post.title);
    } catch (error) {
      if (request !== requestNumber) return;
      reader.innerHTML = `<a href="/#writing" data-site-page="writing">← archive</a><div class="native-reader-body"><h1>This page could not load.</h1><p>Return to the archive or try this page again.</p><a href="${escape(location.href)}" target="_top">Try again</a></div>`;
    } finally {
      if (request === requestNumber) reader.removeAttribute('aria-busy');
    }
  }

  async function renderArchive() {
    const index = await loadCatalogue();
    if (!doc) return;
    const list = doc.querySelector('.native-post-list');
    const filtered = index.posts.filter(post => (activeFilter === 'all' || post.kind === activeFilter) && `${post.title} ${post.subtitle} ${post.series}`.toLowerCase().includes(search.toLowerCase()));
    list.innerHTML = filtered.length ? filtered.map(post => `
      <article class="native-post-row"><a href="${postURL(post.slug)}" data-native-post="${post.slug}"><div class="native-post-info"><span class="native-post-kind">${post.kind === 'video' ? `VIDEO · ${duration(post.duration)}` : escape(post.series || 'ESSAY')}</span><h3>${escape(post.title)}</h3>${post.subtitle ? `<p>${escape(post.subtitle)}</p>` : ''}<time datetime="${escape(post.date)}">${date(post.date)}</time></div>${post.cover ? `<figure class="native-post-cover"><img src="${escape(post.cover)}" alt="" width="300" height="200" loading="lazy" decoding="async">${post.kind === 'video' ? '<span class="native-play-mark" aria-hidden="true">▶</span>' : ''}</figure>` : ''}</a></article>`).join('') : '<p>No matching essays or videos.</p>';
    doc.querySelector('.native-archive-count').textContent = `${index.essays} essays · ${index.videos} videos`;
    doc.querySelector('.native-result-count').textContent = `${filtered.length} ${filtered.length === 1 ? 'item' : 'items'}`;
    doc.querySelectorAll('[data-native-filter]').forEach(button => { button.setAttribute('aria-pressed', String(button.dataset.nativeFilter === activeFilter)); });
  }

  function mount() {
    const nextDoc = frame.contentDocument;
    if (!nextDoc?.querySelector('.kram-site') || nextDoc.querySelector('.native-archive')) return;
    doc = nextDoc;
    const styles = doc.createElement('link');
    styles.rel = 'stylesheet';
    styles.href = '/native-content.css?v=20261019b';
    styles.dataset.keepEnabled = 'true';
    styles.dataset.nativeStyles = 'true';
    doc.head.appendChild(styles);
    const writing = doc.querySelector('[data-site-view="writing"]');
    const archive = doc.createElement('section');
    archive.className = 'native-archive';
    archive.setAttribute('aria-label', 'Essays and videos');
    archive.innerHTML = `<header><h2>essays & videos</h2><p class="native-archive-count"></p></header><div class="native-archive-controls"><nav class="native-filter" aria-label="Archive format"><button type="button" data-native-filter="all" aria-pressed="true">all</button><button type="button" data-native-filter="essay" aria-pressed="false">essays</button><button type="button" data-native-filter="video" aria-pressed="false">videos</button></nav><label class="native-search"><span class="kram-sr-only">Search essays and videos</span><input type="search" placeholder="search the archive" aria-label="Search essays and videos"></label></div><p class="native-result-count" role="status" aria-live="polite"></p><div class="native-post-list"><p>Loading the archive…</p></div>`;
    writing.querySelector('.kram-page-head').after(archive);
    // The imported catalogue supersedes the three older home-site shortcuts.
    // Keep the separately published collaborative essay available below it.
    const oldPersonal = writing.querySelector('.kram-personal-writing');
    oldPersonal.querySelectorAll('.kram-work-index a').forEach(link => {
      if (!link.href.includes('theworlduncertain.substack.com')) link.remove();
    });
    oldPersonal.querySelector('.kram-section-label').textContent = 'ELSEWHERE';
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
      if (filter) { activeFilter = filter.dataset.nativeFilter; renderArchive(); }
    }, true);
    archive.querySelector('input').addEventListener('input', event => { search = event.target.value; renderArchive(); });
    const observer = new MutationObserver(() => { if (reader.hidden) stopVideo(); });
    observer.observe(reader, { attributes:true, attributeFilter:['hidden'] });
    renderArchive().catch(() => { archive.querySelector('.native-post-list').innerHTML = '<p>The archive could not load. <a href="https://kramnotmark.substack.com/archive" target="_blank" rel="noopener">Visit Kram Not Mark ↗</a></p>'; });
  }

  window.KramPublication = { currentSlug, showPost, refreshLinks };
  frame.addEventListener('load', mount);
  if (frame.contentDocument?.querySelector('.knm-scene-home')) mount();
})();
