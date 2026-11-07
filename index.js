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
 let days={}, selected=key(new Date()), month=new Date(new Date().getFullYear(),new Date().getMonth(),1), busy=false, status='点击刷新，读取历史聊天', scanned=false, lastFocus;
 function aggregate(target, seen, char, messages) {
   for(const m of messages) {
     if(typeof m?.mes!=='string'||m.is_system) continue;
     const d=dateOf(m.send_date); if(!d) continue;
     const fingerprint=JSON.stringify([d.getTime(),!!m.is_user,m.mes]);
     if(seen.has(fingerprint)) continue; seen.add(fingerprint);
     const bucket=target[key(d)] ||= {};
     const item=bucket[char.avatar] ||= {name:char.name,avatar:char.avatar,user:0,char:0,first:d.getTime(),last:d.getTime()};
     item[m.is_user?'user':'char']++; item.first=Math.min(item.first,d.getTime()); item.last=Math.max(item.last,d.getTime());
   }
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
   if(busy) return;
   const chars=(ctx()?.characters||[]).filter(c=>c?.avatar);
   if(!chars.length){status='角色列表尚未就绪，请打开角色列表后刷新';render();return;}
   busy=true; const next={}; let errors=0, done=0;
   try {
     for(const char of chars) {
       status=`正在整理 ${++done} / ${chars.length} · ${char.name}`; render();
       const seen=new Set();
       try {
         const list=await post('/api/characters/chats',{avatar_url:char.avatar});
         for(const file of Object.values(list||{})) {
           if(!file?.file_name) continue;
           try {
             const data=await post('/api/chats/get',{ch_name:char.name,avatar_url:char.avatar,file_name:file.file_name.replace(/\.jsonl?$/i,'')});
             const messages=Array.isArray(data)?data:Array.isArray(data?.chat)?data.chat:Array.isArray(data?.messages)?data.messages:Object.values(data||{});
             aggregate(next,seen,char,messages);
           } catch {errors++;}
         }
       } catch {errors++;}
     }
     days=next; scanned=true;
     status=errors?`部分记录读取失败（${errors} 项），可刷新重试`:`已整理 ${Object.keys(days).length} 天的足迹 · ${new Date().toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'})} 更新`;
   } finally {busy=false;render();}
 }
 function render() {
   const root=document.querySelector('#tcal'); if(!root)return;
   const title=`${month.getFullYear()}年 ${month.getMonth()+1}月`;
   const start=new Date(month.getFullYear(),month.getMonth(),1); start.setDate(1-(start.getDay()+6)%7);
   let cells='';
   for(let i=0;i<42;i++){
     const d=new Date(start);d.setDate(start.getDate()+i); const k=key(d), rows=Object.values(days[k]||{});
     cells+=`<button class="tc-day ${d.getMonth()!==month.getMonth()?'tc-out':''} ${k===selected?'tc-selected':''} ${k===key(new Date())?'tc-today':''}" data-day="${k}" aria-label="${k}，${rows.length} 位角色" aria-pressed="${k===selected}"><span class="tc-number">${d.getDate()}</span><span class="tc-events">${rows.slice(0,2).map(r=>`<span class="tc-chip" style="--char-color:${color(r.avatar)}">${esc(r.name)}</span>`).join('')}${rows.length>2?`<span class="tc-more">+${rows.length-2} 位</span>`:''}</span><span class="tc-dots">${rows.slice(0,4).map(r=>`<i style="background:${color(r.avatar)}"></i>`).join('')}</span></button>`;
   }
   const rows=Object.values(days[selected]||{}).sort((a,b)=>a.first-b.first), total=rows.reduce((s,r)=>s+r.user+r.char,0);
   const date=new Date(selected+'T12:00:00');
   const time=t=>new Date(t).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'});
   root.innerHTML=`<section class="tc-shell" role="dialog" aria-modal="true" aria-label="酒馆日历"><header><div><span class="tc-eyebrow">与你的每一天</span><h1>酒馆日历<span>Calendar</span></h1></div><button data-action="close" class="tc-close" aria-label="关闭日历">×</button></header><div class="tc-body"><main><nav><h2>${title}</h2><div><button data-action="prev" aria-label="上个月">‹</button><button data-action="today">今天</button><button data-action="next" aria-label="下个月">›</button></div></nav><div class="tc-week">${['一','二','三','四','五','六','日'].map(x=>`<span>${x}</span>`).join('')}</div><div class="tc-grid">${cells}</div></main><aside><div class="tc-date">${date.toLocaleDateString('zh-CN',{month:'long',day:'numeric',weekday:'long'})}</div><h2>这一天的相伴</h2><p class="tc-summary">${rows.length} 位角色 <span>·</span> ${total} 楼对话</p><div class="tc-agenda">${rows.length?rows.map(r=>`<article style="--char-color:${color(r.avatar)}"><div class="tc-time">${time(r.first)}<small>${time(r.last)}</small></div><div class="tc-card"><strong>${esc(r.name)}</strong><b>${r.user+r.char}<small> 楼</small></b><p>你 ${r.user} 楼 · 角色 ${r.char} 楼</p></div></article>`).join(''):`<div class="tc-empty"><span>☷</span><p>${busy?'正在寻找聊天足迹…':scanned?'这一天，还没有聊天足迹':'把和 TA 的日常，收进日历'}</p><small>每一次对话，都是相伴的印记。</small></div>`}</div></aside></div><footer><span role="status">${esc(status)}</span><button data-action="refresh" ${busy?'disabled':''}>${busy?'整理中…':'↻ 刷新记录'}</button></footer><div class="tc-note">按本机时区统计单人聊天；双方每条消息各计 1 楼，不含系统消息。相同时间、身份与正文的分支副本只计一次。重生成的候选回复不额外计数。</div></section>`;
 }
 function close(){document.querySelector('#tcal')?.remove();lastFocus?.focus();}
 function open(){if(document.querySelector('#tcal'))return;lastFocus=document.activeElement;const root=document.createElement('div');root.id='tcal';document.body.append(root);root.addEventListener('click',e=>{if(e.target===root){close();return;}const b=e.target.closest('button');if(!b)return;if(b.dataset.day){selected=b.dataset.day;render();return;}switch(b.dataset.action){case'close':close();break;case'prev':month.setMonth(month.getMonth()-1);render();break;case'next':month.setMonth(month.getMonth()+1);render();break;case'today':selected=key(new Date());month=new Date(new Date().getFullYear(),new Date().getMonth(),1);render();break;case'refresh':refresh();}});root.addEventListener('keydown',e=>{if(e.key==='Escape')close();if(e.key==='Tab'){const items=[...root.querySelectorAll('button:not(:disabled)')];if(e.shiftKey&&document.activeElement===items[0]){e.preventDefault();items.at(-1).focus();}else if(!e.shiftKey&&document.activeElement===items.at(-1)){e.preventDefault();items[0].focus();}}});render();root.querySelector('button').focus();if(!scanned)refresh();}
 function mount(){if(document.querySelector('#tcal-launch'))return;const host=document.querySelector('#extensions_menu');if(!host)return;const b=document.createElement('button');b.id='tcal-launch';b.className='list-group-item flex-container flexGap5';b.textContent='▦ 酒馆日历';b.onclick=open;host.append(b);}
 window.TavernCalendar={open,refresh,dateOf,aggregate};mount();const observer=new MutationObserver(mount);observer.observe(document.body,{childList:true,subtree:true});
})();
