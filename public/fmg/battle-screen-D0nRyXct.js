import{At as e,Ct as t,Gn as n,Lt as r,On as i,P as a,Tt as o,Un as s,Vn as c,er as l,kt as u,nr as d,ut as f}from"./utils-BXzQ0Tym.js";import{j as p,t as m}from"./layers-Cld3ceTu.js";import{t as h}from"./mean-4Awewi9R.js";import{t as g}from"./sum-BpJJqxFM.js";import{i as _}from"./emblems-generator-BdUAGZhv.js";import{i as v}from"./tooltips-P6FAPAdd.js";import{n as y}from"./dialog-helpers-CJ5pbzaw.js";import{n as b,t as x}from"./index-C_h8P6M7.js";var S=null;function C(e,t){if(customization)return;y(`.stable`),customization=13,w();let n=t.x,r=t.y;S={iteration:0,x:n,y:r,cell:Pack.findCell(n,r)??0,attackers:{regiments:[],distances:[],morale:100,casualties:0,power:0},defenders:{regiments:[],distances:[],morale:100,casualties:0,power:0},phasesRecord:[],place:null,type:`field`,name:``},A(),j(`attackers`,e),j(`defenders`,t),S.place=D(),T(),S.name=O(),V(),R(`attackers`),R(`defenders`),z(),$(`#battleScreen`).dialog({title:S.name,resizable:!1,width:`fit-content`,position:{my:`center`,at:`center`,of:`#map`},close:X})}function w(){document.getElementById(`battleScreen`)?.remove(),document.getElementById(`regimentSelectorScreen`)?.remove(),a(`dialogs`).insertAdjacentHTML(`beforeend`,`<div id="battleScreen" class="dialog stable">
      <div id="battleBody">
        <template id="battlePhases_field">
          <button
            data-tip="Фаза перестрелки. Здесь сильны дальники"
            data-phase="skirmish"
            class="icon-button-skirmish"
          ></button>
          <button data-tip="Фаза рукопашной. Здесь сильны единицы ближнего боя" data-phase="melee" class="icon-button-melee"></button>
          <button
            data-tip="Фаза преследования. Конница превосходит"
            data-phase="pursue"
            class="icon-button-pursue"
          ></button>
          <button
            data-tip="Фаза отступления. Силы уменьшены"
            data-phase="retreat"
            class="icon-button-retreat"
          ></button>
        </template>
        <template id="battlePhases_naval">
          <button
            data-tip="Фаза обстрела. Корабли бомбардируют вражеский флот"
            data-phase="shelling"
            class="icon-button-shelling"
          ></button>
          <button
            data-tip="Фаза абордажа. Рукопашные единицы взходят на борт"
            data-phase="boarding"
            class="icon-button-boarding"
          ></button>
          <button
            data-tip="Фаза погони. Корабли преследуют и редко обстреливают вражеский флот"
            data-phase="chase"
            class="icon-button-chase"
          ></button>
          <button
            data-tip="Фаза отхода. Корабли пытаются уйти от вражеского флота"
            data-phase="withdrawal"
            class="icon-button-withdrawal"
          ></button>
        </template>
        <template id="battlePhases_siege_attackers">
          <button
            data-tip="Фаза блокады. Готовьте или держите блокаду"
            data-phase="blockade"
            class="icon-button-blockade"
          ></button>
          <button
            data-tip="Фаза бомбардировки. Атакуйте осадными машинами"
            data-phase="bombardment"
            class="icon-button-bombardment"
          ></button>
          <button
            data-tip="Фаза штурма. Штурм вражеского города. Здесь сильны бойцы ближнего боя"
            data-phase="storming"
            class="icon-button-storming"
          ></button>
          <button
            data-tip="Фаза грабежа. Разграбите город: сила единиц повышена"
            data-phase="looting"
            class="icon-button-looting"
          ></button>
          <button
            data-tip="Фаза отступления. Силы уменьшены"
            data-phase="retreat"
            class="icon-button-retreat"
          ></button>
        </template>
        <template id="battlePhases_siege_defenders">
          <button
            data-tip="Фаза укрытия. Спрячьтесь за стенами и ждите"
            data-phase="sheltering"
            class="icon-button-sheltering"
          ></button>
          <button
            data-tip="Фаза вылазки. Вылазка из осаждённого города. Здесь сильны бойцы ближнего боя"
            data-phase="sortie"
            class="icon-button-sortie"
          ></button>
          <button
            data-tip="Фаза бомбардировки. Атакуйте осадными машинами"
            data-phase="bombardment"
            class="icon-button-bombardment"
          ></button>
          <button
            data-tip="Фаза обороны. Здесь сильны дальний бой и рукопашная"
            data-phase="defense"
            class="icon-button-defense"
          ></button>
          <button
            data-tip="Фаза капитуляции. Оборона прекращена, силы уменьшены"
            data-phase="surrendering"
            class="icon-button-surrendering"
          ></button>
          <button
            data-tip="Фаза преследования. Конница превосходит"
            data-phase="pursue"
            class="icon-button-pursue"
          ></button>
        </template>
        <template id="battlePhases_ambush_attackers">
          <button
            data-tip="Фаза смятения. Силы уменьшены"
            data-phase="shock"
            class="icon-button-shock"
          ></button>
          <button data-tip="Фаза рукопашной. Здесь сильны единицы ближнего боя" data-phase="melee" class="icon-button-melee"></button>
          <button
            data-tip="Фаза преследования. Конница превосходит"
            data-phase="pursue"
            class="icon-button-pursue"
          ></button>
          <button
            data-tip="Фаза отступления. Силы уменьшены"
            data-phase="retreat"
            class="icon-button-retreat"
          ></button>
        </template>
        <template id="battlePhases_ambush_defenders">
          <button
            data-tip="Фаза внезапной атаки. Силы увеличены, здесь сильны дальники"
            data-phase="surprise"
            class="icon-button-surprise"
          ></button>
          <button data-tip="Фаза рукопашной. Здесь сильны единицы ближнего боя" data-phase="melee" class="icon-button-melee"></button>
          <button
            data-tip="Фаза преследования. Конница превосходит"
            data-phase="pursue"
            class="icon-button-pursue"
          ></button>
          <button
            data-tip="Фаза отступления. Силы уменьшены"
            data-phase="retreat"
            class="icon-button-retreat"
          ></button>
        </template>
        <template id="battlePhases_landing_attackers">
          <button
            data-tip="Фаза высадки. Десант: единицы уязвимы к подготовленной обороне"
            data-phase="landing"
            class="icon-button-landing"
          ></button>
          <button data-tip="Фаза рукопашной. Здесь сильны единицы ближнего боя" data-phase="melee" class="icon-button-melee"></button>
          <button
            data-tip="Фаза преследования. Конница превосходит"
            data-phase="pursue"
            class="icon-button-pursue"
          ></button>
          <button data-tip="Фаза бегства. Сила единиц снижена" data-phase="flee" class="icon-button-flee"></button>
        </template>
        <template id="battlePhases_landing_defenders">
          <button
            data-tip="Фаза смятения. Воины не готовы к обороне"
            data-phase="shock"
            class="icon-button-shock"
          ></button>
          <button
            data-tip="Фаза обороны. Подготовленная оборона: сила единиц повышена"
            data-phase="defense"
            class="icon-button-defense"
          ></button>
          <button data-tip="Фаза рукопашной. Здесь сильны единицы ближнего боя" data-phase="melee" class="icon-button-melee"></button>
          <button
            data-tip="Фаза ожидания. Не может преследовать бегущих на кораблях"
            data-phase="waiting"
            class="icon-button-waiting"
          ></button>
          <button
            data-tip="Фаза преследования. Попытка перехватить бегущих. Конница превосходит"
            data-phase="pursue"
            class="icon-button-pursue"
          ></button>
          <button
            data-tip="Фаза отступления. Силы уменьшены"
            data-phase="retreat"
            class="icon-button-retreat"
          ></button>
        </template>
        <template id="battlePhases_air">
          <button
            data-tip="Фаза маневрирования. Сила единиц снижена"
            data-phase="maneuvering"
            class="icon-button-maneuvering"
          ></button>
          <button
            data-tip="Фаза воздушного боя. Сила единиц повышена"
            data-phase="dogfight"
            class="icon-button-dogfight"
          ></button>
          <button
            data-tip="Фаза преследования. Силы увеличены"
            data-phase="pursue"
            class="icon-button-pursue"
          ></button>
          <button
            data-tip="Фаза отступления. Силы уменьшены"
            data-phase="retreat"
            class="icon-button-retreat"
          ></button>
        </template>
        <div style="font-size: 1.2em; font-weight: bold; width: unset">
          <span>Атакующие</span>
          <div style="float: right; font-size: 0.7em">
            <meter
              id="battleMorale_attackers"
              data-tip="Мораль атакующих: "
              min="0"
              max="100"
              low="33"
              high="66"
              optimum="80"
            ></meter>
            <div
              id="battlePower_attackers"
              data-tip="Сила атакующих на этой фазе. Сила определяет наносимый урон"
              style="display: inline-block; text-align: center"
              class="icon-button-power"
            ></div>
            <div style="display: inline-block">
              <button id="battlePhase_attackers" style="width: 3.2em"></button>
              <div class="battlePhases" style="display: none"></div>
            </div>
            <button
              id="battleDie_attackers"
              data-tip="Случайный коэффициент атакующих. Кликните, чтобы перебросить"
              style="padding: 0.1em 0.2em; width: 3.2em"
              class="icon-button-die"
            ></button>
          </div>
        </div>
        <table id="battleAttackers"></table>
        <div style="font-size: 1.2em; font-weight: bold; width: unset">
          <span>Защитники</span>
          <div style="float: right; font-size: 0.7em">
            <meter
              id="battleMorale_defenders"
              data-tip="Мораль защитников: "
              min="0"
              max="100"
              low="33"
              high="66"
              optimum="80"
            ></meter>
            <div
              id="battlePower_defenders"
              data-tip="Сила защитников на этой фазе. Сила определяет наносимый урон"
              style="display: inline-block; text-align: center"
              class="icon-button-power"
            ></div>
            <div style="display: inline-block">
              <button id="battlePhase_defenders" style="width: 3.2em"></button>
              <div class="battlePhases" style="display: none"></div>
            </div>
            <button
              id="battleDie_defenders"
              data-tip="Случайный коэффициент защитников. Кликните, чтобы перебросить"
              style="padding: 0.1em 0.2em; width: 3.2em"
              class="icon-button-die"
            ></button>
          </div>
        </div>
        <table id="battleDefenders"></table>
      </div>
      <div id="battleBottom">
        <button id="battleType" data-tip="Тип сражения. Кликните, чтобы изменить"></button>
        <div class="battleTypes" style="display: none">
          <button
            data-tip="Полевое сражение: обычный тип боя"
            data-type="field"
            class="icon-button-field"
          ></button>
          <button data-tip="Морское сражение: бой морских единиц" data-type="naval" class="icon-button-naval"></button>
          <button data-tip="Осада: блокада города и штурм" data-type="siege" class="icon-button-siege"></button>
          <button data-tip="Засада: внезапная атака" data-type="ambush" class="icon-button-ambush"></button>
          <button data-tip="Высадка: десантная атака" data-type="landing" class="icon-button-landing"></button>
          <button
            data-tip="Воздушное сражение: маневренный бой авиаотрядов"
            data-type="air"
            class="icon-button-air"
          ></button>
        </div>
        <button id="battleNameShow" data-tip="Название битвы" class="icon-font"></button>
        <div id="battleNameSection" style="display: none">
          <button id="battleNameHide" data-tip="Скрыть название сражения" class="icon-font"></button>
          <input id="battleNamePlace" data-tip="Введите название места" style="width: 30%" />
          <input id="battleNameFull" data-tip="Введите полное название битвы" style="width: 46%" />
          <button
            id="battleNameCulture"
            data-tip="Создать культурно-специфичное название для места и сражения"
            class="icon-book"
          ></button>
          <button
            id="battleNameRandom"
            data-tip="Создать случайное название для места и сражения"
            class="icon-globe"
          ></button>
        </div>
        <button id="battleAddRegiment" data-tip="Добавить полк в сражение" class="icon-user-plus"></button>
        <button id="battleRoll" data-tip="Бросьте кубики, чтобы обновить случайный коэффициент" class="icon-die"></button>
        <button id="battleRun" data-tip="Провести бой ещё раз" class="icon-play"></button>
        <button
          id="battleApply"
          data-tip="Завершить сражение: применить текущие итоги и закрыть экран"
          class="icon-check"
        ></button>
        <button
          id="battleCancel"
          data-tip="Отменить сражение: откатить итоги и закрыть экран"
          class="icon-cancel"
        ></button>
        <button id="battleWiki" data-tip="Урок по бою" class="icon-info"></button>
      </div>
    </div>
    <div id="regimentSelectorScreen" class="dialog">
      <div id="regimentSelectorHeader" class="header" style="grid-template-columns: 9em 13em 4em 6em">
        <div data-tip="Кликните, чтобы отсортировать по названию государства" class="sortable alphabetically" data-sortby="state">
          State&nbsp;
        </div>
        <div data-tip="Кликните, чтобы отсортировать по названию полка" class="sortable alphabetically" data-sortby="regiment">
          Regiment&nbsp;
        </div>
        <div data-tip="Кликните, чтобы отсортировать по общему числу войска" class="sortable" data-sortby="total">Total&nbsp;</div>
        <div
          data-tip="Кликните, чтобы отсортировать по расстоянию до поля боя"
          class="sortable icon-sort-number-up"
          data-sortby="distance"
        >
          Distance&nbsp;
        </div>
      </div>
      <div id="regimentSelectorBody" class="table"></div>
    </div>`),b(`battleScreen`,`regimentSelectorHeader`),a(`battleType`).addEventListener(`click`,e=>q(e)),a(`battleType`).nextElementSibling.addEventListener(`click`,e=>J(e)),a(`battleNameShow`).addEventListener(`click`,()=>N()),a(`battleNamePlace`).addEventListener(`change`,e=>{S&&(S.place=e.target.value)}),a(`battleNameFull`).addEventListener(`change`,e=>F(e)),a(`battleNameCulture`).addEventListener(`click`,()=>I(`culture`)),a(`battleNameRandom`).addEventListener(`click`,()=>I(`random`)),a(`battleNameHide`).addEventListener(`click`,()=>P()),a(`battleAddRegiment`).addEventListener(`click`,()=>M()),a(`battleRoll`).addEventListener(`click`,()=>V()),a(`battleRun`).addEventListener(`click`,()=>W()),a(`battleApply`).addEventListener(`click`,()=>te()),a(`battleCancel`).addEventListener(`click`,()=>X()),a(`battleWiki`).addEventListener(`click`,()=>f(`Battle-Simulator`)),a(`battlePhase_attackers`).addEventListener(`click`,e=>q(e)),a(`battlePhase_attackers`).nextElementSibling.addEventListener(`click`,e=>Y(e,`attackers`)),a(`battlePhase_defenders`).addEventListener(`click`,e=>q(e)),a(`battlePhase_defenders`).nextElementSibling.addEventListener(`click`,e=>Y(e,`defenders`)),a(`battleDie_attackers`).addEventListener(`click`,()=>H(`attackers`)),a(`battleDie_defenders`).addEventListener(`click`,()=>H(`defenders`))}function T(){let e=S,t=e.attackers.regiments[0],n=e.defenders.regiments[0];e.type=(()=>{let r=Object.keys(t.u).map(e=>options.map.military.units.find(t=>t.name===e).type),i=Object.keys(n.u).map(e=>options.map.military.units.find(t=>t.name===e).type);return t.n&&n.n?`naval`:r.every(e=>e===`aviation`)&&i.every(e=>e===`aviation`)?`air`:t.n&&!n.n&&r.some(e=>e!==`naval`)?`landing`:!n.n&&(pack.burgs[pack.cells.burg[e.cell]].walls||pack.burgs[pack.cells.burg[e.cell]].citadel)?`siege`:u(.1)&&[5,6,7,8,9,12].includes(pack.cells.biome[e.cell])?`ambush`:`field`})(),E()}function E(){let e=S;a(`battleType`).className=`icon-button-${e.type}`;let t=document.getElementById(`battlePhases_${e.type}_attackers`),n=t?t.content:a(`battlePhases_${e.type}`).content,r=t?a(`battlePhases_${e.type}_defenders`).content:n,i=a(`battlePhase_attackers`).nextElementSibling,o=a(`battlePhase_defenders`).nextElementSibling;i.innerHTML=``,o.innerHTML=``,i.append(n.cloneNode(!0)),o.append(r.cloneNode(!0))}function D(){let e=pack.cells,t=S.cell,n=e.burg[t]?pack.burgs[e.burg[t]].name:null,r=!n&&e.r[t]?(e=>{let t=pack.rivers.find(t=>t.i===e);return`${t.name} ${t.type}`})(e.r[t]):null,i=n||r?null:Names.getCulture(e.culture[t]);return n||r||i}function O(){let e=S;return e.type===`field`?`Battle of ${e.place}`:e.type===`naval`?`Naval Battle of ${e.place}`:e.type===`siege`?`Siege of ${e.place}`:e.type===`ambush`?`${e.place} Ambush`:e.type===`landing`?`${e.place} Landing`:`${e.place} ${u(.8)?`Воздушное сражение`:`Воздушный бой`}`}function k(){let e=S;return e.type===`field`?`field battle`:e.type===`naval`?`naval battle`:e.type===`siege`?`siege`:e.type===`ambush`?`ambush`:e.type===`landing`?`landing`:`battle`}function A(){let e=`<thead><tr><th></th><th></th>`;for(let t of options.map.military.units){let n=s(t.name.replace(/_/g,` `));e+=`<th data-tip="${n}">${_.html(t.icon)}</th>`}e+=`<th data-tip="Всего войско">Всего</th></tr></thead>`,a(`battleAttackers`).innerHTML=e,a(`battleDefenders`).innerHTML=e}function j(e,t){let r=S;t.casualties=Object.keys(t.u).reduce((e,t)=>(e[t]=0,e),{}),t.survivors={...t.u};let i=pack.states[t.state],o=Math.hypot(r.y-t.by,r.x-t.bx)*options.map.units.distance.scale|0,s=`<svg width="1.4em" height="1.4em" style="margin-bottom: -.6em; stroke: #333">
      <rect x="0" y="0" width="100%" height="100%" fill="${i.color?.[0]===`#`?i.color:`#999`}"></rect>
      <use href="${n(_.href(t.icon??``))}" x="10%" y="10%" width="80%" height="80%" stroke="none"></use></svg>`,c=`<tbody id="battle${i.i}-${t.i}">`,l=`<tr class="battleInitial"><td>${s}</td><td class="regiment" data-tip="${t.name}">${t.name.slice(0,24)}</td>`,u=`<tr class="battleCasualties"><td></td><td data-tip="${i.fullName}">${i.fullName.slice(0,26)}</td>`,d=`<tr class="battleSurvivors"><td></td><td data-tip="Длина линии снабжения, влияет на мораль">Расстояние до базы: ${o} ${options.map.units.distance.unit}</td>`;for(let e of options.map.military.units)l+=`<td data-tip="Начальные силы" style="width: 2.5em; text-align: center">${t.u[e.name]||0}</td>`,u+=`<td data-tip="Потери" style="width: 2.5em; text-align: center; color: red">0</td>`,d+=`<td data-tip="Уцелевшие" style="width: 2.5em; text-align: center; color: green">${t.u[e.name]||0}</td>`;l+=`<td data-tip="Начальные силы" style="width: 2.5em; text-align: center">${t.a||0}</td></tr>`,u+=`<td data-tip="Потери"  style="width: 2.5em; text-align: center; color: red">0</td></tr>`,d+=`<td data-tip="Уцелевшие" style="width: 2.5em; text-align: center; color: green">${t.a||0}</td></tr>`;let f=a(e===`attackers`?`battleAttackers`:`battleDefenders`);f.innerHTML+=`${c+l+u+d}</tbody>`,r[e].regiments.push(t),r[e].distances.push(o)}function M(){let e=S,t=a(`regimentSelectorBody`),n=pack.states.filter(e=>e.military&&!e.removed).flatMap(e=>e.military),r=t=>d(Math.hypot(e.y-t.y,e.x-t.x)*options.map.units.distance.scale),i=t=>e.defenders.regiments.some(e=>e===t)||e.attackers.regiments.some(e=>e===t);t.innerHTML=n.map(e=>{let t=pack.states[e.state],n=i(e),a=n?0:r(e),o=`${a} ${options.map.units.distance.unit}`;return`<div ${n?`class='inactive'`:``} data-s=${t.i} data-i=${e.i} data-state=${t.name} data-regiment=${e.name}
        data-total=${e.a} data-distance="${a}" data-tip="Кликните, чтобы выбрать полк">
        <svg width=".9em" height=".9em" style="margin-bottom:-1px; stroke: #333"><rect x="0" y="0" width="100%" height="100%" fill="${t.color}" ></svg>
        <div style="width:6em">${t.name.slice(0,11)}</div>
        <div style="width:1.2em; display:flex">${_.html(e.icon??``)}</div>
        <div style="width:13em">${e.name.slice(0,24)}</div>
        <div style="width:4em">${e.a}</div>
        <div style="width:4em">${o}</div>
      </div>`}).join(``),$(`#regimentSelectorScreen`).dialog({resizable:!1,width:`fit-content`,title:`Добавить полк в сражение`,position:{my:`left center`,at:`right+10 center`,of:`#battleScreen`},close:c,buttons:{"Add to attackers":()=>s(`attackers`),"Add to defenders":()=>s(`defenders`),Cancel:()=>$(`#regimentSelectorScreen`).dialog(`close`)}}),x(a(`regimentSelectorHeader`)),t.addEventListener(`click`,o);function o(e){let t=e.target;if(t.className===`inactive`){v(`Полк уже в бою`,!1,`error`);return}t.classList.toggle(`selected`)}function s(n){let r=t.querySelectorAll(`.selected`);if(!r.length){v(`Сначала выберите полк`,!1,`error`);return}$(`#regimentSelectorScreen`).dialog(`close`),r.forEach(t=>{let r=pack.states[+t.dataset.s].military.find(e=>e.i===+t.dataset.i);j(n,r),R(n),z();let i=e.defenders.regiments,a=e.attackers.regiments,o=n===`attackers`?a.length*-8:(i.length-1)*8;r.px=r.x,r.py=r.y,p(r,i[0].x,i[0].y+o)})}function c(){t.innerHTML=``,t.removeEventListener(`click`,o)}}function N(){document.querySelectorAll(`#battleBottom > button`).forEach(e=>{e.style.display=`none`}),a(`battleNameSection`).style.display=`inline-block`,a(`battleNamePlace`).value=S.place??``,a(`battleNameFull`).value=S.name}function P(){document.querySelectorAll(`#battleBottom > button`).forEach(e=>{e.style.display=`inline-block`}),a(`battleNameSection`).style.display=`none`}function F(e){let t=e.target.value;S.name=t,$(`#battleScreen`).dialog({title:t})}function I(e){let t=S,n=e===`culture`?Names.getCulture(pack.cells.culture[t.cell],void 0,void 0,``):Names.getBase(r(Names.nameBases.length-1));t.place=n,a(`battleNamePlace`).value=n,t.name=O(),a(`battleNameFull`).value=t.name,$(`#battleScreen`).dialog({title:t.name})}function L(e){return e.reduce((e,t)=>{for(let n in t.survivors)Object.hasOwn(t.survivors,n)&&(e[n]=(e[n]||0)+t.survivors[n]);return e},{})}function R(e){let t=S,n={skirmish:{melee:.2,ranged:2.4,mounted:.1,machinery:3,naval:1,armored:.2,aviation:1.8,magical:1.8},melee:{melee:2,ranged:1.2,mounted:1.5,machinery:.5,naval:.2,armored:2,aviation:.8,magical:.8},pursue:{melee:1,ranged:1,mounted:4,machinery:.05,naval:1,armored:1,aviation:1.5,magical:.6},retreat:{melee:.1,ranged:.01,mounted:.5,machinery:.01,naval:.2,armored:.1,aviation:.8,magical:.05},shelling:{melee:0,ranged:.2,mounted:0,machinery:2,naval:2,armored:0,aviation:.1,magical:.5},boarding:{melee:1,ranged:.5,mounted:.5,machinery:0,naval:.5,armored:.4,aviation:0,magical:.2},chase:{melee:0,ranged:.15,mounted:0,machinery:1,naval:1,armored:0,aviation:.15,magical:.5},withdrawal:{melee:0,ranged:.02,mounted:0,machinery:.5,naval:.1,armored:0,aviation:.1,magical:.3},blockade:{melee:.25,ranged:.25,mounted:.2,machinery:.5,naval:.2,armored:.1,aviation:.25,magical:.25},sheltering:{melee:.3,ranged:.5,mounted:.2,machinery:.5,naval:.2,armored:.1,aviation:.25,magical:.25},sortie:{melee:2,ranged:.5,mounted:1.2,machinery:.2,naval:.1,armored:.5,aviation:1,magical:1},bombardment:{melee:.2,ranged:.5,mounted:.2,machinery:3,naval:1,armored:.5,aviation:1,magical:1},storming:{melee:1,ranged:.6,mounted:.5,machinery:1,naval:.1,armored:.1,aviation:.5,magical:.5},defense:{melee:2,ranged:3,mounted:1,machinery:1,naval:.1,armored:1,aviation:.5,magical:1},looting:{melee:1.6,ranged:1.6,mounted:.5,machinery:.2,naval:.02,armored:.2,aviation:.1,magical:.3},surrendering:{melee:.1,ranged:.1,mounted:.05,machinery:.01,naval:.01,armored:.02,aviation:.01,magical:.03},surprise:{melee:2,ranged:2.4,mounted:1,machinery:1,naval:1,armored:1,aviation:.8,magical:1.2},shock:{melee:.5,ranged:.5,mounted:.5,machinery:.4,naval:.3,armored:.1,aviation:.4,magical:.5},landing:{melee:.8,ranged:.6,mounted:.6,machinery:.5,naval:.5,armored:.5,aviation:.5,magical:.6},flee:{melee:.1,ranged:.01,mounted:.5,machinery:.01,naval:.5,armored:.1,aviation:.2,magical:.05},waiting:{melee:.05,ranged:.5,mounted:.05,machinery:.5,naval:2,armored:.05,aviation:.5,magical:.5},maneuvering:{melee:0,ranged:.1,mounted:0,machinery:.2,naval:0,armored:0,aviation:1,magical:.2},dogfight:{melee:0,ranged:.1,mounted:0,machinery:.1,naval:0,armored:0,aviation:2,magical:.1}},r=L(t[e].regiments),i=t[e].phase,o=Math.max(options.map.units.population.scale/10,10);t[e].power=g(options.map.military.units.map(e=>(r[e.name]||0)*e.power*n[i][e.type]))/o;let s=t[e].power?Math.max(t[e].power|0,1):0;a(`battlePower_${e}`).innerHTML=String(s)}function z(){let e=S,t=e=>l(100-e**1.5*10+10,50,100),n=e=>Math.min((h(e)??0)/50,15),r=e.defenders.power/e.attackers.power;e.attackers.morale=t(r)-n(e.attackers.distances),e.defenders.morale=t(1/r)-n(e.defenders.distances),B(`attackers`),B(`defenders`)}function B(e){let t=S,n=a(`battleMorale_${e}`);n.dataset.tip=(n.dataset.tip||``).replace(n.value,``),n.value=String(t[e].morale|0),n.dataset.tip+=n.value}function V(){H(`attackers`),H(`defenders`),U(),R(`attackers`),R(`defenders`)}function H(e){let t=S,n=a(`battleDie_${e}`),i=+n.innerHTML,o;do o=r(1,6),n.innerHTML=String(o);while(o===i);t[e].die=o}function U(){let e=S,t=e.iteration,n=[e.attackers.morale,e.defenders.morale],r=e.attackers.power/e.defenders.power,i=()=>{let r=[e.attackers.phase||`skirmish`,e.defenders.phase||`skirmish`];if(u(1-n[0]/25))return[`retreat`,`pursue`];if(u(1-n[1]/25))return[`pursue`,`retreat`];if(r[0]===`skirmish`&&r[1]===`skirmish`){let n=L(e.attackers.regiments.concat(e.defenders.regiments)),r=g(Object.values(n));if(u(g(options.map.military.units.filter(e=>e.type===`ranged`).map(e=>e.name).map(e=>n[e]))/r)||u(.8-t/10))return[`skirmish`,`skirmish`]}return[`melee`,`melee`]},o=()=>{let n=[e.attackers.phase||`shelling`,e.defenders.phase||`shelling`];if(n[0]===`withdrawal`)return[`withdrawal`,`chase`];if(n[0]===`chase`)return[`chase`,`withdrawal`];if(n[0]!==`boarding`){if(r<.5||u(e.attackers.casualties)&&r<1)return[`withdrawal`,`chase`];if(r>2||u(e.defenders.casualties)&&r>1)return[`chase`,`withdrawal`]}return n[0]===`boarding`||u(t/10-.1)?[`boarding`,`boarding`]:[`shelling`,`shelling`]},s=()=>{let i=[e.attackers.phase||`blockade`,e.defenders.phase||`sheltering`],a=[`blockade`,`sheltering`];if(i[0]===`retreat`||i[0]===`looting`)return i;if(u(1-n[0]/30)&&r<1)return[`retreat`,`pursue`];if(u(1-n[1]/15))return[`looting`,`surrendering`];if(u((r-1)/2))return[`storming`,`defense`];if(i[0]!==`storming`){let r=options.map.military.units.filter(e=>e.type===`machinery`).map(e=>e.name),o=L(e.attackers.regiments),s=g(r.map(e=>o[e]));t&&s&&u(.9)&&(a[0]=`bombardment`);let c=L(e.defenders.regiments),l=g(r.map(e=>c[e]));l&&u(.9)&&(a[1]=`bombardment`),t&&i[1]!==`sortie`&&l<s&&u(.25)&&u(n[1]/70)&&(a[1]=`sortie`)}return a},c=()=>[e.attackers.phase||`shock`,e.defenders.phase||`surprise`][1]===`surprise`&&u(1-r*t/5)?[`shock`,`surprise`]:u(1-n[0]/25)?[`retreat`,`pursue`]:u(1-n[1]/25)?[`pursue`,`retreat`]:[`melee`,`melee`],l=()=>{let r=[e.attackers.phase||`landing`,e.defenders.phase||`defense`];return r[1]===`waiting`?[`flee`,`waiting`]:r[1]===`pursue`?[`flee`,u(.3)?`pursue`:`waiting`]:r[1]===`retreat`?[`pursue`,`retreat`]:r[0]===`landing`?[u(t/2)?`melee`:`landing`,t?r[1]:u(.5)?`defense`:`shock`]:u(1-n[0]/40)?[`flee`,`pursue`]:u(1-n[1]/25)?[`pursue`,`retreat`]:[`melee`,`melee`]},d=()=>{let r=[e.attackers.phase||`maneuvering`,e.defenders.phase||`maneuvering`];return u(1-n[0]/25)?[`retreat`,`pursue`]:u(1-n[1]/25)?[`pursue`,`retreat`]:r[0]===`maneuvering`&&u(1-t/10)?[`maneuvering`,`maneuvering`]:[`dogfight`,`dogfight`]},f=(()=>{switch(e.type){case`field`:return i();case`naval`:return o();case`siege`:return s();case`ambush`:return c();case`landing`:return l();case`air`:return d();default:return i()}})();e.attackers.phase=f[0],e.defenders.phase=f[1];let p=a(`battlePhase_attackers`);p.className=`icon-button-${e.attackers.phase}`,p.dataset.tip=p.nextElementSibling.querySelector(`[data-phase='${f[0]}']`).dataset.tip;let m=a(`battlePhase_defenders`);m.className=`icon-button-${e.defenders.phase}`,m.dataset.tip=m.nextElementSibling.querySelector(`[data-phase='${f[1]}']`).dataset.tip}function W(){let e=S;if(!e.attackers.power){v(`Армия атакующих разгромлена`,!1,`warn`);return}if(!e.defenders.power){v(`Армия защитников разгромлена`,!1,`warn`);return}let t=`Attackers: ${e.attackers.phase}, defenders: ${e.defenders.phase}`,n=e.phasesRecord.at(-1);n?.phase===t?n.count+=1:e.phasesRecord.push({phase:t,count:1});let r=e.attackers.power*(e.attackers.die/10+.4),i=e.defenders.power*(e.defenders.die/10+.4),a={skirmish:.1,melee:.2,pursue:.3,retreat:.3,boarding:.2,shelling:.1,chase:.03,withdrawal:.03,blockade:0,sheltering:0,sortie:.1,bombardment:.05,storming:.2,defense:.2,looting:.5,surrendering:.5,surprise:.3,shock:.3,landing:.3,flee:0,waiting:0,maneuvering:.1,dogfight:.2},o=Math.random()*Math.max(a[e.attackers.phase],a[e.defenders.phase]),s=o*i/(r+i),c=o*r/(r+i);G(`attackers`,s),G(`defenders`,c),e.attackers.casualties+=s,e.defenders.casualties+=c,e.attackers.morale=Math.max(e.attackers.morale-s*100-1,0),e.defenders.morale=Math.max(e.defenders.morale-c*100-1,0),K(`attackers`),K(`defenders`),e.iteration+=1,U(),R(`attackers`),R(`defenders`)}function G(t,n){let r=S;for(let i of r[t].regiments)for(let t in i.u){let r=.8+Math.random()*.4,a=Math.min(e(i.u[t]*n*r),i.survivors[t]);i.casualties[t]-=a,i.survivors[t]-=a}}function K(e){let t=S;for(let n of t[e].regiments){let e=a(`battle${n.state}-${n.i}`),t=e.querySelector(`.battleCasualties`),r=e.querySelector(`.battleSurvivors`),i=3;for(let e of options.map.military.units)t.querySelector(`td:nth-child(${i})`).innerHTML=String(n.casualties[e.name]||0),r.querySelector(`td:nth-child(${i})`).innerHTML=String(n.survivors[e.name]||0),i++;t.querySelector(`td:nth-child(${i})`).innerHTML=String(g(Object.values(n.casualties))),r.querySelector(`td:nth-child(${i})`).innerHTML=String(g(Object.values(n.survivors)))}B(e)}function q(e){e.stopPropagation();let t=e.target,n=t.nextElementSibling,r=()=>{t.style.opacity=`1`,n.style.display=`none`};if(n.style.display===`block`){r();return}t.style.opacity=`0.5`,n.style.display=`block`,document.getElementsByTagName(`body`)[0].addEventListener(`click`,r,{once:!0})}function J(e){let t=e.target;if(t.tagName!==`BUTTON`)return;let n=S;n.type=t.dataset.type,E(),U(),R(`attackers`),R(`defenders`),n.name=O(),$(`#battleScreen`).dialog({title:n.name})}function Y(e,t){let n=e.target;if(n.tagName!==`BUTTON`)return;let r=S,i=n.dataset.phase;r[t].phase=i;let o=a(`battlePhase_${t}`);o.className=`icon-button-${i}`,o.dataset.tip=n.dataset.tip,R(t)}function ee(e){return e===1?`was annihilated`:e>.9?`was virtually wiped out`:e>.75?`was nearly destroyed`:e>.6?`was devastated`:e>.45?`sustained catastrophic losses`:e>.3?`sustained severe losses`:e>.2?`sustained heavy losses`:e>.1?`took considerable losses`:e>.05?`took noticeable losses`:e>0?`took minor losses`:`emerged unscathed`}function te(){let e=S,n=e.name,r=Math.max(e.attackers.casualties,e.defenders.casualties),a=e.attackers.casualties+e.defenders.casualties,s=l(a?e.defenders.casualties/a:NaN,r);function l(e,t){return Number.isNaN(e)?[`standoff`,`standoff`]:t<.05?[`minor skirmishes`,`minor skirmishes`]:e>.95?[`attackers flawless victory`,`disorderly retreat of defenders`]:e>.7?[`attackers decisive victory`,`defenders disastrous defeat`]:e>.6?[`attackers victory`,`defenders defeat`]:e>.4?[`stalemate`,`stalemate`]:e>.3?[`attackers defeat`,`defenders victory`]:e>=0?[`attackers disorderly retreat`,`flawless victory of defenders`]:[`stalemate`,`stalemate`]}e.attackers.regiments.forEach(e=>{f(e,`attackers`)}),e.defenders.regiments.forEach(e=>{f(e,`defenders`)});function f(e,t){let r=`regiment${e.state}-${e.i}`;if(e.note){let r=t===`attackers`?s[0]:s[1],i=ee(e.a?Math.abs(g(Object.values(e.casualties)))/e.a:1),a=Object.keys(e.u).map(t=>e.u[t]?`${e.u[t]} ${t}`:null).filter(e=>!!e),c=a.length?` Initial forces: ${o(a)}.`:``,l=Object.keys(e.casualties).map(t=>e.casualties[t]?`${Math.abs(e.casualties[t])} ${t}`:null).filter(e=>!!e),u=l.length?` Casualties: ${o(l)}.`:``;e.note+=`<br><br>${n} (${options.map.lore.calendar.year} ${options.map.lore.calendar.eraShort}): ${r}. The regiment ${i}.${c}${u}`}e.u={...e.survivors},e.a=g(Object.values(e.u)),i(`#armies`).select(`g#${r} > text`).text(Military.getTotal(e)),p(e,e.px,e.py)}let h={i:(c(pack.markers)?.i??-1)+1,x:e.x,y:e.y,cell:e.cell,icon:_.glyph(`⚔️`),type:`battlefields`,dy:52,name:e.name};pack.markers.push(h),m.draw(`markers`);let y=(e,n)=>e.length>1?`${n?`полки`:`силы`} of ${o([...new Set(e.map(e=>pack.states[e.state].name))])}`:`${t(pack.states[e[0].state].name)} ${e[0].name}`,b=e=>Math.min(d(e*100),100),x=(e,t)=>e.reduce((e,n)=>{for(let r in n.casualties)e[r]=(e[r]||0)+t(n,r);return e},{}),C=e=>{let t=Object.keys(e).map(t=>e[t]?`${e[t]} ${t}`:null).filter(e=>!!e);return t.length?o(t):``},w=(e,t)=>{let n=C(x(t.regiments,(e,t)=>(e.survivors[t]||0)+Math.abs(e.casualties[t]))),r=C(x(t.regiments,(e,t)=>Math.abs(e.casualties[t]))),i=n?`<br>${e} initial forces: ${n}.`:``;return r&&(i+=` Casualties: ${r}.`),i},T=s[+u(.7)],E=`The ${k()} ended in ${T}`,D=`${e.name} took place in ${options.map.lore.calendar.year} ${options.map.lore.calendar.eraShort}. It was fought between ${y(e.attackers.regiments,1)} and ${y(e.defenders.regiments,0)}. ${E}.
      <br>Attackers losses: ${b(e.attackers.casualties)}%, defenders losses: ${b(e.defenders.casualties)}%.`;if(D+=w(`Attackers`,e.attackers),D+=w(`Defenders`,e.defenders),e.phasesRecord.length){let t=e.phasesRecord.map(e=>e.count>1?`${e.phase} (x${e.count})`:e.phase).join(`<br>`);D+=`<br><br>Ход сражения:<br>${t}`}h.note=D,v(`${e.name} is over. ${E}`,!0,`success`,4e3),Z(),Q()}function X(){let e=S;e.attackers.regiments.forEach(e=>{p(e,e.px,e.py)}),e.defenders.regiments.forEach(e=>{p(e,e.px,e.py)}),Z(),Q()}function Z(){$(`#battleScreen`).dialog(`destroy`),a(`battleScreen`).remove();let e=document.getElementById(`regimentSelectorScreen`);e?.classList.contains(`ui-dialog-content`)&&$(`#regimentSelectorScreen`).dialog(`destroy`),e?.remove()}function Q(){customization=0,S&&S.attackers.regiments.concat(S.defenders.regiments).forEach(e=>{delete e.px,delete e.py,delete e.casualties,delete e.survivors}),S=null}var ne={open:C};export{ne as BattleScreen};