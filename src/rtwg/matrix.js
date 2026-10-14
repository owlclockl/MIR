// GPL-3.0-or-later. Column-major camera matrices, independent of GLM.
const norm = v => { const l = Math.hypot(...v) || 1; return v.map(x => x / l); };
const cross = (a,b) => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const dot = (a,b) => a.reduce((s,v,i) => s+v*b[i],0);
export function multiply(a,b) { const r=new Float32Array(16); for(let c=0;c<4;c++) for(let row=0;row<4;row++) for(let k=0;k<4;k++) r[c*4+row]+=a[k*4+row]*b[c*4+k]; return r; }
export function lookAt(eye, center=[0,0,0]) { const z=norm(eye.map((v,i)=>v-center[i])); const x=norm(cross([0,1,0],z)), y=cross(z,x); return new Float32Array([x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-dot(x,eye),-dot(y,eye),-dot(z,eye),1]); }
export function perspective(aspect) { const f=1/Math.tan(.65/2), near=.05,far=100; return new Float32Array([f/aspect,0,0,0,0,f,0,0,0,0,(far+near)/(near-far),-1,0,0,2*far*near/(near-far),0]); }
export function ortho(radius=6) { return new Float32Array([1/radius,0,0,0,0,1/radius,0,0,0,0,-2/40,0,0,0,-1,1]); }
export const BIAS = new Float32Array([.5,0,0,0,0,.5,0,0,0,0,.5,0,.5,.5,.5,1]);
