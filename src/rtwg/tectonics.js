// GPL-3.0-or-later. Browser/WASI adapter for the pinned RTplatec build.
export function seedNumber(seed) {
  let h = 2166136261;
  for (const c of String(seed)) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  return h;
}
export async function createTectonics(bytes, { seed, width, height, sea = .56, folding = .01, overlapAbs = 8000000, overlapRel = 3, plates = 10, roughness = .7 }) {
  if (![width, height].every(n => Number.isInteger(n) && n >= 32 && n <= 512) || !Number.isInteger(plates) || plates < 1 || plates > 10 || ![sea, folding, overlapAbs, overlapRel, roughness].every(Number.isFinite) || sea<0 || sea>1 || folding<0 || folding>1 || !Number.isInteger(overlapAbs) || overlapAbs<0 || overlapAbs>8000000 || overlapRel<0 || overlapRel>3 || roughness<.1 || roughness>4) throw Error('Неверные параметры RTplatec');
  let instance;
  const view = () => new DataView(instance.exports.memory.buffer);
  const wasi = {
    environ_sizes_get: (a, b) => { view().setUint32(a, 0, true); view().setUint32(b, 0, true); return 0; },
    environ_get: () => 0,
    fd_close: () => 0,
    fd_fdstat_get: (_fd, ptr) => { new Uint8Array(instance.exports.memory.buffer, ptr, 24).fill(0); return 0; },
    fd_prestat_get: () => 8, fd_prestat_dir_name: () => 8, fd_seek: () => 8,
    fd_read: (_fd, _iov, _n, ptr) => { view().setUint32(ptr, 0, true); return 0; },
    fd_write: (_fd, iov, n, ptr) => { let len = 0; for (let i = 0; i < n; i++) len += view().getUint32(iov + i * 8 + 4, true); view().setUint32(ptr, len, true); return 0; },
    proc_exit: (code) => { throw Error(`RTplatec остановлен (${code})`); },
  };
  ({ instance } = await WebAssembly.instantiate(bytes, { wasi_snapshot_preview1: wasi }));
  const e = instance.exports;
  e.__wasm_call_ctors();
  const p = e.rt_create(seedNumber(seed), width, height, sea, folding, overlapAbs, overlapRel, plates, roughness);
  if (!p) throw Error('RTplatec: не удалось выделить память');
  const size = width * height;
  const buffer = e.rt_alloc(size * 4);
  let disposed = false;
  const check = () => { if (disposed) throw Error('RTplatec уже закрыт'); };
  return {
    heights() { check(); return new Float32Array(e.memory.buffer, e.rt_height(p), size).slice(); },
    plates() { check(); return new Uint32Array(e.memory.buffer, e.rt_plates(p), size).slice(); },
    step() { check(); e.rt_step(p); },
    restart() { check(); e.rt_restart(p); },
    set(values) { check(); if (values.length !== size || !values.every(v=>Number.isFinite(v)&&v>=0&&v<=20)) throw Error('Неверная карта высот'); new Float32Array(e.memory.buffer, buffer, size).set(values); e.rt_set(p, buffer); },
    params({ folding: f, overlapAbs: a, overlapRel: r }) { check(); if(![f,a,r].every(Number.isFinite)||f<0||f>1||!Number.isInteger(a)||a<0||a>8000000||r<0||r>3) throw Error('Неверные параметры плит'); e.rt_params(p, f, a, r); },
    noise(seedValue, rough, turbulence) { check(); if(!Number.isFinite(rough)||rough<.1||rough>8||!Number.isInteger(turbulence)||turbulence<1||turbulence>20) throw Error('Неверное возмущение ветра'); e.rt_noise(buffer, width, height, seedNumber(seedValue), rough, turbulence); const a = new Float32Array(e.memory.buffer, buffer, size).slice(); let min = Infinity, max = -Infinity; for (const v of a) { min = Math.min(min, v); max = Math.max(max, v); } const span = max - min || 1; return a.map(v => (v - min) / span); },
    dispose() { if (disposed) return; e.rt_free(buffer); e.rt_destroy(p); disposed = true; },
  };
}
