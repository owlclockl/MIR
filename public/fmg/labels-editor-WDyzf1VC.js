import{Gt as e,Jn as t,L as n,On as r,P as i,ct as a,nr as o}from"./utils-BXzQ0Tym.js";import{d as s,l as c,s as l,t as u}from"./layers-Cld3ceTu.js";import{t as d}from"./drag-DdGpYDDb.js";import{t as f}from"./natural-kerJ22Hb.js";import{i as p,r as m}from"./tooltips-P6FAPAdd.js";import{i as h}from"./viewport-C0deAIKO.js";import{t as g}from"./controllers-7rYzYhQt.js";import{i as _,n as v,o as y,r as b}from"./dialog-helpers-CJ5pbzaw.js";import{r as x}from"./notes-CuIh6heg.js";import{t as ee}from"./viewbox-events-BWk3LUVh.js";import"./index-C_h8P6M7.js";import{t as te}from"./label-arc-DsUUXcs1.js";var S=``,C;function w(e,t){if(customization)return;v(`.stable`),u.show(`labels`);let n=document.querySelector(`#labels text[data-label-type='${e}'][data-id='${t}']`);if(!n)return;let i=l(e,t);i&&(C={...i},Q(n.id),r(`#viewbox`).on(`touchmove mousemove`,M),T(),$(`#labelEditor`).dialog({title:`Изменить надпись`,resizable:!1,width:`fit-content`,position:{my:`center top+10`,at:`bottom`,of:n,collision:`fit`},close:he}),N(),E(C.group),k(),D())}function T(){_(`labelEditor`);let e=`<div id="labelEditor" class="dialog">
      <button id="labelGroupShow" data-tip="Показать выбор группы" class="icon-tags"></button>
      <div id="labelGroupSection" style="display: none">
        <button id="labelGroupHide" data-tip="Скрыть выбор группы" class="icon-tags"></button>
        <select id="labelGroupSelect" data-tip="Выберите группу для этой надписи" style="width: 10em"></select>
        <button
          id="labelGroupsConfigure"
          data-tip="Откройте настройку групп надписей, чтобы создавать, править и менять порядок групп"
          class="icon-cog"
        ></button>
      </div>
      <button id="labelTextShow" data-tip="Показать раздел текста надписи" class="icon-pencil"></button>
      <div id="labelTextSection" style="display: none">
        <button id="labelTextHide" data-tip="Скрыть текст надписи" class="icon-pencil"></button>
        <input
          id="labelText"
          data-tip='Type to change the label. Enter "|" to move to a new line'
          style="width: 12em"
        />
        <span id="labelTextSpeak" data-tip="Озвучить название. Голос и язык меняются в настройках" class="speaker">🔊</span>
        <span id="labelTextRandom" data-tip="Создать случайное название" class="icon-shuffle pointer"></span>
      </div>
      <button id="labelEditStyle" data-tip="Изменить стиль группы надписей в редакторе стиля" class="icon-brush"></button>
      <button id="labelPathToggle"></button>
      <button id="labelSizeShow" data-tip="Показать раздел размера шрифта" class="icon-text-height"></button>
      <div id="labelSizeSection" style="display: none">
        <button id="labelSizeHide" data-tip="Скрыть размер шрифта" class="icon-text-height"></button>
        <span data-tip="Относительный размер этой надписи">Size:</span>
        <input
          id="labelRelativeSize"
          data-tip="Относительный размер этой надписи (% от стандартного для группы)"
          type="number"
          min="30"
          max="300"
          step="1"
          style="width: 4.5em"
        />
      </div>
      <button id="labelOffsetShow" data-tip="Показать раздел смещения надписи" class="icon-sliders"></button>
      <div id="labelOffsetSection" style="display: none">
        <button id="labelOffsetHide" data-tip="Скрыть смещение надписи" class="icon-sliders"></button>
        <span data-tip="Начальное смещение этой надписи">Offset:</span>
        <input
          id="labelStartOffset"
          data-tip="Начальное смещение этой надписи (% по пути)"
          type="range"
          min="20"
          max="80"
          style="width: 8em"
        />
        <input
          id="labelStartOffsetValue"
          type="number"
          min="20"
          max="80"
          step="1"
          style="width: 3.5em"
          data-tip="Задать начальное смещение числом"
        />
      </div>
      <button id="labelLetterSpacingShow" data-tip="Показать раздел межбуквенного расстояния" class="icon-text-width"></button>
      <div id="labelLetterSpacingSection" style="display: none">
        <button
          id="labelLetterSpacingHide"
          data-tip="Скрыть межбуквенный интервал"
          class="icon-text-width"
        ></button>
        <slider-input
          id="labelLetterSpacingSize"
          style="display: inline-block"
          data-tip="Межбуквенное расстояние для этой надписи"
          min="0"
          max="20"
          step=".01"
          value="0"
        ></slider-input>
      </div>
      <button id="labelVisibility"></button>
      ${y(`labelLegend`,`this label`)}
      <button id="labelReset" data-tip="Вернуть надпись по умолчанию" class="icon-arrows-cw"></button>
      <button
        id="labelRemoveSingle"
        data-tip="Удалить надпись"
        data-shortcut="Delete"
        class="icon-trash fastDelete"
      ></button>
    </div>`;i(`dialogs`).insertAdjacentHTML(`beforeend`,e),i(`labelGroupShow`).addEventListener(`click`,B),i(`labelGroupHide`).addEventListener(`click`,V),i(`labelGroupSelect`).addEventListener(`change`,H),i(`labelGroupsConfigure`).addEventListener(`click`,()=>void g.LabelGroupsConfigurator.open()),i(`labelTextShow`).addEventListener(`click`,U),i(`labelTextHide`).addEventListener(`click`,W),i(`labelText`).addEventListener(`input`,G),i(`labelTextSpeak`).addEventListener(`click`,()=>a(i(`labelText`).value)),i(`labelTextRandom`).addEventListener(`click`,q),i(`labelEditStyle`).addEventListener(`click`,ne),i(`labelSizeShow`).addEventListener(`click`,J),i(`labelSizeHide`).addEventListener(`click`,Y),i(`labelOffsetShow`).addEventListener(`click`,X),i(`labelOffsetHide`).addEventListener(`click`,re),i(`labelStartOffset`).addEventListener(`input`,oe),i(`labelStartOffsetValue`).addEventListener(`input`,se),i(`labelRelativeSize`).addEventListener(`input`,ce),i(`labelLetterSpacingShow`).addEventListener(`click`,ie),i(`labelLetterSpacingHide`).addEventListener(`click`,ae),i(`labelLetterSpacingSize`).addEventListener(`input`,le),i(`labelPathToggle`).addEventListener(`click`,ue),i(`labelVisibility`).addEventListener(`click`,de),i(`labelLegend`).addEventListener(`click`,fe),i(`labelReset`).addEventListener(`click`,me),i(`labelRemoveSingle`).addEventListener(`click`,pe)}function E(e){S=e,V();let t=i(`labelGroupSelect`);t.options.length=0;for(let n of options.map.labels.groups)t.options.add(new Option(n.name,n.name,!1,n.name===e))}function D(){let e=O(),t=!i(`labelEditor`).classList.contains(`section-open`);i(`labelOffsetShow`).style.display=t&&e?`inline-block`:`none`,i(`labelRemoveSingle`).style.display=t&&C.type===`added`?`inline-block`:`none`,i(`labelReset`).style.display=t&&Labels.hasOverride(C.type,C.entityId)?`inline-block`:`none`;let n=i(`labelPathToggle`);n.className=e?`icon-resize-horizontal`:`icon-bezier-curve`,n.dataset.tip=e?`Убрать путь надписи, вывести надпись прямо`:`Изогнуть надпись по пути`;let r=i(`labelVisibility`);r.className=C.hidden?`icon-eye-off`:`icon-eye`,r.dataset.tip=C.hidden?`Показать надпись`:`Скрыть надпись. Включить её можно позже в обзоре надписей`}function O(){return!!C.pathPoints?.length}function k(){let e=C.startOffset||50;i(`labelText`).value=C.text||``,i(`labelStartOffset`).value=String(e),i(`labelStartOffsetValue`).value=String(e),i(`labelRelativeSize`).value=String(C.fontSize??100),i(`labelLetterSpacingSize`).value=String(C.letterSpacing??0)}function A(){i(`labelEditor`).classList.add(`section-open`),document.querySelectorAll(`#labelEditor > button`).forEach(e=>{e.style.display=`none`})}function j(){i(`labelEditor`).classList.remove(`section-open`),document.querySelectorAll(`#labelEditor > button`).forEach(e=>{e.style.display=`inline-block`}),D()}function M(e){m();let t=e.target,n=t.parentNode;t.closest(`#${C.id}`)?p(`Тяните, чтобы переместить надпись`):n?.id===`controlPoints`&&(t.tagName===`circle`&&p(`Тяните, чтобы переместить; клик удаляет опорную точку`),t.tagName===`path`&&p(`Кликните, чтобы добавить опорную точку`))}function N(){if(r(`#debug`).select(`#controlPoints`).remove(),!O())return;let e=C.dx||C.dy?`translate(${C.dx||0}, ${C.dy||0})`:null;r(`#debug`).append(`g`).attr(`id`,`controlPoints`).attr(`transform`,e).append(`path`).attr(`d`,s(C)).style(`stroke-width`,Math.max(2.2/h.scale,.2)).on(`click`,R),C.pathPoints?.forEach(P)}function P(e){r(`#debug`).select(`#controlPoints`).append(`circle`).attr(`cx`,e[0]).attr(`cy`,e[1]).attr(`r`,Math.max(3/h.scale,.35)).style(`stroke-width`,Math.max(1/h.scale,.15)).call(d().on(`drag`,F)).on(`click`,L)}function F(e){this.setAttribute(`cx`,e.x),this.setAttribute(`cy`,e.y),I()}function I(){let n=[];r(`#debug > #controlPoints`).selectAll(`circle`).each(function(){let e=o(+this.getAttribute(`cx`),2),t=o(+this.getAttribute(`cy`),2);n.push([e,t])});let i=t(e().curve(f)(n)||``);r(`#debug`).select(`#controlPoints > path`).attr(`d`,i),C.pathPoints=n,Z(),n.length||N()}function L(){this.remove(),I()}function R(e){let t=n(e,this),i=[];r(`#debug #controlPoints`).selectAll(`circle`).each(function(){let e=+this.getAttribute(`cx`),n=+this.getAttribute(`cy`);i.push((t[0]-e)**2+(t[1]-n)**2)});let a=i.length;if(i.length>1){let e=i.slice(0).sort((e,t)=>e-t),t=i.indexOf(e[0]),n=i.indexOf(e[1]);a=t<=n?t+1:n+1}let o=`:nth-child(${a+2})`;r(`#debug`).select(`#controlPoints`).insert(`circle`,o).attr(`cx`,t[0]).attr(`cy`,t[1]).attr(`r`,2.5).attr(`stroke-width`,.8).call(d().on(`drag`,F)).on(`click`,L),I()}function z(e){let t=(C.dx||0)-e.x,n=(C.dy||0)-e.y;e.on(`drag`,e=>{C.dx=o(t+e.x,2),C.dy=o(n+e.y,2);let i=`translate(${C.dx}, ${C.dy})`;this.setAttribute(`transform`,i),r(`#debug #controlPoints`).attr(`transform`,i)}),e.on(`end`,()=>Z())}function B(){A(),i(`labelGroupSection`).style.display=`inline-block`}function V(){j(),i(`labelGroupSection`).style.display=`none`}function H(){let e=this.value,t=options.map.labels.groups.find(t=>t.name===e)?.type,n=()=>{S=e,C.group=e,Z()};if(t===C.type)return void n();b({title:`Назначить группу надписей другого типа`,message:`Assign this ${C.type} label to the ${t} group "${e}"? It's better to avoid such cross-type assignment.`,confirm:`Назначить`,onConfirm:n,onCancel:()=>{this.value=C.group}})}function U(){A(),i(`labelTextSection`).style.display=`inline-block`}function W(){j(),i(`labelTextSection`).style.display=`none`}function G(){let e=i(`labelText`).value;C.text=e,Z(),C.type===`state`&&p(`Настоящее название государства меняется в редакторе государств, а не только надпись`,!1,`warn`),C.type===`province`&&p(`Настоящее название провинции меняется в редакторе провинций, а не только надпись`,!1,`warn`)}var K={burg:e=>Names.getCulture(pack.burgs[e.entityId].culture??0),state:e=>{let t=pack.states[e.entityId].culture;return Names.getState(Names.getCulture(t,4,7,``),t)},province:e=>{let t=pack.provinces[e.entityId];return Names.getState(t.name,pack.cells.culture[t.center])},added:e=>{let t=Pack.findCell(...e.anchor);return t?Names.getCulture(pack.cells.culture[t]):``},river:e=>{let t=Pack.findCell(...e.anchor);return t?Rivers.getName(t):``},route:e=>{let t=pack.routes.find(t=>t.i===e.entityId)?.points??[];return Routes.generateName({group:e.group,points:t})||`Unnamed route segment`}};function q(){i(`labelText`).value=K[C.type](C),G()}function ne(){g.StyleEditor.open(`labels`,C.group)}function J(){A(),i(`labelSizeSection`).style.display=`inline-block`}function Y(){j(),i(`labelSizeSection`).style.display=`none`}function X(){A(),i(`labelOffsetSection`).style.display=`inline-block`}function re(){j(),i(`labelOffsetSection`).style.display=`none`}function ie(){A(),i(`labelLetterSpacingSection`).style.display=`inline-block`}function ae(){j(),i(`labelLetterSpacingSection`).style.display=`none`}function oe(){if(!O())return;let e=this.value;i(`labelStartOffsetValue`).value=e,C.startOffset=+e,Z(),p(`Label offset: ${e}%`)}function se(){if(!O())return;let e=Math.min(80,Math.max(20,+this.value));i(`labelStartOffset`).value=String(e),this.value=String(e),C.startOffset=e,Z(),p(`Label offset: ${e}%`)}function ce(){C.fontSize=+this.value,Z(),p(`Label relative size: ${this.value}%`)}function le(){C.letterSpacing=+this.value,Z(),p(`Label letter-spacing size: ${this.value}px`)}function ue(){C.pathPoints=O()?[]:te(C),Z(),N()}function de(){C.hidden?delete C.hidden:C.hidden=!0,Z()}function fe(){let e=x.resolveElement(C.id);e&&g.NotesEditor.open(e)}function pe(){alertMessage.innerHTML=`Are you sure you want to remove the label?`,$(`#alert`).dialog({resizable:!1,title:`Удалить надпись`,buttons:{Удалить:function(){$(this).dialog(`close`),C.type===`added`&&(AddedLabels.remove(C.entityId),u.draw(`labels`),$(`#labelEditor`).dialog(`close`))},Отмена:function(){$(this).dialog(`close`)}}})}function Z(){let e=Labels.getEntity(C.type,C.entityId);e&&(e.label=ge(),c(C),Q(C.id),D())}function Q(e){r(`#${e}`).call(d().on(`start`,z)).classed(`draggable`,!0)}function me(){let{type:e,entityId:t}=C;Labels.reset(e,t),u.draw(`labels`),C={...l(e,t)??C},Q(C.id),E(C.group),k(),D(),N()}function he(){r(`#debug`).select(`#controlPoints`).remove(),r(`#${C.id}`).on(`.drag`,null).classed(`draggable`,!1),ee(),$(`#labelEditor`).dialog(`destroy`),i(`labelEditor`).remove()}function ge(){return{text:C.text,group:C.group,dx:C.dx,dy:C.dy,fontSize:C.fontSize,letterSpacing:C.letterSpacing,pathPoints:C.pathPoints??[],startOffset:C.startOffset,hidden:C.hidden}}var _e={open:w,getLastSelectedGroup:()=>S};export{_e as LabelsEditor};