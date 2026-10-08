import{F as e,Lt as t,Nn as n,On as r,P as i,a,ct as o,o as s,p as c,y as l}from"./utils-BXzQ0Tym.js";import{G as u,t as d}from"./layers-Cld3ceTu.js";import{t as f}from"./mean-4Awewi9R.js";import{i as p}from"./tooltips-P6FAPAdd.js";import{t as m}from"./controllers-7rYzYhQt.js";import{r as h}from"./features-generator-CBsk9ImT.js";import{t as g}from"./styles-DJ4WXK4Q.js";import{i as _,n as v,o as y}from"./dialog-helpers-CJ5pbzaw.js";function b(e){for(var t=-1,n=e.length,r=e[n-1],i,a,o=r[0],s=r[1],c=0;++t<n;)i=o,a=s,r=e[t],o=r[0],s=r[1],i-=o,a-=s,c+=Math.hypot(i,a);return c}var x;function S(e){customization||(v(`.stable`),d.hide(`cells`),C(),x=r(e),T(),M(),$(`#lakeEditor`).dialog({title:`Изменить озеро`,resizable:!1,position:{my:`center top+20`,at:`top`,of:`svg`,collision:`fit`},close:z}))}function C(){_(`lakeEditor`);let e=`<div id="lakeEditor" class="dialog">
    <div id="lakeBody" style="padding-bottom: 0.3em">
      <div>
        <div class="label" style="width: 4.8em">Name:</div>
        <span id="lakeNameCulture" data-tip="Создать культурно-специфичное название озера" class="icon-book pointer"></span>
        <span id="lakeNameRandom" data-tip="Создать случайное название озера" class="icon-globe pointer"></span>
        <input id="lakeName" data-tip="Введите название озера" autocorrect="off" spellcheck="false" />
        <span id="lakeNameSpeak" data-tip="Озвучить название. Голос и язык меняются в настройках" class="speaker">🔊</span>
      </div>
      <div data-tip="Подтип озера. Генераторы его читают: к пересохшим, замёрзшим и лавовым озёрам причалить нельзя">
        <div class="label" style="width: 7em">Subtype:</div>
        <select id="lakeSubtype" data-tip="Выберите подтип озера">
          ${h.map(e=>`<option value="${e}">${e}</option>`).join(``)}
        </select>
      </div>
      <div data-tip="Группа отрисовки: svg-группа, в которой рисуется озеро. На генерацию не влияет">
        <div class="label" style="width: 4.8em">Group:</div>
        <span id="lakeGroupRemove" data-tip="Удалить группу" class="icon-trash-empty pointer"></span>
        <span id="lakeGroupAdd" data-tip="Создать новую группу для озера" class="icon-plus pointer"></span>
        <select id="lakeGroup" data-tip="Выберите группу отрисовки озера"></select>
        <input id="lakeGroupName" placeholder="название группы" data-tip="Укажите название новой группы" style="display: none" />
        <span id="lakeEditStyle" data-tip="Изменить стиль группы озёр в редакторе стиля" class="icon-brush pointer"></span>
      </div>
      <div data-tip="Площадь озера в выбранных единицах">
        <div class="label">Area:</div>
        <input id="lakeArea" disabled />
      </div>
      <div data-tip="Длина берега озера в выбранных единицах">
        <div class="label">Длина берега:</div>
        <input id="lakeShoreLength" disabled />
      </div>
      <div data-tip="Высота озера в выбранных единицах">
        <div class="label">Elevation:</div>
        <input id="lakeElevation" disabled />
      </div>
      <div data-tip="Средняя глубина озера в выбранных единицах">
        <div class="label">Средняя глубина:</div>
        <input id="lakeAverageDepth" disabled />
      </div>
      <div data-tip="Максимальная глубина озера в выбранных единицах">
        <div class="label">Макс. глубина:</div>
        <input id="lakeMaxDepth" disabled />
      </div>
      <div data-tip="Приток воды в озеро. Если приток больше испарения и есть сток, вода пресная; при очень малом притоке озеро пересыхает">
        <div class="label">Supply:</div>
        <input id="lakeFlux" disabled />
      </div>
      <div data-tip="Испарение с поверхности озера. Если испарение больше притока, вода в озере солёная; при большой разнице озеро пересыхает">
        <div class="label">Evaporation:</div>
        <input id="lakeEvaporation" disabled />
      </div>
      <div data-tip="Втекающих в озеро рек">
        <div class="label">Inlets:</div>
        <input id="lakeInlets" disabled />
      </div>
      <div data-tip="Вытекающая из озера река">
        <div class="label">Outlet:</div>
        <input id="lakeOutlet" disabled />
      </div>
    </div>
    <div id="lakeBottom">
      ${y(`lakeLegend`,`this lake`)}
    </div>
  </div>`;i(`dialogs`).insertAdjacentHTML(`beforeend`,e),i(`lakeName`).addEventListener(`input`,E),i(`lakeNameSpeak`).addEventListener(`click`,()=>o(i(`lakeName`).value)),i(`lakeNameCulture`).addEventListener(`click`,D),i(`lakeNameRandom`).addEventListener(`click`,O),i(`lakeSubtype`).addEventListener(`change`,k),i(`lakeGroup`).addEventListener(`change`,N),i(`lakeGroupAdd`).addEventListener(`click`,P),i(`lakeGroupName`).addEventListener(`change`,F),i(`lakeGroupRemove`).addEventListener(`click`,I),i(`lakeEditStyle`).addEventListener(`click`,L),i(`lakeLegend`).addEventListener(`click`,R)}function w(){let e=+x.attr(`data-f`);return pack.features.find(t=>t.i===e)}function T(){let{cells:e,vertices:t,rivers:r}=pack,o=w();i(`lakeName`).value=o.name,i(`lakeSubtype`).value=o.subtype||`freshwater`,i(`lakeArea`).value=`${l(a(o.area))} ${s()}`;let u=b(o.vertices.map(e=>t.p[e]));i(`lakeShoreLength`).value=`${l(u*options.map.units.distance.scale)} ${options.map.units.distance.unit}`;let d=Array.from(e.i.filter(t=>e.f[t]===o.i)).map(t=>e.h[t]);i(`lakeElevation`).value=c(o.height),i(`lakeAverageDepth`).value=c(f(d)??0,!0),i(`lakeMaxDepth`).value=c(n(d)??0,!0),i(`lakeFlux`).value=String(o.flux),i(`lakeEvaporation`).value=String(o.evaporation);let p=o.inlets?.map(e=>r.find(t=>t.i===e)?.name),m=o.outlet?r.find(e=>e.i===o.outlet)?.name:`no`,h=i(`lakeInlets`);h.value=p?String(p.length):`no`,h.title=p?p.join(`, `):``,i(`lakeOutlet`).value=m??`no`}function E(){w().name=this.value}function D(){let e=w();e.name=i(`lakeName`).value=Features.getName(e)}function O(){let e=w();e.name=i(`lakeName`).value=Names.getBase(t(Names.nameBases.length-1))}function k(){Features.setSubtype(w().i,this.value)}var A=e=>e in g.defaults.lakes.groups;function j(e,t){for(let n of e){if(!n.hasAttribute(`data-f`))continue;let e=pack.features[+(n.getAttribute(`data-f`)||0)];e&&(e.group=t)}}function M(){let e=w().group,t=i(`lakeGroup`);t.options.length=0,r(`#lakes`).selectAll(`g`).each(function(){t.options.add(new Option(this.id,this.id,!1,this.id===e))})}function N(){i(this.value).appendChild(x.node()),j([x.node()],this.value),u(d.get(`lakes`))}function P(){let e=i(`lakeGroupName`),t=i(`lakeGroup`);e.style.display===`none`?(e.style.display=`inline-block`,e.focus(),t.style.display=`none`):(e.style.display=`none`,t.style.display=`inline-block`)}function F(){if(!this.value){p(`Укажите корректное название группы`);return}let t=this.value.toLowerCase().replace(/ /g,`_`).replace(/[^\w\s]/gi,``);if(e(t)){p(`Элемент с таким id уже есть. Уникальное название обязательно`,!1,`error`);return}if(Number.isFinite(+t.charAt(0))){p(`Название группы должно начинаться с буквы`,!1,`error`);return}let n=x.node().parentNode,r=styles.lakes.groups[n.id]||styles.lakes.groups.freshwater;if(styles.lakes.groups[t]??=structuredClone(r),!A(n.id)&&n.childElementCount===1){i(`lakeGroup`).selectedOptions[0].remove(),i(`lakeGroup`).options.add(new Option(t,t,!1,!0)),n.id!==t&&delete styles.lakes.groups[n.id],n.id=t,n.dataset.group=t,j(Array.from(n.children),t),u(d.get(`lakes`)),P(),i(`lakeGroupName`).value=``;return}let a=x.node().parentNode.cloneNode(!1);i(`lakes`).appendChild(a),a.id=t,a.dataset.group=t,i(`lakeGroup`).options.add(new Option(t,t,!1,!0)),i(t).appendChild(x.node()),j([x.node()],t),u(d.get(`lakes`)),P(),i(`lakeGroupName`).value=``}function I(){let e=x.node().parentNode.id;if(A(e)){p(`Это одна из групп по умолчанию, её нельзя удалить`,!1,`error`);return}let t=x.node().parentNode.querySelectorAll(`use[data-f]`).length;alertMessage.innerHTML=`Are you sure you want to remove the group? All lakes of the group (${t}) will be turned into Freshwater`,$(`#alert`).dialog({resizable:!1,title:`Удалить группу озёр`,width:`26em`,buttons:{Удалить:function(){$(this).dialog(`close`);let t=i(`freshwater`),n=i(e);for(j(Array.from(n.children),`freshwater`);n.childNodes.length;)t.appendChild(n.childNodes[0]);n.remove(),u(d.get(`lakes`)),delete styles.lakes.groups[e],i(`lakeGroup`).selectedOptions[0].remove(),i(`lakeGroup`).value=`freshwater`},Отмена:function(){$(this).dialog(`close`)}}})}function L(){let e=x.node().parentNode.id;m.StyleEditor.open(`lakes`,e)}function R(){m.NotesEditor.open({type:`feature`,id:w().i})}function z(){_(`lakeEditor`),x=null}var B={open:S};export{B as LakesEditor};