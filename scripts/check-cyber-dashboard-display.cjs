const assert = require('node:assert/strict');
const { createServer } = require('node:http');
const { readFile, mkdir } = require('node:fs/promises');
const { join } = require('node:path');
const { chromium, webkit } = require('playwright');

const root = join(__dirname, '..', 'not-a-cyber-attack');
const out = process.env.OUTPUT_DIR || '/tmp/monitor-screens';
async function checkPhone(page, engine, width) {
  const panes = page.locator('.phone-nav');
  assert.equal(await panes.isVisible(), true);
  const industry = page.locator('#phone-industries .industry-card');
  assert.ok(await industry.count() >= 10);
  const first = await industry.first().boundingBox();
  assert.ok(first.y < (await page.viewportSize()).height, 'Industries should start on the first screen');
  for (const button of await industry.all()) {
    const box = await button.boundingBox();
    assert.ok(box.width >= 44 && box.height >= 44, 'Small industry target');
  }
  await page.locator('#phone-industries [data-sector="Sport"]').tap();
  await page.locator('#dialog-body [data-case="iihf-1117"]').tap();
  assert.match(await page.locator('#dialog-body').innerText(), /Confirmed attack/i);
  await page.locator('#dialog-body [data-record-view="evidence"]').tap();
  assert.ok(await page.locator('#dialog-body a[href^="http"]').count());
  await page.locator('#back').tap();
  await page.locator('#close').tap();
  const filter = page.locator('#legend [data-denial-filter="denial"]');
  await filter.tap();
  assert.equal(await filter.getAttribute('aria-pressed'), 'true');
  await page.locator('#legend [data-denial-filter=""]').tap();
  await panes.locator('[data-pane="trending"]').tap();
  assert.equal(await page.locator('#trending').isVisible(), true);
  assert.equal(await page.locator('#phone-industries').isVisible(), false);
  await panes.locator('[data-pane="sources"]').tap();
  const rankings = page.locator('[data-view="rankings"]:visible').first();
  await rankings.tap();
  await page.locator('dialog [data-rank-select="denial"]').tap();
  await page.locator('dialog [data-rank-source]').first().tap();
  assert.ok(await page.locator('dialog .rank-source-list a[href^="http"]').count());
  await page.locator('#close').tap();
  await panes.locator('[data-pane="industries"]').tap();
  await page.locator('#phone-industries [data-sector="Technology"]').tap();
  await page.locator('dialog [data-case="workday-1113"]').tap();
  assert.match(await page.locator('#dialog-body').innerText(), /What changed/i);
  if (width === 390) await page.screenshot({path: join(out, engine + '-incident-390.png')});
  await page.locator('#close').tap();
}
const server = createServer(async (request, response) => {
  const pathname = new URL(request.url, 'http://localhost').pathname;
  const json = pathname === '/situation-feed.json';
  if (!json && pathname !== '/') { response.writeHead(404).end(); return; }
  try {
    const body = await readFile(join(root, json ? 'situation-feed.json' : 'index.html'));
    response.writeHead(200, { 'Content-Type': json ? 'application/json' : 'text/html;charset=utf-8' }).end(body);
  } catch { response.writeHead(500).end(); }
});

async function inspect(browser, engine, width, height) {
  const mobile = width < 600;
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1,
    isMobile: mobile, hasTouch: mobile, colorScheme: 'dark', reducedMotion: 'reduce' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto('http://127.0.0.1:' + server.address().port + '/', { waitUntil: 'networkidle' });
    await page.locator('#clock-org').waitFor({ state: 'visible' });
    assert.ok(await page.evaluate(() => window.SITUATION.records.length > 0));
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      engine + ' horizontal overflow at ' + width);
    await page.screenshot({ path: join(out, engine + '-' + width + '.png') });
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
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
}
async function run() {
  await mkdir(out, { recursive: true });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    for (const [engine, type] of Object.entries({ chromium, webkit })) {
      const browser = await type.launch(engine === 'chromium' ? { channel: 'chrome' } : {});
      try {
        for (const [width, height] of [[320, 690], [390, 844], [430, 932], [1366, 900]]) {
          await inspect(browser, engine, width, height);
        }
      } finally { await browser.close(); }
    }
  } finally { server.close(); }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
