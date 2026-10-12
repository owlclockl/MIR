import{F as e,On as t,P as n,er as r,nr as i}from"./utils-BXzQ0Tym.js";import{I as a,L as o}from"./layers-Cld3ceTu.js";import{t as s}from"./drag-DdGpYDDb.js";import{i as c}from"./emblems-generator-BdUAGZhv.js";import{i as l,t as u}from"./tooltips-P6FAPAdd.js";import{t as d}from"./controllers-7rYzYhQt.js";import{c as f,i as p,n as m,o as h,r as g}from"./dialog-helpers-CJ5pbzaw.js";import{t as _}from"./map-placement-CpECa2ms.js";var v,y;function b(r,i){if(customization)return;m(`.stable`);let a=S(r,i);a&&([v,y]=a,t(v).raise().call(s().on(`start`,w)).classed(`draggable`,!0),e(`notesEditor`)&&d.NotesEditor.open({type:`marker`,id:y.i}),x(),n(`markerEditor`).dataset.entity=`marker:${y.i}`,T(),$(`#markerEditor`).dialog({title:`Редактирование маркера`,resizable:!1,position:{my:`left top`,at:`left+10 top+10`,of:`svg`,collision:`fit`},close:q}))}function x(){p(`markerEditor`);let e=`<div id="markerEditor" class="dialog">
    <div id="markerBody" style="padding-bottom: 0.3em">
      <div data-tip="Название маркера, видно в редакторе заметок и в обзорах">
        <div class="label">Name:</div>
        <input id="markerName" style="width: 10.3em" />
      </div>
      <div data-tip="Тип маркера. Изменения стиля применятся ко всем маркерам того же типа. Оставьте пустым для уникального маркера">
        <div class="label">Type:</div>
        <input id="markerType" style="width: 10.3em" />
      </div>
      <div data-tip="Иконка маркера" style="display: flex; align-items: center">
        <div class="label">Icon:</div>
        <div id="markerIcon" style="font-size: 1.5em; width: 3.7em; display: flex"></div>
        <button id="markerIconSelect" style="width: 5em">select</button>
      </div>
      <div data-tip="Размеры элемента и иконки маркера в пикселях">
        <div class="label">Size:</div>
        <input data-tip="Размер элемента маркера в пикселях" id="markerSize" type="number" min="1" max="500" style="width: 5em" />
        <input data-tip="Размеры иконок маркера в пикселях" id="markerIconSize" type="number" min="1" max="50" step="0.1" style="width: 5em" />
      </div>
      <div data-tip="Смещение иконки маркера по X и Y, проценты. 50 — иконка по центру">
        <div class="label">Сдвиг иконки:</div>
        <input id="markerIconShiftX" type="number" min="0" max="100" step="1" style="width: 5em" />
        <input id="markerIconShiftY" type="number" min="0" max="100" step="1" style="width: 5em" />
      </div>
      <div data-tip="Форма закрепки маркера">
        <div class="label">Форма закрепки:</div>
        <select id="markerPin" style="width: 10.3em">
          <option value="bubble">Пузырь</option>
          <option value="pin">Закрепить</option>
          <option value="square">Квадрат</option>
          <option value="squarish">Почти квадратная</option>
          <option value="diamond">Ромб</option>
          <option value="hex">Шестиугольник</option>
          <option value="hexy">Шестиугольник скруглённый</option>
          <option value="shieldy">Щиток</option>
          <option value="shield">Щит</option>
          <option value="pentagon">Пятиугольник</option>
          <option value="heptagon">Семиугольник</option>
          <option value="circle">Круг</option>
          <option value="no">Нет</option>
        </select>
      </div>
      <div data-tip="Цвета заливки и обводки закрепки">
        <div class="label">Цвета закрепки:</div>
        <input id="markerFill" type="color" style="width: 5em; height: 1.6em" />
        <input id="markerStroke" type="color" style="width: 5em; height: 1.6em" />
      </div>
      <div data-tip="Цвета заливки и обводки иконки: они красят части, которые иконка оставляет бесцветными. Эмодзи сохраняют свои цвета">
        <div class="label">Цвета иконки:</div>
        <input id="markerIconFill" type="color" style="width: 5em; height: 1.6em" />
        <input id="markerIconStroke" type="color" style="width: 5em; height: 1.6em" />
        <i id="markerIconPaintReset" data-tip="Вернуть цвета иконки по умолчанию" class="icon-ccw pointer"></i>
      </div>
    </div>
    <div id="markerBottom">
      ${h(`markerNotes`,`this marker`)}
      <button id="markerRadius" data-tip="Показать маркеры в радиусе от этого" class="icon-dot-circled"></button>
      <button id="markerLock" class="icon-lock-open" onmouseover="showElementLockTip(event)"></button>
      <button id="markerAdd" data-tip="Добавить дополнительный маркер этого типа" class="icon-plus"></button>
      <button id="markerRemove" data-tip="Удалить маркер" data-shortcut="Delete" class="icon-trash fastDelete"></button>
    </div>
  </div>`;n(`dialogs`).insertAdjacentHTML(`beforeend`,e),n(`markerName`).addEventListener(`change`,D),n(`markerType`).addEventListener(`change`,O),n(`markerIconSelect`).addEventListener(`click`,k),n(`markerIconSize`).addEventListener(`input`,A),n(`markerIconShiftX`).addEventListener(`input`,j),n(`markerIconShiftY`).addEventListener(`input`,M),n(`markerSize`).addEventListener(`input`,N),n(`markerPin`).addEventListener(`change`,P),n(`markerFill`).addEventListener(`input`,F),n(`markerStroke`).addEventListener(`input`,I),n(`markerIconFill`).addEventListener(`input`,L),n(`markerIconStroke`).addEventListener(`input`,R),n(`markerIconPaintReset`).addEventListener(`click`,z),n(`markerNotes`).addEventListener(`click`,V),n(`markerRadius`).addEventListener(`click`,H),n(`markerLock`).addEventListener(`click`,U),n(`markerAdd`).addEventListener(`click`,W),n(`markerRemove`).addEventListener(`click`,G)}function S(t,n){let r=n?Number(n.closest(`svg`)?.id.slice(6)):t,i=pack.markers.find(({i:e})=>e===r);if(!i)return null;o(i);let a=e(`marker${r}`);return a||o(null),a?[a,i]:null}function C(){let e=y.type;return e?pack.markers.filter(({type:t})=>t===e):[y]}function w(e){let t=+this.getAttribute(`x`)-e.x,n=+this.getAttribute(`y`)-e.y;e.on(`drag`,function(e){this.setAttribute(`x`,String(t+e.x)),this.setAttribute(`y`,String(n+e.y))}),e.on(`end`,function(e){let{width:o,height:s}=options.map.graph,c=r(e.x+t,0,o),l=r(e.y+n,0,s);this.setAttribute(`x`,String(i(c,2))),this.setAttribute(`y`,String(i(l,2))),Markers.move(y.i,c,l),a()})}function T(){let e=y;E(),n(`markerName`).value=e.name||``,n(`markerType`).value=e.type||``,n(`markerIconSize`).value=String(e.px||12),n(`markerIconShiftX`).value=String(e.dx||50),n(`markerIconShiftY`).value=String(e.dy||50),n(`markerSize`).value=String(e.size||30),n(`markerPin`).value=e.pin||`bubble`,n(`markerFill`).value=e.fill||`#ffffff`,n(`markerStroke`).value=e.stroke||`#000000`,n(`markerLock`).className=e.lock?`icon-lock`:`icon-lock-open`}function E(){let{icon:e,iconFill:t,iconStroke:r}=y,i=c.paint(e),a=e=>e&&/^#[\da-f]{6}$/i.test(e)?e:`#000000`;n(`markerIcon`).innerHTML=c.html(e,{fill:t,stroke:r}),n(`markerIconFill`).value=a(t??i.fill),n(`markerIconStroke`).value=a(r??i.stroke),n(`markerIconPaintReset`).style.visibility=t||r?`visible`:`hidden`}function D(){this.value.trim()&&Markers.rename(y.i,this.value),e(`notesEditor`)&&d.NotesEditor.open({type:`marker`,id:y.i})}function O(){this.value.trim()&&Markers.setType(y.i,this.value)}function k(){d.IconPicker.open({current:y.icon,live:!0,onPick:e=>{for(let t of C())t.icon=e;E(),a()}})}function A(){B({px:+this.value})}function j(){B({dx:+this.value})}function M(){B({dy:+this.value})}function N(){B({size:+this.value})}function P(){B({pin:this.value})}function F(){B({fill:this.value})}function I(){B({stroke:this.value})}function L(){B({iconFill:this.value}),E()}function R(){B({iconStroke:this.value}),E()}function z(){B({iconFill:null,iconStroke:null}),E()}function B(e){try{for(let t of C())Markers.setAppearance(t.i,e)}catch(e){l(e.message,!1,`error`)}a()}function V(){d.NotesEditor.open({type:`marker`,id:y.i})}function H(){d.MarkersInRadius.open(y)}function U(){Markers.setLocked(y.i,!y.lock);let e=n(`markerLock`);e.classList.toggle(`icon-lock-open`),e.classList.toggle(`icon-lock`)}function W(){d.MarkerCreator.toggle(y)}function G(){g({title:`Удалить маркер`,message:`Вы уверены, что хотите удалить этот маркер? Это действие необратимо`,confirm:`Удалить`,onConfirm:K})}function K(){Markers.remove(y.i),a(),$(`#markerEditor`).dialog(`close`),f()}function q(){t(v).on(`.drag`,null).classed(`draggable`,!1),o(null),n(`addMarker`).classList.contains(`pressed`)&&_(),u(),p(`markerEditor`),v=null,y=null}var J={open:b};export{J as MarkersEditor};