import{P as e,Pt as t,Y as n}from"./utils-BXzQ0Tym.js";import{h as r,r as i}from"./options-tab-wcBLi85F.js";import{X as a}from"./layers-Bcg3SU5R.js";import{s as o}from"./options-schema-CWLfsv4m.js";import{t as s}from"./pins-BUEQgIuf.js";import{a as c}from"./generation-pipeline-1xttKRf1.js";import{n as l,r as u}from"./dialog-helpers-CJ5pbzaw.js";var d=t(),f=S(),p=C();g(),_(),v();function m(){l(`.stable`),b(options.generation.template),f=S(),p=C(),e(`heightmapSelection`).style.setProperty(`--preview-aspect-ratio`,`${f.width}/${f.height}`),D(),$(`#heightmapSelection`).dialog({title:`Выбор карты высот`,resizable:!1,position:{my:`center`,at:`center`,of:`svg`},close:h,buttons:{Отмена:function(){$(this).dialog(`close`)},Выделение:function(){let e=y();e&&(Options.set(t=>t.generation.template=e),i(),s.set(`template`,options.generation.template),$(this).dialog(`close`))},"New Map":function(){let e=y();if(!e)return;Options.set(t=>t.generation.template=e),i(),s.set(`template`,options.generation.template);let t=x(),n=p,r=f;n&&r&&regeneratePrompt({seed:t,graph:n,...r}),$(this).dialog(`close`)}}})}function h(){p=null,f=null,HeightmapGenerator.clearData()}function g(){let e=document.createElement(`style`);e.textContent=`
    div.dialog > div.heightmap-selection {
      width: 70vw;
      height: 70vh;
    }

    .heightmap-selection_container {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
      grid-gap: 6px;
    }

    @media (max-width: 600px) {
      .heightmap-selection_container {
        grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));
        grid-gap: 4px;
      }
    }

    @media (min-width: 2000px) {
      .heightmap-selection_container {
        grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
        grid-gap: 8px;
      }
    }

    .heightmap-selection_options {
      display: grid;
      grid-template-columns: 2fr 1fr;
    }

    .heightmap-selection_options > div:first-child {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      align-items: center;
      justify-self: start;
      justify-items: start;
    }

    @media (max-width: 600px) {
      .heightmap-selection_options {
        grid-template-columns: 3fr 1fr;
      }

      .heightmap-selection_options > div:first-child {
        display: block;
      }
    }

    .heightmap-selection_options > div:last-child {
      justify-self: end;
    }

    .heightmap-selection article {
      padding: 4px;
      border-radius: 8px;
      transition: all 0.1s ease-in-out;
      filter: drop-shadow(1px 1px 4px #999);
    }

    .heightmap-selection article:hover {
      background-color: #ddd;
      filter: drop-shadow(1px 1px 8px #999);
      cursor: pointer;
    }

    .heightmap-selection article.selected {
      background-color: #ccc;
      outline: 1px solid var(--dark-solid);
      filter: drop-shadow(1px 1px 8px #999);
    }

    .heightmap-selection article > div {
      display: flex;
      justify-content: space-between;
      padding: 2px 1px;
    }

    .heightmap-selection article > img {
      width: 100%;
      aspect-ratio: var(--preview-aspect-ratio);
      border-radius: 8px;
      object-fit: fill;
    }

    .heightmap-selection article .regeneratePreview {
      outline: 1px solid #bbb;
      padding: 1px 3px;
      border-radius: 4px;
      transition: all 0.1s ease-in-out;
    }

    .heightmap-selection article .regeneratePreview:hover {
      outline: 1px solid #666;
    }

    .heightmap-selection article .regeneratePreview:active {
      outline: 1px solid #333;
      color: #000;
      transform: rotate(45deg);
    }
  `,document.head.appendChild(e)}function _(){let t=p,i=f;if(!t||!i)return;let a=`<div id="heightmapSelection" class="dialog stable">
    <div class="heightmap-selection">
      <section data-tip="Шаблон задаёт уникальные, но похожие карты при генерации">
        <header><h1>Шаблоны карт высот</h1></header>
        <div class="heightmap-selection_container"></div>
      </section>
      <section data-tip="Готовая карта высот будет одинаковой для всех карт">
        <header><h1>Готовые карты высот</h1></header>
        <div class="heightmap-selection_container"></div>
      </section>
      <section>
        <header><h1>Настройки</h1></header>
        <div class="heightmap-selection_options">
          <div>
            <label data-tip="Перерисовать все изображения предпросмотра" class="checkbox-label" id="heightmapSelectionRedrawPreview">
              <i class="icon-cw"></i>
              Обновить предпросмотр
            </label>
            <div>
              <input id="heightmapSelectionRenderOcean" class="checkbox" type="checkbox" />
              <label data-tip="Рисовать высоты водных ячеек" for="heightmapSelectionRenderOcean" class="checkbox-label">Рисовать высоты океана</label>
            </div>
            <div data-tip="Цветовая схема предпросмотра карты высот">
              Цветовая схема
              <select id="heightmapSelectionColorScheme">${n.names().map(e=>`<option value="${e}">${e}</option>`).join(``)}</select>
            </div>
          </div>
          <div>
            <button data-tip="Редактор шаблонов" data-tool="templateEditor" id="heightmapSelectionEditTemplates">Изменить шаблоны</button>
            <button data-tip="Открыть преобразование изображения" data-tool="imageConverter" id="heightmapSelectionImportHeightmap">Импортировать карту высот</button>
          </div>
        </div>
      </section>
    </div>
  </div>`;e(`dialogs`).insertAdjacentHTML(`beforeend`,a);let o=document.getElementsByClassName(`heightmap-selection_container`);o[0].innerHTML=Object.keys(c).map(e=>{let n=c[e].name;return Math.random=aleaPRNG(d),`<article data-id="${e}" data-seed="${d}">
        <img src="${k(HeightmapGenerator.fromTemplate(t,e,i))}" alt="${n}" />
        <div>
          ${n}
          <span data-tip="Пересоздать предпросмотр" class="icon-cw regeneratePreview"></span>
        </div>
      </article>`}).join(``),o[1].innerHTML=Object.keys(r).map(e=>{let t=r[e].name;return T(e),`<article data-id="${e}" data-seed="${d}">
        <img alt="${t}" />
        <div>${t}</div>
      </article>`}).join(``)}function v(){e(`heightmapSelection`).addEventListener(`click`,e=>{let t=e.target,n=t.closest(`#heightmapSelection article`);if(!n)return;let r=n.dataset.id;r&&(t.matches(`span.icon-cw`)&&E(n,r),b(r))}),e(`heightmapSelectionRenderOcean`).addEventListener(`change`,D),e(`heightmapSelectionColorScheme`).addEventListener(`change`,D),e(`heightmapSelectionRedrawPreview`).addEventListener(`click`,D),e(`heightmapSelectionEditTemplates`).addEventListener(`click`,e=>O(e.currentTarget)),e(`heightmapSelectionImportHeightmap`).addEventListener(`click`,e=>O(e.currentTarget))}function y(){return e(`heightmapSelection`).querySelector(`.selected`)?.dataset?.id}function b(t){let n=e(`heightmapSelection`);n.querySelector(`.selected`)?.classList?.remove(`selected`),n.querySelector(`[data-id="${t}"]`)?.classList?.add(`selected`)}function x(){return e(`heightmapSelection`).querySelector(`.selected`)?.dataset?.seed}function S(){let{width:e,height:t,density:n}=options.generation.graph;return{width:e,height:t,points:o(n)}}function C(){let{width:e,height:t,points:n}=f??S(),r=options.map.graph;if(r.width!==e||r.height!==t||r.points!==n)return Grid.generate(d,e,t,n);let i=structuredClone(grid);return Grid.resetHeights(i),i}function w(t){let n=p,r=f;if(!n||!r)return;let i=k(HeightmapGenerator.fromTemplate(n,t,r));e(`heightmapSelection`).querySelector(`[data-id="${t}"]`)?.querySelector(`img`)?.setAttribute(`src`,i)}async function T(t){let n=p,r=f;if(!n||!r)return;let i=await HeightmapGenerator.fromPrecreated(n,t,r);if(n!==p)return;let a=k(i);e(`heightmapSelection`).querySelector(`[data-id="${t}"]`)?.querySelector(`img`)?.setAttribute(`src`,a)}function E(e,n){if(!p)return;Grid.resetHeights(p);let r=t();e.dataset.seed=r,Math.random=aleaPRNG(r),w(n)}function D(){if(!p)return;Grid.resetHeights(p);let t=e(`heightmapSelection`).querySelectorAll(`article`);for(let e of t){let{id:t,seed:n}=e.dataset;!t||!n||(Math.random=aleaPRNG(n),t in c?w(t):T(t))}}function O(e){let t=e.dataset.tool;t&&u({title:e.dataset.tip??``,message:`Открытие инструмента сотрёт текущую карту. Продолжить?`,confirm:`Продолжить`,onConfirm:()=>window.Controllers.HeightmapEditor.open({mode:`erase`,tool:t})})}function k(t){if(!p||!t?.length)return``;let r=n.get(e(`heightmapSelectionColorScheme`).value),i=e(`heightmapSelectionRenderOcean`).checked;return a({heights:t,width:p.cellsX,height:p.cellsY,scheme:r,renderOcean:i})}var A={open:m};export{A as HeightmapSelection};