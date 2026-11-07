const {chromium}=require('playwright');const assert=require('assert');
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});try{
const page=await browser.newPage({viewport:{width:390,height:900}});await page.setContent('<div id="extensionsMenu"></div>');await page.addStyleTag({path:__dirname+'/style.css'});
await page.evaluate(()=>{
 const chars=['甲','乙','丙','丁'].map((name,i)=>({name,avatar:i+'.png',chat:'initial'}));
 const context={characters:chars,characterId:0,getRequestHeaders:()=>({}),selectCharacterById:async(id,options)=>{window.jumpArgs=[id,options];context.characterId=id;chars[id].chat=options.chatFile;}};
 window.SillyTavern={getContext:()=>context};window.missing=false;
 window.fetch=async(url,options)=>{const body=JSON.parse(options.body),id=+body.avatar_url.split('.')[0];return {ok:true,json:async()=>url.includes('characters/chats')?(window.missing?[]:[{file_name:'first.jsonl'},{file_name:'branch.jsonl'}]):Array.from({length:4-id},(_,i)=>({mes:'message '+i,send_date:new Date(new Date().setHours(10,i,0,0)).toISOString(),is_user:i%2===0}))};};
});await page.addScriptTag({path:__dirname+'/index.js'});await page.click('#tcal-launch');await page.waitForFunction(()=>document.querySelector('#tcal footer').textContent.includes('已整理'));
assert.equal(await page.locator('.tc-podium>span').count(),3);assert((await page.locator('.tc-podium').innerText()).includes('甲 4 楼'));assert.equal(await page.locator('.tc-archives button').count(),8);
assert.equal(await page.locator('.tc-crown').count(),1);
const peaks=await page.evaluate(()=>TavernCalendar.busiestDays({'2026-01-01':{a:{user:2,char:3}},'2026-01-02':{a:{user:1,char:4}},'2026-02-01':{a:{user:99,char:99}}},'2026-01'));
assert.deepEqual(peaks,{dates:['2026-01-01','2026-01-02'],total:5});
assert.deepEqual(await page.evaluate(()=>TavernCalendar.busiestDays({},'2026-01')),{dates:[],total:0});
const ranks=await page.evaluate(()=>TavernCalendar.monthlyRanks({'2026-01-01':{a:{avatar:'a',name:'A',user:2,char:3}},'2026-02-01':{b:{avatar:'b',name:'B',user:99,char:1}}},'2026-01'));assert.equal(ranks.length,1);assert.equal(ranks[0].total,5);
await page.getByRole('button',{name:'上个月',exact:true}).click();assert.equal(await page.locator('.tc-podium>span').count(),0);await page.getByRole('button',{name:'今天',exact:true}).click();
await page.evaluate(()=>window.missing=true);await page.locator('.tc-archives button').first().click();await page.waitForFunction(()=>document.querySelector('#tcal footer').textContent.includes('存档已删除'));assert.equal(await page.evaluate(()=>window.jumpArgs),undefined);
await page.evaluate(()=>window.missing=false);await page.locator('.tc-archives button[data-avatar="1.png"][data-file="branch"]').click();await page.waitForFunction(()=>!document.querySelector('#tcal'));assert.deepEqual(await page.evaluate(()=>window.jumpArgs),[1,{chatFile:'branch'}]);
await page.click('#tcal-launch');assert(await page.evaluate(()=>document.querySelector('.tc-shell').scrollWidth<=document.querySelector('.tc-shell').clientWidth));assert(await page.locator('.tc-signature').isVisible());assert(await page.locator('.tc-more').evaluateAll(nodes=>nodes.every(n=>{const cell=n.closest('.tc-day').getBoundingClientRect(),r=n.getBoundingClientRect();return r.bottom<=cell.bottom-5&&r.top>=cell.top+60;})));await page.screenshot({path:__dirname+'/preview-features.png'});console.log('PASS monthly ranks, deduped archive links, deleted archive, cross-character jump, month navigation, mobile layout');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1)});
