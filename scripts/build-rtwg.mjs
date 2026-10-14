// Reproducible browser RTplatec/libnoise build. No desktop/OpenGL dependencies.
// Toolchain is build-only and installed into an ignored cache, never shipped.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
const cache = '.cache/rtwg-compiler';
const tools = `${cache}/node_modules/@live-codes/clang-wasm`;
if (!fs.existsSync(`${tools}/src/toolchain.node.js`)) {
  fs.mkdirSync(cache, { recursive: true });
  for (const file of ['package.json','package-lock.json']) fs.copyFileSync(`vendor/rtwg-browser/toolchain/${file}`, `${cache}/${file}`);
  const r=spawnSync('npm',['ci','--ignore-scripts','--omit=dev','--no-audit','--no-fund'], {cwd:cache,stdio:'inherit'});
  if(r.status) throw Error('RTWG compiler installation failed');
}
const { createToolchain } = await import(pathToFileURL(path.resolve(`${tools}/src/toolchain.node.js`)));
const t = await createToolchain();
const walk = (p) => fs.readdirSync(p, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(`${p}/${e.name}`) : [`${p}/${e.name}`]);
const headers = ['vendor/rtplatec/include', 'vendor/libnoise/src/noise', 'vendor/rtplatec/3rdParty/libNoiseUtils'].flatMap(walk).filter(p => /\.(h|hpp)$/.test(p));
// The packaged libc++ is no-EH. Valid simulation math is unchanged; error paths
// trap at the JS boundary instead of attempting unsupported C++ unwinding.
function balancedEnd(s, start) {
  let depth = 1;
  for (let i = start + 1; i < s.length; i++) {
    if (s[i] === '"' || s[i] === "'") { const q = s[i++]; while (i < s.length && s[i] !== q) { if (s[i] === '\\') i++; i++; } }
    else if (s.slice(i, i + 2) === '//') { i = s.indexOf('\n', i); if (i < 0) return s.length; }
    else if (s.slice(i, i + 2) === '/*') i = s.indexOf('*/', i + 2) + 1;
    else if (s[i] === '{') depth++;
    else if (s[i] === '}' && --depth === 0) return i + 1;
  }
  throw Error('Unbalanced C++ catch');
}
const source = (p) => {
  let s = fs.readFileSync(p, 'utf8').replace(/#include "([^"]+)"/g, (all, inc) => {
    const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(p), inc));
    return fs.existsSync(resolved) ? `#include "/${resolved}"` : all;
  });
  s = s.replace(/("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')|(\/\/[^\n]*|\/\*[\s\S]*?\*\/)/g, (all, literal) => literal || all.replace(/[^\n]/g, ' '));
  s = s.replace(/\bthrow\s*\([^)]*\)/g, ''); // dynamic exception specifications
  let m;
  while ((m = /\bcatch\s*\([^)]*\)\s*\{/.exec(s))) {
    const end = balancedEnd(s, m.index + m[0].lastIndexOf('{'));
    s = s.slice(0, m.index) + s.slice(end);
  }
  s = s.replace(/\btry\s*(?=\{)/g, '').replace(/\bthrow\s+[^;]+;/g, '__builtin_trap();');
  if (p.endsWith('FractalGenerator.cpp')) s = s.replace('memcpy(map,heigthMap.GetConstSlabPtr(),heigth*length*sizeof(float));', 'memcpy(map,heigthMap.GetConstSlabPtr(),heigth*length*sizeof(float)); return 0;');
  return s;
};
for (const p of headers) t.addFile(p, source(p));
const sources = [
  ...walk('vendor/rtplatec/src').filter(p => p.endsWith('.cpp') && !p.endsWith('platecapi.cpp')),
  'vendor/rtplatec/3rdParty/libNoiseUtils/noiseutils.cpp',
  ...['noisegen.cpp','latlon.cpp','model/plane.cpp','model/sphere.cpp','model/cylinder.cpp','module/modulebase.cpp','module/perlin.cpp','module/turbulence.cpp'].map(p => `vendor/libnoise/src/${p}`),
  'vendor/rtwg-browser/bridge.cpp',
];
const objects = [];
try {
  for (const [i, p] of sources.entries()) {
    const obj = `unit_${i}.o`;
    const { error, raw } = await t.captureCompilerOutput(() => t.runtime.compile({
      input: p, code: source(p), obj, language: 'CPP',
      compileArgs: ['-std=c++14', '-fgnuc-version=4.2.1', '-Ivendor/rtplatec/include', '-Ivendor/libnoise/src/noise', '-Ivendor/libnoise/src', '-Ivendor/rtplatec/3rdParty/libNoiseUtils'],
    }));
    if (error) throw Error(`${p}\n${raw}\n${error}`);
    objects.push(obj); console.log(`RTWG ${i + 1}/${sources.length}: ${p}`);
  }
  const r = t.runtime;
  const lld = await r.getModule(r.assetUrls.lld);
  const exports = ['rt_create','rt_destroy','rt_height','rt_plates','rt_step','rt_restart','rt_set','rt_params','rt_noise','rt_alloc','rt_free','__wasm_call_ctors'];
  const { error, raw } = await t.captureCompilerOutput(() => r.run(lld, true, 'wasm-ld', '--no-entry', '--gc-sections', '--strip-all', '-z', 'stack-size=4194304', '--max-memory=268435456', ...exports.map(e => `--export=${e}`), '-Llib/wasm32-wasi', ...objects, '-lc++', '-lc++abi', '-lc', '-lm', `-L${r.compilerConfig.compilerRuntimeLibDir}`, '-lclang_rt.builtins-wasm32', '-o', 'rtplatec.wasm'));
  if (error) throw Error(`${raw}\n${error}`);
  const bytes = Uint8Array.from(r.memfs.getFileContents('rtplatec.wasm'));
  fs.mkdirSync('src/rtwg', { recursive: true });
  fs.writeFileSync('src/rtwg/rtplatec.wasm', bytes);
  console.log(`RTWG WASM: ${bytes.length} bytes`);
} finally { t.dispose(); }
