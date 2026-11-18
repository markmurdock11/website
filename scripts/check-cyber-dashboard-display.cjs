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
      .map(record => ({id: record.id, title: record.title, org: record.org, date: record.date, sector: window.DeskMetrics.sector(record)}));
  }, denialsOnly);
  const expected = records.map(record => record.id).sort();
  const details = page.locator('#case-atlas .atlas-case[data-case]:visible');
  const ids = nodes => nodes.map(node => node.dataset.case).sort();
  const board = page.locator('#board');
  const sectors = board.locator('button[data-sector]:visible');
  const sectorNames = await sectors.evaluateAll(nodes => nodes.map(node => node.dataset.sector).sort());
  assert.deepEqual(sectorNames, [...new Set(records.map(r => r.sector))].sort(), 'Every active industry appears once');

  // Traverse the map using the same drill-down controls available to the reader.
  const caseLinks = page.locator('dialog .record-link[data-case]');
  const membersOf = async button => {
    const provider = await button.getAttribute('data-provider');
    await button.click();
    const members = await caseLinks.evaluateAll(nodes => nodes.map(node => node.dataset.case));
    assert.ok(members.length > 1, 'Grouped provider has multiple incidents: ' + provider);
    assert.match(await page.locator('dialog').innerText(), new RegExp('\\b' + members.length + ' incidents\\b', 'i'));
    const dates = members.map(id => records.find(r => r.id === id).date);
    assert.deepEqual(dates, [...dates].sort().reverse(), provider + ' incidents appear most recent first');
    if (provider === 'Cloudflare') {
      assert.deepEqual([...members].sort(), records.filter(r => /^Cloudflare\b/i.test(r.org)).map(r => r.id).sort());
    }
    return members;
  };
  const overview = await board.locator('.sector-summary').count() > 0;
  if (await board.evaluate(node => node.clientWidth < 520)) assert.ok(overview, 'A narrow map displays industries');
  if (overview) {
    assert.equal(await board.locator('.cell:visible').count(), 0, 'Industry overview has no micro tiles');
    for (const sectorButton of await sectors.all()) {
      const sector = await sectorButton.getAttribute('data-sector');
      await sectorButton.click();
      const mapped = await caseLinks.evaluateAll(ids);
      const groupButtons = page.locator('dialog .record-link[data-provider]');
      for (const group of await groupButtons.all()) {
        mapped.push(...await membersOf(group));
        await page.locator('#back').click();
      }
      await page.locator('#close').click();
      assert.deepEqual(mapped.sort(), records.filter(r => r.sector === sector).map(r => r.id).sort(),
        'Each industry opens all of its filtered incidents: ' + sector);
    }
  } else {
    const singles = board.locator('.cell[data-locate][data-case]:visible');
    const mapped = await singles.evaluateAll(ids);
    const groups = board.locator('.provider-group[data-provider]:visible');
    if (records.filter(r => /^Cloudflare\b/i.test(r.org)).length > 1) {
      assert.equal(await groups.filter({hasText:'Cloudflare'}).count(), 1, 'One Cloudflare tile for its incidents');
    }
    for (const group of await groups.all()) {
      const label = await group.getAttribute('aria-label');
      const members = await membersOf(group);
      assert.match(label, new RegExp('\\b' + members.length + ' incidents\\b', 'i'));
      mapped.push(...members);
      await page.locator('#close').click();
    }
    assert.deepEqual(mapped.sort(), expected, 'Each incident belongs to exactly one map tile');
    const single = singles.first();
    const id = await single.getAttribute('data-case');
    await single.click();
    await page.waitForFunction(id => document.activeElement?.id === 'atlas-case-' + id, id);
  }
  const disclosures = page.locator('#case-atlas details.atlas-provider');
  for (const item of await disclosures.all()) {
    assert.equal(await item.getAttribute('open'), null, 'Repeated providers start collapsed');
    await item.locator('summary').click();
  }
  assert.deepEqual(await details.evaluateAll(ids), expected, 'A detailed card for each incident');
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
  for (const item of await disclosures.all()) await item.locator('summary').click();
  await page.evaluate(() => window.scrollTo(0, 0));
}

async function checkPhone(page, engine, width) {
  const panes = page.locator('.phone-nav');
  assert.equal(await panes.isVisible(), true);
  await page.locator('#board [data-sector="Sport"]').tap();
  await page.locator('dialog .record-link[data-case="iihf-1117"]').tap();
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
    await page.locator('#clock-value').waitFor({ state: 'visible' });
    assert.ok(await page.evaluate(() => window.SITUATION.records.length > 0));
    assert.match(await page.locator('.credit').innerText(), /a dashboard by kram, built with string/i);
    assert.equal(await page.locator('#clock-name').textContent(), 'Time since we were reassured');
    const clockCases = await page.evaluate(() => {
      const edition=window.SITUATION, now=Date.now(), cutoff=Date.parse('2026-11-18T18:08:46.465Z');
      const clock=(records=edition.records,assessments=edition.officialAssessments,asOf=cutoff)=>
        window.DeskMetrics.clock(records,now,asOf,assessments);
      const current=clock();
      const future=structuredClone(edition.officialAssessments[0]);
      future.id='future-assessment';future.date=future.denial.when=new Date(now+86400000).toISOString();
      const missing=structuredClone(edition.officialAssessments[0]);missing.id='uncited-assessment';missing.sources=[];
      const newsroom=structuredClone(edition.officialAssessments[0]);newsroom.id='reporter-assessment';newsroom.denial.speakerRole='newsroom';
      const isolated=clock([],edition.officialAssessments);
      const priorCutoff=Date.parse('2026-11-17T23:59:59Z');
      const earlier=clock(edition.records,edition.officialAssessments,priorCutoff);
      return {record:current?.record.id,date:current?.when,unit:current?.unit,
        entries:current?.entries.map(e=>e.record.id),minutes:isolated?.value,isolated:isolated?.record.id,
        futureIgnored:clock([], [future])===null,missingIgnored:clock([], [missing])===null,
        newsroomIgnored:clock([], [newsroom])===null,earlier:earlier?.when};
    });
    assert.notEqual(clockCases.record,'apple-1117','Morning official assessments supersede Apple');
    assert.ok(clockCases.entries.includes('us-outages-clayton-1118'),'The morning hearing is visible');
    assert.equal(clockCases.date,'2026-11-18T17:25:00Z','The counter uses the latest timed report while retaining untimed claims');
    assert.equal(clockCases.unit,'hours : min : sec','The timer identifies elapsed time');
    assert.equal(clockCases.isolated,'us-outages-clayton-1118','Latest timed report selected when all times are known');
    assert.ok(clockCases.futureIgnored && clockCases.missingIgnored && clockCases.newsroomIgnored);
    assert.ok(clockCases.earlier?.startsWith('2026-11-17'),'Historical cutoff excludes morning reports');
    assert.match(await page.locator('#clock-value').textContent(), /^\d{2,}:\d{2}:\d{2}$/);
    const clockBefore=await page.locator('#clock-value').textContent();
    await page.waitForFunction(before=>document.querySelector('#clock-value').textContent!==before,clockBefore,{timeout:3500});
    assert.equal(await page.locator('main .reassurance-receipt').count(),0,'Quotes stay behind the clock');
    assert.equal(await page.locator('.map-caption').count(),0);
    assert.equal(await page.locator('#legend .update-key').count(),0);
    assert.equal(await page.locator('.board-actions').count(),0);
    await page.getByRole('button',{name:'How to read this map',exact:true}).click();
    await page.locator('dialog[open]').waitFor();
    assert.match(await page.locator('#dialog-body').innerText(), /tile size|larger tiles/i);
    assert.match(await page.locator('#dialog-body').innerText(), /No indication/);
    await page.getByRole('button',{name:'Read all incidents',exact:false}).click();
    assert.equal(await page.locator('dialog[open]').count(),0);
    await page.evaluate(()=>window.scrollTo(0,0));
    const tracked=await page.evaluate(()=>window.SITUATION.records.map(r=>r.id));
    assert.ok(tracked.includes('playstation-1118')&&tracked.includes('florida-dmv-1118'));

    assert.equal(await page.locator('#edition-mode').count(), 0);
    assert.ok(await page.locator('#page-title').evaluate(node => parseFloat(getComputedStyle(node).fontSize)) >= (mobile ? 26 : 30));
    await verifyMap(page);
    assert.equal(await page.locator('.hero-copy').isVisible(),true);
    assert.match(await page.locator('.hero-copy').innerText(), /I guess\? Maybe\? Idk\./);
    if(width>=1280){
      const intro=await page.evaluate(()=>{
        const title=document.querySelector('#page-title').getBoundingClientRect();
        const copy=document.querySelector('.hero-copy');
        const box=copy.getBoundingClientRect();
        return {titleRight:title.right,copyLeft:box.left,copyHeight:box.height,lineHeight:parseFloat(getComputedStyle(copy).lineHeight)};
      });
      assert.ok(intro.copyLeft>intro.titleRight,'Intro is beside the title on desktop');
      assert.ok(intro.copyHeight<=2*intro.lineHeight+1,'The desktop intro fits two lines: '+JSON.stringify(intro));
    }
    const order = await page.evaluate(() => ({
      map: document.querySelector('#board').getBoundingClientRect().top,
      mapBottom: document.querySelector('#board').getBoundingClientRect().bottom,
      footBottom: document.querySelector('.map-foot').getBoundingClientRect().bottom,
      atlas: document.querySelector('#case-atlas').getBoundingClientRect().top,
      news: document.querySelector('#developments').getBoundingClientRect().top,
      height: innerHeight
    }));
    assert.ok(order.map > 0 && order.mapBottom <= order.height-8 && order.footBottom <= order.height,
      'The full map and its footer fit the landing viewport: '+JSON.stringify(order));
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
    assert.match(await page.locator('#receipt-quote').innerText(), /98%/);
    assert.equal(await page.locator('#receipt-joke').count(),0);
    const firstReceipt=await page.locator('#receipt-quote').innerText();
    await page.getByRole('button',{name:'Next reassurance',exact:true}).click();
    assert.notEqual(await page.locator('#receipt-quote').innerText(),firstReceipt);
    assert.ok(await page.locator('#receipt-source').getAttribute('href'));
    await page.getByRole('button',{name:'Previous reassurance',exact:true}).click();
    assert.equal(await page.locator('#receipt-quote').innerText(),firstReceipt);
    assert.ok(await page.locator('#dialog-body a[href^="http"]').count());
    assert.match(await page.locator('#dialog-body').innerText(), /Jay Clayton/);
    assert.match(await page.locator('#dialog-body').innerText(), /Qualified|No indication/i);
    assert.match(await page.locator('#dialog-body').innerText(), /12:25|17:25/);
    await page.locator('#close').click();
    assert.equal(await page.locator('dialog[open]').count(), 0);
    if (width === 1366 && height === 900) {
      await page.evaluate(()=>window.scrollTo(0,0));
      await page.setViewportSize({width,height:700});
      await page.waitForFunction(()=>document.querySelector('#board').getBoundingClientRect().bottom<=innerHeight-8);
      assert.ok(await page.evaluate(()=>document.querySelector('.map-foot').getBoundingClientRect().bottom<=innerHeight));
      await page.setViewportSize({width,height});
      await page.waitForFunction(()=>document.querySelector('#board').getBoundingClientRect().bottom<=innerHeight-8);
    }
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
        for (const [width, height] of [[320, 690], [390, 844], [430, 932], [1024, 600], [1280, 720], [1366, 900], [1920, 1080]]) {
          await inspect(browser, engine, width, height);
        }
      } finally { await browser.close(); }
    }
  } finally { server.close(); }
}
run().catch(error => { console.error(error); process.exitCode = 1; });