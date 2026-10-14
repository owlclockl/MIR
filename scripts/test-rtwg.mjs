import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import { createTectonics } from '../src/rtwg/tectonics.js';
import { defaultParameters, validateParameters } from '../src/rtwg/config.js';
import { validateSnapshot, encodeSnapshot, decodeSnapshot } from '../src/rtwg/snapshot.js';
import { crc32, zipStored } from '../src/rtwg/export.js';
let count=0;
const check=(fn,label)=>{fn();count++;console.log(`✓ ${label}`);};
const bytes=fs.readFileSync('src/rtwg/rtplatec.wasm');
const config={seed:'MIR-RTWG-test',width:64,height:32};
const a=await createTectonics(bytes,config),b=await createTectonics(bytes,config);
try {
  const initial=a.heights();
  check(()=>assert.deepEqual(initial,b.heights()),'настоящий WASM RTplatec: один seed — одна карта');
  check(()=>assert.equal(initial.length,2048),'ограниченное глобальное поле, не метровый массив планеты');
  check(()=>assert.ok(initial.every(v=>v>=.1&&Number.isFinite(v))),'исходные высоты конечны');
  check(()=>assert.ok(new Set(a.plates()).size>1),'реальные плиты RTplatec, не декоративный слой');
  for(let i=0;i<64;i++){a.step();b.step();}
  check(()=>assert.deepEqual(a.heights(),b.heights()),'64 тектонических шага детерминированы');
  check(()=>assert.notDeepEqual(a.heights(),initial),'тектоника действительно меняет рельеф');
  check(()=>assert.ok(a.heights().every(Number.isFinite)),'тектоника без NaN/Infinity');
  const n=a.noise('wind',1.1,4);
  check(()=>assert.deepEqual(n,b.noise('wind',1.1,4)),'оригинальный Perlin/Turbulence libnoise детерминирован');
  check(()=>assert.ok(n.every(v=>v>=0&&v<=1)),'возмущение нормализовано');
  a.params({folding:.02,overlapAbs:2000,overlapRel:.3});a.restart();a.step();
  check(()=>assert.ok(a.heights().every(Number.isFinite)),'перезапуск и параметры плит работают');
  check(()=>assert.throws(()=>a.set(Float32Array.of(NaN))),'некорректные высоты не попадают в WASM');
} finally {a.dispose();b.dispose();}
check(()=>assert.throws(()=>a.step()),'доступ после dispose запрещён');
await assert.rejects(()=>createTectonics(bytes,{...config,plates:100}));count++;
const s={format:'mir-rtwg',version:1,...config,iteration:12,noiseCounter:0,timeTemp:.1,timeWind:.2,parameters:defaultParameters(),enabled:Object.fromEntries(['rock','soil','water','temp','moist','wind','ice','climat'].map(f=>[f,true])),fields:Array.from({length:8},()=>new Float32Array(64*32*4).fill(.5))};
check(()=>assert.deepEqual(validateParameters(s.parameters),s.parameters),'все исходные параметры RTWG и диапазоны');
check(()=>assert.deepEqual(decodeSnapshot(encodeSnapshot(s)),{...s,encoding:'float32-le-base64'}),'JSON сохраняет Float32 без потерь');
for(const mutate of [s=>s.width=100000,s=>s.fields[0][0]=NaN,s=>s.parameters.tectonic.plates=100,s=>s.enabled.wind='yes',s=>s.fields.pop(),s=>s.timeTemp=Infinity,s=>s.iteration=-1,s=>s.fields[0][0]=-1]){
  const bad=structuredClone(s); mutate(bad);check(()=>assert.throws(()=>validateSnapshot(bad)),'атомарная проверка повреждённого снимка');
}
const cleared=structuredClone(s);cleared.fields[0].fill(0);check(()=>assert.ok(decodeSnapshot(encodeSnapshot(cleared))),'сброшенная порода сохраняется даже при выключенном проходе');
check(()=>assert.throws(()=>decodeSnapshot('{bad')),'повреждённый JSON отклонён');
check(()=>assert.equal(crc32(new TextEncoder().encode('123456789')),0xcbf43926),'ZIP CRC32 соответствует стандарту');
const zip=new Uint8Array(await zipStored([{name:'a.txt',bytes:new TextEncoder().encode('RTWG')}]).arrayBuffer());
check(()=>assert.equal(new DataView(zip.buffer).getUint32(0,true),0x04034b50),'ZIP имеет стандартный заголовок');
for(const [p,sha] of [['vendor/rtwg','6cbf782c47c360dcf4bf5ca9b0d1b999d85dac38'],['vendor/rtplatec','c75d9605858d1f65bf1cc283834149ab009b2880'],['vendor/libnoise','9ce0737b55812f7de907e86dc633724524e3a8e8']]) check(()=>assert.ok(fs.existsSync(`${p}/LICENSE`)||fs.existsSync(`${p}/LICENSE.md`)),`${p}: лицензия включена (${sha.slice(0,8)})`);
const manifest=JSON.parse(fs.readFileSync('vendor/rtwg-browser/upstream-manifest.json','utf8'));
for(const [path,sha] of Object.entries(manifest.files)) assert.equal(createHash('sha256').update(fs.readFileSync(path)).digest('hex'),sha,path);
count++;console.log(`✓ ${Object.keys(manifest.files).length} upstream files unchanged`);
console.log(`RTWG: ${count} checks passed`);
