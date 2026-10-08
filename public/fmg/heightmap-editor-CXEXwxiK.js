import{$n as e,F as t,H as n,Hn as r,J as i,L as a,Mn as o,N as s,On as c,P as l,Pn as u,Pt as d,U as f,V as p,Vn as m,Y as h,Yt as g,Zt as _,at as v,bn as y,dn as b,er as x,fn as ee,gn as S,mn as te,nr as C,on as ne,pn as re,vn as ie,yn as ae}from"./utils-BXzQ0Tym.js";import{t as w,tt as oe}from"./layers-Bcg3SU5R.js";import{t as se}from"./mean-4Awewi9R.js";import{t as ce}from"./drag-DdGpYDDb.js";import{n as le}from"./sin-DYm9hqTl.js";import{o as ue}from"./emblems-generator-BdUAGZhv.js";import{i as T,r as de,t as fe}from"./tooltips-P6FAPAdd.js";import{i as pe}from"./viewport-C0deAIKO.js";import{t as E}from"./state-B2hBYDzv.js";import{t as me}from"./controllers-DoYIZ-kt.js";import{a as he,r as ge,t as _e}from"./generation-pipeline-1xttKRf1.js";import{c as ve,i as D,n as O}from"./dialog-helpers-CJ5pbzaw.js";import{t as ye}from"./view-mode-CT3s7qnT.js";import{t as be}from"./graph-override-AthpXXA4.js";import{t as xe}from"./viewbox-events-3YWWeuSF.js";import{a as Se,o as Ce}from"./index-sJ7uR-QF.js";import{t as we}from"./brushUtils-B5xtY9tr.js";var k=18,Te=.96422,Ee=1,De=.82521,Oe=4/29,A=6/29,ke=3*A*A,Ae=A*A*A;function je(e){if(e instanceof j)return new j(e.l,e.a,e.b,e.opacity);if(e instanceof F)return Ie(e);e instanceof te||(e=ie(e));var t=P(e.r),n=P(e.g),r=P(e.b),i=Ne((.2225045*t+.7168786*n+.0606169*r)/Ee),a,o;return t===n&&n===r?a=o=i:(a=Ne((.4360747*t+.3850649*n+.1430804*r)/Te),o=Ne((.0139322*t+.0971045*n+.7141733*r)/De)),new j(116*i-16,500*(a-i),200*(i-o),e.opacity)}function Me(e,t,n,r){return arguments.length===1?je(e):new j(e,t,n,r??1)}function j(e,t,n,r){this.l=+e,this.a=+t,this.b=+n,this.opacity=+r}ae(j,Me,y(re,{brighter(e){return new j(this.l+k*(e??1),this.a,this.b,this.opacity)},darker(e){return new j(this.l-k*(e??1),this.a,this.b,this.opacity)},rgb(){var e=(this.l+16)/116,t=isNaN(this.a)?e:e+this.a/500,n=isNaN(this.b)?e:e-this.b/200;return t=Te*M(t),e=Ee*M(e),n=De*M(n),new te(N(3.1338561*t-1.6168667*e-.4906146*n),N(-.9787684*t+1.9161415*e+.033454*n),N(.0719453*t-.2289914*e+1.4052427*n),this.opacity)}}));function Ne(e){return e>Ae?e**(1/3):e/ke+Oe}function M(e){return e>A?e*e*e:ke*(e-Oe)}function N(e){return 255*(e<=.0031308?12.92*e:1.055*e**(1/2.4)-.055)}function P(e){return(e/=255)<=.04045?e/12.92:((e+.055)/1.055)**2.4}function Pe(e){if(e instanceof F)return new F(e.h,e.c,e.l,e.opacity);if(e instanceof j||(e=je(e)),e.a===0&&e.b===0)return new F(NaN,0<e.l&&e.l<100?0:NaN,e.l,e.opacity);var t=Math.atan2(e.b,e.a)*b;return new F(t<0?t+360:t,Math.sqrt(e.a*e.a+e.b*e.b),e.l,e.opacity)}function Fe(e,t,n,r){return arguments.length===1?Pe(e):new F(e,t,n,r??1)}function F(e,t,n,r){this.h=+e,this.c=+t,this.l=+n,this.opacity=+r}function Ie(e){if(isNaN(e.h))return new j(e.l,0,0,e.opacity);var t=e.h*ee;return new j(e.l,Math.cos(t)*e.c,Math.sin(t)*e.c,e.opacity)}ae(F,Fe,y(re,{brighter(e){return new F(this.h,this.c,this.l+k*(e??1),this.opacity)},darker(e){return new F(this.h,this.c,this.l-k*(e??1),this.opacity)},rgb(){return Ie(this).rgb()}}));var I=[{stroke:`#888`,width:.4,opacity:.8},{stroke:`#444`,width:.5,opacity:.8},{stroke:`#3d9df0`,width:.8,opacity:1},{stroke:`#1a6fd6`,width:1,opacity:1},{stroke:`#0a49ad`,width:1.2,opacity:1}],Le=2,Re=14,ze=.5;function Be(e){let{cells:n,points:r,spacing:i}=grid,a=e?Grid.findDeepDepressionLakes(n,options.generation.lakeElevationLimit):[],o=Uint8Array.from(n.h);for(let e of a)for(let t of e)o[t]=19;let{target:c,flux:u,depth:d,river:f}=We({...n,h:o},Ve(o)),p=i/Re,m=i*.25,h=C(i*.35,2),g=I.map(()=>[]),_=[],v=e=>x(Math.floor(Math.log2(u[e]/30)/2)+Le,0,f[e]?I.length-1:Le-1),y=e=>C(Math.min(.5+e/30,1),2);for(let e of n.i){if(d[e]>=ze&&_.push(`<polygon points="${Grid.getPolygon(e)}" fill-opacity="${y(d[e])}"/>`),c[e]===-1)continue;let[t,n]=r[e],[i,a]=r[c[e]],o=i-t,s=a-n,l=Math.hypot(o,s)||1,u=o/l,f=s/l,[p,h]=[t+u*l*.15,n+f*l*.15],[b,x]=[t+u*l*.7,n+f*l*.7],[ee,S]=[b-m*(u*.87-f*.5),x-m*(f*.87+u*.5)],[te,ne]=[b-m*(u*.87+f*.5),x-m*(f*.87-u*.5)];g[v(e)].push(`M${C(p,1)},${C(h,1)}L${C(b,1)},${C(x,1)}M${C(ee,1)},${C(S,1)}L${C(b,1)},${C(x,1)}L${C(te,1)},${C(ne,1)}`)}let b=g.map((e,t)=>{if(!e.length)return``;let{stroke:n,width:r,opacity:i}=I[t],a=`stroke="${n}" stroke-width="${C(r*p,2)}" opacity="${i}"`;return`<path d="${e.join(``)}" ${a}/>`}),ee=a.flat().map(e=>`<polygon points="${Grid.getPolygon(e)}"/>`),S=()=>{let e=t(`drainage`);if(e)return e;let n=s(`g`,`drainage`,{"pointer-events":`none`});return l(`debug`).append(n),n};S().innerHTML=`
    <pattern id="drainageHatch" width="${h}" height="${h}" patternUnits="userSpaceOnUse">
      <path d="M0,${h}L${h},0" stroke="#333" stroke-width="${C(.5*p,2)}"/>
    </pattern>
    <pattern id="drainageLakeHatch" width="${h}" height="${h}" patternUnits="userSpaceOnUse">
      <path d="M0,0L${h},${h}" stroke="#1a5fc8" stroke-width="${C(.8*p,2)}"/>
    </pattern>
    <g fill="url(#drainageHatch)" stroke="#000" stroke-width="${C(.3*p,2)}">${_.join(``)}</g>
    <g fill="url(#drainageLakeHatch)" stroke="#1a5fc8" stroke-width="${C(.5*p,2)}">${ee.join(``)}</g>
    <g fill="none">${b.join(``)}</g>`}var Ve=e=>Precipitation.compute(e,Temperature.compute(e));function He(){t(`drainage`)?.remove()}var Ue=1e-4;function We(e,t){let{c:n,b:r,h:i}=e,a=e.i.length,o=new Float64Array(a),s=new Uint8Array(a),c=new FlatQueue;for(let e=0;e<a;e++)i[e]>=20&&!r[e]||(o[e]=i[e],s[e]=1,c.push(e,i[e]));for(;c.length;){let e=c.pop();for(let t of n[e])s[t]||(s[t]=1,o[t]=Math.max(i[t],o[e]+Ue),c.push(t,o[t]))}let l=new Int32Array(a).fill(-1),u=new Float32Array(a),d=new Float32Array(a),f=[];for(let e=0;e<a;e++)if(!(i[e]<20||r[e])){f.push(e),d[e]=o[e]-i[e];for(let t of n[e])o[t]<o[l[e]===-1?e:l[e]]&&(l[e]=t)}let p=(Grid.getCellsDesired()/1e4)**.25;f.sort((e,t)=>o[t]-o[e]);for(let e of f)u[e]=Math.floor(u[e]+t[e]/p),l[e]!==-1&&(u[l[e]]+=u[e]);let m=new Uint8Array(a);for(let e of f)u[e]<30||l[e]===-1||(i[l[e]]>=20&&(m[e]=1),m[l[e]]=1);return{target:l,flux:u,depth:d,river:m}}var Ge=_(g),L=`heightmapEditor`,Ke=[`renderOcean`,`showDrainage`,`allowErosion`],qe=100,R,z=null,B=null;function Je(e){R=E.get(L,`filters`,()=>({cellType:`all`})),[`all`,`land`,`water`].includes(R.cellType)||(R.cellType=`all`),E.set(L,`filters`,R);let{mode:t,tool:n}=e||{};HeightmapGenerator.clearData(),lt(),c(`#viewbox`).selectAll(`#heights`).remove(),c(`#viewbox`).insert(`g`,`#terrs`).attr(`id`,`heights`),t?H(t,n):et(n)}Qe();function Ye(){D(`templateEditor`),l(`dialogs`).insertAdjacentHTML(`beforeend`,`<div id="templateEditor" class="dialog stable">
      <div id="templateTop">
        <i>Выбор шаблона: </i>
        <select id="templateSelect" style="width: 16em" data-prev="templateCustom" data-tip="Выберите базовый шаблон">
          <option value="custom" selected>Свой</option>
          <option value="volcano">Вулкан</option>
          <option value="highIsland">Высокий остров</option>
          <option value="lowIsland">Низкий остров</option>
          <option value="continents">Континенты</option>
          <option value="archipelago">Архипелаг</option>
          <option value="atoll">Атолл</option>
          <option value="mediterranean">Средиземье</option>
          <option value="peninsula">Полуостров</option>
          <option value="pangea">Пангея</option>
          <option value="isthmus">Перешеек</option>
          <option value="shattered">Раздробленный</option>
          <option value="taklamakan">Такламакан</option>
          <option value="oldWorld">Старый Свет</option>
          <option value="fractious">Раздробленный</option>
        </select>
      </div>
      <div id="templateTools">
        <button data-type="Hill" data-tip="Холм: маленький блок">H</button>
        <button data-type="Pit" data-tip="Яма: круглая впадина">P</button>
        <button data-type="Range" data-tip="Хребет: вытянутое повышение">R</button>
        <button data-type="Trough" data-tip="Впадина: вытянутое понижение">T</button>
        <button data-type="Strait" data-tip="Пролив: вертикальная или горизонтальная впадина по центру">Ю</button>
        <button data-type="Mask" data-tip="Маска: понижать ячейки у краёв или в центре карты">M</button>
        <button data-type="Invert" data-tip="Отзеркалить карту высот по осям">I</button>
        <button data-type="Add" data-tip="Прибавить или вычесть значение из всех высот в диапазоне">+</button>
        <button data-type="Multiply" data-tip="Умножить все высоты в диапазоне на множитель">*</button>
        <button
          data-type="Smooth"
          data-tip="Сгладить карту, заменив высоты средним значением соседей"
        >
          ~
        </button>
      </div>
      <div id="templateBody" data-changed="0" class="table" style="padding: 2px 0">
        <div data-type="Hill">
          <div class="icon-check" data-tip="Кликните, чтобы пропустить шаг"></div>
          <div style="width: 4em">Холм</div>
          <i class="icon-trash-empty pointer" data-tip="Удалить шаг"></i>
          <i class="icon-resize-vertical" data-tip="Тяните, чтобы изменить порядок"></i>
          <span
            >y:<input class="templateY" data-tip="Положение по Y в процентах (minY-maxY или Y)" value="47-53"
          /></span>
          <span
            >x:<input class="templateX" data-tip="Положение по X в процентах (minX-maxX или X)" value="65-75"
          /></span>
          <span
            >h:<input
              class="templateHeight"
              data-tip="Максимальная высота пятен; через дефис — случайное значение в диапазоне"
              value="90-100"
          /></span>
          <span
            >n:<input
              class="templateCount"
              data-tip="Сколько пятен добавить; через дефис — случайное значение в диапазоне"
              value="1"
          /></span>
        </div>
      </div>
      <div id="templateBottom">
        <button id="templateRun" data-tip="Выполнить шаблон" class="icon-play-circled2"></button>
        <button id="templateUndo" data-tip="Отменить последнее действие" class="icon-ccw" disabled></button>
        <button id="templateRedo" data-tip="Повторить действие" class="icon-cw" disabled></button>
        <button id="templateSave" data-tip="Скачать шаблон текстовым файлом" class="icon-download"></button>
        <button id="templateLoad" data-tip="Открыть ранее скачанный шаблон" class="icon-upload"></button>
        <button
          id="templateCA"
          data-tip="Найти или разместить свой шаблон на портале Cartography Assets"
          class="icon-drafting-compass"
          onclick="
            openURL('https://cartographyassets.com/asset-category/specific-assets/azgaars-generator/templates')
          "
        ></button>
        <button
          id="templateTutorial"
          data-tip="Урок по редактору шаблонов"
          class="icon-info"
          onclick="wiki('Heightmap-template-editor')"
        ></button>
        <label
          data-tip="Введите seed шаблона, чтобы каждый раз получать одну и ту же карту высот"
        >
          Seed: <input id="templateSeed" value="" type="number" min="1" max="999999999" step="1" style="width: 8em" />
        </label>
      </div>
    </div>`);let e=l(`templateBody`);$(`#templateBody`).sortable({items:`> div`,handle:`.icon-resize-vertical`,containment:`#templateBody`,axis:`y`}),e.addEventListener(`click`,t=>{let n=t.target;if(n.classList.contains(`icon-check`)){n.classList.remove(`icon-check`),n.classList.add(`icon-check-empty`),n.parentElement.style.opacity=`0.5`,e.dataset.changed=`1`;return}if(n.classList.contains(`icon-check-empty`)){n.classList.add(`icon-check`),n.classList.remove(`icon-check-empty`),n.parentElement.style.opacity=`1`;return}n.classList.contains(`icon-trash-empty`)&&n.parentElement.remove()}),l(`templateEditor`).addEventListener(`keypress`,e=>{e.key===`Enter`&&(e.preventDefault(),It())}),l(`templateTools`).addEventListener(`click`,At),l(`templateSelect`).addEventListener(`change`,Pt),l(`templateRun`).addEventListener(`click`,It),l(`templateUndo`).addEventListener(`click`,()=>Z(edits.n-1)),l(`templateRedo`).addEventListener(`click`,()=>Z(edits.n+1)),l(`templateSave`).addEventListener(`click`,Lt),l(`templateLoad`).addEventListener(`click`,Rt)}function Xe(){D(`imageConverter`),l(`dialogs`).insertAdjacentHTML(`beforeend`,`<div id="imageConverter" class="dialog stable">
      <div id="convertImageButtons">
        <button id="convertImageLoad" data-tip="Загрузить изображение для преобразования" class="icon-upload"></button>
        <button
          id="convertAutoLum"
          data-tip="Автоматически назначить цвета по светлоте (для монохромных изображений)"
          class="icon-adjust"
        ></button>
        <button
          id="convertAutoHue"
          data-tip="Автоматически назначить цвета по тону (для цветных изображений)"
          class="icon-paint-roller"
        ></button>
        <button
          id="convertAutoFMG"
          data-tip="Автоматически назначить цвета по схеме генератора (для выгруженных цветных карт высот)"
          class="icon-layer-group"
        ></button>
        <button id="convertColorsButton" data-tip="Максимальное число цветов" class="icon-signal"></button>
        <input id="convertColors" value="100" style="display: none" />
        <button
          id="convertCancel"
          data-tip="Отменить преобразование. Прежняя карта высот будет восстановлена"
          class="icon-cancel"
        ></button>
      </div>
      <div data-tip="Непрозрачность загруженного изображения" style="padding-top: 0.4em">
        <i>Непрозрачность наложения:</i><br />
        <input id="convertOverlay" type="range" min="0" max="1" step=".01" value="0" style="width: 12.6em" />
        <input id="convertOverlayNumber" type="number" min="0" max="1" step=".01" value="0" style="width: 4.2em" />
      </div>
      <div data-tip="Ниже выберите цвет и назначьте ему значение высоты" id="colorsSelect" style="display: none">
        <i>Высота: </i>
        <span id="colorsSelectValue"></span>
        <span>(<span id="colorsSelectFriendly">0</span>)</span><br />
        <div id="imageConverterPalette"></div>
      </div>
      <div data-tip="Выберите цвет, чтобы переназначить значение высоты" id="colorsAssigned" style="display: none">
        <i>Assigned colors (<span id="colorsAssignedNumber"></span>):</i>
        <div id="colorsAssignedContainer" class="colorsContainer"></div>
      </div>
      <div data-tip="Выберите цвет, чтобы назначить значение высоты" id="colorsUnassigned" style="display: none">
        <i>Unassigned colors (<span id="colorsUnassignedNumber"></span>):</i>
        <div id="colorsUnassignedContainer" class="colorsContainer"></div>
      </div>
      <button
        id="convertComplete"
        data-tip="Завершить преобразование. Все не заданные цвета будут считаться океаном"
        style="margin: 0.4em 0"
        class="glow"
      >
        Завершить преобразование
      </button>
    </div>`),c(`#imageConverterPalette`).selectAll(`div`).data(o(101)).enter().append(`div`).attr(`data-color`,e=>e).style(`background-color`,e=>Ge(1-(e<20?e-5:e)/100)).style(`width`,e=>e<40||e>68?`.2em`:`.1em`).on(`touchmove mousemove`,Ht).on(`click`,qt),l(`convertImageLoad`).addEventListener(`click`,Bt),l(`convertAutoLum`).addEventListener(`click`,()=>Jt(`lum`)),l(`convertAutoHue`).addEventListener(`click`,()=>Jt(`hue`)),l(`convertAutoFMG`).addEventListener(`click`,()=>Jt(`scheme`)),l(`convertColorsButton`).addEventListener(`click`,Yt),l(`convertComplete`).addEventListener(`click`,Xt),l(`convertCancel`).addEventListener(`click`,Zt),l(`convertOverlay`).addEventListener(`input`,function(){Q(+this.value)}),l(`convertOverlayNumber`).addEventListener(`input`,function(){Q(+this.value)})}var Ze=[];function Qe(){l(`paintBrushes`).addEventListener(`click`,ut),l(`applyTemplate`).addEventListener(`click`,Ot),l(`convertImage`).addEventListener(`click`,Vt),l(`heightmapPreview`).addEventListener(`click`,en),l(`heightmap3DView`).addEventListener(`click`,ye),l(`finalizeHeightmap`).addEventListener(`click`,nt);for(let e of Ke)l(e).addEventListener(`change`,function(){Options.set(t=>t.app.heightmapEditor[e]=this.checked),e===`renderOcean`&&K(),e!==`renderOcean`&&$e()})}function $e(){options.app.heightmapEditor.showDrainage?V():He()}function V(){if(customization!==1||!options.app.heightmapEditor.showDrainage)return;let e=l(`heightmapEditMode`).innerHTML;Be(e!==`keep`&&options.app.heightmapEditor.allowErosion)}function et(e){alertMessage.innerHTML=`Heightmap is a core element on which all other data (rivers, burgs, states etc) is based. So the best edit approach is to
    <i>erase</i> the secondary data and let the system automatically regenerate it on edit completion.
    <p><i>Стереть</i> режим также позволяет преобразовать изображение в карту высот или использовать редактор шаблонов.</p>
    <p>Вы можете <i>keep</i> данные, но береговую линию менять будет нельзя.</p>
    <p>Попробовать <i>risk</i> режим, чтобы менять береговую линию и сохранить данные. Данные восстановятся насколько смогут, но возможны непредсказуемые ошибки.</p>
    <p>Пожалуйста <span class="pseudoLink" onclick="window.Services.Save.toMachine()">сохранить карту</span> перед редактированием карты высот!</p>
    <p style="margin-bottom: 0">Check out ${v(`https://github.com/Azgaar/Fantasy-Map-Generator/wiki/Heightmap-customization`,`wiki`)} for guidance.</p>`,$(`#alert`).dialog({resizable:!1,title:`Правка карты высот`,width:`28em`,buttons:{Erase:()=>H(`erase`,e),Keep:()=>H(`keep`,e),Risk:()=>H(`risk`,e),Отмена:function(){$(this).dialog(`close`)}}})}function H(e,n){Ze=w.state.active,w.set([]),customization=1,O(),T(`Heightmap edit mode is active. Click on "Exit Customization" to finalize the heightmap`,!0),l(`options`).querySelectorAll(`.tabcontent`).forEach(e=>{e.style.display=`none`}),l(`options`).querySelector(`.tab > .active`).classList.remove(`active`),l(`customizationMenu`).style.display=`block`,l(`toolsTab`).classList.add(`active`),l(`heightmapEditMode`).innerHTML=e;for(let e of Ke)l(e).checked=options.app.heightmapEditor[e];e===`erase`?(ge(),R.cellType=`all`):e===`keep`?(w.get(`landmass`).getEl().replaceChildren(),R.cellType=`land`):e===`risk`&&(c(`#deftemp`).selectAll(`#land, #water`).selectAll(`path`).remove(),c(`#deftemp`).select(`#featurePaths`).selectAll(`path`).remove(),c(`#viewbox`).selectAll(`#coastline use, #lakes path, #oceanLayers path`).remove(),R.cellType=`all`);let r=t(`cellTypeFilter`);r&&(r.value=R.cellType),E.set(L,`filters`,R),l(`applyTemplate`).style.display=e===`erase`?`inline-block`:`none`,l(`convertImage`).style.display=e===`erase`?`inline-block`:`none`,l(`allowErosionBox`).style.display=e===`keep`?`none`:`inline-block`;let i=l(`exitCustomization`);if(sessionStorage.getItem(`noExitButtonAnimation`))i.style.display=`block`;else{sessionStorage.setItem(`noExitButtonAnimation`,`true`),i.style.opacity=`0`;let e=12*l(`uiSize`).value*11;i.style.right=`${(pe.width-e)/2}px`,i.style.bottom=`${pe.height/2}px`,i.style.transform=`scale(2)`,i.style.display=`block`,c(`#exitCustomization`).transition().duration(1e3).style(`opacity`,1).transition().duration(2e3).ease(le).style(`right`,`10px`).style(`bottom`,`10px`).style(`transform`,`scale(1)`)}let a=l(`layersPreset`);a.value=`heightmap`,a.disabled=!0,K(),V(),c(`#viewbox`).on(`touchmove mousemove`,tt),c(`#map`).on(`dblclick.zoom`,null),n===`templateEditor`?Ot():n===`imageConverter`?Vt():ut()}function tt(e){let[n,r]=a(e,this),i=Grid.findCell(n,r);l(`heightmapInfoX`).innerHTML=String(C(n)),l(`heightmapInfoY`).innerHTML=String(C(r)),l(`heightmapInfoCell`).innerHTML=String(i),l(`heightmapInfoHeight`).innerHTML=`${grid.cells.h[i]} (${U(grid.cells.h[i])})`,l(`tooltip`).dataset.main&&de();let o=t(`brushesButtons`)?.querySelector(`button.pressed`);if(o){if(o.id===`brushLine`){c(`#debug`).select(`line`).attr(`x2`,n).attr(`y2`,r);return}if(o.id===`brushFill`){Ce();return}Se(n,r,l(`heightmapBrushRadius`).valueAsNumber)}}function U(e){let t=options.map.units.height.unit,n=3.281;t===`m`?n=1:t===`f`&&(n=.5468);let r=-990;return e>=20?r=(e-18)**options.map.units.height.exponent:e<20&&e>0&&(r=(e-20)/e*50),`${C(r*n)} ${t}`}async function nt(){if(c(`#viewbox`).select(`#heights`).selectAll(`*`).size()<200){T(`Слишком мало суши. Нужно не менее 200 земельных ячеек!`,!1,`error`);return}if(t(`imageConverter`)){T(`Сначала выйдите из режима преобразования изображения`,!1,`error`);return}Reflect.deleteProperty(window,`edits`),Y(!0,!0),HeightmapGenerator.clearData(),customization=0,l(`customizationMenu`).style.display=`none`,l(`options`).querySelector(`.tab > button.active`).id===`toolsTab`&&(l(`toolsContent`).style.display=`block`),l(`layersPreset`).disabled=!1,l(`exitCustomization`).style.display=`none`,xe(),fe(),O(),resetZoom(),document.getElementById(`preview`)?.remove(),document.getElementById(`canvas3d`)&&me.View3d.enterStandard();let e=l(`heightmapEditMode`).innerHTML;try{e===`erase`?await rt():e===`keep`?it():e===`risk`&&st()}catch(e){ERROR&&console.error(e),T(`Failed to apply the edited heightmap: ${e.message}`,!1,`error`,6e3)}c(`#viewbox`).selectAll(`#heights`).remove(),He(),w.draw(`ocean`,`landmass`,`lakes`,`coastline`),w.set(Ze)}async function rt(){pack.cultures=[],pack.burgs=[],pack.states=[],pack.provinces=[],pack.religions=[],pack.relief=[];let e=options.app.heightmapEditor.allowErosion;await _e.run({erosion:e})}function it(){for(let e of pack.cells.i)pack.cells.h[e]=grid.cells.h[pack.cells.g[e]]}var at=e=>{let t=[];for(let n=0;n<e.p.length;n++)e.h[n]>=20&&t.push([e.p[n][0],e.p[n][1],n]);let n=ue(t);return(e,t)=>{let r=n.find(e,t);if(r)return n.remove(r),r[2]}};function ot(e){e.capital||pack.markets?.some(t=>t.centerBurgId===e.i)||(Burgs.remove(e.i),oe(`burg`,e.i))}function st(){INFO&&console.group(`Edit Heightmap`),TIME&&console.time(`restoreRiskedData`);let e=options.app.heightmapEditor.allowErosion,t=grid.cells.i.length,n=new Uint8Array(t),i=new Uint16Array(t),a={},o=new Uint16Array(t),s=new Uint16Array(t),l=new Uint16Array(t),u=new Uint16Array(t),d=new Uint16Array(t),f=new Uint16Array(t),p=new Uint16Array(t),m=new Uint16Array(t),h=new Uint16Array(t),g=new Uint8Array(t);for(let t of pack.cells.i){let r=pack.cells.g[t];n[r]=pack.cells.biome[t],d[r]=pack.cells.culture[t],i[r]=pack.cells.pop[t],a[r]=pack.cells.routes[t],o[r]=pack.cells.s[t],l[r]=pack.cells.state[t],u[r]=pack.cells.province[t],s[r]=pack.cells.burg[t],f[r]=pack.cells.religion[t],p[r]=pack.cells.good?.[t]||0,e||(m[r]=pack.cells.fl[t],h[r]=pack.cells.r[t],g[r]=pack.cells.conf[t])}for(let e of grid.cells.i)s[e]&&grid.cells.h[e]<20&&(grid.cells.h[e]=20);for(let e of pack.cultures){if(!e.i||e.removed)continue;let t=pack.cells.p[e.center];e.x=t[0],e.y=t[1]}let _=Features.captureUserData(),v=new Map;for(let e of pack.zones){if(!e.cells?.length)continue;let t=e.cells.map(e=>pack.cells.g[e]);v.set(e.i,r(t))}Features.markupGrid(),e&&Grid.addDeepDepressionLakes(),Temperature.generate(),Precipitation.generate(),Pack.generate(),Features.markupPack(),be.restore(),e&&(Rivers.generate(!0),Features.defineGroups()),Features.restoreUserData(_);let y=pack.cells.i.length;pack.cells.pop=new Float32Array(y),pack.cells.routes={},pack.cells.s=new Uint16Array(y),pack.cells.burg=new Uint16Array(y),pack.cells.state=new Uint16Array(y),pack.cells.province=new Uint16Array(y),pack.cells.culture=new Uint16Array(y),pack.cells.religion=new Uint16Array(y),pack.cells.biome=new Uint8Array(y),pack.cells.good=new Uint16Array(y),e||(pack.cells.r=new Uint16Array(y),pack.cells.conf=new Uint8Array(y),pack.cells.fl=new Uint16Array(y));for(let t of pack.cells.i){let r=pack.cells.g[t],s=pack.cells.h[t]>=20;e||(pack.cells.r[t]=h[r],pack.cells.conf[t]=g[r],pack.cells.fl[t]=m[r]),pack.cells.biome[t]=s&&n[r]?n[r]:Biomes.getId(grid.cells.prec[r],grid.cells.temp[r],pack.cells.h[t],!!pack.cells.r[t]),pack.cells.good[t]=p[r],s&&(pack.cells.culture[t]=d[r],pack.cells.pop[t]=i[r],pack.cells.routes[t]=a[r],pack.cells.s[t]=o[r],pack.cells.state[t]=l[r],pack.cells.province[t]=u[r],pack.cells.religion[t]=f[r])}let b=at(pack.cells);for(let e of pack.burgs){if(!e.i||e.removed)continue;let t=b(e.x,e.y);if(t===void 0){ERROR&&console.error(`[Data integrity] Burg ${e.i} has no available land cell after Risk restoration. Removing the burg`),e.capital&&(pack.states[e.state].capital=e.capital=0);let t=pack.markets?.find(t=>t.centerBurgId===e.i);t&&Markets.removeMarket(t.i),ot(e);continue}e.cell=t,e.feature=pack.cells.f[e.cell],pack.cells.burg[e.cell]=e.i,pack.cells.h[e.cell]<20&&ot(e),e.capital&&(pack.states[e.state].center=e.cell)}for(let e of pack.provinces){if(!e.i||e.removed)continue;let t=pack.cells.i.filter(t=>pack.cells.province[t]===e.i);if(!t.length){let t=e.state,n=pack.states[t].provinces;n.includes(e.i)&&pack.states[t].provinces.splice(n.indexOf(e.i),1),e.removed=!0;continue}e.burg&&!pack.burgs[e.burg].removed?e.center=pack.burgs[e.burg].cell:(e.center=t[0],e.burg=pack.cells.burg[e.center])}for(let e of pack.cultures)!e.i||e.removed||(e.center=Pack.findCell(e.x,e.y));States.getPoles(),States.findNeighbors(),States.collectStatistics(),e&&(Rivers.specify(),Features.defineNames());let x=new Map;for(let e of pack.cells.i){let t=pack.cells.g[e];x.has(t)||x.set(t,[]),x.get(t).push(e)}for(let e of pack.zones){let t=v.get(e.i);t?.length?e.cells=r(t.flatMap(e=>x.get(e)||[])):e.cells=[]}pack.goods?.length?(pack.markets=(pack.markets||[]).filter(e=>{let t=pack.burgs[e.centerBurgId];return!!(t&&!t.removed)}),Production.regenerateEconomy(),w.draw(`markets`,`goods`),w.draw(`trade`),ve()):(Goods.generate(),Markets.generate(),Production.produce(),States.collectTaxes()),Ice.generate(),c(`#ice`).selectAll(`*`).remove(),TIME&&console.timeEnd(`restoreRiskedData`),INFO&&console.groupEnd()}function W(){let e=m(edits),n=grid.cells.h.reduce((t,n,r)=>n===e[r]?t:t+1,0);if(T(`Cells changed: ${n}`),!n)return;let r=t(`cellTypeFilter`)?.value??R.cellType;if(r===`land`)for(let t of grid.cells.i)(e[t]<20||grid.cells.h[t]<20)&&(grid.cells.h[t]=e[t]);if(r===`water`)for(let t of grid.cells.i)(e[t]>=20||grid.cells.h[t]>=20)&&(grid.cells.h[t]=e[t]);K(),X()}var G=e=>h.getColor(e);function K(){let e=Array.from(grid.cells.i),t=options.app.heightmapEditor.renderOcean?e:e.filter(e=>grid.cells.h[e]>=20);c(`#viewbox`).select(`#heights`).selectAll(`polygon`).data(t).join(`polygon`).attr(`points`,e=>String(Grid.getPolygon(e))).attr(`id`,e=>`cell${e}`).attr(`fill`,e=>G(grid.cells.h[e]))}function q(e){let t=options.app.heightmapEditor.renderOcean;e.forEach(e=>{let n=c(`#viewbox`).select(`#heights`).select(`#cell${e}`);if(!t&&grid.cells.h[e]<20){n.remove();return}n.size()||(n=c(`#viewbox`).select(`#heights`).append(`polygon`).attr(`points`,String(Grid.getPolygon(e))).attr(`id`,`cell${e}`)),n.attr(`fill`,G(grid.cells.h[e]))})}function J(){let e=grid.cells.h.reduce((e,t)=>t>=20?e+1:e,0);l(`landmassCounter`).innerText=`${e} (${C(e/grid.cells.i.length*100)}%)`,l(`landmassAverage`).innerText=String(C(se(grid.cells.h)??0))}function Y(e,n){let r=(r,i)=>{let a=t(r);a&&(a.disabled=e);let o=t(i);o&&(o.disabled=n)};r(`undo`,`redo`),r(`templateUndo`,`templateRedo`)}function X(e){let t=edits.n;if(edits=Object.assign(edits.slice(0,t),{n:t+1}),edits[t]=grid.cells.h.slice(),edits.length>qe){let e=edits.length-qe;edits.splice(0,e),edits.n-=e}Y(edits.n<=1,!0),e||(J(),ct())}function ct(){document.getElementById(`preview`)&&tn(),document.getElementById(`canvas3d`)&&me.View3d.redraw(),V()}function Z(e){edits.n=e,Y(edits.n<=1,edits.n>=edits.length),edits[edits.n-1]!==void 0&&(grid.cells.h=edits[edits.n-1].slice(),K(),J(),ct())}function lt(){window.edits=Object.assign([],{n:0}),Y(!0,!0),X()}function ut(){document.getElementById(`brushesPanel`)||(dt(),$(`#brushesPanel`).dialog({title:`Кисти`,resizable:!1,position:{my:`right top`,at:`right-10 top+10`,of:`svg`},close:ft}))}function dt(){D(`brushesPanel`);let e=`<div id="brushesPanel" class="dialog stable">
    <div id="brushesButtons" style="display: inline-block">
      <button id="brushRaise" data-tip="Повышающая кисть: поднимает ячейки в радиусе на значение «Сила»">
        <svg viewBox="15 15 70 70" height="1em" width="1.6em">
          <path d="m20,39 h60 M50,85 v-35 l-12,8 m12,-8 l12,8" fill="none" stroke="#000" stroke-width="5" />
        </svg>
      </button>
      <button id="brushElevate" data-tip="Кисть «повышение»: тяните, чтобы плавно повышать высоту ячеек в радиусе на значение силы">
        <svg viewBox="15 15 70 70" height="1em" width="1.6em">
          <path d="m20,50 q30,-35 60,0 M50,85 v-35 l-12,8 m12,-8 l12,8" fill="none" stroke="#000" stroke-width="5" />
        </svg>
      </button>
      <button id="brushLower" data-tip="Кисть «понижение»: тяните, чтобы снижать высоту ячеек в радиусе на значение силы">
        <svg viewBox="15 15 70 70" height="1em" width="1.6em">
          <path d="M50,30 v35 l-12,-8 m12,8 l12,-8 M20,78 h60" fill="none" stroke="#000" stroke-width="5" />
        </svg>
      </button>
      <button id="brushDepress" data-tip="Кисть «понижение»: тяните, чтобы плавно снижать высоту ячеек в радиусе на значение силы">
        <svg viewBox="15 15 70 70" height="1em" width="1.6em">
          <path d="M50,30 v35 l-12,-8 m12,8 l12,-8 M20,63 q30,35 60,0" fill="none" stroke="#000" stroke-width="5" />
        </svg>
      </button>
      <button id="brushAlign" data-tip="Кисть «выравнивание»: тяните, чтобы задать высоту ячеек в радиусе по ячейке под курсором">
        <svg viewBox="15 15 70 70" height="1em" width="1.6em">
          <path d="m20,50 h56 m0,20 h-56" fill="none" stroke="#000" stroke-width="5" />
        </svg>
      </button>
      <button id="brushSmooth" data-tip="Сглаживающая кисть: ведите, чтобы выровнять высоты в радиусе по соседним ячейкам">
        <svg viewBox="15 15 70 70" height="1em" width="1.6em">
          <path d="m15,60 q15,-15 30,0 q15,15 35,0" fill="none" stroke="#000" stroke-width="5" />
        </svg>
      </button>
      <button id="brushDisrupt" data-tip="Кисть «разрушение»: тяните, чтобы случайно менять высоту ячеек в радиусе в пределах значения силы">
        <svg viewBox="15 15 70 70" height="1em" width="1.6em">
          <path d="m15,63 l15,-13 15,20 15,-20 15,19 15,-14" fill="none" stroke="#000" stroke-width="5" />
        </svg>
      </button>
      <button id="brushFill" data-tip="Заливка: кликните по замкнутой воде или по суше одной высоты, чтобы создать конус">
        <svg viewBox="20 10 60 60" height="1em" width="1.6em">
          <path d="M30,70 h40 M30,70 q0,-20 20,-20 q20,0 20,20" fill="none" stroke="#000" stroke-width="5" />
          <path d="M50,20 v25 M50,20 l-10,8 M50,20 l10,8" fill="none" stroke="#000" stroke-width="5" />
        </svg>
      </button>
      <button id="brushLine" data-tip="Линия: выберите две точки, чтобы менять высоты вдоль неё">
        <svg viewBox="0 -5 100 100" height="1em" width="1.6em">
          <path d="M0 90 L100 10" fill="none" stroke="#000" stroke-width="7"></path>
        </svg>
      </button>
    </div>
    <div id="brushesSliders" style="display: none">
      <div data-tip="Размер кисти. Горячие клавиши: + больше; – меньше">
        <slider-input id="heightmapBrushRadius" data-brush-size min="1" max="100" value="25">
          <div style="width: 3.5em">Radius:</div>
        </slider-input>
      </div>
      <div data-tip="Изменить силу кисти">
        <slider-input id="heightmapBrushPower" data-brush-size min="1" max="10" value="5">
          <div style="width: 3.5em">Power:</div>
        </slider-input>
      </div>
    </div>
    <div id="lineSlider" style="display: none">
      <div data-tip="Сила инструмента. Горячие клавиши: + больше; – меньше">
        <slider-input id="heightmapLinePower" data-brush-size min="-100" max="100" value="30">
          <div style="width: 5.5em">Power:</div>
        </slider-input>
      </div>
      <div data-tip="Изменить случайность линии. Ноль делает линию максимально прямой">
        <slider-input id="heightmapLineRandomness" min="0" max="100" value="30">
          <div style="width: 5.5em">Randomness:</div>
        </slider-input>
      </div>
    </div>
    <div data-tip="Ограничить кисть типами ячеек" style="margin-bottom: 0.6em">
      <label for="cellTypeFilter"><i>Ячеек к изменению:</i></label>
      <select id="cellTypeFilter">
        <option value="all" ${R.cellType===`all`?`selected`:``}>все ячейки</option>
        <option value="land" ${R.cellType===`land`?`selected`:``}>только суша</option>
        <option value="water" ${R.cellType===`water`?`selected`:``}>только вода</option>
      </select>
    </div>
    <div id="modifyButtons">
      <button id="undo" data-tip="Отменить последнее действие (Ctrl + Z)" class="icon-ccw" disabled></button>
      <button id="redo" data-tip="Повторить действие (Ctrl + Y)" class="icon-cw" disabled></button>
      <button id="rescaleShow" data-tip="Показать ползунок масштабирования" class="icon-exchange"></button>
      <button id="rescaleCondShow" data-tip="Масштабирование: менять высоту при выполнении условия" class="icon-if"></button>
      <button id="smoothHeights" data-tip="Чуть сгладить все высоты" class="icon-smooth"></button>
      <button id="disruptHeights" data-tip="Чуть перемешать (разрушить) высоты" class="icon-disrupt"></button>
      <button id="brushClear" data-tip="Установить высоту 0 для всех ячеек (стереть карту)" class="icon-eraser"></button>
    </div>
    <div id="rescaleSection" style="display: none">
      <button id="rescaleHide" data-tip="Скрыть ползунок масштабирования" class="icon-exchange"></button>
      <input id="rescaler" data-tip="Изменить высоту всех ячеек" type="range" min="-10" max="10" step="1" value="0" />
    </div>
    <div
      id="rescaleCondSection"
      data-tip="Если высота больше или равна X и меньше или равна Y, выполнить операцию Z с операндом V"
      style="display: none"
    >
      <button id="rescaleCondHide" data-tip="Скрыть масштабирование" class="icon-if"></button>
      <label>h ≥</label>
      <input id="rescaleLower" value="20" type="number" min="0" max="100" />
      <label>≤</label>
      <input id="rescaleHigher" value="100" type="number" min="1" max="100" />
      <label>⇒</label>
      <select id="conditionSign">
        <option value="multiply" selected>×</option>
        <option value="divide">÷</option>
        <option value="add">+</option>
        <option value="subtract">-</option>
        <option value="exponent">^</option>
      </select>
      <input id="rescaleModifier" type="number" value="0.9" min="0" max="1.5" step="0.01" />
      <button id="rescaleExecute" data-tip="Кликните, чтобы выполнить операцию" class="icon-play-circled2"></button>
    </div>
  </div>`;l(`dialogs`).insertAdjacentHTML(`beforeend`,e),pt()}function ft(){mt(),D(`brushesPanel`)}function pt(){l(`brushesButtons`).addEventListener(`click`,ht),l(`cellTypeFilter`).addEventListener(`change`,St),l(`undo`).addEventListener(`click`,()=>Z(edits.n-1)),l(`redo`).addEventListener(`click`,()=>Z(edits.n+1)),l(`rescaleShow`).addEventListener(`click`,()=>{l(`modifyButtons`).style.display=`none`,l(`rescaleSection`).style.display=`block`}),l(`rescaleHide`).addEventListener(`click`,()=>{l(`modifyButtons`).style.display=`block`,l(`rescaleSection`).style.display=`none`}),l(`rescaler`).addEventListener(`change`,e=>Ct(e.target.valueAsNumber)),l(`rescaleCondShow`).addEventListener(`click`,()=>{l(`modifyButtons`).style.display=`none`,l(`rescaleCondSection`).style.display=`block`}),l(`rescaleCondHide`).addEventListener(`click`,()=>{l(`modifyButtons`).style.display=`block`,l(`rescaleCondSection`).style.display=`none`}),l(`rescaleExecute`).addEventListener(`click`,wt),l(`smoothHeights`).addEventListener(`click`,Tt),l(`disruptHeights`).addEventListener(`click`,Et),l(`brushClear`).addEventListener(`click`,Dt)}function mt(){let e=document.querySelector(`#brushesButtons > button.pressed`);e&&e.classList.remove(`pressed`),xe(),c(`#map`).on(`dblclick.zoom`,null),c(`#viewbox`).on(`touchmove mousemove`,tt),c(`#debug`).selectAll(`#brushCircle, .lineCircle`).remove(),Ce(),l(`brushesSliders`).style.display=`none`,l(`lineSlider`).style.display=`none`}function ht(e){let t=e.target.closest(`#brushesButtons > button`);if(!t)return;if(t.classList.contains(`pressed`)){mt();return}mt(),t.classList.add(`pressed`);let n=l(`heightmapBrushRadius`).parentElement;n&&(n.style.display=t.id===`brushFill`?`none`:``),t.id===`brushLine`?(l(`lineSlider`).style.display=`block`,c(`#viewbox`).style(`cursor`,`crosshair`).on(`click`,gt)):t.id===`brushFill`?(l(`brushesSliders`).style.display=`block`,c(`#viewbox`).style(`cursor`,`crosshair`).on(`click`,_t)):(l(`brushesSliders`).style.display=`block`,c(`#viewbox`).style(`cursor`,`crosshair`).call(ce().on(`start`,bt)))}function gt(e){let[t,n]=a(e,this),r=Grid.findCell(t,n),i=c(`#debug`).selectAll(`.lineCircle`);if(!i.size()){c(`#debug`).append(`line`).attr(`id`,`brushCircle`).attr(`x1`,t).attr(`y1`,n).attr(`x2`,t).attr(`y2`,n),c(`#debug`).append(`circle`).attr(`data-cell`,r).attr(`class`,`lineCircle`).attr(`r`,6).attr(`cx`,t).attr(`cy`,n).attr(`fill`,`yellow`).attr(`stroke`,`#333`).attr(`stroke-width`,2);return}let o=+i.attr(`data-cell`);c(`#debug`).selectAll(`*`).remove();let s=l(`heightmapLinePower`).valueAsNumber;if(s===0){T(`Сила не должна быть нулевой`,!1,`error`);return}let u=l(`heightmapLineRandomness`).valueAsNumber/200,d=grid.cells.h,f=s>0?HeightmapGenerator.addRange.bind(HeightmapGenerator):HeightmapGenerator.addTrough.bind(HeightmapGenerator);HeightmapGenerator.setGraph(grid),f(`1`,String(Math.abs(s)),``,``,o,r,u);let p=HeightmapGenerator.getHeights(),m=l(`cellTypeFilter`).value,h=[];for(let e=0;e<d.length;e++)p[e]!==d[e]&&(m===`land`&&d[e]<20||m===`water`&&d[e]>=20||(d[e]=p[e],h.push(e)));q(h),X()}function _t(e){let[t,n]=a(e,this),r=Grid.findCell(t,n),i=grid.cells.h[r],o=i<20,s=l(`cellTypeFilter`).value;if(s===`water`){T(`Кисть «заливка» недоступна с фильтром «только водные ячейки»`,!1,`error`);return}if(s===`land`&&o){T(`Активен фильтр по суше, водные области залить нельзя`,!1,`error`);return}let{selection:c,reachedBorder:u}=vt(r,o,i);if(c.length<3){T(`Не найдено замкнутой области для заливки`,!1,`error`);return}if(o&&u){T(`Выбранная область воды выходит за край карты и не замкнута`,!1,`error`);return}let d=yt(c,o,i);d.length&&(q(d),W())}function vt(e,t,n){let{h:r,c:i,i:a}=grid.cells,o=new Uint8Array(a.length),s=[e],c=[],l=!1;for(;s.length;){let e=s.pop();o[e]||(o[e]=1,(t?r[e]<20:r[e]===n)&&(c.push(e),grid.cells.b[e]&&(l=!0),i[e].forEach(e=>{o[e]||s.push(e)})))}return{selection:c,reachedBorder:l}}function yt(e,t,n){let r=l(`heightmapBrushPower`).valueAsNumber*10,{h:i,c:a,i:o}=grid.cells,s=new Uint8Array(o.length),c=new Uint16Array(o.length),d=[];e.forEach(e=>{s[e]=1});let f=[],p=0;for(e.forEach(e=>{a[e].some(e=>!s[e])&&(s[e]=2,f.push(e))});p<f.length;){let e=f[p++],t=c[e]+1;a[e].forEach(e=>{s[e]===1&&(s[e]=2,c[e]=t,f.push(e))})}let m=u(e,e=>c[e])||0,h=t?20:n;return e.forEach(e=>{let t=m?c[e]/m:1,n=x(h+Math.max(1,Math.round(r*t)),0,100);n!==i[e]&&(i[e]=n,d.push(e))}),d}function bt(e){let t=l(`heightmapBrushRadius`).valueAsNumber,[n,r]=a(e,this),i=Grid.findCell(n,r),o=we(t/2,(e,n)=>{let r=Grid.findAll(e,n,t),a=r,o=l(`cellTypeFilter`).value;o===`land`?a=r.filter(e=>grid.cells.h[e]>=20):o===`water`&&(a=r.filter(e=>grid.cells.h[e]<20)),a?.length&&xt(a,i)});o.moveTo(n,r),e.on(`drag`,e=>{let[n,r]=a(e,this);Se(n,r,t),o.moveTo(n,r)}),e.on(`end`,W)}function xt(e,t){let n=l(`heightmapBrushPower`).valueAsNumber,r=ne(n,1),i=l(`cellTypeFilter`).value===`land`,a=l(`cellTypeFilter`).value===`water`,o=e=>x(e,i?20:0,a?19:100),s=grid.cells.h,c=document.querySelector(`#brushesButtons > button.pressed`).id;c===`brushRaise`?e.forEach(e=>{s[e]=!a&&s[e]<20?20:o(s[e]+n)}):c===`brushElevate`?e.forEach((t,n)=>{s[t]=o(s[t]+r(n/Math.max(e.length-1,1)))}):c===`brushLower`?e.forEach(e=>{s[e]=o(s[e]-n)}):c===`brushDepress`?e.forEach((t,n)=>{s[t]=o(s[t]-r(n/Math.max(e.length-1,1)))}):c===`brushAlign`?e.forEach(e=>{s[e]=o(s[t])}):c===`brushSmooth`?e.forEach(e=>{s[e]=C(((se(grid.cells.c[e].filter(e=>i?s[e]>=20:a?s[e]<20:!0).map(e=>s[e]))??0)+s[e]*(10-n)+.6)/(11-n),1)}):c===`brushDisrupt`&&e.forEach(e=>{s[e]=s[e]<15?s[e]:o(s[e]+n/1.6-Math.random()*n)}),q(e)}function St(){let e=l(`cellTypeFilter`);e.value===`land`&&l(`heightmapEditMode`).innerHTML===`keep`&&(T(`В режиме «Сохранить» береговую линию менять нельзя`,!1,`error`),e.value=`all`),R.cellType=e.value,E.set(L,`filters`,R)}function Ct(t){let n=l(`cellTypeFilter`).value===`land`,r=l(`cellTypeFilter`).value===`water`;grid.cells.h=grid.cells.h.map(i=>{if(n&&(i<20||i+t<20)||r&&i>=20)return i;let a=e(i+t);return r?Math.min(a,19):a}),W(),l(`rescaler`).value=`0`}function wt(){let e=`${l(`rescaleLower`).value}-${l(`rescaleHigher`).value}`,t=l(`conditionSign`).value,n=l(`rescaleModifier`).valueAsNumber;if(Number.isNaN(n)){T(`Операнд должен быть числом`,!1,`error`);return}if((t===`add`||t===`subtract`)&&!Number.isInteger(n)){T(`Операнд должен быть целым числом`,!1,`error`);return}HeightmapGenerator.setGraph(grid),t===`multiply`?HeightmapGenerator.modify(e,0,n,0):t===`divide`?HeightmapGenerator.modify(e,0,1/n,0):t===`add`?HeightmapGenerator.modify(e,n,1,0):t===`subtract`?HeightmapGenerator.modify(e,-1*n,1,0):t===`exponent`&&HeightmapGenerator.modify(e,0,1,n),grid.cells.h=HeightmapGenerator.getHeights(),W()}function Tt(){HeightmapGenerator.setGraph(grid),HeightmapGenerator.smooth(4,1.5),grid.cells.h=HeightmapGenerator.getHeights(),W()}function Et(){grid.cells.h=grid.cells.h.map(t=>t<15?t:e(t+2.5-Math.random()*4)),W()}function Dt(){let e=l(`cellTypeFilter`).value;if(e===`land`){T(`Недоступно с фильтром «только суша»`,!1,`error`);return}if(e===`water`){T(`Недоступно с фильтром «только вода»`,!1,`error`);return}if(!grid.cells.h.some(e=>e)){T(`Карта высот уже очищена, не нажимайте дважды без необходимости`,!1,`error`);return}grid.cells.h=new Uint8Array(grid.cells.i.length),c(`#viewbox`).select(`#heights`).selectAll(`*`).remove(),X()}function Ot(){document.getElementById(`templateEditor`)||(Ye(),$(`#templateEditor`).dialog({title:`Редактор шаблонов`,minHeight:`auto`,width:`fit-content`,resizable:!1,position:{my:`right top`,at:`right-10 top+10`,of:`svg`},close:kt}))}function kt(){$(`#templateEditor`).dialog(`destroy`),l(`templateEditor`).remove()}function At(e){let t=e.target;if(t.tagName!==`BUTTON`)return;let n=t.dataset.type;l(`templateBody`).dataset.changed=`1`,jt(n)}function jt(e,t,n,r,i){let a=l(`templateBody`);a.insertAdjacentHTML(`beforeend`,Mt(e,t,n,r,i));let o=a.querySelector(`div:last-child > span > .templateDist`);if(o&&o.addEventListener(`change`,Nt),n&&o&&o.tagName===`SELECT`){for(let e of Array.from(o.options))e.value===n&&(o.value=n);if(o.value!==n){let e=document.createElement(`option`);e.value=e.innerHTML=n,o.add(e),o.value=n}}}function Mt(e,t,n,r,i){let a=`<div data-type="${e}"><div class="icon-check" data-tip="Кликните, чтобы пропустить шаг"></div><div style="width:4em">${e}</div><i class="icon-trash-empty pointer" data-tip="Кликните, чтобы удалить шаг"></i><i class="icon-resize-vertical" data-tip="Тяните, чтобы изменить порядок"></i>`,o=`<span>y:
      <input class="templateY" data-tip="Диапазон размещения по Y в процентах (minY-maxY)" value=${i||`20-80`} />
    </span>`,s=`<span>x:
      <input class="templateX" data-tip="Диапазон размещения по X в процентах (minX-maxX)" value=${r||`15-85`} />
    </span>`,c=`<span>h:
      <input class="templateHeight" data-tip="Максимальная высота пятен; через дефис — случайное значение в диапазоне" value=${n||`40-50`} />
    </span>`,l=`<span>n:
      <input class="templateCount" data-tip="Сколько пятен добавить; через дефис — случайное значение в диапазоне" value=${t||`1-2`} />
    </span>`;return e===`Hill`||e===`Pit`||e===`Range`||e===`Trough`?`${a}${o}${s}${c}${l}</div>`:e===`Strait`?`${a}
      <span>d:
        <select class="templateDist" data-tip="Направление пролива">
          <option value="vertical" selected>vertical</option>
          <option value="horizontal">horizontal</option>
        </select>
      </span>
      <span>w:
        <input class="templateCount" data-tip="Ширина пролива; дефис задаёт случайный диапазон" value=${t||`2-7`} />
      </span>
    </div>`:e===`Invert`?`${a}
      <span>by:
        <select class="templateDist" data-tip="Отразить карту высот по оси" style="width: 7.8em">
          <option value="x" selected>x</option>
          <option value="y">y</option>
          <option value="xy">both</option>
        </select>
      </span>
      <span>n:
        <input class="templateCount" data-tip="Вероятность инверсии, диапазон 0-1" value=${t||`0.5`} />
      </span>
    </div>`:e===`Mask`?`${a}
      <span>f:
        <input class="templateCount"
          data-tip="Доля маскирования. 1 — полная изоляция (не допускать суши у краёв), 2 — половина и т.д. Отрицательное число меняет эффект на обратный"
          type="number" min=-10 max=10 value=${t||1} />
      </span>
    </div>`:e===`Add`?`${a}
      <span>to:
        <select class="templateDist" data-tip="Менять только сушу или все ячейки">
          <option value="all" selected>все ячейки</option>
          <option value="land">только суша</option>
          <option value="interval">interval</option>
        </select>
      </span>
      <span>v:
        <input class="templateCount" data-tip="Прибавить значение к высоте всех ячеек (допустимы отрицательные)"
        type="number" value=${t||-10} min=-100 max=100 step=1 />
      </span>
    </div>`:e===`Multiply`?`${a}
      <span>to:
        <select class="templateDist" data-tip="Менять только сушу или все ячейки">
          <option value="all" selected>все ячейки</option>
          <option value="land">только суша</option>
          <option value="interval">interval</option>
        </select>
      </span>
      <span>v:
        <input class="templateCount" data-tip="Умножить высоту всех ячеек на значение" type="number"
          value=${t||1.1} min=0 max=10 step=.1 />
      </span>
    </div>`:e===`Smooth`?`${a}
      <span>f:
        <input class="templateCount" data-tip="Доля сглаживания. 1 — полное, 2 — половинное и т.д."
          type="number" min=1 max=10 step=1 value=${t||2} />
      </span>
    </div>`:``}function Nt(e){let t=e.target;t.value===`interval`&&prompt(`Задайте интервал высот. Без пробелов, разделитель — дефис`,{default:`17-20`},e=>{let n=document.createElement(`option`);n.value=n.innerHTML=String(e),t.add(n),t.value=String(e)})}function Pt(e){let t=l(`templateBody`),n=t.querySelectorAll(`div`).length,r=+t.getAttribute(`data-changed`),i=e.target.value;if(!n||!r){Ft(i);return}alertMessage.innerHTML=`Are you sure you want to select a different template? All changes will be lost.`,$(`#alert`).dialog({resizable:!1,title:`Сменить шаблон`,buttons:{Изменить:function(){Ft(i),$(this).dialog(`close`)},Отмена:function(){$(this).dialog(`close`)}}})}function Ft(e){let t=l(`templateBody`);t.setAttribute(`data-changed`,`0`),t.innerHTML=``;let n=he[e]?.template;if(!n)return;let r=n.split(`
`);if(!r.length){T(`Heightmap template: no steps defined`,!1,`error`);return}for(let e of r){let t=e.trim().split(` `);jt(t[0],t[1],t[2],t[3],t[4])}}function It(){let e=l(`templateBody`).querySelectorAll(`#templateBody > div`);if(!e.length)return;let t=l(`templateSeed`).value;Math.random=aleaPRNG(t||d()),grid.cells.h=new Uint8Array(grid.points.length),HeightmapGenerator.setGraph(grid),lt();for(let t of e){if(t.style.opacity===`0.5`)continue;let e=t.querySelector(`.templateCount`)?.value||``,n=t.querySelector(`.templateHeight`)?.value||``,r=t.querySelector(`.templateDist`)?.value||``,i=t.querySelector(`.templateX`)?.value||``,a=t.querySelector(`.templateY`)?.value||``,o=t.dataset.type;o===`Hill`?HeightmapGenerator.addHill(e,n,i,a):o===`Pit`?HeightmapGenerator.addPit(e,n,i,a):o===`Range`?HeightmapGenerator.addRange(e,n,i,a):o===`Trough`?HeightmapGenerator.addTrough(e,n,i,a):o===`Strait`?HeightmapGenerator.addStrait(e,r):o===`Mask`?HeightmapGenerator.mask(+e):o===`Invert`?HeightmapGenerator.invert(+e,r):o===`Add`?HeightmapGenerator.modify(r,+e,1):o===`Multiply`?HeightmapGenerator.modify(r,0,+e):o===`Smooth`&&HeightmapGenerator.smooth(+e),grid.cells.h=HeightmapGenerator.getHeights(),X(`noStat`)}grid.cells.h=HeightmapGenerator.getHeights(),J(),K(),ct()}function Lt(){let e=l(`templateBody`);e.dataset.changed=`0`;let t=e.querySelectorAll(`#templateBody > div`);if(!t.length)return;let r=``;for(let e of Array.from(t)){if(e.style.opacity===`0.5`)continue;let t=e.getAttribute(`data-type`),n=e.querySelector(`.templateCount`)?.value||`0`,i=e.querySelector(`.templateHeight`)?.value||e.querySelector(`.templateDist`)?.value||`0`,a=e.querySelector(`.templateX`)?.value||`0`,o=e.querySelector(`.templateY`)?.value||`0`;r+=`${t} ${n} ${i} ${a} ${o}\r\n`}let i=`template_${Date.now()}.txt`;n(r,i)}function Rt(){z??=p(`.txt`),z.onchange=()=>i(z,zt),z.click()}function zt(e){let t=e.split(`\r
`);if(!t.length){T(`Не удалось разобрать шаблон, проверьте файл`,!1,`error`);return}l(`templateBody`).innerHTML=``;for(let e of t){let t=e.split(` `);if(t.length!==5){ERROR&&console.error(`Cannot parse step, wrong arguments count`,e);continue}jt(t[0],t[1],t[2],t[3],t[4])}}function Bt(){B??=p(`image/*`),B.onchange=()=>Ut.call(B),B.click()}function Vt(){if(document.getElementById(`imageConverter`))return;Bt(),O(`#imageConverter`),Xe(),$(`#imageConverter`).dialog({title:`Преобразование изображения`,maxHeight:pe.height*.8,minHeight:`auto`,width:`20em`,position:{my:`right top`,at:`right-10 top+10`,of:`svg`},beforeClose:$t});let e=document.createElement(`canvas`);e.id=`canvas`,e.width=options.map.graph.width,e.height=options.map.graph.height,document.body.insertBefore(e,l(`optionsContainer`)),Q(0),fe(),T(`Открыт конвертер изображений. Загрузите изображение и задайте высоту для каждого цвета`,!1,`warn`),grid.cells.h=new Uint8Array(grid.cells.i.length),c(`#viewbox`).select(`#heights`).selectAll(`*`).remove(),X()}function Ht(){let e=+this.getAttribute(`data-color`);l(`colorsSelectValue`).innerHTML=String(e),l(`colorsSelectFriendly`).innerHTML=U(e);let t=l(`imageConverterPalette`).querySelector(`.hoveredColor`);t&&(t.className=``),this.className=`hoveredColor`}function Ut(){let e=this.files[0];this.value=``;let t=new FileReader,n=new Image;n.id=`imageToConvert`,n.style.display=`none`,document.body.appendChild(n),n.onload=()=>{l(`canvas`).getContext(`2d`).drawImage(n,0,0,options.map.graph.width,options.map.graph.height),Wt(+l(`convertColors`).value),resetZoom()},t.onloadend=()=>{n.src=t.result},t.readAsDataURL(e)}function Wt(e){let t=l(`canvas`),n=document.createElement(`canvas`);n.width=grid.cellsX,n.height=grid.cellsY,n.getContext(`2d`).drawImage(t,0,0,grid.cellsX,grid.cellsY);let r=new RgbQuant({colors:e});r.sample(n);let i=r.reduce(n),a=r.palette(!0);c(`#viewbox`).select(`#heights`).selectAll(`*`).remove(),c(`#imageConverter`).selectAll(`div.color-div`).remove(),l(`colorsSelect`).style.display=`block`,l(`colorsUnassigned`).style.display=`block`,l(`colorsAssigned`).style.display=`none`,n.remove(),c(`#viewbox`).select(`#heights`).selectAll(`polygon`).data(Array.from(grid.cells.i)).join(`polygon`).attr(`points`,e=>String(Grid.getPolygon(e))).attr(`id`,e=>`cell${e}`).attr(`fill`,e=>`rgb(${i[e*4]}, ${i[e*4+1]}, ${i[e*4+2]})`).on(`click`,Gt);let o=a.map(e=>`rgb(${e[0]}, ${e[1]}, ${e[2]})`);c(`#colorsUnassignedContainer`).selectAll(`div`).data(o).enter().append(`div`).attr(`data-color`,e=>e).style(`background-color`,e=>e).attr(`class`,`color-div`).on(`click`,Kt),l(`colorsUnassignedNumber`).innerHTML=String(o.length)}function Gt(){let e=this.getAttribute(`fill`);l(`imageConverter`).querySelector(`div[data-color="${e}"]`)?.click()}function Kt(){c(`#viewbox`).select(`#heights`).selectAll(`.selectedCell`).attr(`class`,null);let e=this.classList.contains(`selectedColor`),t=l(`imageConverter`).querySelector(`div.selectedColor`);t&&t.classList.remove(`selectedColor`);let n=l(`imageConverterPalette`).querySelector(`div.hoveredColor`);if(n&&n.classList.remove(`hoveredColor`),l(`colorsSelectValue`).innerHTML=l(`colorsSelectFriendly`).innerHTML=`0`,e)return;if(this.classList.add(`selectedColor`),this.dataset.height){let e=+this.dataset.height;l(`imageConverterPalette`).querySelector(`div[data-color="${e}"]`)?.classList.add(`hoveredColor`),l(`colorsSelectValue`).innerHTML=String(e),l(`colorsSelectFriendly`).innerHTML=U(e)}let r=this.getAttribute(`data-color`);c(`#viewbox`).select(`#heights`).selectAll(`polygon.selectedCell`).classed(`selectedCell`,!1),c(`#viewbox`).select(`#heights`).selectAll(`polygon[fill='${r}']`).classed(`selectedCell`,!0)}function qt(){let e=+this.dataset.color,t=Ge(1-(e<20?e-5:e)/100),n=l(`imageConverter`).querySelector(`div.selectedColor`);n.style.backgroundColor=t,n.setAttribute(`data-color`,t),n.setAttribute(`data-height`,String(e)),c(`#viewbox`).select(`#heights`).selectAll(`.selectedCell`).each(function(){this.setAttribute(`fill`,t),this.setAttribute(`data-height`,String(e))}),n.parentNode.id===`colorsUnassignedContainer`&&(l(`colorsAssignedContainer`).appendChild(n),l(`colorsAssigned`).style.display=`block`,l(`colorsUnassignedNumber`).innerHTML=String(l(`colorsUnassignedContainer`).childElementCount-2),l(`colorsAssignedNumber`).innerHTML=String(l(`colorsAssignedContainer`).childElementCount-2))}function Jt(e){let t=l(`colorsUnassignedContainer`),n=t.querySelectorAll(`div`);if(!n.length&&(Wt(+l(`convertColors`).value),n=t.querySelectorAll(`div`),!n.length)){T(`Нет нераспределённых цветов. Загрузите изображение и нажмите кнопку ещё раз`,!1,`error`);return}let r=e=>{let t=S(e).h;return t>300&&(t-=360),t>170?Math.abs(t-250)/3|0:Math.abs(t-250+20)/3|0},i=e=>{let t=Me(e).l;return t<13?t/13*20|0:t|0},a=o(101).map(e=>G(e)),s=a.map(e=>S(e).h|0),u=e=>{let t=a.indexOf(e);if(t!==-1)return t;let n=S(e).h,r=s.reduce((e,t)=>Math.abs(t-n)<Math.abs(e-n)?t:e);return s.indexOf(r)},d=[],f=l(`colorsAssignedContainer`);n.forEach(t=>{let n=t.dataset.color,a=e===`hue`?r(n):e===`lum`?i(n):u(n),o=Ge(1-(a<20?(a-5)/100:a/100));if(c(`#viewbox`).select(`#heights`).selectAll(`polygon[fill='${n}']`).attr(`fill`,o).attr(`data-height`,a),d[a]){t.remove();return}t.style.backgroundColor=t.dataset.color=o,t.dataset.height=String(a),f.appendChild(t),d[a]=!0}),Array.from(f.children).sort((e,t)=>e.dataset.height-+t.dataset.height).forEach(e=>{f.appendChild(e)}),l(`colorsAssigned`).style.display=`block`,l(`colorsUnassigned`).style.display=`none`,l(`colorsAssignedNumber`).innerHTML=String(f.childElementCount-2)}function Yt(){prompt(`Please set maximum number of colors. <br>An actual number is usually lower and depends on color scheme`,{default:+l(`convertColors`).value,step:1,min:3,max:255},e=>{l(`convertColors`).value=String(e),Wt(+e)})}function Q(e){l(`convertOverlay`).value=l(`convertOverlayNumber`).value=String(e),l(`canvas`).style.opacity=String(e)}function Xt(){if(l(`colorsAssignedContainer`).childElementCount<3){T(`Сначала назначьте цвета высотам`,!1,`error`);return}c(`#viewbox`).select(`#heights`).selectAll(`polygon`).each(function(){let e=+(this.dataset.height??`0`)||0,t=+this.id.slice(4);grid.cells.h[t]=e}),c(`#viewbox`).select(`#heights`).selectAll(`polygon`).remove(),W(),Qt()}function Zt(){Qt(),c(`#viewbox`).select(`#heights`).selectAll(`polygon`).remove(),Z(edits.n-1)}function Qt(){document.getElementById(`canvas`)?.remove(),document.getElementById(`imageToConvert`)?.remove(),c(`#imageConverter`).selectAll(`div.color-div`).remove(),l(`colorsAssigned`).style.display=`none`,l(`colorsUnassigned`).style.display=`none`,l(`colorsSelectValue`).innerHTML=l(`colorsSelectFriendly`).innerHTML=`0`,c(`#viewbox`).style(`cursor`,`default`).on(`.drag`,null),T(`Heightmap edit mode is active. Click on "Exit Customization" to finalize the heightmap`,!0),$(`#imageConverter`).dialog(`destroy`),l(`imageConverter`).remove(),ut()}function $t(e){e.preventDefault(),e.stopPropagation(),alertMessage.innerHTML=`Are you sure you want to close the Image Converter? Click "Cancel" to keep editing. Click "Complete" to apply
  the conversion and close the tool. Click "Close" to discard the conversion and restore the previous heightmap.`,$(`#alert`).dialog({resizable:!1,title:`Закрыть преобразование изображения`,buttons:{Отмена:function(){$(this).dialog(`close`)},Завершить:function(){$(this).dialog(`close`),Xt()},Закрыть:function(){$(this).dialog(`close`),Qt(),c(`#viewbox`).select(`#heights`).selectAll(`polygon`).remove(),Z(edits.n-1)}}})}function en(){let e=document.getElementById(`preview`);if(e){e.remove();return}let t=document.createElement(`canvas`);t.id=`preview`,t.width=grid.cellsX,t.height=grid.cellsY,document.body.insertBefore(t,l(`optionsContainer`)),t.addEventListener(`mouseover`,()=>T(`Предпросмотр карты высот. Кликните, чтобы скачать изображение размером с экран`)),t.addEventListener(`click`,nn),tn()}function tn(){let e=document.getElementById(`preview`).getContext(`2d`),t=e.createImageData(grid.cellsX,grid.cellsY);grid.cells.h.forEach((e,n)=>{let r=(e<20?Math.max(e/1.5,0):e)/100*255,i=n*4;t.data[i]=r,t.data[i+1]=r,t.data[i+2]=r,t.data[i+3]=255}),e.putImageData(t,0,0)}function nn(){let e=document.getElementById(`preview`).toDataURL(`image/png`),t=new Image;t.src=e,t.onload=()=>{let e=document.createElement(`canvas`),n=e.getContext(`2d`);e.width=options.map.graph.width,e.height=options.map.graph.height,document.body.insertBefore(e,l(`optionsContainer`)),n.drawImage(t,0,0,options.map.graph.width,options.map.graph.height);let r=e.toDataURL(`image/png`),i=document.createElement(`a`);i.download=`${f(`Heightmap`)}.png`,i.href=r,i.click(),e.remove()}}var rn={open:Je,redrawDrainage:V};export{rn as HeightmapEditor};