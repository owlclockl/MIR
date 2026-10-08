import{B as e,H as t,Jt as n,Mn as r,Nn as i,On as a,P as o,Pn as s,Qt as c,U as l,Un as u,a as d,g as f,kn as p,n as m,nr as h,o as g,p as _,qt as v,r as y,tn as b,y as x}from"./utils-BXzQ0Tym.js";import{t as S}from"./extent-V-JVJWfI.js";import{t as C}from"./mean-4Awewi9R.js";import{t as w}from"./sum-BpJJqxFM.js";import{n as ee,r as T}from"./axis-I8_pxNLd.js";import{i as E}from"./tooltips-P6FAPAdd.js";import{i as D,l as O,n as k}from"./dialog-helpers-CJ5pbzaw.js";var A=class extends Map{constructor(e,t=P){if(super(),Object.defineProperties(this,{_intern:{value:new Map},_key:{value:t}}),e!=null)for(let[t,n]of e)this.set(t,n)}get(e){return super.get(j(this,e))}has(e){return super.has(j(this,e))}set(e,t){return super.set(M(this,e),t)}delete(e){return super.delete(N(this,e))}};function j({_intern:e,_key:t},n){let r=t(n);return e.has(r)?e.get(r):n}function M({_intern:e,_key:t},n){let r=t(n);return e.has(r)?e.get(r):(e.set(r,n),n)}function N({_intern:e,_key:t},n){let r=t(n);return e.has(r)&&(n=e.get(r),e.delete(r)),n}function P(e){return typeof e==`object`&&e?e.valueOf():e}function F(e,t,...n){return I(e,Array.from,t,n)}function I(e,t,n,r){return(function e(i,a){if(a>=r.length)return n(i);let o=new A,s=r[a++],c=-1;for(let e of i){let t=s(e,++c,i),n=o.get(t);n?n.push(e):o.set(t,[e])}for(let[t,n]of o)o.set(t,e(n,a));return t(o)})(e,0)}function te(e){return a(p(e).call(document.documentElement))}var L=Symbol(`implicit`);function R(){var e=new A,t=[],n=[],r=L;function i(i){let a=e.get(i);if(a===void 0){if(r!==L)return r;e.set(i,a=t.push(i)-1)}return n[a%n.length]}return i.domain=function(n){if(!arguments.length)return t.slice();t=[],e=new A;for(let r of n)e.has(r)||e.set(r,t.push(r)-1);return i},i.range=function(e){return arguments.length?(n=Array.from(e),i):n.slice()},i.unknown=function(e){return arguments.length?(r=e,i):r},i.copy=function(){return R(t,n).unknown(r)},b.apply(i,arguments),i}function ne(){var e=R().unknown(void 0),t=e.domain,n=e.range,i=0,a=1,o,s,c=!1,l=0,u=0,d=.5;delete e.unknown;function f(){var e=t().length,f=a<i,p=f?a:i,m=f?i:a;o=(m-p)/Math.max(1,e-l+u*2),c&&(o=Math.floor(o)),p+=(m-p-o*(e-l))*d,s=o*(1-l),c&&(p=Math.round(p),s=Math.round(s));var h=r(e).map(function(e){return p+o*e});return n(f?h.reverse():h)}return e.domain=function(e){return arguments.length?(t(e),f()):t()},e.range=function(e){return arguments.length?([i,a]=e,i=+i,a=+a,f()):[i,a]},e.rangeRound=function(e){return[i,a]=e,i=+i,a=+a,c=!0,f()},e.bandwidth=function(){return s},e.step=function(){return o},e.round=function(e){return arguments.length?(c=!!e,f()):c},e.padding=function(e){return arguments.length?(l=Math.min(1,u=+e),f()):l},e.paddingInner=function(e){return arguments.length?(l=Math.min(1,e),f()):l},e.paddingOuter=function(e){return arguments.length?(u=+e,f()):u},e.align=function(e){return arguments.length?(d=Math.max(0,Math.min(1,e)),f()):d},e.copy=function(){return ne(t(),[i,a]).round(c).paddingInner(l).paddingOuter(u).align(d)},b.apply(f(),arguments)}function z(e,t){if((o=e.length)>1)for(var n=1,r,i,a=e[t[0]],o,s=a.length;n<o;++n)for(i=a,a=e[t[n]],r=0;r<s;++r)a[r][1]+=a[r][0]=isNaN(i[r][1])?i[r][0]:i[r][1]}function B(e){for(var t=e.length,n=Array(t);--t>=0;)n[t]=t;return n}function V(e,t){return e[t]}function H(e){let t=[];return t.key=e,t}function re(){var e=n([]),t=B,r=z,i=V;function a(n){var a=Array.from(e.apply(this,arguments),H),o,s=a.length,c=-1,l;for(let e of n)for(o=0,++c;o<s;++o)(a[o][c]=[0,+i(e,a[o].key,c,n)]).data=e;for(o=0,l=v(t(a));o<s;++o)a[l[o]].index=o;return r(a,l),a}return a.keys=function(t){return arguments.length?(e=typeof t==`function`?t:n(Array.from(t)),a):e},a.value=function(e){return arguments.length?(i=typeof e==`function`?e:n(+e),a):i},a.order=function(e){return arguments.length?(t=e==null?B:typeof e==`function`?e:n(Array.from(e)),a):t},a.offset=function(e){return arguments.length?(r=e??z,a):r},a}function ie(e,t){if((r=e.length)>0){for(var n,r,i=0,a=e[0].length,o;i<a;++i){for(o=n=0;n<r;++n)o+=e[n][i][1]||0;if(o)for(n=0;n<r;++n)e[n][i][1]/=o}z(e,t)}}function ae(e,t){if((c=e.length)>0)for(var n,r=0,i,a,o,s,c,l=e[t[0]].length;r<l;++r)for(o=s=0,n=0;n<c;++n)(a=(i=e[t[n]][r])[1]-i[0])>0?(i[0]=o,i[1]=o+=a):a<0?(i[1]=s,i[0]=s+=a):(i[0]=0,i[1]=a)}var U={states:{label:`Государство`,getId:e=>pack.cells.state[e],getName:Z(`states`),getColors:Q(`states`),landOnly:!0},cultures:{label:`Культура`,getId:e=>pack.cells.culture[e],getName:Z(`cultures`),getColors:Q(`cultures`),landOnly:!0},religions:{label:`Религия`,getId:e=>pack.cells.religion[e],getName:Z(`religions`),getColors:Q(`religions`),landOnly:!0},provinces:{label:`Провинция`,getId:e=>pack.cells.province[e],getName:Z(`provinces`),getColors:Q(`provinces`),landOnly:!0},biomes:{label:`Биом`,getId:e=>pack.cells.biome[e],getName:xe,getColors:Se,landOnly:!1},markets:{label:`Рынок`,getId:e=>pack.cells.market[e],getName:Ce,getColors:we,landOnly:!1},goods:{label:`Товар`,requires:`good`,getId:(e,t)=>t.good,getName:Te,getColors:Ee,landOnly:!1}},W={total_population:{label:`Всего населения`,quantize:e=>Oe(e)+ke(e),aggregate:e=>h(w(e)),formatTicks:e=>x(e),stringify:e=>e.toLocaleString(),stackable:!0,landOnly:!0},urban_population:{label:`Городское население`,quantize:Oe,aggregate:e=>h(w(e)),formatTicks:e=>x(e),stringify:e=>e.toLocaleString(),stackable:!0,landOnly:!0},rural_population:{label:`Сельское население`,quantize:ke,aggregate:e=>h(w(e)),formatTicks:e=>x(e),stringify:e=>e.toLocaleString(),stackable:!0,landOnly:!0},area:{label:`Площадь суши`,quantize:e=>d(pack.cells.area[e]),aggregate:e=>h(w(e)),formatTicks:e=>`${x(e)} ${g()}`,stringify:e=>`${e.toLocaleString()} ${g()}`,stackable:!0,landOnly:!0},cells:{label:`Ячейки`,hint:`Земельных ячеек`,quantize:()=>1,aggregate:e=>w(e),formatTicks:e=>e,stringify:e=>e.toLocaleString(),stackable:!0,landOnly:!0},burgs_number:{label:`Города`,hint:`Число городов`,quantize:e=>+!!pack.cells.burg[e],aggregate:e=>w(e),formatTicks:e=>e,stringify:e=>e.toLocaleString(),stackable:!0,landOnly:!0},average_elevation:{label:`Средняя высота`,quantize:e=>pack.cells.h[e],aggregate:e=>C(e),formatTicks:e=>_(e),stringify:e=>_(e),stackable:!1,landOnly:!1},max_elevation:{label:`Максимальная средняя высота`,quantize:e=>pack.cells.h[e],aggregate:e=>s(e),formatTicks:e=>_(e),stringify:e=>_(e),stackable:!1,landOnly:!1},min_elevation:{label:`Минимальная средняя высота`,quantize:e=>pack.cells.h[e],aggregate:e=>i(e),formatTicks:e=>_(e),stringify:e=>_(e),stackable:!1,landOnly:!1},average_temperature:{label:`Годовая средняя температура`,quantize:e=>grid.cells.temp[pack.cells.g[e]],aggregate:e=>C(e),formatTicks:e=>m(e),stringify:e=>m(e),stackable:!1,landOnly:!1},max_temperature:{label:`Годовой максимум температуры`,hint:`Самая высокая среднегодовая температура`,quantize:e=>grid.cells.temp[pack.cells.g[e]],aggregate:e=>s(e),formatTicks:e=>m(e),stringify:e=>m(e),stackable:!1,landOnly:!1},min_temperature:{label:`Годовой минимум температуры`,hint:`Самая низкая среднегодовая температура`,quantize:e=>grid.cells.temp[pack.cells.g[e]],aggregate:e=>i(e),formatTicks:e=>m(e),stringify:e=>m(e),stackable:!1,landOnly:!1},average_precipitation:{label:`Годовая средняя норма осадков`,quantize:e=>grid.cells.prec[pack.cells.g[e]],aggregate:e=>h(C(e)),formatTicks:e=>f(h(e)),stringify:e=>f(h(e)),stackable:!1,landOnly:!0},max_precipitation:{label:`Годовой максимум осадков`,hint:`Самая высокая среднегодовая норма осадков`,quantize:e=>grid.cells.prec[pack.cells.g[e]],aggregate:e=>h(s(e)),formatTicks:e=>f(h(e)),stringify:e=>f(h(e)),stackable:!1,landOnly:!0},min_precipitation:{label:`Годовой минимум осадков`,hint:`Самая низкая среднегодовая норма осадков`,quantize:e=>grid.cells.prec[pack.cells.g[e]],aggregate:e=>h(i(e)),formatTicks:e=>f(h(e)),stringify:e=>f(h(e)),stackable:!1,landOnly:!0},coastal_cells:{label:`Прибрежных ячеек`,quantize:e=>+(pack.cells.t[e]===1),aggregate:e=>w(e),formatTicks:e=>e,stringify:e=>e.toLocaleString(),stackable:!0,landOnly:!0},river_cells:{label:`Ячеек рек`,quantize:e=>+!!pack.cells.r[e],aggregate:e=>w(e),formatTicks:e=>e,stringify:e=>e.toLocaleString(),stackable:!0,landOnly:!0},production_value:{label:`Стоимость производства`,hint:`Стоимость произведённых товаров`,provides:[`good`],prepare:()=>({biomeProduction:Goods.getBiomesProduction()}),getContributions:(e,{biomeProduction:t})=>{let n=De(e,t),r=[];for(let[e,t]of Object.entries(n)){let n=Goods.get(+e);n&&r.push({good:+e,value:t*n.value})}return r},aggregate:e=>h(w(e)),formatTicks:e=>x(e),stringify:e=>y(e),stackable:!0,landOnly:!0},production_units:{label:`Объём производства`,hint:`Единиц товара произведено`,provides:[`good`],prepare:()=>({biomeProduction:Goods.getBiomesProduction()}),getContributions:(e,{biomeProduction:t})=>{let n=De(e,t),r=[];for(let[e,t]of Object.entries(n))r.push({good:+e,value:t});return r},aggregate:e=>h(w(e)),formatTicks:e=>x(e),stringify:e=>`${e.toLocaleString()} units`,stackable:!0,landOnly:!0},burgs_profit:{label:`Прибыль городов`,hint:`Прибыль городов от торговли и производства`,quantize:e=>{let t=pack.cells.burg[e];return t&&pack.burgs[t].product||0},aggregate:e=>h(w(e)),formatTicks:e=>x(e),stringify:e=>y(e),stackable:!0,landOnly:!0}},oe={stackedBar:{offset:ae},normalizedStackedBar:{offset:ie,formatX:e=>`${h(e*100)}%`}},G=[],K;function se(){ce(),me(),le(),k(`#chartsOverview, .stable`);let e=mapHistory.at(-1)?.created;if(K!==e&&(G=[],K=e),!G.length)ue();else for(let e of G)de(e);$(`#chartsOverview`).dialog({title:`Графики`,width:`60vw`,height:`auto`,position:{my:`center`,at:`center`,of:`svg`},close:he})}function ce(){D(`chartsOverview`);let e=Object.entries(U).map(([e,{label:t}])=>[e,t]),t=Object.entries(W).map(([e,{label:t}])=>[e,t]),n=([e,t])=>`<option value="${e}">${t}</option>`,r=e=>e.map(n).join(``),i=`<div id="chartsOverview" class="dialog stable">
    <form id="chartsOverview__form">
      <div>
        <button data-tip="Добавить график" type="submit">График</button>

        <select data-tip="Выберите сущность (ось y)" id="chartsOverview__entitiesSelect">
          ${r(e)}
        </select>

        <label for="chartsOverview__plotBySelect" data-tip="Выберите метрику (ось x)">
          <span>by</span>
          <select id="chartsOverview__plotBySelect">
            ${r(t)}
          </select>
          <i id="chartsOverview__plotByInfo" class="icon-info-circled" style="display: none"></i>
        </label>

        <label for="chartsOverview__groupBySelect" data-tip="Выберите сущность для группировки. Если группировка не нужна, поставьте ту же сущность">
          <span>группировка по</span>
          <select id="chartsOverview__groupBySelect">
            ${r(e)}
          </select>
        </label>

        <label data-tip="Тип сортировки" for="chartsOverview__sortingSelect">
          <span>sorted</span>
          <select id="chartsOverview__sortingSelect">
            <option value="value">по значению</option>
            <option value="name">по названию</option>
            <option value="natural">naturally</option>
          </select>
        </label>
      </div>

      <div>
        <label data-tip="Выберите тип графика" for="chartsOverview__chartType">
          <span>Тип</span>
          <select id="chartsOverview__chartType">
            <option value="stackedBar" selected>Столбцы с разделением</option>
            <option value="normalizedStackedBar">Нормированный столбец</option>
          </select>
        </label>

        <label data-tip="Число столбцов графиков: 1, 2, 3 или 4" for="chartsOverview__viewColumns">
          <span>Столбцы</span>
          <select id="chartsOverview__viewColumns">
            <option value="1" selected>1</option>
            <option value="2">2</option>
            <option value="3">3</option>
            <option value="4">4</option>
          </select>
        </label>

        <label data-tip="Исключить нулевой элемент из результатов (id 0, например нейтральное государство)" for="chartsOverview__excludeNeutral">
          <input id="chartsOverview__excludeNeutral" type="checkbox" class="native" />
          <span>Исключить нейтральные</span>
        </label>
      </div>
    </form>

    <section id="chartsOverview__charts"></section>
  </div>`;o(`dialogs`).insertAdjacentHTML(`beforeend`,i),o(`chartsOverview__entitiesSelect`).value=`states`,o(`chartsOverview__plotBySelect`).value=`total_population`,o(`chartsOverview__groupBySelect`).value=`cultures`,o(`chartsOverview__form`).addEventListener(`submit`,ue),o(`chartsOverview__viewColumns`).addEventListener(`change`,me),o(`chartsOverview__plotBySelect`).addEventListener(`change`,le),document.getElementById(`chartsOverviewStyle`)?.remove();let a=document.createElement(`style`);a.id=`chartsOverviewStyle`,a.textContent=`
    #chartsOverview {
      max-width: 90vw !important;
      max-height: 90vh !important;
      overflow: hidden;
      display: grid;
      grid-template-rows: auto 1fr;
    }

    #chartsOverview__form {
      display: grid;
      font-size: 1.1em;
      margin: 0.3em 0;
    }

    #chartsOverview__form > div:first-child {
      display: flex;
      align-items: center;
      gap: 0.2em;
    }

    #chartsOverview__form > div:nth-child(2) {
      display: flex;
      align-items: center;
      gap: 1em;
    }

    #chartsOverview__form label {
      display: inline-flex;
      align-items: center;
    }

    #chartsOverview__charts {
      overflow: auto;
      scroll-behavior: smooth;
      display: grid;
    }

    #chartsOverview__charts figure {
      margin: 0;
      padding: 0.6em 0 1em;
      border-top: 1px solid rgba(128, 128, 128, 0.4);
    }

    #chartsOverview__charts figcaption {
      font-size: 1.2em;
      margin: 0 1% 0.4em 4%;
      display: grid;
      align-items: center;
      grid-template-columns: 1fr auto;
    }

    #chartsOverview__plotByInfo {
      margin-left: 0.3em;
      cursor: help;
      opacity: 0.6;
    }
  `,document.head.appendChild(a)}function le(){let e=o(`chartsOverview__plotBySelect`).value,t=o(`chartsOverview__plotByInfo`),{hint:n}=W[e];n?(t.dataset.tip=n,t.style.display=``):t.style.display=`none`}function ue(e){e&&e.preventDefault();let t=o(`chartsOverview__entitiesSelect`).value,n=o(`chartsOverview__plotBySelect`).value,r=o(`chartsOverview__groupBySelect`).value,i=o(`chartsOverview__sortingSelect`).value,a=o(`chartsOverview__chartType`).value,s=o(`chartsOverview__excludeNeutral`).checked,{label:c,stackable:l,provides:u=[]}=W[n],d=[t,r].find(e=>{let t=U[e].requires;return t?!u.includes(t):!1});if(d){E(`${c} cannot be broken down by ${U[d].label.toLowerCase()}`,!1,`error`,4e3);return}!l&&r!==t&&(E(`Grouping is not supported for ${n}`,!1,`warn`,4e3),r=t);let f={id:Date.now(),entity:t,plotBy:n,groupBy:r,sorting:i,type:a,excludeNeutral:s};G.push(f),de(f),q()}function de({id:t,entity:n,plotBy:r,groupBy:i,sorting:a,type:s,excludeNeutral:c}){let{label:l,stringify:d,quantize:f,getContributions:p,prepare:m,aggregate:g,formatTicks:_,landOnly:v}=W[r],y=i===n,{label:b,getName:x,getId:S,landOnly:C}=U[n],{label:w,getName:ee,getId:T,getColors:E}=U[i],D=m?m():void 0,O=p?e=>p(e,D):e=>[{value:f(e)}],k=`${u(n)} by ${l}${y?``:` grouped by ${w}`}`,A=(e,t,n,r)=>{let i=`${b}: ${e}`,a=y?``:`${w}: ${t}`,o=`${l}: ${d(n)}`;return y||(o+=` (${h(r*100)}%)`),[i,a,o].filter(Boolean)},j={},M=new Set;for(let t of pack.cells.i)if(!((C||v)&&e(t,pack)))for(let e of O(t)){let n=S(t,e),r=T(t,e);if(c&&(n===0||r===0))continue;let{value:i}=e;j[n]?j[n][r]?j[n][r].push(i):j[n][r]=[i]:j[n]={[r]:[i]},M.add(r)}let N=Ae(Object.entries(j).flatMap(([e,t])=>{let n=x(e);return Object.entries(t).map(([e,t])=>({name:n,group:ee(e),value:g(t)}))}),a),P=E(),{offset:F,formatX:I=_}=oe[s];pe(t,N,fe(N,{colors:P,tooltip:A,offset:F,formatX:I}),k),o(`chartsOverview__charts`).lastElementChild?.scrollIntoView()}function fe(e,{colors:t,tooltip:n,offset:i,formatX:a}){let o=e.map(e=>e.value),s=e.map(e=>e.name),l=e.map(e=>e.group),u=new Set(s),d=new Set(l),f=r(o.length).filter(e=>u.has(s[e])&&d.has(l[e])),p=Array.from(u),m=Array.from(d),h=ye(p),g=be(m,X-h-15),_={top:30,right:15,bottom:g*20+10,left:h},v=[_.left,X-_.right],y=u.size*25+_.top+_.bottom,b=[y-_.bottom,_.top],x=F(f,([e])=>e,e=>s[e],e=>l[e]),C=re().keys(m).value(([,e],t)=>o[new Map(e).get(t)]).order(B).offset(i)(x).map(e=>{let t=e.filter(e=>!Number.isNaN(e[1])).map(t=>Object.assign(t,{i:new Map(t.data[1]).get(e.key)}));return{key:e.key,data:t}}),D=c(S(C.flatMap(e=>e.data.flatMap(e=>[e[0],e[1]]))),v),O=ne(p,b).paddingInner(ge),k=T(D).ticks(X/80,null),A=ee(O).tickSizeOuter(0),j=te(`svg`).attr(`version`,`1.1`).attr(`xmlns`,`http://www.w3.org/2000/svg`).attr(`viewBox`,`0 0 ${X} ${y}`).attr(`style`,`max-width: 100%; height: auto; height: intrinsic;`);j.append(`g`).attr(`transform`,`translate(0,${_.top})`).call(k).call(e=>e.select(`.domain`).remove()).call(e=>e.selectAll(`text`).text(e=>a(e))).call(e=>e.selectAll(`.tick line`).clone().attr(`y2`,y-_.top-_.bottom).attr(`stroke-opacity`,.1));let M=j.append(`g`).attr(`stroke`,`#666`).attr(`stroke-width`,.5).selectAll(`g`).data(C).join(`g`).attr(`fill`,e=>t[e.key]).selectAll(`rect`).data(e=>e.data.filter(([e,t])=>e!==t)).join(`rect`).attr(`x`,([e,t])=>Math.min(D(e),D(t))).attr(`y`,({i:e})=>O(s[e])).attr(`width`,([e,t])=>Math.abs(D(e)-D(t))).attr(`height`,O.bandwidth()),N=Object.fromEntries(F(f,e=>w(e,e=>o[e]),e=>s[e])),P=({i:e})=>n(s[e],l[e],o[e],o[e]/N[s[e]]);M.append(`title`).text(e=>P(e).join(`\r
`)),M.on(`mouseover`,(e,t)=>E(P(t).join(`. `))),j.append(`g`).attr(`transform`,`translate(${D(0)},0)`).call(A);let I=Math.ceil(m.length/g),L=X/(I+.5),R=(e,t)=>t%I*L,z=(e,t)=>R(e,t)+ve,V=(e,t)=>Math.floor(t/I)*20,H=j.append(`g`).attr(`stroke`,`#666`).attr(`stroke-width`,.5).attr(`dominant-baseline`,`central`).attr(`transform`,`translate(${_.left},${y-_.bottom+15})`);return H.selectAll(`circle`).data(m).join(`rect`).attr(`x`,R).attr(`y`,V).attr(`width`,10).attr(`height`,10).attr(`transform`,`translate(-5, -5)`).attr(`fill`,e=>t[e]),H.selectAll(`text`).data(m).join(`text`).attr(`x`,z).attr(`y`,V).text(e=>e),j.node()}function pe(e,n,r,i){let a=o(`chartsOverview__charts`),s=document.createElement(`figure`),c=document.createElement(`figcaption`);c.innerHTML=`
    <div>
      <strong>Фигура ${a.childElementCount+1}</strong>. ${i}
    </div>
    <div>
      <button data-tip="Скачать данные графика в текстовый файл (.csv)" class="icon-download"></button>
      <button data-tip="Скачать график как PNG" class="icon-export"></button>
      <button data-tip="Скачать график в SVG (вектор, открывается в браузере или Inkscape)" class="icon-chart-bar"></button>
      <button data-tip="Удалить график" class="icon-trash"></button>
    </div>
  `,s.appendChild(c),s.appendChild(r),a.appendChild(s),s.querySelector(`button.icon-download`)?.addEventListener(`click`,()=>{let e=`${l(i)}.csv`;t(`Name,Group,Value
`+n.map(({name:e,group:t,value:n})=>`${e},${t},${n}`).join(`
`),e)}),s.querySelector(`button.icon-export`)?.addEventListener(`click`,()=>{let{width:e,height:n}=r.viewBox.baseVal,a=r.cloneNode(!0);a.setAttribute(`width`,String(e)),a.setAttribute(`height`,String(n));let o=new XMLSerializer().serializeToString(a),s=URL.createObjectURL(new Blob([o],{type:`image/svg+xml;charset=utf-8`})),c=new Image;c.onload=()=>{let r=document.createElement(`canvas`);r.width=e*2,r.height=n*2;let a=r.getContext(`2d`);a&&(a.fillStyle=`#fff`,a.fillRect(0,0,r.width,r.height),a.drawImage(c,0,0,r.width,r.height),r.toBlob(e=>e&&t(e,`${l(i)}.png`,`image/png`))),URL.revokeObjectURL(s)},c.src=s}),s.querySelector(`button.icon-chart-bar`)?.addEventListener(`click`,()=>{let e=`${l(i)}.svg`;t(r.outerHTML,e)}),s.querySelector(`button.icon-trash`)?.addEventListener(`click`,()=>{s.remove(),G=G.filter(t=>t.id!==e),q()})}function me(){let e=o(`chartsOverview__viewColumns`).value,t=o(`chartsOverview__charts`);t.style.gridTemplateColumns=`repeat(${e}, 1fr)`,q()}function q(){O(`chartsOverview`,{position:{my:`center`,at:`center`,of:`svg`,collision:`fit`}})}function he(){$(`#chartsOverview`).dialog(`destroy`),o(`chartsOverview`).remove(),document.getElementById(`chartsOverviewStyle`)?.remove()}var J=`#ccc`,Y=`no`,X=800,ge=.2,_e=7,ve=10;function ye(e){return s(e.map(e=>e.length))*_e}function be(e,t){if(!e.length)return 0;let n=ve+ye(e),r=Math.max(1,Math.floor(t/n));return Math.ceil(e.length/r)}function Z(e){return t=>pack[e][+t]?.name||Y}function Q(e){return()=>Object.fromEntries(pack[e].map(e=>[e.name||Y,e.color||J]))}function xe(e){return pack.biomes[+e]?.name||Y}function Se(){return Object.fromEntries(pack.biomes.map(({name:e,color:t})=>[e,t]))}function Ce(e){let t=Markets.get(+e);return t?t.name||pack.burgs[t.centerBurgId]?.name||`Market ${t.i}`:Y}function we(){return Object.fromEntries((pack.markets||[]).map(e=>[Ce(e.i),e.color||J]))}function Te(e){return Goods.get(+e)?.name||Y}function Ee(){return Object.fromEntries((pack.goods||[]).map(e=>[e.name||Y,e.color||J]))}function De(e,t){let n=Production.getCellProduction(e,t),r=pack.cells.burg[e];if(r){let e=Production.getBurgProduction(pack.burgs[r]);for(let[t,r]of Object.entries(e))n[+t]=(n[+t]||0)+r}return n}function Oe(e){let t=pack.cells.burg[e];return t?(pack.burgs[t].population||0)*options.map.units.population.scale*options.map.units.population.urbanization.rate:0}function ke(e){return pack.cells.pop[e]*options.map.units.population.scale}function Ae(e,t){if(t===`natural`)return e;if(t===`name`)return e.sort((e,t)=>e.name===t.name?e.group.localeCompare(t.group):t.name.localeCompare(e.name));if(t===`value`){let t={},n={};for(let{name:r,group:i,value:a}of e)t[r]=(t[r]||0)+a,n[i]=(n[i]||0)+a;return e.sort((e,r)=>e.name===r.name?n[r.group]-n[e.group]:t[e.name]-t[r.name])}return e}var je={open:se};export{je as ChartsOverview};