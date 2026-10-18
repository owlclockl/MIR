// GPL-3.0-or-later. RTWG simulation workbench, isolated from existing saved maps.
import { escapeHtml as esc } from '../ui/dom.js';
import { createRtwgEngine } from './engine.js';
import { FIELDS, LABELS, PARAMETERS, PARAM_LABELS, defaultParameters } from './config.js';
import { decodeSnapshot, encodeSnapshot, MAX_FILE_BYTES } from './snapshot.js';
import { download, pngFields } from './export.js';
import sourceUrl from './sages-source.zip?url';
import { RTWG_NOTICES } from './licenses.js';

export function mountRtwgView(host, { config, initialSnapshot = null, onSnapshot = () => {}, onApply, onExit = () => {} }) {
  const element=document.createElement('section'); element.className='rtwg-view'; element.setAttribute('aria-label','RTWG — симулятор мира');
  element.innerHTML=`<div class="rtwg-workspace"><header><strong>RTWG <small>REAL-TIME WORLD GENERATION</small></strong><span>GPLv3 · WebGL2 + WASM</span></header>
    <div class="rtwg-notice">Отдельный мир RTWG. Старая карта не меняется, пока ты явно не перенесёшь рельеф в редактор.</div>
    <div class="rtwg-toolbar">
      <button type="button" data-rtwg="run">▶ Запуск</button><button type="button" data-rtwg="step">Шаг</button><button type="button" data-rtwg="evolve">32 шага плит</button>
      <label>Слой <select data-control="field">${LABELS.map((l,i)=>`<option value="${i}">${l}</option>`).join('')}</select></label>
      <label><input type="checkbox" data-control="threeD"> 3D-обзор</label><button type="button" data-rtwg="exit">К карте</button>
    </div><div class="rtwg-stage"><canvas class="rtwg-canvas" tabindex="0" aria-label="RTWG: в 3D перетаскивание — орбита, Shift — сдвиг, колесо — масштаб, WASD — движение"></canvas><output class="rtwg-status" aria-live="polite">Загрузка RTplatec…</output></div>
    <p class="rtwg-error" role="alert" hidden></p>
    <div class="rtwg-toolbar"><button type="button" data-rtwg="image">PNG вида</button><button type="button" data-rtwg="png">Все 8 PNG (ZIP)</button><button type="button" data-rtwg="save">Сохранить RTWG</button><button type="button" data-rtwg="load">Открыть RTWG</button><button type="button" data-rtwg="heightmap">Импорт высот PNG</button><button type="button" data-rtwg="apply" ${onApply?'':'disabled'}>Рельеф → редактор</button></div>
    <p class="rtwg-hint">2D — карта сверху. 3D: мышь — орбита, Shift — сдвиг, колесо — приближение, WASD — движение. Масштаб высоты влияет только на вид. RTWG моделирует глобальное поле, а не каждый метр планеты.</p>
    <input type="file" data-file="snapshot" accept=".json,application/json" hidden><input type="file" data-file="heightmap" accept="image/png" hidden>
  </div><aside class="rtwg-controls"><details open><summary>Мир · тектоника</summary><label>Seed <input data-control="seed" maxlength="200" value="${esc(initialSnapshot?.seed || config.seed || 'SAGES-RTWG')}"></label><label>Глобальная сетка <select data-control="resolution">${[64,128,256,512].map(n=>`<option value="${n}" ${n===(initialSnapshot?.width||256)?'selected':''}>${n} × ${n/2}${n===512?' · больше памяти':''}</option>`).join('')}</select></label><button type="button" data-rtwg="restart">Перезапуск по seed</button><button type="button" data-rtwg="new">Новый мир</button><label><input type="checkbox" data-control="tectonic"> Движение плит (вода приостановлена)</label><button type="button" data-rtwg="plates">Новые плиты</button><p>Доля океана, число плит и шероховатость применяются при перезапуске. Слияние и складчатость — сразу.</p><div data-parameters="tectonic"></div></details>
    ${FIELDS.map((f,i)=>`<details><summary>${LABELS[i]}</summary><label><input type="checkbox" data-enabled="${f}" checked> Симуляция включена</label><button type="button" data-reset="${f}">Сбросить поле</button><div data-parameters="${f}"></div>${f==='wind'?'<button type="button" data-rtwg="distortion">Новое возмущение</button>':''}</details>`).join('')}
    <details><summary>3D · свет и поверхность</summary>${[['heightScale','Высота (только вид)',.65,.1,5,.05],['terrainScale','Размер поверхности',1,.1,5,.1],['waterSpeed','Анимация воды',5,0,10,.1],['lightX','Свет: X',-4,-10,10,.5],['lightY','Свет: высота',7,.5,15,.5],['lightZ','Свет: Z',3,-10,10,.5]].map(([k,l,v,min,max,step])=>`<label>${l}<input type="number" data-render="${k}" value="${v}" min="${min}" max="${max}" step="${step}"></label>`).join('')}</details>
    <details><summary>Импорт PNG · диапазон</summary><p>Яркость PNG задаёт высоту от минимума до максимума. Карта пересчитывается до выбранной сетки.</p><label>Минимум <input type="number" data-control="heightMin" value="0.1" min="0.001" max="20" step="0.1"></label><label>Максимум <input type="number" data-control="heightMax" value="3" min="0.001" max="20" step="0.1"></label></details>
    <details><summary>Исходники · лицензии · ограничения</summary><button type="button" data-rtwg="source">Скачать полный исходный код</button><p>Порт RTWG / RTplatec / libnoise. При загрузке снимка скалярные поля восстанавливаются точно; внутреннее состояние плит пересоздаётся. Это не геологический прогноз.</p><pre class="rtwg-license"></pre></details></aside>`;
  host.append(element);
  element.querySelector('.rtwg-license').textContent=RTWG_NOTICES;
  const canvas=element.querySelector('canvas'), status=element.querySelector('.rtwg-status'), errorEl=element.querySelector('.rtwg-error');
  let engine=null, disposed=false, busy=false, paused=true, raf=0, dirty=true, generation=0;
  let parameters=structuredClone(initialSnapshot?.parameters || defaultParameters());
  const render={field:0,threeD:false,yaw:.6,pitch:.7,distance:7,target:[0,0,0],heightScale:.65,terrainScale:1,lightPosition:[-4,7,3],waterSpeed:5};
  const q=s=>element.querySelector(s);
  function error(e) { paused=true; q('[data-rtwg="run"]').textContent='▶ Запуск'; errorEl.hidden=false; errorEl.textContent=e.message||String(e); }
  function parameterUI() { for(const [group,specs] of Object.entries(PARAMETERS)) q(`[data-parameters="${group}"]`).innerHTML=Object.entries(specs).map(([k,[,min,max,step]])=>`<label>${PARAM_LABELS[k]}<input type="number" data-param-group="${group}" data-param="${k}" value="${parameters[group][k]}" min="${min}" max="${max}" step="${step}"></label>`).join(''); }
  function controls() { q('[data-rtwg="run"]').textContent=paused?'▶ Запуск':'Ⅱ Пауза'; }
  function resize() { const r=canvas.getBoundingClientRect(), d=Math.min(devicePixelRatio||1,2); const w=Math.max(1,Math.round(r.width*d)), h=Math.max(1,Math.round(r.height*d)); if(canvas.width!==w||canvas.height!==h) {canvas.width=w;canvas.height=h;dirty=true;} }
  const observer=new ResizeObserver(()=>resizeActive()); observer.observe(canvas);
  const yieldFrame=()=>new Promise(resolve=>requestAnimationFrame(resolve));
  async function init(snapshot=null) {
    const token=++generation; busy=true; paused=true; controls(); errorEl.hidden=true; status.textContent='Сборка мира RTWG…';
    let pending=null;
    try {
      const seed=snapshot?.seed || q('[data-control="seed"]').value.trim() || 'SAGES-RTWG', width=snapshot?.width || Number(q('[data-control="resolution"]').value);
      const staging=document.createElement('canvas'); // Construct before replacing a valid running engine.
      const next=pending=await createRtwgEngine(staging,{seed,width,height:width/2,parameters:snapshot?.parameters || parameters});
      if(disposed || token!==generation) {next.dispose();return;}
      if(snapshot) next.restore(snapshot); else for(let i=0;i<3;i++) next.step();
      engine?.dispose(); const old=element.querySelector('canvas'); staging.className=old.className; staging.tabIndex=0; staging.setAttribute('aria-label',old.getAttribute('aria-label')); old.replaceWith(staging);
      observer.unobserve(old); activeCanvas=staging; observer.observe(staging); bindCanvas(staging); engine=next; pending=null; parameters=engine.parameters;
      q('[data-control="seed"]').value=seed; q('[data-control="resolution"]').value=String(width); q('[data-control="tectonic"]').checked=false; FIELDS.forEach(f=>q(`[data-enabled="${f}"]`).checked=engine.enabled[f]); parameterUI(); dirty=true; resizeActive();
      if(snapshot) status.textContent='Снимок загружен; плиты пересозданы. Симуляция на паузе.';
    } catch(e) { pending?.dispose(); if(!disposed && token===generation) error(e); } finally { if(token===generation) busy=false; }
  }
  let activeCanvas=canvas;
  function resizeActive() { const r=activeCanvas.getBoundingClientRect(), d=Math.min(devicePixelRatio||1,2); const w=Math.max(1,Math.round(r.width*d)),h=Math.max(1,Math.round(r.height*d)); if(activeCanvas.width!==w||activeCanvas.height!==h) { activeCanvas.width=w;activeCanvas.height=h;dirty=true; } }
  let last=0;
  function tick(now) { if(disposed) return; raf=requestAnimationFrame(tick); if(element.hidden || document.hidden || busy || !engine) return; try { resizeActive(); if(!paused&&now-last>=100) {engine.step();last=now;dirty=true;} if(dirty) {engine.render(render);dirty=false;status.textContent=`${engine.seed} · ${engine.width}×${engine.height} · шаг ${engine.iteration} · ${paused?'пауза':'симуляция'}${engine.tectonicEnabled?' · плиты':''}`;} } catch(e) {error(e);} }
  function bindCanvas(c) {
    let drag=null;
    c.addEventListener('pointerdown',e=>{c.focus();if(!render.threeD)return;drag={x:e.clientX,y:e.clientY};c.setPointerCapture(e.pointerId);});
    c.addEventListener('pointermove',e=>{if(!drag)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;drag={x:e.clientX,y:e.clientY};if(e.shiftKey) {render.target[0]-=dx*.005;render.target[2]-=dy*.005;} else {render.yaw-=dx*.008;render.pitch=Math.max(.08,Math.min(1.45,render.pitch+dy*.008));}dirty=true;});
    for(const name of ['pointerup','pointercancel','lostpointercapture']) c.addEventListener(name,()=>{drag=null;});
    c.addEventListener('wheel',e=>{if(!render.threeD)return;e.preventDefault();render.distance=Math.max(1,Math.min(40,render.distance*Math.exp(e.deltaY*.001)));dirty=true;},{passive:false});
    c.addEventListener('keydown',e=>{const k=e.key.toLowerCase();if(k==='escape'){e.stopPropagation();onExit();}if(!render.threeD)return;const d=.15; if(k==='w')render.target[2]-=d;else if(k==='s')render.target[2]+=d;else if(k==='a')render.target[0]-=d;else if(k==='d')render.target[0]+=d;else return;e.preventDefault();dirty=true;});
    c.addEventListener('webglcontextlost',e=>{e.preventDefault();if(disposed||c!==activeCanvas)return;error(Error('WebGL-контекст потерян. Перезапусти RTWG; обычная карта не затронута.'));});
  }
  parameterUI();
  element.addEventListener('change',e=> { try {
    const t=e.target;
    if(t.dataset.param) { const group=t.dataset.paramGroup,key=t.dataset.param,v=Number(t.value); engine?.setParameter(group,key,v); if(!engine) parameters[group][key]=v; }
    if(t.dataset.enabled&&engine) engine.enabled[t.dataset.enabled]=t.checked;
    if(t.dataset.control==='field') render.field=Number(t.value);
    if(t.dataset.control==='threeD') { render.threeD=t.checked; if(t.checked && render.field===0) {render.field=7;q('[data-control="field"]').value='7';} }
    if(t.dataset.control==='tectonic') engine?.setTectonic(t.checked);
    if(t.dataset.render) { const v=Number(t.value); if(!Number.isFinite(v)||v<Number(t.min)||v>Number(t.max)) throw Error('Значение 3D вне диапазона'); const key=t.dataset.render; if(key.startsWith('light'))render.lightPosition[{lightX:0,lightY:1,lightZ:2}[key]]=v;else render[key]=v; }
    dirty=true;
  } catch(e) {error(e);} });
  element.addEventListener('click',async e=> {
    const b=e.target.closest('button'); if(!b)return; const action=b.dataset.rtwg;
    if(action==='exit'){onExit();return;}
    if(action==='source'){const a=document.createElement('a');a.href=sourceUrl;a.download='sages-corresponding-source.zip';a.click();return;} if(busy)return;
    try {
      if(action==='restart'||action==='new') { if(action==='new') q('[data-control="seed"]').value=`RTWG-${crypto.getRandomValues(new Uint32Array(1))[0]}`; await init();return; }
      if(!engine) return;
      errorEl.hidden=true;
      if(action==='run'){paused=!paused;controls();}
      if(action==='step'){paused=true;controls();engine.step();}
      if(action==='evolve') { busy=true;paused=true;controls();const was=engine.tectonicEnabled;engine.setTectonic(true);try{for(let i=0;i<32&&!disposed;i++){engine.step();if(i%4===0){engine.render(render);status.textContent=`Тектоника: ${i+1}/32`;await yieldFrame();}}}finally{if(!disposed)engine.setTectonic(was);busy=false;} }
      if(b.dataset.reset) {engine.resetField(b.dataset.reset); if(b.dataset.reset==='rock') engine.step();}
      if(action==='plates')engine.restartPlates();
      if(action==='distortion')engine.newDistortion();
      if(action==='save') download(new Blob([encodeSnapshot(engine.snapshot())],{type:'application/json'}),`world-${engine.width}.rtwg.json`);
      if(action==='load')q('[data-file="snapshot"]').click();
      if(action==='heightmap')q('[data-file="heightmap"]').click();
      if(action==='png') {busy=true;try{download(await pngFields(engine,RTWG_NOTICES),'rtwg-fields.zip');}finally{busy=false;}}
      if(action==='image'){engine.render(render);const blob=await new Promise(resolve=>activeCanvas.toBlob(resolve,'image/png'));if(blob)download(blob,'rtwg-view.png');}
      if(action==='apply') { paused=true;controls(); if(!confirm('Заменить рельеф текущей карты результатом RTWG? Редактор пересоздаст реки, биомы, поселения и государства. Сначала сохрани старую карту через экспорт.'))return; busy=true;try{await onApply(engine);}finally{busy=false;} }
      dirty=true;
    } catch(e) {error(e);} });
  q('[data-file="snapshot"]').addEventListener('change',async e=> { const file=e.target.files?.[0]; e.target.value=''; if(!file||busy)return;try{if(file.size>MAX_FILE_BYTES)throw Error('Максимум 32 МиБ');const snapshot=decodeSnapshot(await file.text());await init(snapshot);}catch(e){error(e);} });
  q('[data-file="heightmap"]').addEventListener('change',async e=> { const file=e.target.files?.[0];e.target.value='';if(!file||busy||!engine)return;busy=true;paused=true;controls();try{if(file.size>MAX_FILE_BYTES)throw Error('Максимум 32 МиБ');const header=new DataView(await file.slice(0,24).arrayBuffer());if(header.byteLength<24||header.getUint32(0)!==0x89504e47||header.getUint32(4)!==0x0d0a1a0a||header.getUint32(12)!==0x49484452||!header.getUint32(16)||!header.getUint32(20)||header.getUint32(16)*header.getUint32(20)>16777216)throw Error('Нужен PNG не более 16 миллионов пикселей');const image=await createImageBitmap(file,{resizeWidth:engine.width,resizeHeight:engine.height,resizeQuality:'high'});const c=document.createElement('canvas');c.width=engine.width;c.height=engine.height;const ctx=c.getContext('2d');ctx.drawImage(image,0,0,c.width,c.height);image.close();const a=ctx.getImageData(0,0,c.width,c.height).data;const min=Number(q('[data-control="heightMin"]').value),max=Number(q('[data-control="heightMax"]').value);if(!Number.isFinite(min)||!Number.isFinite(max)||min<.001||max>20||min>=max)throw Error('Неверный диапазон высот');const values=new Float32Array(c.width*c.height);for(let y=0;y<c.height;y++)for(let x=0;x<c.width;x++){const i=(y*c.width+x)*4;values[(c.height-1-y)*c.width+x]=min+(a[i]*.2126+a[i+1]*.7152+a[i+2]*.0722)/255*(max-min);}engine.importHeights(values);dirty=true;}catch(e){error(e);}finally{busy=false;} });
  raf=requestAnimationFrame(tick);
  const ready=init(initialSnapshot);
  return {element,ready,getEngine:()=>engine,
    dispose() {if(disposed)return;disposed=true;generation++;cancelAnimationFrame(raf);observer.disconnect();try{if(engine)onSnapshot(engine.snapshot());}catch{/* Lost contexts cannot be read back. */}engine?.dispose();element.remove();},
  };
}

// Licenses/source remain accessible from the unified product even when this workbench is hidden.
export { RTWG_NOTICES, sourceUrl };
