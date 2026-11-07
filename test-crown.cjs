const {chromium}=require('playwright');const assert=require('assert');
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});try{for(const width of [320,390,1200]){
const page=await browser.newPage({viewport:{width,height:1000}});await page.setContent('<div id="extensionsMenu"></div>');await page.addStyleTag({path:__dirname+'/style.css'});
await page.evaluate(()=>{window.SillyTavern={getContext:()=>({characters:[{name:'林间晚风',avatar:'a.png'}],getRequestHeaders:()=>({})})};window.fetch=async url=>({ok:true,json:async()=>url.includes('characters/chats')?[{file_name:'one.jsonl'}]:[16,28].map(day=>({mes:'hello',send_date:new Date(new Date().getFullYear(),new Date().getMonth(),day,12).toISOString(),is_user:true}))});});
await page.addScriptTag({path:__dirname+'/index.js'});await page.click('#tcal-launch');await page.waitForFunction(()=>!document.querySelector('[role=progressbar]')&&document.querySelector('.tc-crown'));
await page.locator('.tc-day').filter({has:page.locator('.tc-date-label',{hasText:/^16$/})}).click();
assert.equal(await page.locator('.tc-royal').count(),2);assert.equal(await page.locator('.tc-selected').evaluate(el=>getComputedStyle(el).boxShadow),'none');
assert(await page.locator('.tc-royal').evaluateAll(nodes=>nodes.every(el=>{const label=el.querySelector('.tc-date-label').getBoundingClientRect(),crown=el.querySelector('svg').getBoundingClientRect(),cell=el.closest('.tc-day').getBoundingClientRect();return label.left>=crown.left+7&&label.right<=crown.right-7&&label.bottom<=crown.bottom-3&&crown.left>=cell.left&&crown.right<=cell.right;})));
await page.screenshot({path:__dirname+`/crown-redesign-${width}.png`});await page.close();console.log('PASS',width,'two-digit 16/28 within crown, selected without border shadow');
}}finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1)});
