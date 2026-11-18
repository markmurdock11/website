const assert = require('node:assert/strict');
const { createServer } = require('node:http');
const { readFile, mkdir } = require('node:fs/promises');
const { join, extname } = require('node:path');
const { chromium, webkit } = require('playwright');

const root = join(__dirname, '..');
const out = process.env.OUTPUT_DIR || '/tmp/monitor-screens';
async function verifyMap(page, denialsOnly = false) {
  const records = await page.evaluate(denials => {
    const edition = window.SITUATION;
    const cutoff = Math.min(Date.now(), Date.parse(edition.asOf));
    return edition.records.filter(record => !denials || window.DeskMetrics.denial(record, cutoff))
      .map(record => ({id: record.id, title: record.title, org: record.org}));
  }, denialsOnly);
  const expected = records.map(record => record.id).sort();
  const marks = page.locator('#board .cell[data-case]:visible');
  const details = page.locator('#case-atlas .atlas-case[data-case]:visible');
  const ids = nodes => nodes.map(node => node.dataset.case).sort();
  assert.deepEqual(await marks.evaluateAll(ids), expected, 'Individual tiles for the entire filtered edition');
  assert.deepEqual(await details.evaluateAll(ids), expected, 'A detailed card for each map tile');
  const displayed = await details.evaluateAll(nodes => nodes.map(node => {
    const text = node.querySelector('.atlas-description');
    const rect = text?.getBoundingClientRect();
    return {id: node.dataset.case, title: node.querySelector('.atlas-title')?.textContent.trim(),
      org: node.querySelector('.atlas-org')?.textContent.trim(), summary: text?.innerText.trim(),
      readable: !!rect?.height && text.scrollHeight <= text.clientHeight + 2 && node.scrollWidth <= node.clientWidth + 2};
  }));
  for (const r of records) {
    const d = displayed.find(entry => entry.id === r.id);
    assert.ok(d?.title?.includes(r.title) && d.org, 'Missing incident headline or organization for ' + r.id);
    assert.ok(d.readable && d.summary?.length >= 16, 'Missing or clipped description for ' + r.id);
  }
}

async function checkPhone(page, engine, width) {
  const panes = page.locator('.phone-nav');
  assert.equal(await panes.isVisible(), true);
  const hockey = '#case-atlas .atlas-case[data-case="iihf-1117"]';
  const locator = page.locator('#board [data-locate][data-case="iihf-1117"]');
  await locator.tap();
  await page.waitForFunction(selector => {
    const card = document.querySelector(selector);
    return card && document.activeElement === card;
  }, hockey);
  await page.locator(hockey).tap();
  assert.match(await page.locator('#dialog-body').innerText(), /Confirmed attack/i);
  await page.locator('#dialog-body [data-record-view="evidence"]').tap();
  assert.ok(await page.locator('#dialog-body a[href^="http"]').count());
  await page.locator('#back').tap();
  await page.locator('#close').tap();
  const filter = page.locator('#legend [data-denial-filter="denial"]');
  await filter.tap();
  assert.equal(await filter.getAttribute('aria-pressed'), 'true');
  await verifyMap(page, true);
  await page.locator('#legend [data-denial-filter=""]').tap();
  await panes.locator('[data-pane="trending"]').tap();
  assert.equal(await page.locator('#trending').isVisible(), true);
  assert.equal(await page.locator('#case-atlas').isVisible(), false);
  await panes.locator('[data-pane="sources"]').tap();
  const rankings = page.locator('[data-view="rankings"]:visible').first();
  await rankings.tap();
  await page.locator('dialog [data-rank-select="denial"]').tap();
  await page.locator('dialog [data-rank-source]').first().tap();
  assert.ok(await page.locator('dialog .rank-source-list a[href^="http"]').count());
  await page.locator('#close').tap();
  await panes.locator('[data-pane="industries"]').tap();
  await page.locator('#case-atlas .atlas-case[data-case="workday-1113"]').tap();
  assert.match(await page.locator('#dialog-body').innerText(), /What changed/i);
  if (width === 390) await page.screenshot({path: join(out, engine + '-incident-390.png')});
  await page.locator('#close').tap();
}
const server = createServer(async (request, response) => {
  const pathname = new URL(request.url, 'http://localhost').pathname;
  const path = pathname.endsWith('/') ? pathname + 'index.html' : pathname;
  const types = { '.html':'text/html;charset=utf-8', '.css':'text/css', '.js':'text/javascript',
    '.json':'application/json', '.svg':'image/svg+xml', '.png':'image/png', '.jpg':'image/jpeg',
    '.webp':'image/webp', '.woff2':'font/woff2' };
  const type = types[extname(path)];
  if (!type || path.split('/').some(segment => segment.startsWith('.'))) { response.writeHead(404).end(); return; }
  try {
    const body = await readFile(join(root, path));
    response.writeHead(200, { 'Content-Type': type }).end(body);
  } catch { response.writeHead(404).end(); }
});
async function checkPortfolio(page, local) {
  await page.goto(local + '/', {waitUntil:'domcontentloaded'});
  const frame = page.frameLocator('#knm-preview');
  const nav = frame.locator('.kram-site-head nav');
  const link = nav.locator('[data-site-page="writing"]');
  await link.waitFor();
  assert.equal(await nav.locator('a[href*="not-a-cyber-attack"],a[href*="portfolio-company-map"]').count(), 0);
  await link.click();
  const projects = frame.locator('[data-native-filter="projects"]');
  await projects.click();
  const dashboard = frame.locator('a[href="/not-a-cyber-attack/"]:visible').first();
  await dashboard.click();
  await page.waitForURL('**/not-a-cyber-attack/');
}

async function inspect(browser, engine, width, height) {
  const mobile = width < 600;
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1,
    isMobile: mobile, hasTouch: mobile, colorScheme: 'dark', reducedMotion: 'reduce' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    const local = 'http://127.0.0.1:' + server.address().port;
    await page.goto(local + '/not-a-cyber-attack/', { waitUntil: 'networkidle' });
    await page.locator('#clock-org').waitFor({ state: 'visible' });
    assert.ok(await page.evaluate(() => window.SITUATION.records.length > 0));
    assert.match(await page.locator('.credit').innerText(), /a dashboard by kram, built with string/i);
    assert.equal(await page.locator('#clock-name').textContent(), 'Since the last denial');
    assert.equal(await page.locator('#edition-mode').count(), 0);
    assert.ok(await page.locator('#page-title').evaluate(node => parseFloat(getComputedStyle(node).fontSize)) >= (mobile ? 42 : 70));
    await verifyMap(page);
    const intro = page.locator('.hero-copy');
    assert.equal(await intro.isVisible(), true);
    assert.match(await intro.innerText(), /Outages are rampant[\s\S]*We're monitoring the situation\./);
    const order = await page.evaluate(() => ({
      map: document.querySelector('#board').getBoundingClientRect().top,
      atlas: document.querySelector('#case-atlas').getBoundingClientRect().top,
      news: document.querySelector('#developments').getBoundingClientRect().top,
      height: innerHeight
    }));
    assert.ok(order.map < order.height && order.map < order.atlas && order.atlas < order.news,
      'Overview, detailed map, and developments should be in reading order: ' + JSON.stringify(order));
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      engine + ' horizontal overflow at ' + width);
    await page.screenshot({ path: join(out, engine + '-' + width + '.png') });
    if (width === 390) {
      await page.locator('#board').evaluate(node => node.scrollIntoView({block: 'start'}));
      await page.screenshot({path: join(out, engine + '-industry-map-390.png')});
      await page.locator('#case-atlas').evaluate(node => node.scrollIntoView({block: 'start'}));
      await page.screenshot({path: join(out, engine + '-case-atlas-390.png')});
      await page.evaluate(() => window.scrollTo(0, 0));
    }
    const info = await page.evaluate(() => ({ width: innerWidth, height: innerHeight,
      visibleSmallTargets: [...document.querySelectorAll('button')].filter(node => {
        const rect = node.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && rect.top >= 0 && rect.bottom <= innerHeight && Math.min(rect.width, rect.height) < 36;
      }).length }));
    console.log(engine, info);
    if (mobile) await checkPhone(page, engine, width);
    else {
      assert.equal(await page.locator('#board').isVisible(), true);
      assert.equal(await page.locator('.phone-nav').isVisible(), false);
    }
    const clock = page.locator('#denial-clock');
    await clock.click();
    await page.locator('dialog[open]').waitFor();
    assert.ok(await page.locator('#dialog-body a[href^="http"]').count());
    await page.locator('#close').click();
    assert.equal(await page.locator('dialog[open]').count(), 0);
    if (width === 390 || width === 1366) await checkPortfolio(page, local);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
}
async function run() {
  await mkdir(out, { recursive: true });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    for (const [engine, type] of Object.entries({ chromium, webkit })) {
      const browser = await type.launch();
      try {
        for (const [width, height] of [[320, 690], [390, 844], [430, 932], [1366, 900]]) {
          await inspect(browser, engine, width, height);
        }
      } finally { await browser.close(); }
    }
  } finally { server.close(); }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
