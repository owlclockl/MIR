const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["app-offer-s8o8JC0s.js","platform-1wJAdvO1.js","cloud-DAEK7EDu.js","utils-BXzQ0Tym.js","tooltips-P6FAPAdd.js","export-json-IboiHSCI.js","dialog-helpers-CJ5pbzaw.js","state-B2hBYDzv.js","versioning-Cs9ACTcY.js","pins-BUEQgIuf.js","options-schema-CWLfsv4m.js","emblems-generator-BdUAGZhv.js","preload-helper-l6Oh_bU2.js","emblems-uUqrpFK3.js","rolldown-runtime-QTnfLwEv.js","icons-list-BiXau1Li.js","schemaUtils-B2thnuln.js","cultures-generator-D3DKC0_p.js","population-generator-DwMOimZQ.js","mean-4Awewi9R.js","median-B93BzX2A.js","sum-BpJJqxFM.js","validationUtils-cfDkYsje.js","export-frdzRNy1.js","layers-Bcg3SU5R.js","draw-landmass-CUgJu70K.js","minIndex-4vd4__Hw.js","sin-DYm9hqTl.js","natural-kerJ22Hb.js","viewport-C0deAIKO.js","controllers-DoYIZ-kt.js","fonts-61yn7ioO.js","load-De-eirP_.js","viewbox-events-3YWWeuSF.js","drag-DdGpYDDb.js","highlight-izWZujNC.js","notes-BUoBkmSP.js","zoom-Dg3YepmS.js","io-panes-TOQDrHnW.js","generation-pipeline-1xttKRf1.js","graph-override-AthpXXA4.js","styles-Cunem_bH.js","ui-tour-RtDjf5X8.js","ui-tour-B3l7mx48.css"])))=>i.map(i=>d[i]);
import{Et as e,F as t,Gn as n,H as r,It as i,Lt as a,M as o,Mt as s,Nt as c,On as l,P as u,Pt as d,Rt as f,U as p,Yn as m,Z as h,at as g,b as _,er as v,gn as y,kt as b,nr as x,st as ee,tr as te,y as ne}from"./utils-BXzQ0Tym.js";import{H as S,i as re,it as C,t as w,wt as ie}from"./layers-Bcg3SU5R.js";import{t as T}from"./sum-BpJJqxFM.js";import{i as E,o as D,t as O}from"./emblems-generator-BdUAGZhv.js";import{n as ae,t as oe}from"./relief-generator-6bpyjT-b.js";import{t as k}from"./preload-helper-l6Oh_bU2.js";import{a as se,i as ce,n as le,t as A}from"./platform-1wJAdvO1.js";import{i as j,n as ue,t as de}from"./tooltips-P6FAPAdd.js";import{i as M,n as fe}from"./viewport-C0deAIKO.js";import{r as pe}from"./draw-landmass-CUgJu70K.js";import{n as me,r as he,t as N}from"./controllers-DoYIZ-kt.js";import{t as ge}from"./layer-labels-rcim0nKv.js";import"./layers-tab-bK4DgiVc.js";import{c as _e,i as ve,l as ye,o as be,r as xe,s as Se,u as Ce}from"./zoom-Dg3YepmS.js";import{o as we}from"./schemaUtils-B2thnuln.js";import{i as Te,n as Ee,r as De,s as Oe,t as ke}from"./options-schema-CWLfsv4m.js";import{i as Ae,r as je}from"./validationUtils-cfDkYsje.js";import{t as Me}from"./population-generator-DwMOimZQ.js";import{i as Ne,n as Pe,r as Fe,t as Ie}from"./cultures-generator-D3DKC0_p.js";import{t as P}from"./pins-BUEQgIuf.js";import{a as Le,i as Re,n as ze,r as Be}from"./generation-pipeline-1xttKRf1.js";import{t as Ve}from"./view-3d-options-DE1AUzdG.js";import{i as He}from"./features-generator-Cgivnzxw.js";import{n as Ue}from"./labels-generator-CLMaqHM8.js";import{t as We}from"./names-generator-CQrqdCvZ.js";import{s as Ge}from"./styles-Cunem_bH.js";import{t as Ke}from"./transports-generator-Dv1kk2bu.js";import{a as qe,i as Je,n as F,r as Ye,t as I}from"./dialog-helpers-CJ5pbzaw.js";import{n as Xe}from"./view-mode-CT3s7qnT.js";import{t as Ze}from"./graph-override-AthpXXA4.js";import{t as Qe}from"./notes-BUoBkmSP.js";import{a as $e}from"./fonts-61yn7ioO.js";import{n as et,r as tt}from"./versioning-Cs9ACTcY.js";import{t as nt}from"./viewbox-events-3YWWeuSF.js";import{t as rt}from"./styles-legacy--JXcvfke.js";globalThis.DEBUG=m(localStorage.getItem(`debug`)??``)||{},globalThis.INFO=!0,globalThis.TIME=!0,globalThis.WARN=!0,globalThis.ERROR=!0;function it(){INFO&&console.info(` Seed: ${options.map.seed}
    Map size: ${options.map.graph.width}x${options.map.graph.height} px
    Points: ${grid.points.length}
    Cells: ${pack.cells.i.length}
    Map size: ${options.map.geography.mapSize}%
    States: ${pack.states.length-1}
    Provinces: ${pack.provinces.length-1}
    Burgs: ${pack.burgs.length-1}
    Religions: ${pack.religions.length-1}
    Culture set: ${options.map.cultures.set}
    Cultures: ${pack.cultures.length-1}`)}function at(e=options.app.ui.assistant===`show`){let n=t(`assistantBubble`);n&&(n.style.display=e?`flex`:`none`)}function ot(e){let n=t(`assistantBubble`);n?.classList.toggle(`open`,e),n?.setAttribute(`aria-expanded`,String(e))}function st(){let{width:e,height:t}=options.map.graph,n=(n,r)=>l(n).selectAll(r).attr(`x`,0).attr(`y`,0).attr(`width`,e).attr(`height`,t);n(`#landmass`,`rect`),n(`#oceanPattern`,`rect`),n(`#oceanLayers`,`rect`),n(`#fogging`,`rect`),l(`#deftemp`).select(`mask#fog > rect`).attr(`width`,e).attr(`height`,t),l(`#deftemp`).select(`mask#water > rect`).attr(`width`,e).attr(`height`,t)}var ct=4;function lt(){let{width:e,height:n}=options.map.graph,r=Math.ceil(Math.max(M.width/e,M.height/n)*1e3)/1e3,i=Math.floor(r/ct*1e4)/1e4,a=options.app.zoomExtent.min||r,o=Math.min(Math.max(a,Math.min(i,r)),r);Options.set(e=>e.app.zoomExtent.min=o);let s=t(`zoomExtentMin`);s&&(s.value=String(o)),ye(o,options.app.zoomExtent.max),xe()}function ut(e,n){fe(e,n),l(`#map`).attr(`width`,M.width).attr(`height`,M.height),_e(0,0,options.map.graph.width,options.map.graph.height),lt();let r=(e,n)=>{let r=t(e);r&&(r.value=String(n))};r(`viewportWidth`,M.width),r(`viewportHeight`,M.height),w.draw(`scaleBar`),S()}function L(){let e=options.app.viewport??{width:window.innerWidth,height:window.innerHeight};ut(e.width>0?e.width:options.map.graph.width,e.height>0?e.height:options.map.graph.height)}var dt=[`citadel`,`plaza`,`shanty`,`temple`,`walls`],ft={fill:`#ffffff`,stroke:`#3e3e4b`},pt=()=>options.generation.burgs.limit===ke,R=new class{iconSets=[{id:`burgs`,group:`Settlements`,em:10,paint:ft},{id:`ports`,group:`Settlements`,em:10,paint:ft}];generate(){let{cells:e}=pack,t=[0];e.burg=new Uint16Array(e.i.length);let n=e.i.filter(t=>e.s[t]>0&&e.culture[t]);if(!n.length)return ERROR&&console.error(`There is no populated cells with culture assigned. Cannot generate states`),t;let r=D();(()=>{let a=new Int16Array(e.s.map(e=>e*(.5+Math.random()*.5))),o=n.sort((e,t)=>a[t]-a[e]),s=i(),c=(options.map.graph.width+options.map.graph.height)/2/s;for(let n=0;t.length<=s;n++){let i=o[n],[a,s]=e.p[i];r.find(a,s,c)===void 0&&(t.push({cell:i,x:a,y:s,i:t.length}),r.add([a,s])),n===o.length-1&&(WARN&&console.warn(`Cannot place capitals with current spacing. Trying again with reduced spacing`),r=D(),n=-1,t=[0],c/=1.2)}t.forEach((t,n)=>{n&&(t.i=n,t.state=n,t.culture=e.culture[t.cell],t.name=Names.getCultureShort(t.culture),t.feature=e.f[t.cell],t.capital=1,e.burg[t.cell]=n)})})(),(()=>{let i=new Int16Array(e.s.map(e=>e*c(1,3,0,20,3))),o=n.sort((e,t)=>i[t]-i[e]),s=a(),l=(options.map.graph.width+options.map.graph.height)/150/(s**.7/66);for(let n=0;n<s&&l>1;){for(let i=0;n<s&&i<o.length;i++){if(e.burg[o[i]])continue;let a=o[i],[s,u]=e.p[a],d=l*c(1,.3,.2,2,2);if(r.find(s,u,d)!==void 0)continue;let f=t.length,p=e.culture[a],m=Names.getCulture(p),h=e.f[a];t.push({cell:a,x:s,y:u,i:f,state:0,culture:p,name:m,feature:h,capital:0}),n++,e.burg[a]=f}l*=.5}})(),pack.burgs=t,this.assignPorts();function i(){let e=options.generation.states.limit;return n.length<e*10&&(e=Math.floor(n.length/10),WARN&&console.warn(`Not enough populated cells. Generating only ${e} capitals/states`)),e}function a(){return pt()?x(n.length/5/(grid.points.length/1e4)**.8):Math.min(options.generation.burgs.limit,n.length)}}getType(e,t){let{cells:n,features:r}=pack;if(t)return`Naval`;let i=n.haven[e];if(i!==void 0&&r[n.f[i]].type===`lake`)return`Lake`;if(n.h[e]>60)return`Highland`;if(n.r[e]&&n.fl[e]>=100)return`River`;let a=n.biome[e],o=n.pop[e];if(!n.burg[e]||o<=5){if(o<5&&[1,2,3,4].includes(a))return`Nomadic`;if(a>4&&a<10)return`Hunting`}return Ne}assignPorts(){let{cells:e,burgs:t}=pack,n=new Map(pack.rivers.map(e=>[e.i,e]));for(let e of t)e.i&&!e.lock&&delete e.port;let r=this.collectPortCandidates(t);for(let e of r.values())if(e.length)for(let t of this.selectPorts(e))this.promoteToPort(t,n);for(let r of t){if(!r.i||r.lock||r.port||!e.r[r.cell])continue;let[t,i]=this.shiftTowardsRiverBank(r.cell,n);r.x=t,r.y=i}}collectPortCandidates(e){let{cells:t}=pack,n=grid.cells.temp,r=new Map,i=e=>{r.has(e.portFeatureId)||r.set(e.portFeatureId,[]),r.get(e.portFeatureId).push(e)};for(let r of e){if(!r.i||r.lock)continue;let e=t.haven[r.cell],a=t.f[r.cell];if(e){let o=t.harbor[r.cell];if(!o)continue;let s=t.f[e],c=pack.features[s];if(!c||c.cells<=1||He.has(c.subtype)||n[t.g[r.cell]]<=0)continue;i({burg:r,haven:e,portFeatureId:c.type===`lake`&&c.outlet?Rivers.resolveLakeDrainFeature(s)??s:s,landFeature:a,preferred:o&&!!r.capital||o===1})}else{if(!Rivers.isNavigable(r.cell))continue;let e=Rivers.resolveDrainFeature(r.cell);if(!e)continue;i({burg:r,haven:null,portFeatureId:e,landFeature:a,preferred:!0})}}return r}selectPorts(e){let{cells:t}=pack,n=e=>(e.burg.capital?-1e3:0)+(e.haven===null?0:t.harbor[e.burg.cell]),r=new Set;for(let t of e)t.preferred&&r.add(t);let i=new Map;for(let t of e)i.has(t.landFeature)||i.set(t.landFeature,[]),i.get(t.landFeature).push(t);for(let e of i.values())e.some(e=>r.has(e))||r.add(e.reduce((e,t)=>n(t)<n(e)?t:e));if(r.size<2){let t=e.filter(e=>!r.has(e)).sort((e,t)=>n(e)-n(t));for(let e of t)if(r.add(e),r.size>=2)break}return r.size<2?[]:[...r]}promoteToPort(e,t){let{burg:n,haven:r,portFeatureId:i}=e;n.port=i;let[a,o]=r===null?this.shiftTowardsRiverBank(n.cell,t):this.getCloseToEdgePoint(n.cell,r);n.x=a,n.y=o}getCloseToEdgePoint(e,t){let{cells:n,vertices:r}=pack,[i,a]=n.p[e],o=n.v[e].filter(e=>r.c[e].some(e=>e===t)),[s,c]=r.p[o[0]],[l,u]=r.p[o[1]],d=(s+l)/2,f=(c+u)/2;return[x(i+.95*(d-i),2),x(a+.95*(f-a),2)]}shiftTowardsRiverBank(e,t){let{cells:n}=pack,[r,i]=n.p[e],a=Math.min(n.fl[e]/200,.6),o=this.getRiverTangent(e,t);if(!o){let t=e%2?r+a:r-a,o=n.r[e]%2?i+a:i-a;return[x(t,2),x(o,2)]}let[s,c]=o,l=Math.hypot(s,c),u=e%2?1:-1,d=r+-c/l*a*u,f=i+s/l*a*u;return[x(d,2),x(f,2)]}getRiverTangent(e,t){let{cells:n}=pack,r=t.get(n.r[e]);if(!r)return null;let i=r.cells.indexOf(e);if(i===-1)return null;let a=r.cells[i-1],o=r.cells[i+1],s=a!==void 0&&a>=0?n.p[a]:n.p[e],c=o!==void 0&&o>=0?n.p[o]:n.p[e],l=c[0]-s[0],u=c[1]-s[1];return l===0&&u===0?null:[l,u]}definePopulation(e){let t=e.cell,n=pack.cells.s[t]/5;e.capital&&(n*=1.5);let r=Routes.getConnectivityRate(t);r&&(n*=r),n*=c(1,1,.25,4,5),n+=(e.i%100-t%100)/1e3,e.population=x(Math.max(n,.01),3)}defineEmblem(e){e.type=this.getType(e.cell,e.port);let t=pack.states[e.state],n=t.coa,r=.25;e.capital?r+=.1:e.port&&(r-=.1),e.culture!==t.culture&&(r-=.25);let i=e.capital&&b(.2)?`Capital`:e.type===`Generic`?`City`:e.type;e.coa=O.generate(n,r,null,i),e.coa.shield=O.getShield(e.culture,e.state)}defineFeatures(e){let t=e.population;e.citadel=Number(e.capital||t>50&&b(.75)||t>15&&b(.5)||b(.1)),e.walls=Number(e.capital||t>30||t>20&&b(.75)||t>10&&b(.5)||b(.1)),e.shanty=Number(t>60||t>40&&b(.75)||t>20&&e.walls&&b(.4));let n=pack.cells.religion[e.cell],r=pack.states[e.state].form===`Theocracy`;e.temple=Number(n&&r&&b(.5)||t>50||t>35&&b(.75)||t>20&&b(.5))}parseStoredGroups(e){let t=e?m(e):null,n=Array.isArray(t)?t.filter(e=>typeof e?.name==`string`&&typeof e?.order==`number`):[];return n.length?(this.ensureDefaultGroup(n),n):this.getDefaultGroups()}ensureDefaultGroup(e){e.length&&!e.some(e=>e.isDefault)&&(e[0].isDefault=!0)}getDefaultGroups(){return[{name:`capital`,active:!0,order:9,features:{capital:!0},preview:`watabou-city`},{name:`city`,active:!0,order:8,percentile:90,min:5,preview:`watabou-city`},{name:`fort`,active:!0,features:{citadel:!0,walls:!1,plaza:!1,port:!1},order:6,max:1},{name:`monastery`,active:!0,features:{temple:!0,walls:!1,plaza:!1,port:!1},order:5,max:.8},{name:`caravanserai`,active:!0,features:{port:!1,plaza:!0},order:4,max:.8,biomes:[1,2,3]},{name:`trading_post`,active:!0,order:3,features:{plaza:!0},max:.8,biomes:[5,6,7,8,9,10,11,12]},{name:`village`,active:!0,order:2,min:.1,max:2,preview:`watabou-village`},{name:`hamlet`,active:!0,order:1,features:{plaza:!1},max:.1,preview:`watabou-village`},{name:`town`,active:!0,order:7,isDefault:!0,preview:`watabou-city`}]}ensureBurgGroupStyles(){let{groups:e}=styles.burgIcons,t=e.town||Object.values(e)[0];if(t)for(let{name:n}of options.map.burgs.groups){let r=e[n]??structuredClone(t);e[n]=r,r.groups.icons??=structuredClone(t.groups.icons),r.groups.anchors??=structuredClone(t.groups.anchors)}}defineGroup(e,t){if(e.lock&&e.group&&options.map.burgs.groups.find(t=>t.name===e.group))return;let n=options.map.burgs.groups.find(e=>e.isDefault);if(!n){ERROR&&console.error(`No default group defined`);return}e.group=n.name,e.label?.group&&delete e.label.group;for(let n of options.map.burgs.groups)if(n.active&&!(n.min&&!(e.population>=n.min))&&!(n.max&&!(e.population<=n.max))&&!(n.features&&!Object.entries(n.features).every(([t,n])=>!!e[t]===n))&&!(n.biomes&&!n.biomes.includes(pack.cells.biome[e.cell]))&&!(n.percentile&&!(t.indexOf(e.population)>=Math.floor(t.length*n.percentile/100)))){e.group=n.name;return}}specify(){pack.burgs.forEach(e=>{!e.i||e.removed||e.lock||(this.definePopulation(e),this.defineEmblem(e),this.defineFeatures(e))});let e=pack.burgs.filter(e=>e.i&&!e.removed).map(e=>e.population).sort((e,t)=>e-t);pack.burgs.forEach(t=>{!t.i||t.removed||this.defineGroup(t,e)})}createWatabouCityLinks(e){let t=pack.cells,{i:n,name:r,population:i,cell:a}=e,o=e.MFCG||options.map.seed+String(e.i).padStart(4,`0`),c=2.13*(i*options.map.units.population.scale/options.map.units.population.urbanization.density)**.385,l=v(Math.ceil(c),6,100),u=x(i*options.map.units.population.scale*options.map.units.population.urbanization.rate),d=+!!t.r[a],f=Number((e.port||0)>0),p=(()=>{if(!f||!t.haven[a])return null;let[e,n]=t.p[a],[r,i]=t.p[t.haven[a]],o=Math.atan2(i-n,r-e)*180/Math.PI;return x(o<=0?te(Math.abs(o),0,180):2-te(o,0,180),2)})(),m=+(d?[1,2,3,4,5,6,7,8]:[5,6,7,8]).includes(t.biome[a]),h=Number(e.citadel??0),g=Number(h&&s(2)(n)),_=Number(Routes.isCrossroad(a)),y=Number(e.walls??0),b=Number(e.plaza??0),ee=Number(e.temple??0),ne=Number(e.shanty??0),S=new URL(`https://watabou.github.io/city-generator/`);S.search=new URLSearchParams({name:r||``,population:u.toString(),size:l.toString(),seed:o,river:d.toString(),coast:f.toString(),farms:m.toString(),citadel:h.toString(),urban_castle:g.toString(),hub:_.toString(),plaza:b.toString(),greens:b?`1`:`0`,temple:ee.toString(),walls:y.toString(),shantytown:ne.toString(),style:`natural`}).toString(),p&&S.searchParams.append(`sea`,p.toString());let re=S.toString();return{link:re,preview:`${re}&preview=1`}}createWatabouVillageLinks(e){let{cells:t,features:n}=pack,{i:r,population:i,cell:a}=e,o=options.map.seed+String(r).padStart(4,`0`),c=x(i*options.map.units.population.scale*options.map.units.population.urbanization.rate),l=[];t.r[a]&&t.haven[a]?l.push(`estuary`):t.haven[a]&&n[t.f[a]].cells===1?l.push(`island,district`):e.port?l.push(`coast`):t.conf[a]?l.push(`confluence`):t.r[a]?l.push(`river`):c<200&&s(4)(a)&&l.push(`pond`);let u=Routes.getConnectivityRate(a);l.push(u>1?`highway`:u===1?`dead end`:`isolated`);let d=t.biome[a];(t.r[a]?[1,2,3,4,5,6,7,8]:[5,6,7,8]).includes(d)?s(6)(a)&&l.push(`farmland`):l.push(`uncultivated`);let f=grid.cells.temp[t.g[a]];(f<=0||f>28||f>25&&s(3)(a))&&l.push(`no orchards`),e.plaza||l.push(`no square`),e.walls&&l.push(`palisade`),c<100?l.push(`sparse`):c>300&&l.push(`dense`);let p=c>1500?1600:c>1e3?1400:c>500?1e3:c>200?800:c>100?600:400,m=x(p/2.05),h=[1,2].includes(d)?`sand`:f<=5||[9,10,11].includes(d)?`snow`:`default`,g=new URL(`https://watabou.github.io/village-generator/`);g.search=new URLSearchParams({pop:c.toString(),name:e.name||``,seed:o,width:p.toString(),height:m.toString(),style:h,tags:l.join(`,`)}).toString();let _=g.toString();return{link:_,preview:`${_}&preview=1`}}createWatabouDwellingLinks(e){let t=options.map.seed+String(e.i).padStart(4,`0`),n=x(e.population*options.map.units.population.scale*options.map.units.population.urbanization.rate),r=n>200?[`large`,`tall`]:n>100?[`large`]:n>50?[`tall`]:n>20?[`low`]:[`small`],i=new URL(`https://watabou.github.io/dwellings/`);i.search=new URLSearchParams({pop:n.toString(),name:``,seed:t,tags:r.join(`,`)}).toString();let a=i.toString();return{link:a,preview:`${a}&preview=1`}}getPreview(e){let t={"watabou-city":e=>this.createWatabouCityLinks(e),"watabou-village":e=>this.createWatabouVillageLinks(e),"watabou-dwelling":e=>this.createWatabouDwellingLinks(e)};if(e.link)return{link:e.link,preview:e.link};let n=options.map.burgs.groups.find(t=>t.name===e.group);return!n?.preview||!t[n.preview]?{link:null,preview:null}:t[n.preview](e)}add(e,t){let{cells:n}=pack,r=Pack.requireCell(e,t);if(n.h[r]<20)throw Error(`A burg cannot be placed in the water`);if(n.burg[r])throw Error(`Cell ${r} already has burg ${n.burg[r]}`);let i=pack.burgs.length,a=n.culture[r],o={cell:r,x:e,y:t,i,state:n.state[r],culture:a,name:Names.getCulture(a),feature:n.f[r],capital:0,port:0};this.definePopulation(o),this.defineEmblem(o),this.defineFeatures(o);let s=pack.burgs.filter(e=>e.i&&!e.removed).map(e=>e.population).sort((e,t)=>e-t);return this.defineGroup(o,s),pack.burgs.push(o),n.burg[r]=i,Routes.connect(r),i}regenerate(){let{cells:e,burgs:t,states:n,provinces:r}=pack;Me.rankCells();let i=[0],a=D();e.burg=new Uint16Array(e.i.length),n.filter(e=>e.i).forEach(e=>{e.capital=0}),r.filter(e=>e.i).forEach(e=>{e.burg=0});let o=t.filter(e=>e.i&&!e.removed&&e.lock);for(let t of o){let r=i.length;t.i=r,i.push(t),a.add([t.x,t.y]),e.burg[t.cell]=r,t.capital&&t.state!==void 0&&(n[t.state].capital=r,n[t.state].center=t.cell)}let s=new Set(pack.markets.map(e=>e.centerBurgId)),l=t.filter(e=>e.i&&!e.removed&&!e.lock&&s.has(e.i));for(let t of l){let r=t.i,o=i.length,s=pack.markets.find(e=>e.centerBurgId===r);s&&(s.centerBurgId=o),t.i=o,i.push(t),a.add([t.x,t.y]),e.burg[t.cell]=o,t.capital&&t.state!==void 0&&(n[t.state].capital=o,n[t.state].center=t.cell)}let u=new Int16Array(e.s.map(e=>e*Math.random())),d=e.i.filter(t=>u[t]>0&&e.culture[t]).sort((e,t)=>u[t]-u[e]),f=n.filter(e=>e.i&&!e.removed).length,p=(pt()?x(d.length/5/(grid.points.length/1e4)**.8):options.generation.burgs.limit)+f,m=(options.map.graph.width+options.map.graph.height)/150/(p**.7/66);for(let t=0;t<d.length&&i.length<p;t++){let r=i.length,o=d[t],[s,l]=e.p[o],u=m*c(1,.3,.2,2,2);if(a.find(s,l,u)!==void 0)continue;let f=e.state[o],p=Number(!!(f&&!n[f].capital));p&&(n[f].capital=r,n[f].center=o);let h=e.culture[o],g=Names.getCulture(h);i.push({cell:o,x:s,y:l,state:f,i:r,culture:h,name:g,capital:p,feature:e.f[o]}),a.add([s,l]),e.burg[o]=r}pack.burgs=i,this.assignPorts(),n.filter(e=>e.i&&!e.removed&&!e.capital).forEach(t=>{let n=e.burg[t.center]||this.add(...e.p[t.center]);t.capital=n,t.center=pack.burgs[n].cell;let r=pack.burgs[n];r.state=t.i,r.capital=1,this.changeGroup(r,null)}),this.specify(),Routes.regenerate()}changeGroup(e,t=null){if(t)e.group=t;else{let t=pack.burgs.filter(e=>e.i&&!e.removed).map(e=>e.population).sort((e,t)=>e-t);this.defineGroup(e,t)}}rename(e,t){let n=pack.burgs[e];if(!n||n.removed)throw Error(`Burg ${e} does not exist`);n.name=je(t),n.label?.text!==void 0&&(n.label.text=n.name)}setPopulation(e,t){let n=this.living(e),{scale:r,urbanization:i}=options.map.units.population;if(!Number.isFinite(t)||t<0)throw Error(`The population must be a non-negative number`);n.population=x(t/r/i.rate,4)}setGroup(e,t){let n=options.map.burgs.groups.filter(({removed:e})=>!e).map(({name:e})=>e);this.changeGroup(this.living(e),Ae(t,n,`The group`))}setType(e,t){this.living(e).type=Ae(t,Pe,`The type`)}setBuilding(e,t,n){let r=this.living(e),i=Ae(t,dt,`The building`);if(i===`plaza`&&!n&&pack.markets?.some(t=>t.centerBurgId===e))throw Error(`Burg ${e} is a market center and keeps its plaza; remove the market first`);r[i]=+!!n}setCulture(e,t){let n=pack.cultures[t];if(!n||n.removed)throw Error(`Culture ${t} does not exist`);this.living(e).culture=t}setPort(e,t){let n=this.living(e);if(!t){n.port=0;return}let r=this.portWater(n.cell);if(!r)throw Error(`Burg ${e} has no navigable water to be a port on`);n.port=r}portWater(e){let{cells:t,features:n}=pack,r=t.haven[e],i=r?n[t.f[r]]:void 0;return(r?i?.type===`lake`&&i.outlet?Rivers.resolveLakeDrainFeature(i.i)??i.i:t.f[r]:Rivers.resolveDrainFeature(e))||0}setCapital(e){let t=this.living(e),n=pack.states[t.state??0];if(!t.state||!n||n.removed)throw Error(`Burg ${e} is in neutral lands, which have no capital`);if(t.capital)return;let r=pack.burgs[n.capital];n.capital=e,n.center=t.cell,t.capital=1,this.changeGroup(t),r?.i&&r.i!==e&&(r.capital=0,this.changeGroup(r))}move(e,t,n){let r=this.living(e),{cells:i}=pack,a=Pack.requireCell(t,n);if(i.h[a]<20)throw Error(`A burg cannot be placed in the water`);if(i.burg[a]&&i.burg[a]!==e)throw Error(`Cell ${a} already has burg ${i.burg[a]}`);let o=i.state[a];if(r.capital&&o!==r.state)throw Error(`A capital cannot be moved into another state`);let s=pack.provinces?.find(t=>t.i&&!t.removed&&t.burg===e);if(s&&i.province[a]!==s.i)throw Error(`Burg ${e} is the capital of province ${s.i} and cannot leave it`);i.burg[r.cell]=0,i.burg[a]=e,Object.assign(r,{cell:a,state:o,x:x(t,2),y:x(n,2),feature:i.f[a]}),r.capital&&(pack.states[o].center=a),s&&(s.center=a),r.port&&=this.portWater(a),r.label&&Object.assign(r.label,{dx:0,dy:0,pathPoints:void 0})}setTreasury(e,t){if(typeof t!=`number`||!Number.isFinite(t))throw Error(`The treasury must be a number`);this.living(e).treasury=x(t,2)}setLocked(e,t){let n=this.living(e);t?n.lock=!0:delete n.lock}setLink(e,t){let n=this.living(e);if(!t){delete n.link;return}if(typeof t!=`string`||!/^https?:\/\//i.test(t.trim()))throw Error(`The link must be an http(s) URL`);n.link=t.trim()}living(e){let t=pack.burgs[e];if(!t||t.removed)throw Error(`Burg ${e} does not exist`);return t}remove(e){let t=this.living(e);if(t.capital)throw Error(`Burg ${e} is a capital; make another burg the capital first`);if(pack.markets?.some(t=>t.centerBurgId===e))throw Error(`Burg ${e} is a market center; remove the market first`);pack.cells.burg[t.cell]=0,t.removed=!0,delete t.note,delete t.coa;for(let t of pack.provinces??[])t.burg===e&&(t.burg=0)}};window.Burgs=R;var mt=new class{regenerate(){this.generate()}generate(){let{cells:e,states:t}=pack,{p:n}=e,r=t.filter(e=>e.i&&!e.removed),i=T(r.map(e=>e.expansionism)),a=T(r.map(e=>e.area)),o={x:0,Ally:-.2,Friendly:-.1,Neutral:0,Suspicion:.1,Enemy:1,Unknown:0,Rival:.5,Vassal:.5,Suzerain:-.5},s={melee:{Nomadic:.5,Highland:1.2,Lake:1,Naval:.7,Hunting:1.2,River:1.1},ranged:{Nomadic:.9,Highland:1.3,Lake:1,Naval:.8,Hunting:2,River:.8},mounted:{Nomadic:2.3,Highland:.6,Lake:.7,Naval:.3,Hunting:.7,River:.8},machinery:{Nomadic:.8,Highland:1.4,Lake:1.1,Naval:1.4,Hunting:.4,River:1.1},naval:{Nomadic:.5,Highland:.5,Lake:1.2,Naval:1.8,Hunting:.7,River:1.2},armored:{Nomadic:1,Highland:.5,Lake:1,Naval:1,Hunting:.7,River:1.1},aviation:{Nomadic:.5,Highland:.5,Lake:1.2,Naval:1.2,Hunting:.6,River:1.2},magical:{Nomadic:1,Highland:2,Lake:1,Naval:1,Hunting:1,River:1}},c={nomadic:{melee:.2,ranged:.5,mounted:3,machinery:.4,naval:.3,armored:1.6,aviation:1,magical:.5},wetland:{melee:.8,ranged:2,mounted:.3,machinery:1.2,naval:1,armored:.2,aviation:.5,magical:.5},highland:{melee:1.2,ranged:1.6,mounted:.3,machinery:3,naval:1,armored:.8,aviation:.3,magical:2}},l={nomadic:{melee:.3,ranged:.8,mounted:3,machinery:.4,naval:1,armored:1.6,aviation:1,magical:.5},wetland:{melee:1,ranged:1.6,mounted:.2,machinery:1.2,naval:1,armored:.2,aviation:.5,magical:.5},highland:{melee:1.2,ranged:2,mounted:.3,machinery:3,naval:1,armored:.8,aviation:.3,magical:2}};r.forEach(e=>{e.temp={};let t=e.diplomacy,n=v(e.expansionism/i/(e.area/a),.25,4),r=t.some(e=>e===`Enemy`)?1:t.some(e=>e===`Rival`)?.8:t.some(e=>e===`Suspicion`)?.5:.1,c=v(e.neighbors.map(t=>t?pack.states[t].diplomacy[e.i]:`Suspicion`).reduce((e,t)=>e+o[t],.5),.3,3);e.alert=v(x(n*r*c,2),.1,5),e.temp.platoons=[];for(let t of options.map.military.units){if(!s[t.type])continue;let n=s[t.type][e.type]||1;t.type===`mounted`&&e.formName.includes(`Horde`)?n*=2:t.type===`naval`&&e.form===`Republic`&&(n*=1.2),e.temp[t.name]=n*e.alert}});let u=t=>[1,2,3,4].includes(e.biome[t])?`nomadic`:[7,8,9,12].includes(e.biome[t])?`wetland`:e.h[t]>=70?`highland`:`generic`;function d(e,t,n,r,i){return!(e.biomes&&!e.biomes.includes(t)||e.states&&!e.states.includes(n)||e.cultures&&!e.cultures.includes(r)||e.religions&&!e.religions.includes(i))}for(let r of e.i){if(!e.pop[r])continue;let i=e.biome[r],a=e.state[r],o=e.culture[r],s=e.religion[r],l=t[a];if(!a||l.removed)continue;let f=e.pop[r]/100;o!==l.culture&&(f=l.form===`Union`?f/1.2:f/2),s!==e.religion[l.center]&&(f=l.form===`Theocracy`?f/2.2:f/1.4),e.f[r]!==e.f[l.center]&&(f=l.type===`Naval`?f/1.2:f/1.8);let p=u(r);for(let t of options.map.military.units){let u=+t.rural;if(Number.isNaN(u)||u<=0||!l.temp[t.name]||!d(t,i,a,o,s)||t.type===`naval`&&!e.haven[r])continue;let m=p===`generic`?1:c[p][t.type],h=x(f*u*m*l.temp[t.name]*options.map.units.population.scale);if(!h)continue;let[g,_]=n[r],v=0;if(t.type===`naval`){let t=e.haven[r];[g,_]=n[t],v=1}l.temp.platoons.push({cell:r,a:h,t:h,x:g,y:_,u:t.name,n:v,s:t.separate,type:t.type})}}for(let r of pack.burgs){if(!r.i||r.removed||!r.state||!r.population)continue;let i=e.biome[r.cell],a=r.state,o=r.culture,s=e.religion[r.cell],c=t[a],f=r.population*options.map.units.population.urbanization.rate/100;r.capital&&(f*=1.2),o!==c.culture&&(f=c.form===`Union`?f/1.2:f/2),s!==e.religion[c.center]&&(f=c.form===`Theocracy`?f/2.2:f/1.4),e.f[r.cell]!==e.f[c.center]&&(f=c.type===`Naval`?f/1.2:f/1.8);let p=u(r.cell);for(let t of options.map.military.units){let u=+t.urban;if(Number.isNaN(u)||u<=0||!c.temp[t.name]||!d(t,i,a,o,s)||t.type===`naval`&&(!r.port||!e.haven[r.cell]))continue;let m=p===`generic`?1:l[p][t.type],h=x(f*u*m*c.temp[t.name]*options.map.units.population.scale);if(!h)continue;let[g,_]=n[r.cell],v=0;if(t.type===`naval`){let t=e.haven[r.cell];[g,_]=n[t],v=1}c.temp.platoons.push({cell:r.cell,a:h,t:h,x:g,y:_,u:t.name,n:v,s:t.separate,type:t.type})}}let f=3*options.map.units.population.scale,p=(e,t)=>!e.s&&!t.s||e.u===t.u,m=(e,t)=>{if(!e.length)return[];e.sort((e,t)=>e.a-t.a);let n=D(e,e=>e.x,e=>e.y),r=(e,t)=>{t.children?t.children.push(e):t.children=[e],e.children&&e.children.forEach(e=>{t.children.push(e)}),t.t+=e.t,e.t=0};e.forEach(e=>{n.remove(e);let t=n.find(e.x,e.y,20);if(t?.t&&p(e,t)){r(e,t);return}if(e.t>f)return;let i=(f-e.t)/(e.s?40:20),a=_(e.x,e.y,i,n);for(let t of a)if(t.t<f&&p(e,t)){r(e,t);break}});let i=e.filter(e=>e.t).sort((e,t)=>t.t-e.t).map((e,n)=>{let r={};return r[e.u]=e.a,(e.children??[]).forEach(e=>{r[e.u]=(r[e.u]??0)+e.a}),{i:n,a:e.t,cell:e.cell,x:e.x,y:e.y,bx:e.x,by:e.y,u:r,n:e.n,name:``,icon:``,state:t.i}});return i.forEach(e=>{e.name=this.getName(e,i),e.icon=this.getEmblem(e),this.generateNote(e,t)}),i};r.forEach(e=>{e.military=m(e.temp.platoons,e),delete e.temp})}getDefaultOptions(){return[{icon:`⚔️`,name:`infantry`,rural:.25,urban:.2,crew:1,power:1,type:`melee`,separate:0},{icon:`🏹`,name:`archers`,rural:.12,urban:.2,crew:1,power:1,type:`ranged`,separate:0},{icon:`🐴`,name:`cavalry`,rural:.12,urban:.03,crew:2,power:2,type:`mounted`,separate:0},{icon:`💣`,name:`artillery`,rural:0,urban:.03,crew:8,power:12,type:`machinery`,separate:0},{icon:`🌊`,name:`fleet`,rural:0,urban:.015,crew:100,power:50,type:`naval`,separate:1}].map(e=>({...e,icon:E.glyph(e.icon)}))}getName(t,n){let r=pack.cells,i=t.n?null:r.province[t.cell]&&pack.provinces[r.province[t.cell]]?pack.provinces[r.province[t.cell]].name:r.burg[t.cell]&&pack.burgs[r.burg[t.cell]]?pack.burgs[r.burg[t.cell]].name:null,a=e(n.filter(e=>e.n===t.n&&e.i<t.i).length+1),o=t.n?`Флот`:`Полк`;return`${a}${i?` (${i}) `:` `}${o}`}getTotal(e){return e.a>(e.n?999:99999)?ne(e.a):e.a}generateNote(e,t){let n=pack.cells,r=n.burg[e.cell]&&pack.burgs[n.burg[e.cell]]?pack.burgs[n.burg[e.cell]].name:n.province[e.cell]&&pack.provinces[n.province[e.cell]]?pack.provinces[n.province[e.cell]].fullName:null,o=r?`${e.name} is ${e.n?`based`:`расквартирован`} in ${r}. `:``,s=e.a?Object.keys(e.u).map(t=>`— ${t}: ${e.u[t]}`).join(`\r
`):null,l=s?`\r\n\r\nRegiment composition in ${options.map.lore.calendar.year} ${options.map.lore.calendar.eraShort}:\r\n${s}.`:``,u=t.campaigns?i(t.campaigns):null,d=u?a(u.start,u.end||options.map.lore.calendar.year):c(options.map.lore.calendar.year-100,150,1,options.map.lore.calendar.year-6),f=u?` during the ${u.name}`:``;e.note=`Regiment was formed in ${d} ${options.map.lore.calendar.era}${f}. ${o}${l}`}rename(e,t,n){this.living(e,t).name=je(n)}remove(e,t){let n=this.living(e,t),r=pack.states[e].military;r.splice(r.indexOf(n),1)}add(e,t,n){let r=pack.states[e];if(!e||!r||r.removed)throw Error(`State ${e} does not exist`);let i=Pack.requireCell(t,n),[a,o]=pack.cells.p[i];r.military??=[];let s=r.military,c=s.length?Math.max(...s.map(e=>e.i))+1:0,l={a:0,cell:i,i:c,n:+(pack.cells.h[i]<20),u:{},x:a,y:o,bx:a,by:o,state:e,icon:E.glyph(`🛡️`),name:``,t:0,s:0,type:``};return l.name=this.getName(l,s),s.push(l),this.generateNote(l,r),c}setUnits(e,t,n){let r=this.living(e,t);if(typeof n!=`object`||!n||Array.isArray(n))throw Error(`Units are an object of unit names and troop numbers`);let i=options.map.military.units.map(({name:e})=>e);for(let[e,t]of Object.entries(n))if(e in r.u||Ae(e,i,`The unit`),!Number.isInteger(t)||t<0)throw Error(`The number of ${e} must be a non-negative integer`);r.u={...n},r.a=T(Object.values(r.u))}setAlert(e,t){let n=pack.states[e];if(!e||!n||n.removed)throw Error(`State ${e} does not exist`);if(typeof t!=`number`||!(t>=0&&Number.isFinite(t)))throw Error(`The alert must be a non-negative number`);let r=n.alert??1;n.alert=x(t,2);let i=r?n.alert/r:0;for(let e of n.military??[]){for(let t of Object.keys(e.u))e.u[t]=x(e.u[t]*i);e.a=T(Object.values(e.u))}}setNaval(e,t,n){this.living(e,t).n=+!!n}setIcon(e,t,n){this.living(e,t).icon=E.reference(n)}move(e,t,n,r){let i=this.living(e,t);Pack.requireCell(n,r),i.x=x(n,2),i.y=x(r,2)}rotate(e,t,n){let r=this.living(e,t);if(typeof n!=`number`||!(n>=-180&&n<=180))throw Error(`The angle must be a number from -180 to 180`);r.angle=x(n,2)}setBase(e,t,n,r){let i=this.living(e,t);Pack.requireCell(n,r),i.bx=x(n,2),i.by=x(r,2)}split(e,t){let n=this.living(e,t),r=pack.states[e],i=r.military,a=Object.fromEntries(Object.entries(n.u).map(([e,t])=>[e,Math.floor(t/2)])),o=T(Object.values(a));if(!o)throw Error(`Regiment ${e}-${t} has too few troops to split`);n.u=Object.fromEntries(Object.entries(n.u).map(([e,t])=>[e,Math.ceil(t/2)])),n.a=T(Object.values(n.u));let s=styles.military.options.boxSize*2,c=n.y+s;for(;i.some(e=>e.x===n.x&&e.y===c);)c+=s;let l=Math.max(...i.map(e=>e.i))+1,u={a:o,cell:n.cell,i:l,n:n.n,u:a,x:n.x,y:c,bx:n.bx,by:n.by,state:e,icon:n.icon,name:``,t:0,s:0,type:n.type};return u.name=this.getName(u,i),i.push(u),this.generateNote(u,r),l}attach(e,t,n,r){let i=this.living(e,t),a=this.living(n,r);if(i===a)throw Error(`A regiment cannot attach to itself`);for(let[e,t]of Object.entries(i.u))t&&(a.u[e]=(a.u[e]||0)+t);a.a=T(Object.values(a.u)),this.remove(e,t)}living(e,t){let n=pack.states[e],r=n&&!n.removed?n.military?.find(({i:e})=>e===t):void 0;if(!r)throw Error(`Regiment ${e}-${t} does not exist`);return r}getEmblem(e){if(!e.n&&!Object.values(e.u).length)return E.glyph(`🔰`);if(!e.n&&pack.states[e.state].form===`Monarchy`&&pack.cells.burg[e.cell]&&pack.burgs[pack.cells.burg[e.cell]].capital)return E.glyph(`👑`);let t=Object.entries(e.u).sort((e,t)=>t[1]-e[1])[0][0],n=options.map.military.units.find(e=>e.name===t);return n?n.icon:E.glyph(`⚔️`)}};window.Military=mt;var ht=`fmg-options`,gt=`fmg-custom-icons`,_t=3e3,vt=`#254537`,yt=500,bt=()=>typeof navigator>`u`?``:navigator.language,xt=()=>[`en-US`,`en-GB`].includes(bt()),St=new class{saveTimer=0;iconsRestored=!1;iconsRevision=0;savedIcons={icons:null,revision:-1};getDefaultOptions(){return{map:{seed:``,graph:{width:1280,height:800,points:1e4},geography:{mapSize:100,latitude:50,longitude:50,coordinates:{latT:180,latN:90,latS:-90,lonT:320,lonW:-160,lonE:160}},climate:{temperature:{equator:27,northPole:-30,southPole:-15},precipitation:100,winds:[225,45,225,315,135,315]},cultures:{set:`world`},lore:{name:``,description:``,calendar:{year:1e3,era:`Era`,eraShort:`E`}},units:{distance:{unit:xt()?`мили`:`km`,scale:3},area:{unit:`square`},height:{unit:xt()?`фут`:`м`,exponent:2},temperature:{unit:bt()===`en-US`?`°F`:`°C`},population:{scale:1e3,urbanization:{rate:1,density:10}}},style:{preset:`night`},burgs:{groups:R.getDefaultGroups()},labels:{groups:Ue.getDefaultGroups()},military:{units:mt.getDefaultOptions()},transports:Ke.getDefaults(),customIcons:[],coastline:pe.getDefaultSettings(),relief:{rules:oe.getDefaultRules()}},generation:{graph:{width:1280,height:800,density:4},geography:{mapSize:null,latitude:null,longitude:null},template:``,resolveDepressionsSteps:250,lakeElevationLimit:20,cultures:{limit:12,set:`world`,sizeVariety:4,growthRate:1},states:{limit:18,sizeVariety:4,growthRate:1},provinces:{ratio:20},religions:{limit:6},burgs:{limit:1e3}},app:{notesPinned:!1,emblems:{showAll:!1,shape:`culture`},labels:{showAll:!1},heightmapEditor:{renderOcean:!1,showDrainage:!1,allowErosion:!0},performance:{shapeRendering:`optimizeSpeed`,stateHalos:!1,viewportRedraw:`continuous`},onLoad:`random`,zoomExtent:{min:.1,max:150},viewport:null,autosave:{interval:15,remind:!0},ui:{size:null,tooltipSize:14,themeColor:vt,transparency:5,assistant:`show`,speakerVoice:``},export:{pngResolution:1,tiles:{cols:8,rows:8,scale:1}},trade:{animation:structuredClone(re)},threeD:structuredClone(Ve)}}}set(e){e(options),this.save()}save(){clearTimeout(this.saveTimer),this.saveTimer=window.setTimeout(()=>this.persist(),yt)}iconsChanged(){this.iconsRevision++,this.save()}persist(){clearTimeout(this.saveTimer),this.saveTimer=0;let{customIcons:e,...t}=options.map;this.persistIcons(e);try{localStorage.setItem(ht,JSON.stringify({...options,map:t}))}catch(e){if(!(e instanceof DOMException&&e.name===`QuotaExceededError`))throw e;console.error(e),j(`Хранилище браузера заполнено, последние настройки в нём не сохранились. Они в безопасности в файле .map: сохраните карту, чтобы сохранить их`,!1,`error`,1e4)}}persistIcons(e){let t=e===this.savedIcons.icons&&this.iconsRevision===this.savedIcons.revision;!this.iconsRestored||t||typeof ldb>`u`||(this.savedIcons={icons:e,revision:this.iconsRevision},ldb.set(gt,e))}async restoreIcons(){if(typeof ldb>`u`)return;let e=Symbol(`unreadable`),t=new Promise(t=>setTimeout(()=>t(e),_t)),n=await Promise.race([ldb.get(gt).catch(()=>e),t]);n!==e&&(this.iconsRestored=!0,Array.isArray(n)?(options.map.customIcons=n.filter(e=>Ee.safeParse(e).success),this.savedIcons={icons:options.map.customIcons,revision:this.iconsRevision}):options.map.customIcons.length&&this.persist())}reset(){options=this.getDefaultOptions(),this.persist()}restore(){this.iconsRestored=!1;let e={},t=m(localStorage.getItem(`fmg-options`)??``);typeof t==`object`&&t&&(e=t);let n=Ge(this.getDefaultOptions(),ae()??{});Ge(n,e),options=we(Te,this.getDefaultOptions(),n,`Options.restore`),this.repairSets(),this.setGraphSize(P.valueOr(`mapWidth`,window.innerWidth),P.valueOr(`mapHeight`,window.innerHeight)),this.persist()}setGraphSize(e,t){let{graph:n}=options.generation;n.width=e??P.valueOr(`mapWidth`,n.width),n.height=t??P.valueOr(`mapHeight`,n.height),n.width>0||(n.width=1280),n.height>0||(n.height=800)}randomize(){let{generation:e}=options,{graph:t,cultures:n,states:r,provinces:i,religions:o,burgs:s}=e;t.density=P.rolls(`points`)?4:P.valueOr(`points`,t.density),e.resolveDepressionsSteps=P.valueOr(`resolveDepressionsSteps`,e.resolveDepressionsSteps),e.lakeElevationLimit=P.valueOr(`lakeElevationLimit`,e.lakeElevationLimit),e.geography={mapSize:P.valueOr(`mapSize`,null),latitude:P.valueOr(`latitude`,null),longitude:P.valueOr(`longitude`,null)},e.template=P.rolls(`template`)?this.randomTemplate():P.valueOr(`template`,e.template),r.limit=P.rolls(`statesNumber`)?c(18,5,2,30):P.valueOr(`statesNumber`,r.limit),i.ratio=P.rolls(`provincesRatio`)?c(20,10,20,100):P.valueOr(`provincesRatio`,i.ratio),s.limit=P.rolls(`manors`)?ke:P.valueOr(`manors`,s.limit),o.limit=P.rolls(`religionsNumber`)?c(6,3,2,10):P.valueOr(`religionsNumber`,o.limit);let l=P.rolls(`sizeVariety`)?c(4,2,0,10,1):P.valueOr(`sizeVariety`,r.sizeVariety),u=P.rolls(`growthRate`)?x(1+Math.random(),1):P.valueOr(`growthRate`,r.growthRate);r.sizeVariety=n.sizeVariety=l,r.growthRate=n.growthRate=u,n.limit=P.rolls(`cultures`)?c(12,3,5,30):P.valueOr(`cultures`,n.limit),n.set=P.rolls(`culturesSet`)?this.randomCultureSet():P.valueOr(`culturesSet`,n.set),this.capCultures();let d=options.map,f=this.getDefaultOptions().map;f.seed=d.seed,f.style=d.style,f.burgs.groups=d.burgs.groups,f.labels.groups=d.labels.groups,f.military.units=d.military.units,f.transports=d.transports,f.customIcons=d.customIcons,f.coastline=d.coastline,f.relief=d.relief,f.graph={width:t.width,height:t.height,points:Oe(t.density)},f.cultures.set=n.set,options.map=f,this.repairSets();let{climate:p,units:m,lore:h}=f,{temperature:g}=p;g.equator=P.rolls(`temperatureEquator`)?c(25,7,20,35,0):P.valueOr(`temperatureEquator`,g.equator),g.northPole=P.rolls(`temperatureNorthPole`)?c(-25,7,-40,10,0):P.valueOr(`temperatureNorthPole`,g.northPole),g.southPole=P.rolls(`temperatureSouthPole`)?c(-15,7,-40,10,0):P.valueOr(`temperatureSouthPole`,g.southPole),p.precipitation=P.rolls(`prec`)?c(100,40,5,500):P.valueOr(`prec`,p.precipitation),m.distance.scale=P.rolls(`distanceScale`)?c(3,1,1,5):P.valueOr(`distanceScale`,m.distance.scale),h.calendar.year=P.rolls(`year`)?a(100,2e3):P.valueOr(`year`,h.calendar.year),P.rolls(`era`)?(h.calendar.era=We.getEra(),h.calendar.eraShort=We.getEraShort(h.calendar.era)):(h.calendar.era=P.valueOr(`era`,h.calendar.era),h.calendar.eraShort=P.valueOr(`eraShort`,h.calendar.eraShort)),h.name=P.rolls(`mapName`)?We.getMapName():P.valueOr(`mapName`,h.name),m.distance.unit=P.valueOr(`distanceUnit`,m.distance.unit),m.area.unit=P.valueOr(`areaUnit`,m.area.unit),m.height.unit=P.valueOr(`heightUnit`,m.height.unit),m.height.exponent=P.valueOr(`heightExponent`,m.height.exponent),m.temperature.unit=P.valueOr(`temperatureScale`,m.temperature.unit),m.population.scale=P.valueOr(`populationRate`,m.population.scale),m.population.urbanization.rate=P.valueOr(`urbanization`,m.population.urbanization.rate),m.population.urbanization.density=P.valueOr(`urbanDensity`,m.population.urbanization.density)}capCultures(){let{cultures:e}=options.generation,t=Ie[e.set]?.max;t&&e.limit>t&&(e.limit=t)}randomTemplate(){let e={};for(let[t,n]of Object.entries(Le))e[t]=n.probability||0;return f(e)}randomCultureSet(){return f(Object.fromEntries(Object.entries(Ie).map(([e,t])=>[e,t.probability])))}applyLoaded(e){let t=e?.geography?.coordinates;options.map=we(De,this.getDefaultOptions().map,e,`Options.applyLoaded`),De.shape.geography.shape.coordinates.safeParse(t).success||Re.calculate(),this.repairSets(),P.rolls(`mapWidth`)&&(options.generation.graph.width=options.map.graph.width),P.rolls(`mapHeight`)&&(options.generation.graph.height=options.map.graph.height)}repairSets(){let{map:e}=options,t=this.getDefaultOptions().map;e.burgs.groups.length||(e.burgs.groups=t.burgs.groups),e.labels.groups.length||(e.labels.groups=t.labels.groups),e.military.units.length||(e.military.units=t.military.units),e.transports.length||(e.transports=t.transports),R.ensureDefaultGroup(e.burgs.groups),Ue.restoreMissingTypes(e.labels.groups)}};globalThis.Options=St,globalThis.options=St.getDefaultOptions();var z={quality:{shapeRendering:`geometricPrecision`,stateHalos:!0,viewportRedraw:`continuous`},balance:{shapeRendering:`optimizeSpeed`,stateHalos:!1,viewportRedraw:`continuous`},speed:{shapeRendering:`optimizeSpeed`,stateHalos:!1,viewportRedraw:`settled`}};function Ct(e){let t=Object.keys(e);for(let[n,r]of Object.entries(z))if(t.every(t=>r[t]===e[t]))return n;return`custom`}var wt=new Set;function Tt(e){return wt.add(e),()=>wt.delete(e)}function Et(e){Object.hasOwn(z,e)&&Ot(t=>t.app.performance={...z[e]})}function Dt(e,t){Ot(n=>n.app.performance[e]=t)}function Ot(e){Options.set(e),kt();for(let e of wt)e()}function kt(){let{shapeRendering:e,stateHalos:n}=options.app.performance;t(`viewbox`)?.setAttribute(`shape-rendering`,e);let r=t(`statesHalo`);r&&(r.style.display=n?``:`none`,n&&pack.cells&&!r.childElementCount&&w.draw(`states`))}function At(e){if(e)options.map.seed=e;else{let e=!mapHistory.length,t=new URL(window.location.href).searchParams.get(`seed`);if(e&&t){let e=new URL(window.location.href).searchParams.get(`from`)===`MFCG`&&t.length===13;options.map.seed=e?t.slice(0,-4):t}else options.map.seed=d()}Math.random=aleaPRNG(options.map.seed)}function jt(){let e=u(`seedInput`).value;if(e===options.map.seed){j(`Текущая карта уже имеет этот seed`,!1,`error`);return}regeneratePrompt({seed:e})}function Mt(){I({title:`История seed`,message:`<ol style="margin: 0; padding-left: 1.5em">${mapHistory.map((e,t)=>{let n=new Date(e.created).toLocaleTimeString(),r=`<i data-tip="Кликните, чтобы создать карту с этим seed" onclick="restoreSeed(${t})" class="icon-history optionsSeedRestore"></i>`;return`<li>Seed: ${e.seed} ${r}. Size: ${e.width}x${e.height}. Template: ${e.template}. Created: ${n}</li>`}).join(``)}</ol>`})}function Nt(e){let{seed:t,width:n,height:r,template:i}=mapHistory[e];Options.set(e=>e.generation.template=i),P.has(`template`)&&P.clear(`template`),regeneratePrompt({seed:t,width:n,height:r})}window.restoreSeed=Nt,window.generateMapWithSeed=jt,window.showSeedHistoryDialog=Mt;var B={"africa-centric":{id:0,name:`Africa Centric`},arabia:{id:1,name:`Arabia`},atlantics:{id:2,name:`Atlantics`},britain:{id:3,name:`Britain`},caribbean:{id:4,name:`Caribbean`},"east-asia":{id:5,name:`East Asia`},eurasia:{id:6,name:`Eurasia`},europe:{id:7,name:`Europe`},"europe-accented":{id:8,name:`Europe Accented`},"europe-and-central-asia":{id:9,name:`Europe and Central Asia`},"europe-central":{id:10,name:`Europe Central`},"europe-north":{id:11,name:`Europe North`},greenland:{id:12,name:`Greenland`},hellenica:{id:13,name:`Hellenica`},iceland:{id:14,name:`Iceland`},"indian-ocean":{id:15,name:`Indian Ocean`},"mediterranean-sea":{id:16,name:`Mediterranean Sea`},"middle-east":{id:17,name:`Middle East`},"north-america":{id:18,name:`North America`},"us-centric":{id:19,name:`US-centric`},"us-mainland":{id:20,name:`US Mainland`},world:{id:21,name:`World`},"world-from-pacific":{id:22,name:`World from Pacific`}};window.precreatedHeightmaps=B;var Pt={political:[`borders`,`burgIcons`,`ice`,`labels`,`lakes`,`rivers`,`routes`,`scaleBar`,`states`,`vignette`],cultural:[`borders`,`burgIcons`,`cultures`,`labels`,`lakes`,`rivers`,`routes`,`scaleBar`,`vignette`],religions:[`borders`,`burgIcons`,`labels`,`lakes`,`religions`,`rivers`,`routes`,`scaleBar`,`vignette`],provinces:[`borders`,`burgIcons`,`labels`,`lakes`,`provinces`,`rivers`,`scaleBar`,`vignette`],biomes:[`biomes`,`ice`,`lakes`,`rivers`,`scaleBar`,`vignette`],heightmap:[`heightmap`,`lakes`,`rivers`,`vignette`],physical:[`coordinates`,`heightmap`,`ice`,`lakes`,`rivers`,`scaleBar`,`vignette`],poi:[`borders`,`burgIcons`,`heightmap`,`ice`,`lakes`,`markers`,`rivers`,`routes`,`scaleBar`,`vignette`],goods:[`borders`,`burgIcons`,`cells`,`goods`,`lakes`,`markets`,`rivers`,`routes`,`scaleBar`,`trade`,`vignette`],trade:[`borders`,`burgIcons`,`lakes`,`rivers`,`routes`,`scaleBar`,`states`,`trade`,`vignette`],military:[`borders`,`burgIcons`,`labels`,`lakes`,`military`,`rivers`,`routes`,`scaleBar`,`states`,`vignette`],emblems:[`borders`,`burgIcons`,`emblems`,`ice`,`lakes`,`rivers`,`routes`,`scaleBar`,`states`,`vignette`],landmass:[`scaleBar`]},V={...Pt};Ft();function Ft(){let e=JSON.parse(localStorage.getItem(`presets`)||`null`);if(e)for(let t in e)e[t].every(e=>w.has(e))&&(V[t]=e[t],Pt[t]||u(`layersPreset`).add(new Option(t,t)))}function It(){let e=localStorage.getItem(`preset`)||u(`layersPreset`).value,t=e in V?e:`political`;zt(t),w.restore({order:w.state.order,active:V[t]})}function Lt(e){let t=e.get(`layers`);if(t){let e=t.split(`,`).map(e=>e.trim()).filter(e=>w.has(e));e.length?w.set(e):ERROR&&console.error(`URL param layers="${t}" has no valid layer ids`);return}let n=e.get(`preset`),r=n&&Rt(n);r?(zt(r),w.set(V[r])):n&&ERROR&&console.error(`URL param preset="${n}" is invalid`)}function Rt(e){let t=e.toLowerCase().trim(),n=Object.keys(V).find(e=>e.toLowerCase()===t);if(n)return n;let r=Array.from(u(`layersPreset`).options).find(e=>e.text.toLowerCase()===t);return r?.value&&r.value in V?r.value:void 0}function zt(e){u(`layersPreset`).value=e,localStorage.setItem(`preset`,e),u(`removePresetButton`).style.display=Pt[e]?`none`:`inline-block`,u(`savePresetButton`).style.display=`none`}function Bt(e){e in V&&(zt(e),w.set(V[e]))}function Vt(){Ye({title:`Сохранить пресет слоёв`,message:`<label>Название пресета: <input id="layersPresetName" type="text" autocomplete="off" /></label>`,confirm:`Сохранить`,onConfirm:()=>{let e=u(`layersPresetName`).value.trim();e&&(V[e]=w.all.filter(e=>ge.has(e.id)&&w.isOn(e.id)).map(e=>e.id),u(`layersPreset`).add(new Option(e,e,!1,!0)),localStorage.setItem(`presets`,JSON.stringify(V)),localStorage.setItem(`preset`,e),u(`removePresetButton`).style.display=`inline-block`,u(`savePresetButton`).style.display=`none`)}}),u(`layersPresetName`).focus()}function Ht(){let e=u(`layersPreset`).value;delete V[e],u(`layersPreset`).options.remove(Array.from(u(`layersPreset`).options).findIndex(t=>t.value===e)),u(`layersPreset`).value=`custom`,u(`removePresetButton`).style.display=`none`,u(`savePresetButton`).style.display=`inline-block`,localStorage.setItem(`presets`,JSON.stringify(V)),localStorage.removeItem(`preset`)}function Ut(){let e=e=>[...e].sort().join(`,`),t=e(w.all.filter(e=>ge.has(e.id)&&w.isOn(e.id)).map(e=>e.id)),n=Object.keys(V).find(n=>e(V[n])===t);u(`layersPreset`).value=n??`custom`,u(`removePresetButton`).style.display=n&&!Pt[n]?`inline-block`:`none`,u(`savePresetButton`).style.display=n?`none`:`inline-block`}u(`layersPreset`).addEventListener(`change`,e=>{Bt(e.target.value)}),u(`savePresetButton`).addEventListener(`click`,Vt),u(`removePresetButton`).addEventListener(`click`,Ht),w.subscribe(Ut),window.applyLayersPreset=It,window.applyURLLayers=Lt;var H=(e,t,n)=>l(`#${e}`).transition().duration(n).style(`opacity`,String(t));function Wt(){H(`loading`,1,200),H(`optionsContainer`,0,100),H(`tooltip`,0,200)}function Gt(){H(`loading`,0,3e3),H(`optionsContainer`,1,2e3),H(`tooltip`,1,3e3)}var U,W=0,Kt=!1;window.addEventListener(`map:generated`,()=>{U=void 0,W++});async function qt(e,t,n=!1){if(Kt)return{type:`cancelled`};Kt=!0;try{return await Jt(e,t,n)}finally{Kt=!1}}async function Jt(e,t,n){if(typeof window.showSaveFilePicker!=`function`)return r(e(),t),{type:`downloaded-fallback`};let i=W,a=n?void 0:U;if(!a)try{a=await window.showSaveFilePicker({suggestedName:t,types:[{description:`Карта генератора фантастических карт`,accept:{"application/octet-stream":[`.map`]}}]})}catch(e){if(e?.name===`AbortError`)return{type:`cancelled`};throw e}if(i!==W)return{type:`cancelled`};let o;try{if(o=await a.createWritable(),i!==W)return await o.abort(),{type:`cancelled`};await o.write(e()),await o.close()}catch(e){throw U===a&&(U=void 0),await o?.abort().catch(()=>{}),e}return i===W&&(U=a),{type:`saved`,filename:a.name}}var Yt=()=>Qt(()=>en($t(),!0)),Xt=(e=!1)=>Qt(()=>tn(e)),Zt=()=>Qt(()=>rn($t(),`${p()}.map`));async function Qt(e){if(customization)return j(`Карту нельзя сохранить в режиме редактирования; завершите правку и повторите`,!1,`error`);F(`#alert`);try{await e()}catch(t){ERROR&&console.error(t);let n=t instanceof Error?t:Error(String(t));alertMessage.innerHTML=`An error occurred while saving the map. If the issue persists, please copy the message below and report it on ${g(`https://github.com/Azgaar/Fantasy-Map-Generator/issues`,`GitHub`)}. <p id="errorBox">${ee(n)}</p>`,$(`#alert`).dialog({resizable:!1,title:`Ошибка сохранения`,width:`28em`,buttons:{Повторить:function(){$(this).dialog(`close`),Qt(e)},Закрыть:function(){$(this).dialog(`close`)}},position:{my:`center`,at:`center`,of:`svg`}})}}function $t(){let e=new Date,t=[et,`File can be loaded in azgaar.github.io/Fantasy-Map-Generator`,`${e.getFullYear()}-${e.getMonth()+1}-${e.getDate()}`,options.map.seed,options.map.graph.width,options.map.graph.height,mapHistory.at(-1)?.created??Date.now()].join(`|`),n=JSON.stringify(options.map),r=JSON.stringify(pack.measurers??[]),i=JSON.stringify(pack.journeys??[]),a=JSON.stringify($e(u(`map`),Qe.list().map(e=>e.note))),o=JSON.stringify(w.state),s=JSON.stringify(Ze.state),c=u(`map`).cloneNode(!0);c.setAttribute(`width`,String(options.map.graph.width)),c.setAttribute(`height`,String(options.map.graph.height)),c.querySelector(`#viewbox`)?.removeAttribute(`transform`);let l=c.querySelector(`#terrain`);l&&(l.innerHTML=``);for(let e of Array.from(c.querySelectorAll(`#emblems > g`)))e.innerHTML=``;let d=c.querySelector(`#ruler`);d&&(d.innerHTML=``);let f=c.querySelector(`#tradeAnimation`);f&&(f.innerHTML=``),c.querySelector(`#journeyOverlay`)?.remove(),c.querySelector(`#journeyTravel`)?.remove();let p=new XMLSerializer().serializeToString(c),{spacing:m,cellsX:h,cellsY:g,boundary:_,points:v,features:y}=grid,b=JSON.stringify({spacing:m,cellsX:h,cellsY:g,boundary:_,points:v,features:y}),ee=JSON.stringify(pack.features),te=JSON.stringify(pack.biomes),ne=JSON.stringify(pack.cultures),S=JSON.stringify(pack.states),re=JSON.stringify(pack.burgs),C=JSON.stringify(pack.religions),ie=JSON.stringify(pack.provinces),T=JSON.stringify(pack.rivers),E=JSON.stringify(pack.relief||[]),D=JSON.stringify(pack.markers),O=JSON.stringify(pack.cells.routes),ae=JSON.stringify(pack.routes),oe=JSON.stringify(pack.zones),k=JSON.stringify(pack.ice),se=JSON.stringify(pack.goods),ce=JSON.stringify(pack.markets||[]),le=JSON.stringify(pack.deals||[]),A=JSON.stringify(pack.addedLabels||[]),j=JSON.stringify(styles),ue=Names.getNameBases(),de=Names.nameBases.map((e,t)=>{let n=ue[t]&&ue[t].b===e.b?``:e.b;return`${e.name}|${e.min}|${e.max}|${e.d}|${e.m}|${n}`}).join(`/`),M=Array.from(pack.cells.pop).map(e=>x(e,4));return[t,n,``,te,``,p,b,grid.cells.h,grid.cells.prec,grid.cells.f,grid.cells.t,grid.cells.temp,ee,ne,S,re,pack.cells.biome,pack.cells.burg,pack.cells.conf,pack.cells.culture,pack.cells.fl,M,pack.cells.r,[],pack.cells.s,pack.cells.state,pack.cells.religion,pack.cells.province,[],C,ie,de,T,``,a,D,O,ae,oe,k,pack.cells.good,se,ce,le,pack.cells.market,``,r,A,j,E,o,s,i].join(`\r
`)}async function en(e,t=!1){let n=new Blob([e],{type:`text/plain`});await ldb.set(`lastMap`,n),t&&j(`Карта сохранена в хранилище браузера`,!1,`success`)}async function tn(e){nn(await qt($t,`${p()}.map`,e))}function nn(e){if(e.type===`cancelled`)return;if(e.type===`saved`){j(`Map is saved to "${n(e.filename)}"`,!0,`success`,8e3);return}let t=se(`Map`);if(!A()){let e=`savePickerFallbackNoticeShown`;try{localStorage.getItem(e)||(t+=`. A save-location picker is unavailable here; your browser's download settings control the location.`,localStorage.setItem(e,`true`))}catch{}}j(t,!0,`success`,12e3)}async function rn(e,t){await G.Cloud.save(t,e),j(`Карта сохранена в вашем Dropbox`,!0,`success`,8e3)}var an={toStorage:Yt,toMachine:Xt,toDropbox:Zt,prepareMapData:$t,writeToStorage:en},on=6e4;function sn(){let e=Date.now();async function t(){let t=options.app.autosave.interval;if(t&&!((Date.now()-e)/on<t)){if(customization)return j(`Автосохранение: в режиме редактирования карту сохранить нельзя`,!1,`warn`,2e3);try{j(`Autosave: saving map...`,!1,`warn`,3e3),await G.Save.writeToStorage(await G.Save.prepareMapData()),j(`Автосохранение: карта сохранена`,!1,`success`,2e3),e=Date.now()}catch(e){ERROR&&console.error(e),j(`Autosave failed: ${e?.message||`Unknown error`}`,!0,`error`,4e3)}}}setInterval(t,on/2),un()}var cn,ln=!1;function un(){if(!options.app.autosave.remind)return;let e=[`Please don't forget to save the project to desktop from time to time`,`Please remember to save the map to your desktop`,`Saving will ensure your data won't be lost in case of issues`,`Safety is number one priority. Please save the map`,`Don't forget to save your map on a regular basis!`,`Just a gentle reminder for you to save the map`,`Please don't forget to save your progress (saving to desktop is the best option)`,`Don't want to get reminded about need to save? Press CTRL+Q`];cn=setInterval(()=>{customization||j(i(e),!0,`warn`,2500)},15*on),ln=!0}function dn(){ln?(j(`Напоминание о сохранении выключено. Нажмите CTRL+Q снова, чтобы включить`,!0,`warn`,2e3),clearInterval(cn),Options.set(e=>e.app.autosave.remind=!1),ln=!1):(j(`Напоминание о сохранении включено. Нажмите CTRL+Q, чтобы выключить`,!0,`warn`,2e3),Options.set(e=>e.app.autosave.remind=!0),un())}window.initiateAutosave=sn,window.toggleSaveReminder=dn;var G=me({AppOffer:()=>k(()=>import(`./app-offer-s8o8JC0s.js`).then(e=>e.AppOffer),__vite__mapDeps([0,1])),Cloud:()=>k(()=>import(`./cloud-DAEK7EDu.js`).then(e=>e.CloudStorage),__vite__mapDeps([2,3,4,1])),ExportJson:()=>k(()=>import(`./export-json-IboiHSCI.js`).then(e=>e.ExportJson),__vite__mapDeps([5,3,6,7,4,1,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22])),ExportMap:()=>k(()=>import(`./export-frdzRNy1.js`).then(e=>e.t).then(e=>e.ExportMap),__vite__mapDeps([23,14,3,24,25,26,27,11,12,4,1,13,15,28,7,29,30,31])),Load:()=>k(()=>import(`./load-De-eirP_.js`).then(e=>e.Load),__vite__mapDeps([32,12,3,24,14,25,26,27,11,4,1,13,15,28,7,29,30,6,33,34,35,36,22,37,38,39,40,18,19,20,21,41,16,31,8,9,10,17])),Save:he(an),UiTour:()=>k(()=>import(`./ui-tour-RtDjf5X8.js`).then(e=>e.UiTour),__vite__mapDeps([42,3,6,7,38,24,14,25,26,27,11,12,4,1,13,15,28,29,30,43]))});window.Services=G;function fn(){w.init(),window.addEventListener(`resize`,pn),window.addEventListener(`vite:preloadError`,gn),document.addEventListener(`touchstart`,hn,{capture:!0,passive:!0}),_n(),vn(),mn(),!le()&&!A()&&(window.onbeforeunload=()=>`Are you sure you want to navigate away?`),A()&&bn()}function pn(){Options.set(e=>{P.rolls(`mapWidth`)&&window.innerWidth>0&&(e.generation.graph.width=window.innerWidth),P.rolls(`mapHeight`)&&window.innerHeight>0&&(e.generation.graph.height=window.innerHeight)}),L()}function mn(){let e=t(`assistantBubble`);e&&(e.addEventListener(`click`,()=>N.Assistant.toggle()),e.addEventListener(`mouseover`,ue))}function hn(e){e.target?.closest?.(`.ui-dialog-titlebar button`)&&e.stopPropagation()}function gn(){if(!navigator.onLine){I({title:`Вы не в сети`,message:`Эта часть приложения не была скачана до потери связи. Переподключитесь и попробуйте снова`});return}Ye({title:`Вышла новая версия`,message:`Эта часть приложения не загрузилась, потому что страницу открыли до выхода новой версии.<br />Перезагрузите страницу, чтобы получить новую версию. Если есть несохранённые изменения, сначала сохраните карту`,confirm:`Перезагрузить`,cancel:`Не сейчас`,onConfirm:()=>{window.onbeforeunload=null,location.reload()}})}function _n(){let e=()=>u(`mapOverlay`);document.addEventListener(`dragover`,t=>{t.stopPropagation(),t.preventDefault(),e().style.display=null}),document.addEventListener(`dragleave`,()=>{e().style.display=`none`}),document.addEventListener(`drop`,t=>{t.stopPropagation(),t.preventDefault();let n=e();n.style.display=`none`;let r=t.dataTransfer?.items;if(r?.length!==1)return;let i=r[0].getAsFile();if(i){if(!i.name.endsWith(`.map`)&&!i.name.endsWith(`.gz`))return I({title:`Неверный формат файла`,message:`Загрузите файл карты (<i>.map</i> или <i>.gz</i>), который вы ранее скачали`});n.style.display=null,n.innerHTML=`Uploading<span>.</span><span>.</span><span>.</span>`,F(),G.Load.uploadMap(i,()=>{n.style.display=`none`,n.innerHTML=`Drop a map file to open`})}})}function vn(){let e=`fmg-tour-prompt-count`,n=Number.parseInt(localStorage.getItem(e)||`0`,10);if(n>=3)return;let r=t(`tourPromptButton`);r&&(r.style.display=`flex`,r.addEventListener(`click`,()=>{G.UiTour.start(),localStorage.setItem(e,`3`)}),localStorage.setItem(e,String(n+1)))}function yn(){return location.hostname?!1:(I({title:`Ошибка загрузки`,width:`28em`,message:`Fantasy Map Generator cannot run serverless. Follow the <a href="https://github.com/Azgaar/Fantasy-Map-Generator/wiki/Run-FMG-locally" target="_blank">instructions</a> on how you can easily run a local web-server`}),!0)}function bn(){t(`getAppButton`)?.remove(),t(`saveToDropboxButton`)?.remove(),t(`loadFromDropbox`)?.remove()}var xn=`fmg-help-token`,Sn=`fmg-help-signin-pending`,Cn=`#token=`,wn=()=>localStorage.getItem(xn),Tn=e=>localStorage.setItem(xn,e),En=()=>localStorage.removeItem(xn);function Dn(){if(!location.hash.startsWith(Cn))return;let e=sessionStorage.getItem(Sn)===`1`;sessionStorage.removeItem(Sn),e&&Tn(location.hash.slice(7)),history.replaceState(null,``,location.pathname+location.search)}function On(e){sessionStorage.setItem(Sn,`1`),location.assign(e)}async function kn(){Dn(),ce(),fn(),qe(),Options.restore(),await Options.restoreIcons(),rt(options.map.military.units),Z(),jr(),fe(options.map.graph.width,options.map.graph.height),nt(),yn()||(Gt(),await Rn()),sn()}async function An(e){try{let{seed:t,graph:n,width:r,height:i,points:a}=e||{};Options.setGraphSize(r,i),At(t),Options.randomize(),E.syncCustom(),n&&a!==void 0&&(options.map.graph.points=a),st(),await ze.run({graph:n}),Options.persist(),Z(),Pn(),it(),ve()}catch(e){ERROR&&console.error(e),de(),u(`alertMessage`).innerHTML=`An error has occurred on map generation. Please retry.
      <br />Если ошибка критична, очистите сохранённые данные и попробуйте снова.
      <p id="errorBox">${ee(e)}</p>`,$(`#alert`).dialog({resizable:!1,title:`Ошибка генерации`,width:`32em`,buttons:{"Cleanup data":()=>tt(),Пересоздать:function(){jn(`generation error`),$(this).dialog(`close`)},Пропустить:function(){$(this).dialog(`close`)}},position:{my:`center`,at:`center`,of:`svg`}})}}var jn=h(async e=>{let n=typeof e==`string`?e:`user request`;WARN&&console.warn(`Generate new random map: ${n}`);let r=Oe(options.generation.graph.density)>1e4;r&&Wt(),F(`#worldConfigurator, #options3d`),customization=0,be(1e3),Be(),await An(typeof e==`string`?void 0:e),w.drawAll(),Xe()&&N.View3d.redraw(),t(`worldConfigurator`)?.offsetParent&&N.WorldConfigurator.open(),L(),r&&Gt(),de()},250);function Mn(e){if(customization){j(`Новую карту нельзя создать в режиме редактирования; выйдите из режима и повторите`,!1,`error`);return}let t=mapHistory.at(-1);if((t?(Date.now()-t.registeredAt)/6e4:0)<1){jn(e);return}Ye({title:`Создать новую карту`,message:`Вы уверены, что хотите создать новую карту?<br />Все несохранённые изменения текущей карты будут потеряны`,confirm:`Создать`,onConfirm:()=>{F(),jn(e)}})}globalThis.mapHistory=[];var Nn=100;function Pn(e=Date.now()){mapHistory.push({seed:options.map.seed,width:options.map.graph.width,height:options.map.graph.height,template:options.generation.template,created:e,registeredAt:Date.now()}),mapHistory.length>Nn&&mapHistory.splice(0,mapHistory.length-Nn),window.dispatchEvent(new CustomEvent(`map:generated`,{detail:{seed:options.map.seed,mapId:e}}))}window.regeneratePrompt=Mn,window.regenerateMap=jn;function Fn(e){let t=t=>{let n=Number(e.get(t));return Number.isFinite(n)&&n>0?n:void 0};return{width:t(`width`),height:t(`height`)}}var In=/(ftp|http|https):\/\/(\w+:{0,1}\w*@)?(\S+)(:[0-9]+)?(\/|\/([\w#!:.?+=&%@!\-/]))?/,Ln=()=>new URL(window.location.href).searchParams;async function Rn(){let e=Ln(),t=Fn(e),n=e.get(`maplink`);if(n){if(WARN&&console.warn(`Load map from URL`),In.test(n)){setTimeout(()=>G.Load.loadMapFromURL(n,!0),1e3);return}G.Load.showUploadErrorMessage(`Map link is not a valid URL`,n)}if(e.get(`seed`)){WARN&&console.warn(`Generate map for seed`,e.get(`seed`)),await zn(t);return}if(options.app.onLoad===`lastSaved`)try{let e=await ldb.get(`lastMap`);if(e){WARN&&console.warn(`Loading last stored map`),G.Load.uploadMap(e);return}}catch(e){ERROR&&console.error(e)}WARN&&console.warn(`Generate random map`),zn(t)}async function zn(e){await Controllers.StylePresetsEditor.applyOnLoad(),await An(e),It(),w.drawAll(),L(),Bn(),at()}function Bn(){let e=Ln();if(Lt(e),e.get(`from`)===`MFCG`&&document.referrer){let t=e.get(`seed`)??``;if(t.length===13)e.set(`burg`,t.slice(-4));else{Vn(e);return}}let t=e.get(`scale`),n=e.get(`cell`),r=e.get(`burg`);if(!t&&!n&&!r)return;let i=+(t??0)||8;if(n){let[e,t]=pack.cells.p[+n];Ce(e,t,i,1600);return}if(r){let e=Number.isNaN(+r)?pack.burgs.find(e=>e.name===r):pack.burgs[+r];e&&Ce(e.x,e.y,i,1600);return}Ce(+(e.get(`x`)??0)||options.map.graph.width/2,+(e.get(`y`)??0)||options.map.graph.height/2,i,1600)}function Vn(e){let{cells:t}=pack,n=pack.burgs;if(n.length<2)return void(ERROR&&console.error(`Cannot select a burg for MFCG`));let r=+(e.get(`size`)??0),i=+(e.get(`coast`)??0),a=+(e.get(`port`)??0),o=+(e.get(`river`)??0),s=(e,r,i)=>r&&i?n.filter(e=>e.port&&t.r[e.cell]):!r&&e&&i?n.filter(e=>!e.port&&t.t[e.cell]===1&&t.r[e.cell]):!e&&!i?n.filter(e=>t.t[e.cell]!==1&&!t.r[e.cell]):!e&&i?n.filter(e=>t.t[e.cell]!==1&&t.r[e.cell]):e&&i?n.filter(e=>t.t[e.cell]===1&&t.r[e.cell]):[],c=s(i,a,o);c.length||(c=s(i,!a,!o)),c.length||(c=s(!i,0,!o)),c.length||(c=[n[1]]);let u=e=>Math.abs((e.population??0)-r),d=ie(c,(e,t)=>u(e)-u(t)),f=d===void 0?0:c[d].i;if(!f)return void(ERROR&&console.error(`Cannot select a burg for MFCG`));let p=n[f];for(let[e,t]of new URL(document.referrer).searchParams)e===`name`?p.name=t:e===`size`?p.population=+t:e===`seed`?p.MFCG=t:e===`shantytown`?p.shanty=+t:p[e]=+t;let m=e.get(`name`);m&&m!==`null`&&(p.name=m);let h=l(`#labels [data-label-type='burg'][data-id='${f}']`);h.empty()||h.text(p.name??``).classed(`drag`,!0).on(`mouseover`,function(){l(this).classed(`drag`,!1),h.on(`mouseover`,null)}),Ce(p.x,p.y,8,1600),j(`Here stands the glorious city of ${p.name}`,!0,`success`,15e3)}function Hn(){let e=!document.querySelectorAll(`i.icon-lock`).length,t=`?seed=${u(`seedInput`).value}&width=${options.map.graph.width}&height=${options.map.graph.height}${e?`&options=default`:``}`;navigator.clipboard.writeText(location.host+location.pathname+t).then(()=>j(`Ссылка на карту скопирована в буфер обмена`,!1,`success`,3e3)).catch(e=>j(`Could not copy URL: ${e}`,!1,`error`,5e3))}window.focusOn=Bn,window.generateMapOnLoad=zn,window.copyMapURL=Hn;var K=`performanceSettings`,Un=z.balance,Wn=[{key:`shapeRendering`,label:`Качество отрисовки фигур`,tip:`Подсказка shape-rendering для карты. «Чёткие края» отключают сглаживание. В браузерах на Chromium растеризация идёт на GPU и подсказка игнорируется, поэтому там разницы нет`,choices:[{value:`geometricPrecision`,label:`Геометрическая точность`},{value:`auto`,label:`Авто`},{value:`optimizeSpeed`,label:`Оптимизировать скорость`},{value:`crispEdges`,label:`Чёткие края`}]},{key:`stateHalos`,label:`Ореолы государств`,tip:`Размытое свечение по границам государств. Это SVG-фильтр размытия, он дорог на больших картах`,choices:[{value:`true`,label:`Показано`},{value:`false`,label:`Скрыто`}]},{key:`viewportRedraw`,label:`Перерисовывать при масштабировании`,tip:`Когда надписи, иконки и рельеф перерисовываются, а текст меняет размер при масштабировании или сдвиге. «После» делает это один раз за жест: на больших картах быстрее, но новый контент появляется сразу`,choices:[{value:`continuous`,label:`Во время масштабирования`},{value:`settled`,label:`После приближения`}]}],Gn={quality:`Quality`,balance:`Balance`,speed:`Speed`,custom:`Custom`};function Kn(){F(`#${K}, .stable`),qn();let e=Tt(Yn);$(`#${K}`).dialog({title:`Настройки производительности`,resizable:!1,position:{my:`right top`,at:`right-10 top+10`,of:`svg`},close:()=>{e(),Je(K)}})}function qn(){Je(K),u(`dialogs`).insertAdjacentHTML(`beforeend`,Zn());for(let{key:e}of Wn){let t=u(`${K}_${e}`);t.addEventListener(`change`,()=>Jn(e,t.value)),u(`${K}_${e}Reset`).addEventListener(`click`,()=>Jn(e,String(Un[e])))}}function Jn(e,t){e===`stateHalos`?Dt(e,t===`true`):Dt(e,t)}function Yn(){let e=options.app.performance;for(let{key:t}of Wn)u(`${K}_${t}`).value=String(e[t]);u(`${K}Preset`).textContent=Xn()}var Xn=()=>Gn[Ct(options.app.performance)];function Zn(){let e=options.app.performance,t=Wn.map(({key:t,label:n,tip:r,choices:i})=>{let a=String(e[t]);return`
      <tr data-tip="${r}">
        <td>${n}</td>
        <td><select id="${K}_${t}" style="width: 100%">${i.map(e=>`<option value="${e.value}" ${e.value===a?`selected`:``}>${e.label}</option>`).join(``)}</select></td>
        <td>
          <button id="${K}_${t}Reset" data-tip="Вернуть значение пресета «Баланс»"
            style="font-size: .85em; padding: 1px 5px; margin-left: .3em">↺</button>
        </td>
      </tr>`}).join(``);return`
    <div id="${K}" class="dialog" style="display: none">
      <p data-tip="Пресет на вкладке «Настройки», которому соответствуют эти параметры" style="margin: 0 0 .5em">
        Preset: <b id="${K}Preset">${Xn()}</b>
      </p>
      <table style="border-collapse: collapse; width: 100%">
        <tbody>${t}</tbody>
      </table>
    </div>`}var Qn={open:Kn},q={mapWidth:{read:e=>e.generation.graph.width,update:lr,pin:`mapWidth`,event:`change`},mapHeight:{read:e=>e.generation.graph.height,update:lr,pin:`mapHeight`,event:`change`},seed:{read:e=>e.map.seed,update:jt,event:`change`},points:J({read:e=>e.generation.graph.density,write:(e,t)=>e.generation.graph.density=t,parse:Number,pin:`points`,effect:ir}),template:J({read:e=>e.generation.template,write:(e,t)=>e.generation.template=t,parse:String,pin:`template`}),resolveDepressionsSteps:J({read:e=>e.generation.resolveDepressionsSteps,write:(e,t)=>e.generation.resolveDepressionsSteps=t,parse:Number,pin:`resolveDepressionsSteps`}),lakeElevationLimit:J({read:e=>e.generation.lakeElevationLimit,write:(e,t)=>e.generation.lakeElevationLimit=t,parse:Number,pin:`lakeElevationLimit`,effect:()=>customization===1&&N.HeightmapEditor.redrawDrainage()}),cultures:J({read:e=>e.generation.cultures.limit,write:(e,t)=>e.generation.cultures.limit=t,parse:Number,pin:`cultures`,effect:ar}),culturesSet:J({read:e=>e.generation.cultures.set,write:(e,t)=>{e.generation.cultures.set=t,Options.capCultures()},parse:String,pin:`culturesSet`,effect:ar}),statesNumber:J({read:e=>e.generation.states.limit,write:(e,t)=>e.generation.states.limit=t,parse:Number,pin:`statesNumber`}),provincesRatio:J({read:e=>e.generation.provinces.ratio,write:(e,t)=>e.generation.provinces.ratio=t,parse:Number,pin:`provincesRatio`}),religionsNumber:J({read:e=>e.generation.religions.limit,write:(e,t)=>e.generation.religions.limit=t,parse:Number,pin:`religionsNumber`}),manors:J({read:e=>e.generation.burgs.limit,write:(e,t)=>e.generation.burgs.limit=t,parse:Number,pin:`manors`,effect:rr}),sizeVariety:J({read:e=>e.generation.states.sizeVariety,write:(e,t)=>e.generation.states.sizeVariety=e.generation.cultures.sizeVariety=t,parse:Number,pin:`sizeVariety`}),growthRate:J({read:e=>e.generation.states.growthRate,write:(e,t)=>e.generation.states.growthRate=e.generation.cultures.growthRate=t,parse:Number,pin:`growthRate`}),uiSize:J({read:e=>e.app.ui.size,write:(e,t)=>e.app.ui.size=t,parse:Number,effect:mr}),tooltipSize:J({read:e=>e.app.ui.tooltipSize,write:(e,t)=>e.app.ui.tooltipSize=t,parse:Number,effect:gr}),azgaarAssistant:J({read:e=>e.app.ui.assistant,write:(e,t)=>e.app.ui.assistant=t,parse:e=>e===`hide`?`скрыть`:`show`,effect:e=>at(e===`show`)}),speakerVoice:J({read:e=>e.app.ui.speakerVoice||null,write:(e,t)=>e.app.ui.speakerVoice=t,parse:String}),emblemShape:J({read:e=>e.app.emblems.shape,write:(e,t)=>e.app.emblems.shape=t,parse:String,effect:pr}),performancePreset:{read:e=>Ct(e.app.performance),update:Et},onloadBehavior:J({read:e=>e.app.onLoad,write:(e,t)=>e.app.onLoad=t,parse:e=>e===`lastSaved`?`lastSaved`:`random`}),autosaveInterval:J({read:e=>e.app.autosave.interval,write:(e,t)=>e.app.autosave.interval=t,parse:Number}),viewportWidth:{read:()=>M.width,update:xr,event:`change`},viewportHeight:{read:()=>M.height,update:xr,event:`change`},zoomExtentMin:{read:e=>e.app.zoomExtent.min,update:br,event:`change`},zoomExtentMax:{read:e=>e.app.zoomExtent.max,update:br,event:`change`},themeHue:{read:e=>y(e.app.ui.themeColor).h,update:vr},themeColor:{read:e=>e.app.ui.themeColor,update:e=>Q(e,options.app.ui.transparency)},transparency:{read:e=>e.app.ui.transparency,update:e=>Q(options.app.ui.themeColor,+e)}};function J(e){let{read:t,write:n,parse:r,pin:i,effect:a}=e;return{read:t,pin:i,update(e){let t=r(e);Options.set(e=>n(e,t)),i&&P.set(i,t),a?.(t)}}}var $n=`
  <p data-tip="Настройки следующей карты. Применятся после генерации новой">
    Map settings (apply to new maps):
  </p>
  <table>
    <tr
      data-tip="Координатная область, на которой создаётся следующая карта. Она фиксируется на всё время жизни карты и не меняется позже — размер окна просмотра ниже это то, через что вы на неё смотрите. Для карты-глобуса используйте пропорции 2:1"
    >
      <td>
        <i data-tip="Стандартный размер карты: размер окна" id="restoreDefaultMapSize" class="icon-ccw"></i>
      </td>
      <td>Размер карты</td>
      <td>
        <input id="mapWidthInput" data-option="mapWidth" class="paired" type="number" min="240" value="960" />
        <span>x</span>
        <input id="mapHeightInput" data-option="mapHeight" class="paired" type="number" min="135" value="540" />
        <span>px</span>
      </td>
      <td></td>
    </tr>
    <tr
      data-tip="Число seed карты. Нажмите Enter, чтобы применить. Seed повторяет карту только при том же размере и настройках"
    >
      <td>
        <i
          data-tip="Показать историю seed, чтобы применить прежний seed"
          id="optionsMapHistory"
          class="icon-hourglass-1"
        ></i>
      </td>
      <td>Seed карты</td>
      <td>
        <input id="seedInput" data-option="seed" class="long" type="number" min="1" max="999999999" step="1" />
      </td>
      <td>
        <i
          data-tip="Скопировать seed карты ссылкой. Та же карта получится только при тех же или стандартных настройках"
          id="optionsCopySeed"
          class="icon-docs"
        ></i>
      </td>
    </tr>
    <tr
      data-tip="Число точек для графика. Сильно влияет на производительность. Рекомендуемое значение — только 10K"
    >
      <td>
        <i data-locked="0" id="lock_points" class="icon-lock-open"></i>
      </td>
      <td>Число точек</td>
      <td>
        <input
          id="pointsInput"
          data-option="points"
          type="range"
          min="1"
          max="13"
          value="4"
          data-cells="10000"
        />
      </td>
      <td>
        <output id="pointsOutputFormatted" data-option-output="points" style="color: #053305">10K</output>
      </td>
    </tr>
    <tr data-tip="Шаблон или готовая карта высот, используемые при генерации">
      <td>
        <i data-locked="0" id="lock_template" class="icon-lock-open"></i>
      </td>
      <td>Карта высот</td>
      <td id="templateInputContainer" class="pointer">
        <select id="templateInput" data-option="template" style="pointer-events: none"></select>
      </td>
      <td></td>
    </tr>
    <tr data-tip="Сколько культур генерировать">
      <td>
        <i data-locked="0" id="lock_cultures" class="icon-lock-open"></i>
      </td>
      <td>Число культур</td>
      <td>
        <input id="culturesInput" data-option="cultures" type="range" min="1" />
      </td>
      <td>
        <input id="culturesOutput" data-option="cultures" type="number" min="1" />
      </td>
    </tr>
    <tr data-tip="Выберите набор культур для генерации названий и культур">
      <td>
        <i data-locked="0" id="lock_culturesSet" class="icon-lock-open"></i>
      </td>
      <td>Набор культур</td>
      <td>
        <select id="culturesSet" data-option="culturesSet">
          <option value="world" data-max="32" selected>Весь мир</option>
          <option value="european" data-max="15">Европейский</option>
          <option value="oriental" data-max="13">Восточный</option>
          <option value="english" data-max="10">Английский</option>
          <option value="antique" data-max="10">Античная</option>
          <option value="highFantasy" data-max="17">Высокое фэнтези</option>
          <option value="darkFantasy" data-max="18">Тёмное фэнтези</option>
          <option value="random" data-max="100">Случайно</option>
        </select>
      </td>
      <td></td>
    </tr>
    <tr data-tip="Сколько государств и столиц генерировать">
      <td>
        <i data-locked="0" id="lock_statesNumber" class="icon-lock-open"></i>
      </td>
      <td>Число государств</td>
      <td colspan="2">
        <slider-input id="statesNumber" data-option="statesNumber" min="0" max="100"></slider-input>
      </td>
    </tr>
    <tr
      data-tip="Какая доля подходящих городов в государстве станет центрами провинций. Больше значение — больше провинций"
    >
      <td>
        <i data-locked="0" id="lock_provincesRatio" class="icon-lock-open"></i>
      </td>
      <td>Доля провинций</td>
      <td colspan="2">
        <slider-input id="provincesRatio" data-option="provincesRatio" min="0" max="100"></slider-input>
      </td>
    </tr>
    <tr data-tip="Насколько государства и культуры могут различаться по размеру. Задаёт значение экспансионизма">
      <td>
        <i data-locked="0" id="lock_sizeVariety" class="icon-lock-open"></i>
      </td>
      <td>Разнообразие размеров</td>
      <td colspan="2">
        <slider-input id="sizeVariety" data-option="sizeVariety" min="0" max="10" step=".1"></slider-input>
      </td>
    </tr>
    <tr data-tip="Темп роста государств и культур. Определяет, сколько земли останется нейтральной">
      <td>
        <i data-locked="0" id="lock_growthRate" class="icon-lock-open"></i>
      </td>
      <td>Темп роста</td>
      <td colspan="2">
        <slider-input id="growthRate" data-option="growthRate" min=".1" max="2" step=".1"></slider-input>
      </td>
    </tr>
    <tr data-tip="Число размещаемых поселений, не являющихся столицами (если подходит земля)">
      <td>
        <i data-locked="0" id="lock_manors" class="icon-lock-open"></i>
      </td>
      <td>Число городов</td>
      <td>
        <input id="manorsInput" data-option="manors" type="range" min="0" max="1000" step="1" value="1000" />
      </td>
      <td>
        <output id="manorsOutput" data-option-output="manors" value="auto"></output>
      </td>
    </tr>
    <tr
      data-tip="Сколько генерировать организованных религий и культов. Народные верования культур появятся в любом случае"
    >
      <td>
        <i data-locked="0" id="lock_religionsNumber" class="icon-lock-open"></i>
      </td>
      <td>Число религий</td>
      <td colspan="2">
        <slider-input
          id="religionsNumber"
          data-option="religionsNumber"
          min="0"
          max="50"
          step="1"
        ></slider-input>
      </td>
    </tr>
  </table>
  <p data-tip="Настройки интерфейса в этом браузере. Изменения применяются сразу">
    Настройки интерфейса:
  </p>
  <table>
    <tr
      data-tip="Размер интерфейса. Зум браузера тоже влияет на него (Ctrl + или Ctrl -)"
    >
      <td></td>
      <td>Размер интерфейса</td>
      <td colspan="2">
        <slider-input id="uiSize" data-option="uiSize" min=".6" max="3" step=".1"></slider-input>
      </td>
    </tr>
    <tr data-tip="Размер подсказок">
      <td></td>
      <td>Размер подсказок</td>
      <td colspan="2">
        <slider-input id="tooltipSize" data-option="tooltipSize" min="1" max="32" value="14"></slider-input>
      </td>
    </tr>
    <tr data-tip="Тон темы окон диалогов и инструментов">
      <td>
        <i data-tip="Вернуть зелёную тему MIR" id="themeColorRestore" class="icon-ccw"></i>
      </td>
      <td>Цвет темы</td>
      <td>
        <input id="themeHueInput" data-option="themeHue" type="range" min="0" max="359" />
      </td>
      <td>
        <input id="themeColorInput" data-option="themeColor" type="color" />
      </td>
    </tr>
    <tr data-tip="Прозрачность окон диалогов и инструментов">
      <td></td>
      <td>Прозрачность</td>
      <td colspan="2">
        <slider-input id="transparencyInput" data-option="transparency" min="0" max="100"></slider-input>
      </td>
    </tr>
    <tr data-tip="Интервал автосохранения в минутах. 0 — выключить. Карта сохраняется в память браузера">
      <td></td>
      <td>Интервал автосохранения</td>
      <td>
        <input
          id="autosaveIntervalInput"
          data-option="autosaveInterval"
          type="range"
          min="0"
          max="60"
          step="1"
          value="15"
        />
      </td>
      <td>
        <input
          id="autosaveIntervalOutput"
          data-option="autosaveInterval"
          type="number"
          min="0"
          max="60"
          step="1"
          value="15"
        />
      </td>
    </tr>
    <tr data-tip="Действие генератора при загрузке">
      <td></td>
      <td>При загрузке</td>
      <td>
        <select id="onloadBehavior" data-option="onloadBehavior">
          <option value="random" selected>Создать случайную карту</option>
          <option value="lastSaved">Открыть последнюю сохранённую карту</option>
        </select>
      </td>
      <td></td>
    </tr>
    <tr data-tip="Пресет отрисовки: качество в обмен на скорость. Выберите «Скорость», если карта тормозит">
      <td></td>
      <td>Производительность</td>
      <td>
        <select id="performancePreset" data-option="performancePreset">
          <option value="quality">Качество</option>
          <option value="balance" selected>Баланс</option>
          <option value="speed">Скорость</option>
          <option value="custom" disabled hidden>Свой</option>
        </select>
      </td>
      <td>
        <i data-tip="Открыть настройки производительности" id="openPerformanceSettings" class="icon-cog"></i>
      </td>
    </tr>
    <tr data-tip="Переключить ассистента Azgaar (пузырь помощи внизу справа)">
      <td></td>
      <td>Ассистент Azgaar</td>
      <td>
        <select id="azgaarAssistant" data-option="azgaarAssistant">
          <option value="show" selected>Показать</option>
          <option value="hide">Скрыть</option>
        </select>
      </td>
    </tr>
    <tr data-tip="Выберите голос для произнесения названий">
      <td></td>
      <td>Голос</td>
      <td>
        <select id="speakerVoice" data-option="speakerVoice"></select>
      </td>
      <td>
        <span id="speakerTest" data-tip="Кликните, чтобы проверить голос" style="cursor: pointer">🔊</span>
      </td>
    </tr>
    <tr data-tip="Выберите форму эмблемы. Меняется и отдельно в редакторе эмблем">
      <td></td>
      <!-- no lock: the shape is an interface preference, kept by this browser whatever map is on screen -->
      <td>Форма эмблемы</td>
      <td>
        <select id="emblemShape" data-option="emblemShape">
          <optgroup label="Разнообразная">
            <option value="culture" selected>По культурам</option>
            <option value="random">Случайно по культурам</option>
            <option value="state">Для конкретного государства</option>
          </optgroup>
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
      </td>
      <td>
        <svg class="emblemShapePreview" viewBox="0 0 200 210"><path id="emblemShapeImage" /></svg>
      </td>
    </tr>
    <tr
      data-tip="Размер окна карты на экране. От размера карты не зависит: это то, сколько карты видно сразу. Заданный вручную запоминается, пока вы не подгоните его под окно"
    >
      <td>
        <i data-tip="Подогнать окно просмотра под размер окна браузера" id="viewportFit" class="icon-ccw"></i>
      </td>
      <td>Размер окна</td>
      <td>
        <input id="viewportWidth" data-option="viewportWidth" class="paired" type="number" min="100" />
        <span>x</span>
        <input id="viewportHeight" data-option="viewportHeight" class="paired" type="number" min="100" />
        <span>px</span>
      </td>
      <td></td>
    </tr>
    <tr data-tip="Минимальный и максимальный уровень масштаба">
      <td>
        <i data-tip="Вернуть стандартные пределы масштаба" id="zoomExtentDefault" class="icon-ccw"></i>
      </td>
      <td>Пределы масштаба</td>
      <td>
        <span data-tip="Минимальный уровень масштаба (больше 0)">min</span>
        <input
          data-tip="Минимальный уровень масштаба (больше 0)"
          id="zoomExtentMin" data-option="zoomExtentMin"
          class="paired"
          type="number"
          min=".01"
          step=".01"
          max="20"
          value="0.1"
        />
        <span data-tip="Максимальный уровень масштаба (больше 1)">max</span>
        <input
          data-tip="Максимальный уровень масштаба (больше 1)"
          id="zoomExtentMax" data-option="zoomExtentMax"
          class="paired"
          type="number"
          min="1"
          max="200"
          step="1"
          value="150"
        />
      </td>
      <td>
        <i
          data-tip="Разрешить тянуть карту за границы холста"
          id="translateExtent"
          data-on="0"
          class="icon-hand-paper-o"
        ></i>
      </td>
    </tr>
    <tr
      data-tip="Загрузите Google Переводчик и выберите язык. Автоматический перевод может сломать часть функций страницы. Если это случилось, верните английский или обновите страницу"
    >
      <td>
        <i data-tip="Сбросить язык до английского" id="resetLanguage" class="icon-ccw"></i>
      </td>
      <td>Язык</td>
      <td>
        <button id="loadGoogleTranslateButton">Загрузить Google Переводчик</button>
        <div id="google_translate_element"></div>
      </td>
      <td></td>
    </tr>
  </table>
  <div>
    <button
      id="configureWorld"
      data-tip="Откройте настройку мира, чтобы задать положение карты на глобусе и климат"
      onclick="window.Controllers.WorldConfigurator.open()"
    >
      Настройка мира
    </button>
    <button
      id="setupLore"
      data-tip="Кликните, чтобы назвать карту, задать дату календаря и описать мир"
      onclick="window.Controllers.LoreEditor.open()"
    >
      Записать историю
    </button>
    <button
      id="optionsReset"
      data-tip="Кликните, чтобы вернуть настройки по умолчанию и перезагрузить страницу"
      onclick="cleanupData()"
    >
      Сбросить настройки
    </button>
  </div>
`,er=new WeakMap;u(`optionsContent`).innerHTML=$n,tr(),Er(),Tt(()=>nr(`performancePreset`));function tr(){let e=u(`optionsContent`),t=u(`options`);t.addEventListener(`input`,cr),t.addEventListener(`change`,cr),e.addEventListener(`click`,e=>{let t=e.target;t.id===`restoreDefaultMapSize`?ur():t.id===`optionsMapHistory`?Mt():t.id===`optionsCopySeed`?Hn():t.id===`templateInputContainer`?N.HeightmapSelection.open():t.id===`viewportFit`?Sr():t.id===`zoomExtentDefault`?Cr():t.id===`translateExtent`?Tr(t):t.id===`openPerformanceSettings`?Qn.open():t.id===`speakerTest`?Dr():t.id===`themeColorRestore`?_r():t.id===`loadGoogleTranslateButton`?Or():t.id===`resetLanguage`&&kr()})}function Y(e){return u(`options`).querySelectorAll(`[data-option="${e}"]`)}function X(e){let t=Y(e)[0];if(!t)throw Error(`Missing option control: ${e}`);return t}function nr(e,t){let n=q[e].read(options);if(n!==null)for(let r of Y(e))r!==t&&(r.value=String(n),er.delete(r))}function Z(){let e=Y(`template`)[0],t=options.generation.template;e&&t&&o(e,t,Le[t]?.name||B[t]?.name||t);for(let e of Object.keys(q))nr(e);rr(),ir(),ar(),or()}function rr(){let e=u(`options`).querySelector(`[data-option-output="manors"]`);e&&(e.value=pt()?`auto`:String(options.generation.burgs.limit))}function ir(){let{density:e}=options.generation.graph,t=Oe(e),n=Y(`points`)[0];n&&(n.value=String(e),n.dataset.cells=String(t));let r=u(`options`).querySelector(`[data-option-output="points"]`);r&&(r.value=`${t/1e3}K`,r.style.color=fr(t))}function ar(){let e=String(Ie[options.generation.cultures.set]?.max??0);for(let t of Y(`cultures`))t.max=e,t.value=String(options.generation.cultures.limit)}function or(){let e=u(`options`).querySelector(`[data-option="pngResolution"]`);e&&(e.value=String(options.app.export.pngResolution))}function sr(e){return Object.values(q).find(t=>t.pin===e)?.read(options)??void 0}function cr(e){let t=e.target,n=t.dataset.option;if(!n||!Object.hasOwn(q,n))return;let r=q[n];r.event===`change`&&e.type!==`change`||((e.type!==`change`||er.get(t)!==t.value)&&(r.update(t.value),nr(n,t)),e.type===`input`?er.set(t,t.value):(er.delete(t),Options.persist()))}function lr(){let e=e=>{let t=X(e),n=Math.max(+t.value||0,+t.min||1);return t.value=String(n),n},t=e(`mapWidth`),n=e(`mapHeight`);Options.set(e=>{e.generation.graph.width=t,e.generation.graph.height=n}),P.set(`mapWidth`,t),P.set(`mapHeight`,n),(options.generation.graph.width>window.innerWidth||options.generation.graph.height>window.innerHeight)&&j(`Map size is larger than the window (${`${window.innerWidth} x ${window.innerHeight}`}). It can affect performance`,!1,`warn`,4e3)}function ur(){Options.set(e=>{e.generation.graph.width=window.innerWidth,e.generation.graph.height=window.innerHeight}),P.clear(`mapWidth`),P.clear(`mapHeight`),Z()}function dr(e){Options.set(t=>t.generation.graph.density=e),ir()}var fr=e=>e>5e4?`#b12117`:e===1e4?`#053305`:`#dfdf12`;function pr(e){O.setShape(e);let t=u(`emblemShapeImage`),{shieldPaths:n}=C,r=n[e];r?t.setAttribute(`d`,r):t.removeAttribute(`d`);let i=[`culture`,`state`,`random`].includes(e)?null:e;if(e===`random`)for(let e of pack.cultures)e.removed||(e.shield=Fe.getRandomShield());for(let e of pack.states){if(!e.i||e.removed||!e.coa||`icon`in e.coa)continue;let t=i||O.getShield(e.culture??0);t!==e.coa.shield&&(e.coa.shield=t,C.trigger(`stateCOA${e.i}`,e.coa))}for(let e of pack.provinces){if(!e.i||e.removed||!e.coa||`icon`in e.coa)continue;let t=i||O.getShield(pack.cells.culture[e.center]??0,e.state);t!==e.coa.shield&&(e.coa.shield=t,C.trigger(`provinceCOA${e.i}`,e.coa))}for(let e of pack.burgs){if(!e.i||e.removed||!e.coa||`icon`in e.coa)continue;let t=i||O.getShield(e.culture??0,e.state);t!==e.coa.shield&&(e.coa.shield=t,C.trigger(`burgCOA${e.i}`,e.coa))}}function mr(e){if(Number.isNaN(e)||e<.5)return;let t=Math.min(e,hr());X(`uiSize`).value=String(t),document.body.style.fontSize=`${x(t*10,2)}px`,u(`options`).style.width=`${t*300}px`}var hr=()=>x(Math.min(window.innerHeight/465,window.innerWidth/302),1);function gr(e){u(`tooltip`).style.fontSize=`calc(${e}px + 0.5vw)`}function Q(e,t){Options.set(n=>{n.app.ui.themeColor=e,n.app.ui.transparency=t}),yr(e,t)}function _r(){Q(vt,options.app.ui.transparency)}function vr(e){let{s:t,l:n}=y(options.app.ui.themeColor);Q(y(+e,t,n).hex(),options.app.ui.transparency)}function yr(e,t){X(`transparency`).value=String(t);let n=(100-t)/100,r=Math.min(n+.3,1),{h:i,s:a,l:o}=y(e);X(`themeColor`).value=e,X(`themeHue`).value=String(i);let s=[[`--bg-opacity`,String(n)],[`--bg-main`,y(i,a,o,n).toString()],[`--bg-lighter`,y(i,a,o+.02,n).toString()],[`--bg-light`,y(i,a-.02,o+.06,n).toString()],[`--light-solid`,y(i,a+.01,o+.05,1).toString()],[`--dark-solid`,y(i,a,o-.2,1).toString()],[`--header`,y(i,a,o-.03,r).toString()],[`--header-active`,y(i,a,o-.09,r).toString()],[`--bg-disabled`,y(i,a-.04,o+.09).toString()],[`--bg-dialogs`,y(0,0,.98,n).toString()]];for(let[e,t]of s)document.documentElement.style.setProperty(e,t)}function br(e){let t=X(`zoomExtentMin`),n=X(`zoomExtentMax`);+t.value>+n.value&&([t.value,n.value]=[n.value,t.value]),wr(Math.max(+t.value,.01),Math.min(+n.value,200)),Se(v(+e,.01,200))}function xr(){let e=+X(`viewportWidth`).value,t=+X(`viewportHeight`).value;!(e>0)||!(t>0)||(ut(e,t),Options.set(e=>e.app.viewport={width:M.width,height:M.height}))}function Sr(){Options.set(e=>e.app.viewport=null),L()}function Cr(){Options.set(e=>e.app.zoomExtent.max=Options.getDefaultOptions().app.zoomExtent.max),X(`zoomExtentMax`).value=String(options.app.zoomExtent.max),lt(),Se(options.app.zoomExtent.min)}function wr(e,t){Options.set(n=>n.app.zoomExtent={min:e,max:t}),X(`zoomExtentMin`).value=String(e),X(`zoomExtentMax`).value=String(t),ye(e,t),xe()}function Tr(e){let t=!+(e.dataset.on??0);e.dataset.on=String(+t);let{width:n,height:r}=options.map.graph;t?_e(-n/2,-r/2,n*1.5,r*1.5):_e(0,0,n,r)}function Er(){let e=0,t=X(`speakerVoice`),n=setInterval(()=>{let r=speechSynthesis.getVoices();if(!r.length){if(++e<10)return;clearInterval(n),t.options.length||t.options.add(new Option(`No voices available`,``));return}clearInterval(n);for(let[e,n]of r.entries())t.options.add(new Option(n.name,String(e)));t.value=options.app.ui.speakerVoice||String(r.findIndex(e=>e.lang===`en-US`))},1e3)}function Dr(){let e=new SpeechSynthesisUtterance(`The quick brown fox jumps over the lazy dog`),t=speechSynthesis.getVoices();t.length&&(e.voice=t[Number(options.app.ui.speakerVoice)]??e.voice),speechSynthesis.speak(e)}function Or(){let e=document.createElement(`script`);e.src=`https://translate.google.com/translate_a/element.js?cb=initGoogleTranslate`,e.onload=()=>{t(`loadGoogleTranslateButton`)?.remove();for(let e of u(`mapLayers`).querySelectorAll(`li`))e.innerHTML=e.innerHTML.replace(/<u>(.+)<\/u>/g,`$1`)},document.head.append(e)}function kr(){let e=document.querySelector(`#google_translate_element select`);if(e?.value)for(let t=0;t<2;t++)e.value=`en`,e.handleChange(new Event(`change`))}var Ar=()=>v(x(window.innerWidth/1280,1),1,hr());function jr(){let e=options.generation.template;if(e){let t=Le[e]?.name||B[e]?.name||e;o(X(`template`),e,t)}P.bindIcons(u(`options`),sr);let{ui:t,emblems:n}=options.app;O.setShape(n.shape),gr(t.tooltipSize),X(`uiSize`).max=String(hr()),mr(t.size??Ar()),yr(t.themeColor,t.transparency),kt(),lt()}window.changeCellsDensity=dr,window.initGoogleTranslate=()=>{new google.translate.TranslateElement({pageLanguage:`en`,layout:google.translate.TranslateElement.InlineLayout.VERTICAL},`google_translate_element`)};export{ot as C,L as S,kt as _,kn as a,R as b,En as c,G as d,dn as f,Mt as g,B as h,Hn as i,wn as l,Vt as m,dr as n,Mn as o,Bt as p,Z as r,Pn as s,fr as t,On as u,St as v,it as w,st as x,mt as y};