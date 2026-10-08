import{P as e,nr as t}from"./utils-BXzQ0Tym.js";import{S as n,n as r,s as i,t as a,w as o,x as s}from"./options-tab-CAT6kefx.js";import{t as c}from"./layers-Cld3ceTu.js";import{o as l}from"./options-schema-CWLfsv4m.js";import{r as u}from"./generation-pipeline-DpXug-KW.js";import{i as d}from"./dialog-helpers-CJ5pbzaw.js";import{s as f}from"./index-C_h8P6M7.js";var p=!1,m=0,h=0;function g(){_(),v(),b(),$(`#transformTool`).dialog({title:`Преобразовать карту`,resizable:!1,position:{my:`center`,at:`center`,of:`svg`},close:y,buttons:{Трансформация:function(){D(),$(this).dialog(`close`)},Отмена:function(){$(this).dialog(`close`)}}})}function _(){d(`transformTool`);let t=String(options.generation.graph.density),n=l[+t],r=`<div id="transformTool" class="dialog">
    <div style="padding-top: 0.5em; width: 40em; font-weight: bold">
      Операция разрушительна и необратима: будет создана совершенно новая карта на основе текущей. Сначала сохраните файл .map на свой компьютер!
    </div>
    <div
      id="transformToolBody"
      style="
        padding: 0.5em 0;
        width: 100%;
        display: grid;
        grid-template-columns: 1fr 1fr;
        grid-template-rows: repeat(5, 1fr);
        align-items: center;
      "
    >
      <div>Число точек</div>
      <div>
        <input id="transformPointsInput" type="range" min="1" max="13" value="${t}" />
        <output id="transformPointsFormatted" style="color: ${a(n)}">${n/1e3}K</output>
      </div>
      <div>Shift</div>
      <div>
        <label>X: <input id="transformShiftX" type="number" size="4" value="0" /></label>
        <label>Y: <input id="transformShiftY" type="number" size="4" value="0" /></label>
      </div>
      <div>Повернуть</div>
      <div>
        <input id="transformAngleInput" type="range" min="0" max="359" value="0" />
        <output id="transformAngleOutput">0</output>°
      </div>
      <div>Масштаб</div>
      <div>
        <input id="transformScaleInput" type="range" min="-25" max="25" value="0" />
        <output id="transformScaleResult">1</output>x
      </div>
      <div>Отразить</div>
      <div style="display: flex; gap: 0.5em">
        <input type="checkbox" class="checkbox" id="transformMirrorH" />
        <label for="transformMirrorH" class="checkbox-label">horizontally</label>
        <input type="checkbox" class="checkbox" id="transformMirrorV" />
        <label for="transformMirrorV" class="checkbox-label">vertically</label>
      </div>
    </div>
    <div id="transformPreview" style="position: relative; overflow: hidden; outline: 1px solid #666">
      <canvas id="transformPreviewCanvas" style="position: absolute; transform-origin: center"></canvas>
    </div>
  </div>`;e(`dialogs`).insertAdjacentHTML(`beforeend`,r)}function v(){e(`transformToolBody`).addEventListener(`input`,S),e(`transformPointsInput`).oninput=x;let t=e(`transformPreview`);t.addEventListener(`mousedown`,C),t.addEventListener(`mouseup`,w),t.addEventListener(`mousemove`,T),t.addEventListener(`wheel`,E)}function y(){p=!1,d(`transformTool`)}async function b(){let t=Math.min(400,window.innerWidth*.5),n=t/options.map.graph.width,r=options.map.graph.height*n;e(`transformPreview`).style.width=`${t}px`,e(`transformPreview`).style.height=`${r}px`;let i=await window.Services.ExportMap.getMapURL(`png`,{noWater:!0,fullMap:!0,noLabels:!0,noScaleBar:!0,noVignette:!0,noIce:!0}),a=new Image;a.src=i,a.onload=()=>{let n=e(`transformPreviewCanvas`);n.style.width=`${t}px`,n.style.height=`${r}px`,n.width=t*4,n.height=r*4,n.getContext(`2d`)?.drawImage(a,0,0,t*4,r*4)}}function x(t){let n=l[+t.target.value],r=e(`transformPointsFormatted`);r.value=`${n/1e3}K`,r.style.color=a(n)}function S(){let n=Math.min(400,window.innerWidth*.5)/options.map.graph.width,r=e(`transformAngleInput`).value;e(`transformAngleOutput`).value=r;let i=r/180*Math.PI,a=+e(`transformShiftX`).value,o=+e(`transformShiftY`).value,s=e(`transformMirrorH`).checked,c=e(`transformMirrorV`).checked,l=t(1.0965**e(`transformScaleInput`).value,2);e(`transformScaleResult`).value=String(l),e(`transformPreviewCanvas`).style.transform=`
    translate(${a*n}px, ${o*n}px)
    scale(${s?-l:l}, ${c?-l:l})
    rotate(${i}rad)
  `}function C(t){let n=Math.min(400,window.innerWidth*.5)/options.map.graph.width;p=!0;let r=+e(`transformShiftX`).value,i=+e(`transformShiftY`).value;m=r-t.clientX/n,h=i-t.clientY/n}function w(){p=!1}function T(t){if(!p)return;t.preventDefault();let n=Math.min(400,window.innerWidth*.5)/options.map.graph.width;e(`transformShiftX`).value=String(Math.round(m+t.clientX/n)),e(`transformShiftY`).value=String(Math.round(h+t.clientY/n)),S()}function E(t){let n=e(`transformScaleInput`);n.value=String(n.valueAsNumber-Math.sign(t.deltaY)),S()}function D(){INFO&&console.group(`transformMap`);let t=e(`transformPointsInput`).value;t!==String(options.generation.graph.density)&&r(+t);let[a,l]=O();s(),n(),resetZoom(0),u(),f.process({projection:a,inverse:l,scale:1}),c.drawAll(),i(),o(),INFO&&console.groupEnd()}function O(){let t=options.map.graph.width/2,n=options.map.graph.height/2,r=+e(`transformShiftX`).value,i=+e(`transformShiftY`).value,a=e(`transformAngleInput`).value/180*Math.PI,o=Math.cos(a),s=Math.sin(a),c=+e(`transformScaleResult`).value,l=e(`transformMirrorH`).checked,u=e(`transformMirrorV`).checked;function d(e,d){return e-=t,d-=n,c!==1&&(e*=c,d*=c),a&&([e,d]=[e*o-d*s,e*s+d*o]),l&&(e=-e),u&&(d=-d),[e+t+r,d+n+i]}function f(e,d){return e-=t+r,d-=n+i,u&&(d=-d),l&&(e=-e),a!==0&&([e,d]=[e*o+d*s,-e*s+d*o]),c!==1&&(e/=c,d/=c),[e+t,d+n]}return[d,f]}var k={open:g};export{k as TransformTool};