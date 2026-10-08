import{Gn as e,L as t,Lt as n,On as r,P as i,Wn as a,_ as o,ct as s,er as c,n as ee,nr as l,ot as u,p as te}from"./utils-BXzQ0Tym.js";import{Q as ne,it as re,t as d,tt as ie}from"./layers-Bcg3SU5R.js";import{i as ae}from"./emblems-generator-BdUAGZhv.js";import{i as f,t as oe}from"./tooltips-P6FAPAdd.js";import{t as p}from"./controllers-DoYIZ-kt.js";import{i as se,n as m,o as ce,r as h}from"./dialog-helpers-CJ5pbzaw.js";import{t as le}from"./viewbox-events-3YWWeuSF.js";var g={k:1,x:0,y:0};function _({k:e,x:t,y:n},r){return{k:e,x:c(t,r.width*(1-e),0),y:c(n,r.height*(1-e),0)}}function v(e,t,n,r,i=32){let a=c(e.k*n,1,Math.max(1,i)),o=a/e.k;return _({k:a,x:t.x-(t.x-e.x)*o,y:t.y-(t.y-e.y)*o},r)}function ue(e,t,n,r){return _({k:e.k,x:e.x+t,y:e.y+n},r)}var y=null,b=null,x={...g},S=32,C=1,w=0,T=!1;function de(e){customization||(m(`.stable`),d.show(`burgIcons`,`labels`),b=+e,y=r(`#labels`).select(`[data-label-type='burg'][data-id='${e}']`),y.size()||(y=r(`#burgIcons`).select(`[data-id='${e}']`)),fe(),i(`burgEditor`).dataset.entity=`burg:${b}`,pe(),D(),$(`#burgEditor`).dialog({title:`Редактирование города`,resizable:!1,close:Ne,position:{my:`left top`,at:`left+10 top+10`,of:`svg`,collision:`fit`}}))}function fe(){se(`burgEditor`);let e=`<div id="burgEditor" class="dialog" data-burg-id="${E()}">
      <div id="burgBody" style="padding-bottom: 0.3em">
        <div style="display: flex; align-items: center">
          <svg data-tip="Эмблема города. Кликните, чтобы изменить" class="pointer" viewBox="0 0 200 200" width="13em" height="13em">
            <use id="burgEmblem"></use>
          </svg>
          <div style="display: grid; grid-auto-rows: minmax(1.6em, auto)">
            <div id="burgProvinceAndState" style="font-weight: bold; max-width: 16em"></div>
            <div>
              <div class="label">Name:</div>
              <input
                id="burgName"
                data-tip="Введите название города"
                autocorrect="off"
                spellcheck="false"
                style="width: 9em"
              />
              <span id="burgNameSpeak" data-tip="Озвучить название. Голос и язык меняются в настройках" class="speaker">🔊</span>
              <span
                id="burgNameReRandom"
                data-tip="Создать случайное название города"
                class="icon-globe pointer"
              ></span>
            </div>
            <div data-tip="Выберите группу городов. Группа задаёт иконку, размер и стиль надписи">
              <div class="label">Group:</div>
              <select id="burgGroup" style="width: 9em"></select>
              <span id="burgGroupConfigure" data-tip="Настроить группы городов" class="icon-cog pointer"></span>
            </div>
            <div data-tip="Выберите тип города. Он слегка влияет на генерацию эмблемы">
              <div class="label">Type:</div>
              <select id="burgType" style="width: 9em">
                <option value="Generic">Общее</option>
                <option value="River">Река</option>
                <option value="Lake">Озеро</option>
                <option value="Naval">Флот</option>
                <option value="Nomadic">Кочевники</option>
                <option value="Hunting">Охота</option>
                <option value="Highland">Горы</option>
              </select>
            </div>
            <div data-tip="Выберите доминирующую культуру">
              <div class="label">Culture:</div>
              <select id="burgCulture" style="width: 9em"></select>
              <span
                id="burgNameReCulture"
                data-tip="Создать культурно-специфичное название города"
                class="icon-book pointer"
              ></span>
            </div>
            <div data-tip="Население города">
              <div class="label">Population:</div>
              <input id="burgPopulation" type="number" min="0" step="1" style="width: 9em" />
            </div>
            <div data-tip="Среднегодовая температура города" style="display: flex; justify-content: space-between">
              <div>
                <div class="label">Temperature:</div>
                <span id="burgTemperature"></span>
              </div>
              <div style="display: flex; gap: 0.5em">
                <i class="icon-info-circled" id="burgTemperatureLikeIn"></i>
                <i
                  id="burgTemperatureGraph"
                  data-tip="График температуры города"
                  class="icon-chart-area pointer"
                ></i>
              </div>
            </div>
            <div data-tip="Высота города над средним уровнем моря">
              <div class="label">Elevation:</div>
              <span id="burgElevation"></span> над уровнем моря
            </div>
            <div>
              <div class="label">Features:</div>
              <span
                id="burgCapital"
                data-tip="Является ли город столицей государства. Кликните, чтобы переключить"
                data-feature="capital"
                class="burgFeature icon-star"
              ></span>
              <span
                id="burgPort"
                data-tip="Является ли город портом. Кликните, чтобы переключить"
                data-feature="port"
                class="burgFeature icon-anchor"
              ></span>
              <span
                id="burgCitadel"
                data-tip="Есть ли в городе цитадель (замок). Кликните, чтобы переключить"
                data-feature="citadel"
                class="burgFeature icon-chess-rook"
                style="font-size: 1.1em"
              ></span>
              <span
                id="burgWalls"
                data-tip="Есть ли у города стены. Кликните, чтобы переключить"
                data-feature="walls"
                class="burgFeature icon-fort-awesome"
              ></span>
              <span
                id="burgPlaza"
                data-tip="Является ли город торговым центром (рынком). Кликните, чтобы переключить"
                data-feature="plaza"
                class="burgFeature icon-store"
                style="font-size: 1em"
              ></span>
              <span
                id="burgTemple"
                data-tip="Является ли город религиозным центром. Кликните, чтобы переключить"
                data-feature="temple"
                class="burgFeature icon-chess-bishop"
                style="font-size: 1.1em; margin-left: 3px"
              ></span>
              <span
                id="burgShanty"
                data-tip="Есть ли в городе трущобы. Кликните, чтобы переключить"
                data-feature="shanty"
                class="burgFeature icon-campground"
                style="font-size: 1em"
              ></span>
            </div>
            <div data-tip="Средняя дневная добыча города">
              <div class="label">Production:</div>
              <span id="burgProduction" style="display: inline-flex; flex-wrap: wrap; column-gap: 0.3em; max-width: 110px;"></span>
            </div>
            <div data-tip="Валовой продукт на единицу населения в среднем за день">
              <div class="label">Богатство</div>
              <span id="burgWealth"></span>
            </div>
            <div data-tip="Баланс казны. Производство автоматически не изменится">
              <div class="label"><label for="burgTreasury">Treasury:</label></div>
              <input id="burgTreasury" type="number" step="0.01" style="width: 9em" /> 🟡
            </div>
          </div>
        </div>
        <div id="burgPreviewSection" data-tip="Превью города на карте: колесо — масштаб, перетаскивание — сдвиг" style="display: flex; flex-direction: column">
          <div style="display: flex; justify-content: space-between">
            <span>Превью города:</span>
            <div style="display: flex; gap: 0.5em">
              <i id="burgPreviewReset" data-tip="Сбросить масштаб предпросмотра" class="icon-ccw pointer"></i>
              <i id="burgLinkOpen" data-tip="Открыть карту города в новой вкладке" class="icon-link-ext pointer"></i>
            </div>
          </div>
          <div
            id="burgPreviewObject"
            style="overflow: hidden; position: relative; touch-action: none; height: 320px; max-width: 60vw; max-height: 60vh"
          ></div>
        </div>
      </div>
      <div id="burgBottom">
        <button id="burgStyleShow" data-tip="Показать раздел правки стиля" class="icon-brush"></button>
        <div id="burgStyleSection" style="display: none">
          <button id="burgStyleHide" data-tip="Скрыть раздел правки стиля" class="icon-brush"></button>
          <button
            id="burgEditLabelStyle"
            data-tip="Изменить стиль надписи группы городов в редакторе стиля"
            class="icon-font"
          ></button>
          <button
            id="burgEditGroupStyle"
            data-tip="Изменить стиль иконки и якоря группы городов в редакторе стиля"
            class="icon-dot-circled"
          ></button>
        </div>
        <button id="burgEditLabel" data-tip="Изменить надпись этого города" class="icon-font"></button>
        <button id="burgEditEmblem" data-tip="Изменить эмблему" class="icon-shield-alt"></button>
        <button id="burgSetPreviewLink" data-tip="Своя ссылка на карту города" class="icon-map-o"></button>
        <button id="burgLocate" data-tip="Приблизить карту и центрировать на городе" class="icon-target"></button>
        <button
          id="burgProductionOverview"
          data-tip="Производство этого города"
          class="icon-chart-bar"
        ></button>
        <button
          id="burgRelocate"
          data-tip="Переместить город. Кликните по карте"
          class="icon-map-pin"
        ></button>
        ${ce(`burglLegend`,`this burg`)}
        <button id="burgLock" class="icon-lock-open" onmouseover="showElementLockTip(event)"></button>
        <button
          id="burgRemove"
          data-tip="Удалить город не-столицу"
          data-shortcut="Delete"
          class="icon-trash fastDelete"
        ></button>
      </div>
    </div>`;i(`dialogs`).insertAdjacentHTML(`beforeend`,e),i(`burgName`).addEventListener(`input`,O),i(`burgNameSpeak`).addEventListener(`click`,()=>s(i(`burgName`).value)),i(`burgNameReRandom`).addEventListener(`click`,k),i(`burgGroup`).addEventListener(`change`,A),i(`burgGroupConfigure`).addEventListener(`click`,Me),i(`burgType`).addEventListener(`change`,j),i(`burgCulture`).addEventListener(`change`,M),i(`burgNameReCulture`).addEventListener(`click`,N),i(`burgPopulation`).addEventListener(`change`,P),i(`burgTreasury`).addEventListener(`change`,F),i(`burgBody`).querySelectorAll(`.burgFeature`).forEach(e=>void e.addEventListener(`click`,I)),i(`burgLinkOpen`).addEventListener(`click`,Te),i(`burgPreviewReset`).addEventListener(`click`,G),i(`burgPreviewObject`).addEventListener(`wheel`,be,{passive:!1}),i(`burgPreviewObject`).addEventListener(`dblclick`,xe),i(`burgPreviewObject`).addEventListener(`pointerdown`,Se),i(`burgStyleShow`).addEventListener(`click`,he),i(`burgStyleHide`).addEventListener(`click`,ge),i(`burgEditLabelStyle`).addEventListener(`click`,_e),i(`burgEditGroupStyle`).addEventListener(`click`,ye),i(`burgEmblem`).addEventListener(`click`,Y),i(`burgSetPreviewLink`).addEventListener(`click`,Ee),i(`burgEditEmblem`).addEventListener(`click`,Y),i(`burgLocate`).addEventListener(`click`,De),i(`burgEditLabel`).addEventListener(`click`,ve),i(`burgRelocate`).addEventListener(`click`,Z),i(`burglLegend`).addEventListener(`click`,Q),i(`burgLock`).addEventListener(`click`,me),i(`burgRemove`).addEventListener(`click`,je),i(`burgTemperatureGraph`).addEventListener(`click`,ke),i(`burgProductionOverview`).addEventListener(`click`,Ae)}function E(){return b??+y.attr(`data-id`)}function pe(){let e=i(`burgGroup`);e.options.length=0;for(let{name:t}of options.map.burgs.groups)e.options.add(new Option(t,t))}function D(){let e=E(),t=pack.burgs[e],n=pack.cells.province[t.cell],r=n?`${pack.provinces[n].fullName}, `:``,a=pack.states[t.state].fullName||pack.states[t.state].name;i(`burgProvinceAndState`).innerHTML=r+a,i(`burgName`).value=t.name,i(`burgGroup`).value=t.group,i(`burgType`).value=t.type||`Generic`,i(`burgPopulation`).value=String(l(t.population*options.map.units.population.scale*options.map.units.population.urbanization.rate)),i(`burgWealth`).innerHTML=`🟡 ${l(t.population>0?(t.product||0)/t.population:0,2)}`,i(`burgTreasury`).value=String(l(t.treasury||0,2));let s=i(`burgCulture`);s.options.length=0,pack.cultures.filter(e=>!e.removed).forEach(e=>void s.options.add(new Option(e.name,String(e.i),!1,e.i===t.culture)));let c=grid.cells.temp[pack.cells.g[t.cell]];i(`burgTemperature`).innerHTML=ee(c),i(`burgTemperatureLikeIn`).dataset.tip=`Average yearly temperature is like in ${o(c)}`,i(`burgElevation`).innerHTML=te(pack.cells.h[t.cell]),i(`burgCapital`).classList.toggle(`inactive`,!t.capital),i(`burgPort`).classList.toggle(`inactive`,!t.port),i(`burgCitadel`).classList.toggle(`inactive`,!t.citadel),i(`burgWalls`).classList.toggle(`inactive`,!t.walls),i(`burgPlaza`).classList.toggle(`inactive`,!t.plaza),i(`burgTemple`).classList.toggle(`inactive`,!t.temple),i(`burgShanty`).classList.toggle(`inactive`,!t.shanty),i(`burgProduction`).innerHTML=Pe(Production.getBurgProduction(t)),V();let u=`burgCOA${e}`;re.trigger(u,t.coa),i(`burgEmblem`).setAttribute(`href`,`#${u}`),J(t)}function O(){let e=i(`burgName`).value;e.trim()&&(Burgs.rename(E(),e),d.draw(`labels`))}function k(){let e=n(Names.nameBases.length-1);i(`burgName`).value=Names.getBase(e),O()}function A(){let e=E(),t=pack.burgs[e];Burgs.changeGroup(t,this.value),d.draw(`burgIcons`,`labels`)}function j(){let e=E();Burgs.setType(e,this.value)}function M(){Burgs.setCulture(E(),+this.value)}function N(){let e=E(),t=pack.burgs[e].culture;i(`burgName`).value=Names.getCulture(t),O()}function P(){let e=E(),t=pack.burgs[e],n=i(`burgPopulation`).valueAsNumber;Number.isFinite(n)&&n>=0&&Burgs.setPopulation(e,n),J(t)}function F(){let e=pack.burgs[E()];try{Burgs.setTreasury(e.i,this.valueAsNumber)}catch{f(`Введите корректную сумму казны`,!1,`error`)}this.value=String(l(e.treasury||0,2))}function I(){let e=E(),t=pack.burgs[e],n=this.dataset.feature,r=Number(this.classList.contains(`inactive`));if(n===`plaza`&&!r){let t=pack.markets?.find(t=>t.centerBurgId===e);if(t){L(t);return}}n===`port`?R(e):n===`capital`?z(e):Burgs.setBuilding(e,n,!!r),this.classList.toggle(`inactive`,!t[n]),J(t)}function L(t){h({title:`Удалить рынок`,message:`This burg is the center of the market "${e(Markets.getName(t))}". Remove the market?<br>This action cannot be reverted`,confirm:`Удалить`,onConfirm:()=>{Markets.removeMarket(t.i),d.draw(`markets`),D()}})}function R(e){B(()=>Burgs.setPort(e,!pack.burgs[e].port))&&d.draw(`burgIcons`)}function z(e){if(pack.burgs[e].capital){f(`Чтобы сменить столицу, назначьте статус столицы другому городу этого государства`,!1,`error`);return}B(()=>Burgs.setCapital(e))&&d.draw(`burgIcons`,`labels`)}function B(e){try{return e(),!0}catch(e){return f(a(e),!1,`error`),!1}}function me(){let e=E();Burgs.setLocked(e,!pack.burgs[e].lock),V()}function V(){let e=E();pack.burgs[e].lock?(i(`burgLock`).classList.remove(`icon-lock-open`),i(`burgLock`).classList.add(`icon-lock`)):(i(`burgLock`).classList.remove(`icon-lock`),i(`burgLock`).classList.add(`icon-lock-open`))}function he(){document.querySelectorAll(`#burgBottom > button`).forEach(e=>{e.style.display=`none`}),i(`burgStyleSection`).style.display=`inline-block`}function ge(){document.querySelectorAll(`#burgBottom > button`).forEach(e=>{e.style.display=`inline-block`}),i(`burgStyleSection`).style.display=`none`}function _e(){let e=pack.burgs[E()];m(`.stable`),p.StyleEditor.open(`labels`,e.label?.group||e.group)}function ve(){let e=E();$(`#burgEditor`).dialog(`close`),p.LabelsEditor.open(`burg`,e)}function ye(){let e=pack.burgs[E()];m(`.stable`),p.StyleEditor.open(`burgIcons`,e.group)}function H(){let e=i(`burgPreviewObject`);return{width:e.clientWidth,height:e.clientHeight}}function U(){let e=i(`burgPreviewObject`),t=e.querySelector(`iframe`);if(!t)return;let{k:n,x:r,y:a}=x;t.style.transformOrigin=`0 0`,t.style.transform=`translate(${r}px, ${a}px) scale(${n/C})`,t.style.left=`0`,t.style.top=`0`,e.style.cursor=n>1?`grab`:`default`,clearTimeout(w),T||(w=window.setTimeout(W,200))}function W(){if(T)return;let e=i(`burgPreviewObject`).querySelector(`iframe`);if(!e)return;let{k:t,x:n,y:r}=x;C=t,e.style.width=`${t*100}%`,e.style.height=`${t*100}%`,e.style.transform=`none`,e.style.left=`${n}px`,e.style.top=`${r}px`}function G(){x={...g},clearTimeout(w),T?U():W(),i(`burgPreviewObject`).style.cursor=`default`}function K(e){let t=i(`burgPreviewObject`).getBoundingClientRect();return{x:e.clientX-t.left,y:e.clientY-t.top}}function be(e){e.preventDefault();let t=Math.exp(-e.deltaY*(e.deltaMode===1?.05:e.deltaMode?1:.002));x=v(x,K(e),t,H(),S),U()}function xe(e){x=v(x,K(e),2,H(),S),U()}function Se(e){if(x.k<=1)return;e.preventDefault();let t=i(`burgPreviewObject`);t.setPointerCapture(e.pointerId),t.style.cursor=`grabbing`;let n={x:e.clientX,y:e.clientY},r=e=>{let t=e;x=ue(x,t.clientX-n.x,t.clientY-n.y,H()),n={x:t.clientX,y:t.clientY},U()},a=()=>{t.removeEventListener(`pointermove`,r),t.removeEventListener(`pointerup`,a),t.removeEventListener(`pointercancel`,a),t.style.cursor=`grab`};t.addEventListener(`pointermove`,r),t.addEventListener(`pointerup`,a),t.addEventListener(`pointercancel`,a)}var q=0;function Ce(){if(!q){let e=document.createElement(`canvas`).getContext(`webgl`);q=e?e.getParameter(e.MAX_TEXTURE_SIZE):4096}return q}function we(){let{width:e,height:t}=H(),n=Math.max(e,t,1);return Ce()/2/(devicePixelRatio*n)}function J(e){let t=Burgs.getPreview(e).preview;if(!t){i(`burgPreviewSection`).style.display=`none`;return}i(`burgPreviewSection`).style.display=`block`;let n=i(`burgPreviewObject`);n.innerHTML=``;let r=document.createElement(`iframe`);if(r.style.position=`absolute`,r.style.border=`none`,r.style.pointerEvents=`none`,r.setAttribute(`sandbox`,`allow-scripts allow-same-origin`),r.src=t,n.insertBefore(r,null),T=t.includes(`watabou.github.io`),T){let e=Math.max(1,Math.min(4,we()));C=e,r.style.width=`${e*100}%`,r.style.height=`${e*100}%`,S=Math.min(32,e*2.5)}else C=1,S=32;G()}function Te(){let e=E(),t=pack.burgs[e],n=Burgs.getPreview(t).link;n&&u(n)}function Ee(){let e=E(),t=pack.burgs[e];prompt(`Укажите свою ссылку на карту города. Это может быть ссылка на генератор или просто изображение. Оставьте пустым для карты по умолчанию`,{default:Burgs.getPreview(t).link||``,required:!1},n=>{try{Burgs.setLink(e,String(n??``))}catch(e){f(e.message,!1,`error`)}J(t)})}function Y(){let e=E(),t=pack.burgs[e];p.EmblemsEditor.open(`burg`,`burgCOA${e}`,t)}function De(){let e=E(),t=pack.burgs[e];zoomTo(t.x,t.y,8,2e3)}var X=!1;function Z(){i(`burgRelocate`).classList.toggle(`pressed`),i(`burgRelocate`).classList.contains(`pressed`)?(r(`#viewbox`).style(`cursor`,`crosshair`).on(`click`,Oe),f(`Кликните по карте, чтобы переместить город. Shift — непрерывное перемещение`,!0),d.isOn(`cells`)||(d.show(`cells`),X=!0)):(oe(),le(),X&&=(d.hide(`cells`),!1))}function Oe(e){let[n,r]=t(e,this);B(()=>Burgs.move(E(),n,r))&&(d.draw(`burgIcons`,`labels`),e.shiftKey===!1&&Z())}function Q(){p.NotesEditor.open({type:`burg`,id:E()})}function ke(){let e=E();p.TemperatureGraph.open(e)}function Ae(){let e=E();p.ProductionOverview.open(e)}function je(){let e=E();pack.burgs[e].capital?(alertMessage.innerHTML=`You cannot remove the capital. You must change the state capital first`,$(`#alert`).dialog({resizable:!1,title:`Удалить город`,buttons:{ОК:function(){$(this).dialog(`close`)}}})):pack.markets?.some(t=>t.centerBurgId===e)?(alertMessage.innerHTML=`You cannot remove a market center burg. Please remove the market first`,$(`#alert`).dialog({resizable:!1,title:`Удалить город`,buttons:{ОК:function(){$(this).dialog(`close`)}}})):h({title:`Удалить город`,message:`Вы уверены, что хотите удалить город? <br>Это действие необратимо`,confirm:`Удалить`,onConfirm:()=>{Burgs.remove(e),ie(`burg`,e),d.draw(`burgIcons`,`labels`),$(`#burgEditor`).dialog(`close`)}})}function Me(){p.BurgGroupEditor.open()}function Ne(){clearTimeout(w),i(`burgRelocate`).classList.contains(`pressed`)&&Z(),y=null,$(`#burgEditor`).dialog(`destroy`),i(`burgEditor`).remove()}function Pe(e){if(!e)return``;let t=``,n=Object.entries(e).sort(([,e],[,t])=>t-e);for(let[e,r]of n){let n=Goods.get(+e);if(!n)continue;let{name:i,unit:a,icon:o}=n,s=r===1?a:`${a}s`;t+=`<span data-tip="${i}: ${r} ${s} per day">
      <svg class="resIcon" width="1em" height="1em"><use href="${ae.href(o)}"${ne()}></use></svg>
      <span style="margin: 0 0.2em 0 -0.2em">${r}</span>
    </span>`}return t}var Fe={open:de};export{Fe as BurgEditor};