import{Bn as e,Ct as t,H as n,L as r,Lt as i,M as a,On as o,P as s,Pn as c,U as l,Wn as u,a as d,ct as f,nr as p,o as m,r as h,y as g,z as _}from"./utils-BXzQ0Tym.js";import{$ as v,U as y,V as b,a as ee,it as te,o as x,t as S,tt as C,z as ne}from"./layers-Bcg3SU5R.js";import{i as w,n as T}from"./highlight-izWZujNC.js";import{t as E}from"./stratify-CGdiYggi.js";import{t as re}from"./pack-CyBKcrr4.js";import{i as D,t as ie}from"./tooltips-P6FAPAdd.js";import{t as O}from"./controllers-DoYIZ-kt.js";import{i as k,l as A,n as ae,r as j,s as oe}from"./dialog-helpers-CJ5pbzaw.js";import{t as M}from"./viewbox-events-3YWWeuSF.js";import{E as se,i as ce,r as le}from"./index-sJ7uR-QF.js";import{t as N}from"./highlighting-CeezudJT.js";import{a as ue,i as de,n as fe,r as pe}from"./table-XWt9IQic.js";import{t as me}from"./annex-mode-CW1g0uZQ.js";var P=`statesEditor`,F=`States`,I={my:`right top`,at:`right-10 top+10`,of:`svg`,collision:`fit`},L=[{key:`color`,width:`1.2em`,permanent:!0},{key:`name`,label:`Государство`,width:`7em`,permanent:!0,sortBy:e=>e.name||``,sortType:`alpha`},{key:`emblem`,width:`1.4em`},{key:`form`,label:`Форма`,width:`8em`,mobileHidden:!0,sortBy:e=>e.i&&e.formName||``,sortType:`alpha`},{key:`capital`,label:`Столица`,width:`7em`,sortBy:e=>e.i&&pack.burgs[e.capital]?.name||``,sortType:`alpha`},{key:`culture`,label:`Культура`,width:`10em`,mobileHidden:!0,sortBy:e=>e.i&&pack.cultures[e.culture]?.name||``,sortType:`alpha`},{key:`burgs`,label:`Города`,width:`5em`,mobileHidden:!0,sortBy:e=>e.burgs||0},{key:`cells`,label:`Ячейки`,width:`5em`,hidden:!0,mobileHidden:!0,sortBy:e=>e.cells||0},{key:`area`,label:`Площадь`,width:`7em`,mobileHidden:!0,defaultSort:`desc`,sortBy:e=>d(e.area||0)},{key:`population`,label:`Население`,width:`6em`,sortBy:e=>p((e.rural||0)*options.map.units.population.scale+(e.urban||0)*options.map.units.population.scale*options.map.units.population.urbanization.rate)},{key:`treasury`,label:`Казна`,width:`6em`,mobileHidden:!0,tip:`Кликните, чтобы отсортировать по казне государства. Клик по значению — посмотреть и изменить налоги`,sortBy:e=>e.treasury||0},{key:`type`,label:`Тип`,width:`5em`,hidden:!0,sortBy:e=>e.i&&e.type||``,sortType:`alpha`},{key:`expansionism`,label:`Экспансия`,width:`5em`,hidden:!0,sortBy:e=>e.i&&e.expansionism||0},{key:`note`,width:`1.1em`},{key:`locate`,width:`1.1em`},{key:`focus`,width:`1.1em`},{key:`lock`,width:`1.1em`},{key:`remove`,width:`1.4em`,permanent:!0}],R=pe({getData:()=>ce(P,pack.states.filter(e=>!e.removed),L),onUpdate:_e});function z(){customization||(ae(`#${P}, .stable`),S.show(`states`,`borders`),S.hide(`cultures`,`biomes`,`religions`),he(),States.collectStatistics(),R.reset(),$(`#${P}`).dialog({title:`Редактор государств`,resizable:!1,position:I,close:ge}))}function he(){k(P);let e=`<div id="${P}" class="dialog stable editorDialog">
    <div id="statesBodySection" class="table" data-type="absolute">
      ${de({dialogId:P,columns:L})}
    </div>

    <div id="statesFooter" class="totalLine">
      <div data-tip="Число государств" style="margin-left: 5px">States:&nbsp;<span id="statesFooterStates">0</span></div>
      <div data-tip="Всего городов" style="margin-left: 12px" data-col="burgs">Burgs:&nbsp;<span id="statesFooterBurgs">0</span></div>
      <div data-tip="Площадь суши" style="margin-left: 12px" data-col="area">Land Area:&nbsp;<span id="statesFooterArea">0</span></div>
      <div data-tip="Всего населения" style="margin-left: 12px" data-col="population">Population:&nbsp;<span id="statesFooterPopulation">0</span></div>
    </div>

    <div id="statesBottom" class="editorToolbar">
      <button id="statesEditorRefresh" data-tip="Обновить редактор" class="icon-cw"></button>
      <button id="statesEditStyle" data-tip="Изменить стиль государств в редакторе стиля" class="icon-adjust"></button>
      <button id="statesLegend" data-tip="Переключить окно легенды" class="icon-list-bullet"></button>
      <button id="statesPercentage" data-tip="Переключить проценты / абсолютные значения" class="icon-percent"></button>
      <button id="statesChart" data-tip="Пузырьковая диаграмма государств" class="icon-chart-area"></button>

      <button id="statesRegenerate" data-tip="Показать меню пересоздания и больше данных" class="icon-cog-alt"></button>
      <div id="statesRegenerateButtons" style="display: none">
        <button id="statesRegenerateBack" data-tip="Скрыть меню пересоздания" class="icon-cog-alt"></button>
        <button id="statesRandomize" data-tip="Перемешать «Расширение государств» и пересчитать государства и провинции" class="icon-shuffle"></button>
        <button id="statesRecalculate" data-tip="Пересчитать государства по текущим значениям признаков роста" class="icon-retweet"></button>
        <div data-tip="Разрешить немедленный эффект для нейтрального расстояния, экспансии и типов государств" style="display: inline-block">
          <input id="statesAutoChange" class="checkbox" type="checkbox" />
          <label for="statesAutoChange" class="checkbox-label"><i>автоприменение изменений</i></label>
        </div>
        <div data-tip="Разрешить системе менять надписи государств при изменении данных о государствах" style="display: inline-block">
          <input id="adjustLabels" class="checkbox" type="checkbox" />
          <label for="adjustLabels" class="checkbox-label"><i>автосмена надписей</i></label>
        </div>
      </div>

      <button id="statesManually" data-tip="Вручную переназначить государства" class="icon-brush"></button>

      <button id="statesAdd" data-tip="Добавить новое государство. Shift — добавить несколько" class="icon-plus"></button>
      <button id="statesMerge" data-tip="Объединить несколько государств в одно" class="icon-layer-group"></button>
      <button id="statesAnnex" data-tip="Присоединить государства: кликните по присоединяющему государству, затем по поглощаемым. Shift — продолжать присоединение" class="icon-crown"></button>
      <button id="statesExport" data-tip="Скачать данные государств в текстовый файл (.csv)" class="icon-download"></button>
    </div>
  </div>`;s(`dialogs`).insertAdjacentHTML(`beforeend`,e),le(P,R.reset),N(P,({cellId:e})=>pack.cells.h[e]<20?void 0:pack.cells.state[e]),fe({dialogId:P,columns:L,onUpdate:()=>A(P,{width:`fit-content`,position:I})}),s(`statesEditorRefresh`).addEventListener(`click`,B),s(`statesEditStyle`).addEventListener(`click`,()=>void O.StyleEditor.open(`states`)),s(`statesLegend`).addEventListener(`click`,Ae),s(`statesPercentage`).addEventListener(`click`,K),s(`statesChart`).addEventListener(`click`,q),s(`statesRegenerate`).addEventListener(`click`,je),s(`statesRegenerateBack`).addEventListener(`click`,Ne),s(`statesRecalculate`).addEventListener(`click`,()=>J(!0)),s(`statesRandomize`).addEventListener(`click`,Me),s(`statesManually`).addEventListener(`click`,Pe),s(`statesAdd`).addEventListener(`click`,Ie),s(`statesMerge`).addEventListener(`click`,Re),s(`statesAnnex`).addEventListener(`click`,Q.toggle),s(`statesExport`).addEventListener(`click`,Be),s(`statesBodySection`).addEventListener(`click`,e=>{let t=e.target,n=t.classList,r=t.closest(`.states`);if(!r)return;let i=Number(r.dataset.id);t.tagName===`FILL-BOX`?ve(t):n.contains(`name`)?G(i):n.contains(`coaIcon`)?O.EmblemsEditor.open(`state`,`stateCOA${i}`,pack.states[i]):n.contains(`icon-star-empty`)?Ce(i):n.contains(`icon-dot-circled`)?O.BurgsOverview.open({stateId:i}):n.contains(`statePopulation`)?xe(i):n.contains(`stateTreasury`)?Se(i):n.contains(`icon-book`)?O.NotesEditor.open({type:`state`,id:i}):n.contains(`icon-pin`)?De(i,n):n.contains(`icon-target`)?T(o(`#regions`).select(`#state${i}`).node(),4):n.contains(`icon-trash-empty`)?Oe(i):(n.contains(`icon-lock`)||n.contains(`icon-lock-open`))&&Ve(i,n)}),s(`statesBodySection`).addEventListener(`change`,e=>{let t=e.target,n=t.classList,r=t.closest(`.states`);if(!r)return;let i=+r.dataset.id;n.contains(`stateCulture`)?we(i,r,t.value):n.contains(`cultureType`)?Te(i,r,t.value):n.contains(`statePower`)&&Ee(i,r,t.value)})}function ge(){customization===3&&Y(),Q.exit(),O.ColorPicker.close(),o(`#debug`).selectAll(`.highlight`).remove();let e=R.view();e.rows=[],e.all=[],k(P)}function B(){States.collectStatistics(),R.refresh()}function _e(e){let t=m(),n=0,r=0,i=0;for(let t of e.all){n+=d(t.area||0);let e=(t.rural||0)*options.map.units.population.scale,a=(t.urban||0)*options.map.units.population.scale*options.map.units.population.urbanization.rate;r+=p(e+a),i+=t.burgs||0}let a=``;for(let n of e.rows){let e=d(n.area||0),r=(n.rural||0)*options.map.units.population.scale,i=(n.urban||0)*options.map.units.population.scale*options.map.units.population.urbanization.rate,s=p(r+i),c=`Total population: ${g(s)}; Rural population: ${g(r)}; Urban population: ${g(i)}. Click to change`,l=o(`#deftemp`).select(`#fog #focusState${n.i}`).size(),u=`Current treasury: 🟡 ${g(n.treasury)}. Sales Tax: ${p((n.salesTax||0)*100,1)}%. Poll Tax: ${p((n.pollTax||0)*100,1)}%. Click to view and edit taxes`;if(!n.i){a+=`<div
        class="states"
        data-id=${n.i}
        data-name="${n.name}"
        data-cells=${n.cells}
        data-area=${e}
        data-population=${s}
        data-burgs=${n.burgs}
        data-treasury="0"
        data-color=""
        data-form=""
        data-capital=""
        data-culture=""
        data-type=""
        data-expansionism=""
      >
        <svg width="1em" height="1em" class="placeholder" data-col="color"></svg>
        <input data-tip="Название нейтральных земель. Кликните, чтобы изменить" class="stateName name pointer italic" value="${n.name}" readonly data-col="name" />
        <svg class="coaIcon placeholder" viewBox="0 0 200 200" data-col="emblem"></svg>
        <input class="stateForm placeholder" value="none" data-col="form" />
        <div data-col="capital">
          <span class="icon-star-empty placeholder"></span>
          <div class="stateCapital placeholder"></div>
        </div>
        <select class="stateCulture placeholder" data-col="culture">${V(0)}</select>
        <div data-col="burgs">
          <span data-tip="Кликните, чтобы посмотреть нейтральные города" class="icon-dot-circled pointer" style="padding-right: 1px"></span>
          <div data-tip="Число городов" class="stateBurgs">${n.burgs}</div>
        </div>
        <div data-col="cells">
          <span data-tip="Число ячеек" class="icon-check-empty"></span>
          <div data-tip="Число ячеек" class="stateCells">${n.cells}</div>
        </div>
        <div data-col="area">
          <span data-tip="Площадь нейтральных земель" style="padding-right: 4px" class="icon-map-o"></span>
          <div data-tip="Площадь нейтральных земель" class="stateArea">${g(e)} ${t}</div>
        </div>
        <div data-col="population">
          <span data-tip="${c}" class="icon-male"></span>
          <div data-tip="${c}" class="statePopulation pointer">${g(s)}</div>
        </div>
        <div data-tip="Нейтральные земли не платят налогов" class="stateTreasury placeholder" data-col="treasury"></div>
        <select class="cultureType placeholder" data-col="type">${H(0)}</select>
        <div data-col="expansionism">
          <span class="icon-resize-full placeholder"></span>
          <input class="statePower placeholder" type="number" value="0" />
        </div>
        <div data-col="note"></div>
        <div data-col="locate"></div>
        <div data-col="focus"></div>
        <div data-col="lock"></div>
        <div data-col="remove"></div>
      </div>`;continue}let f=pack.burgs[n.capital].name;te.trigger(`stateCOA${n.i}`,n.coa),a+=`<div
      class="states"
      data-id=${n.i}
      data-name="${n.name}"
      data-form="${n.formName}"
      data-capital="${f}"
      data-color="${n.color}"
      data-cells=${n.cells}
      data-area=${e}
      data-population=${s}
      data-burgs=${n.burgs}
      data-treasury="${n.treasury}"
      data-culture=${pack.cultures[n.culture].name}
      data-type=${n.type}
      data-expansionism=${n.expansionism}
    >
      <fill-box fill="${n.color}" data-col="color"></fill-box>
      <input data-tip="Название государства. Кликните, чтобы изменить" class="stateName name pointer" value="${n.name}" readonly data-col="name" />
      <svg data-tip="Кликните, чтобы посмотреть и изменить эмблему государства" class="coaIcon pointer" viewBox="0 0 200 200" data-col="emblem"><use href="#stateCOA${n.i}"></use></svg>
      <input data-tip="Название типа государства. Кликните, чтобы изменить" class="stateForm name pointer" value="${n.formName}" readonly data-col="form" />
      <div data-col="capital">
        <span data-tip="Столица государства. Кликните, чтобы приблизить" class="icon-star-empty pointer"></span>
        <div data-tip="Название столицы" class="stateCapital">${f}</div>
      </div>
      <select data-tip="Господствующая культура. Кликните, чтобы изменить" class="stateCulture" data-col="culture">${V(n.culture)}</select>
      <div data-col="burgs">
        <span data-tip="Кликните, чтобы посмотреть города государства" style="padding-right: 1px" class="icon-dot-circled pointer"></span>
        <div data-tip="Число городов" class="stateBurgs">${n.burgs}</div>
      </div>
      <div data-col="cells">
        <span data-tip="Число ячеек" class="icon-check-empty"></span>
        <div data-tip="Число ячеек" class="stateCells">${n.cells}</div>
      </div>
      <div data-col="area">
        <span data-tip="Площадь государства" style="padding-right: 4px" class="icon-map-o"></span>
        <div data-tip="Площадь государства" class="stateArea">${g(e)} ${t}</div>
      </div>
      <div data-col="population">
        <span data-tip="${c}" class="icon-male"></span>
        <div data-tip="${c}" class="statePopulation pointer">${g(s)}</div>
      </div>
      <div data-tip="${u}" class="stateTreasury pointer" data-col="treasury">🟡 ${g(n.treasury)}</div>
      <select data-tip="Тип государства. Задаёт модель роста. Кликните, чтобы изменить" class="cultureType" data-col="type">${H(n.type)}</select>
      <div data-col="expansionism">
        <span data-tip="Экспансионизм государства" class="icon-resize-full"></span>
        <input data-tip="Экспансионизм (задаёт соревновательный размер). Меняйте, чтобы пересчитать государства"
          class="statePower" type="number" min="0" max="99" step=".1" value=${n.expansionism} />
      </div>
      ${oe(`this state`)}
      <span data-col="locate" data-tip="Найти государство" class="icon-target"></span>
      <span data-col="focus" data-tip="Сосредоточиться на государстве" class="icon-pin ${l?``:` inactive`}"></span>
      <span data-col="lock" data-tip="Заблокировать государство, чтобы защитить от пересоздания" class="icon-lock${n.lock?``:`-open`}"></span>
      <span data-col="remove" data-tip="Удалить государство" class="icon-trash-empty"></span>
    </div>`}let c=s(`statesBodySection`);c.querySelectorAll(`:scope > .states`).forEach(e=>{e.remove()}),c.insertAdjacentHTML(`beforeend`,a),s(`statesFooterStates`).innerHTML=String(pack.states.filter(e=>e.i&&!e.removed).length),s(`statesFooterBurgs`).innerHTML=String(i),s(`statesFooterArea`).innerHTML=g(n)+t,s(`statesFooterArea`).dataset.area=String(n),s(`statesFooterPopulation`).innerHTML=g(r),s(`statesFooterPopulation`).dataset.population=String(r),ue(s(`statesFooter`),e,R.goto),s(`statesBodySection`).querySelectorAll(`:scope > .states`).forEach(e=>{e.addEventListener(`mouseenter`,U),e.addEventListener(`mouseleave`,W)}),s(`statesBodySection`).dataset.type===`percentage`&&(s(`statesBodySection`).dataset.type=`absolute`,K()),A(P,{width:`fit-content`,position:I})}function V(e){let t=``;return pack.cultures.forEach(n=>{n.removed||(t+=`<option ${n.i===e?`selected`:``} value="${n.i}">${n.name}</option>`)}),t}function H(e){let t=``;return[`Generic`,`River`,`Lake`,`Naval`,`Nomadic`,`Hunting`,`Highland`].forEach(n=>{t+=`<option ${e===n?`selected`:``} value="${n}">${n}</option>`}),t}function U(e){if(!S.isOn(`states`)||o(`#deftemp`).select(`#fog path`).size())return;let t=+e.target.dataset.id;customization||!t||w(o(`#regions`).select(`#state${t}`).attr(`d`))}function W(){o(`#debug`).selectAll(`.highlight`).each(function(){o(this).transition().duration(1e3).attr(`opacity`,0).remove()})}function ve(e){let t=e.getAttribute(`fill`)||`#ffffff`,n=+e.closest(`.states`).dataset.id;O.ColorPicker.open(t,t=>{e.fill=t,pack.states[n].color=t,S.draw(`states`),S.draw(`military`)})}function G(e){ye();let n=s(`stateNameEditorCustomForm`),r=s(`stateNameEditorSelectForm`);n.value=``,n.style.display===`inline-block`&&(n.style.display=`none`,r.style.display=`inline-block`);let o=pack.states[e];s(`stateNameEditor`).dataset.state=String(e),s(`stateNameEditorShort`).value=o.name||``,a(r,o.formName||``),s(`stateNameEditorFull`).value=o.fullName||``,$(`#stateNameEditor`).dialog({resizable:!1,title:`Изменить название государства`,buttons:{Применить:function(){p(o),$(this).dialog(`close`)},Отмена:function(){$(this).dialog(`close`)}},position:{my:`center`,at:`center`,of:`svg`},close:be}),s(`stateNameEditorShortCulture`).addEventListener(`click`,c),s(`stateNameEditorShortRandom`).addEventListener(`click`,l),s(`stateNameEditorShortSpeak`).addEventListener(`click`,()=>f(s(`stateNameEditorShort`).value)),s(`stateNameEditorAddForm`).addEventListener(`click`,u),s(`stateNameEditorCustomForm`).addEventListener(`change`,u),s(`stateNameEditorFullRegenerate`).addEventListener(`click`,d),s(`stateNameEditorFullSpeak`).addEventListener(`click`,()=>f(s(`stateNameEditorFull`).value));function c(){let e=+s(`stateNameEditor`).dataset.state,t=pack.states[e].culture,n=Names.getState(Names.getCultureShort(t),t);s(`stateNameEditorShort`).value=n}function l(){let e=i(Names.nameBases.length-1),t=Names.getState(Names.getBase(e),void 0,e);s(`stateNameEditorShort`).value=t}function u(){let e=n.value,t=n.style.display===`inline-block`;n.style.display=t?`none`:`inline-block`,r.style.display=t?`inline-block`:`none`,e&&t&&a(r,e),n.value=``}function d(){let e=s(`stateNameEditorShort`).value,n=s(`stateNameEditorSelectForm`).value;s(`stateNameEditorFull`).value=r();function r(){if(!n)return e;if(!e&&n)return`The ${n}`;let r=s(`stateNameEditorFullRegenerate`),i=+r.dataset.tick;return r.dataset.tick=String(i+1),i%2?`${t(e)} ${n}`:`${n} of ${e}`}}function p(e){let t=s(`stateNameEditorShort`).value.trim(),n=s(`stateNameEditorSelectForm`).value,r=s(`stateNameEditorFull`).value.trim(),i=e.fullName,a=t!==e.name||n!==(e.formName??``)||r!==i;t&&t!==e.name&&States.rename(e.i,t),n!==(e.formName??``)&&States.setForm(e.i,n),r&&r!==i&&States.setFullName(e.i,r),a&&s(`stateNameEditorUpdateLabel`).checked&&(e.label?.text&&delete e.label.text,S.draw(`labels`)),B()}}function ye(){k(`stateNameEditor`);let e=`<div id="stateNameEditor" class="dialog" data-state="0">
      <div>
        <div data-tip="Короткое название государства" class="label">Короткое название:</div>
        <input
          id="stateNameEditorShort"
          data-tip="Введите короткое название"
          autocorrect="off"
          spellcheck="false"
          style="width: 11em"
        />
        <span id="stateNameEditorShortSpeak" data-tip="Озвучить название. Голос и язык меняются в настройках" class="speaker">🔊</span>
        <span
          id="stateNameEditorShortCulture"
          data-tip="Создать культурно-специфичное название"
          class="icon-book pointer"
        ></span>
        <span id="stateNameEditorShortRandom" data-tip="Создать случайное название" class="icon-globe pointer"></span>
      </div>
      <div data-tip="Выберите форму названия">
        <div data-tip="Название типа государства" class="label">Название формы:</div>
        <select id="stateNameEditorSelectForm" style="width: 11em">
          <option value="">blank</option>
          ${Object.entries(se).map(([e,t])=>`<optgroup label="${e}">${t.map(e=>`<option value="${e}">${e}</option>`).join(``)}</optgroup>`).join(``)}
        </select>
        <input
          id="stateNameEditorCustomForm"
          placeholder="введите название типа"
          data-tip="Введите своё название формы"
          style="display: none; width: 11em"
        />
        <span
          id="stateNameEditorAddForm"
          data-tip="Кликните, чтобы добавить своё название формы государства в список"
          class="icon-plus pointer"
        ></span>
      </div>
      <div>
        <div data-tip="Полное название государства" class="label">Полное название:</div>
        <input
          id="stateNameEditorFull"
          data-tip="Введите полное название"
          autocorrect="off"
          spellcheck="false"
          style="width: 11em"
        />
        <span id="stateNameEditorFullSpeak" data-tip="Озвучить название. Голос и язык меняются в настройках" class="speaker">🔊</span>
        <span
          id="stateNameEditorFullRegenerate"
          data-tip="Кликните, чтобы заново создать полное название"
          data-tick="0"
          class="icon-arrows-cw pointer"
        ></span>
      </div>
      <div data-tip="Снимите, чтобы не обновлять надпись государства при смене названия" style="padding-block: 0.2em">
        <input id="stateNameEditorUpdateLabel" class="checkbox" type="checkbox" checked />
        <label for="stateNameEditorUpdateLabel" class="checkbox-label"><i>Обновить надпись после применения</i></label>
      </div>
    </div>`;s(`dialogs`).insertAdjacentHTML(`beforeend`,e)}function be(){$(`#stateNameEditor`).dialog(`destroy`),s(`stateNameEditor`).remove()}function xe(e){let t=pack.states[e];if(!t.cells){D(`У государства нет ячеек, население не изменить`,!1,`error`);return}let n=p((t.rural||0)*options.map.units.population.scale),r=p((t.urban||0)*options.map.units.population.scale*options.map.units.population.urbanization.rate),i=n+r,a=e=>Number(e).toLocaleString();alertMessage.innerHTML=`<div>
    <i>Изменить население всех ячеек государства</i>
    <div style="margin: 0.5em 0">
      Rural: <input type="number" min="0" step="1" id="ruralPop" value=${n} style="width:6em" />
      Urban: <input type="number" min="0" step="1" id="urbanPop" value=${r} style="width:6em" />
    </div>
    <div>Total population: ${a(i)} ⇒ <span id="totalPop">${a(i)}</span>
      (<span id="totalPopPerc">100</span>%)
    </div>
  </div>`;let o=s(`ruralPop`),c=s(`urbanPop`),l=s(`totalPop`),d=s(`totalPopPerc`),f=()=>{let e=o.valueAsNumber+c.valueAsNumber;Number.isNaN(e)||(l.innerHTML=a(e),d.innerHTML=String(p(e/i*100)))};o.oninput=()=>f(),c.oninput=()=>f(),$(`#alert`).dialog({resizable:!1,title:`Изменить население государства`,width:`24em`,buttons:{Применить:function(){m(),$(this).dialog(`close`)},Отмена:function(){$(this).dialog(`close`)}},position:{my:`center`,at:`center`,of:`svg`}});function m(){try{States.setPopulation(e,+o.value||0,+c.value||0)}catch(e){D(u(e),!1,`error`);return}S.draw(`population`),B()}}function Se(e){let t=pack.states[e];if(!e||!t||t.removed)return;let n=p(t.pollTax*((t.rural||0)+(t.urban||0)),2),r=pack.deals.reduce((t,n)=>{if(!n.tax)return t;let r=0;if(n.sellerType===`burg`)r=pack.burgs[n.seller]?.state||0;else if(n.sellerType===`market`){let e=Markets.get(n.seller)?.centerBurgId;r=e&&pack.burgs[e]?.state||0}return r===e?t+n.tax:t},0);alertMessage.innerHTML=`<div data-tip="Налог с продаж применяется к сделкам, где продавец из государства. Подушная подать — ко всему населению. Изменения налогов действуют после пересчёта производства" style="margin: 0.6em 0; display: grid; grid-template-columns: 7em auto auto; row-gap: 0.4em; align-items: center">
      <label for="stateSalesTaxInput">Налог с продаж:</label>
      <input id="stateSalesTaxInput" type="number" min="0" max="1" step="0.01" value="${t.salesTax}" style="width: 6em"/> = ${h(r)}
      <label for="statePollTaxInput">Подушная подать:</label>
      <input id="statePollTaxInput" type="number" min="0" max="10" step="0.01" value="${t.pollTax}" style="width: 6em"/> = ${h(n)}
      <label for="stateTreasuryInput">Treasury:</label>
      <input id="stateTreasuryInput" type="number" step="1" value="${t.treasury}" style="width: 6em" />
    </div>`,$(`#alert`).dialog({resizable:!1,title:`Taxes and Treasury: ${t.name}`,width:`26em`,buttons:{Применить:function(){let n=s(`stateSalesTaxInput`),r=s(`statePollTaxInput`),i=s(`stateTreasuryInput`),a=Math.max(0,Math.min(1,+n.value)),o=Math.max(0,+r.value),c=+i.value;States.setTaxes(e,Number.isFinite(a)?a:t.salesTax,Number.isFinite(o)?o:t.pollTax),Number.isFinite(c)&&States.setTreasury(e,c),B(),$(this).dialog(`close`)},Отмена:function(){$(this).dialog(`close`)}},position:{my:`center`,at:`center`,of:`svg`}})}function Ce(e){let t=pack.states[e].capital,{x:n,y:r}=pack.burgs[t];zoomTo(n,r,8,2e3)}function we(e,t,n){States.setCulture(e,+n),t.dataset.base=String(+n)}function Te(e,t,n){States.setType(e,n),t.dataset.type=n,J()}function Ee(e,t,n){let r=Number(n);r>=0&&r<=99&&(States.setExpansionism(e,r),t.dataset.expansionism=n,J())}function De(e,t){if(customization)return;let n=o(`#statesBody`).select(`#state${e}`).attr(`d`),r=`focusState${e}`;t.contains(`inactive`)?ee(r,n):x(r),t.toggle(`inactive`)}function Oe(e){customization||j({title:`Удалить государство`,message:`Вы уверены, что хотите удалить государство? <br>Это действие необратимо`,confirm:`Удалить`,onConfirm:()=>ke(e)})}function ke(e){x(`focusState${e}`),C(`state`,e);for(let t of pack.states[e].provinces||[])C(`province`,t);States.remove(e),o(`#debug`).selectAll(`.highlight`).remove(),S.draw(`burgIcons`,`labels`,`military`,`borders`,`provinces`,`states`),B()}function Ae(){if(y(F)){ne(F);return}let e=pack.states.filter(e=>e.i&&!e.removed&&e.cells).sort((e,t)=>(t.area??0)-(e.area??0)).map(e=>[e.i,e.color,e.name]);if(!e.length)return void D(`Нет государств для показа`,!1,`error`);b(F,e)}function K(){if(s(`statesBodySection`).dataset.type===`absolute`){s(`statesBodySection`).dataset.type=`percentage`;let e=+s(`statesFooterBurgs`).innerText,t=+s(`statesFooterArea`).dataset.area,n=+s(`statesFooterPopulation`).dataset.population,r=pack.states.reduce((e,t)=>e+(t.treasury||0),0),i=pack.states.reduce((e,t)=>e+(t.i&&!t.removed&&t.cells||0),0);s(`statesBodySection`).querySelectorAll(`:scope > .states`).forEach(a=>{let{burgs:o,area:s,population:c,treasury:l,cells:u}=a.dataset;a.querySelector(`.stateBurgs`).innerText=`${p(+o/e*100)}%`,a.querySelector(`.stateCells`).innerText=`${p(+u/i*100)}%`,a.querySelector(`.stateArea`).innerText=`${p(+s/t*100)}%`,a.querySelector(`.statePopulation`).innerText=`${p(+c/n*100)}%`,a.querySelector(`.stateTreasury`).innerText=`${p(+l/r*100,2)}%`})}else s(`statesBodySection`).dataset.type=`absolute`,R.refresh()}function q(){let e=pack.states.filter(e=>!e.removed);if(e.length<2){D(`Нет государств для показа`,!1,`error`);return}let t=E().id(e=>String(e.i)).parentId(e=>e.i?`0`:null)(e).sum(e=>e.area).sort((e,t)=>t.value-e.value),n=150+200*s(`uiSize`).valueAsNumber,r={top:0,right:-50,bottom:0,left:-50},i=n-r.left-r.right,a=n-r.top-r.bottom,l=re().size([i,a]).padding(3);alertMessage.innerHTML=`<select id="statesTreeType" style="display:block; margin-left:13px; font-size:11px">
    <option value="area" selected>Площадь</option>
    <option value="population">Всего населения</option>
    <option value="rural">Сельское население</option>
    <option value="urban">Городское население</option>
    <option value="burgs">Число городов</option>
  </select>`,alertMessage.innerHTML+=`<div id='statesInfo' class='chartInfo'>&#8205;</div>`;let u=o(`#alertMessage`).insert(`svg`,`#statesInfo`).attr(`id`,`statesTree`).attr(`width`,n).attr(`height`,n).style(`font-family`,`Almendra SC`).attr(`text-anchor`,`middle`).attr(`dominant-baseline`,`central`).append(`g`).attr(`transform`,`translate(-50, 0)`);s(`statesTreeType`).addEventListener(`change`,b),l(t);let f=u.selectAll(`g`).data(t.leaves()).enter().append(`g`).attr(`transform`,e=>`translate(${e.x},${e.y})`).attr(`data-id`,e=>e.data.i).on(`mouseenter`,(e,t)=>v(e,t)).on(`mouseleave`,e=>y(e));f.append(`circle`).attr(`fill`,e=>e.data.color).attr(`r`,e=>e.r);let h=/(?=[A-Z][^A-Z])/g,_=e=>(c(e.split(h).map(e=>e.length))??0)+1;f.append(`text`).attr(`text-rendering`,`optimizeSpeed`).style(`font-size`,e=>`${p(e.r**.97*4/_(e.data.name),2)}px`).selectAll(`tspan`).data(e=>e.data.name.split(h)).join(`tspan`).attr(`x`,0).text(e=>e).attr(`dy`,(e,t,n)=>`${t?1:(n.length-1)/-2}em`);function v(e,t){o(e.target).select(`circle`).classed(`selected`,!0);let n=t.data.fullName,r=`${d(t.data.area)} ${m()}`,i=p(t.data.rural*options.map.units.population.scale),a=p(t.data.urban*options.map.units.population.scale*options.map.units.population.urbanization.rate),c=s(`statesTreeType`).value,l=c===`area`?`Area: ${r}`:c===`rural`?`Rural population: ${g(i)}`:c===`urban`?`Urban population: ${g(a)}`:c===`burgs`?`Burgs number: ${t.data.burgs}`:`Population: ${g(i+a)}`;s(`statesInfo`).innerHTML=`${n}. ${l}`,U(e)}function y(e){W(),document.getElementById(`statesInfo`)&&(s(`statesInfo`).innerHTML=`&#8205;`,o(e.target).select(`circle`).classed(`selected`,!1))}function b(){let e=this.value===`area`?e=>e.area:this.value===`rural`?e=>e.rural:this.value===`urban`?e=>e.urban:this.value===`burgs`?e=>e.burgs:e=>e.rural+e.urban;t.sum(e),f.data(l(t).leaves()),f.transition().duration(1500).attr(`transform`,e=>`translate(${e.x},${e.y})`),f.select(`circle`).transition().duration(1500).attr(`r`,e=>e.r),f.select(`text`).transition().duration(1500).style(`font-size`,e=>`${p(e.r**.97*4/_(e.data.name),2)}px`)}$(`#alert`).dialog({title:`Пузырьковая диаграмма государств`,width:`fit-content`,position:{my:`left bottom`,at:`left+10 bottom-10`,of:`svg`},buttons:{},close:()=>{alertMessage.innerHTML=``}})}function je(){s(`statesBottom`).querySelectorAll(`:scope > button`).forEach(e=>{e.style.display=`none`}),s(`statesRegenerateButtons`).style.display=`block`}function J(e){if(!(!e&&!s(`statesAutoChange`).checked)){if(States.recalculate(),S.draw(`states`,`borders`,`provinces`,`goods`,`emblems`),s(`adjustLabels`).checked){for(let e of pack.states)e.label&&(e.label.pathPoints=void 0);S.draw(`labels`)}B()}}function Me(){pack.states.forEach(e=>{if(!e.i||e.removed)return;let t=p(Math.random()*4+1,1);e.expansionism=t,s(`statesBodySection`).querySelector(`div.states[data-id='${e.i}'] input.statePower`).value=String(t)}),J(!0)}function Ne(){s(`statesBottom`).querySelectorAll(`:scope > button`).forEach(e=>{e.style.display=`inline-block`}),s(`statesRegenerateButtons`).style.display=`none`}function Pe(){S.show(`states`);let e=s(`adjustLabels`).checked;O.PaintEditor.open({title:`Кисть государств`,parentDialogId:P,onClose:z,items:pack.states.filter(e=>!e.removed).map(e=>({id:e.i,name:e.name,color:e.color||`#ffffff`})),dontOverrideControl:!0,getValue:e=>pack.cells.state[e],filterCell:(e,t)=>_(e,pack)&&e!==pack.states[t].center,onApply:t=>Fe(t,e)})}function Fe(t,n){if(!t.size)return;let r=new Set;for(let[n,i]of e(t)){for(let e of i)r.add(pack.cells.state[e]).add(n);States.setCells(n,i)}if(S.draw(`states`,`borders`,`provinces`,`emblems`),n){for(let e of r)delete pack.states[e].label;S.draw(`labels`)}document.getElementById(P)&&B()}function Ie(){if(this.classList.contains(`pressed`)){Y();return}customization=3,this.classList.add(`pressed`),D(`Кликните по карте, чтобы создать столицу или повысить существующий город`,!0),o(`#viewbox`).style(`cursor`,`crosshair`).on(`click`,Le),s(`statesBodySection`).querySelectorAll(`div > input, select, span, svg`).forEach(e=>{e.style.pointerEvents=`none`})}function Le(e){let[t,n]=r(e,this),i=pack.cells.burg[Pack.findCell(t,n)],a;try{a=States.add(t,n)}catch(e){D(u(e),!1,`error`);return}e.shiftKey===!1&&Y(),i||v(`burg`,pack.states[a].capital),v(`state`,a),S.hide(`provinces`),S.draw(`burgIcons`,`labels`,`routes`,`states`,`borders`),R.refresh()}function Y(){customization=0,M(),ie(),s(`statesBodySection`).querySelectorAll(`div > input, select, span, svg`).forEach(e=>{e.style.removeProperty(`pointer-events`)});let e=s(`statesAdd`);e.classList.contains(`pressed`)&&e.classList.remove(`pressed`)}var X=e=>`<svg class="coaIcon" viewBox="0 0 200 200"><use href="#stateCOA${e}"></use></svg>`;function Re(){let e=pack.states.filter(e=>e.i&&!e.removed).map(e=>`
      <div data-id="${e.i}" data-tip="${e.fullName}" style="cursor:default">
        <input type="radio" name="rulingState" value="${e.i}" />
        <input id="selectState${e.i}" class="checkbox" type="checkbox" name="statesToMerge" value="${e.i}" />
        <label for="selectState${e.i}" class="checkbox-label"><fill-box fill="${e.color}" disabled></fill-box>${X(e.i)}${e.fullName}</label>
      </div>
    `).join(``);alertMessage.innerHTML=`
    <form id='mergeStatesForm' style="overflow: hidden; display: flex; flex-direction: column; gap: 1em;">
      <p style="margin:0">
        См. <b>checkbox</b> рядом с каждым государством, которое хотите объединить. Используйте <b>radio button</b> , чтобы выбрать <em>правящее государство</em> that will absorb all others (its name, color, and capital will be kept).
        Hover over a row to highlight the state on the map.
      </p>
      <main style='display: grid; grid-template-columns: 1fr 1fr; gap: .3em;'>
        ${e}
      </main>
    </form>
  `,s(`mergeStatesForm`).querySelectorAll(`div[data-id]`).forEach(e=>{e.addEventListener(`mouseenter`,t),e.addEventListener(`mouseleave`,W)}),N(`alert`,({cellId:e})=>pack.cells.state[e]);function t(e){if(!S.isOn(`states`))return;let t=+e.currentTarget.dataset.id;if(!t)return;let n=o(`#regions`).select(`#state${t}`).attr(`d`);n&&(W(),w(n))}$(`#alert`).dialog({width:600,title:`Merge states`,close:W,buttons:{Объединить:function(){let e=new FormData(s(`mergeStatesForm`)),t=Number(e.get(`rulingState`));if(!t){D(`Выберите государство, с которым объединить`,!1,`error`);return}let n=e.getAll(`statesToMerge`).map(Number).filter(e=>e!==t);if(!n.length){D(`Выберите несколько государств для объединения`,!1,`error`);return}Z(n,t,()=>$(this).dialog(`close`))},Отмена:function(){$(this).dialog(`close`)}}})}function Z(e,t,n){let r=pack.states[t],i=`${X(r.i)}${r.name}`;j({title:`Объединить государства`,message:`
      <p>Следующие государства будут <strong>removed</strong>: ${e.map(e=>`${X(e)}${pack.states[e].name}`).join(`, `)}.</p>
      <p>Removed states data (burgs, provinces, regiments) will be assigned to ${i}.</p>
      <label style="display: flex; align-items: center"><input id="mergeStatesAsProvinces" class="checkbox native" type="checkbox"> Оставить каждое удалённое государство провинцией ${i}, заменив его провинции</label>
      <p>Вы уверены, что хотите объединить государства? Это действие необратимо.</p>`,confirm:`Объединить`,onConfirm:()=>{ze(e,t,s(`mergeStatesAsProvinces`).checked),n?.()}})}var Q=me({buttonId:`statesAnnex`,bodySectionId:`statesBodySection`,noun:`state`,ownerOf:e=>pack.cells.state[e],colorOf:e=>pack.states[e].color??`#999999`,nameOf:e=>pack.states[e].name,commit:(e,t)=>Z(t,e)});function ze(e,t,n=!1){for(let t of e)C(`state`,t);States.merge(t,e,n),x(),o(`#debug`).selectAll(`.highlight`).remove(),S.draw(`states`,`borders`,`burgIcons`,`labels`,`provinces`,`military`,`emblems`),n&&S.show(`provinces`),B()}function Be(){let e=`Id,State,Full Name,Form,Color,Capital,Culture,Type,Expansionism,Cells,Burgs,Area ${m(`2`)},Total Population,Rural Population,Urban Population`,t=R.view().all.map(e=>{let t=e.rural||0,n=e.urban||0,r=p(t*options.map.units.population.scale+n*options.map.units.population.scale*options.map.units.population.urbanization.rate);return[e.i,e.name,e.fullName||``,e.i?e.formName:``,e.i?e.color:``,e.i?pack.burgs[e.capital].name:``,e.i?pack.cultures[e.culture].name:``,e.i?e.type:``,e.i?e.expansionism:``,e.cells,e.burgs,d(e.area||0),r,Math.round(t*options.map.units.population.scale),Math.round(n*options.map.units.population.scale*options.map.units.population.urbanization.rate)].join(`,`)});n([e].concat(t).join(`
`),`${l(`States`)}.csv`)}function Ve(e,t){States.setLocked(e,!pack.states[e].lock),t.toggle(`icon-lock-open`),t.toggle(`icon-lock`)}var He={open:z,showChart:q};export{He as StatesEditor};