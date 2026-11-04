// Star Worlds: the flat level is bent around a drum, so a wrapping map
// (core Level `wrap`) looks like a little round planet. Column x becomes an
// angle around the drum's axis (the world z axis); the tile at flat x =
// BEND.offset sits on top, and moving the offset turns the planet.
//
// Done in the vertex shader, so every model, effect and animation keeps
// working in flat coordinates. Only materials passed to bendMaterial() get
// the bending code (a separate shader program, so nothing else is affected).
import * as THREE from 'three';

export const BEND = {
  radius: { value: 0 }, // 0 = no bending (flat levels)
  offset: { value: 0 }, // flat x that faces up
};

// Declared in `common`, used by the two chunks below; only compiled into
// shaders that define BEND.
THREE.ShaderChunk.common += /* glsl */`
#ifdef BEND
uniform float bendRadius;
uniform float bendOffset;
vec3 bendPoint( vec3 p ) {
  if ( bendRadius <= 0.0 ) return p;
  float a = ( p.x - bendOffset ) / bendRadius;
  float r = bendRadius + p.y;
  return vec3( r * sin( a ), r * cos( a ) - bendRadius, p.z );
}
#endif
`;

THREE.ShaderChunk.project_vertex = THREE.ShaderChunk.project_vertex.replace(
  'mvPosition = modelViewMatrix * mvPosition;',
  /* glsl */`#ifdef BEND
  mvPosition = viewMatrix * vec4( bendPoint( ( modelMatrix * mvPosition ).xyz ), 1.0 );
#else
  mvPosition = modelViewMatrix * mvPosition;
#endif`,
);

// Normals turn with the surface: rotate the world normal by the bend angle.
THREE.ShaderChunk.defaultnormal_vertex += /* glsl */`
#ifdef BEND
if ( bendRadius > 0.0 ) {
  vec4 bendP = vec4( position, 1.0 );
  #ifdef USE_INSTANCING
    bendP = instanceMatrix * bendP;
  #endif
  float bendA = ( ( modelMatrix * bendP ).x - bendOffset ) / bendRadius;
  vec3 wn = inverseTransformDirection( transformedNormal, viewMatrix );
  float c = cos( bendA );
  float s = sin( bendA );
  wn = vec3( wn.x * c + wn.y * s, - wn.x * s + wn.y * c, wn.z );
  transformedNormal = normalize( ( viewMatrix * vec4( wn, 0.0 ) ).xyz );
}
#endif
`;

export function bendMaterial(m) {
  if (m.userData.bent) return;
  m.userData.bent = true;
  m.onBeforeCompile = (shader) => {
    shader.uniforms.bendRadius = BEND.radius;
    shader.uniforms.bendOffset = BEND.offset;
    shader.vertexShader = `#define BEND\n${shader.vertexShader}`;
  };
  m.customProgramCacheKey = () => 'bend';
  m.needsUpdate = true;
}

// Bend every material under `root` (call again for things added later).
// Objects built already round (userData.noBend) are left alone.
//
// Bent objects are never frustum-culled: three.js decides visibility from
// the flat (unbent) bounds, which on a planet are nowhere near where the
// object really appears, so parts of the world (and Pip) would vanish when
// the view is turned.
export function bendTree(root) {
  root.traverse((o) => {
    if (!o.material || o.userData.noBend) return;
    o.frustumCulled = false;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) bendMaterial(m);
  });
}

// The same bend in JS, for placing screen things (Pip's speech balloon).
export function bendPoint(v) {
  const R = BEND.radius.value;
  if (!R) return v.clone();
  const a = (v.x - BEND.offset.value) / R;
  const r = R + v.y;
  return new THREE.Vector3(r * Math.sin(a), r * Math.cos(a) - R, v.z);
}
