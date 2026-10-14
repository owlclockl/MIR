// GPL-3.0-or-later. Lossless JSON + normalized PNG fields and an uncompressed ZIP.
import { FIELDS } from './config.js';
export const crc32 = bytes => { let c=0xffffffff; for(const b of bytes) { c^=b; for(let i=0;i<8;i++) c=(c>>>1)^((c&1)?0xedb88320:0); } return (c^0xffffffff)>>>0; };
export function zipStored(files) {
  const chunks=[], central=[]; let offset=0;
  for(const {name,bytes} of files) {
    const n=new TextEncoder().encode(name), crc=crc32(bytes), local=new Uint8Array(30+n.length), l=new DataView(local.buffer);
    l.setUint32(0,0x04034b50,true); l.setUint16(4,20,true); l.setUint16(12,0x21,true); l.setUint32(14,crc,true); l.setUint32(18,bytes.length,true); l.setUint32(22,bytes.length,true); l.setUint16(26,n.length,true); local.set(n,30);
    const entry=new Uint8Array(46+n.length), d=new DataView(entry.buffer); d.setUint32(0,0x02014b50,true); d.setUint16(4,20,true); d.setUint16(6,20,true); d.setUint16(14,0x21,true); d.setUint32(16,crc,true); d.setUint32(20,bytes.length,true); d.setUint32(24,bytes.length,true); d.setUint16(28,n.length,true); d.setUint32(42,offset,true); entry.set(n,46);
    chunks.push(local,bytes); central.push(entry); offset+=local.length+bytes.length;
  }
  const size=central.reduce((s,b)=>s+b.length,0), end=new Uint8Array(22), e=new DataView(end.buffer); e.setUint32(0,0x06054b50,true); e.setUint16(8,files.length,true); e.setUint16(10,files.length,true); e.setUint32(12,size,true); e.setUint32(16,offset,true);
  return new Blob([...chunks,...central,end],{type:'application/zip'});
}
export async function pngFields(engine, license) {
  const files=[], ranges={};
  for(let field=0;field<8;field++) {
    const values=engine.read(field), mins=[Infinity,Infinity,Infinity], maxs=[-Infinity,-Infinity,-Infinity];
    for(let i=0;i<values.length;i+=4) for(let c=0;c<3;c++) { mins[c]=Math.min(mins[c],values[i+c]); maxs[c]=Math.max(maxs[c],values[i+c]); }
    const canvas=document.createElement('canvas'); canvas.width=engine.width; canvas.height=engine.height; const ctx=canvas.getContext('2d'), image=ctx.createImageData(canvas.width,canvas.height);
    for(let y=0;y<canvas.height;y++) for(let x=0;x<canvas.width;x++) { const src=((canvas.height-1-y)*canvas.width+x)*4, dest=(y*canvas.width+x)*4; for(let c=0;c<3;c++) image.data[dest+c]=Math.round((values[src+c]-mins[c])/(maxs[c]-mins[c]||1)*255); image.data[dest+3]=255; }
    ctx.putImageData(image,0,0); const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png')); if(!blob) throw Error('Не удалось создать PNG');
    files.push({name:`${FIELDS[field]}.png`,bytes:new Uint8Array(await blob.arrayBuffer())}); ranges[FIELDS[field]]={min:mins,max:maxs};
  }
  files.push({name:'metadata.json',bytes:new TextEncoder().encode(JSON.stringify({engine:'RTWG browser v1',seed:engine.seed,width:engine.width,height:engine.height,iteration:engine.iteration,orientation:'north-up (raw texture rows reversed)',encoding:'8-bit normalized RGB per channel: value=min+pixel/255*(max-min); use .rtwg.json for lossless data',ranges},null,2))});
  files.push({name:'LICENSE.txt',bytes:new TextEncoder().encode(license)});
  return zipStored(files);
}
export function download(blob,name) { const url=URL.createObjectURL(blob), a=document.createElement('a'); a.href=url; a.download=name; a.click(); setTimeout(()=>URL.revokeObjectURL(url),30000); }
