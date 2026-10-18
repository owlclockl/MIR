// Complete corresponding source archive for the GPL-enabled distribution.
// Deterministic ZIP/deflate; no git, compiler, Python or external host at runtime.
import fs from 'node:fs';
import path from 'node:path';
import { deflateRawSync } from 'node:zlib';
import { crc32 } from '../../src/rtwg/export.js';
const excluded=new Set(['node_modules','.git','.cache','dist','build','coverage','logs','.arena','.github','.vite','.next','.local','target','out','__pycache__']);
const roots=['src','scripts','server','hosting','public','vendor','docs'];
const files=['index.html','package.json','package-lock.json','vite.config.js','README.md','AGENTS.md','CHANGELOG.md','COPYING','NOTICE','wrangler.toml','.gitignore'];
function walk(dir) { if(!fs.existsSync(dir))return;for(const e of fs.readdirSync(dir,{withFileTypes:true})) {const p=`${dir}/${e.name}`;if(e.name.startsWith('.')||excluded.has(e.name)||p==='public/fmg'||p==='server/data'||p.endsWith('/sages-source.zip')||p.endsWith('/Thesis.pdf')||p.includes('/screenshots/')||e.name.startsWith('.env')||e.name.startsWith('.dev.vars'))continue;if(e.isDirectory())walk(p);else if(e.isFile())files.push(p);} }
export function buildRtwgSourceArchive() {
  // This module may be called twice in a build-all process.
  files.splice(0,files.length,...['index.html','package.json','package-lock.json','vite.config.js','README.md','AGENTS.md','CHANGELOG.md','COPYING','NOTICE','wrangler.toml','.gitignore']);
  for(const dir of roots)walk(dir);
  const local=[],central=[];let offset=0;
  for(const p of [...new Set(files)].sort()) {
    if(!fs.existsSync(p))continue;
    const n=Buffer.from(`Sages/${p}`),data=fs.readFileSync(p),compressed=deflateRawSync(data,{level:6}),crc=crc32(data);
    const header=Buffer.alloc(30+n.length);header.writeUInt32LE(0x04034b50);header.writeUInt16LE(20,4);header.writeUInt16LE(0x800,6);header.writeUInt16LE(8,8);header.writeUInt16LE(0x21,12);header.writeUInt32LE(crc,14);header.writeUInt32LE(compressed.length,18);header.writeUInt32LE(data.length,22);header.writeUInt16LE(n.length,26);n.copy(header,30);
    const entry=Buffer.alloc(46+n.length);entry.writeUInt32LE(0x02014b50);entry.writeUInt16LE(20,4);entry.writeUInt16LE(20,6);entry.writeUInt16LE(0x800,8);entry.writeUInt16LE(8,10);entry.writeUInt16LE(0x21,14);entry.writeUInt32LE(crc,16);entry.writeUInt32LE(compressed.length,20);entry.writeUInt32LE(data.length,24);entry.writeUInt16LE(n.length,28);entry.writeUInt32LE(offset,42);n.copy(entry,46);
    local.push(header,compressed);central.push(entry);offset+=header.length+compressed.length;
  }
  const end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(central.length,8);end.writeUInt16LE(central.length,10);end.writeUInt32LE(central.reduce((s,c)=>s+c.length,0),12);end.writeUInt32LE(offset,16);
  const target='src/rtwg/sages-source.zip';fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,Buffer.concat([...local,...central,end]));
  console.log(`RTWG corresponding source: ${central.length} files, ${(fs.statSync(target).size/1048576).toFixed(1)} MiB`);
}
