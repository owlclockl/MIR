import{H as e,L as t,On as n,P as r,U as i,nr as a,r as o}from"./utils-wri1mEnR.js";import{Z as s,it as c,t as l}from"./layers-BxGvHrUa.js";import{i as u}from"./emblems-generator-OeULKJRW.js";import{i as d,t as f}from"./tooltips-D49utlYE.js";import{t as p}from"./controllers-DgR7ZFF6.js";import{i as m,l as h,n as g,o as _}from"./dialog-helpers-Df4nf9Or.js";import{t as v}from"./viewbox-events-CZ5zKZCt.js";import{i as y,r as b}from"./index-CdO0AJeV.js";import{a as x,i as S,n as C,r as w}from"./table-Dbk06oG6.js";var T=0,E=`marketOverview`,D={my:`right top`,at:`right-10 top+10`,of:`svg`,collision:`fit`},O=[{key:`icon`,width:`2.5em`,permanent:!0},{key:`good`,label:`Good`,width:`8em`,permanent:!0,sortBy:e=>e.good,sortType:`alpha`},{key:`stock`,label:`Stock`,width:`5em`,sortBy:e=>e.stock,defaultSort:`desc`},{key:`price`,label:`Price`,width:`5em`,permanent:!0,sortBy:e=>e.price}],k=w({getData:I,onUpdate:L});function A(e){if(u.retry(`goods`),customization)return;let t=Markets.get(e);if(!t){d(`Invalid market. The selected market does not exist`,!0,`error`,5e3);return}T=e,g(`#${E}, .stable`),j(),k.reset(),M(t),$(`#${E}`).dialog({title:`Market Stock: ${Markets.getName(t)}`,width:`auto`,close:V,position:D})}function j(){m(E);let e=`<div id="${E}" class="dialog stable editorDialog">
      ${S({dialogId:E,columns:O})}
      <div id="marketOverviewGoodsBody" class="table" style="max-height:40em"></div>
      <div id="marketOverviewSummary" class="totalLine"></div>
      <div id="marketOverviewNameLine" style="display: flex; align-items: center; margin-bottom: 0.4em">
        <div class="label">Name:</div>
        <input
          id="marketOverviewName"
          data-tip="Type to rename the market. Clear the field to reset to the default name"
          autocorrect="off"
          spellcheck="false"
          style="width: 11em; margin-left: 0.3em;"
        />
        <span
          id="marketOverviewNameReset"
          data-tip="Reset to the default name (center burg name)"
          class="icon-ccw pointer"
          style="margin-left: 0.3em"
        ></span>
      </div>
      <div id="marketOverviewInfo" style="margin-bottom: 0.3em"></div>
      <div id="marketOverviewBottom">
        <button id="marketOverviewRefresh" data-tip="Refresh the Overview screen" class="icon-cw"></button>
        <button id="marketOverviewOpenDeals" data-tip="View market deals" class="icon-list-bullet"></button>
        ${_(`marketOverviewLegend`,`this market`)}
        <button
          id="marketOverviewRelocate"
          data-tip="Relocate market. Click on a burg on the map to move the market center"
          class="icon-map-pin"
        ></button>
        <button id="marketOverviewExport" data-tip="Save market deals data as a text file (.csv)" class="icon-download"></button>
      </div>
  </div>`;r(`dialogs`).insertAdjacentHTML(`beforeend`,e),b(E,k.reset),C({dialogId:E,columns:O,onUpdate:()=>h(E,{width:`fit-content`,position:D})}),r(`marketOverviewRefresh`).addEventListener(`click`,k.refresh),r(`marketOverviewExport`).addEventListener(`click`,B),r(`marketOverviewOpenDeals`).addEventListener(`click`,()=>p.MarketDealsOverview.open(T)),r(`marketOverviewRelocate`).addEventListener(`click`,R),r(`marketOverviewLegend`).addEventListener(`click`,N),r(`marketOverviewName`).addEventListener(`input`,P),r(`marketOverviewNameReset`).addEventListener(`click`,F)}function M(e){let t=r(`marketOverviewName`);t.value=e.name||``,t.placeholder=pack.burgs[e.centerBurgId]?.name||`Market ${e.i}`}function N(){p.NotesEditor.open({type:`market`,id:T})}function P(){let e=Markets.get(T);e&&(Markets.rename(e.i,this.value),$(`#marketOverview`).dialog(`option`,`title`,`Market Stock: ${Markets.getName(e)}`))}function F(){let e=Markets.get(T);e&&(Markets.rename(e.i,``),r(`marketOverviewName`).value=``,$(`#marketOverview`).dialog(`option`,`title`,`Market Stock: ${Markets.getName(e)}`))}function I(){let e=Markets.get(T);if(!e)return d(`Invalid market. The selected market does not exist`,!0,`error`,5e3),[];let t=pack.burgs[e.centerBurgId];return!t||t.removed?(d(`Invalid market. The selected market has no center burg`,!0,`error`,5e3),[]):y(E,Object.entries(e.goods).flatMap(([e,t])=>{let n=Goods.get(+e);return n?[{goodId:+e,good:n.name,stock:t.stock,price:t.price}]:[]}),O)}function L(e){let t=Markets.get(T);if(!t)return;let n=e.rows.map(e=>{let t=Goods.get(e.goodId);return`<div class="states marketGood"
      data-good="${t.name}"
      data-stock="${a(e.stock,2)}"
      data-price="${a(e.price,2)}">
      <svg data-col="icon" data-tip="Good icon" width="2em" height="2em" class="goodIcon">
        ${s(t)}
      </svg>
      <div data-col="good" data-tip="Good name" class="goodName">${t.name}</div>
      <div data-col="stock" data-tip="Good stock" class="marketGoodStock">${a(e.stock,2)}</div>
      <div data-col="price" data-tip="Good price" class="marketGoodPrice">${o(e.price)}</div>
    </div>`});r(`marketOverviewGoodsBody`).innerHTML=n.join(``)||`No market goods available`;let i=pack.burgs[t.centerBurgId],l=pack.states[i?.state||0],u=`stateCOA${l.i}`;l&&c.trigger(u,l.coa),r(`marketOverviewInfo`).innerHTML=`<svg class="coaIcon" viewBox="0 0 200 200"><use href="#${u}"></use></svg><b>Owner:</b> ${l.fullName||l.name}`;let d=pack.burgs.filter(e=>!e.removed&&e.market===t.i),f=e.all.reduce((e,t)=>e+t.stock,0);r(`marketOverviewSummary`).innerHTML=`
    <div style="margin-left:5px">Cells: ${pack.cells.market.reduce((e,n)=>e+ +(n===t.i),0)}</div>
    <div style="margin-left:12px">Burgs: ${d.length}</div>
    <div data-col="stock" style="margin-left:12px">Stock: ${a(f,2)}</div>`,x(r(`marketOverviewSummary`),e,k.goto),h(E,{width:`fit-content`,position:D})}function R(){let e=r(`marketOverviewRelocate`);e.classList.toggle(`pressed`),e.classList.contains(`pressed`)?(n(`#viewbox`).style(`cursor`,`crosshair`).on(`click`,z),d(`Click on a burg on the map to relocate the market center`,!0)):(f(),v())}function z(e){let n=Markets.get(T);if(!n)return;let[r,i]=t(e,this),a=Pack.findCell(r,i);if(a===void 0)return;let o=pack.cells.burg[a],s=pack.burgs[o];if(!o||!s||s.removed){d(`No valid burg in this cell. Click on a cell with a burg`,!1,`error`);return}if(o===n.centerBurgId){d(`This burg is already the center of this market`,!1,`error`);return}if(pack.markets.some(e=>e.centerBurgId===o)){d(`This burg is already a center of another market`,!1,`error`);return}Markets.relocateMarket(T,o)&&(R(),l.draw(`markets`),M(n),$(`#marketOverview`).dialog(`option`,`title`,`Market Stock: ${Markets.getName(n)}`),k.refresh())}function B(){let t=Markets.get(T);if(!t)return;let n=`Good,Stock,Buy Price,Sell Price
`;for(let[e,r]of Object.entries(t.goods)){let t=Goods.get(Number(e));if(!t)continue;let i=a(Markets.customerBuyPrice(r.price),2),o=a(Markets.customerSellPrice(r.price),2);n+=`${[t.name,a(r.stock,2),i,o].join(`,`)}\n`}e(n,`${i(`Market`)}.csv`)}function V(){r(`marketOverviewRelocate`).classList.contains(`pressed`)&&R(),$(`#${E}`).dialog(`destroy`),r(E).remove()}var H={open:A};export{H as MarketOverview};