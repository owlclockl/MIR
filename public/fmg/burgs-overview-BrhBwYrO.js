import{H as e,J as t,On as n,P as r,U as i,V as a,_ as o,n as s,nr as c,nt as l,p as u,tt as d,y as f}from"./utils-BXzQ0Tym.js";import{t as p,tt as m}from"./layers-Bcg3SU5R.js";import{t as h}from"./stratify-CGdiYggi.js";import{t as g}from"./pack-CyBKcrr4.js";import{i as _}from"./tooltips-P6FAPAdd.js";import{t as v}from"./state-B2hBYDzv.js";import{t as y}from"./controllers-DoYIZ-kt.js";import{i as b,l as x,n as S,r as C}from"./dialog-helpers-CJ5pbzaw.js";import{i as w,r as T}from"./index-sJ7uR-QF.js";import{t as ee}from"./highlighting-CeezudJT.js";import{a as E,i as D,n as O,r as k}from"./table-XWt9IQic.js";var A=`burgsOverview`,j={my:`right top`,at:`right-10 top+10`,of:`svg`,collision:`fit`},M,N=null,P=[{key:`locate`,width:`0.8em`,permanent:!0},{key:`name`,label:`Город`,width:`8em`,permanent:!0,sortBy:e=>e.name||``,sortType:`alpha`},{key:`province`,label:`Провинция`,width:`8em`,hidden:!0,mobileHidden:!0,sortType:`alpha`,sortBy:e=>{let t=pack.cells.province[e.cell];return t&&pack.provinces[t]?.name||``}},{key:`state`,label:`Государство`,width:`8em`,sortBy:e=>pack.states[e.state]?.name||``,sortType:`alpha`},{key:`culture`,label:`Культура`,width:`10em`,mobileHidden:!0,sortBy:e=>pack.cultures[e.culture]?.name||``,sortType:`alpha`},{key:`group`,label:`Группа`,width:`6em`,mobileHidden:!0,sortBy:e=>e.group||``,sortType:`alpha`},{key:`population`,label:`Население`,width:`7em`,defaultSort:`desc`,sortBy:e=>e.population*options.map.units.population.scale*options.map.units.population.urbanization.rate},{key:`grossproduct`,label:`Продукт`,width:`6.5em`,hidden:!0,mobileHidden:!0,sortBy:e=>c(e.product||0,2)},{key:`productpercapita`,label:`Богатство`,width:`6.5em`,mobileHidden:!0,tip:`Сортировка по богатству города (валовой продукт на душу)`,sortBy:e=>c(e.population>0?(e.product||0)/e.population:0,2)},{key:`treasury`,label:`Казна`,width:`6.5em`,mobileHidden:!0,sortBy:e=>c(e.treasury||0,2)},{key:`features`,label:`Объекты`,width:`6em`,mobileHidden:!0,sortType:`alpha`,sortBy:e=>e.capital&&e.port?`a-capital-port`:e.capital?`c-capital`:e.port?`p-port`:`z-burg`},{key:`edit`,width:`1.1em`},{key:`lock`,width:`1.1em`},{key:`remove`,width:`1.4em`,permanent:!0}],F=k({getData:()=>w(A,H(),P),onUpdate:U});function I(e={}){customization||(M=v.get(A,`filters`,()=>({search:``,stateId:-1,cultureId:-1})),S(`#${A}, .stable`),p.show(`burgIcons`,`labels`),e.stateId!=null&&(M.stateId=e.stateId),e.cultureId!=null&&(M.cultureId=e.cultureId),L(),B(),oe(),F.reset(),$(`#${A}`).dialog({title:`Обзор городов`,resizable:!1,close:R,width:`fit-content`,position:j}))}function L(){b(`burgsOverview`);let e=`<div id="burgsOverview" class="dialog stable editorDialog">
      <div id="burgsBody" class="table">${D({dialogId:A,columns:P})}</div>
      <div id="burgsFilters" data-tip="Применить фильтр" class="editorFilters">
        <label for="burgsSearch" data-tip="Фильтр по названию, провинции, государству, культуре или группе"
          >Search: <input id="burgsSearch" type="search"
        /></label>
        <label for="burgsFilterState"
          >State:
          <select id="burgsFilterState"></select
        ></label>
        <label for="burgsFilterCulture"
          >Culture:
          <select id="burgsFilterCulture"></select
        ></label>
      </div>
      <div id="burgsFooter" class="totalLine">
        <div data-tip="Показанные города" style="margin-left: 5px">
          Burgs:&nbsp;<span id="burgsFooterBurgs">0 из 0</span>
        </div>
        <div data-tip="Среднее население" style="margin-left: 12px" data-col="population">
          Avg population:&nbsp;<span id="burgsFooterPopulation">0</span>
        </div>
        <div data-tip="Средний валовой продукт" style="margin-left: 12px" data-col="grossproduct">
          Avg product:&nbsp;<span id="burgsFooterGrossProduct">0</span> 🟡
        </div>
        <div data-tip="Среднее богатство (продукт на душу населения)" style="margin-left: 12px" data-col="productpercapita">
          Avg wealth:&nbsp;<span id="burgsFooterProductPerCapita">0</span> 🟡
        </div>
        <div data-tip="Средняя казна" style="margin-left: 12px" data-col="treasury">
          Avg treasury:&nbsp;<span id="burgsFooterTreasury">0</span> 🟡
        </div>
      </div>
      <div id="burgsBottom" class="editorToolbar">
        <button id="burgsOverviewRefresh" data-tip="Обновить редактор" class="icon-cw"></button>
        <button id="burgsGroupsEditorButton" data-tip="Изменить группы городов" class="icon-cog"></button>
        <button id="burgsChart" data-tip="Пузырьковая диаграмма городов" class="icon-chart-area"></button>
        <button
          id="regenerateBurgNames"
          data-tip="Пересоздать названия городов по назначенной культуре"
          class="icon-retweet"
        ></button>
        <button id="addNewBurg" data-tip="Добавить новый город. Shift — добавить несколько" class="icon-plus"></button>
        <button
          id="burgsExport"
          data-tip="Скачать данные городов в текстовый файл (.csv)"
          class="icon-download"
        ></button>
        <button id="burgNamesImport" data-tip="Массовое переименование городов" class="icon-upload"></button>
        <button id="burgsLockAll" data-tip="Заблокировать или разблокировать все города" class="icon-lock"></button>
        <button
          id="burgsRemoveAll"
          data-tip="Удалить все открытые города, кроме столиц. Чтобы удалить столицу, сначала удалите государство"
          class="icon-trash"
        ></button>
      </div>
    </div>`;r(`dialogs`).insertAdjacentHTML(`beforeend`,e),r(`burgsSearch`).value=M.search,T(A,F.reset),ee(A,({target:e,cellId:t})=>{let n=pack.cells.burg[t];if(n)return n;let r=e.closest(`#labels [data-label-type='burg'][data-id], #burgIcons [data-id]`);return r?Number(r.dataset.id):void 0}),O({dialogId:A,columns:P,onUpdate:()=>x(A,{width:`fit-content`,position:j})}),r(`burgsOverviewRefresh`).addEventListener(`click`,z),r(`burgsGroupsEditorButton`).addEventListener(`click`,()=>y.BurgGroupEditor.open()),r(`burgsChart`).addEventListener(`click`,Z),r(`burgsFilterState`).addEventListener(`change`,V),r(`burgsFilterCulture`).addEventListener(`change`,V),r(`burgsSearch`).addEventListener(`input`,V),r(`regenerateBurgNames`).addEventListener(`click`,X),r(`addNewBurg`).addEventListener(`click`,()=>void y.BurgCreator.toggle()),r(`burgsExport`).addEventListener(`click`,Q),r(`burgNamesImport`).addEventListener(`click`,te),r(`burgsLockAll`).addEventListener(`click`,ae),r(`burgsRemoveAll`).addEventListener(`click`,ie)}function R(){document.getElementById(`addBurgTool`)?.classList.contains(`pressed`)&&y.BurgCreator.stop(),$(`#burgsOverview`).dialog(`destroy`),r(`burgsOverview`).remove()}function z(){B(),F.reset()}function B(){let e=r(`burgsFilterState`);new Set(pack.states.filter(e=>!e.removed).map(e=>e.i)).has(M.stateId)||(M.stateId=-1),e.options.length=0,e.options.add(new Option(`all`,`-1`,!1,M.stateId===-1)),e.options.add(new Option(pack.states[0].name,`0`,!1,M.stateId===0)),pack.states.filter(e=>e.i&&!e.removed).sort((e,t)=>e.name>t.name?1:-1).forEach(t=>void e.options.add(new Option(t.name,String(t.i),!1,t.i===M.stateId)));let t=r(`burgsFilterCulture`);new Set(pack.cultures.filter(e=>!e.removed).map(e=>e.i)).has(M.cultureId)||(M.cultureId=-1),t.options.length=0,t.options.add(new Option(`all`,`-1`,!1,M.cultureId===-1)),t.options.add(new Option(pack.cultures[0].name,`0`,!1,M.cultureId===0)),pack.cultures.filter(e=>e.i&&!e.removed).sort((e,t)=>e.name>t.name?1:-1).forEach(e=>void t.options.add(new Option(e.name,String(e.i),!1,e.i===M.cultureId))),v.set(A,`filters`,M)}function V(){M.search=r(`burgsSearch`).value,M.stateId=+r(`burgsFilterState`).value,M.cultureId=+r(`burgsFilterCulture`).value,v.set(A,`filters`,M),F.reset()}function H(){let e=M.search.toLowerCase().trim(),t=pack.burgs.filter(e=>e.i&&!e.removed);return e&&(t=t.filter(t=>{let n=t.name.toLowerCase(),r=(pack.states[t.state]?.name||``).toLowerCase(),i=pack.cells.province[t.cell],a=i?pack.provinces[i]?.name.toLowerCase():``,o=(pack.cultures[t.culture]?.name||``).toLowerCase();return n.includes(e)||r.includes(e)||a.includes(e)||o.includes(e)||t.group.toLowerCase().includes(e)})),M.stateId!==-1&&(t=t.filter(e=>e.state===M.stateId)),M.cultureId!==-1&&(t=t.filter(e=>e.culture===M.cultureId)),t}function U(e){let t=r(`burgsBody`),n=pack.burgs.filter(e=>e.i&&!e.removed).length;t.querySelectorAll(`:scope > .states`).forEach(e=>{e.remove()});let i=``,a=0,o=0,s=0,l=0;for(let t of e.all){let e=t.population*options.map.units.population.scale*options.map.units.population.urbanization.rate,n=c(t.product||0,2),r=c(t.population>0?(t.product||0)/t.population:0,2),i=c(t.treasury||0,2);a+=e,o+=n,s+=r,l+=i}for(let t of e.rows){let e=t.population*options.map.units.population.scale*options.map.units.population.urbanization.rate,n=c(t.product||0,2),r=c(t.population>0?(t.product||0)/t.population:0,2),a=c(t.treasury||0,2),o=t.capital&&t.port?`a-capital-port`:t.capital?`c-capital`:t.port?`p-port`:`z-burg`,s=pack.states[t.state].name,l=pack.cells.province[t.cell],u=l?pack.provinces[l].name:``,d=pack.cultures[t.culture].name;i+=`<div
        class="states"
        data-id=${t.i}
        data-name="${t.name}"
        data-state="${s}"
        data-province="${u}"
        data-culture="${d}"
        data-group="${t.group}"
        data-population=${e}
        data-grossproduct=${n}
        data-productpercapita=${r}
        data-treasury=${a}
        data-features="${o}"
      >
        <span data-tip="Кликните, чтобы приблизить область" class="icon-dot-circled pointer" data-col="locate"></span>
        <input data-tip="Название города" class="burgName" value="${t.name}" data-col="name" disabled />
        <input data-tip="Провинция города" value="${u}" data-col="province" disabled />
        <input data-tip="Государство города" value="${s}" data-col="state" disabled />
        <input data-tip="Господствующая культура" value="${d}" data-col="culture" disabled />
        <input data-tip="Группа городов" value="${t.group}" data-col="group" disabled />
        <div data-col="population">
          <span data-tip="Население города" class="icon-male"></span>
          <input data-tip="Население города" value=${f(e)} disabled />
        </div>
        <div data-col="grossproduct">
          <span data-tip="Валовой продукт: выручка от местных продаж минус стоимость закупленных ингредиентов производства.">🟡</span>
          <input data-tip="Валовой продукт: выручка от местных продаж минус стоимость закупленных ингредиентов производства." value=${n} disabled />
        </div>
        <div data-col="productpercapita">
          <span data-tip="Богатство: валовой продукт, делённый на население">🟡</span>
          <input data-tip="Богатство: валовой продукт, делённый на население" value=${r} disabled />
        </div>
        <div data-col="treasury">
          <span data-tip="Казна: накопленный баланс">🟡</span>
          <input data-tip="Казна: накопленный баланс" value=${a} disabled />
        </div>
        <div data-col="features">
          <span
            data-tip="${t.capital?` Этот город — столица государства`:`Этот город НЕ столица государства`}"
            class="icon-star-empty${t.capital?``:` inactive`}" style="padding: 0 1px;"></span>
          <span data-tip="${t.port?` Этот город — порт`:`Этот город не порт`}"
          class="icon-anchor${t.port?``:` inactive`}" style="font-size: .9em; padding: 0 1px;"></span>
        </div>
        <span data-col="edit" data-tip="Изменить город" class="icon-pencil"></span>
        <span data-col="lock" class="locks pointer ${t.lock?`icon-lock`:`icon-lock-open inactive`}" onmouseover="showElementLockTip(event)"></span>
        <span data-col="remove" data-tip="Удалить город" class="icon-trash-empty"></span>
      </div>`}t.insertAdjacentHTML(`beforeend`,i),r(`burgsFooterBurgs`).innerHTML=`${e.all.length} of ${n}`,r(`burgsFooterPopulation`).innerHTML=e.all.length?f(a/e.all.length):`0`,r(`burgsFooterGrossProduct`).innerHTML=e.all.length?String(c(o/e.all.length,2)):`0`,r(`burgsFooterProductPerCapita`).innerHTML=e.all.length?String(c(s/e.all.length,2)):`0`,r(`burgsFooterTreasury`).innerHTML=e.all.length?String(c(l/e.all.length,2)):`0`,E(r(`burgsFooter`),e,F.goto),t.querySelectorAll(`div.states`).forEach(e=>void e.addEventListener(`mouseenter`,e=>W(e))),t.querySelectorAll(`div.states`).forEach(e=>void e.addEventListener(`mouseleave`,()=>G())),t.querySelectorAll(`div > span.icon-dot-circled`).forEach(e=>void e.addEventListener(`click`,K)),t.querySelectorAll(`div > span.locks`).forEach(e=>void e.addEventListener(`click`,q)),t.querySelectorAll(`div > span.icon-pencil`).forEach(e=>void e.addEventListener(`click`,J)),t.querySelectorAll(`div > span.icon-trash-empty`).forEach(e=>void e.addEventListener(`click`,Y))}function W(e){let t=+e.target.dataset.id,r=n(`#labels`).select(`[data-label-type='burg'][data-id='${t}']`);r.size()&&r.classed(`drag`,!0)}function G(){n(`#labels`).selectAll(`text[data-label-type='burg'].drag`).classed(`drag`,!1)}function K(){let e=+this.closest(`.states`).dataset.id,{x:t,y:n}=pack.burgs[e];zoomTo(t,n,8,2e3)}function q(){let e=+this.closest(`.states`).dataset.id;Burgs.setLocked(e,!pack.burgs[e].lock),this.classList.contains(`icon-lock`)?(this.classList.remove(`icon-lock`),this.classList.add(`icon-lock-open`),this.classList.add(`inactive`)):(this.classList.remove(`icon-lock-open`),this.classList.add(`icon-lock`),this.classList.remove(`inactive`))}function J(){let e=+this.closest(`.states`).dataset.id;y.BurgEditor.open(e)}function Y(){let e=+this.closest(`.states`).dataset.id;if(pack.burgs[e].capital){_(`Нельзя удалить столицу. Сначала измените столицу государства`,!1,`error`);return}if(pack.markets?.some(t=>t.centerBurgId===e)){_(`Нельзя удалить город — центр рынка. Сначала удалите рынок`,!1,`error`);return}C({title:`Удалить город`,message:`Вы уверены, что хотите удалить город? <br>Это действие необратимо`,confirm:`Удалить`,onConfirm:()=>{Burgs.remove(e),m(`burg`,e),F.refresh(),p.draw(`burgIcons`,`labels`)}})}function X(){for(let e of H())e.lock||(e.name=Names.getCulture(e.culture));F.refresh(),p.draw(`labels`)}function Z(){let e=pack.states.map(e=>{let t=e.color?e.color:`#ccc`,n=e.fullName?e.fullName:e.name;return{id:e.i,state:e.i?0:null,color:t,name:n}}),t=pack.burgs.filter(e=>e.i&&!e.removed).map(t=>{let n=t.i+e.length-1,r=t.population,i=t.capital,a=pack.cells.province[t.cell],o=a?a+e.length-1:t.state;return{id:n,i:t.i,state:t.state,culture:t.culture,province:a,parent:o,name:t.name,population:r,capital:i,x:t.x,y:t.y}}),i=e.concat(t);if(i.length<2){_(`Нет городов для показа`,!1,`error`);return}let a=h().parentId(e=>e.state)(i).sum(e=>e.population).sort((e,t)=>t.value-e.value),o=r(`uiSize`).valueAsNumber,s=150+200*o,c=150+200*o,l={top:0,right:-50,bottom:-10,left:-50},u=s-l.left-l.right,d=c-l.top-l.bottom,p=g().size([u,d]).padding(3);alertMessage.innerHTML=`<select id="burgsTreeType" style="display:block; margin-left:13px; font-size:11px">
      <option value="states" selected>Группировать по государству</option>
      <option value="cultures">Группировать по культуре</option>
      <option value="parent">Группировать по провинции и государству</option>
      <option value="provinces">Группировать по провинции</option>
    </select>`,alertMessage.innerHTML+=`<div id='burgsInfo' class='chartInfo'>&#8205;</div>`;let m=n(`#alertMessage`).insert(`svg`,`#burgsInfo`).attr(`id`,`burgsTree`).attr(`width`,s).attr(`height`,c-10).attr(`stroke-width`,2).append(`g`).attr(`transform`,`translate(-50, -10)`);r(`burgsTreeType`).addEventListener(`change`,x),p(a);let v=m.selectAll(`circle`).data(a.leaves()).join(`circle`).attr(`data-id`,e=>e.data.i).attr(`r`,e=>e.r).attr(`fill`,e=>e.parent.data.color).attr(`cx`,e=>e.x).attr(`cy`,e=>e.y).on(`mouseenter`,(e,t)=>y(e,t)).on(`mouseleave`,e=>b(e)).on(`click`,(e,t)=>zoomTo(t.data.x,t.data.y,8,2e3));function y(e,t){n(e.target).transition().duration(1500).attr(`stroke`,`#c13119`);let i=t.data.name,a=t.parent.data.name,o=f(t.value*options.map.units.population.scale*options.map.units.population.urbanization.rate);r(`burgsInfo`).innerHTML=`${i}. ${a}. Population: ${o}`,W(e),_(`Кликните, чтобы приблизить область`)}function b(e){G(),r(`burgsInfo`)&&(r(`burgsInfo`).innerHTML=`&#8205;`,n(e.target).transition().attr(`stroke`,null),_(``))}function x(){let e=()=>pack.states.map(e=>{let t=e.color?e.color:`#ccc`,n=e.fullName?e.fullName:e.name;return{id:e.i,state:e.i?0:null,color:t,name:n}}),n=()=>pack.cultures.map(e=>{let t=e.color?e.color:`#ccc`;return{id:e.i,culture:e.i?0:null,color:t,name:e.name}}),r=()=>{let e=pack.states.map(e=>{let t=e.color?e.color:`#ccc`,n=e.fullName?e.fullName:e.name;return{id:e.i,parent:e.i?0:null,color:t,name:n}}),t=pack.provinces.filter(e=>e.i&&!e.removed).map(t=>({id:t.i+e.length-1,parent:t.state,color:t.color,name:t.fullName}));return e.concat(t)},i=()=>pack.provinces.map(e=>{let t=e.color?e.color:`#ccc`,n=e.fullName?e.fullName:e.name;return{id:e.i?e.i:0,province:e.i?0:null,color:t,name:n}}),a=e=>{if(this.value===`states`)return e.state;if(this.value===`cultures`)return e.culture;if(this.value===`parent`)return e.parent;if(this.value===`provinces`)return e.province},o={states:e,cultures:n,parent:r,provinces:i}[this.value]();t.forEach(e=>{e.id=e.i+o.length-1});let s=o.concat(t),c=h().parentId(e=>a(e))(s).sum(e=>e.population).sort((e,t)=>t.value-e.value);v.data(p(c).leaves()).transition().duration(2e3).attr(`data-id`,e=>e.data.i).attr(`fill`,e=>e.parent.data.color).attr(`cx`,e=>e.x).attr(`cy`,e=>e.y).attr(`r`,e=>e.r)}$(`#alert`).dialog({title:`Пузырьковая диаграмма городов`,width:`fit-content`,position:{my:`left bottom`,at:`left+10 bottom-10`,of:`svg`},buttons:{},close:()=>alertMessage.innerHTML=``})}function Q(){let t=`Id,Burg,Province,Province Full Name,State,State Full Name,Culture,Religion,Group,Population,X,Y,Latitude,Longitude,Elevation (${options.map.units.height.unit}),Temperature,Temperature likeness,Capital,Port,Citadel,Walls,Plaza,Temple,Shanty Town,Emblem,Preview link\n`;pack.burgs.filter(e=>e.i&&!e.removed).forEach(e=>{t+=`${e.i},`,t+=`${e.name},`;let n=pack.cells.province[e.cell];t+=n?`${pack.provinces[n].name},`:`,`,t+=n?`${pack.provinces[n].fullName},`:`,`,t+=`${pack.states[e.state].name},`,t+=`${pack.states[e.state].fullName},`,t+=`${pack.cultures[e.culture].name},`,t+=`${pack.religions[pack.cells.religion[e.cell]].name},`,t+=`${e.group},`,t+=`${c(e.population*options.map.units.population.scale*options.map.units.population.urbanization.rate)},`,t+=`${e.x},`,t+=`${e.y},`,t+=`${d(e.y,options.map.geography.coordinates,options.map.graph.height,2)},`,t+=`${l(e.x,options.map.geography.coordinates,options.map.graph.width,2)},`,t+=`${parseInt(u(pack.cells.h[e.cell]),10)},`;let r=grid.cells.temp[pack.cells.g[e.cell]];t+=`${s(r)},`,t+=`${o(r)},`,t+=e.capital?`столица,`:`,`,t+=e.port?`порт,`:`,`,t+=e.citadel?`цитадель,`:`,`,t+=e.walls?`стены,`:`,`,t+=e.plaza?`площадь,`:`,`,t+=e.temple?`храм,`:`,`,t+=e.shanty?`Трущобы,`:`,`,t+=e.coa?`${JSON.stringify(e.coa).replace(/"/g,``).replace(/,/g,`;`)},`:`,`,t+=Burgs.getPreview(e).link,t+=`
`});let n=`${i(`Burgs`)}.csv`;e(t,n)}function te(){alertMessage.innerHTML=`Download burgs list as a text file, make changes and re-upload the file. Make sure the file is a plain text document with each
    name on its own line (the dilimiter is CRLF). If you do not want to change the name, just leave it as is`,$(`#alert`).dialog({title:`Массовое переименование городов`,width:`22em`,position:{my:`center`,at:`center`,of:`svg`},buttons:{Download:()=>{e(pack.burgs.filter(e=>e.i&&!e.removed).map(e=>e.name).join(`\r
`),`${i(`Burg names`)}.txt`)},Upload:ne,Отмена:function(){$(this).dialog(`close`)}}})}function ne(){N??=a(`.txt,.csv`),N.onchange=()=>t(N,re),N.click()}function re(e){if(!e){_(`Не удалось загрузить файл, проверьте формат`,!1,`error`);return}let t=e.replace(/\r\n|\r/g,`
`).split(`
`).map(e=>e.trim()).filter(Boolean);if(!t.length){_(`Не удалось разобрать список, проверьте формат файла`,!1,`error`);return}let n=[],r=`Burgs to be renamed as below:`;r+=`<table class="overflow-table"><tr><th>Id</th><th>Текущее название</th><th>Новое название</th></tr>`;let i=pack.burgs.filter(e=>e.i&&!e.removed);for(let e=0;e<t.length&&e<=i.length;e++){let a=t[e];!a||!i[e]||a===i[e].name||(n.push({id:i[e].i,name:a}),r+=`<tr><td style="width:20%">${i[e].i}</td><td style="width:40%">${i[e].name}</td><td style="width:40%">${a}</td></tr>`)}r+=`</tr></table>`,n.length||(r=`Изменений в файле не найдено. Поменяйте хотя бы пару названий`),alertMessage.innerHTML=r,C({title:`Массовое переименование городов`,message:r,confirm:`Переименовать`,onConfirm:()=>{for(let{id:e,name:t}of n)Burgs.rename(e,t);F.refresh(),p.draw(`labels`)}})}function ie(){let e=()=>pack.burgs.filter(e=>e.i&&!e.removed&&!(e.capital||e.lock)&&!pack.markets?.some(t=>t.centerBurgId===e.i));C({title:`Remove ${e().length} burgs`,message:`
        Are you sure you want to remove all <i>unlocked</i> городы, кроме столиц и рыночных центров?
        <br><i>Чтобы удалить столицу, сначала удалите её государство</i>`,confirm:`Удалить`,onConfirm:()=>{for(let t of e())Burgs.remove(t.i),m(`burg`,t.i);F.refresh(),p.draw(`burgIcons`,`labels`)}})}function ae(){let e=pack.burgs.filter(e=>e.i&&!e.removed),t=e.every(e=>e.lock);for(let n of e)Burgs.setLocked(n.i,!t);F.refresh(),r(`burgsLockAll`).className=t?`icon-lock`:`icon-lock-open`}function oe(){let e=pack.burgs.every(({lock:e,i:t,removed:n})=>e||!t||n);r(`burgsLockAll`).className=e?`icon-lock-open`:`icon-lock`}var se={open:I,showChart:Z,exportCsv:Q};export{se as BurgsOverview};