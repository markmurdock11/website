/* One body of work, five ways to visit it. The original frame owns content and forms. */
(() => {
  'use strict';
  const frame = document.getElementById('knm-preview');
  if (!frame) return;
  const modes = [
    { id: 'html', name: 'HTML', year: '1991', description: 'Just the words. The beginning of the web.' },
    { id: 'web', name: 'Home page', year: '1999', description: 'A little corner of the personal internet.' },
    { id: 'desktop', name: 'Desktop', year: '2003', description: 'Open a window. Make yourself at home.' },
    { id: 'signal', name: 'Signal', year: 'NOW', description: 'The present-day Kram.bio.' },
    { id: 'machine', name: 'Machine', year: '>_', description: 'A text-first view of the same human.' }
  ];
  const validModes = new Set(modes.map(mode => mode.id));
  const pages = new Set(['home', 'about', 'writing', 'inbox']);
  const pageNames = { home: 'home', about: 'about', writing: 'archive', inbox: 'inbox' };
  const aliases = { modern: 'signal', 'social-web': 'web', skeumorphism: 'desktop' };
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
    <div class="era-dock-intro"><span class="era-dock-title">same me, different internet.</span><span class="era-dock-caption">choose a version</span></div>
    <fieldset class="era-options"><legend class="era-sr-only">Choose a website version</legend>
      ${modes.map(mode => `<label class="era-option"><input type="radio" name="website-era" value="${mode.id}" aria-label="${mode.name}" ${mode.id === activeMode ? 'checked' : ''}><span class="era-option-year" aria-hidden="true">${mode.year}</span><span class="era-option-name">${mode.name}</span></label>`).join('')}
    </fieldset>
    <span class="era-sr-only" id="era-announcement" role="status" aria-live="polite"></span>`;
  document.body.appendChild(dock);
  document.documentElement.classList.add('eras-ready');

  function currentPage() {
    const page = location.hash.slice(1);
    return page === 'media' ? 'writing' : (pages.has(page) ? page : 'home');
  }

  function updateURL(page, push) {
    const url = new URL(location.href);
    url.searchParams.set('era', activeMode);
    url.hash = page === 'home' ? '' : page;
    if (url.href !== location.href) {
      history[push ? 'pushState' : 'replaceState']({ era: activeMode, page }, '', url);
    }
  }

  function renderPage(page, scroll) {
    if (!frameState) return;
    const { doc, win } = frameState;
    const site = doc.querySelector('.kram-site');
    site.dataset.page = page;
    doc.querySelectorAll('[data-site-view]').forEach(view => {
      view.hidden = view.dataset.siteView !== page;
    });
    doc.querySelectorAll('.kram-site-head [data-site-page], [data-era-page]').forEach(link => {
      const selected = (link.dataset.sitePage || link.dataset.eraPage) === page;
      link.toggleAttribute('data-era-current', selected);
      link.dataset.current = String(selected);
      if (selected) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
    doc.querySelectorAll('.era-location').forEach(node => { node.textContent = `https://kram.bio/${page === 'home' ? '' : `#${page}`}`; });
    doc.querySelectorAll('.era-window-title').forEach(node => { node.textContent = `kram.bio — ${pageNames[page]}`; });
    document.title = page === 'home' ? 'Kram.bio — Mark Murdock' : `${pageNames[page]} — Kram.bio`;
    win.document.title = document.title;
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
    frameState.doc.querySelectorAll('a[data-site-page]').forEach(link => {
      const target = new URL(location.href);
      target.hash = link.dataset.sitePage === 'home' ? '' : link.dataset.sitePage;
      link.href = target.href;
    });
  }

  function applyMode(mode, push = false, announce = false) {
    const previousMode = activeMode;
    activeMode = normalizeMode(mode);
    document.documentElement.dataset.era = activeMode;
    dock.querySelectorAll('input').forEach(input => { input.checked = input.value === activeMode; });
    const modeInfo = modes.find(item => item.id === activeMode);
    dock.querySelector('.era-dock-caption').textContent = modeInfo.description;
    document.querySelector('meta[name="theme-color"]').content = activeMode === 'machine' ? '#151419' : activeMode === 'html' ? '#ffffff' : '#e5d5f1';
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
    if (announce) document.getElementById('era-announcement').textContent = `${modeInfo.name} version selected. ${modeInfo.description}`;
  }

  function attachFrame() {
    const doc = frame.contentDocument;
    const win = frame.contentWindow;
    if (!doc?.querySelector('.kram-site') || doc.documentElement.dataset.erasAttached) return;
    doc.documentElement.dataset.erasAttached = 'true';
    const originalStyles = [...doc.querySelectorAll('style, link[rel="stylesheet"]')];
    const chromeDefaults = doc.createElement('style');
    chromeDefaults.textContent = '.era-injected{display:none}';
    doc.head.appendChild(chromeDefaults);
    const alternateStyles = doc.createElement('link');
    alternateStyles.rel = 'stylesheet';
    alternateStyles.href = 'eras-content.css?v=20261019a';
    alternateStyles.media = 'not all';
    doc.head.appendChild(alternateStyles);
    const site = doc.querySelector('.kram-site');
    site.insertAdjacentHTML('afterbegin', `
      <div class="era-window-bar era-injected"><span class="era-window-title">kram.bio — home</span><span class="era-window-controls" aria-hidden="true"><span>▱</span></span></div>
      <div class="era-address-bar era-injected"><span>Address</span><span class="era-location">https://kram.bio/</span></div>`);
    const shortcuts = doc.createElement('nav');
    shortcuts.className = 'era-desktop-shortcuts era-injected';
    shortcuts.setAttribute('aria-label', 'Desktop shortcuts');
    shortcuts.innerHTML = [
      ['home', '▣', 'My home'], ['about', '☺', 'About me'], ['writing', '▤', 'Archive'], ['inbox', '✉', 'Inbox']
    ].map(([page, icon, label]) => `<button type="button" data-era-page="${page}"><span class="era-shortcut-icon" aria-hidden="true">${icon}</span><span>${label}</span></button>`).join('');
    doc.body.prepend(shortcuts);
    doc.querySelector('.kram-home-hero').insertAdjacentHTML('beforeend', `
      <aside class="era-home-extra era-injected"><div class="era-portrait"><img src="mark-portrait.jpg" alt="Mark Murdock" width="160" height="160" decoding="async"></div><p class="era-home-label">welcome to my home page</p><p class="era-home-note">reading · travel · biotech · crypto · nuclear · space · <em>sunglasses</em></p></aside>`);
    doc.querySelector('.kram-home').insertAdjacentHTML('beforeend', `
      <div class="era-web-footer era-injected"><span>PERSONAL WEBSITE · KRAM.BIO</span></div>`);
    doc.querySelectorAll('[data-site-view]').forEach(view => {
      const page = view.dataset.siteView;
      const prompt = doc.createElement('p');
      prompt.className = 'era-machine-prompt era-injected';
      prompt.textContent = `kram@human:~$ cat ${pageNames[page] || page}.txt`;
      view.prepend(prompt);
    });
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
      document.getElementById('era-announcement').textContent = 'This version could not load. The Signal version is available.';
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
  frame.addEventListener('load', attachFrame);
  if (frame.contentDocument?.querySelector('.knm-scene-home')) attachFrame();
  applyMode(activeMode);
})();
