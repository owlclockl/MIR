import{H as e,L as t,On as n,P as r,U as i,nr as a,r as o}from"./utils-BXzQ0Tym.js";import{Z as s,it as c,t as l}from"./layers-Bcg3SU5R.js";import{i as u}from"./emblems-generator-BdUAGZhv.js";import{i as d,t as f}from"./tooltips-P6FAPAdd.js";import{t as p}from"./controllers-DoYIZ-kt.js";import{i as m,l as h,n as g,o as _}from"./dialog-helpers-CJ5pbzaw.js";import{t as v}from"./viewbox-events-3YWWeuSF.js";import{i as y,r as b}from"./index-sJ7uR-QF.js";import{a as x,i as S,n as C,r as w}from"./table-XWt9IQic.js";var T=0,E=`marketOverview`,D={my:`right top`,at:`right-10 top+10`,of:`svg`,collision:`fit`},O=[{key:`icon`,width:`2.5em`,permanent:!0},{key:`good`,label:`Товар`,width:`8em`,permanent:!0,sortBy:e=>e.good,sortType:`alpha`},{key:`stock`,label:`Запас`,width:`5em`,sortBy:e=>e.stock,defaultSort:`desc`},{key:`price`,label:`Цена`,width:`5em`,permanent:!0,sortBy:e=>e.price}],k=w({getData:I,onUpdate:L});function A(e){if(u.retry(`goods`),customization)return;let t=Markets.get(e);if(!t){d(`Некорректный рынок. Выбранного рынка нет`,!0,`error`,5e3);return}T=e,g(`#${E}, .stable`),j(),k.reset(),M(t),$(`#${E}`).dialog({title:`Market Stock: ${Markets.getName(t)}`,width:`auto`,close:V,position:D})}function j(){m(E);let e=`<div id="${E}" class="dialog stable editorDialog">
      ${S({dialogId:E,columns:O})}
      <div id="marketOverviewGoodsBody" class="table" style="max-height:40em"></div>
      <div id="marketOverviewSummary" class="totalLine"></div>
      <div id="marketOverviewNameLine" style="display: flex; align-items: center; margin-bottom: 0.4em">
        <div class="label">Name:</div>
        <input
          id="marketOverviewName"
          data-tip="Введите название рынка. Пустое поле вернёт название по умолчанию"
          autocorrect="off"
          spellcheck="false"
          style="width: 11em; margin-left: 0.3em;"
        />
        <span
          id="marketOverviewNameReset"
          data-tip="Вернуть название по умолчанию (название города в центре)"
          class="icon-ccw pointer"
          style="margin-left: 0.3em"
        ></span>
      </div>
      <div id="marketOverviewInfo" style="margin-bottom: 0.3em"></div>
      <div id="marketOverviewBottom">
        <button id="marketOverviewRefresh" data-tip="Обновить экран обзора" class="icon-cw"></button>
        <button id="marketOverviewOpenDeals" data-tip="Сделки рынка" class="icon-list-bullet"></button>
        ${_(`marketOverviewLegend`,`this market`)}
        <button
          id="marketOverviewRelocate"
          data-tip="Переместить рынок. Кликните по городу на карте"
          class="icon-map-pin"
        ></button>
        <button id="marketOverviewExport" data-tip="Скачать данные торговых сделок в текстовый файл (.csv)" class="icon-download"></button>
      </div>
  </div>`;r(`dialogs`).insertAdjacentHTML(`beforeend`,e),b(E,k.reset),C({dialogId:E,columns:O,onUpdate:()=>h(E,{width:`fit-content`,position:D})}),r(`marketOverviewRefresh`).addEventListener(`click`,k.refresh),r(`marketOverviewExport`).addEventListener(`click`,B),r(`marketOverviewOpenDeals`).addEventListener(`click`,()=>p.MarketDealsOverview.open(T)),r(`marketOverviewRelocate`).addEventListener(`click`,R),r(`marketOverviewLegend`).addEventListener(`click`,N),r(`marketOverviewName`).addEventListener(`input`,P),r(`marketOverviewNameReset`).addEventListener(`click`,F)}function M(e){let t=r(`marketOverviewName`);t.value=e.name||``,t.placeholder=pack.burgs[e.centerBurgId]?.name||`Market ${e.i}`}function N(){p.NotesEditor.open({type:`market`,id:T})}function P(){let e=Markets.get(T);e&&(Markets.rename(e.i,this.value),$(`#marketOverview`).dialog(`option`,`title`,`Market Stock: ${Markets.getName(e)}`))}function F(){let e=Markets.get(T);e&&(Markets.rename(e.i,``),r(`marketOverviewName`).value=``,$(`#marketOverview`).dialog(`option`,`title`,`Market Stock: ${Markets.getName(e)}`))}function I(){let e=Markets.get(T);if(!e)return d(`Некорректный рынок. Выбранного рынка нет`,!0,`error`,5e3),[];let t=pack.burgs[e.centerBurgId];return!t||t.removed?(d(`Некорректный рынок. У выбранного рынка нет города-центра`,!0,`error`,5e3),[]):y(E,Object.entries(e.goods).flatMap(([e,t])=>{let n=Goods.get(+e);return n?[{goodId:+e,good:n.name,stock:t.stock,price:t.price}]:[]}),O)}function L(e){let t=Markets.get(T);if(!t)return;let n=e.rows.map(e=>{let t=Goods.get(e.goodId);return`<div class="states marketGood"
      data-good="${t.name}"
      data-stock="${a(e.stock,2)}"
      data-price="${a(e.price,2)}">
      <svg data-col="icon" data-tip="Иконка товара" width="2em" height="2em" class="goodIcon">
        ${s(t)}
      </svg>
      <div data-col="good" data-tip="Название товара" class="goodName">${t.name}</div>
      <div data-col="stock" data-tip="Запас товара" class="marketGoodStock">${a(e.stock,2)}</div>
      <div data-col="price" data-tip="Цена товара" class="marketGoodPrice">${o(e.price)}</div>
    </div>`});r(`marketOverviewGoodsBody`).innerHTML=n.join(``)||`No market goods available`;let i=pack.burgs[t.centerBurgId],l=pack.states[i?.state||0],u=`stateCOA${l.i}`;l&&c.trigger(u,l.coa),r(`marketOverviewInfo`).innerHTML=`<svg class="coaIcon" viewBox="0 0 200 200"><use href="#${u}"></use></svg><b>Owner:</b> ${l.fullName||l.name}`;let d=pack.burgs.filter(e=>!e.removed&&e.market===t.i),f=e.all.reduce((e,t)=>e+t.stock,0);r(`marketOverviewSummary`).innerHTML=`
    <div style="margin-left:5px">Cells: ${pack.cells.market.reduce((e,n)=>e+ +(n===t.i),0)}</div>
    <div style="margin-left:12px">Burgs: ${d.length}</div>
    <div data-col="stock" style="margin-left:12px">Stock: ${a(f,2)}</div>`,x(r(`marketOverviewSummary`),e,k.goto),h(E,{width:`fit-content`,position:D})}function R(){let e=r(`marketOverviewRelocate`);e.classList.toggle(`pressed`),e.classList.contains(`pressed`)?(n(`#viewbox`).style(`cursor`,`crosshair`).on(`click`,z),d(`Кликните по городу на карте, чтобы перенести рыночный центр`,!0)):(f(),v())}function z(e){let n=Markets.get(T);if(!n)return;let[r,i]=t(e,this),a=Pack.findCell(r,i);if(a===void 0)return;let o=pack.cells.burg[a],s=pack.burgs[o];if(!o||!s||s.removed){d(`В этой ячейке нет корректного города. Кликните по ячейке с городом`,!1,`error`);return}if(o===n.centerBurgId){d(`Этот город уже центр этого рынка`,!1,`error`);return}if(pack.markets.some(e=>e.centerBurgId===o)){d(`Этот город уже центр другого рынка`,!1,`error`);return}Markets.relocateMarket(T,o)&&(R(),l.draw(`markets`),M(n),$(`#marketOverview`).dialog(`option`,`title`,`Market Stock: ${Markets.getName(n)}`),k.refresh())}function B(){let t=Markets.get(T);if(!t)return;let n=`Good,Stock,Buy Price,Sell Price
`;for(let[e,r]of Object.entries(t.goods)){let t=Goods.get(Number(e));if(!t)continue;let i=a(Markets.customerBuyPrice(r.price),2),o=a(Markets.customerSellPrice(r.price),2);n+=`${[t.name,a(r.stock,2),i,o].join(`,`)}\n`}e(n,`${i(`Market`)}.csv`)}function V(){r(`marketOverviewRelocate`).classList.contains(`pressed`)&&R(),$(`#${E}`).dialog(`destroy`),r(E).remove()}var H={open:A};export{H as MarketOverview};