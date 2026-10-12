import{P as e,er as t,nr as n,nt as r,tt as i}from"./utils-BXzQ0Tym.js";import{S as a,n as o,s,t as c,w as l,x as u}from"./options-tab-CAT6kefx.js";import{t as d}from"./layers-Cld3ceTu.js";import{i as f}from"./viewport-C0deAIKO.js";import{o as p}from"./options-schema-CWLfsv4m.js";import{r as m}from"./generation-pipeline-DpXug-KW.js";import{i as h}from"./dialog-helpers-CJ5pbzaw.js";import{s as g}from"./index-C_h8P6M7.js";function _(){v(),y(),$(`#submapTool`).dialog({title:`Создать субкарту`,resizable:!1,width:`32em`,position:{my:`center`,at:`center`,of:`svg`},close:b,buttons:{Субкарта:function(){S(),$(this).dialog(`close`)},Отмена:function(){$(this).dialog(`close`)}}})}function v(){h(`submapTool`);let t=String(options.generation.graph.density),n=p[+t],r=`<div id="submapTool" class="dialog">
    <p style="font-weight: bold">
      Операция разрушительна и необратима: будет создана совершенно новая карта на основе текущей. Сначала сохраните файл .map на свой компьютер!
    </p>
    <div style="display: flex; flex-direction: column; gap: 0.5em">
      <div data-tip="Число точек (ячеек) субкарты" style="display: flex; gap: 1em">
        <div>Число точек</div>
        <div>
          <input id="submapPointsInput" type="range" min="1" max="13" value="${t}" />
          <output id="submapPointsFormatted" style="color: ${c(n)}">${n/1e3}K</output>
        </div>
      </div>
      <div data-tip="Отметьте, чтобы подгонять стили городов (иконку и размер надписи) под масштаб субкарты">
        <input type="checkbox" class="checkbox" id="submapRescaleBurgStyles" checked />
        <label for="submapRescaleBurgStyles" class="checkbox-label">Масштабировать стили городов</label>
      </div>
    </div>
  </div>`;e(`dialogs`).insertAdjacentHTML(`beforeend`,r)}function y(){e(`submapPointsInput`).oninput=x}function b(){h(`submapTool`)}function x(t){let n=p[+t.target.value],r=e(`submapPointsFormatted`);r.value=`${n/1e3}K`,r.style.color=c(n)}function S(){INFO&&console.group(`generateSubmap`);let{scale:t,x:n,y:r}=f,[i,c]=[Math.abs(n/t),Math.abs(r/t)];C(i,c,t);let p=e(`submapPointsInput`).value;p!==String(options.generation.graph.density)&&o(+p),u(),a(),resetZoom(0),m(),g.process({projection:(e,n)=>[(e-i)*t,(n-c)*t],inverse:(e,n)=>[e/t+i,n/t+c],scale:t}),e(`submapRescaleBurgStyles`).checked&&w(t),d.drawAll(),s(),l(),INFO&&console.groupEnd()}function C(e,t,a){let{geography:o,graph:s,units:c}=options.map,{coordinates:l}=o;o.mapSize=n(o.mapSize/a,2);let u=l.latT/a;o.latitude=n((90-i(t,l,s.height))/(180-u)*100,2);let d=l.lonT/a;o.longitude=n((180-r(e+s.width/a,l,s.width))/(360-d)*100,2),c.distance.scale=n(c.distance.scale/a,2),c.population.scale=n(c.population.scale/a,2),Options.save()}function w(r){window.Burgs.ensureBurgGroupStyles();for(let i of e(`burgIcons`).querySelectorAll(`:scope > g`)){let e=styles.burgIcons.groups[i.id]?.groups.icons;e&&(e.options.size=n(t(e.options.size*r,.2,10),2)),i.remove()}let i=new Set(pack.burgs.filter(e=>e.i&&!e.removed).map(e=>e.label?.group||e.group||`burg`));for(let e of i){let t=styles.labels.groups[e];if(!t)continue;let i=Number.parseFloat(t.attrs[`font-size`])||0,a=Math.max(n((i+i/r)/2,2),1)*r;t.attrs[`font-size`]=`${n(a,2)}%`}}var T={open:_};export{T as SubmapTool};