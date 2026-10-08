import{Gn as e,Hn as t,P as n,Un as r,_t as i,nr as a}from"./utils-BXzQ0Tym.js";import{Q as o,t as s}from"./layers-Cld3ceTu.js";import{i as c}from"./emblems-generator-BdUAGZhv.js";import{i as l}from"./tooltips-P6FAPAdd.js";import{t as u}from"./controllers-7rYzYhQt.js";import{n as d}from"./cultures-generator-D3DKC0_p.js";import{c as f,i as p}from"./dialog-helpers-CJ5pbzaw.js";import{v as m,y as h}from"./index-C_h8P6M7.js";function g(i,d){let g={...i?.demandCoverage||{}},x={...i?.biomeOutput||{}},S=()=>{let e=h.map(e=>[e,g[e]??0]).filter(([,e])=>e>0);return e.length?e.map(([e,t])=>`${m[e]} ${r(e)}: ${t}`).join(`, `):`none`},C=()=>{let e=Object.entries(x).filter(([,e])=>(e??0)>0);return e.length?e.map(([e,t])=>`${pack.biomes[Number(e)].name}: ${t}`).join(`, `):`none`},w={cultureType:{...i?.multipliers?.cultureType??{}},culture:{...i?.multipliers?.culture??{}},state:{...i?.multipliers?.state??{}},religion:{...i?.multipliers?.religion??{}},biome:{...i?.multipliers?.biome??{}},zone:{...i?.multipliers?.zone??{}}},T=e=>{let t=w[e]??{},n=Object.entries(t).filter(([,e])=>e!==1);return n.length?n.map(([t,n])=>`${_(e,t)} ×${a(n,2)}`).join(`, `):`none`},E=(e,t)=>`
      <label data-tip="Множитель добычи по ${t.toLowerCase()}. 1 — без эффекта, 0 — полностью подавлено">${t}</label>
      <div class="ge-edit-row">
        <span id="mSummary_${e}">${T(e)}</span>
        <button class="mEdit icon-pencil ge-edit" data-dim="${e}" data-tip="Множители ${t}"></button>
      </div>`,D=i?.recipes||[],O=i?.icon||`goods-unknown`,k;A(),c.retry(Goods.iconSet.id),$(k).dialog({width:`30em`,resizable:!1,title:i?`Изменить товар`:`Добавить новый товар`,open:function(){i&&(this.parentElement?.querySelector(`.ui-dialog-buttonpane`))?.insertAdjacentHTML(`afterbegin`,`<div class="dontAsk" data-tip="Пересоздать этот товар и пересчитать производство, торговлю и налоги. Снимите, чтобы обновить только товар, не затрагивая экономику.">
          <input id="goodRegenerateEconomy" class="checkbox" type="checkbox" checked />
          <label for="goodRegenerateEconomy" class="checkbox-label"><i>пересоздать экономику при применении</i></label>
        </div>`)},close:()=>{p(`goodEditor`)},buttons:{Отмена:function(){$(this).dialog(`close`)},[i?`Применить`:`Добавить`]:()=>{let e=[],r=n(`newGoodName`).value.trim(),a=t(n(`newGoodTags`).value.trim().split(`,`).map(e=>e.trim().toLocaleLowerCase())),o=+n(`newGoodValue`).value,c=+n(`newGoodChance`).value,u=n(`newGoodUnit`).value.trim(),p=n(`newGoodColor`).value,m=n(`newGoodDistribution`).textContent?.trim()??``;if(r||e.push(`Name is required`),(!Number.isFinite(o)||o<0)&&e.push(`Value must be a valid non-negative number`),(!Number.isFinite(c)||c<0||c>100)&&e.push(`Chance must be between 0 and 100`),m)try{let e=Goods.getMethods(),t=`{${Object.keys(e).join(`, `)}}`;Function(t,`return ${m}`)(e)}catch(t){e.push(`Distribution function is invalid: ${t.message||t}`)}for(let t of D){for(let[n,r]of Object.entries(t)){let t=Number(n),i=Goods.get(t);i||e.push(`Recipe references unknown good id: ${t}`);let a=Number(r);(Number.isNaN(a)||!Number.isFinite(a)||a<=0)&&e.push(`Invalid recipe amount for good ${i?.name}`)}Object.keys(t).length||e.push(`Each recipe must have at least one ingredient`)}if(n(`newGoodError`).textContent=e.join(`. `),e.length)return;function h(){let e={};for(let[t,n]of Object.entries(w)){let r=Object.fromEntries(Object.entries(n??{}).filter(([,e])=>e!==void 0&&e!==1));Object.keys(r).length&&(e[t]=r)}return Object.keys(e).length?e:void 0}if(i){let e=i.i;Goods.rename(e,r),Goods.setTags(e,a),Goods.setIcon(e,O),Goods.recolor(e,p),Goods.setPrice(e,o),Goods.setUnit(e,u),Goods.setProduction(e,{chance:c,demandCoverage:g,multipliers:h()??null,biomeOutput:Object.keys(x).length?x:null,recipes:D.length?D:null}),i.distribution=m||void 0,n(`goodRegenerateEconomy`).checked?(Goods.regeneratePlacement(i.i),Production.regenerateEconomy(),s.draw(`markets`,`goods`),s.draw(`trade`),f()):Goods.sync()}else pack.goods.push({i:(()=>{let e=pack.goods?.at(-1)?.i??1;for(;Goods.get(e);)e++;return e})(),name:r,tags:a,icon:O,color:p,value:o,chance:c,unit:u,demandCoverage:g,multipliers:h(),distribution:m||void 0,biomeOutput:Object.keys(x).length?x:void 0,recipes:D.length?D:void 0}),Goods.sync();l(i?`Товар обновлён`:`Товар добавлен`,!1,`success`,5e3),d?.(),$(k).dialog(`close`)}}});function A(){p(`goodEditor`),n(`dialogs`).insertAdjacentHTML(`beforeend`,`<div id="goodEditor" class="dialog">
    <style>
      .ge                 { display:flex; width: auto !important; flex-direction:column; gap:9px; max-height:72vh; overflow-y:auto; padding-right:2px; }
      .ge-section-title   { display:flex; align-items:center; justify-content:space-between; font-weight:bold; text-transform:uppercase; font-size:.8em; letter-spacing:.06em; margin-bottom:7px; padding-bottom:4px; border-bottom:1px solid #666; }
      .ge-grid            { display:grid; grid-template-columns:9em minmax(0, 1fr); gap:.2em; align-items:center; }
      .ge-grid--top       { align-items:start; }
      .ge-grid > *        { min-width:0; }
      .ge-grid > label    { color:#555; }
      .ge-field           { width:100%; }
      input.ge-num        { width:6em; }
      .ge-inline          { display:flex; align-items:center; gap:.4em; }
      .ge-icon-select     { flex:1; min-width:0; display:flex; align-items:center; gap:.4em; margin:0; }
      .ge-icon-preview    { flex-shrink:0; }
      .ge-color           { width:2.4em; height:1.4em; padding:0; border:none; flex-shrink:0; }
      .ge-edit-row        { display:flex; align-items:flex-start; justify-content:space-between; gap:6px; }
      .ge-edit-row > span { flex:1; min-width:0; }
      .ge-edit            { flex-shrink:0; }
      .ge-dist            { flex:1; min-width:0; color:#555; font-size:.9em; font-family:var(--monospace); word-break:break-all; }
      .ge-note            { color:#777; font-style:italic; font-size:.9em; }
      .ge-error           { color:#b20000; min-height:1.2em; }
      .ge-recipe-list     { display:flex; flex-direction:column; gap:.45em; }
      .ge-recipe          { border:1px solid #ccc; border-radius:3px; }
      .ge-recipe-head     { display:flex; align-items:center; justify-content:space-between; padding:.2em .3em; }
      .ge-recipe-actions  { display:flex; gap:.3em; }
      .ge-recipe-ings     { display:flex; flex-direction:column; gap:.2em; padding:.3em .4em; }
      .ge-recipe-ing      { display:grid; grid-template-columns:1fr 5em 1.5em; gap:.25em; align-items:center; }
    </style>

    <div class="ge">
      <div>
        <div class="ge-section-title">Общее</div>
        <div class="ge-grid">
          <label for="newGoodName">Название*</label>
          <input id="newGoodName" class="ge-field" value="${i?.name||``}" />

          <label for="newGoodTags">Теги</label>
          <input id="newGoodTags" class="ge-field" value="${i?.tags.join(`, `)||``}" placeholder="через запятую" />

          <label for="newGoodValue">Базовая цена*</label>
          <span class="ge-inline"><input id="newGoodValue" class="ge-num" type="number" min="0" step="1" value="${i?.value??1}" /> 🟡</span>

          <label for="newGoodChance">Шанс</label>
          <input id="newGoodChance" class="ge-num" type="number" min="0" max="100" step="0.1" value="${i?.chance??1}" />

          <label for="newGoodUnit">Единица</label>
          <input id="newGoodUnit" class="ge-field" placeholder="e.g. wagon, barrel" value="${i?.unit||``}" />

          <label for="newGoodIcon">Иконка*</label>
          <div class="ge-inline">
            <button id="newGoodIcon" type="button" class="ge-icon-select" data-tip="Выберите иконку товара">
              <svg class="ge-icon-preview" width="2em" height="2em">
                <circle id="newGoodIconCircle" cx="50%" cy="50%" r="42%" fill="${i?.color||`#ff5959`}" stroke="${Goods.getStroke(i?.color||`#ff5959`)}"/>
                <use id="newGoodIconPreview" href="${e(c.href(O))}" x="10%" y="10%" width="80%" height="80%"${o()}/>
              </svg>
              <span id="newGoodIconName">${e(c.name(O))}</span>
            </button>
            <input id="newGoodColor" class="ge-color" type="color" data-tip="Задайте цвет обводки" value="${i?.color||`#ff5959`}" />
          </div>

          <label data-tip="Какую часть каждой категории спроса удовлетворяет этот товар. Кликните по карандашу, чтобы изменить.">Покрытие спроса</label>
          <div class="ge-edit-row">
            <span id="demandCoverageSummary" >${S()}</span>
            <button class="dcEdit icon-pencil ge-edit" data-tip="Изменить покрытие спроса"></button>
          </div>
        </div>
      </div>

      <div>
        <div class="ge-section-title">Добыча сырья</div>
        <div class="ge-grid ge-grid--top">
          <label data-tip="Для сырья: задаёт базовую добычу на биом">Сельское производство</label>
          <div class="ge-edit-row">
            <span id="biomeProductionSummary">${C()}</span>
            <button class="bpEdit icon-pencil ge-edit" data-tip="Изменить базовую добычу биома"></button>
          </div>

          <label data-tip="Для сырья: задаёт где и как товар добывается из среды (биом, высота, температура)">Распределение бонусов</label>
          <div class="ge-edit-row">
            <div id="newGoodDistribution" class="ge-dist">${i?.distribution||``}</div>
            <button id="newGoodDistributionEditor" class="icon-pencil ge-edit" data-tip="Открыть визуальный редактор распределения"></button>
          </div>
        </div>
        <div id="newGoodRawNote" class="ge-note"></div>
      </div>

      <div>
        <div class="ge-section-title">
          <span data-tip="Для фабричных товаров: рецепты задают, какие товары нужны для производства этого">Рецепты</span>
          <button id="newGoodAddRecipe" class="icon-plus" data-tip="Добавить рецепт"></button>
        </div>
        <div id="newGoodRecipeList" class="ge-recipe-list"></div>
        <div id="newGoodRecipeNote" class="ge-note"></div>
      </div>

      <div>
        <div class="ge-section-title">
          <span data-tip="Множители добычи по измерениям. 1 — без эффекта, 0 — полностью подавлено.">Множители</span>
        </div>
        <div class="ge-grid ge-grid--top">
          ${E(`cultureType`,`Culture Type`)}
          ${E(`culture`,`Culture`)}
          ${E(`state`,`State`)}
          ${E(`religion`,`Religion`)}
          ${E(`biome`,`Biome`)}
          ${E(`zone`,`Zone`)}
        </div>
      </div>

      <div id="newGoodError" class="ge-error"></div>
    </div>
  </div>`),k=n(`goodEditor`);let t=n(`newGoodRecipeList`),r=pack.goods[0]?.i??0,a=[...pack.goods].sort((e,t)=>e.name.localeCompare(t.name)),s=()=>!Object.values(x).some(e=>(e??0)>0)&&!document.getElementById(`newGoodDistribution`)?.textContent?.trim(),l=()=>{let e=s(),t=D.length===0,r=n(`newGoodRecipeNote`);r.textContent=`This good is raw-only: gathered from the environment.`,r.style.display=t&&!e?``:`none`;let i=n(`newGoodRawNote`);i.textContent=`This good is manufactured-only: made from recipes in burgs.`,i.style.display=e&&!t?``:`none`},d=()=>{t.innerHTML=D.map((e,t)=>`
          <div class="recipeOption ge-recipe" data-recipe-index="${t}" >
            <div class="ge-recipe-head">
              <span>Recipe ${t+1}</span>
              <div class="ge-recipe-actions">
                <span class="recipeAddIngredient icon-plus pointer" data-recipe-index="${t}" data-tip="Добавить ингредиент"></span>
                <span class="recipeRemoveOption icon-trash-empty pointer" data-recipe-index="${t}" data-tip="Удалить рецепт"></span>
              </div>
            </div>
            <div class="recipeIngredients ge-recipe-ings">
              ${Object.entries(e).map(([e,n],r)=>`
                    <div class="ge-recipe-ing" data-recipe-index="${t}" data-ingredient-index="${r}">
                      <select class="recipeGoodSelect" data-recipe-index="${t}" data-ingredient-index="${r}">${a.map(t=>`<option value="${t.i}" ${t.i===Number(e)?`selected`:``}>${t.name}</option>`).join(``)}</select>
                      <input class="recipeAmountInput" data-recipe-index="${t}" data-ingredient-index="${r}" type="number" min="1" step="1" value="${n}" />
                      <span class="recipeRemoveIngredient icon-trash-empty pointer" data-recipe-index="${t}" data-ingredient-index="${r}" data-tip="Убрать ингредиент" />
                    </div>`).join(``)}
            </div>
          </div>
        `).join(``),t.querySelectorAll(`.recipeGoodSelect`).forEach(e=>{e.onchange=()=>{let t=+e.value,n=+e.dataset.recipeIndex,r=+e.dataset.ingredientIndex,i=D[n],a=i[r]||0;delete i[r],i[t]=a,d()}}),t.querySelectorAll(`.recipeAmountInput`).forEach(e=>{e.onchange=()=>{let t=+e.dataset.recipeIndex,n=+e.dataset.ingredientIndex,r=D[t],i=Number(Object.keys(r)[n]);r[i]=+e.value}}),t.querySelectorAll(`.recipeAddIngredient`).forEach(e=>{e.onclick=t=>{t.preventDefault();let n=D[+e.dataset.recipeIndex],i=Object.keys(n).length?Math.max(...Object.keys(n).map(e=>+e))+1:r;n[i]=1,d()}}),t.querySelectorAll(`.recipeRemoveIngredient`).forEach(e=>{e.onclick=t=>{t.preventDefault();let n=+e.dataset.recipeIndex,r=+e.dataset.ingredientIndex,i=D[n];if(Object.keys(i).length>1){let e=Number(Object.keys(i)[r]);delete i[e],d()}}}),t.querySelectorAll(`.recipeRemoveOption`).forEach(e=>{e.onclick=t=>{t.preventDefault();let n=+e.dataset.recipeIndex;D.splice(n,1),d()}}),l()};d(),k.querySelectorAll(`.mEdit`).forEach(e=>{e.addEventListener(`click`,()=>{let t=e.dataset.dim;v(t,w[t]??{},e=>{w[t]=e;let n=document.getElementById(`mSummary_${t}`);n&&(n.textContent=T(t))})})}),k.querySelector(`.dcEdit`).addEventListener(`click`,()=>{y({...g},e=>{Object.keys(g).forEach(e=>void delete g[e]),Object.assign(g,e);let t=document.getElementById(`demandCoverageSummary`);t&&(t.textContent=S())})}),k.querySelector(`.bpEdit`).addEventListener(`click`,()=>{b({...x},e=>{Object.keys(x).forEach(e=>void delete x[+e]),Object.assign(x,e);let t=document.getElementById(`biomeProductionSummary`);t&&(t.textContent=C()),l()})}),n(`newGoodAddRecipe`).addEventListener(`click`,e=>{e.preventDefault(),D.push({[r]:1}),d()}),n(`newGoodDistributionEditor`).addEventListener(`click`,()=>{let e=n(`newGoodDistribution`);u.DistributionEditor.open(t=>{e.textContent=t,l()},e.textContent?.trim()??``)});let f=e=>{O=e,n(`newGoodIconPreview`).setAttribute(`href`,c.href(e)),n(`newGoodIconName`).textContent=c.name(e)};n(`newGoodIcon`).onclick=()=>u.IconPicker.open({current:O,onPick:f});let m=n(`newGoodColor`);m.oninput=()=>{let e=n(`newGoodIconCircle`);e.setAttribute(`fill`,m.value),e.setAttribute(`stroke`,Goods.getStroke(m.value))}}}function _(e,t){return e===`cultureType`?t:e===`culture`?pack.cultures[+t]?.name??`Culture ${t}`:e===`state`?pack.states[+t]?.name??`State ${t}`:e===`religion`?pack.religions[+t]?.name??`Religion ${t}`:e===`zone`?pack.zones.find(e=>e.i===+t)?.name??`Zone ${t}`:pack.biomes[+t]?.name??`Biome ${t}`}function v(e,t,n){let r,a;switch(e){case`cultureType`:r=d.map(e=>({id:e,name:e})),a=`Тип культуры`;break;case`culture`:r=pack.cultures.filter(e=>e.i&&!e.removed).map(e=>({id:String(e.i),name:e.name,color:e.color})),a=`Культура`;break;case`state`:r=pack.states.filter(e=>e.i&&!e.removed).map(e=>({id:String(e.i),name:e.fullName||e.name,color:e.color})),a=`Государство`;break;case`religion`:r=pack.religions.filter(e=>e.i&&!e.removed).map(e=>({id:String(e.i),name:e.name,color:e.color})),a=`Религия`;break;case`biome`:r=pack.biomes.filter(e=>!e.removed).map(({i:e,name:t,color:n})=>({id:String(e),name:t,color:n})),a=`Биом`;break;case`zone`:r=pack.zones.map(e=>({id:String(e.i),name:e.name,color:e.color})),a=`Зона`;break}let o=r.map(e=>{let n=t[e.id]??1;return`${`<fill-box fill="${e.color||i()}" size="1em" disabled data-tip="${e.name}"></fill-box>`}<span>${e.name}</span><input type="number" class="mPopupInput" data-id="${e.id}" min="0" step="0.1" style="width:5em;" value="${n}" />`}),s=document.createElement(`div`);document.body.appendChild(s),s.innerHTML=`<div style="max-height:320px; overflow-y:auto; padding:.2em;">${o.length?`<div style="display:grid; grid-template-columns:auto 1fr 5em; gap:.3em .5em; align-items:center;">${o.join(``)}</div>`:`<div style="color:#777; font-style:italic;">No ${a.toLowerCase()}s available</div>`}</div>`,$(s).dialog({title:`${a} multipliers`,width:`22em`,resizable:!1,buttons:{Отмена:function(){$(this).dialog(`close`)},Применить:function(){let e=Array.from(s.querySelectorAll(`.mPopupInput`)),t={};for(let n of e){let e=n.dataset.id,r=Number(n.value);Number.isFinite(r)&&r>=0&&r!==1&&(t[e]=r)}n(t),$(this).dialog(`close`)}},close:()=>{$(s).dialog(`destroy`),s.remove()}})}function y(e,t){let n=h.map(t=>{let n=e[t]??0;return`<span>${m[t]} ${r(t)}</span><input type="number" class="dcPopupInput" data-cat="${t}" min="0" step="0.05" style="width:5em;" value="${n}" />`}).join(``),i=document.createElement(`div`);document.body.appendChild(i),i.innerHTML=`<div style="display:grid;grid-template-columns:1fr 5em;gap:.3em .5em;align-items:center;padding:.2em;">${n}</div>`,$(i).dialog({title:`Покрытие спроса`,width:`18em`,resizable:!1,buttons:{Отмена:function(){$(this).dialog(`close`)},Применить:function(){let e={};i.querySelectorAll(`.dcPopupInput`).forEach(t=>{let n=t.dataset.cat,r=Number(t.value);Number.isFinite(r)&&r>0&&(e[n]=r)}),t(e),$(this).dialog(`close`)}},close:()=>{$(i).dialog(`destroy`),i.remove()}})}function b(e,t){let n=pack.biomes.filter(e=>!e.removed).map(({i:t,name:n})=>`<span>${n}</span><input type="number" class="bpPopupInput" data-id="${t}" min="0" step="0.01" style="width:5em;" value="${e[t]??0}" />`).join(``),r=document.createElement(`div`);document.body.appendChild(r),r.innerHTML=`<div style="max-height:320px;overflow-y:auto;padding:.2em;"><div style="display:grid;grid-template-columns:1fr 5em;gap:.3em .5em;align-items:center;">${n}</div></div>`,$(r).dialog({title:`Базовая добыча в биоме`,width:`22em`,resizable:!1,buttons:{Отмена:function(){$(this).dialog(`close`)},Применить:function(){let e={};r.querySelectorAll(`.bpPopupInput`).forEach(t=>{let n=Number(t.dataset.id),r=Number(t.value);Number.isFinite(r)&&r>0&&(e[n]=r)}),t(e),$(this).dialog(`close`)}},close:()=>{$(r).dialog(`destroy`),r.remove()}})}var x={open:g};export{x as GoodEditor};