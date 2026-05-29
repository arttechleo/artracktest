/**
 * Fix PlutoRig_Mixamo.glb - Bake Armature transforms into mesh data.
 *
 * Problem: Blender exported the GLB with:
 *   - Armature scale: 0.01 (FBX cm→m import artifact)
 *   - Armature rotation: 90° X (Z-up → Y-up)
 *   - Mesh vertices in meters (~±0.9)
 *   - Bone translations in centimeters (~47)
 *   - IBMs with 100x scale factor to bridge the gap
 *
 * Fix: Scale mesh vertices by 100 and rotate by 90°X so they match
 * the bone centimeter space. Then remove the Armature's scale and rotation.
 * IBMs stay correct because they were computed for cm-space vertices.
 */

import { readFileSync, writeFileSync } from 'fs';

const src = 'public/models/PlutoRig_Mixamo.glb';
const dst = 'public/models/PlutoRig_Mixamo_v2.glb';

// ─── Parse GLB ──────────────────────────────────────────────────
const buf = readFileSync(src);
const magic = buf.readUInt32LE(0);
if (magic !== 0x46546C67) throw new Error('Not a GLB file');

const version = buf.readUInt32LE(4);
const totalLen = buf.readUInt32LE(8);

// JSON chunk
const jsonLen = buf.readUInt32LE(12);
const jsonType = buf.readUInt32LE(16);
const json = JSON.parse(buf.slice(20, 20 + jsonLen).toString('utf8'));

// Binary chunk
const binChunkStart = 20 + jsonLen;
const binLen = buf.readUInt32LE(binChunkStart);
const binType = buf.readUInt32LE(binChunkStart + 4);
const binData = Buffer.from(buf.slice(binChunkStart + 8, binChunkStart + 8 + binLen));

console.log(`GLB v${version}, JSON: ${jsonLen}B, Binary: ${binLen}B`);

// ─── Helper: Read accessor as Float32Array ──────────────────────
function readAccessorF32(accessorIdx) {
  const acc = json.accessors[accessorIdx];
  const view = json.bufferViews[acc.bufferView];
  const offset = (view.byteOffset || 0) + (acc.byteOffset || 0);
  const componentCount = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }[acc.type];
  const count = acc.count * componentCount;
  return new Float32Array(binData.buffer, binData.byteOffset + offset, count);
}

// ─── Get the Armature's rotation as a 3x3 matrix ───────────────
// Armature rotation: quaternion [0.707107, 0, 0, 0.707107] = 90° around X
// This rotates: (x, y, z) → (x, -z, y) ... wait let me compute properly.
// Quaternion (x,y,z,w) = (0.707, 0, 0, 0.707) → rotation of 90° around X axis
// R(90°X): (x, y, z) → (x, -z, y)
// Wait: for quat (x=0.707, y=0, z=0, w=0.707), the rotation matrix is:
// [1    0       0   ]
// [0  cos90  -sin90 ] = [1  0   0]
// [0  sin90   cos90 ]   [0  0  -1]
//                        [0  1   0]
// So (x,y,z) → (x, -z, y) ← WRONG
// Actually: (x,y,z) → (x, 1*y + 0*z, 0*y + 1*z) ...
// cos(90)=0, sin(90)=1
// R = [1, 0, 0; 0, 0, -1; 0, 1, 0]
// (x,y,z) → (x, -z, y)
//
// But glTF quaternion is stored as [x, y, z, w] in the node.

const armNode = json.nodes.find(n => n.name === 'Armature');
console.log(`Armature node: scale=${JSON.stringify(armNode.scale)}, rot=${JSON.stringify(armNode.rotation)}`);

// ─── Transform mesh vertex positions ────────���───────────────────
// Scale by 100 (meters → centimeters) AND rotate by the Armature's rotation
// so vertices end up in the same space as bones.
const meshPrim = json.meshes[0].primitives[0];
const posData = readAccessorF32(meshPrim.attributes.POSITION);
const normData = readAccessorF32(meshPrim.attributes.NORMAL);

console.log(`Vertices: ${posData.length / 3}, Normals: ${normData.length / 3}`);

// Before: check a few vertices
console.log(`Before - v0: (${posData[0].toFixed(4)}, ${posData[1].toFixed(4)}, ${posData[2].toFixed(4)})`);

// Apply: scale by 100, then rotate 90° around X: (x, y, z) → (x*100, -z*100, y*100)
for (let i = 0; i < posData.length; i += 3) {
  const x = posData[i], y = posData[i + 1], z = posData[i + 2];
  posData[i]     = x * 100;      // X stays
  posData[i + 1] = -z * 100;     // Y = -Z
  posData[i + 2] = y * 100;      // Z = Y
}

// Same rotation for normals (no scale needed for normals)
for (let i = 0; i < normData.length; i += 3) {
  const x = normData[i], y = normData[i + 1], z = normData[i + 2];
  normData[i]     = x;
  normData[i + 1] = -z;
  normData[i + 2] = y;
}

console.log(`After  - v0: (${posData[0].toFixed(4)}, ${posData[1].toFixed(4)}, ${posData[2].toFixed(4)})`);

// Update accessor min/max
const posAcc = json.accessors[meshPrim.attributes.POSITION];
let minP = [Infinity, Infinity, Infinity], maxP = [-Infinity, -Infinity, -Infinity];
for (let i = 0; i < posData.length; i += 3) {
  for (let j = 0; j < 3; j++) {
    minP[j] = Math.min(minP[j], posData[i + j]);
    maxP[j] = Math.max(maxP[j], posData[i + j]);
  }
}
posAcc.min = minP;
posAcc.max = maxP;
console.log(`New bbox: min=[${minP.map(v => v.toFixed(2))}], max=[${maxP.map(v => v.toFixed(2))}]`);

// ─── Also rotate bone translations by the Armature's rotation ───
// Bones had the Armature's rotation applied implicitly. Now that we're
// removing it from the Armature node, we need to bake it into each bone.
const skin = json.skins[0];
for (const jointIdx of skin.joints) {
  const node = json.nodes[jointIdx];
  if (node.translation) {
    const [x, y, z] = node.translation;
    node.translation = [x, -z, y]; // 90°X rotation
  }
  // Bone rotations need the armature rotation baked in too.
  // For the Hips (which had a -90°X rotation to compensate for the Armature's +90°X),
  // removing the Armature rotation means we don't need the compensating rotation either.
  // But for other bones, their local rotations should stay as-is since they're
  // relative to their parent (and the rotation cascades from the root).
  //
  // Actually, only the ROOT bone (Hips, child of Armature) needs the Armature's
  // rotation baked into its own rotation. Other bones are children of bones,
  // not of the Armature directly.
}

// Bake Armature rotation into Hips bone rotation
// Hips is a direct child of Armature, so it needs the Armature's rotation composed in.
// Armature rotation (as quat in glTF xyzw): [0.707107, 0, 0, 0.707107]
// Hips rotation: [-0.707107, 0, 0, 0.707107]
// New Hips rotation = armatureRot * hipsRot
const hipsIdx = skin.joints[0]; // First joint should be Hips
const hipsNode = json.nodes[hipsIdx];
console.log(`Hips before: rot=${JSON.stringify(hipsNode.rotation)}, trans=${JSON.stringify(hipsNode.translation)}`);

// Quaternion multiply: armRot * hipsRot
// armRot: x=0.707, y=0, z=0, w=0.707
// hipsRot: x=-0.707, y=0, z=0, w=0.707
// q1*q2: w=w1*w2-x1*x2-y1*y2-z1*z2, x=w1*x2+x1*w2+y1*z2-z1*y2, ...
function quatMul(a, b) {
  // a,b are [x,y,z,w]
  return [
    a[3]*b[0] + a[0]*b[3] + a[1]*b[2] - a[2]*b[1], // x
    a[3]*b[1] - a[0]*b[2] + a[1]*b[3] + a[2]*b[0], // y
    a[3]*b[2] + a[0]*b[1] - a[1]*b[0] + a[2]*b[3], // z
    a[3]*b[3] - a[0]*b[0] - a[1]*b[1] - a[2]*b[2], // w
  ];
}

const armRot = armNode.rotation || [0, 0, 0, 1]; // [x,y,z,w]
if (hipsNode.rotation) {
  hipsNode.rotation = quatMul(armRot, hipsNode.rotation);
  console.log(`Hips after:  rot=${JSON.stringify(hipsNode.rotation.map(v => +v.toFixed(6)))}, trans=${JSON.stringify(hipsNode.translation)}`);
}

// ─── Remove Armature's scale and rotation ───────────────────────
// Now that transforms are baked into vertex data and bone data,
// the Armature should be identity.
armNode.scale = [1, 1, 1];
armNode.rotation = [0, 0, 0, 1]; // Identity quaternion
console.log(`Armature set to identity scale and rotation`);

// ─── Write GLB ──────────────────────────────────────────────────
const newJson = JSON.stringify(json);
// Pad JSON to 4-byte boundary
const jsonBuf = Buffer.from(newJson, 'utf8');
const jsonPadLen = (4 - (jsonBuf.length % 4)) % 4;
const paddedJsonBuf = Buffer.concat([jsonBuf, Buffer.alloc(jsonPadLen, 0x20)]);

// GLB header (12 bytes) + JSON chunk header (8) + JSON + binary chunk header (8) + binary
const totalSize = 12 + 8 + paddedJsonBuf.length + 8 + binData.length;
const outBuf = Buffer.alloc(totalSize);

// Header
outBuf.writeUInt32LE(0x46546C67, 0); // magic "glTF"
outBuf.writeUInt32LE(2, 4);           // version
outBuf.writeUInt32LE(totalSize, 8);   // total length

// JSON chunk
outBuf.writeUInt32LE(paddedJsonBuf.length, 12);
outBuf.writeUInt32LE(0x4E4F534A, 16); // "JSON"
paddedJsonBuf.copy(outBuf, 20);

// Binary chunk
const binOffset = 20 + paddedJsonBuf.length;
outBuf.writeUInt32LE(binData.length, binOffset);
outBuf.writeUInt32LE(0x004E4942, binOffset + 4); // "BIN\0"
binData.copy(outBuf, binOffset + 8);

writeFileSync(dst, outBuf);
console.log(`\nWritten: ${dst} (${(outBuf.length / 1024 / 1024).toFixed(1)} MB)`);
