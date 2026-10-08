import{Gn as e,H as t,Hn as n,J as r,Nn as i,P as a,Pn as o,U as s,V as c,ct as l,nr as u,ot as d}from"./utils-wri1mEnR.js";import{t as f}from"./median-DjsmwCbl.js";import{t as p}from"./mean-4Awewi9R.js";import{i as m}from"./tooltips-D49utlYE.js";import{i as h,n as g}from"./dialog-helpers-Df4nf9Or.js";var _=null;function v(){customization||(g(`#namesbaseEditor, .stable`),y(),x(),S(),$(`#namesbaseEditor`).dialog({title:`Namesbase Editor`,width:`60vw`,position:{my:`center`,at:`center`,of:`svg`},close:b}))}function y(){h(`namesbaseEditor`),a(`dialogs`).insertAdjacentHTML(`beforeend`,`<div id="namesbaseEditor" class="dialog stable textual">
      <div id="namesbaseBasesTop">
        <span>Select base: </span>
        <select id="namesbaseSelect" data-tip="Select base to edit" style="width: 12em" value="0"></select>
        <span style="margin-left: 2px">Names data: </span>
      </div>
      <div id="namesbaseBody" style="margin-block: 2px; width: auto">
        <textarea
          id="namesbaseTextarea"
          data-base="0"
          rows="13"
          data-tip="Names data: a comma separated list of source names used for names generation"
          placeholder="Provide a names data: a comma separated list of source names"
          autocorrect="off"
          spellcheck="false"
          style="resize: none"
        ></textarea>
        <div>
          <span>Name: </span>
          <input
            id="namesbaseName"
            data-tip="Type to change a base name"
            placeholder="Base name"
            autocorrect="off"
            spellcheck="false"
            style="width: 12em"
          />
          <span>Length: </span>
          <input id="namesbaseMin" data-tip="Recommended minimum name length" type="number" min="2" max="100" />
          <input id="namesbaseMax" data-tip="Recommended maximum name length" type="number" min="2" value="10" />
          <span>Doubled: </span>
          <input
            id="namesbaseDouble"
            data-tip="Populate with letters that can be used twice in a row (geminates)"
            autocorrect="off"
            spellcheck="false"
            style="width: 10em"
          />
        </div>
        <fieldset>
          <legend>Generated examples:</legend>
          <div id="namesbaseExamples" data-tip="Examples. Click to re-generate"></div>
        </fieldset>
      </div>
      <div id="namesbaseBottom">
        <button
          id="namesbaseUpdateExamples"
          data-tip="Re-generate examples based on provided data"
          class="icon-arrows-cw"
        ></button>
        <button id="namesbaseAdd" data-tip="Add new namesbase" class="icon-plus"></button>
        <button id="namesbaseDefault" data-tip="Restore default namesbase" class="icon-cancel"></button>
        <button id="namesbaseDownload" data-tip="Download namesbase to PC" class="icon-download"></button>
        <button
          id="namesbaseUpload"
          data-tip="Upload a namesbase from PC, replacing the current set"
          class="icon-upload"
        ></button>
        <button
          id="namesbaseUploadExtend"
          data-tip="Upload a namesbase from PC, extending the current set"
          class="icon-up-circled2"
        ></button>
        <button
          id="namesbaseCA"
          data-tip="Find or share custom namesbase on Cartography Assets portal"
          class="icon-drafting-compass"
        ></button>
        <button
          id="namesbaseAnalyze"
          data-tip="Analyze namesbase to get a validity and quality overview"
          class="icon-flask"
        ></button>
        <button
          id="namesbaseSpeak"
          data-tip="Speak the examples. You can change voice and language in options"
          class="icon-voice"
        ></button>
      </div>
    </div>`),a(`namesbaseSelect`).addEventListener(`change`,S),a(`namesbaseTextarea`).addEventListener(`change`,w),a(`namesbaseUpdateExamples`).addEventListener(`click`,C),a(`namesbaseExamples`).addEventListener(`click`,C),a(`namesbaseName`).addEventListener(`input`,e=>T(e.target.value)),a(`namesbaseMin`).addEventListener(`input`,e=>E(e.target.value)),a(`namesbaseMax`).addEventListener(`input`,e=>D(e.target.value)),a(`namesbaseDouble`).addEventListener(`input`,e=>O(e.target.value)),a(`namesbaseAdd`).addEventListener(`click`,A),a(`namesbaseAnalyze`).addEventListener(`click`,k),a(`namesbaseDefault`).addEventListener(`click`,j),a(`namesbaseDownload`).addEventListener(`click`,M),a(`namesbaseUpload`).addEventListener(`click`,()=>N(!0)),a(`namesbaseUploadExtend`).addEventListener(`click`,()=>N(!1)),a(`namesbaseCA`).addEventListener(`click`,()=>d(`https://cartographyassets.com/asset-category/specific-assets/azgaars-generator/namebases/`)),a(`namesbaseSpeak`).addEventListener(`click`,()=>l(a(`namesbaseExamples`).textContent??``))}function b(){$(`#namesbaseEditor`).dialog(`destroy`),a(`namesbaseEditor`).remove()}function x(){let e=a(`namesbaseSelect`);e.innerHTML=``,Names.nameBases.forEach((t,n)=>{e.options.add(new Option(t.name,String(n)))})}function S(){let e=+a(`namesbaseSelect`).value;if(!Names.nameBases[e]){m(`Namesbase ${e} is not defined`,!1,`error`);return}a(`namesbaseTextarea`).value=Names.nameBases[e].b,a(`namesbaseName`).value=Names.nameBases[e].name,a(`namesbaseMin`).value=String(Names.nameBases[e].min),a(`namesbaseMax`).value=String(Names.nameBases[e].max),a(`namesbaseDouble`).value=Names.nameBases[e].d,C()}function C(){let e=+a(`namesbaseSelect`).value,t=``;for(let n=0;n<7;n++){let r=Names.getBase(e);if(r===void 0){t=`Cannot generate examples. Please verify the data`;break}n&&(t+=`, `),t+=r}a(`namesbaseExamples`).innerHTML=t}function w(){let e=+a(`namesbaseSelect`).value,t=a(`namesbaseTextarea`);if(t.value.split(`,`).length<3){m(`The names data provided is too short or incorrect`,!1,`error`);return}let n=t.value.replace(/[/|]/g,``);Names.nameBases[e].b=n,t.value=n,Names.updateChain(e)}function T(e){let t=+a(`namesbaseSelect`).value,n=a(`namesbaseSelect`),r=e.replace(/[/|]/g,``);n.options[n.selectedIndex].innerHTML=r,Names.nameBases[t].name=r}function E(e){let t=+a(`namesbaseSelect`).value;if(+e>Names.nameBases[t].max){m(`Minimal length cannot be greater than maximal`,!1,`error`);return}Names.nameBases[t].min=+e}function D(e){let t=+a(`namesbaseSelect`).value;if(+e<Names.nameBases[t].min){m(`Maximal length should be greater than minimal`,!1,`error`);return}Names.nameBases[t].max=+e}function O(e){let t=+a(`namesbaseSelect`).value;Names.nameBases[t].d=e}function k(){let e=a(`namesbaseTextarea`).value,t=e.toLowerCase().split(`,`),r=t.length;if(!e||!r){m(`Names data should not be empty`,!1,`error`);return}let s=Names.calculateChain(e),c=u(p(Object.values(s).map(e=>e.length))??0),l=t.map(e=>e.length),d=e.match(/[\u0080-\uFFFF]/gu)?n(e.match(/[\u0080-\uFFFF]/gu).join(``).toLowerCase().split(``)).join(``):`none`,h=t.flatMap(e=>e.match(/[^\w\s]|(.)(?=\1)/g)??[]),g=n(h).filter(e=>h.filter(t=>t===e).length>3),_=g.length?g.join(``):`none`,v=n(t.filter((e,t,n)=>n.indexOf(e)!==t)).join(`, `)||`none`,y=p(t.map(e=>+e.includes(` `)))??0,b=()=>r<30?`<span data-tip='Namesbase contains < 30 names - not enough to generate reasonable data' style='color:red'>[not enough]</span>`:r<100?`<span data-tip='Namesbase contains < 100 names - not enough to generate good names' style='color:darkred'>[low]</span>`:r<=400?`<span data-tip='Namesbase contains a reasonable number of samples' style='color:green'>[good]</span>`:`<span data-tip='Namesbase contains > 400 names. That is too much, try to reduce it to ~300 names' style='color:darkred'>[overmuch]</span>`,x=()=>c<15?`<span data-tip='Namesbase average variety < 15 - generated names will be too repetitive' style='color:red'>[low]</span>`:c<30?`<span data-tip='Namesbase average variety < 30 - names can be too repetitive' style='color:orange'>[mean]</span>`:`<span data-tip='Namesbase variety is good' style='color:green'>[good]</span>`;alertMessage.innerHTML=`<div style="line-height: 1.6em; max-width: 20em">
      <div data-tip="Number of names provided">Namesbase length: ${r} ${b()}</div>
      <div data-tip="Average number of generation variants for each key in the chain">Namesbase variety: ${c} ${x()}</div>
      <hr />
      <div data-tip="The shortest name length">Min name length: ${i(l)}</div>
      <div data-tip="The longest name length">Max name length: ${o(l)}</div>
      <div data-tip="Average name length">Mean name length: ${u(p(l)??0,1)}</div>
      <div data-tip="Common name length">Median name length: ${f(l)}</div>
      <hr />
      <div data-tip="Characters outside of Basic Latin have bad font support">Non-basic chars: ${d}</div>
      <div data-tip="Characters that are frequently (more than 3 times) doubled">Doubled chars: ${_}</div>
      <div data-tip="Names used more than one time">Duplicates: ${v}</div>
      <div data-tip="Percentage of names containing space character">Multi-word names: ${u(y*100,2)}%</div>
    </div>`,$(`#alert`).dialog({resizable:!1,title:`Data Analysis`,width:`auto`,position:{my:`left top-30`,at:`right+10 top`,of:`#namesbaseEditor`},buttons:{OK:function(){$(this).dialog(`close`)}}})}function A(){let e=Names.nameBases.length,t=`This,is,an,example,of,name,base,showing,correct,format,It,should,have,at,least,one,hundred,names,separated,with,comma`;Names.nameBases.push({name:`Base${e}`,i:e,min:5,max:12,d:``,m:0,b:t}),a(`namesbaseSelect`).add(new Option(`Base${e}`,String(e))),a(`namesbaseSelect`).value=String(e),a(`namesbaseTextarea`).value=t,a(`namesbaseName`).value=`Base${e}`,a(`namesbaseMin`).value=`5`,a(`namesbaseMax`).value=`12`,a(`namesbaseDouble`).value=``,a(`namesbaseExamples`).innerHTML=`Please provide names data`}function j(){alertMessage.innerHTML=`Are you sure you want to restore default namesbase?`,$(`#alert`).dialog({resizable:!1,title:`Restore default data`,buttons:{Restore:function(){$(this).dialog(`close`),Names.clearChains(),Names.nameBases=Names.getNameBases(),x(),S()},Cancel:function(){$(this).dialog(`close`)}}})}function M(){t(Names.nameBases.map(e=>`${e.name}|${e.min}|${e.max}|${e.d}|${e.m}|${e.b}`).join(`\r
`),`${s(`Namesbase`)}.txt`)}function N(e){_??=c(`.txt`),_.onchange=()=>r(_,t=>P(t,e)),_.click()}function P(t,n=!0){let r=t.replace(/\r\n|\r/g,`
`).split(`
`).filter(Boolean);if(!r.length){m(`Cannot load a namesbase. Please check the data format`,!1,`error`);return}Names.clearChains(),n&&(Names.nameBases=[]);let i=[];if(r.forEach((e,t)=>{try{let[t,n,r,i,a,o]=e.split(`|`),s=t?.replace(F,``);if(!s)throw Error(`Name is missing`);let c=o?.replace(F,``);if(!c)throw Error(`Names are missing`);Names.nameBases.push({name:s,i:Names.nameBases.length,min:+n,max:+r,d:i,m:+a,b:c})}catch(n){i.push({id:t+1,line:e,error:n.message}),ERROR&&console.error(n)}}),i.length>0){ERROR&&console.error(`Namesbase upload errors`,i);let t=i.map(({id:t,line:n,error:r})=>`<li style="padding:0.6em 0;border-top:1px solid #ddd;">
            <div>
              Line ${t}:
              <span style="color:#8b0000">${e(r)}.</span> Data:
            </div>
            <div style="margin-top:0.35em;font-family:var(--font-monospace,monospace);line-height:1.4;word-break:break-word;color:#333;">
              ${e(n)||`<empty line>`}
            </div>
          </li>`).join(``);alertMessage.innerHTML=`<div>
        <p style="margin:0.75em;">
          <strong>File parsing error. Only ${r.length-i.length} out of ${r.length} namebases added.</strong>
          Each namebase should be on its own line and follow the format: <code>name|min|max|duplication|m|names</code>. Parameters should be separated with the <code>|</code> character, and this character should not be used within the parameters. Another prohibited character is <code>/</code>. The most common issue is names and other parameters being on two separate lines.
          <ul style="margin:0.5em;">
            <li><code>name</code>: name of the base.</li>
            <li><code>min</code>: minimal recommended length of generated names. It should be a number.</li>
            <li><code>max</code>: maximal recommended length of generated names. It should be a number greater than minimal length.</li>
            <li><code>duplication</code>: characters that can be duplicated in generated names. For example <code>lkd</code> means names like "Kalla", "Mikkor", "Dalddur" are possible. This parameter can be empty.</li>
            <li><code>m</code>: unused parameter, populate with <code>0</code>.</li>
            <li><code>names</code>: names data, separated with commas. It should contain at least 3 names to be valid.</li>
          </ul>
        </p>
        <div>
          <ul style="margin:0;padding-left:1.5em;">
            ${t}
          </ul>
        </div>
      </div>`,$(`#alert`).dialog({resizable:!1,title:`Parsing error`,width:`min(72vw, 68em)`,position:{my:`center center-4em`,at:`center`,of:`svg`},buttons:{Continue:function(){$(this).dialog(`close`)}}})}x(),S()}var F=/[|/]/g,I={open:v};export{I as NamesbaseEditor};