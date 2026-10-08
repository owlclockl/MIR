import{Bn as e,H as t,L as n,On as r,P as i,U as a,Wn as o,Z as s,a as c,nn as l,nr as u,o as d,qn as f,y as p,z as m}from"./utils-BXzQ0Tym.js";import{U as h,V as ee,t as g,z as te}from"./layers-Cld3ceTu.js";import{t as ne}from"./drag-DdGpYDDb.js";import{t as _}from"./sin-DYm9hqTl.js";import{n as v}from"./highlight-izWZujNC.js";import{i as y,t as b}from"./tooltips-P6FAPAdd.js";import{t as x}from"./state-B2hBYDzv.js";import{t as S}from"./controllers-7rYzYhQt.js";import{i as re,l as C,n as ie,r as ae,s as oe}from"./dialog-helpers-CJ5pbzaw.js";import{t as se}from"./viewbox-events-BWk3LUVh.js";import{i as ce,r as w}from"./index-C_h8P6M7.js";import{t as T}from"./highlighting-CeezudJT.js";import{a as E,i as D,n as le,r as ue}from"./table-XWt9IQic.js";var O=`religionsEditor`,k=`Religions`,A={my:`right top`,at:`right-10 top+10`,of:`svg`,collision:`fit`},j,M=[{key:`color`,width:`1.2em`,permanent:!0},{key:`name`,label:`Религия`,width:`14em`,permanent:!0,sortBy:e=>e.name||``,sortType:`alpha`},{key:`type`,label:`Тип`,width:`6em`,defaultSort:`asc`,sortBy:e=>e.type||``,sortType:`alpha`},{key:`form`,label:`Форма`,width:`7em`,mobileHidden:!0,sortBy:e=>e.form||``,sortType:`alpha`},{key:`deity`,label:`Божество`,width:`14em`,mobileHidden:!0,sortBy:e=>e.deity||``,sortType:`alpha`},{key:`area`,label:`Площадь`,width:`7em`,mobileHidden:!0,sortBy:e=>e.area||0},{key:`population`,label:`Население`,width:`6em`,sortBy:e=>(e.rural||0)*options.map.units.population.scale+(e.urban||0)*options.map.units.population.scale*options.map.units.population.urbanization.rate},{key:`expansion`,label:`Экспансия`,width:`5em`,hidden:!0,mobileHidden:!0,sortBy:e=>e.expansion||``,sortType:`alpha`},{key:`expansionism`,label:`Экспансионизм`,width:`5em`,hidden:!0,mobileHidden:!0,sortBy:e=>e.expansionism||0},{key:`note`,width:`1.1em`},{key:`locate`,width:`1.1em`},{key:`lock`,width:`1.1em`},{key:`remove`,width:`1.4em`,permanent:!0}];function N(){return pack.religions.filter(e=>!e.removed&&!(e.i&&!e.cells&&!j.showExtinct))}var P=ue({getData:()=>ce(O,N(),M),onUpdate:z});function F(){customization||(j=x.get(O,`filters`,()=>({showExtinct:!1})),ie(`#${O}, .stable`),g.show(`religions`),g.hide(`states`,`biomes`),g.hide(`cultures`,`provinces`),I(),R(),K(),P.reset(),$(`#${O}`).dialog({title:`Редактор религий`,resizable:!1,width:`fit-content`,close:je,position:A}))}function I(){re(`religionsEditor`);let e=`<div id="religionsEditor" class="dialog stable editorDialog">
    <div id="religionsBody" class="table" data-type="absolute">${D({dialogId:O,columns:M})}</div>

    <div id="religionsFooter" class="totalLine">
      <div data-tip="Всего организованных религий" style="margin-left: 12px">
        Organized:&nbsp;<span id="religionsOrganized">0</span>
      </div>
      <div data-tip="Всего ересей" style="margin-left: 12px">
        Heresies:&nbsp;<span id="religionsHeresies">0</span>
      </div>
      <div data-tip="Всего культов" style="margin-left: 12px">
        Cults:&nbsp;<span id="religionsCults">0</span>
      </div>
      <div data-tip="Всего народных религий" style="margin-left: 12px">
        Folk:&nbsp;<span id="religionsFolk">0</span>
      </div>
      <div data-tip="Площадь суши" style="margin-left: 12px" data-col="area">
        Land Area:&nbsp;<span id="religionsFooterArea">0</span>
      </div>
      <div data-tip="Всего последователей (население)" style="margin-left: 12px" data-col="population">
        Believers:&nbsp;<span id="religionsFooterPopulation">0</span>
      </div>
    </div>

    <div id="religionsBottom" class="editorToolbar">
      <button id="religionsEditorRefresh" data-tip="Обновить редактор" class="icon-cw"></button>
      <button id="religionsEditStyle" data-tip="Изменить стиль религий в редакторе стиля" class="icon-adjust"></button>
      <button id="religionsLegend" data-tip="Переключить окно легенды" class="icon-list-bullet"></button>
      <button id="religionsPercentage" data-tip="Переключить проценты / абсолютные значения" class="icon-percent"></button>
      <button id="religionsHeirarchy" data-tip="Показать дерево иерархии религий" class="icon-sitemap"></button>
      <button id="religionsExtinct" data-tip="Показать/скрыть угасшие религии (без ячеек)" class="icon-eye-off"></button>

      <button id="religionsManually" data-tip="Вручную переназначить религии" class="icon-brush"></button>
      <button id="religionsAdd" data-tip="Добавить новую религию. Shift — добавить несколько" class="icon-plus"></button>
      <button id="religionsExport" data-tip="Скачать данные о религиях" class="icon-download"></button>
      <button id="religionsRecalculate" data-tip="Пересчитать религии по текущим значениям признаков роста" class="icon-retweet"></button>
      <span
        data-tip="Разрешить немедленный эффект для центров, охвата и экспансионизма религий"
        class="editorToolbarPanel"
      >
        <input id="religionsAutoChange" class="checkbox" type="checkbox" />
        <label for="religionsAutoChange" class="checkbox-label"><i>автоприменение изменений</i></label>
      </span>
    </div>
  </div>`;i(`dialogs`).insertAdjacentHTML(`beforeend`,e),Y(),w(O,P.reset),T(O,({cellId:e})=>pack.cells.religion[e]),i(`religionsEditorRefresh`).addEventListener(`click`,L),le({dialogId:O,columns:M,onUpdate:()=>C(O,{width:`fit-content`,position:A})}),i(`religionsEditStyle`).addEventListener(`click`,()=>void S.StyleEditor.open(`religions`)),i(`religionsLegend`).addEventListener(`click`,Se),i(`religionsPercentage`).addEventListener(`click`,q),i(`religionsHeirarchy`).addEventListener(`click`,J),i(`religionsExtinct`).addEventListener(`click`,Ce),i(`religionsManually`).addEventListener(`click`,we),i(`religionsAdd`).addEventListener(`click`,Ee),i(`religionsExport`).addEventListener(`click`,Oe),i(`religionsRecalculate`).addEventListener(`click`,()=>Q(!0))}function L(){R(),P.refresh()}function R(){let{cells:e,religions:t,burgs:n}=pack;t.forEach(e=>{e.cells=e.area=e.rural=e.urban=0});for(let r of e.i){if(e.h[r]<20)continue;let i=e.religion[r];t[i].cells+=1,t[i].area+=e.area[r],t[i].rural+=e.pop[r];let a=e.burg[r];a&&(t[i].urban+=n[a].population)}}function z(e){let t=` ${d()}`,n=``,r=0,a=0;for(let t of e.all)r+=c(t.area??0),a+=u((t.rural??0)*options.map.units.population.scale+(t.urban??0)*options.map.units.population.scale*options.map.units.population.urbanization.rate);for(let r of e.rows){let e=c(r.area??0),i=(r.rural??0)*options.map.units.population.scale,a=(r.urban??0)*options.map.units.population.scale*options.map.units.population.urbanization.rate,o=u(i+a),s=`Believers: ${p(o)}; Rural areas: ${p(i)}; Urban areas: ${p(a)}. Click to change`;if(!r.i){n+=`<div
        class="states"
        data-id="${r.i}"
        data-name="${r.name}"
        data-color=""
        data-area="${e}"
        data-population="${o}"
        data-type=""
        data-form=""
        data-deity=""
        data-expansion=""
        data-expansionism=""
      >
        <svg width="9" height="9" class="placeholder" data-col="color"></svg>
        <input data-tip="Название религии. Кликните и введите новое" class="religionName italic"
          value="${r.name}" autocorrect="off" spellcheck="false" data-col="name" />
        <select data-tip="Тип религии" class="religionType placeholder" data-col="type">
          ${B(r.type)}
        </select>
        <input data-tip="Форма религии" class="religionForm placeholder" value="" autocorrect="off" spellcheck="false" data-col="form" />
        <div data-col="deity">
          <span class="icon-arrows-cw placeholder"></span>
          <input class="religionDeity placeholder" value="" autocorrect="off" spellcheck="false" />
        </div>
        <div data-col="area">
          <span data-tip="Область религии" style="padding-right: 4px" class="icon-map-o"></span>
          <div data-tip="Область религии" class="religionArea">${p(e)+t}</div>
        </div>
        <div data-col="population">
          <span data-tip="${s}" class="icon-male"></span>
          <div data-tip="${s}" class="religionPopulation pointer">${p(o)}</div>
        </div>
        <div data-col="expansion">
          <span class="icon-resize-full-alt placeholder" style="padding-right: 2px"></span>
          <span class="religionExtent placeholder">n/a</span>
        </div>
        <div data-col="expansionism">
          <span class="icon-resize-full placeholder"></span>
          <input class="religionExpantion placeholder" disabled type="number" value="0" />
        </div>
        <div data-col="note"></div>
        <div data-col="locate"></div>
        <div data-col="lock"></div>
        <div data-col="remove"></div>
      </div>`;continue}n+=`<div
      class="states"
      data-id=${r.i}
      data-name="${r.name}"
      data-color="${r.color}"
      data-area=${e}
      data-population=${o}
      data-type="${r.type}"
      data-form="${r.form}"
      data-deity="${r.deity||``}"
      data-expansion="${r.expansion}"
      data-expansionism="${r.expansionism}"
    >
      <fill-box fill="${r.color}" data-col="color"></fill-box>
      <input data-tip="Название религии. Кликните и введите новое" class="religionName"
        value="${r.name}" autocorrect="off" spellcheck="false" data-col="name" />
      <select data-tip="Тип религии" class="religionType" data-col="type">
        ${B(r.type)}
      </select>
      <input data-tip="Форма религии" class="religionForm"
        value="${r.form}" autocorrect="off" spellcheck="false" data-col="form" />
      <div data-col="deity">
        <span data-tip="Кликните, чтобы заново создать верховного бога" class="icon-arrows-cw pointer"></span>
        <input data-tip="Верховное божество религии" class="religionDeity"
          value="${r.deity||``}" autocorrect="off" spellcheck="false" />
      </div>
      <div data-col="area">
        <span data-tip="Область религии" style="padding-right: 4px" class="icon-map-o"></span>
        <div data-tip="Область религии" class="religionArea">${p(e)+t}</div>
      </div>
      <div data-col="population">
        <span data-tip="${s}" class="icon-male"></span>
        <div data-tip="${s}" class="religionPopulation pointer">${p(o)}</div>
      </div>
      ${V(r)}
      ${oe(`this religion`)}
      <span data-col="locate" data-tip="Найти религию" class="icon-target"></span>
      <span data-col="lock" data-tip="Заблокировать эту религию" class="icon-lock${r.lock?``:`-open`}"></span>
      <span data-col="remove" data-tip="Удалить религию" class="icon-trash-empty"></span>
    </div>`}let o=i(`religionsBody`);o.querySelectorAll(`:scope > .states`).forEach(e=>{e.remove()}),o.insertAdjacentHTML(`beforeend`,n);let s=pack.religions.filter(e=>e.i&&!e.removed);i(`religionsOrganized`).innerHTML=String(s.filter(e=>e.type===`Organized`).length),i(`religionsHeresies`).innerHTML=String(s.filter(e=>e.type===`Heresy`).length),i(`religionsCults`).innerHTML=String(s.filter(e=>e.type===`Cult`).length),i(`religionsFolk`).innerHTML=String(s.filter(e=>e.type===`Folk`).length),i(`religionsFooterArea`).innerHTML=p(r)+t,i(`religionsFooterPopulation`).innerHTML=p(a),i(`religionsFooterArea`).dataset.area=String(r),i(`religionsFooterPopulation`).dataset.population=String(a),E(i(`religionsFooter`),e,P.goto),i(`religionsBody`).querySelectorAll(`:scope > .states`).forEach(e=>{e.addEventListener(`mouseenter`,U),e.addEventListener(`mouseleave`,W)}),i(`religionsBody`).querySelectorAll(`fill-box`).forEach(e=>void e.addEventListener(`click`,de)),i(`religionsBody`).querySelectorAll(`div > input.religionName`).forEach(e=>void e.addEventListener(`input`,fe)),i(`religionsBody`).querySelectorAll(`div > select.religionType`).forEach(e=>void e.addEventListener(`change`,G)),i(`religionsBody`).querySelectorAll(`div > input.religionForm`).forEach(e=>void e.addEventListener(`input`,pe)),i(`religionsBody`).querySelectorAll(`div > input.religionDeity`).forEach(e=>void e.addEventListener(`input`,me)),i(`religionsBody`).querySelectorAll(`div > span.icon-arrows-cw`).forEach(e=>void e.addEventListener(`click`,he)),i(`religionsBody`).querySelectorAll(`div > div.religionPopulation`).forEach(e=>void e.addEventListener(`click`,ge)),i(`religionsBody`).querySelectorAll(`div > select.religionExtent`).forEach(e=>void e.addEventListener(`change`,_e)),i(`religionsBody`).querySelectorAll(`div > input.religionExpantion`).forEach(e=>void e.addEventListener(`change`,ve)),i(`religionsBody`).querySelectorAll(`div > span.icon-trash-empty`).forEach(e=>void e.addEventListener(`click`,ye)),i(`religionsBody`).querySelectorAll(`div > span.icon-book`).forEach(e=>void e.addEventListener(`click`,ke)),i(`religionsBody`).querySelectorAll(`div > span.icon-target`).forEach(e=>void e.addEventListener(`click`,Ae)),i(`religionsBody`).querySelectorAll(`div > span.icon-lock`).forEach(e=>void e.addEventListener(`click`,Z)),i(`religionsBody`).querySelectorAll(`div > span.icon-lock-open`).forEach(e=>void e.addEventListener(`click`,Z)),i(`religionsBody`).dataset.type===`percentage`&&(i(`religionsBody`).dataset.type=`absolute`,q()),C(O,{width:`fit-content`,position:A})}function B(e){let t=``;return[`Folk`,`Organized`,`Cult`,`Heresy`].forEach(n=>{t+=`<option ${e===n?`selected`:``} value="${n}">${n}</option>`}),t}function V(e){if(e.type===`Folk`){let e=`Folk religions are not competitive and do not expand. Initially they cover all cells of their parent culture, but get ousted by organized religions when they expand`;return`
      <div data-col="expansion">
        <span data-tip="${e}" class="icon-resize-full-alt" style="padding-right: 2px"></span>
        <span data-tip="${e}" class="religionExtent">culture</span>
      </div>
      <div data-col="expansionism">
        <span data-tip="${e}" class="icon-resize-full"></span>
        <input data-tip="${e}" class="religionExpantion" disabled type="number" value='0' />
      </div>`}return`
    <div data-col="expansion">
      <span data-tip="Возможный охват религии" class="icon-resize-full-alt" style="padding-right: 2px"></span>
      <select data-tip="Возможный охват религии" class="religionExtent">
        ${H(e.expansion)}
      </select>
    </div>
    <div data-col="expansionism">
      <span data-tip="Экспансионизм религии. Задаёт соревновательный размер" class="icon-resize-full"></span>
      <input
        data-tip="Экспансионизм религии. Задаёт соревновательный размер. Кликните, чтобы изменить, затем «Пересчитать»"
        class="religionExpantion"
        type="number"
        min="0"
        max="99"
        step=".1"
        value=${e.expansionism}
      />
    </div>`}function H(e){let t=``;return[`global`,`state`,`culture`].forEach(n=>{t+=`<option ${e===n?`selected`:``} value="${n}">${n}</option>`}),t}var U=s(e=>{let t=Number(e.id||e.target.dataset.id),n=i(`religionsBody`).querySelector(`div[data-id='${t}']`);if(n&&n.classList.add(`active`),!g.isOn(`religions`)||customization)return;let a=l().duration(2e3).ease(_);r(`#relig`).select(`#religion${t}`).raise().transition(a).attr(`stroke-width`,2.5).attr(`stroke`,`#d0240f`),r(`#debug`).select(`#religionsCenter${t}`).raise().transition(a).attr(`r`,3).attr(`stroke`,`#d0240f`)},200);function W(e){let t=Number(e.id||e.target.dataset.id),n=i(`religionsBody`).querySelector(`div[data-id='${t}']`);n&&n.classList.remove(`active`),r(`#relig`).select(`#religion${t}`).transition().attr(`stroke-width`,null).attr(`stroke`,null),r(`#debug`).select(`#religionsCenter${t}`).transition().attr(`r`,2).attr(`stroke`,null)}function de(){let e=this.getAttribute(`fill`)||`#ffffff`,t=+this.parentNode.dataset.id;S.ColorPicker.open(e,e=>{this.fill=e,pack.religions[t].color=e,r(`#relig`).select(`#religion${t}`).attr(`fill`,e),r(`#debug`).select(`#religionsCenter${t}`).attr(`fill`,e)})}function fe(){let e=+this.parentNode.dataset.id;this.parentNode.dataset.name=this.value,this.value.trim()&&Religions.rename(e,this.value)}function G(){let e=+this.parentNode.dataset.id;this.parentNode.dataset.type=this.value,Religions.setType(e,this.value)}function pe(){let e=+this.parentNode.dataset.id;this.parentNode.dataset.form=this.value,this.value.trim()&&Religions.setForm(e,this.value)}function me(){let e=this.closest(`.states`),t=+e.dataset.id;e.dataset.deity=this.value,Religions.setDeity(t,this.value)}function he(){let e=this.closest(`.states`),t=+e.dataset.id,n=pack.religions[t].culture,r=Religions.getDeityName(n)??``;e.dataset.deity=r,pack.religions[t].deity=r,this.nextElementSibling.value=r}function ge(){let e=+this.closest(`.states`).dataset.id,t=pack.religions[e];if(!t.cells){y(`У религии нет ячеек, население не изменить`,!1,`error`);return}let n=u((t.rural??0)*options.map.units.population.scale),r=u((t.urban??0)*options.map.units.population.scale*options.map.units.population.urbanization.rate),a=n+r,s=e=>Number(e).toLocaleString(),c=pack.burgs.filter(t=>!t.removed&&pack.cells.religion[t.cell]===e);alertMessage.innerHTML=`<div>
    <i>Всё население территории религии считается её последователями. Это значит, что изменение числа последователей напрямую влияет на население</i>
    <div style="margin: 0.5em 0">
      Rural: <input type="number" min="0" step="1" id="ruralPop" value=${n} style="width:6em" />
      Urban: <input type="number" min="0" step="1" id="urbanPop" value=${r} style="width:6em"
        ${c.length?``:`disabled`} />
    </div>
    <div>Total population: ${s(a)} ⇒ <span id="totalPop">${s(a)}</span>
      (<span id="totalPopPerc">100</span>%)
    </div>
  </div>`;let l=i(`ruralPop`),d=i(`urbanPop`),f=i(`totalPop`),p=i(`totalPopPerc`),m=()=>{let e=l.valueAsNumber+d.valueAsNumber;Number.isNaN(e)||(f.innerHTML=s(e),p.innerHTML=String(u(e/a*100)))};l.oninput=()=>m(),d.oninput=()=>m(),$(`#alert`).dialog({resizable:!1,title:`Изменить число последователей`,width:`24em`,buttons:{Применить:function(){h(),$(this).dialog(`close`)},Отмена:function(){$(this).dialog(`close`)}},position:{my:`center`,at:`center`,of:`svg`}});function h(){try{Religions.setPopulation(e,+l.value||0,+d.value||0)}catch(e){y(o(e),!1,`error`);return}g.draw(`population`),L()}}function _e(){let e=this.closest(`.states`),t=+e.dataset.id;e.dataset.expansion=this.value,Religions.setExpansion(t,this.value),Q()}function ve(){let e=this.closest(`.states`),t=+e.dataset.id;e.dataset.expansionism=this.value,+this.value>=0&&+this.value<=99&&(Religions.setExpansionism(t,+this.value),Q())}function ye(){if(customization)return;let e=+this.closest(`.states`).dataset.id;ae({title:`Удалить религию`,message:`Вы уверены, что хотите удалить религию? <br>Это действие необратимо`,confirm:`Удалить`,onConfirm:()=>be(e)})}function be(e){r(`#relig`).select(`#religion${e}`).remove(),r(`#relig`).select(`#religion-gap${e}`).remove(),r(`#debug`).select(`#religionsCenter${e}`).remove(),Religions.remove(e),L()}function K(){let e=r(`#debug`);e.select(`#religionCenters`).remove();let t=e.append(`g`).attr(`id`,`religionCenters`).attr(`stroke-width`,.8).attr(`stroke`,`#444444`).style(`cursor`,`move`),n=pack.religions.filter(e=>e.i&&e.center&&!e.removed);j.showExtinct||(n=n.filter(e=>(e.cells??0)>0)),t.selectAll(`circle`).data(n).enter().append(`circle`).attr(`id`,e=>`religionsCenter${e.i}`).attr(`data-id`,e=>e.i).attr(`r`,2).attr(`fill`,e=>e.color).attr(`cx`,e=>pack.cells.p[e.center][0]).attr(`cy`,e=>pack.cells.p[e.center][1]).on(`mouseenter`,(e,t)=>{y(`${t.name}. Drag to move the religion center`,!0),U(e)}).on(`mouseleave`,e=>{y(``,!0),W(e)}).call(ne().on(`start`,xe))}function xe(e){let t=+this.dataset.id,n=f(this.getAttribute(`transform`)),r=+n[0]-e.x,i=+n[1]-e.y;function a(e){let{x:n,y:a}=e;this.setAttribute(`transform`,`translate(${r+n},${i+a})`);let o=Pack.findCell(n,a);if(!(o==null||pack.cells.h[o]<20)){try{Religions.moveCenter(t,n,a)}catch(e){y(e instanceof Error?e.message:String(e),!1,`error`,2e3);return}Q()}}let o=s(a,50);e.on(`drag`,o)}function Se(){if(h(k)){te(k);return}let e=pack.religions.filter(e=>e.i&&!e.removed&&e.area).sort((e,t)=>(t.area??0)-(e.area??0)).map(e=>[e.i,e.color,e.name]);if(!e.length)return void y(`Нет религий для показа`,!1,`error`);ee(k,e)}function q(){if(i(`religionsBody`).dataset.type===`absolute`){i(`religionsBody`).dataset.type=`percentage`;let e=+i(`religionsFooterArea`).dataset.area,t=+i(`religionsFooterPopulation`).dataset.population;i(`religionsBody`).querySelectorAll(`:scope > .states`).forEach(n=>{let{area:r,population:i}=n.dataset;n.querySelector(`.religionArea`).innerText=`${u(+r/e*100)}%`,n.querySelector(`.religionPopulation`).innerText=`${u(+i/t*100)}%`})}else i(`religionsBody`).dataset.type=`absolute`,P.refresh()}async function J(){customization||S.HierarchyTree.open({type:`religions`,data:pack.religions,onNodeEnter:U,onNodeLeave:W,getDescription:e=>{let{name:t,type:n,form:r,rural:i,urban:a}=e,o=()=>t.includes(n)||r.includes(n)?``:n===`Folk`||n===`Organized`?`. ${n} religion`:`. ${n}`,s=r===n?``:`. ${r}`,c=i*options.map.units.population.scale+a*options.map.units.population.scale*options.map.units.population.urbanization.rate,l=c>0?`${p(u(c))} people`:`Extinct`;return`${t}${o()}${s}. ${l}`},getShape:({type:e})=>{if(e===`Folk`)return`circle`;if(e===`Organized`)return`square`;if(e===`Cult`)return`hexagon`;if(e===`Heresy`)return`diamond`}})}function Ce(){j.showExtinct=!j.showExtinct,x.set(O,`filters`,j),Y(),P.reset(),K()}function Y(){i(`religionsBody`).dataset.extinct=j.showExtinct?`show`:`скрыть`,i(`religionsExtinct`).classList.toggle(`active`,j.showExtinct)}function we(){g.show(`religions`),S.PaintEditor.open({title:`Кисть религий`,parentDialogId:O,onClose:F,items:pack.religions.filter(e=>!e.removed&&(!e.i||e.cells)).map(e=>({id:e.i,name:e.name,color:e.color||`#ffffff`})),dontOverrideControl:!0,getValue:e=>pack.cells.religion[e],filterCell:e=>m(e,pack),onApply:Te})}function Te(t){for(let[n,r]of e(t))Religions.setCells(n,r);t.size&&(g.draw(`religions`),document.getElementById(O)&&L(),K())}function Ee(){if(this.classList.contains(`pressed`)){X();return}customization=8,this.classList.add(`pressed`),y(`Кликните по карте, чтобы добавить новую религию`,!0),r(`#viewbox`).style(`cursor`,`crosshair`).on(`click`,De),i(`religionsBody`).querySelectorAll(`div > input, select, span, svg`).forEach(e=>{e.style.pointerEvents=`none`})}function X(){customization=0,se(),b(),i(`religionsBody`).querySelectorAll(`div > input, select, span, svg`).forEach(e=>{e.style.removeProperty(`pointer-events`)});let e=i(`religionsAdd`);e.classList.contains(`pressed`)&&e.classList.remove(`pressed`)}function De(e){let[t,r]=n(e,this);try{Religions.add(t,r)}catch(e){y(o(e),!1,`error`);return}e.shiftKey===!1&&X(),g.draw(`religions`),L(),K()}function Oe(){let e=`Id,Name,Color,Type,Form,Supreme Deity,Area ${d(`2`)},Believers,Origins,Potential,Expansionism`,n=P.view().all.map(e=>{let t=c(e.area??0),n=u((e.rural??0)*options.map.units.population.scale+(e.urban??0)*options.map.units.population.scale*options.map.units.population.urbanization.rate),r=`"${e.deity||``}"`,i=`"${(e.origins??[]).filter(e=>!!e).map(e=>pack.religions[e].name).join(`, `)}"`;return[e.i,e.name,e.color??``,e.type??``,e.form??``,r,t,n,i,e.expansion??``,e.i?e.expansionism??``:``].join(`,`)});t([e].concat(n).join(`
`),`${a(`Religions`)}.csv`)}function ke(){let e=+this.closest(`.states`).dataset.id;S.NotesEditor.open({type:`religion`,id:e})}function Ae(){let e=+this.closest(`.states`).dataset.id,t=r(`#relig`).select(`#religion${e}`).node();t&&v(t,4)}function Z(){if(customization)return;let e=+this.closest(`.states`).dataset.id,t=this.classList;Religions.setLocked(e,!pack.religions[e].lock),t.toggle(`icon-lock-open`),t.toggle(`icon-lock`)}function Q(e){!e&&!i(`religionsAutoChange`).checked||(Religions.recalculate(),g.draw(`religions`),L(),K())}function je(){r(`#debug`).select(`#religionCenters`).remove(),customization===8&&X(),S.ColorPicker.close();let e=P.view();e.rows=[],e.all=[],$(`#religionsEditor`).dialog(`destroy`),i(`religionsEditor`).remove()}var Me={open:F,showHierarchy:J};export{Me as ReligionsEditor};