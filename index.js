(() => {
 'use strict';
 if (window.TavernCalendar) return;
 const ctx = () => window.SillyTavern?.getContext();
 const key = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
 function dateOf(v) {
   if (v == null || v === '') return null;
   if(typeof v==='string') v=v.replace(/(\d{1,2})h(\d{2})m(\d{2})s/, '$1:$2:$3').replace(/(\d)(am|pm)$/i,'$1 $2');
   const m = typeof v === 'string' && v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})[ @]+(\d{1,2})[：:](\d{2})[：:](\d{2})(?:[：:.](\d+))?$/);
   const d = m ? new Date(+m[1],+m[2]-1,+m[3],+m[4],+m[5],+m[6],+(m[7]||0)) : new Date(v);
   return Number.isFinite(d.getTime()) ? d : null;
 }
 const esc = s => String(s ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const color = s => {let h=0; for(const c of s) h=(h*31+c.charCodeAt(0))|0; return `hsl(${Math.abs(h)%360} 58% 46%)`;};
 let view='month', progress=0;
 let days={}, selected=key(new Date()), month=new Date(new Date().getFullYear(),new Date().getMonth(),1), busy=false, status='点击刷新，读取历史聊天', scanned=false, lastFocus;
 function aggregate(target, seen, char, messages, fileName='') {
   for(const m of messages) {
     if(typeof m?.mes!=='string'||m.is_system) continue;
     const d=dateOf(m.send_date); if(!d) continue;
     const fingerprint=JSON.stringify([d.getTime(),!!m.is_user,m.mes]);
     const bucket=target[key(d)] ||= {};
     const item=bucket[char.avatar] ||= {name:char.name,avatar:char.avatar,user:0,char:0,first:d.getTime(),last:d.getTime(),files:[]};
     if(fileName&&!item.files.includes(fileName))item.files.push(fileName);
     if(seen.has(fingerprint)) continue; seen.add(fingerprint);
     item[m.is_user?'user':'char']++; item.first=Math.min(item.first,d.getTime()); item.last=Math.max(item.last,d.getTime());
   }
 }
 function monthlyRanks(data, prefix){
   const totals=new Map();
   for(const [day,chars] of Object.entries(data)){
     if(!day.startsWith(prefix+'-'))continue;
     for(const r of Object.values(chars)){
       const item=totals.get(r.avatar)||{avatar:r.avatar,name:r.name,total:0};
       item.total+=r.user+r.char;totals.set(r.avatar,item);
     }
   }
   return [...totals.values()].filter(r=>r.total>0).sort((a,b)=>b.total-a.total||a.avatar.localeCompare(b.avatar,'zh-CN')).slice(0,3);
 }
 let jumping=false;
 async function jumpToChat(avatar,fileName){
   if(jumping)return; jumping=true;
   status='正在打开聊天存档…';render();
   try{
     const context=ctx();
     const id=(context?.characters||[]).findIndex(c=>c?.avatar===avatar);
     if(id<0)throw Error('角色已不存在，请刷新记录');
     const list=await post('/api/characters/chats',{avatar_url:avatar});
     if(!Object.values(list||{}).some(f=>f?.file_name?.replace(/\.jsonl?$/i,'')===fileName))throw Error('存档已删除或改名，请刷新记录');
     if(context.isGenerating)throw Error('请等待当前回复生成完成后再跳转');
     if(typeof context.selectCharacterById==='function')await context.selectCharacterById(id,{chatFile:fileName});
     else{
       scriptModule ||= import('/script.js').catch(()=>null);
       const mod=await scriptModule;
       if(typeof mod?.openCharacterChat!=='function')throw Error('此版本不支持存档跳转');
       await mod.openCharacterChat(fileName,avatar);
     }
     const after=ctx();
     if(String(after?.characterId)!==String(id)||after?.characters?.[id]?.chat!==fileName)throw Error('未完成切换，聊天可能正在生成或保存，请稍后重试');
     status='已打开聊天存档';close();
   }catch(error){status=`跳转失败：${error.message}`;render();}
   finally{jumping=false;render();}
 }
 let scriptModule;
 async function post(path,body) {
   let headers=ctx()?.getRequestHeaders?.();
   if(!headers){scriptModule ||= import('/script.js').catch(()=>null);headers=(await scriptModule)?.getRequestHeaders?.();}
   const response=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body),signal:AbortSignal.timeout(30000)});
   if(!response.ok) throw Error(`HTTP ${response.status}`);
   const data=await response.json(); if(data?.error) throw Error('读取失败'); return data;
 }
 async function refresh() {
   if(busy)return;
   const chars=(ctx()?.characters||[]).filter(c=>c?.avatar);
   if(!chars.length){status='角色列表尚未就绪，请打开角色列表后刷新';render();return;}
   busy=true;progress=0;status='正在查找聊天存档…';render();
   const next={},jobs=[];let errors=0,completed=0;
   try{
     for(let i=0;i<chars.length;i++){
       const char=chars[i];
       try{const list=await post('/api/characters/chats',{avatar_url:char.avatar});
         for(const file of Object.values(list||{}))if(file?.file_name)jobs.push({char,file:file.file_name.replace(/\.jsonl?$/i,'')});
       }catch{errors++;}
       progress=Math.round((i+1)/chars.length*15);status='查找存档 · '+(i+1)+' / '+chars.length+' 位角色';render();
     }
     const seenByChar=new Map();
     for(const {char,file} of jobs){
       status='正在读取 '+char.name+' · '+completed+' / '+jobs.length+' 个存档';render();
       try{
         const data=await post('/api/chats/get',{ch_name:char.name,avatar_url:char.avatar,file_name:file});
         const messages=Array.isArray(data)?data:Array.isArray(data?.chat)?data.chat:Array.isArray(data?.messages)?data.messages:Object.values(data||{});
         if(!seenByChar.has(char.avatar))seenByChar.set(char.avatar,new Set());
         aggregate(next,seenByChar.get(char.avatar),char,messages,file);
       }catch{errors++;}
       completed++;progress=Math.round(15+completed/Math.max(1,jobs.length)*85);render();
     }
     days=next;scanned=true;progress=100;
     status=errors?'部分记录读取失败（'+errors+' 项），可刷新重试':'已整理 '+Object.keys(days).length+' 天的足迹 · '+new Date().toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'})+' 更新';
   }finally{busy=false;render();}
 }
 function yearSummary(data,year){
   const months=Array.from({length:12},(_,i)=>({month:i+1,total:0,days:0,chars:new Set()}));
   for(const [day,rows] of Object.entries(data)){
     if(!day.startsWith(year+'-'))continue;
     const entry=months[Number(day.slice(5,7))-1];if(!entry)continue;
     let total=0;
     for(const r of Object.values(rows)){const n=r.user+r.char;total+=n;if(n>0)entry.chars.add(r.avatar);}
     entry.total+=total;if(total>0)entry.days++;
   }
   const top=months.filter(m=>m.total>0).sort((a,b)=>b.total-a.total||a.month-b.month).slice(0,3);
   return months.map(m=>({...m,chars:m.chars.size,rank:top.indexOf(m)+1}));
 }
 function annualHTML(){
   const months=yearSummary(days,month.getFullYear()),max=Math.max(1,...months.map(m=>m.total));
   const total=months.reduce((a,m)=>a+m.total,0),active=months.reduce((a,m)=>a+m.days,0);
   return '<div class="tc-year-summary"><b>'+total.toLocaleString()+'<small> 楼年度对话</small></b><span>'+active+' 天相伴 · '+months.filter(m=>m.total>0).length+' 个活跃月份</span></div><div class="tc-year-chart" aria-label="全年各月聊天楼数">'+months.map(m=>'<button class="tc-year-row" data-action="pick-month" data-month="'+m.month+'" aria-label="'+m.month+'月，'+m.total+'楼'+(m.rank?'，年度第'+m.rank+'名':'')+'"><span>'+m.month+'月</span><span class="tc-bar-track"><span class="tc-bar tc-rank-'+m.rank+'" style="width:'+m.total/max*100+'%"></span></span><strong>'+m.total.toLocaleString()+' <small>楼</small></strong><span class="tc-year-medal">'+(m.rank?['🥇','🥈','🥉'][m.rank-1]:'')+'</span></button>').join('')+'</div><p class="tc-year-hint">条形长度表示该月总楼数；点击月份查看日历。仅有聊天的月份参与颁奖，同分按月份先后排序。</p>';
 }
 function busiestDays(data,prefix){
   let max=0;const dates=[];
   for(const [day,rows] of Object.entries(data)){
     if(!day.startsWith(prefix+'-'))continue;
     const total=Object.values(rows).reduce((sum,r)=>sum+r.user+r.char,0);
     if(total>max){max=total;dates.length=0;dates.push(day);}
     else if(total>0&&total===max)dates.push(day);
   }
   return {dates,total:max};
 }
 function render() {
   const root=document.querySelector('#tcal'); if(!root)return;
   const title=`<label><input data-period="year" aria-label="年份" type="number" min="100" max="9999" value="${month.getFullYear()}">年</label>${view==='month'?`<label><input data-period="month" aria-label="月份" type="number" min="1" max="12" value="${month.getMonth()+1}">月</label>`:''}`;
   const leaders=monthlyRanks(days,key(month).slice(0,7));
   const busiest=busiestDays(days,key(month).slice(0,7));
   const badge=avatar=>{const rank=leaders.findIndex(r=>r.avatar===avatar);return rank<0?'':`<span class="tc-medal" title="${month.getMonth()+1}月第${rank+1}名 · ${leaders[rank].total}楼" aria-label="本月第${rank+1}名">${['🥇','🥈','🥉'][rank]}</span>`;};
   const start=new Date(month.getFullYear(),month.getMonth(),1); start.setDate(1-(start.getDay()+6)%7);
   let cells='';
   for(let i=0;i<42;i++){
     const d=new Date(start);d.setDate(start.getDate()+i); const k=key(d), rows=Object.values(days[k]||{});
     cells+=`<button class="tc-day ${d.getMonth()!==month.getMonth()?'tc-out':''} ${k===selected?'tc-selected':''} ${k===key(new Date())?'tc-today':''}" data-day="${k}" aria-label="${k}，${rows.length} 位角色" aria-pressed="${k===selected}"><span class="tc-number ${busiest.dates.includes(k)?'tc-royal':''}"><span class="tc-date-label">${d.getDate()}</span>${busiest.dates.includes(k)?`<span class="tc-crown" title="当月聊天最多的一天 · ${busiest.total} 楼" aria-label="当月聊天最多的一天，${busiest.total}楼"><svg viewBox="0 0 40 34" aria-hidden="true" focusable="false"><path class="tc-crown-body" d="M3 8Q2 6 4 7L12 12L19 3Q20 1 21 3L28 12L36 7Q38 6 37 8L34.5 28Q20 33 5.5 28Z"/><path class="tc-crown-base" d="M7 27Q20 30.5 33 27" fill="none" stroke-linecap="round"/></svg></span>`:''}</span><span class="tc-events">${rows.slice(0,2).map(r=>`<span class="tc-chip" style="--char-color:${color(r.avatar)}">${badge(r.avatar)}${esc(r.name)}</span>`).join('')}${rows.length>2?`<span class="tc-more">+${rows.length-2} 位</span>`:''}</span><span class="tc-dots">${rows.slice(0,4).map(r=>`<i style="background:${color(r.avatar)}"></i>`).join('')}</span></button>`;
   }
   const rows=Object.values(days[selected]||{}).sort((a,b)=>a.first-b.first), total=rows.reduce((s,r)=>s+r.user+r.char,0);
   const date=new Date(selected+'T12:00:00');
   const time=t=>new Date(t).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'});
   root.innerHTML=`<section class="tc-shell" role="dialog" aria-modal="true" aria-label="酒馆日历"><header><div><span class="tc-eyebrow">与你的每一天</span><h1>📅 酒馆日历<span class="tc-title-meta">Calendar<small class="tc-signature">by ichiko</small></span></h1></div><button data-action="close" class="tc-close" aria-label="关闭日历">×</button></header><div class="tc-tabs"><button data-action="month-view" aria-pressed="${view==='month'}">月历</button><button data-action="year-view" aria-pressed="${view==='year'}">全年回看</button></div><div class="tc-body"><main><nav><h2>${title}</h2><div><button data-action="prev" aria-label="${view==='year'?'上一年':'上个月'}">‹</button><button data-action="today">今天</button><button data-action="next" aria-label="${view==='year'?'下一年':'下个月'}">›</button></div></nav><div class="tc-podium" aria-label="本月聊天前三名">${leaders.map((r,i)=>`<span title="同楼数按角色标识排序">${['🥇','🥈','🥉'][i]} ${esc(r.name)} <small>${r.total} 楼</small></span>`).join('')}</div><div class="tc-week">${['一','二','三','四','五','六','日'].map(x=>`<span>${x}</span>`).join('')}</div><div class="tc-grid">${cells}</div></main><aside><div class="tc-date">${date.toLocaleDateString('zh-CN',{month:'long',day:'numeric',weekday:'long'})}</div><h2>这一天的相伴</h2><p class="tc-summary">${rows.length} 位角色 <span>·</span> ${total} 楼对话</p><div class="tc-agenda">${rows.length?rows.map(r=>`<article style="--char-color:${color(r.avatar)}"><div class="tc-time">${time(r.first)}<small>${time(r.last)}</small></div><div class="tc-card"><strong>${esc(r.name)}${badge(r.avatar)}</strong><b>${r.user+r.char}<small> 楼</small></b><p>你 ${r.user} 楼 · 角色 ${r.char} 楼</p><div class="tc-archives">${(r.files||[]).map(file=>`<button data-action="jump" data-avatar="${esc(r.avatar)}" data-file="${esc(file)}" ${jumping?'disabled':''} title="打开此聊天存档">↗ ${esc(file)}</button>`).join('')}</div></div></article>`).join(''):`<div class="tc-empty"><span>☷</span><p>${busy?'正在寻找聊天足迹…':scanned?'这一天，还没有聊天足迹':'把和 TA 的日常，收进日历'}</p><small>每一次对话，都是相伴的印记。</small></div>`}</div></aside></div><footer><span role="status">${esc(status)}</span><button data-action="refresh" ${busy?'disabled':''}>${busy?'整理中…':'↻ 刷新记录'}</button></footer><div class="tc-note">按本机时区统计单人聊天；双方每条消息各计 1 楼，不含系统消息。相同时间、身份与正文的分支副本只计一次。重生成的候选回复不额外计数。</div></section>`;
   if(view==='year'){
     const body=root.querySelector('.tc-body');body.classList.add('tc-year-body');
     const main=body.querySelector('main'),nav=main.querySelector('nav');main.replaceChildren(nav);
     main.insertAdjacentHTML('beforeend',annualHTML());body.querySelector('aside').remove();
   }
   if(busy){
     root.querySelector('.tc-body').innerHTML=`<div class="tc-loading"><span class="tc-load-icon">📅</span><h2>${scanned?'正在更新聊天足迹':'正在整理你的聊天足迹'}</h2><p>${esc(status)}</p><div class="tc-progress" role="progressbar" aria-label="聊天记录读取进度" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${progress}"><span style="width:${progress}%"></span></div><strong>${progress}%</strong><small>首次读取可能需要一点时间，完成后自动显示。</small></div>`;
     root.querySelector('.tc-body').className='tc-body tc-loading-body';
     root.querySelectorAll('.tc-tabs button').forEach(b=>b.disabled=true);
   }
 }
 function close(){document.querySelector('#tcal')?.remove();lastFocus?.focus();}
 function open(){if(document.querySelector('#tcal'))return;lastFocus=document.activeElement;const root=document.createElement('div');root.id='tcal';document.body.append(root);root.addEventListener('click',e=>{if(e.target===root){close();return;}const b=e.target.closest('button');if(!b)return;if(b.dataset.day){selected=b.dataset.day;month=new Date(selected+'T12:00:00');month.setDate(1);render();return;}switch(b.dataset.action){case'month-view':view='month';render();break;case'year-view':view='year';render();break;case'pick-month':month.setMonth(Number(b.dataset.month)-1);selected=key(month);view='month';render();break;case'jump':jumpToChat(b.dataset.avatar,b.dataset.file);break;case'close':close();break;case'prev':view==='year'?month.setFullYear(month.getFullYear()-1):month.setMonth(month.getMonth()-1);selected=key(month);render();break;case'next':view==='year'?month.setFullYear(month.getFullYear()+1):month.setMonth(month.getMonth()+1);selected=key(month);render();break;case'today':selected=key(new Date());month=new Date(new Date().getFullYear(),new Date().getMonth(),1);render();break;case'refresh':refresh();}});root.addEventListener('change',e=>{if(!e.target.matches('input[data-period]'))return;const n=Number(e.target.value),isYear=e.target.dataset.period==='year';if(!Number.isInteger(n)||n<(isYear?100:1)||n>(isYear?9999:12)){e.target.value=isYear?month.getFullYear():month.getMonth()+1;return;}if(isYear)month.setFullYear(n);else month.setMonth(n-1);selected=key(month);render();});root.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target.matches('input[data-period]')){e.preventDefault();e.target.blur();}if(e.key==='Escape')close();if(e.key==='Tab'){const items=[...root.querySelectorAll('button:not(:disabled),input:not(:disabled)')];if(e.shiftKey&&document.activeElement===items[0]){e.preventDefault();items.at(-1).focus();}else if(!e.shiftKey&&document.activeElement===items.at(-1)){e.preventDefault();items[0].focus();}}});render();root.querySelector('button').focus();if(!scanned)refresh();}
 function mount(){
   const host=document.querySelector('#extensionsMenu')||document.querySelector('#extensions_menu');
   if(host&&!document.querySelector('#tcal-launch')){
     const b=document.createElement('div');b.id='tcal-launch';b.className='list-group-item flex-container flexGap5';b.setAttribute('role','button');b.tabIndex=0;
     b.innerHTML='<span class="extensionsMenuExtensionButton">📅</span><span>酒馆日历</span>';
     b.onclick=open;b.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();open();}};host.append(b);
   }
   const settings=document.querySelector('#extensions_settings2')||document.querySelector('#extensions_settings');
   if(settings&&!document.querySelector('#tcal-settings')){
     const panel=document.createElement('div');panel.id='tcal-settings';panel.className='extension_container';
     panel.innerHTML='<div class="inline-drawer"><div class="inline-drawer-toggle inline-drawer-header"><b>📅 酒馆日历</b><div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div></div><div class="inline-drawer-content"><p>按天回看和角色的聊天足迹。</p><button type="button" class="menu_button" id="tcal-settings-open">打开酒馆日历</button><small>也可从输入框旁的扩展快捷菜单打开。</small></div></div>';
     panel.querySelector('button').onclick=open;settings.append(panel);
   }
 }
 function boot(){mount();const observer=new MutationObserver(mount);observer.observe(document.body,{childList:true,subtree:true});}
 window.TavernCalendar={open,refresh,dateOf,aggregate,monthlyRanks,yearSummary,busiestDays};
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
