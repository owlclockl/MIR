import{Bn as e,H as t,On as n,P as r,U as i,_t as a,a as o,nn as s,nr as c,o as l,ot as u,y as d,z as f}from"./utils-BXzQ0Tym.js";import{U as p,V as m,t as h,z as g}from"./layers-Bcg3SU5R.js";import{t as _}from"./sum-BpJJqxFM.js";import{t as v}from"./sin-DYm9hqTl.js";import{i as y}from"./tooltips-P6FAPAdd.js";import{t as b}from"./controllers-DoYIZ-kt.js";import{t as x}from"./population-generator-DwMOimZQ.js";import{i as S,l as C,n as w,s as T}from"./dialog-helpers-CJ5pbzaw.js";import{i as E,r as D}from"./index-sJ7uR-QF.js";import{t as O}from"./highlighting-CeezudJT.js";import{a as k,i as A,n as j,r as M}from"./table-XWt9IQic.js";import{i as ee,t as te}from"./relief-previews-CiQ9sLd2.js";import{t as ne}from"./relief-pool-editor-CytXibdg.js";var N=`biomesEditor`,P=`Biomes`,F={my:`right top`,at:`right-10 top+10`,of:`svg`,collision:`fit`},I=[],L=[{key:`name`,label:`Биом`,width:`15em`,permanent:!0,sortBy:e=>e.name,sortType:`alpha`},{key:`habitability`,label:`Пригодность`,width:`6.5em`,sortBy:e=>e.habitability},{key:`relief`,label:`Рельеф`,width:`6.5em`,sortBy:e=>e.iconsDensity},{key:`cells`,label:`Ячейки`,width:`5em`,sortBy:e=>I[e.i]?.cells??0,defaultSort:`desc`},{key:`area`,label:`Площадь`,width:`7em`,mobileHidden:!0,sortBy:e=>I[e.i]?.area??0},{key:`population`,label:`Население`,width:`6.2em`,mobileHidden:!0,sortBy:e=>{let t=I[e.i];return t?t.rural+t.urban:0}},{key:`note`,width:`1.1em`},{key:`wiki`,width:`1.1em`},{key:`remove`,width:`1.4em`,permanent:!0}],R=M({getData:()=>E(N,pack.biomes.filter(e=>e.i&&!e.removed),L),onUpdate:e=>W(e,I)});function z(){customization||(w(`#${N}, .stable`),h.show(`biomes`),h.hide(`states`,`cultures`),h.hide(`religions`,`provinces`),B(),I=U(),R.reset(),$(`#${N}`).dialog({title:`Редактор биомов`,resizable:!1,close:pe,position:F}))}function B(){S(N);let e=`<div id="${N}" class="dialog stable editorDialog">
      ${A({dialogId:N,columns:L})}
      <div id="biomesBody" class="table" data-type="absolute"></div>
      <div id="biomesFooter" class="totalLine">
        <div data-tip="Биомов на суше" style="margin-left: 12px">
          Biomes:&nbsp;<span id="biomesFooterBiomes">0</span>
        </div>
        <div data-col="cells" data-tip="Ячеек суши" style="margin-left: 12px">
          Cells:&nbsp;<span id="biomesFooterCells">0</span>
        </div>
        <div data-col="area" data-tip="Площадь суши" style="margin-left: 12px">
          Land Area:&nbsp;<span id="biomesFooterArea">0</span>
        </div>
        <div data-col="population" data-tip="Всего населения" style="margin-left: 12px">
          Population:&nbsp;<span id="biomesFooterPopulation">0</span>
        </div>
      </div>
      <div id="biomesBottom">
        <button id="biomesEditorRefresh" data-tip="Обновить редактор" class="icon-cw"></button>
        <button id="biomesEditStyle" data-tip="Изменить стиль биомов в редакторе стиля" class="icon-adjust"></button>
        <button id="biomesLegend" data-tip="Переключить окно легенды" class="icon-list-bullet"></button>
        <button
          id="biomesPercentage"
          data-tip="Переключить проценты / абсолютные значения"
          class="icon-percent"
        ></button>
        <button
          id="biomesManually"
          data-tip="Вручную переназначить биомы, отступив от обычной зависимости влажности/температуры"
          class="icon-brush"
        ></button>
        <button id="biomesReliefRules" data-tip="Изменить правила рельефа: холмы, горы и прочее по высоте" class="icon-mountain"></button>
        <button id="biomesAdd" data-tip="Добавить свой биом" class="icon-plus"></button>
        <button
          id="biomesRestore"
          data-tip="Вернуть значения по умолчанию и определить биомы заново по текущей влажности и температуре"
          class="icon-history"
        ></button>
        <button
          id="biomesExport"
          data-tip="Скачать данные биомов в текстовый файл (.csv)"
          class="icon-download"
        ></button>
      </div>
    </div>`;r(`dialogs`).insertAdjacentHTML(`beforeend`,e),j({dialogId:N,columns:L,onUpdate:()=>C(N,{width:`fit-content`,position:F})}),r(`biomesEditorRefresh`).addEventListener(`click`,V),r(`biomesEditStyle`).addEventListener(`click`,()=>void b.StyleEditor.open(`biomes`)),r(`biomesLegend`).addEventListener(`click`,se),r(`biomesPercentage`).addEventListener(`click`,X),r(`biomesManually`).addEventListener(`click`,ue),r(`biomesRestore`).addEventListener(`click`,fe),r(`biomesReliefRules`).addEventListener(`click`,()=>void b.ReliefRulesEditor.open()),r(`biomesAdd`).addEventListener(`click`,ce),r(`biomesExport`).addEventListener(`click`,Z),D(N,R.reset),O(N,({cellId:e})=>e&&pack.cells.biome[e]),r(`biomesBody`).addEventListener(`click`,e=>{let t=e.target,n=t.classList;t.tagName===`FILL-BOX`?J(t):n.contains(`icon-book`)?ae(t):n.contains(`icon-info-circled`)?oe(t):n.contains(`icon-trash-empty`)?le(t):t.closest(`.biomeRelief`)&&K(t)}),r(`biomesBody`).addEventListener(`change`,e=>{let t=e.target,n=t.classList;n.contains(`biomeName`)?Y(t):n.contains(`biomeHabitability`)&&ie(t)})}function V(){I=U(),R.refresh()}function H(e=pack){let{cells:t}=e,n=e.biomes.map(()=>({cells:0,area:0,rural:0,urban:0}));for(let r of t.i){if(t.h[r]<20)continue;let i=n[t.biome[r]];i.cells++,i.area+=t.area[r],i.rural+=t.pop[r];let a=t.burg[r]?e.burgs[t.burg[r]]:null;a&&(i.urban+=a.population??0)}return n}function U(){return H(pack)}function W(e,t){let n=` ${l()}`,i=``,a=0,s=0;for(let r of e.rows){let{i:e,name:a,color:s,habitability:l}=r,{cells:u,area:f,rural:p,urban:m}=t[e],h=o(f),g=p*options.map.units.population.scale,_=m*options.map.units.population.scale*options.map.units.population.urbanization.rate,v=c(g+_),y=`Total population: ${d(v)}; Rural population: ${d(g)}; Urban population: ${d(_)}`;i+=`
      <div
        class="states biomes"
        data-id="${e}"
        data-name="${a}"
        data-habitability="${l}"
        data-cells=${u}
        data-area=${h}
        data-population=${v}
        data-color=${s}
      >
        <div data-col="name">
          <fill-box fill="${s}"></fill-box>
          <input data-tip="Название биома. Кликните и введите, чтобы изменить" class="biomeName" value="${a}" autocorrect="off" spellcheck="false" />
        </div>
        <div data-col="habitability" class="hide">
          <span data-tip="Пригодность биома, %">%</span>
          <input data-tip="Пригодность биома, %. Кликните и введите значение, чтобы изменить" type="number" min="0" max="9999" class="biomeHabitability" value=${l} />
        </div>
        <div data-col="relief" class="hide">${G(r)}</div>
        <div data-col="cells" class="hide"><span data-tip="Число ячеек" class="icon-check-empty"></span><span data-tip="Число ячеек" class="biomeCells">${u}</span></div>
        <div data-col="area" class="hide"><span data-tip="Площадь биома" class="icon-map-o" style="padding-right: 2px"></span><span data-tip="Площадь биома" class="biomeArea">${d(h)+n}</span></div>
        <div data-col="population" class="hide"><span data-tip="${y}" class="icon-male"></span><span data-tip="${y}" class="biomePopulation">${d(v)}</span></div>
        ${T(`this biome`)}
        <span data-col="wiki" data-tip="Открыть статью Википедии о биоме" class="icon-info-circled pointer"></span>
        <span data-col="remove" ${e>12&&!u?`data-tip="Удалить свой биом" class="icon-trash-empty"`:``}></span>
      </div>
    `}let u=r(`biomesBody`);u.innerHTML=i,te(u,styles.relief.options.set);for(let n of e.all){let e=t[n.i];a+=o(e.area),s+=c(e.rural*options.map.units.population.scale+e.urban*options.map.units.population.scale*options.map.units.population.urbanization.rate)}let f=o(_(pack.cells.area));r(`biomesFooterBiomes`).innerHTML=String(e.all.length),r(`biomesFooterCells`).innerHTML=String(pack.cells.h.filter(e=>e>=20).length);let p=r(`biomesFooterArea`);p.innerHTML=d(a)+n,r(`biomesFooterPopulation`).innerHTML=d(s),p.dataset.area=String(a),p.dataset.mapArea=String(f),r(`biomesFooterPopulation`).dataset.population=String(s),k(r(`biomesFooter`),e,R.goto),u.querySelectorAll(`div.biomes`).forEach(e=>{e.addEventListener(`mouseenter`,q)}),u.querySelectorAll(`div.biomes`).forEach(e=>{e.addEventListener(`mouseleave`,re)}),u.dataset.type===`percentage`&&(u.dataset.type=`absolute`,X()),C(N,{width:`fit-content`,position:F})}function G({icons:e,iconsDensity:t}){return ee(e,t,`biomeRelief`)}function K(e){let t=Number(e.closest(`.biomes`).dataset.id);ne.open({biome:t,onApply:V})}function q(e){if(customization===6)return;let t=+e.target.dataset.id,r=s().duration(2e3).ease(v);n(`#biomes > #biome${t}`).raise().transition(r).attr(`stroke-width`,2).attr(`stroke`,`#cd4c11`)}function re(e){if(customization===6)return;let t=+e.target.dataset.id,r=pack.biomes[t].color;n(`#biomes > #biome${t}`).transition().attr(`stroke-width`,.7).attr(`stroke`,r)}function J(e){let t=e.getAttribute(`fill`),n=+e.closest(`.biomes`).dataset.id;b.ColorPicker.open(t,t=>{e.fill=t,pack.biomes[n].color=t,h.draw(`biomes`)})}function Y(e){let t=e.closest(`.biomes`),n=+t.dataset.id;if(!e.value.trim()){e.value=pack.biomes[n].name;return}Biomes.rename(n,e.value),t.dataset.name=pack.biomes[n].name}function ie(e){let t=e.closest(`.biomes`),n=+t.dataset.id;if(Number.isNaN(+e.value)||+e.value<0||+e.value>9999){e.value=String(pack.biomes[n].habitability),y(`Укажите корректное число в диапазоне 0-9999`,!1,`error`);return}Biomes.setHabitability(n,+e.value),t.dataset.habitability=e.value,Q(),V()}function ae(e){let t=+(e.closest(`.biomes`)?.dataset.id||0);b.NotesEditor.open({type:`biome`,id:t})}function oe(e){let t=e.closest(`.biomes`)?.dataset.name;if(t===`Custom`||!t){y(`Укажите название биома`,!1,`error`);return}let n={"Hot desert":`Desert_climate#Hot_desert_climates`,"Cold desert":`Desert_climate#Cold_desert_climates`,Savanna:`Tropical_and_subtropical_grasslands,_savannas,_and_shrublands`,Grassland:`Temperate_grasslands,_savannas,_and_shrublands`,"Tropical seasonal forest":`Seasonal_tropical_forest`,"Temperate deciduous forest":`Temperate_deciduous_forest`,"Tropical rainforest":`Tropical_rainforest`,"Temperate rainforest":`Temperate_rainforest`,Taiga:`Taiga`,Tundra:`Tundra`,Glacier:`Glacier`,Wetland:`Wetland`},r=`https://en.wikipedia.org/w/index.php?search=${t}`;u(n[t]?`https://en.wikipedia.org/wiki/`+n[t]:r)}function se(){if(p(P)){g(P);return}let e=U(),t=pack.biomes.filter(({i:t})=>e[t].cells).sort((t,n)=>e[n.i].area-e[t.i].area).map(({i:e,color:t,name:n})=>[e,t,n]);if(!t.length)return void y(`Нет биомов для показа`,!1,`error`);m(P,t)}function X(){let e=r(`biomesBody`);if(e.dataset.type===`absolute`){e.dataset.type=`percentage`;let t=+r(`biomesFooterCells`).innerHTML,n=r(`biomesFooterArea`),i=+n.dataset.area,a=+n.dataset.mapArea,o=+r(`biomesFooterPopulation`).dataset.population;e.querySelectorAll(`:scope > div`).forEach(e=>{e.querySelector(`.biomeCells`).innerHTML=`${c(+e.dataset.cells/t*100)}%`,e.querySelector(`.biomeArea`).innerHTML=`${c(+e.dataset.area/i*100)}%`,e.querySelector(`.biomePopulation`).innerHTML=`${c(+e.dataset.population/o*100)}%`}),n.innerHTML=`${c(i/a*100)}%`}else e.dataset.type=`absolute`,R.refresh()}function ce(){try{Biomes.add(`Custom`,a(),50)}catch{y(`Достигнут максимум биомов (255), нужна чистка данных`,!1,`error`);return}I=U(),R.refresh()}function le(e){let t=+e.closest(`.biomes`).dataset.id;try{Biomes.remove(t)}catch{return}I=U(),R.refresh()}function Z(){let e=`Id,Biome,Color,Habitability,Cells,Area ${options.map.units.area.unit===`square`?`${options.map.units.distance.unit}2`:options.map.units.area.unit},Population\n`,n=U();for(let t of pack.biomes){if(!t.i||t.removed)continue;let{cells:r,area:i,rural:a,urban:s}=n[t.i],l=c(a*options.map.units.population.scale+s*options.map.units.population.scale*options.map.units.population.urbanization.rate);e+=`${t.i},${t.name},${t.color},${t.habitability}%,${r},${o(i)},${l}\n`}let r=`${i(`Biomes`)}.csv`;t(e,r)}function ue(){h.show(`biomes`),b.PaintEditor.open({title:`Кисть биомов`,parentDialogId:N,onClose:z,items:pack.biomes.filter(e=>e.i&&!e.removed).map(e=>({id:e.i,name:e.name,color:e.color})),getValue:e=>pack.cells.biome[e],filterCell:e=>f(e,pack),onApply:de})}function de(t){for(let[n,r]of e(t))Biomes.setCells(n,r);t.size&&(h.draw(`biomes`),document.getElementById(N)&&V())}function fe(){Biomes.restore(),h.draw(`biomes`),Q(),V()}function pe(){$(`#biomesEditor`).dialog(`destroy`),r(`biomesEditor`).remove()}function Q(){x.regenerate(),h.draw(`population`,`goods`)}var me={open:z,exportCsv:Z};export{me as BiomesEditor};