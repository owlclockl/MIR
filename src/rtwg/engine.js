// GPL-3.0-or-later. RTWG ping-pong texture scheduler and WebAssembly tectonics.
import wasmUrl from './rtplatec.wasm?url';
import normalsUrl from '../../vendor/rtwg/res/grass_normals.png?url';
import { FIELDS, defaultParameters, validateParameters, PARAMETERS } from './config.js';
import { validateSnapshot } from './snapshot.js';
import { createTectonics } from './tectonics.js';
import { FULLSCREEN_VERTEX, SIMULATION_SHADERS, DISPLAY_SHADER, FLOW_SHADER, MESH_VERTEX, LAND_SHADER, WATER_SHADER, DEPTH_SHADER } from './shaders.js';
import { multiply, lookAt, perspective, ortho, BIAS } from './matrix.js';

export async function createRtwgEngine(canvas, { seed = 'SAGES-RTWG', width = 256, height = 128, parameters = defaultParameters() } = {}) {
  parameters = validateParameters(parameters);
  if (![64,128,256,512].includes(width) || height !== width / 2) throw Error('RTWG: разрешение должно быть 64–512 × половина ширины');
  const gl = canvas.getContext('webgl2', { alpha: false, antialias: true, preserveDrawingBuffer: true });
  if (!gl || !gl.getExtension('EXT_color_buffer_float')) throw Error('Для RTWG нужны WebGL2 и EXT_color_buffer_float. Текущая карта доступна без них.');
  const linear = Boolean(gl.getExtension('OES_texture_float_linear'));
  const textures = [], framebuffers = [], programs = [], buffers = [], vaos = [];
  let tectonics, disposed = false;
  const cleanup = () => { if (disposed) return; disposed = true; tectonics?.dispose(); for (const t of textures) gl.deleteTexture(t); for (const f of framebuffers) gl.deleteFramebuffer(f); for (const p of programs) gl.deleteProgram(p); for (const b of buffers) gl.deleteBuffer(b); for (const v of vaos) gl.deleteVertexArray(v); gl.getExtension('WEBGL_lose_context')?.loseContext(); };
  const compile = (vertex, fragment) => {
    const p = gl.createProgram(), shaders = [];
    try {
      for (const [type, text] of [[gl.VERTEX_SHADER, vertex], [gl.FRAGMENT_SHADER, fragment]]) {
        const s = gl.createShader(type); shaders.push(s); gl.shaderSource(s, text); gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw Error(`RTWG shader: ${gl.getShaderInfoLog(s)}`);
        gl.attachShader(p, s);
      }
      gl.linkProgram(p); if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw Error(`RTWG link: ${gl.getProgramInfoLog(p)}`);
      programs.push(p);
      const uniforms = new Map(); for (let i = 0; i < gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS); i++) { const u = gl.getActiveUniform(p, i); uniforms.set(u.name, gl.getUniformLocation(p, u.name)); }
      return { p, uniforms };
    } catch (e) { gl.deleteProgram(p); throw e; } finally { for (const s of shaders) gl.deleteShader(s); }
  };
  const texture = (w = width, h = height, data = null) => {
    const t = gl.createTexture(); textures.push(t); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, linear ? gl.LINEAR : gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, linear ? gl.LINEAR : gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, w, h, 0, gl.RGBA, gl.FLOAT, data || new Float32Array(w*h*4));
    return t;
  };
  const target = () => {
    const t = texture(), f = gl.createFramebuffer(); framebuffers.push(f); gl.bindFramebuffer(gl.FRAMEBUFFER, f); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw Error('RTWG: float framebuffer недоступен');
    return { t, f };
  };
  const binding = (unit, t) => { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t); };
  const uniform = (p, name, value, type = 'float') => { const u = p.uniforms.get(name); if (u == null) return; if (type === 'int') gl.uniform1i(u,value); else if (type === 'uint') gl.uniform1ui(u,value); else if (type === 'mat4') gl.uniformMatrix4fv(u,false,value); else if (type === 'vec3') gl.uniform3fv(u,value); else if (type === 'ivec2') gl.uniform2iv(u,value); else gl.uniform1f(u,value); };
  const use = (p) => { gl.useProgram(p.p); FIELDS.forEach((name,i)=>uniform(p,name,i,'int')); uniform(p,'mixtex',7,'int'); uniform(p,'noiseTex',8,'int'); uniform(p,'tex',0,'int'); uniform(p,'shadow_tex',8,'int'); uniform(p,'flows',9,'int'); uniform(p,'waterNormals',9,'int'); uniform(p,'waterFlow',11,'int'); };
  const count = width * height;
  const rgba = a => { const out = new Float32Array(count*4); for(let i=0;i<count;i++) { out[i*4]=a[i]; out[i*4+3]=1; } return out; };
  const upload = (t, values) => { gl.bindTexture(gl.TEXTURE_2D,t); gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,width,height,gl.RGBA,gl.FLOAT,values); };
  try {
    const [wasm, normals] = await Promise.all([
      fetch(wasmUrl).then(r => { if (!r.ok) throw Error('RTplatec WASM не загружен'); return r.arrayBuffer(); }),
      new Promise((resolve,reject) => { const img=new Image(); img.onload=()=>resolve(img); img.onerror=()=>reject(Error('RTWG normals не загружены')); img.src=normalsUrl; }),
    ]);
    const opts = parameters.tectonic;
    tectonics = await createTectonics(wasm, {seed,width,height,sea:opts.oceanFraction,folding:opts.folding,overlapAbs:opts.overlapAbs,overlapRel:opts.overlapRel,plates:opts.plates,roughness:opts.roughness});
    const passes = SIMULATION_SHADERS.map(s=>compile(FULLSCREEN_VERTEX,s));
    const display = compile(FULLSCREEN_VERTEX,DISPLAY_SHADER), flowPass = compile(FULLSCREEN_VERTEX,FLOW_SHADER);
    const land = compile(MESH_VERTEX,LAND_SHADER), water = compile(MESH_VERTEX,WATER_SHADER), depth = compile(MESH_VERTEX,DEPTH_SHADER);
    const fields = FIELDS.map(()=>[target(),target()]), flows=[target(),target()];
    const noise = texture(width,height,rgba(tectonics.noise(`${seed}:wind`,parameters.wind.windNoiseRoughness,parameters.wind.windNoiseTurbulence)));
    if(linear) { gl.bindTexture(gl.TEXTURE_2D,noise); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR); }
    const normalTexture = gl.createTexture(); textures.push(normalTexture); gl.bindTexture(gl.TEXTURE_2D,normalTexture); gl.texImage2D(gl.TEXTURE_2D,0,gl.RGB,gl.RGB,gl.UNSIGNED_BYTE,normals); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.REPEAT); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.REPEAT);
    const fullscreen = gl.createVertexArray(); vaos.push(fullscreen);
    const mesh = gl.createVertexArray(); vaos.push(mesh); gl.bindVertexArray(mesh);
    const nx = Math.min(width,256), ny = Math.min(height,128), vertices = [], indices = [];
    for(let y=0;y<=ny;y++) for(let x=0;x<=nx;x++) vertices.push(x/nx,y/ny);
    for(let y=0;y<ny;y++) for(let x=0;x<nx;x++) { const a=y*(nx+1)+x; indices.push(a,a+nx+1,a+1,a+1,a+nx+1,a+nx+2); }
    const vb=gl.createBuffer(), ib=gl.createBuffer(); buffers.push(vb,ib); gl.bindBuffer(gl.ARRAY_BUFFER,vb); gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(vertices),gl.STATIC_DRAW); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0,2,gl.FLOAT,false,0,0); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,new Uint32Array(indices),gl.STATIC_DRAW);
    const shadowTex = gl.createTexture(); textures.push(shadowTex); gl.bindTexture(gl.TEXTURE_2D,shadowTex); gl.texImage2D(gl.TEXTURE_2D,0,gl.DEPTH_COMPONENT24,512,512,0,gl.DEPTH_COMPONENT,gl.UNSIGNED_INT,null); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_COMPARE_MODE,gl.COMPARE_REF_TO_TEXTURE); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_COMPARE_FUNC,gl.LEQUAL);
    const shadowFbo=gl.createFramebuffer(); framebuffers.push(shadowFbo); gl.bindFramebuffer(gl.FRAMEBUFFER,shadowFbo); gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.TEXTURE_2D,shadowTex,0); gl.drawBuffers([gl.NONE]); gl.readBuffer(gl.NONE); if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE) throw Error('RTWG: shadow framebuffer недоступен');
    upload(fields[0][0].t,rgba(tectonics.heights()));
    let iteration=0, timeTemp=0, timeWind=0, noiseCounter=0, tectonicEnabled=false;
    const enabled = Object.fromEntries(FIELDS.map(f=>[f,true]));
    const sources = () => FIELDS.forEach((_,i)=>binding(i,fields[i][0].t));
    const read = (index) => { if(disposed || gl.isContextLost()) throw Error('Контекст RTWG закрыт'); const out=new Float32Array(count*4); gl.bindFramebuffer(gl.FRAMEBUFFER,fields[index][0].f); gl.readPixels(0,0,width,height,gl.RGBA,gl.FLOAT,out); gl.bindFramebuffer(gl.FRAMEBUFFER,null); return out; };
    const reset = index => { const zero=new Float32Array(count*4); for(const pair of fields[index]) upload(pair.t,zero); };
    const engine = {
      width, height, seed, parameters, enabled,
      get iteration() { return iteration; }, get tectonicEnabled() { return tectonicEnabled; },
      read,
      setParameter(group,key,value) { const spec=PARAMETERS[group]?.[key]; if(!spec || !Number.isFinite(value) || value<spec[1] || value>spec[2] || (['plates','overlapAbs','windNoiseTurbulence'].includes(key)&&!Number.isInteger(value))) throw Error('Неверный параметр'); parameters[group][key]=value; if(group==='tectonic') tectonics.params(parameters.tectonic); },
      setTectonic(value) { tectonicEnabled=Boolean(value); if(value) reset(2); },
      resetField(name) { const i=FIELDS.indexOf(name); if(i<0) throw Error('Неизвестное поле'); reset(i); },
      restartPlates() { tectonics.set(read(0).filter((_,i)=>i%4===0)); tectonics.restart(); upload(fields[0][0].t,rgba(tectonics.heights())); },
      newDistortion() { noiseCounter++; binding(8,noise); upload(noise,rgba(tectonics.noise(`${seed}:wind:${noiseCounter}`,parameters.wind.windNoiseRoughness,parameters.wind.windNoiseTurbulence))); },
      importHeights(values) { if(values.length!==count || !values.every(v=>Number.isFinite(v)&&v>=0&&v<=20)) throw Error('Неверная карта высот'); for(let i=0;i<8;i++) reset(i); upload(fields[0][0].t,rgba(values)); iteration=0; timeTemp=0; timeWind=0; },
      step() {
        if(disposed || gl.isContextLost()) throw Error('WebGL-контекст RTWG потерян');
        if(tectonicEnabled) { tectonics.set(read(0).filter((_,i)=>i%4===0)); tectonics.step(); upload(fields[0][0].t,rgba(tectonics.heights())); }
        gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND); gl.bindVertexArray(fullscreen); gl.viewport(0,0,width,height);
        sources(); binding(8,noise);
        timeTemp+=parameters.temp.rotationSpeed; timeWind+=parameters.wind.windspeed;
        passes.forEach((p,i)=> { const f=FIELDS[i]; if(!enabled[f] || (tectonicEnabled && f==='water')) return; use(p); for(const [key,v] of Object.entries(parameters[f])) uniform(p,key,v); uniform(p,'timeFactorTemp',timeTemp); uniform(p,'timeFactorWind',timeWind); gl.bindFramebuffer(gl.FRAMEBUFFER,fields[i][1].f); gl.drawArrays(gl.TRIANGLES,0,3); });
        fields.forEach((pair,i)=> { if(enabled[FIELDS[i]] && !(tectonicEnabled && i===2)) pair.reverse(); });
        sources(); binding(9,flows[0].t); use(flowPass); gl.bindFramebuffer(gl.FRAMEBUFFER,flows[1].f); gl.drawArrays(gl.TRIANGLES,0,3); flows.reverse(); gl.bindFramebuffer(gl.FRAMEBUFFER,null); iteration++;
        if(gl.getError()!==gl.NO_ERROR) throw Error('RTWG: ошибка GPU при симуляции');
      },
      render({ field=7, threeD=false, yaw=.6, pitch=.7, distance=7, target=[0,0,0], heightScale=.65, terrainScale=1, lightPosition=[-4,7,3], waterSpeed=5 }={}) {
        if(disposed || gl.isContextLost()) return;
        sources(); gl.bindFramebuffer(gl.FRAMEBUFFER,null); gl.disable(gl.BLEND); gl.viewport(0,0,canvas.width,canvas.height);
        if(!threeD) { gl.disable(gl.DEPTH_TEST); gl.bindVertexArray(fullscreen); binding(0,fields[field][0].t); use(display); uniform(display,'currentSelection',field,'uint'); uniform(display,'WindowDimension',[canvas.width,canvas.height],'ivec2'); gl.drawArrays(gl.TRIANGLES,0,3); return; }
        gl.enable(gl.DEPTH_TEST); gl.depthMask(true); gl.bindVertexArray(mesh);
        const eye=[target[0]+distance*Math.cos(pitch)*Math.sin(yaw),target[1]+distance*Math.sin(pitch),target[2]+distance*Math.cos(pitch)*Math.cos(yaw)];
        const lightVP=multiply(ortho(Math.max(6,terrainScale*5)),lookAt(lightPosition));
        const common=(p,vp,waterLayer)=>{ use(p); uniform(p,'viewProjection',vp,'mat4'); uniform(p,'shadowMatrix',multiply(BIAS,lightVP),'mat4'); uniform(p,'cameraPosition',eye,'vec3'); uniform(p,'lightPosition',lightPosition,'vec3'); uniform(p,'heightScale',heightScale); uniform(p,'terrainScale',terrainScale); uniform(p,'waterLayer',waterLayer); uniform(p,'currentSelection',field===7?8:field,'uint'); uniform(p,'waterSpeed',waterSpeed); };
        // Avoid sampling an attached depth target during the shadow pass.
        binding(8,null); gl.bindFramebuffer(gl.FRAMEBUFFER,shadowFbo); gl.viewport(0,0,512,512); gl.clear(gl.DEPTH_BUFFER_BIT); common(depth,lightVP,0); gl.drawElements(gl.TRIANGLES,indices.length,gl.UNSIGNED_INT,0);
        gl.bindFramebuffer(gl.FRAMEBUFFER,null); gl.viewport(0,0,canvas.width,canvas.height); gl.clearColor(.045,.065,.085,1); gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT); binding(8,shadowTex); binding(9,normalTexture); binding(11,flows[0].t);
        const vp=multiply(perspective(canvas.width/canvas.height),lookAt(eye,target)); common(land,vp,0); gl.drawElements(gl.TRIANGLES,indices.length,gl.UNSIGNED_INT,0);
        gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false); common(water,vp,1); gl.drawElements(gl.TRIANGLES,indices.length,gl.UNSIGNED_INT,0); gl.depthMask(true); gl.disable(gl.BLEND);
      },
      snapshot() { return { format:'sages-rtwg', version:1, seed, width, height, iteration, parameters:structuredClone(parameters), enabled:{...enabled}, timeTemp,timeWind,noiseCounter, fields:FIELDS.map((_,i)=>read(i)) }; },
      restore(s) { s=validateSnapshot(s); if(s.width!==width||s.height!==height||s.seed!==seed) throw Error('Разрешение снимка не совпадает'); for(const group of Object.keys(parameters)) Object.assign(parameters[group],s.parameters[group]); engine.importHeights(Float32Array.from(s.fields[0].filter((_,i)=>i%4===0))); for(let i=0;i<8;i++) upload(fields[i][0].t,Float32Array.from(s.fields[i])); Object.assign(enabled,s.enabled); iteration=s.iteration; timeTemp=s.timeTemp; timeWind=s.timeWind; noiseCounter=s.noiseCounter; binding(8,noise); upload(noise,rgba(tectonics.noise(noiseCounter?`${seed}:wind:${noiseCounter}`:`${seed}:wind`,parameters.wind.windNoiseRoughness,parameters.wind.windNoiseTurbulence))); },
      dispose: cleanup,
    };
    gl.bindFramebuffer(gl.FRAMEBUFFER,null); return engine;
  } catch(e) { cleanup(); throw e; }
}
