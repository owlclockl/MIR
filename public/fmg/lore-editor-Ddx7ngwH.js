import{P as e}from"./utils-BXzQ0Tym.js";import{t}from"./pins-BUEQgIuf.js";import{t as n}from"./names-generator-CQrqdCvZ.js";import{i as r,n as i}from"./dialog-helpers-CJ5pbzaw.js";import{t as a}from"./lore-C79J2SXL.js";var o=`loreEditor`,s=`
  <style>
    #${o} .le { display: grid; grid-template-columns: 1em 5.6em minmax(0, 1fr) 1.2em; gap: .3em; align-items: center; width: 23em; }
    #${o} .le > label[for="loreDescription"] { align-self: start; padding-top: .35em; }
    #${o} .le-era { display: flex; align-items: center; gap: .4em; min-width: 0; }
    #${o} .le-era > input:first-child { flex: 1; min-width: 0; }
    #${o} .le-era > input:last-child { flex: 0 0 3.4em; }
    #${o} input, #${o} textarea { width: 100%; box-sizing: border-box; font: inherit; }
    #${o} textarea { resize: vertical; }
    #${o} .le > i { cursor: pointer; justify-self: center; }
    #${o} .le > i[data-locked] { font-size: .8em; color: #626573; }
  </style>

  <div class="le">
    <i data-locked="0" id="lock_mapName" class="icon-lock-open"></i>
    <label for="loreMapName">Название карты:</label>
    <input
      id="loreMapName"
      data-tip="Название карты. По нему называются скачиваемые файлы"
      autocorrect="off"
      spellcheck="false"
      type="text"
    />
    <i data-tip="Создать новое название карты" id="loreMapNameRegenerate" class="icon-arrows-cw"></i>

    <i data-locked="0" id="lock_year" class="icon-lock-open"></i>
    <label for="loreYear">Year:</label>
    <input
      id="loreYear"
      data-tip="Текущий год. Датирует историю государств и сводки сражений"
      type="number"
      step="1"
    />
    <span></span>

    <i data-locked="0" id="lock_era" data-ids="era,eraShort" class="icon-lock-open"></i>
    <label for="loreEra">Era:</label>
    <span class="le-era" data-tip="Название эпохи текущего года и её сокращение">
      <input id="loreEra" autocorrect="off" spellcheck="false" type="text" placeholder="Зимняя эра" />
      <input id="loreEraShort" autocorrect="off" spellcheck="false" type="text" placeholder="WE" />
    </span>
    <i data-tip="Создать новую эпоху" id="loreEraRegenerate" class="icon-arrows-cw"></i>

    <span></span>
    <label for="loreDescription">Description:</label>
    <textarea
      id="loreDescription"
      rows="5"
      data-tip="Ваше описание этого мира. Произвольный текст, хранится в файле карты"
      placeholder="Опишите карту, её возраст, её народы — всё, что карта должна нести в себе."
    ></textarea>
    <span></span>
  </div>
`;function c(){i(`#loreEditor, .stable`),l(),$(`#${o}`).dialog({title:`Настройка истории`,width:`auto`,minWidth:340,position:{my:`right top`,at:`right-10 top+10`,of:`svg`,collision:`fit`},close:()=>r(o)})}function l(){r(o),e(`dialogs`).insertAdjacentHTML(`beforeend`,`<div id="${o}" class="dialog stable">${s}</div>`),d(),f(),t.bindIcons(e(o),u)}function u(e){let{name:t,calendar:n}=options.map.lore;if(e===`mapName`)return t;if(e===`year`)return n.year;if(e===`era`)return n.era;if(e===`eraShort`)return n.eraShort}function d(){let{name:t,description:n,calendar:r}=options.map.lore;e(`loreMapName`).value=t,e(`loreYear`).value=String(r.year),e(`loreEra`).value=r.era,e(`loreEraShort`).value=r.eraShort,e(`loreDescription`).value=n}function f(){e(o).addEventListener(`change`,p),e(`loreMapNameRegenerate`).addEventListener(`click`,m),e(`loreEraRegenerate`).addEventListener(`click`,h)}function p(n){let r=n.target,i=r.value,{lore:o}=options.map;switch(r.id){case`loreMapName`:if(!i.trim())return;a.rename(i),t.set(`mapName`,o.name);break;case`loreYear`:if(!i||Number.isNaN(+i))return;a.setYear(+i),t.set(`year`,o.calendar.year);break;case`loreEra`:if(!i.trim())return;a.setEra(i),t.set(`era`,o.calendar.era),t.set(`eraShort`,o.calendar.eraShort),e(`loreEraShort`).value=o.calendar.eraShort;break;case`loreEraShort`:if(!i.trim())return;a.setEra(o.calendar.era,i),t.set(`eraShort`,o.calendar.eraShort);break;case`loreDescription`:a.setDescription(i);break;default:return}Options.save()}function m(){t.clear(`mapName`),a.rename(n.getMapName()),Options.save(),d()}function h(){t.clear(`era`),t.clear(`eraShort`),a.setEra(n.getEra()),Options.save(),d()}function g(){document.getElementById(o)&&d()}var _={open:c,refresh:g};export{_ as LoreEditor};