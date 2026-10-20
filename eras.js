/* One body of work, three ways to visit it. */
(() => {
  'use strict';
  const frame = document.getElementById('knm-preview');
  if (!frame) return;
  const modes = [
    { id: 'html', name: 'HTML' },
    { id: 'desktop', name: 'Desktop' },
    { id: 'signal', name: 'Singularity' },
  ];
  const validModes = new Set(modes.map(mode => mode.id));
  const pages = new Set(['home', 'about', 'writing', 'library', 'post']);
  const pageNames = { home: 'home', about: 'about', writing: 'portfolio', library: 'media library', post: 'portfolio' };
  const aliases = { modern: 'signal', skeumorphism: 'desktop' };
  const readStoredMode = () => {
    try { return localStorage.getItem('kram-era'); } catch { return null; }
  };
  const normalizeMode = mode => aliases[mode] || (validModes.has(mode) ? mode : 'signal');
  const initialParameter = new URL(location.href).searchParams.get('era');
  let activeMode = normalizeMode(initialParameter === null ? readStoredMode() : initialParameter);
  let frameState = null;

  const dock = document.createElement('footer');
  dock.className = 'era-dock';
  dock.setAttribute('aria-label', 'Website versions');
  dock.innerHTML = `
    <fieldset class="era-options"><legend class="era-sr-only">Choose a website version</legend>
      ${modes.map(mode => `<label class="era-option"><input type="radio" name="website-era" value="${mode.id}" aria-label="${mode.name}" ${mode.id === activeMode ? 'checked' : ''}><span class="era-option-name">${mode.name}</span></label>`).join('')}
    </fieldset>
    <span class="era-sr-only" id="era-announcement" role="status" aria-live="polite"></span>`;
  document.body.appendChild(dock);
  document.documentElement.classList.add('eras-ready');

  function currentPage() {
    if (window.KramPublication?.currentSlug()) return 'post';
    const page = location.hash.slice(1);
    return page === 'inbox' ? 'about' : page === 'media' ? 'library' : (pages.has(page) ? page : 'home');
  }

  function updateURL(page, push) {
    const url = new URL(location.href);
    if (page !== 'post') {
      if (/\/writing-[a-z0-9-]+\.html$/.test(url.pathname)) url.pathname = '/';
      url.searchParams.delete('post');
    }
    url.searchParams.set('era', activeMode);
    url.hash = page === 'home' || page === 'post' ? '' : page;
    if (url.href !== location.href) {
      history[push ? 'pushState' : 'replaceState']({ era: activeMode, page }, '', url);
    }
  }

  function renderPage(page, scroll) {
    if (!frameState) return;
    const { doc, win } = frameState;
    const site = doc.querySelector('.kram-site');
    const displayPage = page === 'library' ? 'writing' : page;
    site.dataset.page = page;
    doc.querySelectorAll('[data-site-view]').forEach(view => {
      view.hidden = view.dataset.siteView !== displayPage;
    });
    doc.querySelectorAll('.kram-site-head [data-site-page], [data-era-page]').forEach(link => {
      const selected = (link.dataset.sitePage || link.dataset.eraPage) === (page === 'post' ? 'writing' : page);
      link.toggleAttribute('data-era-current', selected);
      link.dataset.current = String(selected);
      if (selected) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
    doc.querySelectorAll('.era-location').forEach(node => { node.textContent = `https://kram.bio${page === 'post' ? location.pathname : `/${page === 'home' ? '' : `#${page}`}`}`; });
    doc.querySelectorAll('.era-window-title').forEach(node => { node.textContent = {home: "Kram's desktop", about: 'About me.txt', writing: 'Portfolio', library: 'My personal media library', post: 'Reading room'}[page]; });
    document.title = page === 'home' ? 'Kram.bio — Mark Murdock' : `${pageNames[page]} — Kram.bio`;
    win.document.title = document.title;
    if (page === 'post') window.KramPublication?.showPost(window.KramPublication.currentSlug());
    if (page === 'library') win.KramLibrary?.show(new URL(location.href).searchParams.get('shelf'));
    // Keep the frame route in step without making a second browser-history entry.
    win.history.replaceState({ page }, '', `${win.location.pathname}${win.location.search}${page === 'home' ? '' : `#${page}`}`);
    if (scroll) win.scrollTo({ top: 0, behavior: 'instant' });
  }

  function navigate(page, push = true) {
    page = pages.has(page) ? page : 'home';
    updateURL(page, push);
    renderPage(page, true);
    syncFrameLinks();
  }

  function syncFrameLinks() {
    if (!frameState) return;
    frameState.doc.querySelectorAll('a[data-site-page], a[data-era-page]').forEach(link => {
      const target = new URL(location.href);
      target.pathname = '/';
      target.searchParams.delete('post');
      const page = link.dataset.sitePage || link.dataset.eraPage;
      target.hash = page === 'home' ? '' : page;
      link.href = target.href;
    });
    window.KramPublication?.refreshLinks();
    frameState.win.KramLibrary?.refreshLinks();
  }
  window.KramNavigation = { syncFrameLinks };

  function applyMode(mode, push = false, announce = false) {
    const previousMode = activeMode;
    activeMode = normalizeMode(mode);
    document.documentElement.dataset.era = activeMode;
    dock.querySelectorAll('input').forEach(input => { input.checked = input.value === activeMode; });
    const modeInfo = modes.find(item => item.id === activeMode);
    document.querySelector('meta[name="theme-color"]').content = activeMode === 'html' ? '#ffffff' : '#e5d5f1';
    if (frameState) {
      const { doc, originalStyles, alternateStyles, alternateReady } = frameState;
      doc.documentElement.dataset.era = activeMode;
      const alternate = activeMode !== 'signal' && alternateReady;
      // Disable whole sheets instead of fighting the existing design's specificity.
      originalStyles.forEach(node => { node.disabled = alternate; });
      // Keep this sheet loaded. Disabling a loading link can discard its CSS in WebKit.
      alternateStyles.media = alternate ? 'all' : 'not all';
      originalStyles.forEach(node => { if (node.sheet) node.sheet.disabled = alternate; });
      renderPage(currentPage(), previousMode !== activeMode);
    }
    updateURL(currentPage(), push);
    syncFrameLinks();
    try { localStorage.setItem('kram-era', activeMode); } catch { /* Storage is optional. */ }
    if (announce) document.getElementById('era-announcement').textContent = `${modeInfo.name} version selected.`;
  }

  function attachFrame() {
    const doc = frame.contentDocument;
    const win = frame.contentWindow;
    if (!doc?.querySelector('.kram-site') || doc.documentElement.dataset.erasAttached) return;
    doc.documentElement.dataset.erasAttached = 'true';
    const originalStyles = [...doc.querySelectorAll('style:not([data-keep-enabled]), link[rel="stylesheet"]:not([data-keep-enabled])')];
    const chromeDefaults = doc.createElement('style');
    chromeDefaults.textContent = '.era-injected{display:none}';
    doc.head.appendChild(chromeDefaults);
    const alternateStyles = doc.createElement('link');
    alternateStyles.rel = 'stylesheet';
    alternateStyles.href = 'eras-content.css?v=20261020f';
    alternateStyles.media = 'not all';
    doc.head.appendChild(alternateStyles);
    const nativeStyles = doc.querySelector('link[data-native-styles]');
    if (nativeStyles) doc.head.appendChild(nativeStyles);
    const polishStyles = doc.createElement('link');
    polishStyles.rel = 'stylesheet';
    polishStyles.href = 'polish.css?v=20261020f';
    polishStyles.dataset.keepEnabled = 'true';
    doc.head.appendChild(polishStyles);
    const site = doc.querySelector('.kram-site');
    site.insertAdjacentHTML('afterbegin', `
      <div class="era-window-bar era-injected"><span class="era-window-title" role="heading" aria-level="1">Kram's desktop</span><button type="button" class="era-window-close" data-era-page="home" aria-label="Return to desktop">×</button></div>`);
    const shortcuts = doc.createElement('nav');
    shortcuts.className = 'era-desktop-shortcuts era-injected';
    shortcuts.setAttribute('aria-label', 'Desktop shortcuts');
    shortcuts.innerHTML = [
      ['home', 'computer', 'Desktop'], ['about', 'document', 'About me'], ['writing', 'folder', 'Portfolio'], ['library', 'books', 'Media library']
    ].map(([page, icon, label]) => `<a href="/?era=${activeMode}${page === 'home' ? '' : `#${page}`}" target="_top" data-era-page="${page}"><span class="era-shortcut-icon era-icon-${icon}" aria-hidden="true"></span><span>${label}</span></a>`).join('');
    doc.body.prepend(shortcuts);
    doc.querySelector('.kram-home-hero').insertAdjacentHTML('beforeend', `
      <aside class="era-home-extra era-injected"><div class="era-portrait"><img src="mark-portrait.jpg" alt="Mark Murdock" width="160" height="160" decoding="async"></div></aside>`);
    frameState = { doc, win, originalStyles, alternateStyles, alternateReady: false };
    // Capturing also makes dynamically inserted navigation behave like original links.
    doc.addEventListener('click', event => {
      const link = event.target.closest?.('[data-site-page], [data-era-page]');
      if (!link) return;
      // Bypass the older target listeners while retaining the browser's native new-tab behavior.
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        event.stopImmediatePropagation();
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
      navigate(link.dataset.sitePage || link.dataset.eraPage);
    }, true);
    originalStyles.forEach(node => node.addEventListener('load', () => {
      if (node.sheet) node.sheet.disabled = activeMode !== 'signal' && frameState.alternateReady;
    }));
    alternateStyles.addEventListener('load', () => {
      frameState.alternateReady = true;
      applyMode(activeMode);
      frame.style.visibility = 'visible';
    });
    alternateStyles.addEventListener('error', () => {
      applyMode('signal');
      document.getElementById('era-announcement').textContent = 'This version could not load. The Singularity version is available.';
    });
    applyMode(activeMode);
  }

  dock.addEventListener('change', event => {
    if (event.target.matches('input[name="website-era"]')) applyMode(event.target.value, true, true);
  });
  window.addEventListener('popstate', () => {
    applyMode(new URL(location.href).searchParams.get('era') || 'signal', false, true);
    renderPage(currentPage(), true);
  });
  window.addEventListener('hashchange', () => { renderPage(currentPage(), true); syncFrameLinks(); });
  window.addEventListener('kram:open-shelf', event => {
    const category = event.detail;
    if (!['blogs', 'movies', 'tv', 'books', 'songs', 'all'].includes(category)) return;
    const url = new URL(location.href);
    url.pathname = '/';
    url.searchParams.delete('post');
    url.searchParams.set('era', activeMode);
    url.searchParams.set('shelf', category);
    url.hash = 'library';
    if (url.href !== location.href) history.pushState({ era: activeMode, page: 'library', shelf: category }, '', url);
    renderPage('library', true);
    syncFrameLinks();
  });
  window.addEventListener('kram:open-post', event => {
    const slug = event.detail;
    if (!/^[a-z0-9-]+$/.test(slug)) return;
    const url = new URL(location.href);
    url.pathname = `/writing-${slug}.html`;
    url.searchParams.delete('post');
    url.searchParams.set('era', activeMode);
    url.hash = '';
    history.pushState({ era: activeMode, page: 'post', slug }, '', url);
    renderPage('post', true);
    syncFrameLinks();
  });
  frame.addEventListener('load', attachFrame);
  if (frame.contentDocument?.querySelector('.knm-scene-home')) attachFrame();
  applyMode(activeMode);
})();
