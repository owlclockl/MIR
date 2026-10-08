import{F as e,L as t,Lt as n,On as r,P as i,ct as a,nr as o,rt as s}from"./utils-BXzQ0Tym.js";import{E as c,T as l,t as u}from"./layers-Cld3ceTu.js";import{t as d}from"./drag-DdGpYDDb.js";import{i as f,t as p}from"./tooltips-P6FAPAdd.js";import{t as m}from"./controllers-7rYzYhQt.js";import{i as h,n as g,o as _}from"./dialog-helpers-CJ5pbzaw.js";var v,y=!1;function b(t){if(customization||e(`riverEditor`)&&t===v.attr(`id`))return;g(`.stable`),u.show(`rivers`),y=!u.isOn(`cells`),u.show(`cells`),c(Number(t.slice(5))),v=r(`#${t}`).on(`click`,M),f(`Тяните опорные точки, чтобы менять русло реки. Клик по точке удаляет её. Клик по реке добавляет точку. Для серьёзных изменений лучше создать новую реку`,!0),r(`#debug`).append(`g`).attr(`id`,`controlCells`),r(`#debug`).append(`g`).attr(`id`,`controlPoints`),x(),i(`riverEditor`).dataset.entity=`river:${Number(t.slice(5))}`,T();let{cells:n,points:a}=w();O(Rivers.getRiverPoints(n,a??null)),k(n),$(`#riverEditor`).dialog({title:`Редактирование реки`,resizable:!1,position:{my:`left top`,at:`left+10 top+10`,of:`#map`},close:W})}function x(){h(`riverEditor`);let e=`<div id="riverEditor" class="dialog">
    <div id="riverBody" style="padding-bottom: 0.3em">
      <div>
        <div class="label" style="width: 4.8em">Name:</div>
        <span id="riverNameCulture" data-tip="Создать культурно-специфичное название реки" class="icon-book pointer"></span>
        <span id="riverNameRandom" data-tip="Создать случайное название реки" class="icon-globe pointer"></span>
        <input id="riverName" data-tip="Введите название реки" autocorrect="off" spellcheck="false" />
        <span id="riverNameSpeak" data-tip="Озвучить название. Голос и язык меняются в настройках" class="speaker">🔊</span>
      </div>
      <div data-tip="Введите тип реки (например: рукав, ручей, река, струя)">
        <div class="label">Type:</div>
        <input id="riverType" autocorrect="off" spellcheck="false" />
      </div>
      <div data-tip="Выберите реку-родителя">
        <div class="label">Mainstem:</div>
        <select id="riverMainstem"></select>
      </div>
      <div data-tip="Дренажный бассейн реки (водосбор)">
        <div class="label">Basin:</div>
        <input id="riverBasin" disabled />
      </div>
      <div data-tip="Расход воды реки (сила потока)">
        <div class="label">Discharge:</div>
        <input id="riverDischarge" disabled />
      </div>
      <div data-tip="Длина реки в выбранных единицах">
        <div class="label">Length:</div>
        <input id="riverLength" disabled />
      </div>
      <div data-tip="Ширина устья в выбранных единицах">
        <div class="label">Ширина устья:</div>
        <input id="riverWidth" disabled />
      </div>
      <div data-tip="Дополнительная ширина истока реки. По умолчанию 0">
        <div class="label">Ширина истока:</div>
        <input id="riverSourceWidth" type="number" min="0" max="3" step=".01" />
      </div>
      <div data-tip="Множитель ширины реки. По умолчанию 1">
        <div class="label">Множитель ширины:</div>
        <input id="riverWidthFactor" type="number" min=".1" max="4" step=".1" />
      </div>
    </div>
    <div id="riverBottom">
      <button id="riverCreateSelectingCells" data-tip="Создать новую реку, выбирая её ячейки" class="icon-map-pin"></button>
      <button id="riverEditStyle" data-tip="Изменить стиль всех рек в редакторе стиля" class="icon-brush"></button>
      <button id="riverElevationProfile" data-tip="Профиль высот реки" class="icon-chart-area"></button>
      ${_(`riverLegend`,`this river`)}
      <button id="riverRemove" data-tip="Удалить реку" data-shortcut="Delete" class="icon-trash fastDelete"></button>
    </div>
  </div>`;i(`dialogs`).insertAdjacentHTML(`beforeend`,e),i(`riverCreateSelectingCells`).addEventListener(`click`,S),i(`riverEditStyle`).addEventListener(`click`,C),i(`riverElevationProfile`).addEventListener(`click`,V),i(`riverLegend`).addEventListener(`click`,H),i(`riverRemove`).addEventListener(`click`,U),i(`riverName`).addEventListener(`input`,P),i(`riverNameSpeak`).addEventListener(`click`,()=>a(i(`riverName`).value)),i(`riverType`).addEventListener(`input`,F),i(`riverNameCulture`).addEventListener(`click`,I),i(`riverNameRandom`).addEventListener(`click`,L),i(`riverMainstem`).addEventListener(`change`,R),i(`riverSourceWidth`).addEventListener(`input`,z),i(`riverWidthFactor`).addEventListener(`input`,B)}function S(){m.RiverCreator.open()}function C(){m.StyleEditor.open(`rivers`)}function w(){let e=+v.attr(`id`).slice(5);return pack.rivers.find(t=>t.i===e)}function T(){let e=w();i(`riverName`).value=e.name,i(`riverType`).value=e.type;let t=i(`riverMainstem`);t.options.length=0;let n=e.parent||e.i;pack.rivers.slice().sort((e,t)=>e.name>t.name?1:-1).forEach(e=>{let r=new Option(e.name,String(e.i),!1,e.i===n);t.options.add(r)}),i(`riverBasin`).value=pack.rivers.find(t=>t.i===e.basin).name,i(`riverDischarge`).value=`${e.discharge} m³/s`,i(`riverSourceWidth`).value=String(e.sourceWidth),i(`riverWidthFactor`).value=String(e.widthFactor),E(e),Rivers.updateWidth(e),D(e)}function E(e){e.length=o(v.node().getTotalLength()/2,2);let t=`${o(e.length*options.map.units.distance.scale)} ${options.map.units.distance.unit}`;i(`riverLength`).value=t}function D(e){let t=`${o(e.width*options.map.units.distance.scale,3)} ${options.map.units.distance.unit}`;i(`riverWidth`).value=t}function O(e){r(`#controlPoints`).selectAll(`circle`).data(e).join(`circle`).attr(`cx`,e=>e[0]).attr(`cy`,e=>e[1]).attr(`r`,.6).call(d().on(`start`,A)).on(`click`,N)}function k(e){let t=[...new Set(e)].filter(e=>pack.cells.i[e]);r(`#controlCells`).selectAll(`polygon`).data(t).join(`polygon`).attr(`points`,e=>String(Pack.getPolygon(e)))}function A(e){let{r:t,fl:n}=pack.cells,r=w(),{x:i,y:a}=e,s=Pack.findCell(i,a),c=null;e.on(`drag`,function(e){let{x:t,y:n}=e,i=Pack.findCell(t,n);c=s===i?null:i,this.setAttribute(`cx`,t),this.setAttribute(`cy`,n),this.__data__=[o(t,1),o(n,1)],j(),k(r.cells)}),e.on(`end`,()=>{if(c&&!t[c]){t[s]=0,t[c]=r.i;let e=n[s];n[s]=n[c],n[c]=e,j()}})}function j(){let t=w();t.points=r(`#controlPoints`).selectAll(`*`).data(),t.cells=t.points.map(([e,t])=>Pack.findCell(e,t)),l(t),E(t),u.draw(`labels`),e(`elevationProfile`)&&V()}function M(e){let[n,i]=t(e,this),a=[o(n,1),o(i,1)],c=w();c.points||=r(`#controlPoints`).selectAll(`*`).data();let l=s(c.points,a,2);c.points.splice(l,0,a),O(c.points),j()}function N(){this.remove(),j();let{cells:e}=w();k(e)}function P(){this.value.trim()&&Rivers.rename(w().i,this.value)}function F(){this.value.trim()&&Rivers.setType(w().i,this.value)}function I(){let e=w(),t=Rivers.getName(e.mouth);i(`riverName`).value=t,Rivers.rename(e.i,t)}function L(){let e=w();if(!e)return;let t=Names.getBase(n(Names.nameBases.length-1));i(`riverName`).value=t,Rivers.rename(e.i,t)}function R(){let e=w();try{Rivers.setParent(e.i,+this.value)}catch(t){f(t.message,!1,`error`),this.value=String(e.parent||e.i);return}i(`riverBasin`).value=pack.rivers.find(t=>t.i===e.basin).name}function z(){let e=w();Rivers.setWidth(e.i,Math.max(0,+this.value||0),e.widthFactor),D(e),j()}function B(){let e=w();Rivers.setWidth(e.i,e.sourceWidth??0,Math.max(0,+this.value||0)),D(e),j()}function V(){let e=r(`#controlPoints`).selectAll(`*`).data().map(([e,t])=>Pack.findCell(e,t)),t=o(w().length*options.map.units.distance.scale);m.ElevationProfile.open(e,t,!0)}function H(){m.NotesEditor.open({type:`river`,id:w().i})}function U(){alertMessage.innerHTML=`Are you sure you want to remove the river and all its tributaries`,$(`#alert`).dialog({resizable:!1,width:`22em`,title:`Удалить реку и притоки`,buttons:{Удалить:function(){$(this).dialog(`close`);let e=+v.attr(`id`).slice(5);Rivers.remove(e),$(`#riverEditor`).dialog(`close`),u.draw(`rivers`,`labels`)},Отмена:function(){$(this).dialog(`close`)}}})}function W(){r(`#controlPoints`).remove(),r(`#controlCells`).remove(),v.on(`click`,null),c(null),p(),y&&u.hide(`cells`),y=!1,h(`riverEditor`),v=null}var G={open:b};export{G as RiverEditor};