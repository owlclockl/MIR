import{Gn as e,H as t,On as n,P as r,U as i,Un as a,Xn as o,cn as s,nr as c,ut as l,y as u}from"./utils-wri1mEnR.js";import{t as d}from"./layers-BxGvHrUa.js";import{t as f}from"./sum-BpJJqxFM.js";import{i as p}from"./emblems-generator-OeULKJRW.js";import{i as m}from"./tooltips-D49utlYE.js";import{t as h}from"./controllers-DgR7ZFF6.js";import{i as g,l as _,n as v}from"./dialog-helpers-Df4nf9Or.js";import{i as y,r as b}from"./index-CdO0AJeV.js";import{t as x}from"./highlighting-8_a8mxjq.js";import{a as S,i as C,n as w,r as T}from"./table-Dbk06oG6.js";import{n as E,t as D}from"./limitation-picker-DOworUXl.js";var O=`militaryOverview`,k={my:`right top`,at:`right-10 top+10`,of:`svg`,collision:`fit`},A=[],j=T({getData:z,onUpdate:V});function M(){customization||(v(`#militaryOverview, .stable`),d.show(`states`,`borders`,`military`),N(),j.reset(),$(`#militaryOverview`).dialog({title:`Military Overview`,resizable:!1,width:`fit-content`,close:P,position:k}))}function N(){A=I(),g(`militaryOverview`);let e=`<div id="${O}" class="dialog stable editorDialog">
      <div id="militaryBody" class="table" data-type="absolute">
        ${C({dialogId:O,columns:A})}
      </div>
      <div id="militaryFooter" class="totalLine">
        <div data-tip="States number" style="margin-left: 4px">
          States:&nbsp;<span id="militaryFooterStates">0</span>
        </div>
        <div data-tip="Total military forces" style="margin-left: 14px" data-col="total">
          Total forces:&nbsp;<span id="militaryFooterForcesTotal">0</span>
        </div>
        <div data-tip="Average military forces per state" style="margin-left: 14px" data-col="total">
          Average forces:&nbsp;<span id="militaryFooterForces">0</span>
        </div>
        <div data-tip="Average forces rate per state" style="margin-left: 14px" data-col="rate">
          Average rate:&nbsp;<span id="militaryFooterRate">0%</span>
        </div>
        <div data-tip="Average War Alert" style="margin-left: 14px" data-col="alert">
          Average alert:&nbsp;<span id="militaryFooterAlert">0</span>
        </div>
      </div>
      <div id="militaryBottom" class="editorToolbar">
        <button id="militaryOverviewRefresh" data-tip="Refresh the overview screen" class="icon-cw"></button>
        <button id="militaryOptionsButton" data-tip="Edit Military units" class="icon-cog"></button>
        <button id="militaryRegimentsList" data-tip="Show regiments list" class="icon-list-bullet"></button>
        <button
          id="militaryPercentage"
          data-tip="Toggle percentage / absolute values views"
          class="icon-percent"
        ></button>
        <button
          id="militaryOverviewRecalculate"
          data-tip="Recalculate military forces based on current options"
          class="icon-retweet"
        ></button>
        <button
          id="militaryExport"
          data-tip="Save military-related data as a text file (.csv)"
          class="icon-download"
        ></button>
        <button id="militaryWiki" data-tip="Open Military Forces Tutorial" class="icon-info"></button>
      </div>
    </div>`;r(`dialogs`).insertAdjacentHTML(`beforeend`,e),L(),x(`militaryOverview`,({cellId:e})=>pack.cells.state[e]);let t=r(`militaryBody`);r(`militaryOverviewRefresh`).addEventListener(`click`,B),r(`militaryPercentage`).addEventListener(`click`,K),r(`militaryOptionsButton`).addEventListener(`click`,q),r(`militaryRegimentsList`).addEventListener(`click`,()=>F(-1)),r(`militaryOverviewRecalculate`).addEventListener(`click`,X),r(`militaryExport`).addEventListener(`click`,Z),r(`militaryWiki`).addEventListener(`click`,()=>l(`Military-Forces`)),t.addEventListener(`change`,e=>{let t=e.target,n=t.closest(`.states`);n&&H(+n.dataset.id,+t.value)}),t.addEventListener(`click`,e=>{let t=e.target,n=t.closest(`.states`);if(!n)return;let r=+n.dataset.id;t.tagName===`SPAN`&&F(r)})}function P(){$(`#militaryOverview`).dialog(`destroy`),r(`militaryOverview`).remove()}async function F(e){h.RegimentsOverview.open(e)}function I(){return[{key:`color`,width:`1.2em`,permanent:!0},{key:`state`,label:`State`,width:`7em`,permanent:!0,sortBy:e=>e.state.name||``,sortType:`alpha`},...options.map.military.units.map(e=>({key:`unit:${e.name}`,label:a(e.name.replace(/_/g,` `)),width:`5em`,mobileHidden:!0,tip:`State ${e.name} units number. Click to sort`,sortBy:t=>t.forces[e.name]||0})),{key:`total`,label:`Total`,width:`5em`,defaultSort:`desc`,sortBy:e=>e.total,tip:`Total military personnel (considering crew). Click to sort`},{key:`population`,label:`Population`,width:`6.5em`,mobileHidden:!0,sortBy:e=>e.population},{key:`rate`,label:`Rate`,width:`5em`,sortBy:e=>e.rate,tip:`Military personnel rate (% of state population). Depends on war alert. Click to sort`},{key:`alert`,label:`War Alert`,width:`5.5em`,sortBy:e=>e.alert,tip:`War Alert. Modifier to military forces number, depends on political situation. Click to sort`},{key:`regiments`,width:`1.4em`,permanent:!0}]}function L(){b(O,j.reset),w({dialogId:O,columns:A,onUpdate:()=>_(O,{width:`fit-content`,position:k})})}function R(){A=I(),r(`${O}Header`).outerHTML=C({dialogId:O,columns:A}),L(),j.reset()}function z(){return y(O,pack.states.filter(e=>e.i&&!e.removed).map(e=>{let t=Object.fromEntries(options.map.military.units.map(t=>[t.name,(e.military||[]).reduce((e,n)=>e+(n.u[t.name]||0),0)])),n=c(((e.rural||0)+(e.urban||0)*options.map.units.population.urbanization.rate)*options.map.units.population.scale),r=options.map.military.units.reduce((e,n)=>e+(t[n.name]||0)*n.crew,0);return{state:e,forces:t,total:r,population:n,rate:n?r/n*100:0,alert:e.alert??0}}),A)}function B(){j.refresh()}function V(e){let t=r(`militaryBody`),n=t.dataset.type===`percentage`,i=e.all.reduce((e,t)=>{e.total+=t.total,e.population+=t.population;for(let n of options.map.military.units)e.units[n.name]=(e.units[n.name]||0)+t.forces[n.name];return e},{total:0,population:0,units:{}}),a=(e,t)=>`${c(t?e/t*100:0)}%`,o=e.rows.map(e=>{let t=options.map.military.units.map(t=>{let r=e.forces[t.name]||0;return`<div data-col="${`unit:${t.name}`}" data-tip="State ${t.name} units number">${n?a(r,i.units[t.name]||0):r}</div>`}).join(``);return`<div class="states" data-id="${e.state.i}">
        <fill-box data-col="color" data-tip="${e.state.fullName}" fill="${e.state.color}" disabled></fill-box>
        <input data-col="state" data-tip="${e.state.fullName}" value="${e.state.name}" readonly />
        ${t}
        <div data-col="total" data-tip="Total state military personnel (considering crew)" style="font-weight:bold">${n?a(e.total,i.total):u(e.total)}</div>
        <div data-col="population" data-tip="State population">${n?a(e.population,i.population):u(e.population)}</div>
        <div data-col="rate" data-tip="Military personnel rate (% of state population). Depends on war alert">${c(e.rate,2)}%</div>
        <input data-col="alert" data-tip="War Alert. Editable modifier to military forces number, depends on political situation" type="number" min="0" step=".01" value="${c(e.alert,2)}" />
        <span data-col="regiments" data-tip="Show regiments list" class="icon-list-bullet pointer"></span>
      </div>`}).join(``);t.querySelectorAll(`:scope > .states`).forEach(e=>{e.remove()}),t.insertAdjacentHTML(`beforeend`,o),U(e),S(r(`militaryFooter`),e,j.goto),t.querySelectorAll(`:scope > .states`).forEach(e=>{e.addEventListener(`mouseenter`,W),e.addEventListener(`mouseleave`,G)}),_(O,{width:`fit-content`,position:k})}function H(e,t){t>=0&&Military.setAlert(e,t);for(let t of pack.states[e].military??[]){let n=document.querySelector(`#armies #regiment${e}-${t.i} > text`);n&&(n.textContent=String(Military.getTotal(t)))}j.refresh()}function U(e){let t=e.all.length,n=f(e.all.map(e=>e.total));r(`militaryFooterStates`).innerHTML=String(t),r(`militaryFooterForcesTotal`).innerHTML=u(n),r(`militaryFooterForces`).innerHTML=u(t?n/t:0),r(`militaryFooterRate`).innerHTML=`${c(t?f(e.all.map(e=>e.rate))/t:0,2)}%`,r(`militaryFooterAlert`).innerHTML=String(c(t?f(e.all.map(e=>e.alert))/t:0,2))}function W(e){let t=+e.target.dataset.id;if(customization||!t||(n(`#armies > g > g#army${t}`).transition().duration(2e3).style(`fill`,`#ff0000`),!d.isOn(`states`)))return;let r=n(`#regions`).select(`#state${t}`).attr(`d`),i=n(`#debug`).append(`path`).attr(`class`,`highlight`).attr(`d`,r).attr(`fill`,`none`).attr(`stroke`,`red`).attr(`stroke-width`,1).attr(`opacity`,1).attr(`filter`,`url(#blur1)`),a=i.node().getTotalLength(),o=(a+5e3)/2,c=s(`0,${a}`,`${a},${a}`);i.transition().duration(o).attrTween(`stroke-dasharray`,()=>e=>c(e))}function G(e){n(`#debug`).selectAll(`.highlight`).each(function(){n(this).transition().duration(1e3).attr(`opacity`,0).remove()}),n(`#armies > g > g#army${+e.target.dataset.id}`).transition().duration(1e3).style(`fill`,null)}function K(){let e=r(`militaryBody`);e.dataset.type=e.dataset.type===`absolute`?`percentage`:`absolute`,j.refresh()}function q(){J();let t=[`melee`,`ranged`,`mounted`,`machinery`,`naval`,`armored`,`aviation`,`magical`],n=r(`militaryOptions`).querySelector(`tbody`);i(),options.map.military.units.map(e=>l(e)),$(`#militaryOptions`).dialog({title:`Edit Military Units`,resizable:!1,width:`fit-content`,position:{my:`center`,at:`center`,of:`svg`},close:Y,buttons:{Apply:_,Add:()=>l({icon:p.glyph(`🛡️`),name:`custom${r(`militaryOptionsTable`).rows.length}`,rural:.2,urban:.5,crew:1,power:1,type:`melee`,separate:0}),Restore:f,Cancel:function(){$(this).dialog(`close`)}},open:function(){let e=$(this).dialog(`widget`).find(`.ui-dialog-buttonset > button`);e[0].addEventListener(`mousemove`,()=>m(`Apply military units settings. <span style='color:#cb5858'>All forces will be recalculated!</span>`)),e[1].addEventListener(`mousemove`,()=>m(`Add new military unit to the table`)),e[2].addEventListener(`mousemove`,()=>m(`Restore default military units and settings`)),e[3].addEventListener(`mousemove`,()=>m(`Close the window without saving the changes`))}}),n.addEventListener(`click`,e=>{let t=e.target.closest(`button`);if(!t)return;let n=t.dataset.type;if(n===`icon`){h.IconPicker.open({current:t.dataset.icon||``,onPick:e=>u(t,e)});return}if(n===`biomes`){g(t,pack.biomes.filter(e=>!e.removed).map(({i:e,name:t,color:n})=>({i:e,name:t,color:n})));return}if(n===`states`)return g(t,pack.states);if(n===`cultures`)return g(t,pack.cultures);if(n===`religions`)return g(t,pack.religions)});function i(){n.querySelectorAll(`tr`).forEach(e=>{e.remove()})}function a(e){return e?.join(`,`)||``}function s(e){return e?.length?`some`:`all`}function c(e,t){return e?.length?D(e,t):``}function l(r){let{type:i,icon:o,name:l,rural:d,urban:f,power:p,crew:m,separate:h}=r,g=document.createElement(`tr`),_=t.map(e=>`<option ${i===e?`selected`:``} value="${e}">${e}</option>`).join(` `),v=t=>{let n=pack[t];return`<button
          data-tip="Select allowed ${t}"
          data-type="${t}"
          title="${e(c(r[t],n))}"
          data-value="${a(r[t])}">
          ${s(r[t])}
        </button>`};g.innerHTML=`<td>
          <button data-type="icon" data-tip="Click to select unit icon" translate="no"></button>
        </td>
        <td><input data-tip="Type unit name. If name is changed for existing unit, old unit will be replaced" value="${l}" /></td>
        <td>${v(`biomes`)}</td>
        <td>${v(`states`)}</td>
        <td>${v(`cultures`)}</td>
        <td>${v(`religions`)}</td>
        <td><input data-tip="Enter conscription percentage for rural population" type="number" min="0" max="100" step=".01" value="${d}" /></td>
        <td><input data-tip="Enter conscription percentage for urban population" type="number" min="0" max="100" step=".01" value="${f}" /></td>
        <td><input data-tip="Enter average number of people in crew (for total personnel calculation)" type="number" min="1" step="1" value="${m}" /></td>
        <td><input data-tip="Enter military power (used for battle simulation)" type="number" min="0" step=".1" value="${p}" /></td>
        <td>
          <select data-tip="Select unit type to apply special rules on forces recalculation">
            ${_}
          </select>
        </td>
        <td data-tip="Check if unit is <b>separate</b> and can be stacked only with the same units">
          <input id="${l}Separate" type="checkbox" class="checkbox" ${h?`checked`:``} />
          <label for="${l}Separate" class="checkbox-label"></label>
        </td>
        <td data-tip="Remove the unit">
          <span data-tip="Remove unit type" class="icon-trash-empty pointer" onclick="this.parentElement.parentElement.remove();"></span>
        </td>`,u(g.querySelector(`button[data-type='icon']`),o||``),n.appendChild(g)}function u(e,t){e.dataset.icon=t,e.innerHTML=p.html(t)}function f(){i(),Military.getDefaultOptions().map(e=>l(e))}function g(e,t){let n=e.dataset.type;E({title:`Limit unit`,heading:`Limit unit by ${n}`,items:t,allowed:e.dataset.value?e.dataset.value.split(`,`).map(Number):[],onApply:n=>{e.dataset.value=n.join(`,`),e.innerHTML=s(n),e.setAttribute(`title`,c(n,t))}})}function _(){let e=Array.from(n.querySelectorAll(`tr`)),t=e.map(e=>o(e.querySelector(`input`).value));if(new Set(t).size!==t.length){m(`All units should have unique names`,!1,`error`);return}$(`#militaryOptions`).dialog(`close`);let r=e.map((e,n)=>{let[r,,i,a,o,s,c,l,u,d,f,p]=Array.from(e.querySelectorAll(`input, button, select`)).map(e=>{let{type:t,value:n}=e.dataset||{};return t===`icon`?e.dataset.icon??``:t?n?n.split(`,`).map(e=>parseInt(e,10)):null:e.type===`number`?+e.value||0:e.type===`checkbox`?+e.checked||0:e.value}),m={icon:r,name:t[n],rural:c,urban:l,crew:u,power:d,type:f,separate:p};return i&&(m.biomes=i),a&&(m.states=a),o&&(m.cultures=o),s&&(m.religions=s),m});options.map.military.units=r,Options.save(),Military.generate(),d.draw(`military`),R()}}function J(){g(`militaryOptions`),r(`dialogs`).insertAdjacentHTML(`beforeend`,`<div id="militaryOptions" class="dialog stable">
      <div class="table">
        <table id="militaryOptionsTable">
          <thead>
            <tr>
              <th data-tip="Unit icon">Icon</th>
              <th data-tip="Unit name. If name is changed for existing unit, old unit will be replaced">Unit name</th>
              <th style="width: 5em" data-tip="Select allowed biomes">Biomes</th>
              <th style="width: 5em" data-tip="Select allowed states">States</th>
              <th style="width: 5em" data-tip="Select allowed cultures">Cultures</th>
              <th style="width: 5em" data-tip="Select allowed religions">Religions</th>
              <th data-tip="Conscription percentage for rural population">Rural</th>
              <th data-tip="Conscription percentage for urban population">Urban</th>
              <th data-tip="Average number of people in crew (used for total personnel calculation)">Crew</th>
              <th data-tip="Unit military power (used for battle simulation)">Power</th>
              <th data-tip="Unit type to apply special rules on forces recalculation">Type</th>
              <th data-tip="Check if unit is separate and can be stacked only with units of the same type">
                Separate
              </th>
            </tr>
          </thead>
          <tbody></tbody>
        </table>
      </div>
    </div>`)}function Y(){$(`#militaryOptions`).dialog(`destroy`),r(`militaryOptions`).remove()}function X(){r(`alertMessage`).innerHTML=`Are you sure you want to recalculate military forces for all states?<br>Regiments for all states will be regenerated`,$(`#alert`).dialog({resizable:!1,title:`Recalculate military`,buttons:{Recalculate:function(){$(this).dialog(`close`),Military.generate(),d.draw(`military`),B()},Cancel:function(){$(this).dialog(`close`)}}})}function Z(){let e=options.map.military.units.map(e=>e.name),n=`Id,State,${e.map(e=>a(e)).join(`,`)},Total,Population,Rate,War Alert\n`;for(let t of z())n+=`${t.state.i},${t.state.name},${e.map(e=>t.forces[e]||0).join(`,`)},${t.total},${t.population},${c(t.rate,2)}%,${t.alert}\n`;let r=`${i(`Military`)}.csv`;t(n,r)}var Q={open:M,exportCsv:Z};export{Q as MilitaryOverview};