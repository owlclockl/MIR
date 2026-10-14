import assert from 'node:assert/strict';
import { readFileSync, mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { fromRoot } from './lib/root.mjs';
const {chromium}=await import(pathToFileURL(fromRoot('vendor/azgaar-fantasy-map-generator/node_modules/playwright/index.mjs')));
const browser=await chromium.launch({headless:true,executablePath:process.env.MIR_CHROMIUM_EXECUTABLE||undefined,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const workbenchUrl=new URL(process.argv[2]||'http://127.0.0.1:4180');workbenchUrl.searchParams.set('mapTools','1');
const base=workbenchUrl.href;
const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));mkdirSync(fromRoot('logs'),{recursive:true});
const ready=()=>page.waitForFunction(()=>document.querySelector('.rtwg-status')?.textContent.includes('шаг'),null,{timeout:120000});
try {
  await page.goto(base,{waitUntil:'domcontentloaded'});
  if(await page.locator('script[src*="/@vite/client"]').count()) {
    const result=await page.evaluate(async()=>{
      const {createRtwgEngine}=await import('/src/rtwg/engine.js');
      const {encodeSnapshot,decodeSnapshot}=await import('/src/rtwg/snapshot.js');
      const c=document.createElement('canvas');c.width=640;c.height=320;document.body.append(c);
      const e=await createRtwgEngine(c,{seed:'gpu-test',width:64,height:32});
      try {
        for(let i=0;i<32;i++)e.step();
        const finite=Array.from({length:8},(_,i)=>e.read(i).every(Number.isFinite));
        const snapshot=e.snapshot(), water=e.read(2);e.enabled.water=false;e.step();const waterAfter=e.read(2);const frozen=water.every((v,i)=>v===waterAfter[i]);e.restore(snapshot);
        const equal=e.snapshot().fields.every((a,f)=>a.every((v,i)=>v===snapshot.fields[f][i]));
        const round=decodeSnapshot(encodeSnapshot(snapshot));
        e.restore(round);const json=e.read(0).every((v,i)=>v===snapshot.fields[0][i]);
        e.setTectonic(true);for(let i=0;i<8;i++)e.step();e.setTectonic(false);
        const changed=e.read(0).some((v,i)=>v!==snapshot.fields[0][i]);
        const waterDepth=e.read(2).filter((_,i)=>i%4===0).every(v=>v>=0);
        for(let i=0;i<8;i++)e.render({field:i});e.render({threeD:true});
        return {finite,frozen,equal,json,changed,waterDepth,error:c.getContext('webgl2').getError(),width:e.width};
      }finally{e.dispose();c.remove();}
    });
    assert.deepEqual(result.finite,Array(8).fill(true));for(const k of ['frozen','equal','json','changed','waterDepth'])assert.equal(result[k],true,k);assert.equal(result.error,0);console.log('✓ WASM + восемь GPU-проходов, 2D/3D/тени, тектоника, заморозка и lossless snapshot');
  }
  await page.locator('.play-button').click();await page.locator('[data-action="world-slot-create"][data-slot-index="0"]').click();await page.locator('[data-role="world-seed"]').fill('rtwg-browser-test');await page.locator('[data-action="world-generate"]').click();
  await page.waitForFunction(()=>document.querySelector('.surface-status')?.hidden,null,{timeout:120000});
  const fingerprint=()=>page.evaluate(()=>{const w=document.querySelector('[data-role="world-editor"]').contentWindow;return Array.from(w.grid.cells.h).join(',');});
  const before=await fingerprint();
  await page.locator('[data-action="world-rtwg"]').click();await ready();
  await page.locator('[data-control="resolution"]').selectOption('64');await page.locator('[data-rtwg="restart"]').click();await page.waitForFunction(()=>document.querySelector('.rtwg-status')?.textContent.includes('64×32'),null,{timeout:60000});
  assert.equal(await fingerprint(),before);console.log('✓ RTWG открывается из игры и не переписывает карту молча');
  for(let i=0;i<8;i++){await page.locator('[data-control="field"]').selectOption(String(i));await page.locator('[data-rtwg="step"]').click();}
  await page.locator('[data-control="threeD"]').check();await page.locator('[data-control="field"]').selectOption('7');
  await page.screenshot({path:fromRoot('logs/rtwg-3d.png')});await page.locator('[data-control="threeD"]').uncheck();await page.locator('[data-control="field"]').selectOption('0');
  const saved=await Promise.all([page.waitForEvent('download'),page.locator('[data-rtwg="save"]').click()]); const snapshotFile=await saved[0].path();assert.ok(readFileSync(snapshotFile,'utf8').includes('float32-le-base64'));
  await page.locator('[data-file="snapshot"]').setInputFiles(snapshotFile);await ready();assert.equal(await page.locator('.rtwg-error').isVisible(),false);
  const png=await Promise.all([page.waitForEvent('download'),page.locator('[data-rtwg="png"]').click()]);const zip=readFileSync(await png[0].path());assert.equal(zip.readUInt32LE(),0x04034b50);assert.ok(zip.includes(Buffer.from('metadata.json')));assert.ok(zip.includes(Buffer.from('climat.png')));console.log('✓ все слои, сохранение/открытие, экспорт восьми PNG в ZIP');
  await page.getByText('Исходники · лицензии · ограничения',{exact:true}).click();const source=await Promise.all([page.waitForEvent('download'),page.locator('[data-rtwg="source"]').click()]);const archive=readFileSync(await source[0].path());assert.ok(archive.includes(Buffer.from('MIR/src/main.js')));assert.ok(archive.includes(Buffer.from('MIR/src/data/store.js')));assert.ok(archive.includes(Buffer.from('MIR/vendor/rtwg-browser/bridge.cpp')));assert.ok(!archive.includes(Buffer.from('MIR/server/data/')));console.log('✓ полный соответствующий исходный код скачивается вместе с runtime');
  // Import a height PNG generated by the browser itself, no external fixture.
  const image=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=64;c.height=32;const ctx=c.getContext('2d');ctx.fillStyle='#111';ctx.fillRect(0,0,64,32);ctx.fillStyle='#eee';ctx.fillRect(20,5,25,22);return c.toDataURL('image/png').split(',')[1];});
  await page.locator('[data-file="heightmap"]').setInputFiles({name:'terrain.png',mimeType:'image/png',buffer:Buffer.from(image,'base64')});await page.waitForTimeout(100);assert.equal(await page.locator('.rtwg-error').isVisible(),false);console.log('✓ настоящий PNG heightmap импортирован');
  await page.locator('[data-rtwg="evolve"]').click();await page.waitForFunction(()=>!document.querySelector('.rtwg-status')?.textContent.startsWith('Тектоника:'),null,{timeout:60000});
  await page.locator('[data-action="world-surface"]').click();await page.waitForFunction(()=>document.querySelector('.surface-status')?.hidden,null,{timeout:120000});assert.equal(await fingerprint(),before);
  await page.locator('[data-action="world-rtwg"]').click();await ready();
  await page.screenshot({path:fromRoot('logs/rtwg-overview.png')});
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:fromRoot('logs/rtwg-mobile.png')});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await page.setViewportSize({width:320,height:740});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  console.log('✓ возврат к карте, сохранение RTWG-сеанса и мобильные 390/320 px');
  await page.setViewportSize({width:1440,height:1000});
  page.once('dialog',d=>d.accept());await page.locator('[data-rtwg="apply"]').click();
  await page.waitForFunction(()=>!document.querySelector('.world-app')?.classList.contains('is-rtwg'),null,{timeout:120000});await page.waitForFunction(()=>document.querySelector('.surface-status')?.hidden,null,{timeout:120000});
  assert.notEqual(await fingerprint(),before);await page.screenshot({path:fromRoot('logs/rtwg-applied-surface.png')});console.log('✓ подтверждённый перенос RTWG в настоящий Azgaar и метровую поверхность');
  assert.deepEqual(errors,[]);console.log('RTWG browser: all checks passed');
} finally {await browser.close();}
