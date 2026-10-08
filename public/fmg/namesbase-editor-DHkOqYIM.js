import{Gn as e,H as t,Hn as n,J as r,Nn as i,P as a,Pn as o,U as s,V as c,ct as l,nr as u,ot as d}from"./utils-BXzQ0Tym.js";import{t as f}from"./median-B93BzX2A.js";import{t as p}from"./mean-4Awewi9R.js";import{i as m}from"./tooltips-P6FAPAdd.js";import{i as h,n as g}from"./dialog-helpers-CJ5pbzaw.js";var _=null;function v(){customization||(g(`#namesbaseEditor, .stable`),y(),x(),S(),$(`#namesbaseEditor`).dialog({title:`Редактор баз имён`,width:`60vw`,position:{my:`center`,at:`center`,of:`svg`},close:b}))}function y(){h(`namesbaseEditor`),a(`dialogs`).insertAdjacentHTML(`beforeend`,`<div id="namesbaseEditor" class="dialog stable textual">
      <div id="namesbaseBasesTop">
        <span>Выбор базы: </span>
        <select id="namesbaseSelect" data-tip="Выберите базу для правки" style="width: 12em" value="0"></select>
        <span style="margin-left: 2px">Данные названий: </span>
      </div>
      <div id="namesbaseBody" style="margin-block: 2px; width: auto">
        <textarea
          id="namesbaseTextarea"
          data-base="0"
          rows="13"
          data-tip="Данные названий: список исходных имён через запятую для генерации названий"
          placeholder="Укажите данные названий: список исходных названий через запятую"
          autocorrect="off"
          spellcheck="false"
          style="resize: none"
        ></textarea>
        <div>
          <span>Name: </span>
          <input
            id="namesbaseName"
            data-tip="Правьте здесь исходное название"
            placeholder="Название базы"
            autocorrect="off"
            spellcheck="false"
            style="width: 12em"
          />
          <span>Length: </span>
          <input id="namesbaseMin" data-tip="Рекомендованная минимальная длина названия" type="number" min="2" max="100" />
          <input id="namesbaseMax" data-tip="Рекомендованная максимальная длина названия" type="number" min="2" value="10" />
          <span>Doubled: </span>
          <input
            id="namesbaseDouble"
            data-tip="Заполнить буквами, которые могут удваиваться (геминаты)"
            autocorrect="off"
            spellcheck="false"
            style="width: 10em"
          />
        </div>
        <fieldset>
          <legend>Созданные примеры:</legend>
          <div id="namesbaseExamples" data-tip="Примеры. Кликните, чтобы создать заново"></div>
        </fieldset>
      </div>
      <div id="namesbaseBottom">
        <button
          id="namesbaseUpdateExamples"
          data-tip="Пересоздать примеры по указанным данным"
          class="icon-arrows-cw"
        ></button>
        <button id="namesbaseAdd" data-tip="Добавить новую базу имён" class="icon-plus"></button>
        <button id="namesbaseDefault" data-tip="Восстановить базу имён по умолчанию" class="icon-cancel"></button>
        <button id="namesbaseDownload" data-tip="Скачать базу имён на компьютер" class="icon-download"></button>
        <button
          id="namesbaseUpload"
          data-tip="Загрузить базу имён с компьютера, заменив текущий набор"
          class="icon-upload"
        ></button>
        <button
          id="namesbaseUploadExtend"
          data-tip="Загрузить базу имён с компьютера, дополнив текущий набор"
          class="icon-up-circled2"
        ></button>
        <button
          id="namesbaseCA"
          data-tip="Найти или разместить свою базу имён на портале Cartography Assets"
          class="icon-drafting-compass"
        ></button>
        <button
          id="namesbaseAnalyze"
          data-tip="Проанализировать базу имён, чтобы оценить корректность и качество"
          class="icon-flask"
        ></button>
        <button
          id="namesbaseSpeak"
          data-tip="Озвучить примеры. Голос и язык меняются в настройках"
          class="icon-voice"
        ></button>
      </div>
    </div>`),a(`namesbaseSelect`).addEventListener(`change`,S),a(`namesbaseTextarea`).addEventListener(`change`,w),a(`namesbaseUpdateExamples`).addEventListener(`click`,C),a(`namesbaseExamples`).addEventListener(`click`,C),a(`namesbaseName`).addEventListener(`input`,e=>T(e.target.value)),a(`namesbaseMin`).addEventListener(`input`,e=>E(e.target.value)),a(`namesbaseMax`).addEventListener(`input`,e=>D(e.target.value)),a(`namesbaseDouble`).addEventListener(`input`,e=>O(e.target.value)),a(`namesbaseAdd`).addEventListener(`click`,A),a(`namesbaseAnalyze`).addEventListener(`click`,k),a(`namesbaseDefault`).addEventListener(`click`,j),a(`namesbaseDownload`).addEventListener(`click`,M),a(`namesbaseUpload`).addEventListener(`click`,()=>N(!0)),a(`namesbaseUploadExtend`).addEventListener(`click`,()=>N(!1)),a(`namesbaseCA`).addEventListener(`click`,()=>d(`https://cartographyassets.com/asset-category/specific-assets/azgaars-generator/namebases/`)),a(`namesbaseSpeak`).addEventListener(`click`,()=>l(a(`namesbaseExamples`).textContent??``))}function b(){$(`#namesbaseEditor`).dialog(`destroy`),a(`namesbaseEditor`).remove()}function x(){let e=a(`namesbaseSelect`);e.innerHTML=``,Names.nameBases.forEach((t,n)=>{e.options.add(new Option(t.name,String(n)))})}function S(){let e=+a(`namesbaseSelect`).value;if(!Names.nameBases[e]){m(`Namesbase ${e} is not defined`,!1,`error`);return}a(`namesbaseTextarea`).value=Names.nameBases[e].b,a(`namesbaseName`).value=Names.nameBases[e].name,a(`namesbaseMin`).value=String(Names.nameBases[e].min),a(`namesbaseMax`).value=String(Names.nameBases[e].max),a(`namesbaseDouble`).value=Names.nameBases[e].d,C()}function C(){let e=+a(`namesbaseSelect`).value,t=``;for(let n=0;n<7;n++){let r=Names.getBase(e);if(r===void 0){t=`Cannot generate examples. Please verify the data`;break}n&&(t+=`, `),t+=r}a(`namesbaseExamples`).innerHTML=t}function w(){let e=+a(`namesbaseSelect`).value,t=a(`namesbaseTextarea`);if(t.value.split(`,`).length<3){m(`Данные названий слишком короткие или некорректны`,!1,`error`);return}let n=t.value.replace(/[/|]/g,``);Names.nameBases[e].b=n,t.value=n,Names.updateChain(e)}function T(e){let t=+a(`namesbaseSelect`).value,n=a(`namesbaseSelect`),r=e.replace(/[/|]/g,``);n.options[n.selectedIndex].innerHTML=r,Names.nameBases[t].name=r}function E(e){let t=+a(`namesbaseSelect`).value;if(+e>Names.nameBases[t].max){m(`Минимальная длина не может быть больше максимальной`,!1,`error`);return}Names.nameBases[t].min=+e}function D(e){let t=+a(`namesbaseSelect`).value;if(+e<Names.nameBases[t].min){m(`Максимальная длина должна быть больше минимальной`,!1,`error`);return}Names.nameBases[t].max=+e}function O(e){let t=+a(`namesbaseSelect`).value;Names.nameBases[t].d=e}function k(){let e=a(`namesbaseTextarea`).value,t=e.toLowerCase().split(`,`),r=t.length;if(!e||!r){m(`Данные названий не должны быть пустыми`,!1,`error`);return}let s=Names.calculateChain(e),c=u(p(Object.values(s).map(e=>e.length))??0),l=t.map(e=>e.length),d=e.match(/[\u0080-\uFFFF]/gu)?n(e.match(/[\u0080-\uFFFF]/gu).join(``).toLowerCase().split(``)).join(``):`none`,h=t.flatMap(e=>e.match(/[^\w\s]|(.)(?=\1)/g)??[]),g=n(h).filter(e=>h.filter(t=>t===e).length>3),_=g.length?g.join(``):`none`,v=n(t.filter((e,t,n)=>n.indexOf(e)!==t)).join(`, `)||`none`,y=p(t.map(e=>+e.includes(` `)))??0,b=()=>r<30?`<span data-tip='Namesbase contains < 30 names - not enough to generate reasonable data' style='color:red'>[not enough]</span>`:r<100?`<span data-tip='Namesbase contains < 100 names - not enough to generate good names' style='color:darkred'>[low]</span>`:r<=400?`<span data-tip='Namesbase contains a reasonable number of samples' style='color:green'>[good]</span>`:`<span data-tip='Namesbase contains > 400 names. That is too much, try to reduce it to ~300 names' style='color:darkred'>[overmuch]</span>`,x=()=>c<15?`<span data-tip='Namesbase average variety < 15 - generated names will be too repetitive' style='color:red'>[low]</span>`:c<30?`<span data-tip='Namesbase average variety < 30 - names can be too repetitive' style='color:orange'>[mean]</span>`:`<span data-tip='Namesbase variety is good' style='color:green'>[good]</span>`;alertMessage.innerHTML=`<div style="line-height: 1.6em; max-width: 20em">
      <div data-tip="Указано названий">Namesbase length: ${r} ${b()}</div>
      <div data-tip="Среднее число вариантов генерации для каждого ключа в цепочке">Namesbase variety: ${c} ${x()}</div>
      <hr />
      <div data-tip="Самая короткая длина названия">Min name length: ${i(l)}</div>
      <div data-tip="Самая длинная длина названия">Max name length: ${o(l)}</div>
      <div data-tip="Средняя длина названия">Mean name length: ${u(p(l)??0,1)}</div>
      <div data-tip="Длина обычных названий">Median name length: ${f(l)}</div>
      <hr />
      <div data-tip="Символы вне Basic Latin плохо поддерживаются шрифтами">Символы вне базового набора: ${d}</div>
      <div data-tip="Символы, удваивающиеся часто (более 3 раз)">Удвоенные символы: ${_}</div>
      <div data-tip="Названия, использованные более одного раза">Duplicates: ${v}</div>
      <div data-tip="Доля названий с пробелом">Multi-word names: ${u(y*100,2)}%</div>
    </div>`,$(`#alert`).dialog({resizable:!1,title:`Анализ данных`,width:`auto`,position:{my:`left top-30`,at:`right+10 top`,of:`#namesbaseEditor`},buttons:{ОК:function(){$(this).dialog(`close`)}}})}function A(){let e=Names.nameBases.length,t=`This,is,an,example,of,name,base,showing,correct,format,It,should,have,at,least,one,hundred,names,separated,with,comma`;Names.nameBases.push({name:`Base${e}`,i:e,min:5,max:12,d:``,m:0,b:t}),a(`namesbaseSelect`).add(new Option(`Base${e}`,String(e))),a(`namesbaseSelect`).value=String(e),a(`namesbaseTextarea`).value=t,a(`namesbaseName`).value=`Base${e}`,a(`namesbaseMin`).value=`5`,a(`namesbaseMax`).value=`12`,a(`namesbaseDouble`).value=``,a(`namesbaseExamples`).innerHTML=`Please provide names data`}function j(){alertMessage.innerHTML=`Are you sure you want to restore default namesbase?`,$(`#alert`).dialog({resizable:!1,title:`Восстановить исходные данные`,buttons:{Восстановить:function(){$(this).dialog(`close`),Names.clearChains(),Names.nameBases=Names.getNameBases(),x(),S()},Отмена:function(){$(this).dialog(`close`)}}})}function M(){t(Names.nameBases.map(e=>`${e.name}|${e.min}|${e.max}|${e.d}|${e.m}|${e.b}`).join(`\r
`),`${s(`Namesbase`)}.txt`)}function N(e){_??=c(`.txt`),_.onchange=()=>r(_,t=>P(t,e)),_.click()}function P(t,n=!0){let r=t.replace(/\r\n|\r/g,`
`).split(`
`).filter(Boolean);if(!r.length){m(`Не удалось загрузить базу имён. Проверьте формат данных`,!1,`error`);return}Names.clearChains(),n&&(Names.nameBases=[]);let i=[];if(r.forEach((e,t)=>{try{let[t,n,r,i,a,o]=e.split(`|`),s=t?.replace(F,``);if(!s)throw Error(`Name is missing`);let c=o?.replace(F,``);if(!c)throw Error(`Names are missing`);Names.nameBases.push({name:s,i:Names.nameBases.length,min:+n,max:+r,d:i,m:+a,b:c})}catch(n){i.push({id:t+1,line:e,error:n.message}),ERROR&&console.error(n)}}),i.length>0){ERROR&&console.error(`Namesbase upload errors`,i);let t=i.map(({id:t,line:n,error:r})=>`<li style="padding:0.6em 0;border-top:1px solid #ddd;">
            <div>
              Строка ${t}:
              <span style="color:#8b0000">${e(r)}.</span> Data:
            </div>
            <div style="margin-top:0.35em;font-family:var(--font-monospace,monospace);line-height:1.4;word-break:break-word;color:#333;">
              ${e(n)||`<empty line>`}
            </div>
          </li>`).join(``);alertMessage.innerHTML=`<div>
        <p style="margin:0.75em;">
          <strong>File parsing error. Only ${r.length-i.length} out of ${r.length} namebases added.</strong>
          Каждая база имён — на своей строке и в формате: <code>name|min|max|duplication|m|names</code>. Параметры следует разделять <code>|</code> символ, и он не должен встречаться внутри параметров. Ещё один запрещённый символ — <code>/</code>. Частая ошибка — названия и другие параметры на двух отдельных строках.
          <ul style="margin:0.5em;">
            <li><code>name</code>: название базы.</li>
            <li><code>min</code>: минимальная рекомендуемая длина генерируемых названий. Должно быть числом.</li>
            <li><code>max</code>: максимальная рекомендуемая длина генерируемых названий. Должно быть числом больше минимальной длины.</li>
            <li><code>duplication</code>: символы, которые могут повторяться в генерируемых названиях. Например <code>lkd</code> означает, что возможны имена вроде «Kalla», «Mikkor», «Dalddur». Параметр может быть пустым.</li>
            <li><code>m</code>: неиспользуемый параметр, заполните чем угодно. <code>0</code>.</li>
            <li><code>names</code>: список названий через запятую. Чтобы база была корректной, нужно минимум 3 названия.</li>
          </ul>
        </p>
        <div>
          <ul style="margin:0;padding-left:1.5em;">
            ${t}
          </ul>
        </div>
      </div>`,$(`#alert`).dialog({resizable:!1,title:`Ошибка разбора`,width:`min(72vw, 68em)`,position:{my:`center center-4em`,at:`center`,of:`svg`},buttons:{Продолжить:function(){$(this).dialog(`close`)}}})}x(),S()}var F=/[|/]/g,I={open:v};export{I as NamesbaseEditor};