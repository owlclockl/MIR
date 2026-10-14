// GPL-3.0-or-later. Versioned RTWG snapshots are separate from Azgaar .map files.
import { FIELDS, validateParameters } from './config.js';
export const MAX_FILE_BYTES = 32 * 1024 * 1024;
export function validateSnapshot(s) {
  if (!s || s.format !== 'mir-rtwg' || s.version !== 1 || typeof s.seed !== 'string' || !s.seed.length || s.seed.length > 200 || ![64,128,256,512].includes(s.width) || s.height !== s.width / 2) throw Error('Неизвестный формат / размер RTWG');
  const parameters = validateParameters(s.parameters);
  for (const key of ['iteration', 'noiseCounter']) if (!Number.isInteger(s[key]) || s[key]<0 || s[key]>1e9) throw Error(`Неверный счётчик ${key}`);
  for (const key of ['timeTemp','timeWind']) if (!Number.isFinite(s[key]) || Math.abs(s[key])>1e10) throw Error('Неверное время RTWG');
  const length=s.width*s.height*4;
  if (!Array.isArray(s.fields) || s.fields.length!==8 || !s.fields.every(a => (a instanceof Float32Array || Array.isArray(a)) && a.length===length && a.every(v=>typeof v==='number' && Number.isFinite(v) && Math.abs(v)<=1e6))) throw Error('Повреждены поля RTWG');
  if (!FIELDS.every(f=>typeof s.enabled?.[f]==='boolean')) throw Error('Повреждены переключатели RTWG');
  // Prevent a snapshot from supplying invalid crust to the WASM boundary.
  for(let i=0;i<length;i+=4) if(s.fields[0][i]<0 || s.fields[0][i]>20) throw Error('Высоты RTWG вне диапазона');
  return {...s, parameters, enabled:Object.fromEntries(FIELDS.map(f=>[f,s.enabled[f]])), fields:s.fields.map(a=>Float32Array.from(a))};
}
const encode = values => {
  // Explicit little-endian floats: do not rely on the CPU byte order.
  const data=new Uint8Array(values.length*4), view=new DataView(data.buffer);
  values.forEach((v,i)=>view.setFloat32(i*4,v,true));
  let str=''; for(let i=0;i<data.length;i+=8192) str+=String.fromCharCode(...data.subarray(i,i+8192)); return btoa(str);
};
export function encodeSnapshot(s) { const v=validateSnapshot(s); return JSON.stringify({...v, encoding:'float32-le-base64', fields:v.fields.map(encode)}); }
export function decodeSnapshot(text) {
  if(typeof text!=='string' || text.length>MAX_FILE_BYTES) throw Error('Снимок RTWG слишком большой');
  const s=JSON.parse(text);
  if(s?.encoding!=='float32-le-base64' || ![64,128,256,512].includes(s.width) || s.height!==s.width/2 || !Array.isArray(s.fields) || s.fields.length!==8) throw Error('Неверная кодировка RTWG');
  const n=s.width*s.height*4;
  s.fields=s.fields.map(a=> { if(typeof a!=='string' || a.length!==Math.ceil(n*4/3)*4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(a)) throw Error('Повреждено поле RTWG'); const raw=atob(a); if(raw.length!==n*4) throw Error('Неверная длина RTWG'); const bytes=Uint8Array.from(raw,c=>c.charCodeAt(0)), view=new DataView(bytes.buffer); return Float32Array.from({length:n},(_,i)=>view.getFloat32(i*4,true)); });
  return validateSnapshot(s);
}
