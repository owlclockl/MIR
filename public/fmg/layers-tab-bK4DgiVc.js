import{F as e,P as t,it as n}from"./utils-BXzQ0Tym.js";import{pt as r,t as i}from"./layers-Bcg3SU5R.js";import{t as a}from"./layer-labels-rcim0nKv.js";var o={political:`Political map`,cultural:`Cultural map`,religions:`Religions map`,provinces:`Provinces map`,biomes:`Biomes map`,heightmap:`Heightmap`,physical:`Physical map`,poi:`Places of interest`,goods:`Goods map`,trade:`Trade animation`,military:`Military map`,emblems:`Emblems`,landmass:`Pure landmass`},s=e=>[...a].find(([,t])=>t.shortcut===e)?.[0],c=`
  <p data-tip="Выберите пресет слоёв карты" style="display: inline-block">Пресет слоёв:</p>
  <select data-tip="Выберите пресет слоёв карты" id="layersPreset" style="width: 45%">
    ${Object.entries(o).map(([e,t])=>`<option value="${e}">${t}</option>`).join(``)}
    <option hidden value="custom">Custom (not saved)</option>
  </select>
  <button
    id="savePresetButton"
    data-tip="Кликните, чтобы сохранить показанные слои как новый пресет"
    class="icon-plus sideButton"
    style="display: none"
  ></button>
  <button
    id="removePresetButton"
    data-tip="Кликните, чтобы удалить текущий свой пресет"
    class="icon-minus sideButton"
    style="display: none"
  ></button>
  <p>Показанные слои и их порядок:</p>
  <ul
    data-tip="Кликните, чтобы переключить слой; тяните, чтобы поднять или опустить его. Ctrl + клик — изменить стиль слоя"
    id="mapLayers"
  >
  </ul>
  <div class="tip">Кликните, чтобы переключить; тяните, чтобы поднять или опустить слой</div>
  <div class="tip">Ctrl + клик — изменить стиль слоя</div>
  <div id="viewMode" data-tip="Режим отображения">
    <p>Режим просмотра:</p>
    <button data-tip="Обычный режим правки карты" id="viewStandard" class="pressed">
      Стандартный
    </button>
    <button
      data-tip="Показ карты в 3D-сцене. Лучше всего для карты высот; редактирование недоступно"
      id="viewMesh"
    >
      3D-сцена
    </button>
    <button data-tip="Спроецировать карту на глобус. Для правки не подходит" id="viewGlobe">Глобус</button>
  </div>
`;t(`layersContent`).innerHTML=c;function l(){t(`mapLayers`).replaceChildren(...i.all.flatMap(e=>{let t=a.get(e.id);if(!t)return[];let n=document.createElement(`li`);return n.dataset.layer=e.id,n.dataset.tip=`${t.label.replace(/<\/?u>/g,``)}: click to toggle, drag to raise or lower the layer. Ctrl + click to edit layer style`,t.shortcut&&(n.dataset.shortcut=t.hint??t.shortcut.replace(`Key`,``)),n.innerHTML=t.label,n.classList.toggle(`buttonoff`,!i.isOn(e.id)),n.classList.toggle(`solid`,e.params.parent!==`viewbox`),[n]}))}t(`mapLayers`).addEventListener(`click`,e=>{let t=e.target.closest(`li`)?.dataset.layer;if(!(!t||!i.has(t))){if(n(e))return void Controllers.StyleEditor.open(t);i.toggle(t)}}),$(`#mapLayers`).sortable({items:`li:not(.solid)`,containment:`parent`,cancel:`.solid`,update:(e,t)=>{let n=t.item.data(`layer`),r=t.item.next().data(`layer`),a=i.has(n)?n:void 0,o=i.has(r)?r:void 0;a&&i.move(a,o)}}),i.subscribe(l),i.subscribe(()=>r.renderNow());var u;i.subscribe(()=>{e(`canvas3d`)&&(clearTimeout(u),u=window.setTimeout(()=>void Controllers.View3d.update(),400))}),l();export{s as n,o as t};