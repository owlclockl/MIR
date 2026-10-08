import{Gn as e,H as t,On as n,P as r,U as i,Un as a,er as o,nr as s,ot as c}from"./utils-BXzQ0Tym.js";import{$ as l,at as u,ct as d,dt as f,ft as p,it as m,lt as ee,ot as te,rt as ne,st as re,ut as ie}from"./layers-Bcg3SU5R.js";import{t as ae}from"./drag-DdGpYDDb.js";import{r as oe}from"./highlight-izWZujNC.js";import{i as h,n as g,r as se,t as _}from"./emblems-generator-BdUAGZhv.js";import{i as v,t as ce}from"./tooltips-P6FAPAdd.js";import{r as y}from"./emblems-uUqrpFK3.js";import{_ as le,d as b,h as x,m as S,x as C}from"./schemaUtils-B2thnuln.js";import{i as ue}from"./dialog-helpers-CJ5pbzaw.js";import{cloneEmblem as de,emblemURL as fe,loadEmblemIcons as w}from"./emblem-image-DXLL2GIU.js";import{t as pe}from"./pictures-BJ-01PS_.js";import{IconPicker as me}from"./icon-picker-Cufoa15W.js";var T=`https://azgaar.github.io/Armoria/`,he=`https://armoria.herokuapp.com/`,E=`Paste an Armoria edit link, API link or COA string. Use the picture button for other images`;function D(e){let t=e.trim();if(!/^https?:\/\//i.test(t))return O(t);let n;try{n=new URL(t)}catch{throw Error(`The link is not a valid URL`)}if(!(n.origin===new URL(`https://azgaar.github.io/Armoria/`).origin&&n.pathname.startsWith(`/Armoria`)||n.origin===new URL(`https://armoria.herokuapp.com/`).origin)||!n.searchParams.has(`coa`))throw Error(E);return O(n.searchParams.get(`coa`)??``)}function O(e){if(!e)throw Error(E);try{let t=JSON.parse(/^%7b/i.test(e)?decodeURIComponent(e):e);if(k.safeParse(t).success)return t}catch{}throw Error(`The Armoria COA is not valid JSON with a field tincture`)}var k=x({t1:C(),shield:C().optional(),diaper:C().optional(),division:x({division:C(),t:C()}).optional(),charges:b(x({charge:C(),t:C(),p:C()})).optional(),ordinaries:b(x({ordinary:C(),t:C()})).optional(),inscriptions:b(x({text:C(),path:C()})).optional()});function ge(e){let t=new URL(he);return t.searchParams.set(`size`,`1024`),t.searchParams.set(`format`,`svg`),t.searchParams.set(`coa`,JSON.stringify(e)),t.href}var _e=le({type:S(`armoria:coa`),version:S(1),session:C(),coa:k,svg:C()}),ve=class{sessions=new Map;start(e,t,n,r=new URL(T).origin){for(let[e,n]of this.sessions)n.key===t&&this.sessions.delete(e);let i=crypto.randomUUID();return this.sessions.set(i,{target:e,key:t,map:n,origin:r}),i}receive(e,t){let n=_e.safeParse(e.data);if(!n.success)return null;let{session:r,coa:i,svg:a}=n.data,o=this.sessions.get(r);return!o||e.origin!==o.origin||o.map!==t?null:{target:o.target,coa:i,svg:a}}};function ye(e){let t=e=>{if(!e||typeof e!=`string`)return!1;if(e in p||/^#[\da-f]{3,8}$/i.test(e))return!0;let[n,r,i]=e.split(`-`);return!t(r)||!t(i)?!1:n.startsWith(`semy_of_`)?!!_.chargeIcon(n.slice(8)):n in ee},n=e=>!e||e in ie,r=e=>{let t=re(e,`heater`);return t?t in d:!!_.chargeArt(e)};return t(e.t1)&&(!e.shield||e.shield in d)&&(!e.diaper||e.diaper===`no`||e.diaper in f)&&(!e.division||(e.division.division===`no`||e.division.division in u)&&t(e.division.t)&&n(e.division.line))&&(e.ordinaries??[]).every(e=>(e.ordinary===`bordure`||e.ordinary===`orle`||e.ordinary in te)&&t(e.t)&&(!e.t2||t(e.t2))&&n(e.line))&&(e.charges??[]).every(e=>r(e.charge)&&t(e.t)&&(!e.t2||t(e.t2))&&(!e.t3||t(e.t3)))}var A=`Size of this emblem, 0 hides it. Change a whole category in Menu ⭢ Style ⭢ Emblems`,be=`
  #emblemEditor { padding: .5em .7em .6em; }
  #emblemEditor > div { width: auto; }
  #emblemEditor .preview { width: 12em; height: 12em; margin: 0 auto .2em; }
  #emblemEditor .preview svg { width: 100%; height: 100%; overflow: visible; }
  #emblemArmiger { display: block; margin-bottom: .5em; text-align: center; }
  #emblemEditor .fields { display: grid; grid-template-columns: 6.4em minmax(0, 1fr); align-items: center; gap: .3em .4em; }
  #emblemEditor .fields .row { display: contents; }
  #emblemEditor .fields .row.hidden { display: none; }
  #emblemEditor .tincture { display: flex; align-items: center; gap: .35em; }
  #emblemEditor .tincture select { flex: 1; min-width: 0; }
  #emblemEditor .swatch { flex: none; width: 1.1em; height: 1.1em; border: 1px solid #0006; border-radius: 2px; }
  #emblemEditor .fields label { white-space: nowrap; padding: .15em .35em; border-radius: 3px; transition: background-color .3s ease-out; }
  #emblemEditor .fields label.active { background-color: #54ca7733; font-weight: bold; }
  #emblemEditor .fields select { width: 100%; min-width: 0; margin: 0; }
  #emblemEditor .fields hr { grid-column: 1 / -1; width: 100%; margin: .2em 0; border: 0; border-top: 1px solid #0000001f; }
  #emblemEditor .size { display: flex; align-items: center; gap: .4em; }
  #emblemEditor .size input[type="range"] { flex: 1; min-width: 0; margin: 0; }
  #emblemEditor .size input[type="number"] { width: 3.8em; margin: 0; }
  #emblemEditor .armoria { margin-top: .6em; }
  #emblemEditor .armoria button { width: 100%; margin: 0; padding: .4em; font-weight: bold; }
  #emblemEditor .armoria p { margin: .3em 0 0; font-size: .85em; opacity: .75; text-align: center; }
  #emblemEditor .toolbar { display: grid; grid-template-columns: repeat(7, 1fr); gap: .25em; margin-top: .7em; }
  #emblemEditor .control { display: flex; align-items: center; gap: .3em; margin-top: .4em; }
  #emblemEditor .control.hidden { display: none; }
  #emblemEditor .control input[type="text"] { flex: 1; min-width: 0; margin: 0; }
  #emblemEditor .control input[type="number"] { width: 4.6em; margin: 0; }
  #emblemEditor .control button { margin: 0; }
  #emblemEditor #emblemDownloadControl button { flex: 1; }
`,j,M,N,P,F=new ve,I=T;async function xe(){let e=pack.states.find(e=>e.i&&!e.removed&&e.coa),t=pack.burgs.find(e=>e.i&&!e.removed&&e.coa),n=e?`государство`:`burg`,r=e??t;if(!r?.coa){v(`Нет эмблем для правки; сначала создайте государства и города`,!1,`error`);return}let i=`${n}COA${r.i}`;await m.trigger(i,r.coa),L(n,i,r)}function L(e,t,n,r){if(!customization){if(!t&&r)Ce(r);else{if(!e||!t||!n?.coa)return;j=e,M=t,N=n}Se(),We(),P?.(),P=ne(We),R(),$(`#emblemEditor`).dialog({title:`Редактор эмблем`,resizable:!0,width:`22em`,height:`auto`,position:{my:`left top`,at:`left+10 top+10`,of:`svg`,collision:`fit`},close:Ge})}}function Se(){ue(`emblemEditor`);let e=`<div id="emblemEditor" class="dialog stable">
      <style>${be}</style>
      <div class="preview"><svg viewBox="0 0 200 200"><use id="emblemImage"></use></svg></div>
      <b id="emblemArmiger"></b>
      <div class="fields">
        <label for="emblemStates" data-tip="Выберите государство">Государство</label>
        <select id="emblemStates" data-tip="Выберите государство"></select>
        <label for="emblemProvinces" data-tip="Выберите провинцию в государстве">Провинция</label>
        <select id="emblemProvinces" data-tip="Выберите провинцию в государстве"></select>
        <label for="emblemBurgs" data-tip="Выберите город в провинции или государстве">Город</label>
        <select id="emblemBurgs" data-tip="Выберите город в провинции или государстве"></select>
        <hr />
        <div id="emblemShapeRow" class="row">
        <label for="emblemShapeSelector" data-tip="Выберите форму эмблемы">Форма</label>
          <select id="emblemShapeSelector" data-tip="Выберите форму эмблемы">
            <option value="">Нет</option>
            <optgroup label="Базовый">
              <option value="heater">Хитер</option>
              <option value="spanish">Испанский</option>
              <option value="french">Французский</option>
            </optgroup>
            <optgroup label="Региональный">
              <option value="horsehead">Конская голова</option>
              <option value="horsehead2">Конская голова (острая)</option>
              <option value="polish">Польский</option>
              <option value="hessen">Гессен</option>
              <option value="swiss">Швейцарский</option>
            </optgroup>
            <optgroup label="Исторический">
              <option value="boeotian">Беотийский</option>
              <option value="roman">Римский</option>
              <option value="kite">Миндалевидный</option>
              <option value="oldFrench">Старофранцузский</option>
              <option value="renaissance">Ренессанс</option>
              <option value="baroque">Барокко</option>
            </optgroup>
            <optgroup label="Конкретный">
              <option value="targe">Тарч</option>
              <option value="targe2">Тарч 2</option>
              <option value="pavise">Павеза</option>
              <option value="wedged">Клин</option>
              <option value="embowed">Изогнутый</option>
            </optgroup>
            <optgroup label="Знамя">
              <option value="flag">Хоругвь</option>
              <option value="pennon">Пеннон</option>
              <option value="guidon">Гуйон</option>
              <option value="banner">Знамя</option>
              <option value="dovetail">Ласточкин хвост</option>
              <option value="gonfalon">Гонфалон</option>
              <option value="pennant">Вымпел</option>
            </optgroup>
            <optgroup label="Простой">
              <option value="round">Круглый</option>
              <option value="oval">Овал</option>
              <option value="vesicaPiscis">Миндаль (vesica piscis)</option>
              <option value="square">Квадрат</option>
              <option value="diamond">Ромб</option>
              <option value="hexagon">Шестиугольник</option>
            </optgroup>
            <optgroup label="Фэнтези">
              <option value="fantasy1">Fantasy1</option>
              <option value="fantasy2">Fantasy2</option>
              <option value="fantasy3">Fantasy3</option>
              <option value="fantasy4">Fantasy4</option>
              <option value="fantasy5">Fantasy5</option>
            </optgroup>
            <optgroup label="Средиземье">
              <option value="noldor">Нолдор</option>
              <option value="gondor">Gondor</option>
              <option value="easterling">Восто́чник</option>
              <option value="erebor">Erebor</option>
              <option value="ironHills">Железные холмы</option>
              <option value="urukHai">UrukHai</option>
              <option value="moriaOrc">Орка Мориа</option>
            </optgroup>
          </select>
        </div>
        <div id="emblemFieldRow" class="row">
          <label for="emblemField" data-tip="Цвет поля">Поле</label>
          <div class="tincture"><span class="swatch"></span><select id="emblemField"></select></div>
        </div>
        <div id="emblemChargeRows" class="row">
          <label for="emblemChargeTincture" data-tip="Цвет главной гербовой фигуры. Растровая картинка сохраняет свои цвета">Гербовая фигура</label>
          <div class="tincture"><span class="swatch"></span><select id="emblemChargeTincture"></select></div>
          <label for="emblemChargeSizeNumber" data-tip="Размер главной гербовой фигуры">Размер гербовой фигуры</label>
          <div class="size" data-tip="Размер главной гербовой фигуры">
            <input id="emblemChargeSizeSlider" type="range" min=".2" max="3" step=".05" />
            <input id="emblemChargeSizeNumber" type="number" min=".2" max="3" step=".05" />
          </div>
        </div>
        <label for="emblemSizeNumber" data-tip="${A}">Размер карты</label>
        <div class="size" data-tip="${A}">
          <input id="emblemSizeSlider" type="range" min="0" max="5" step=".1" />
          <input id="emblemSizeNumber" type="number" min="0" max="5" step=".1" />
        </div>
      </div>
      <div class="armoria">
        <button id="emblemsArmoria" type="button" data-tip="Открыть эмблему в Armoria, редакторе гербов: изменения видны на карте сразу"><span class="icon-font"></span> Изменить в Armoria</button>
      </div>
      <div class="toolbar">
        <button id="emblemsPaste" data-tip="Отредактируйте строку герба вручную или вставьте ссылку Armoria, ссылку API или строку герба" class="icon-link"></button>
        <button id="emblemsCharge" data-tip="Задайте гербовую фигуру: выберите, вставьте ссылку или загрузите картинку на поле" class="icon-chess-knight"></button>
        <button id="emblemsUpload" data-tip="Заменить эмблему целиком картинкой: выберите, вставьте ссылку или загрузите изображение, например готовый герб" class="icon-shield-alt"></button>
        <button id="emblemsDownload" data-tip="Скачать эмблему как изображение" class="icon-download"></button>
        <button id="emblemsGallery" data-tip="Скачать все эмблемы галереей HTML (откройте в браузере; готовится некоторое время)" class="icon-layer-group"></button>
        <button id="emblemsRegenerate" data-tip="Пересоздать эмблему" class="icon-shuffle"></button>
        <button id="emblemsFocus" data-tip="Поле или область эмблемы" class="icon-target"></button>
      </div>
      <div id="emblemPasteControl" class="control hidden">
        <input id="emblemPaste" type="text" placeholder="Ссылка Armoria или строка герба" data-tip="Строка COA эмблемы: отредактируйте её или замените ссылкой Armoria либо строкой COA, затем примените" />
        <button id="emblemPasteApply" type="button" data-tip="Применить вставленную эмблему">Применить</button>
      </div>
      <div id="emblemDownloadControl" class="control hidden">
        <input id="emblemsDownloadSize" data-tip="Размер изображения в пикселях" type="number" value="500" step="100" min="100" max="10000" />
        <span>px</span>
        <button id="emblemsDownloadSVG" data-tip="Векторное изображение: лучшее качество, открывается в браузере или Inkscape">SVG</button>
        <button id="emblemsDownloadPNG" data-tip="Растровое изображение без потерь с прозрачным фоном">PNG</button>
        <button id="emblemsDownloadJPG" data-tip="Сжатая растровая картинка на белом фоне">JPG</button>
      </div>
    </div>`;r(`dialogs`).insertAdjacentHTML(`beforeend`,e),r(`emblemStates`).oninput=we,r(`emblemProvinces`).oninput=Te,r(`emblemBurgs`).oninput=Ee,r(`emblemShapeSelector`).oninput=De,r(`emblemField`).oninput=Oe,r(`emblemChargeTincture`).oninput=ke,r(`emblemChargeSizeSlider`).oninput=H,r(`emblemChargeSizeNumber`).oninput=H,r(`emblemSizeSlider`).oninput=K,r(`emblemSizeNumber`).oninput=K,r(`emblemsRegenerate`).onclick=Ne,r(`emblemsArmoria`).onclick=Pe,r(`emblemsCharge`).onclick=()=>Le(`charge`),r(`emblemsUpload`).onclick=()=>Le(`whole`),r(`emblemsPaste`).onclick=()=>J(`emblemPasteControl`),r(`emblemPasteApply`).onclick=()=>void Fe(),r(`emblemPaste`).onkeydown=e=>{e.key===`Enter`&&Fe()},r(`emblemsDownload`).onclick=()=>J(`emblemDownloadControl`),r(`emblemsDownloadSVG`).onclick=()=>Y(`svg`),r(`emblemsDownloadPNG`).onclick=()=>Y(`png`),r(`emblemsDownloadJPG`).onclick=()=>Y(`jpeg`),r(`emblemsGallery`).onclick=Be,r(`emblemsFocus`).onclick=Me}function Ce(e){let t=e.parentNode,n=t.id===`burgEmblems`?`burg`:t.id===`provinceEmblems`?`провинция`:`государство`,r=+e.dataset.i,i=Z(n,r);if(!i)throw Error(`Cannot edit ${n} emblem ${r}`);j=n,M=`${j}COA${r}`,N=i}function R(){let e=j,t=N,n=r(`emblemStates`),i=r(`emblemProvinces`),a=r(`emblemBurgs`),o=0,s=0,c=0;for(let[t,r]of[[n,`state`],[i,`province`],[a,`burg`]])t.previousElementSibling?.classList.toggle(`active`,e===r);e===`state`?o=t.i:e===`province`?(s=t.i,o=pack.states[t.state].i):(c=t.i,s=pack.cells.province[t.cell]?pack.provinces[pack.cells.province[t.cell]].i:0,o=t.state??0);let l=pack.burgs.filter(e=>e.i&&!e.removed&&e.coa);n.options.length=0,l.filter(e=>!e.state).length&&n.options.add(new Option(pack.states[0].name,`0`,!1,!o)),pack.states.filter(e=>e.i&&!e.removed).forEach(e=>{n.options.add(new Option(e.name,String(e.i),!1,e.i===o))}),i.options.length=0,i.options.add(new Option(``,`0`,!1,!s)),pack.provinces.filter(e=>!e.removed&&e.state===o).forEach(e=>{i.options.add(new Option(e.name,String(e.i),!1,e.i===s))}),a.options.length=0,a.options.add(new Option(``,`0`,!1,!c)),l.filter(e=>s?pack.cells.province[e.cell]===s:e.state===o).forEach(e=>{a.options.add(new Option(e.capital?`👑 ${e.name}`:e.name,String(e.i),!1,e.i===c))}),a.options[0].disabled=!0,m.trigger(M,t.coa),z()}function z(){let e=N;if(!e.coa)return;r(`emblemImage`).setAttribute(`href`,`#${M}`);let t=e.fullName||e.name;j===`burg`&&(t=`Burg of ${t}`),r(`emblemArmiger`).innerText=t??``;let n=r(`emblemShapeSelector`);n.value=e.coa.shield??(`icon`in e.coa?``:`heater`);let i=e.coa,a=V(),o=!!a&&!_.chargeIcon(a.charge)&&!!h.kind(a.charge);r(`emblemShapeRow`).classList.toggle(`hidden`,!o&&!(`icon`in i)),r(`emblemFieldRow`).classList.toggle(`hidden`,!o),r(`emblemChargeRows`).classList.toggle(`hidden`,!o),o&&!(`icon`in i)&&G(`emblemField`,i.t1),o&&a&&(G(`emblemChargeTincture`,a.t),r(`emblemChargeSizeSlider`).value=String(a.size??1),r(`emblemChargeSizeNumber`).value=String(a.size??1));let s=r(`emblemPaste`);if(document.activeElement!==s){let e=q(i);s.value=e?JSON.stringify(e):``}let c=e.coa.size??1;r(`emblemSizeSlider`).value=String(c),r(`emblemSizeNumber`).value=String(c)}function we(){let e=+r(`emblemStates`).value;if(e){if(!Q(`state`,e))return}else{let e=pack.burgs.filter(e=>e.i&&!e.removed&&!e.state);if(!e.length||!Q(`burg`,e[0].i))return}R()}function Te(){let e=+r(`emblemProvinces`).value;if(e){if(!Q(`province`,e))return}else if(!Q(`state`,+r(`emblemStates`).value))return;R()}function Ee(){Q(`burg`,+r(`emblemBurgs`).value)&&R()}function De(){let e=r(`emblemShapeSelector`),t=e.value,n=N.coa;if(t)`icon`in n?N.coa=B(n.icon,t,n):n.shield=t;else if(!(`icon`in n)){let t=n.charges?.[0]&&_.chargeArt(n.charges[0].charge);if(!t){e.value=n.shield??`heater`,v(`Только эмблема с гербовой фигурой может показывать её без щита`,!1,`warn`);return}N.coa={icon:t,size:n.size,x:n.x,y:n.y}}document.getElementById(M)?.remove(),m.trigger(M,N.coa),l(j,N.i),z()}function B(e,t,{size:n,x:r,y:i}){return{t1:`argent`,shield:t,charges:[{charge:_.chargeOf(e),t:`gules`,p:`e`,size:1.5}],size:n,x:r,y:i}}function V(){let e=N.coa;return`icon`in e?void 0:e.charges?.[0]}function Oe(){let e=N.coa;`icon`in e||(e.t1=r(`emblemField`).value,U())}function ke(){let e=V();e&&(e.t=r(`emblemChargeTincture`).value,U())}function H(e){let t=V(),n=+e.currentTarget.value;!t||!(n>0)||(t.size=n,U())}function U(){m.trigger(M,N.coa),z()}var W=[[`Metals`,y.metals],[`Colours`,y.colours],[`Stains`,y.stains]];function G(t,n){let i=r(t);i.innerHTML=(W.some(([,e])=>n in e)?``:`<option value="${e(n)}">${e(Ae(n))}</option>`)+W.map(([e,t])=>`<optgroup label="${e}">${Object.keys(t).map(e=>`<option value="${e}">${a(e)}</option>`).join(``)}</optgroup>`).join(``),i.value=n,i.previousElementSibling.style.background=je(n)}function Ae(e){let[t,n,r]=e.split(`-`);return r?`${a(t.replace(`semy_of_`,`semy of `).replace(/([a-z])([A-Z])/g,`$1 $2`).toLowerCase())}: ${n} and ${r}`:e}function je(e){let[,t,n]=e.split(`-`);return n?`repeating-linear-gradient(45deg, ${p[t]??t} 0 3px, ${p[n]??n} 3px 6px)`:p[e]??e}function Me(){oe(j,N)}function K(e){let t=o(+e.currentTarget.value||0,0,5);r(`emblemSizeSlider`).value=String(t),r(`emblemSizeNumber`).value=String(t);let{x:n,y:i}=N.coa;_.place(`${j}:${N.i}`,n??null,i??null,t),l(j,N.i)}function Ne(){_.regenerateOne(`${j}:${N.i}`),m.trigger(M,N.coa),l(j,N.i),z()}function q(e){if(`icon`in e){let t=g.get(e.icon);if(t?.kind!==`image`||!t.content.startsWith(`https://armoria.herokuapp.com/`))return null;try{return D(t.content)}catch{return null}}let{size:t,x:n,y:r,...i}=e;return i}function Pe(){let e=q(N.coa)??{t1:`sable`};e.charges?.some(({charge:e})=>!_.chargeIcon(e)&&h.kind(e))&&v(`Armoria не может показать рисунки из библиотеки иконок: таких гербовых фигур в ней нет`,!1,`warn`,6e3);let t=F.start({type:j,id:N.i,entity:N,queue:Promise.resolve()},`${j}:${N.i}`,options.map,new URL(I).origin),n=new URL(I);n.searchParams.set(`coa`,JSON.stringify(e)),n.searchParams.set(`from`,`FMG`),n.searchParams.set(`session`,t),n.searchParams.set(`returnOrigin`,location.origin),c(n.href)}async function Fe(){try{await Ie(j,N.i,D(r(`emblemPaste`).value)),J(`emblemPasteControl`)}catch(e){v(e.message,!1,`error`,6e3)}}async function Ie(e,t,n,r,i){let a=Z(e,t);if(!a)return i;let o=options.map,{size:s,x:c,y:u}=a.coa,d;if(ye(n))a.coa={...n,size:s,x:c,y:u},i&&g.get(i)&&!Object.keys(h.uses(i)).length&&g.remove(i);else{let t=i&&g.get(i)?i:void 0,l=t??g.newId(),f=r?await pe.fromFile(new File([r],`armoria.svg`,{type:`image/svg+xml`}),l,`emblem`):{kind:`image`,content:ge(n),viewBox:se};if(options.map!==o||Z(e,a.i)!==a)return i;t?g.update(t,f):g.add({id:l,...f}),a.coa={icon:l,size:s,x:c,y:u},d=l,t||v(`This COA uses art FMG cannot draw; it shows as Armoria's picture`,!1,`warn`,5e3)}return j===e&&N.i===t&&(m.trigger(M,a.coa),z()),l(e,t),d}window.addEventListener(`message`,e=>{let t=F.receive(e,options.map);if(!t)return;let n=t.target;n.queue=n.queue.then(async()=>{Z(n.type,n.id)===n.entity&&(n.picture=await Ie(n.type,n.id,t.coa,t.svg,n.picture))}).catch(e=>v(e.message,!1,`error`,6e3))});function Le(e){let t=N,n=j,r=M,i=options.map,a=t.coa,o=`icon`in a?``:a.charges?.[0]?_.chargeArt(a.charges[0].charge)??``:``;me.open({current:`icon`in a?a.icon:e===`charge`?o:``,preferCustom:!0,profile:`emblem`,onPick:a=>{if(!a||options.map!==i||Z(n,t.i)!==t)return;let o=t.coa;if(e===`whole`)t.coa={icon:a,size:o.size,x:o.x,y:o.y};else if(`icon`in o)t.coa=B(a,o.shield??_.getShield(t.culture??0,t.state),o);else{let e=_.chargeOf(a);o.charges?.length?o.charges[0]={...o.charges[0],charge:e}:o.charges=[{charge:e,t:/^(argent|or)$/.test(o.t1)?`червлень`:`или`,p:`e`,size:1.5}]}m.trigger(r,t.coa),l(n,t.i),N===t&&z()}})}function J(e){for(let[t,n]of Object.entries({emblemPasteControl:`emblemsPaste`,emblemDownloadControl:`emblemsDownload`})){let i=t===e&&r(t).classList.contains(`hidden`);r(t).classList.toggle(`hidden`,!i),r(n).classList.toggle(`pressed`,i),i&&r(t).querySelector(`input`)?.focus()}}async function Y(e){await m.trigger(M,N.coa);let t=document.getElementById(M);await w([t]);let n=+r(`emblemsDownloadSize`).value,a=await fe(t,n,e!==`svg`),o=document.createElement(`a`);o.download=`${i(`Emblem ${N.fullName||N.name}`)}.${e}`,e===`svg`?Re(a,o):ze(e,a,o,n),J(`emblemDownloadControl`)}function Re(e,t){t.href=e,t.click()}function ze(e,t,n,r){let i=document.createElement(`canvas`),a=i.getContext(`2d`);i.width=r,i.height=r;let o=new Image;o.src=t,o.onload=()=>{e===`jpeg`&&(a.fillStyle=`#fff`,a.fillRect(0,0,i.width,i.height)),a.drawImage(o,0,0,i.width,i.height);let t=i.toDataURL(`image/${e}`,.92);n.href=t,n.click(),window.setTimeout(()=>window.URL.revokeObjectURL(t),6e3)}}function X(e,t){return new XMLSerializer().serializeToString(de(e,t))}async function Be(){let e=i(`Emblems Gallery`),n=pack.states.filter(e=>e.i&&!e.removed&&e.coa),r=pack.provinces.filter(e=>e.i&&!e.removed&&e.coa),a=pack.burgs.filter(e=>e.i&&!e.removed&&e.coa);await Ve(n,r,a),await w([...document.querySelectorAll(`#coas > svg`)]);let o=`<a href="javascript:history.back()">Назад</a>`,s=`<div><h2>Государства</h2>${n.map(e=>{let t=document.getElementById(`stateCOA${e.i}`);return`<figure id="state_${e.i}"><a href="#provinces_${e.i}"><figcaption>${e.fullName}</figcaption>${X(t,200)}</a></figure>`}).join(``)}</div>`,c=n.map(e=>{let t=r.filter(t=>t.state===e.i),n=t.map(e=>{let t=document.getElementById(`provinceCOA${e.i}`);return`<figure id="province_${e.i}"><a href="#burgs_${e.i}"><figcaption>${e.fullName}</figcaption>${X(t,200)}</a></figure>`}).join(``);return t.length?`<div id="provinces_${e.i}">${o}<h2>Провинции ${e.fullName}</h2>${n}</div>`:``}).join(``),l=n.map(e=>{let t=a.filter(t=>t.state===e.i),n=r.filter(t=>t.state===e.i).map(e=>{let n=t.filter(t=>pack.cells.province[t.cell]===e.i),r=n.map(e=>{let t=document.getElementById(`burgCOA${e.i}`);return t?`<figure id="burg_${e.i}"><figcaption>${e.name}</figcaption>${X(t,200)}</figure>`:``}).join(``);return n.length?`<div id="burgs_${e.i}">${o}<h2>Города ${e.fullName}</h2>${r}</div>`:``}).join(``),i=t.filter(e=>!pack.cells.province[e.cell]).map(e=>{let t=document.getElementById(`burgCOA${e.i}`);return t?`<figure id="burg_${e.i}"><figcaption>${e.name}</figcaption>${X(t,200)}</figure>`:``}).join(``);return i&&(n+=`<div><h2>Города ${e.fullName} под прямым управлением</h2>${i}</div>`),n}).join(``),u=a.filter(e=>!e.state),d=u.length?`<div><h2>Независимые города</h2>${u.map(e=>{let t=document.getElementById(`burgCOA${e.i}`);return t?`<figure id="burg_${e.i}"><figcaption>${e.name}</figcaption>${X(t,200)}</figure>`:``}).join(``)}</div>`:``;t(`<!DOCTYPE html>
    <html>
      <head>
        <title>Галерея эмблем ${options.map.lore.name}</title>
      </head>
      <style type="text/css">
        body { margin: 0; padding: 1em; font-family: serif; }
        h1, h2 { font-family: "Forum"; }
        div { width: 100%; max-width: 1018px; margin: 0 auto; border-bottom: 1px solid #ddd; }
        figure { margin: 0 0 2em; display: inline-block; transition: 0.2s; }
        figure:hover { background-color: #f6f6f6; }
        figcaption { text-align: center; margin: 0.4em 0; width: 200px; font-family: "Overlock SC"; }
        address { width: 100%; max-width: 1018px; margin: 0 auto; }
        a { color: black; }
        figure > a { text-decoration: none; }
        div > a { float: right; font-family: var(--monospace); margin-top: 0.8em; }
      </style>
      <link href="https://fonts.googleapis.com/css2?family=Forum&family=Overlock+SC" rel="stylesheet" />
      <body>
        <div><h1>Галерея эмблем ${options.map.lore.name}</h1></div>
        ${s} ${c} ${l} ${d}
        <address>Создано в <a href="https://azgaar.github.io/Fantasy-Map-Generator" target="_blank">Генератор фантастических карт Azgaar</a>. Инструмент свободен, но изображения могут быть под авторским правом, см. <a target="_blank" href="https://github.com/Azgaar/Armoria#license">лицензию</a></address>
      </body>
    </html>`,`${e}.html`,`text/plain`)}async function Ve(e,t,n){v(`Preparing for download...`,!0,`warn`);let r=e.map(e=>m.trigger(`stateCOA${e.i}`,e.coa)),i=t.map(e=>m.trigger(`provinceCOA${e.i}`,e.coa)),a=n.map(e=>m.trigger(`burgCOA${e.i}`,e.coa)),o=[...r,...i,...a];await Promise.allSettled(o),ce()}function He(e){let t=Number(this.getAttribute(`x`))-e.x,n=Number(this.getAttribute(`y`))-e.y;e.on(`drag`,function(e){this.setAttribute(`x`,String(t+e.x)),this.setAttribute(`y`,String(n+e.y))}),e.on(`end`,function(e){let r=Number(this.parentNode.getAttribute(`font-size`))*Number.parseFloat(this.getAttribute(`width`)||`1`)/2,i=Ue(this.parentElement?.id),a=Number(this.dataset.i),c=i&&Number.isInteger(a)?Z(i,a):void 0;if(!i||!c)return;let{width:u,height:d}=options.map.graph,f=o(s(t+e.x+r,2),0,u),p=o(s(n+e.y+r,2),0,d);_.place(`${i}:${a}`,f,p,c.coa.size??null),l(i,a)})}function Ue(e){if(e===`burgEmblems`)return`burg`;if(e===`provinceEmblems`)return`province`;if(e===`stateEmblems`)return`state`}function Z(e,t){let n=e===`burg`?pack.burgs[t]:e===`province`?pack.provinces[t]:pack.states[t];return n?.coa?n:void 0}function Q(e,t){let n=Z(e,t);return n?(j=e,M=`${e}COA${t}`,N=n,!0):!1}function We(){n(`#emblems`).selectAll(`use`).call(ae().on(`drag`,He)).classed(`draggable`,!0)}function Ge(){P?.(),P=void 0,n(`#emblems`).selectAll(`use`).on(`.drag`,null).attr(`class`,null),$(`#emblemEditor`).dialog(`destroy`),r(`emblemEditor`).remove()}var Ke={open:L,openDefault:xe};export{Ke as EmblemsEditor};