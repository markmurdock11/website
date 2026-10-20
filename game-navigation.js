/* Keep the standalone games connected to the rest of Kram.bio. */
(() => {
  let era = new URL(location.href).searchParams.get('era');
  if (!era) {
    try { era = localStorage.getItem('kram-era'); } catch { /* Navigation works without storage. */ }
  }
  if (!['html', 'desktop', 'signal'].includes(era)) era = 'signal';
  const destination = (page) => {
    const url = new URL('https://kram.bio/');
    url.searchParams.set('era', era);
    if (page === 'writing') url.searchParams.set('archive', 'games');
    if (page) url.hash = page;
    return url.href;
  };
  const nav = document.createElement('nav');
  nav.className = 'kram-game-nav';
  nav.setAttribute('aria-label', 'Kram.bio');
  [['', 'kram.bio'], ['about', 'about'], ['writing', 'archive'], ['library', 'library']].forEach(([page, label]) => {
    const link = document.createElement('a');
    link.href = destination(page);
    link.textContent = label;
    nav.appendChild(link);
  });
  const style = document.createElement('style');
  style.textContent = `
    .kram-game-nav{box-sizing:border-box;display:flex;align-items:center;gap:24px;width:100%;max-width:1360px;margin:0 auto;padding:10px 26px;font:inherit;font-size:14px;line-height:1.4}
    .kram-game-nav a{display:flex;align-items:center;min-height:44px;color:inherit;text-decoration:none;text-underline-offset:4px}
    .kram-game-nav a:first-child{margin-right:auto;font-weight:600}
    .kram-game-nav a:hover{text-decoration:underline}
    .kram-game-nav a:focus-visible{outline:2px solid currentColor;outline-offset:4px}
    @media(max-width:600px){.kram-game-nav{padding:6px 16px;gap:18px;font-size:13px}}
    @media print{.kram-game-nav{display:none}}
  `;
  document.head.appendChild(style);
  document.body.prepend(nav);
  document.querySelector('.nb-footer')?.remove();
})();
