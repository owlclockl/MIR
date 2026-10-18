// GPL-3.0-or-later. Executed sources are RTWG shaders, not approximations.
import rock from '../../vendor/rtwg/Shader/simulation/rock/rock_Sim.fs.glsl?raw';
import soil from '../../vendor/rtwg/Shader/simulation/soil/soil_Sim.fs.glsl?raw';
import water from '../../vendor/rtwg/Shader/simulation/water/water_Sim.fs.glsl?raw';
import temp from '../../vendor/rtwg/Shader/simulation/temp/temp_Sim.fs.glsl?raw';
import moist from '../../vendor/rtwg/Shader/simulation/moist/moist_Sim.fs.glsl?raw';
import wind from '../../vendor/rtwg/Shader/simulation/wind/wind_Sim.fs.glsl?raw';
import ice from '../../vendor/rtwg/Shader/simulation/ice/ice_Sim.fs.glsl?raw';
import climat from '../../vendor/rtwg/Shader/simulation/climat/climat.fs.glsl?raw';
import display from '../../vendor/rtwg/Shader/display/2D/2d_display.fs.glsl?raw';
import landscape from '../../vendor/rtwg/Shader/display/3D/dispmap.fs.glsl?raw';
import waterDisplay from '../../vendor/rtwg/Shader/display/3D/waterDispmap.fs.glsl?raw';
import flow from '../../vendor/rtwg/Shader/display/3D/waterFlow.fs.glsl?raw';
export const FULLSCREEN_VERTEX = `#version 300 es
void main() { vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)); gl_Position = vec4(p * 2. - 1., 0., 1.); }`;
export function toWebGL(source) {
  return source.replace(/^[\s\S]*?#version\s+\d+\s+core/, '#version 300 es\nprecision highp float;\nprecision highp int;\nprecision highp sampler2D;\nprecision highp sampler2DArray;\nprecision highp sampler2DShadow;')
    .replace(/layout\s*\(binding\s*=\s*\d+\)\s*/g, '')
    .replace(/(const\s+uint\s+\w+\s*=\s*)(\d+)(\s*;)/g, '$1$2u$3')
    .replace(/case\s+(\d+)\s*:/g, 'case $1u:')
    .replace(/currentSelection == (\d+)\b/g, 'currentSelection == $1u')
    .replace(/uniform\s+(\w+)\s+(\w+)\s*=\s*[^;]+;/g, 'uniform $1 $2;')
    .replace(/\btexture2D\b/g, 'texture')
    .replace(/(getTexValue|getGround)\(([^()]*)\)/g, (_all, fn, args) => `${fn}(${args.split(',').map(a => /^\s*-?\d+\s*$/.test(a) ? `${a.trim()}.0` : a).join(',')})`)
    .replace(/(getGround\([^)]*\))\.x/g, '$1')
    .replace(/textureSize\((\w+),\s*0\)/g, 'vec2(textureSize($1,0))')
    .replace(/(\d+\.\d*|\d*\.\d+)f\b/g, '$1')
    .replace(/([+*/-])\s*(\d+)\b(?![.\w])/g, '$1$2.0')
    .replace(/(?<![\w.])(\d+)\s*([+*/-])/g, '$1.0$2')
    .replace(/in VS_OUT\s*\{[\s\S]*?\}\s*vs_out\s*;/, 'in vec3 normalF; in vec3 lightF; in vec3 viewF;')
    .replace(/([<>]=?)\s*(\d+)\b(?![.\w])/g, '$1$2.0')
    .replace(/(textureProjOffset\([^;\n]+?\))\.x/g, '$1')
    .replace(/vs_out\.N/g, 'normalF').replace(/vs_out\.L/g, 'lightF').replace(/vs_out\.V/g, 'viewF');
}
export function fragment(source, { simulation = false, scalar = false, waterLayer = false } = {}) {
  let s = toWebGL(source).replace(/(?:layout\s*\(location\s*=\s*0\)\s*)?out\s+(float|vec3|vec4)\s+color\s*;/, '$1 color;\nlayout(location=0) out vec4 sagesOutput;');
  s = s.replace(/void main\s*\(/, 'void rtwgMain(');
  // Physical depth must not become negative through evaporation; upstream clamp
  // used sea-ground as the lower bound even over dry terrain.
  if (simulation && source === water) s = s.replace('sea_level -ground,10.0', 'max(0.0,sea_level-ground),10.0');
  if (simulation && source === wind) s = s.replace(/1\.0\/\(getGround\(dir.x, dir.y\)\s*\+\s*getTexValue\(water,dir.x, dir.y\)\.x\)/, '1.0/max(0.001,(getGround(dir.x, dir.y) + getTexValue(water,dir.x, dir.y).x))');
  const type = /\bvec4 color;/.test(s) ? 'vec4' : scalar ? 'float' : 'vec3';
  const value = type === 'vec4' ? 'color' : scalar ? 'vec4(color,0.,0.,1.)' : 'vec4(color,1.)';
  return s + `\nvoid main() { color = ${type}(0.); ${waterLayer ? 'if(texture(water,texcoordF).x <= 0.00001) discard;' : ''} rtwgMain(); vec4 v = ${value}; if(any(isnan(v)) || any(isinf(v))) v = vec4(0.,0.,0.,1.); sagesOutput = v; }`;
}
export const SIMULATION_SHADERS = [rock, soil, water, temp, moist, wind, ice, climat].map((s, i) => fragment(s, { simulation: true, scalar: i === 0 }));
export const DISPLAY_SHADER = fragment(display);
export const LAND_SHADER = fragment(landscape);
export const WATER_SHADER = fragment(waterDisplay, { waterLayer: true });
export const FLOW_SHADER = fragment(flow);
// OpenGL tessellation is unavailable in WebGL2. The same height/normal sampling
// from RTWG's tessellation evaluation shader is evaluated on a bounded mesh.
export const MESH_VERTEX = `#version 300 es
precision highp float;
layout(location=0) in vec2 uv;
uniform sampler2D rock, soil, water;
uniform mat4 viewProjection, shadowMatrix;
uniform vec3 cameraPosition, lightPosition;
uniform float heightScale, terrainScale, waterLayer;
out vec2 texcoordF, tessCoord;
out vec3 normalF, lightF, viewF;
out vec4 shadowCoord, position;
float h(vec2 u) { return texture(rock,u).x + texture(soil,u).x + waterLayer * texture(water,u).x; }
void main() {
 vec2 d=1./vec2(textureSize(rock,0));
 vec3 p=vec3((uv.x-.5)*4.*terrainScale, (h(uv)-.95)*heightScale, (uv.y-.5)*2.*terrainScale);
 normalF=normalize(vec3((h(uv-d*vec2(1,0))-h(uv+d*vec2(1,0)))*heightScale, 8.*d.x*terrainScale, (h(uv-d*vec2(0,1))-h(uv+d*vec2(0,1)))*heightScale*2.));
 lightF=lightPosition-p; viewF=cameraPosition-p;
 texcoordF=uv; tessCoord=fract(uv*vec2(textureSize(rock,0)));
 position=vec4(p,1.); shadowCoord=shadowMatrix*position; gl_Position=viewProjection*position;
}`;
export const DEPTH_SHADER = '#version 300 es\nprecision highp float;\nvoid main() {}';
