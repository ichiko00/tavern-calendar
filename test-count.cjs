const { chromium } = require('playwright');
const assert = require('assert');
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent('<div id="extensionsMenu"></div>');
    await page.addStyleTag({ path: __dirname + '/style.css' });
    await page.evaluate(() => {
      window.SillyTavern = { getContext: () => ({ characters: [{ name: 'A', avatar: 'a.png' }], getRequestHeaders: () => ({}) }) };
      window.fetch = async url => ({ ok: true, json: async () => url.includes('characters/chats') ? [{ file_name: 'main.jsonl' }, { file_name: 'branch.jsonl' }] : [
        { mes: 'user', is_user: true, send_date: 'November 10, 2026 9:58am' },
        { mes: 'hidden user', is_user: true, is_system: true, send_date: '2026-11-10T02:00:00Z' },
        { mes: 'hidden assistant', is_system: true, send_date: '2026-11-10T02:01:00Z' },
      ] });
    });
    await page.addScriptTag({ path: __dirname + '/index.js' });
    await page.click('#tcal-launch');
    await page.waitForFunction(() => document.querySelector('footer').textContent.includes('共 6 楼'));
    await page.locator('[data-merge-copies]').check();
    await page.waitForFunction(() => document.querySelector('footer').textContent.includes('共 3 楼'));
    await page.locator('[data-merge-copies]').uncheck();
    await page.waitForFunction(() => document.querySelector('footer').textContent.includes('共 6 楼'));
    console.log('PASS original archive floors, hidden messages, English date, optional branch merging');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
