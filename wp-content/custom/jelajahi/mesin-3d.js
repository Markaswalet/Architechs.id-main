/*
 * Mesin 3D "Jelajahi Karya Studio Lentera".
 * Membangun kawasan maket berisi model karya, lalu menangani kamera, label, suasana (pagi–malam),
 * tampilan denah, tur otomatis, dan mode jalan. Dimuat oleh jelajahi.js saat seksi mendekati layar.
 *
 * Satuan meter. Sumbu: +x timur, -z utara, +y atas.
 *
 * vendor/three-orbit.min.js = three@0.186.0 + OrbitControls, dibundel dengan esbuild
 * (entri: `export * from 'three'; export { OrbitControls } from 'three/addons/controls/OrbitControls.js';`).
 */
import * as THREE from './vendor/three-orbit.min.js';

const { OrbitControls } = THREE;

const TINGGI_MATA = 1.6;
const BATAS_TARGET = { x: 140, z: 110 };
const BATAS_JALAN = { x: 104, z: 71 };
const DANAU = { x: 52, z: 38, rx: 18, rz: 10, muka: -0.35 };

/* ---------- Bilangan acak tetap (agar kawasan selalu sama) ---------- */
function acak(benih) {
  let a = benih >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pilihDari = (rng, daftar) => daftar[Math.floor(rng() * daftar.length)];

/* ---------- Geometri satuan (alas di y = 0, tinggi 1) ---------- */
function alasNol(g) {
  g.translate(0, 0.5, 0);
  return g;
}

// Prisma atap pelana / gergaji: penampang segitiga di bidang xy, memanjang di z.
function geomPrisma(puncakX) {
  const s = new THREE.Shape();
  s.moveTo(-0.5, 0);
  s.lineTo(0.5, 0);
  s.lineTo(puncakX, 1);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: 1, bevelEnabled: false });
  g.translate(0, 0, -0.5);
  return g;
}

// Atap limas dengan bubungan sepanjang x (setengah panjang bubungan = r).
function geomLimas(r) {
  const A = [-0.5, 0, -0.5], B = [0.5, 0, -0.5], C = [0.5, 0, 0.5], D = [-0.5, 0, 0.5];
  const R1 = [-r, 1, 0], R2 = [r, 1, 0];
  const segitiga = [D, C, R2, D, R2, R1, B, A, R1, B, R1, R2, C, B, R2, A, D, R1, A, B, C, A, C, D];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(segitiga.flat(), 3));
  g.computeVertexNormals();
  return g;
}

const G = {
  kotak: alasNol(new THREE.BoxGeometry(1, 1, 1)),
  silinder: alasNol(new THREE.CylinderGeometry(0.5, 0.5, 1, 20)),
  silinder6: alasNol(new THREE.CylinderGeometry(0.5, 0.5, 1, 6)),
  kerucut: alasNol(new THREE.ConeGeometry(0.5, 1, 12)),
  ico: alasNol(new THREE.IcosahedronGeometry(0.5, 1)),
  ico0: alasNol(new THREE.IcosahedronGeometry(0.5, 0)),
  bola: alasNol(new THREE.SphereGeometry(0.5, 20, 14)),
  kubah: new THREE.SphereGeometry(0.5, 40, 16, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 2, 1),
  prisma: geomPrisma(0),
  gergaji: geomPrisma(-0.5),
  limas: geomLimas(0.22),
  piramida: geomLimas(0),
};

/* ---------- Perakit: mengumpulkan bentuk berulang menjadi InstancedMesh ---------- */
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _w = new THREE.Color();

class Perakit {
  constructor() {
    this.kelompok = new Map();
    this.dasar = new THREE.Matrix4();
  }

  // Menjalankan `isi` dengan titik asal digeser ke (x, y, z) dan diputar ry.
  bingkai(x, y, z, ry, isi) {
    const lama = this.dasar;
    _q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, ry);
    this.dasar = lama.clone().multiply(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), _q.clone(), new THREE.Vector3(1, 1, 1)));
    isi();
    this.dasar = lama;
  }

  tambah(bentuk, mat, sx, sy, sz, x, y, z, o = {}) {
    const kunci = bentuk + '|' + mat.uuid;
    let k = this.kelompok.get(kunci);
    if (!k) {
      k = { bentuk, mat, matriks: [], warna: [], adaWarna: false };
      this.kelompok.set(kunci, k);
    }
    _e.set(o.rx || 0, o.ry || 0, o.rz || 0, 'YXZ');
    _q.setFromEuler(_e);
    _m.compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz));
    k.matriks.push(this.dasar.clone().multiply(_m));
    k.warna.push(o.warna ?? null);
    if (o.warna != null) k.adaWarna = true;
  }

  kotak(mat, w, h, d, x, y, z, o) {
    this.tambah('kotak', mat, w, h, d, x, y, z, o);
  }

  pasang(induk, { bayangan = true, terima = true } = {}) {
    const hasil = [];
    for (const k of this.kelompok.values()) {
      const mesh = new THREE.InstancedMesh(G[k.bentuk], k.mat, k.matriks.length);
      k.matriks.forEach((mx, i) => mesh.setMatrixAt(i, mx));
      if (k.adaWarna) k.warna.forEach((wr, i) => mesh.setColorAt(i, _w.set(wr ?? 0xffffff)));
      mesh.castShadow = bayangan && !k.mat.userData.tanpaBayangan;
      mesh.receiveShadow = terima;
      mesh.computeBoundingBox();
      mesh.computeBoundingSphere();
      induk.add(mesh);
      hasil.push(mesh);
    }
    this.kelompok.clear();
    return hasil;
  }
}

/* ---------- Material ---------- */
function buatMaterial() {
  const std = (warna, kasar = 0.85, logam = 0, ekstra = {}) =>
    new THREE.MeshStandardMaterial({ color: warna, roughness: kasar, metalness: logam, ...ekstra });
  const kaca = (kuat) => {
    const m = std(0x8ea7b6, 0.08, 0.85, { emissive: 0xffc27a, emissiveIntensity: 0 });
    m.userData.kuatNyala = kuat;
    return m;
  };
  const M = {
    putih: std(0xf1ece3, 0.82),
    krem: std(0xe3d6c1, 0.9),
    beton: std(0xbfbab1, 0.95),
    betonGelap: std(0x8e8a83, 0.95),
    gelap: std(0x353a40, 0.55, 0.25),
    logam: std(0xd3d8dc, 0.5, 0.3),
    baja: std(0x5b636b, 0.4, 0.6),
    kayu: std(0xb07a4c, 0.7),
    kayuGelap: std(0x6b4a32, 0.8),
    genteng: std(0xa65a3c, 0.85),
    kaca: kaca(1),
    kacaRedup: kaca(0.22),
    kacaMobil: std(0x26303a, 0.15, 0.6),
    panel: std(0x22324f, 0.28, 0.6),
    kubah: std(0x2c7a72, 0.35, 0.4),
    emas: std(0xd4a73c, 0.3, 0.9),
    rumput: std(0x8cb365, 1),
    rumputLuar: std(0x7a9f57, 1),
    paving: std(0xd8cfbf, 0.95),
    pavingPlaza: std(0xcbbda6, 0.95),
    aspal: std(0x55595e, 0.95),
    marka: std(0xf2efe6, 0.8),
    air: std(0x2f7d99, 0.05, 0.6),
    airKolam: std(0x4fc0db, 0.05, 0.2, { emissive: 0x1aa0c8, emissiveIntensity: 0 }),
    batu: std(0x9b958a, 0.95),
    daun: std(0xffffff, 0.9),
    batang: std(0x6d5038, 0.9),
    varian: std(0xffffff, 0.6),
    lampu: std(0xfff1d6, 0.4, 0, { emissive: 0xffd28a, emissiveIntensity: 0.2 }),
    lentera: std(0xf6e2b8, 0.6, 0, { emissive: 0xffb347, emissiveIntensity: 0.25 }),
    hantu: std(0xffffff, 1, 0, { transparent: true, opacity: 0.16, depthWrite: false }),
  };
  M.lampu.userData.tanpaBayangan = true;
  M.hantu.userData.tanpaBayangan = true;
  return M;
}

/* ---------- Model karya dari berkas GLB ----------
 * Berkas disiapkan dari ekspor SketchUp/Enscape: interior dan tanaman dibuang, satu mesh per peran
 * material, posisi int16 ternormalisasi (KHR_mesh_quantization) dengan skala dan geser di node,
 * tanpa tekstur dan normal. Peran bertanda `materialMesin` (kaca, rumput, ...) memakai material
 * kawasan agar ikut menyala di malam hari; peran lain memakai warna dari berkas.
 */
const TIPE_KOMPONEN = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };
const JUMLAH_KOMPONEN = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };

function materialDari(def) {
  const pbr = def.pbrMetallicRoughness || {};
  const [r, g, b, a] = pbr.baseColorFactor || [1, 1, 1, 1];
  const m = new THREE.MeshStandardMaterial({
    color: new THREE.Color().setRGB(r, g, b, THREE.LinearSRGBColorSpace),
    roughness: pbr.roughnessFactor ?? 1,
    metalness: pbr.metallicFactor ?? 0,
    side: def.doubleSided ? THREE.DoubleSide : THREE.FrontSide,
  });
  if (def.alphaMode === 'BLEND') {
    Object.assign(m, { transparent: true, opacity: a, depthWrite: false });
    m.userData.tanpaBayangan = true;
  }
  return m;
}

async function muatModel(url, M) {
  const respons = await fetch(url);
  if (!respons.ok) throw new Error(`${url}: HTTP ${respons.status}`);
  const buf = await respons.arrayBuffer();
  const dv = new DataView(buf);
  if (dv.getUint32(0, true) !== 0x46546c67) throw new Error(`${url}: bukan berkas GLB`);
  const panjangJson = dv.getUint32(12, true);
  const gltf = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 20, panjangJson)));
  const awalBin = 28 + panjangJson;
  const atribut = (i) => {
    const a = gltf.accessors[i];
    const bv = gltf.bufferViews[a.bufferView];
    const Tipe = TIPE_KOMPONEN[a.componentType];
    const k = JUMLAH_KOMPONEN[a.type];
    const langkah = bv.byteStride ? bv.byteStride / Tipe.BYTES_PER_ELEMENT : k;
    const sumber = new Tipe(buf, awalBin + (bv.byteOffset || 0) + (a.byteOffset || 0), (a.count - 1) * langkah + k);
    let isi = sumber;
    if (langkah !== k) {
      isi = new Tipe(a.count * k);
      for (let v = 0; v < a.count; v++) for (let c = 0; c < k; c++) isi[v * k + c] = sumber[v * langkah + c];
    }
    return new THREE.BufferAttribute(isi, k, !!a.normalized);
  };
  const grup = new THREE.Group();
  for (const node of gltf.nodes) {
    const prim = gltf.meshes[node.mesh].primitives[0];
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', atribut(prim.attributes.POSITION));
    geo.setIndex(atribut(prim.indices));
    geo.computeVertexNormals();
    const def = gltf.materials[prim.material];
    const mat = (def.extras?.materialMesin && M[def.extras.peran]) || materialDari(def);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = node.name || '';
    mesh.position.fromArray(node.translation || [0, 0, 0]);
    if (node.scale) mesh.scale.fromArray(node.scale);
    mesh.castShadow = !mat.userData.tanpaBayangan;
    mesh.receiveShadow = true;
    grup.add(mesh);
  }
  return grup;
}

/* ---------- Langit (gradasi + cahaya matahari) ---------- */
function buatMaterialLangit() {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uAtas: { value: new THREE.Color() },
      uCakrawala: { value: new THREE.Color() },
      uBawah: { value: new THREE.Color() },
      uMatahari: { value: new THREE.Vector3(0, 1, 0) },
      uWarnaMatahari: { value: new THREE.Color() },
      uKuatMatahari: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vArah;
      void main() {
        vArah = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uAtas; uniform vec3 uCakrawala; uniform vec3 uBawah;
      uniform vec3 uMatahari; uniform vec3 uWarnaMatahari; uniform float uKuatMatahari;
      varying vec3 vArah;
      void main() {
        float h = vArah.y;
        vec3 warna = h > 0.0 ? mix(uCakrawala, uAtas, pow(clamp(h, 0.0, 1.0), 0.55)) : mix(uCakrawala, uBawah, clamp(-h * 5.0, 0.0, 1.0));
        float m = max(dot(vArah, normalize(uMatahari)), 0.0);
        warna += uWarnaMatahari * (pow(m, 900.0) * 6.0 + pow(m, 12.0) * 0.35) * uKuatMatahari;
        gl_FragColor = vec4(warna, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

/* ---------- Suasana ---------- */
const SUASANA = {
  pagi: {
    azimut: 78, elevasi: 20, warnaMatahari: 0xffd9ac, kuatMatahari: 2.7,
    atas: 0x6fa6dd, cakrawala: 0xf2d8bb, bawah: 0xb9c2b0,
    hemiLangit: 0xd6e6ff, hemiTanah: 0x8c7b5c, kuatHemi: 0.75, kuatEnv: 0.55,
    eksposur: 1.0, jendela: 0.05, lampu: 0, bintang: 0, sinar: 1,
  },
  siang: {
    azimut: 25, elevasi: 66, warnaMatahari: 0xfff4e4, kuatMatahari: 3.1,
    atas: 0x3c7fd0, cakrawala: 0xc9e0f2, bawah: 0xb7c2b3,
    hemiLangit: 0xdfeaff, hemiTanah: 0x8a7d62, kuatHemi: 0.7, kuatEnv: 0.6,
    eksposur: 1.0, jendela: 0, lampu: 0, bintang: 0, sinar: 1,
  },
  sore: {
    azimut: 288, elevasi: 13, warnaMatahari: 0xffa760, kuatMatahari: 2.6,
    atas: 0x4f67a8, cakrawala: 0xffb27c, bawah: 0xa79a8a,
    hemiLangit: 0xffd2b0, hemiTanah: 0x6e5a48, kuatHemi: 0.62, kuatEnv: 0.5,
    eksposur: 1.0, jendela: 0.55, lampu: 0.45, bintang: 0, sinar: 1,
  },
  malam: {
    azimut: 140, elevasi: 38, warnaMatahari: 0xa9bdf5, kuatMatahari: 0.95,
    atas: 0x070d22, cakrawala: 0x22325a, bawah: 0x111726,
    hemiLangit: 0x50639a, hemiTanah: 0x221d18, kuatHemi: 1.0, kuatEnv: 0.55,
    eksposur: 1.2, jendela: 1.8, lampu: 2.4, bintang: 1, sinar: 0,
  },
};

export function suasanaOtomatis(waktu = new Date()) {
  const jam = (waktu.getUTCHours() + 7 + waktu.getUTCMinutes() / 60) % 24; // WIB
  if (jam >= 5 && jam < 9) return 'pagi';
  if (jam >= 9 && jam < 15) return 'siang';
  if (jam >= 15 && jam < 18) return 'sore';
  return 'malam';
}

function arahDariAzimut(azimutDeg, elevasiDeg, keluar = new THREE.Vector3()) {
  const a = THREE.MathUtils.degToRad(azimutDeg);
  const e = THREE.MathUtils.degToRad(elevasiDeg);
  return keluar.set(Math.sin(a) * Math.cos(e), Math.sin(e), -Math.cos(a) * Math.cos(e));
}

/* ============================================================
 * Model karya. Koordinat lokal: depan bangunan menghadap +z.
 * Setiap fungsi menerima Perakit `p` (bagian bangunan) dan `pj`
 * (permukaan yang bisa dijalani), lalu boleh menambah mesh unik ke `grup`.
 * ============================================================ */

function pohon(p, M, x, z, skala, rng, jenis = 'bulat', y = 0) {
  const s = skala;
  const daun = pilihDari(rng, ['#5f8f45', '#6f9c4c', '#4f7f3e', '#7aa653', '#58884a', '#668f3f']);
  if (jenis === 'palem') {
    const tinggi = 6 * s;
    const condong = (rng() - 0.5) * 0.18;
    p.tambah('silinder6', M.batang, 0.32 * s, tinggi, 0.32 * s, x, y, z, { rz: condong });
    const puncakX = x - Math.sin(condong) * tinggi;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + rng() * 0.3;
      p.kotak(M.daun, 0.55 * s, 0.07, 3.0 * s, puncakX + Math.sin(a) * 1.3 * s, y + tinggi - 0.5 * s, z + Math.cos(a) * 1.3 * s, {
        ry: a, rx: 0.42, warna: daun,
      });
    }
    return;
  }
  p.tambah('silinder6', M.batang, 0.32 * s, 2.3 * s, 0.32 * s, x, y, z);
  if (jenis === 'kerucut') {
    p.tambah('kerucut', M.daun, 2.6 * s, 5.2 * s, 2.6 * s, x, y + 1.4 * s, z, { warna: daun });
  } else {
    const lebar = (3.4 + rng() * 0.8) * s;
    p.tambah('ico', M.daun, lebar, 3.2 * s, lebar, x, y + 1.7 * s, z, { ry: rng() * 3, warna: daun });
    p.tambah('ico', M.daun, lebar * 0.62, 2.2 * s, lebar * 0.62, x + 0.5 * s, y + 3.6 * s, z - 0.3 * s, { ry: rng() * 3, warna: daun });
  }
}

function semak(p, M, x, z, w, rng, y = 0) {
  const warna = pilihDari(rng, ['#5c8a43', '#6a9a4a', '#4e7a3a', '#77a655']);
  p.tambah('ico', M.daun, w, w * 0.7, w, x, y, z, { ry: rng() * 3, warna });
}

function mobil(p, M, x, z, ry, warna, y = 0) {
  p.bingkai(x, y, z, ry, () => {
    p.kotak(M.varian, 1.8, 0.72, 4.3, 0, 0.3, 0, { warna });
    p.kotak(M.kacaMobil, 1.6, 0.58, 2.2, 0, 1.0, -0.25);
    for (const [wx, wz] of [[-0.82, 1.35], [0.82, 1.35], [-0.82, -1.35], [0.82, -1.35]]) p.kotak(M.gelap, 0.28, 0.62, 0.62, wx, 0, wz);
  });
}

const WARNA_MOBIL = ['#d9d9d9', '#2b2f36', '#b23a3a', '#f0f0f0', '#3a5f9f', '#8a8f96', '#c9a66b', '#ececec'];

function paviliunLentera(p, pj, M) {
  const t0 = 0.5;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.kotak(M.kayuGelap, 0.45, 5.6, 0.45, sx * 3.7, t0, sz * 3.7);
  // Balok keliling
  p.kotak(M.kayuGelap, 8, 0.4, 0.4, 0, t0 + 5.6, 3.7);
  p.kotak(M.kayuGelap, 8, 0.4, 0.4, 0, t0 + 5.6, -3.7);
  p.kotak(M.kayuGelap, 0.4, 0.4, 8, 3.7, t0 + 5.6, 0);
  p.kotak(M.kayuGelap, 0.4, 0.4, 8, -3.7, t0 + 5.6, 0);
  // Kisi kayu vertikal di keempat sisi, sisakan bukaan pintu di depan
  for (let i = -3.3; i <= 3.31; i += 0.42) {
    if (Math.abs(i) > 1.1) p.kotak(M.kayu, 0.12, 5.1, 0.22, i, t0 + 0.3, 3.75);
    p.kotak(M.kayu, 0.12, 5.1, 0.22, i, t0 + 0.3, -3.75);
    p.kotak(M.kayu, 0.22, 5.1, 0.12, 3.75, t0 + 0.3, i);
    p.kotak(M.kayu, 0.22, 5.1, 0.12, -3.75, t0 + 0.3, i);
  }
  p.kotak(M.lentera, 4.4, 4.8, 4.4, 0, t0, 0);
  p.tambah('piramida', M.gelap, 10.2, 2.8, 10.2, 0, t0 + 6.0, 0);
  p.tambah('silinder', M.emas, 0.35, 1.4, 0.35, 0, t0 + 8.7, 0);
  p.tambah('bola', M.lampu, 0.7, 0.7, 0.7, 0, t0 + 9.9, 0);
  pj.tambah('silinder', M.beton, 13, 0.5, 13, 0, 0, 0);
  return { tinggi: 10.5 };
}

// Kasang House (Mojokerto): bangunan dari model/kasang-house.glb, lahan 5 x 21 m berpusat di titik asal.
// Fungsi ini hanya menata taman di sisi lahan, dan membuat massa sederhana bila model gagal dimuat.
function kasangHouse(p, pj, M, rng, adaModel) {
  if (!adaModel) {
    p.kotak(M.beton, 5.1, 3.0, 17.4, 0, 0, -1.9);
    p.tambah('prisma', M.gelap, 4.2, 1.7, 17.6, -0.4, 3.0, -1.9);
    p.kotak(M.gelap, 5.1, 0.12, 3.5, 0, 2.6, 8.8);
  }
  // Sisi barat kavling yang lapang (x lokal positif) menjadi taman, sisi timur sempit diberi semak
  for (let z = -9; z <= 9; z += 1.5) semak(p, M, 3.4, z + rng() * 0.6, 0.7 + rng() * 0.4, rng);
  for (let z = -8; z <= 8; z += 2) semak(p, M, -3.6, z + rng() * 0.6, 0.6 + rng() * 0.3, rng);
  pohon(p, M, 7, 6.5, 1.0, rng);
  pohon(p, M, 12.5, 1, 1.15, rng);
  pohon(p, M, 8.5, -6, 0.95, rng, 'kerucut');
  pohon(p, M, 15, -9.5, 1.05, rng);
  pohon(p, M, 15.5, 8, 0.9, rng, 'kerucut');
  for (let i = 0; i < 6; i++) semak(p, M, 6 + rng() * 10, -12 + rng() * 22, 0.8 + rng() * 0.6, rng);
  return { tinggi: 4.9 };
}

function rumahSplitLevel(p, pj, M, rng) {
  // Teras tanah berundak mengikuti kontur (naik ke belakang)
  p.kotak(M.beton, 20, 1.5, 6.5, 0, 0, -0.75);
  pj.kotak(M.rumput, 19.6, 0.06, 6.1, 0, 1.5, -0.75);
  p.kotak(M.beton, 20, 3.0, 9, 0, 0, -8.5);
  pj.kotak(M.rumput, 19.6, 0.06, 8.6, 0, 3.0, -8.5);
  pj.kotak(M.paving, 4.2, 0.08, 9, -6.5, 0, 7.5);
  // Tangga taman di sisi timur
  for (let i = 0; i < 3; i++) pj.kotak(M.beton, 1.8, 0.5 * (i + 1), 0.6, 8.7, 0, 3.6 - i * 0.6);
  for (let i = 0; i < 3; i++) pj.kotak(M.beton, 1.8, 1.5 + 0.5 * (i + 1), 0.6, 8.7, 0, -3.6 - i * 0.6);
  // Massa 1 (lantai dasar, setengah tertanam)
  p.kotak(M.putih, 10, 3.2, 7, -1, 0, 3);
  p.kotak(M.kaca, 5.8, 2.4, 0.1, 0.4, 0.4, 6.53);
  p.kotak(M.gelap, 3.2, 2.6, 0.1, -4.4, 0, 6.53);
  p.kotak(M.putih, 10.2, 0.2, 7.2, -1, 3.2, 3);
  p.kotak(M.kaca, 10, 1.0, 0.06, -1, 3.4, 6.55, {});
  // Massa 2 (naik setengah lantai, dua lantai)
  p.kotak(M.putih, 11, 6.0, 7, 0.5, 1.5, -2.5);
  p.kotak(M.kaca, 7.6, 4.8, 0.1, -1.2, 2.2, 1.03);
  p.kotak(M.kayu, 2.6, 6.0, 0.14, 4.5, 1.5, 1.05);
  p.kotak(M.kacaRedup, 0.1, 2.0, 4, 6.03, 4.8, -2.5);
  p.kotak(M.gelap, 12, 0.25, 8.2, 0.5, 8.05, -2.2, { rx: 0.14 });
  // Massa 3 (paling atas, atap berlawanan arah)
  p.kotak(M.krem, 9, 3.4, 6, 1.5, 3.0, -9.5);
  p.kotak(M.kaca, 6.5, 1.8, 0.1, 1, 4.0, -6.47);
  p.kotak(M.gelap, 10, 0.25, 7.2, 1.5, 7.0, -9.6, { rx: -0.14 });
  mobil(p, M, -6.5, 8.2, Math.PI, '#3a5f9f', 0.08);
  pohon(p, M, 6.5, 8, 1, rng);
  pohon(p, M, -7.5, -10.5, 0.9, rng, 'bulat', 3.0);
  pohon(p, M, 7.5, -1.5, 0.8, rng, 'kerucut', 1.5);
  for (let i = 0; i < 7; i++) semak(p, M, -8 + rng() * 16, 1.6 + rng() * 0.4, 0.7 + rng() * 0.5, rng, 1.4);
  return { tinggi: 9.5 };
}

function villaTepiDanau(p, pj, M, rng) {
  pj.kotak(M.kayu, 22, 0.5, 9, 0, 0, 5.5);
  pj.kotak(M.kayu, 3, 0.4, 6.5, -6, 0, 13);
  // Kolam renang dengan bibir putih
  p.kotak(M.airKolam, 12, 0.53, 3.8, -1.5, 0, 6.6);
  p.kotak(M.putih, 12.6, 0.56, 0.3, -1.5, 0, 4.55);
  p.kotak(M.putih, 12.6, 0.56, 0.3, -1.5, 0, 8.65);
  p.kotak(M.putih, 0.3, 0.56, 4.4, -7.65, 0, 6.6);
  p.kotak(M.putih, 0.3, 0.56, 4.4, 4.65, 0, 6.6);
  for (let i = 0; i < 3; i++) {
    p.kotak(M.putih, 0.75, 0.32, 1.9, 6.8 + i * 1.2, 0.5, 6.6);
    p.kotak(M.putih, 0.75, 0.55, 0.12, 6.8 + i * 1.2, 0.75, 5.75, { rx: -0.9 });
  }
  // Massa utama: ruang keluarga berdinding kaca
  p.kotak(M.putih, 14, 3.4, 7, -1, 0.5, -3);
  p.kotak(M.kaca, 13.2, 3.0, 0.1, -1, 0.6, 0.52);
  p.kotak(M.batu, 0.7, 3.4, 9, -8.4, 0.5, -2.6);
  p.kotak(M.putih, 17.5, 0.45, 10.2, -0.8, 3.9, -2.4);
  // Massa atas berlapis kayu
  p.kotak(M.kayu, 8, 3, 7, 3.5, 4.35, -4);
  p.kotak(M.kaca, 6.4, 2.2, 0.1, 3.5, 4.75, -0.47);
  p.kotak(M.putih, 10, 0.4, 8.6, 3.5, 7.35, -3.6);
  for (const [x, z] of [[-10, 9.5], [10.5, 9], [-10.5, -7], [10.5, -6.5]]) pohon(p, M, x, z, 0.95, rng, 'palem');
  for (let i = 0; i < 6; i++) semak(p, M, -10 + rng() * 20, -8 + rng() * 1.5, 0.8 + rng() * 0.5, rng);
  return { tinggi: 8 };
}

function masjid(p, pj, M, rng) {
  pj.kotak(M.beton, 24, 0.6, 28, 0, 0, 1);
  for (let i = 0; i < 3; i++) pj.kotak(M.beton, 8, 0.2 * (i + 1), 0.5, 0, 0, 16.25 - i * 0.5);
  const t0 = 0.6;
  // Ruang salat dan mihrab
  p.kotak(M.putih, 18, 6.5, 16, 0, t0, -5);
  p.kotak(M.putih, 4, 5, 1.6, 0, t0, -13.8);
  p.kotak(M.gelap, 18.4, 0.35, 16.4, 0, t0 + 6.5, -5);
  for (let i = -3; i <= 3; i++) {
    p.kotak(M.kacaRedup, 0.1, 3.8, 1.1, 9.03, t0 + 1.4, -5 + i * 2.1);
    p.kotak(M.kacaRedup, 0.1, 3.8, 1.1, -9.03, t0 + 1.4, -5 + i * 2.1);
  }
  for (let i = -3; i <= 3; i++) if (i !== 0) p.kotak(M.kacaRedup, 1.1, 3.8, 0.1, i * 2.3, t0 + 1.4, 3.03);
  p.kotak(M.kayuGelap, 2.4, 3.6, 0.12, 0, t0, 3.04);
  // Drum, kubah, dan mustaka
  p.tambah('silinder', M.putih, 11, 1.6, 11, 0, t0 + 6.85, -5);
  p.tambah('kubah', M.kubah, 11.4, 6, 11.4, 0, t0 + 8.45, -5);
  p.tambah('silinder', M.emas, 0.3, 1.4, 0.3, 0, t0 + 14.4, -5);
  p.tambah('bola', M.emas, 0.7, 0.7, 0.7, 0, t0 + 15.6, -5);
  // Serambi bertiang
  for (let x = -8.4; x <= 8.41; x += 2.4) p.kotak(M.putih, 0.6, 4.6, 0.6, x, t0, 5.9);
  p.kotak(M.putih, 18.6, 0.6, 3.6, 0, t0 + 4.6, 4.6);
  // Pelataran dan kolam wudu
  pj.kotak(M.paving, 22, 0.06, 7.5, 0, t0, 10.7);
  p.kotak(M.putih, 8.4, 0.4, 2.8, 0, t0, 10.6);
  p.kotak(M.airKolam, 7.8, 0.42, 2.2, 0, t0, 10.6);
  // Menara
  p.kotak(M.putih, 2.4, 19, 2.4, 9.6, t0, 12.4);
  p.kotak(M.kubah, 2.8, 0.4, 2.8, 9.6, t0 + 13, 12.4);
  p.kotak(M.putih, 3.4, 0.4, 3.4, 9.6, t0 + 16.4, 12.4);
  p.kotak(M.kacaRedup, 2.6, 1.6, 2.6, 9.6, t0 + 16.8, 12.4);
  p.kotak(M.putih, 3.4, 0.3, 3.4, 9.6, t0 + 18.4, 12.4);
  p.tambah('kubah', M.kubah, 2.4, 1.8, 2.4, 9.6, t0 + 18.7, 12.4);
  p.tambah('silinder', M.emas, 0.15, 1.2, 0.15, 9.6, t0 + 20.4, 12.4);
  pohon(p, M, -10.5, 12, 0.9, rng);
  pohon(p, M, -10.5, -12, 1, rng);
  pohon(p, M, 10.5, -12, 0.9, rng, 'kerucut');
  return { tinggi: 22 };
}

function kantor(p, pj, M, rng) {
  const T = 3.8;
  const dasar = 4.4;
  const atap = dasar + T * 5;
  // Lobi transparan dan inti kaca
  p.kotak(M.kaca, 19.5, dasar, 13.5, 0, 0, 0);
  for (const [x, z] of [[-10.6, 7.6], [10.6, 7.6], [-10.6, -7.6], [10.6, -7.6]]) p.kotak(M.putih, 0.8, dasar, 0.8, x, 0, z);
  p.kotak(M.kaca, 21, T * 5, 15, 0, dasar, 0);
  for (let i = 0; i <= 5; i++) p.kotak(M.putih, 22.6, 0.5, 16.6, 0, dasar + i * T - 0.25, 0);
  // Sirip vertikal
  for (let x = -10.4; x <= 10.41; x += 1.6) {
    p.kotak(M.putih, 0.18, T * 5, 1.0, x, dasar, 8.0);
    p.kotak(M.putih, 0.18, T * 5, 1.0, x, dasar, -8.0);
  }
  for (let z = -6.4; z <= 6.41; z += 1.6) {
    p.kotak(M.putih, 1.0, T * 5, 0.18, 11, dasar, z);
    p.kotak(M.putih, 1.0, T * 5, 0.18, -11, dasar, z);
  }
  // Taman atap
  p.kotak(M.putih, 22.6, 1.1, 0.3, 0, atap, 8.15);
  p.kotak(M.putih, 22.6, 1.1, 0.3, 0, atap, -8.15);
  p.kotak(M.putih, 0.3, 1.1, 16.6, 11.15, atap, 0);
  p.kotak(M.putih, 0.3, 1.1, 16.6, -11.15, atap, 0);
  p.kotak(M.rumput, 9, 0.45, 6, -5, atap, 3);
  p.kotak(M.rumput, 7, 0.45, 5, 6, atap, -4);
  p.kotak(M.kayu, 8, 0.2, 4, 5.5, atap, 3.5);
  p.kotak(M.gelap, 4, 2.6, 3.2, -6, atap, -4.5);
  for (let x = 2; x <= 9; x += 1.4) p.kotak(M.kayu, 0.15, 0.15, 4.2, x, atap + 2.8, 3.5);
  for (const [x, z] of [[2, 1.6], [9, 1.6], [2, 5.4], [9, 5.4]]) p.kotak(M.kayu, 0.15, 2.8, 0.15, x, atap, z);
  pohon(p, M, -7.5, 2.5, 0.55, rng, 'bulat', atap + 0.45);
  pohon(p, M, -2.5, 4, 0.5, rng, 'bulat', atap + 0.45);
  pohon(p, M, 7.5, -4, 0.5, rng, 'bulat', atap + 0.45);
  // Kanopi masuk dan parkir
  p.kotak(M.putih, 6.5, 0.3, 3.4, 0, dasar - 0.4, 9.4);
  p.kotak(M.baja, 0.15, dasar - 0.4, 0.15, -3, 0, 10.9);
  p.kotak(M.baja, 0.15, dasar - 0.4, 0.15, 3, 0, 10.9);
  pj.kotak(M.aspal, 23, 0.05, 10, 0, 0, 15);
  for (let i = 0; i < 9; i++) {
    p.kotak(M.marka, 0.12, 0.06, 4.6, -10 + i * 2.5, 0, 17.4);
    if (i < 8 && rng() < 0.75) mobil(p, M, -8.75 + i * 2.5, 17.4, Math.PI * (rng() < 0.5 ? 0 : 1), pilihDari(rng, WARNA_MOBIL), 0.05);
  }
  return { tinggi: atap + 3 };
}

function hotel(p, pj, M, rng) {
  const tinggiPodium = 8;
  const lantai = 10;
  const T = 3.2;
  const puncak = tinggiPodium + lantai * T;
  // Podium
  p.kotak(M.putih, 28, tinggiPodium, 20, 0, 0, 0);
  p.kotak(M.kaca, 25, 3.4, 0.1, 0, 0.3, 10.03);
  p.kotak(M.kacaRedup, 25, 2.0, 0.1, 0, 4.9, 10.03);
  p.kotak(M.kacaRedup, 0.1, 2.0, 17, 14.03, 4.9, 0);
  p.kotak(M.kacaRedup, 0.1, 2.0, 17, -14.03, 4.9, 0);
  // Kanopi penurunan tamu
  p.kotak(M.putih, 12, 0.45, 7, 0, 4.2, 13.5);
  for (const x of [-5.2, 5.2]) for (const z of [12.2, 16.2]) p.kotak(M.baja, 0.25, 4.2, 0.25, x, 0, z);
  pj.kotak(M.aspal, 18, 0.05, 9, 0, 0, 14.5);
  mobil(p, M, -2, 14.2, Math.PI / 2, '#2b2f36', 0.05);
  // Menara kamar dengan balkon
  p.kotak(M.krem, 18, lantai * T, 12, -3, tinggiPodium, -2);
  for (let i = 0; i < lantai; i++) {
    const y = tinggiPodium + i * T;
    p.kotak(i % 3 === 1 ? M.kacaRedup : M.kaca, 17, 2.3, 0.08, -3, y + 0.5, 4.04);
    p.kotak(M.kacaRedup, 17, 2.3, 0.08, -3, y + 0.5, -8.04);
    p.kotak(M.kaca, 0.08, 2.3, 10, 6.04, y + 0.5, -2);
    if (i > 0) {
      p.kotak(M.putih, 18.4, 0.22, 1.5, -3, y, 4.75);
      p.kotak(M.kacaRedup, 18.2, 1.0, 0.05, -3, y + 0.22, 5.45);
      p.kotak(M.putih, 18.4, 0.22, 1.5, -3, y, -8.75);
    }
  }
  p.kotak(M.gelap, 18.6, 1.6, 12.6, -3, puncak, -2);
  p.kotak(M.gelap, 6, 2.4, 4, -3, puncak + 1.6, -2);
  // Kolam renang di atap podium
  p.kotak(M.kayu, 7.4, 0.25, 17, 9.9, tinggiPodium, -0.5);
  p.kotak(M.airKolam, 4.2, 0.3, 11, 10.2, tinggiPodium + 0.05, -1);
  for (let i = 0; i < 3; i++) {
    const z = -5 + i * 4;
    p.tambah('silinder', M.logam, 0.08, 2.3, 0.08, 7.3, tinggiPodium + 0.25, z);
    p.tambah('kerucut', M.varian, 2.4, 0.6, 2.4, 7.3, tinggiPodium + 2.2, z, { warna: '#f3efe6' });
  }
  pohon(p, M, 13, 15, 0.9, rng);
  pohon(p, M, -13, 15, 0.9, rng);
  return { tinggi: puncak + 4 };
}

function cafe(p, pj, M, rng) {
  pj.kotak(M.beton, 18, 0.4, 12, 0, 0, 0);
  const t0 = 0.4;
  p.kotak(M.beton, 16.4, 4.4, 0.4, 0, t0, -4.8);
  p.kotak(M.beton, 0.4, 4.4, 9.6, -8, t0, 0);
  p.kotak(M.beton, 0.4, 4.4, 9.6, 8, t0, 0);
  p.kotak(M.krem, 15.4, 0.1, 9, 0, t0, 0);
  p.kotak(M.kaca, 15.6, 3.9, 0.1, 0, t0, 4.6);
  for (let x = -7.8; x <= 7.81; x += 1.95) p.kotak(M.gelap, 0.14, 4.0, 0.2, x, t0, 4.68);
  p.kotak(M.gelap, 16.6, 0.4, 0.3, 0, t0 + 4.0, 4.68);
  p.kotak(M.gelap, 18.4, 0.35, 12.4, 0, t0 + 4.4, 0.4);
  p.kotak(M.kaca, 6, 0.9, 2.2, -2, t0 + 4.75, -0.5);
  // Teras dek dan pergola kayu
  pj.kotak(M.kayu, 18, 0.35, 9, 0, 0, 10.5);
  for (const x of [-8, -3.2, 1.6]) for (const z of [6.8, 14.2]) p.kotak(M.kayuGelap, 0.25, 3.2, 0.25, x, 0.35, z);
  for (const z of [6.8, 14.2]) p.kotak(M.kayuGelap, 10.2, 0.3, 0.3, -3.2, 3.55, z);
  for (let x = -8; x <= 1.61; x += 0.6) p.kotak(M.kayu, 0.12, 0.18, 8.2, x, 3.85, 10.5);
  for (let i = 0; i < 6; i++) {
    const x = -6.6 + (i % 3) * 3.4;
    const z = i < 3 ? 9 : 12.3;
    p.tambah('silinder', M.kayuGelap, 0.9, 0.75, 0.9, x, 0.35, z);
    for (const [dx, dz] of [[-0.85, 0], [0.85, 0], [0, -0.85], [0, 0.85]]) p.kotak(M.gelap, 0.42, 0.45, 0.42, x + dx, 0.35, z + dz);
  }
  for (const [x, z, w] of [[5.2, 9, '#c84b3b'], [5.2, 12.6, '#f1e7d0']]) {
    p.tambah('silinder', M.kayuGelap, 0.9, 0.75, 0.9, x, 0.35, z);
    p.tambah('silinder', M.logam, 0.08, 2.4, 0.08, x, 0.35, z);
    p.tambah('kerucut', M.varian, 2.8, 0.7, 2.8, x, 2.5, z, { warna: w });
  }
  for (let x = -8.5; x <= 8.5; x += 2.1) p.kotak(M.kayuGelap, 1.2, 0.6, 0.6, x, 0.35, 15.2);
  for (let x = -8.5; x <= 8.5; x += 2.1) semak(p, M, x, 15.2, 0.9, rng, 0.85);
  pohon(p, M, -10.5, -4, 0.9, rng);
  return { tinggi: 6.5 };
}

function industri(p, pj, M, rng) {
  // Aula produksi
  p.kotak(M.beton, 30.2, 1.2, 20.2, 0, 0, 0);
  p.kotak(M.logam, 30, 7, 20, 0, 0, 0);
  for (let x = -12; x <= 12; x += 4) p.kotak(M.kacaRedup, 2.4, 1.2, 0.1, x, 4.4, 10.03);
  // Atap gergaji: kaca menghadap utara, panel surya di bidang miring
  const sudut = Math.atan2(2.2, 5);
  for (const c of [-7.5, -2.5, 2.5, 7.5]) {
    p.tambah('gergaji', M.logam, 5, 2.2, 30, 0, 7, c, { ry: -Math.PI / 2 });
    p.kotak(M.kaca, 29.6, 1.9, 0.08, 0, 7.15, c - 2.54);
    p.kotak(M.panel, 28.5, 0.08, 5.15, 0, 8.06, c + 0.06, { rx: sudut });
  }
  // Kantor pengelola di depan
  p.kotak(M.putih, 12, 7.5, 7, -9, 0, 13.5);
  p.kotak(M.kaca, 11, 1.6, 0.1, -9, 1.0, 17.03);
  p.kotak(M.kaca, 11, 1.6, 0.1, -9, 4.6, 17.03);
  p.kotak(M.gelap, 12.4, 0.3, 7.4, -9, 7.5, 13.5);
  // Dok muat sisi timur
  for (const z of [-6, 0, 6]) p.kotak(M.gelap, 0.12, 4, 3.6, 15.03, 0.2, z);
  p.kotak(M.putih, 2.2, 0.3, 20, 16.1, 4.8, 0);
  pj.kotak(M.aspal, 10, 0.05, 24, 20, 0, 0);
  pj.kotak(M.aspal, 16, 0.05, 6, 3, 0, 14);
  for (const [z, w] of [[-6, '#3a5f9f'], [6, '#d9d9d9']]) {
    p.bingkai(21.5, 0.05, z, -Math.PI / 2, () => {
      p.kotak(M.putih, 2.4, 2.6, 2.2, 0, 0.4, -4.2);
      p.kotak(M.kacaMobil, 2.2, 0.9, 0.1, 0, 1.8, -5.32);
      p.kotak(M.varian, 2.5, 3.0, 7, 0, 0.45, 0.6, { warna: w });
      for (const zz of [-4.2, -1.2, 2.8]) for (const xx of [-1.1, 1.1]) p.kotak(M.gelap, 0.35, 0.9, 0.9, xx, 0, zz);
    });
  }
  // Silo
  for (const z of [-6, -1.8]) {
    p.tambah('silinder', M.logam, 3.6, 10, 3.6, -18.5, 0, z);
    p.tambah('kerucut', M.logam, 3.7, 1.4, 3.7, -18.5, 10, z);
  }
  pohon(p, M, -18, 10, 0.9, rng);
  pohon(p, M, -18, 15, 0.8, rng, 'kerucut');
  return { tinggi: 11 };
}

function jembatan(p, pj, M) {
  const N = 26;
  const L = 27;
  const H = 2.4;
  const yDek = (z) => 0.05 + H * (1 - (z / (L / 2)) ** 2);
  const yLengkung = (z) => DANAU.muka + 0.1 + (H - 0.6) * (1 - (z / (L / 2 - 1.5)) ** 2);
  for (let i = 0; i < N; i++) {
    const z0 = -L / 2 + (i * L) / N;
    const z1 = z0 + L / N;
    const y0 = yDek(z0), y1 = yDek(z1);
    const panjang = Math.hypot(z1 - z0, y1 - y0) + 0.02;
    const zc = (z0 + z1) / 2, yc = (y0 + y1) / 2;
    const rx = -Math.atan2(y1 - y0, z1 - z0);
    pj.kotak(M.kayu, 2.8, 0.2, panjang, 0, yc - 0.1, zc, { rx });
    for (const sx of [-1.38, 1.38]) {
      p.kotak(M.baja, 0.07, 0.07, panjang, sx, yc + 1.0, zc, { rx });
      if (i % 2 === 0) p.kotak(M.baja, 0.07, 1.0, 0.07, sx, yc, zc);
    }
    if (Math.abs(zc) < L / 2 - 1.5) {
      const a0 = yLengkung(z0), a1 = yLengkung(z1);
      const ra = -Math.atan2(a1 - a0, z1 - z0);
      for (const sx of [-1.0, 1.0]) p.kotak(M.gelap, 0.3, 0.32, Math.hypot(z1 - z0, a1 - a0) + 0.04, sx, (a0 + a1) / 2 - 0.16, zc, { rx: ra });
    }
    if (i % 3 === 1 && Math.abs(zc) < L / 2 - 2) {
      const tg = yc - 0.1 - yLengkung(zc);
      if (tg > 0.3) for (const sx of [-1.0, 1.0]) p.kotak(M.baja, 0.08, tg, 0.08, sx, yLengkung(zc), zc);
    }
  }
  for (const z of [-L / 2 - 0.6, L / 2 + 0.6]) pj.kotak(M.beton, 3.4, 0.12, 1.4, 0, 0, z);
  for (const z of [-L / 2, L / 2]) for (const sx of [-1.6, 1.6]) {
    p.tambah('silinder', M.baja, 0.12, 3.4, 0.12, sx, 0, z);
    p.tambah('bola', M.lampu, 0.42, 0.42, 0.42, sx, 3.35, z);
  }
  return { tinggi: 4.5 };
}

// Tata letak kawasan: posisi dan orientasi setiap karya (ry memutar arah depan +z),
// serta titik berdiri untuk tombol "Lihat dari jalan". `model` = berkas GLB relatif terhadap modul ini.
const KAVLING = [
  { id: 'paviliun-lentera', x: 0, z: 0, ry: 0, jalan: [0, 21], bangun: paviliunLentera },
  { id: 'kasang-house', x: -59.8, z: 31.6, ry: Math.PI, jalan: [-59.8, 11], bangun: kasangHouse, model: './model/kasang-house.glb?ver=1' },
  { id: 'rumah-split-level', x: -30, z: 34, ry: Math.PI, jalan: [-23.5, 11], bangun: rumahSplitLevel },
  { id: 'villa-tepi-danau', x: 84, z: 34, ry: -Math.PI / 2, jalan: [80, 11], bangun: villaTepiDanau },
  { id: 'masjid', x: -26, z: -34, ry: Math.PI / 2, jalan: [-0.5, -34], bangun: masjid },
  { id: 'kantor', x: 30, z: -36, ry: 0, jalan: [30, 0], bangun: kantor },
  { id: 'hotel', x: -64, z: -36, ry: 0, jalan: [-64, 0], bangun: hotel },
  { id: 'cafe', x: 18, z: 30, ry: Math.PI / 2, jalan: [52, 21], bangun: cafe },
  { id: 'industri', x: 66, z: -38, ry: 0, jalan: [66, 0], bangun: industri },
  { id: 'jembatan', x: DANAU.x, z: DANAU.z, ry: 0, jalan: [DANAU.x, 17], bangun: jembatan },
];

/* ============================================================
 * Lingkungan: tanah, danau, jalan, pohon, kampung sekitar
 * ============================================================ */
function bangunLingkungan(adegan, M, rng, kualitas, permukaan, jalanSetapak) {
  const elips = (rx, rz, lubang = false) => {
    const s = lubang ? new THREE.Path() : new THREE.Shape();
    s.absellipse(0, 0, rx, rz, 0, Math.PI * 2, lubang, 0);
    return s;
  };
  const datar = (geom, mat, y, x = 0, z = 0) => {
    geom.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(geom, mat);
    mesh.position.set(x, y, z);
    mesh.receiveShadow = true;
    adegan.add(mesh);
    return mesh;
  };

  // Tanah luar (berlubang di area kawasan) dan halaman kawasan (berlubang di danau).
  // Lubang Shape harus berlawanan arah putar, dan rotateX membalik sumbu z, jadi danau dibalik di z.
  const luar = new THREE.Shape().absarc(0, 0, 1600, 0, Math.PI * 2, false);
  const lubangKawasan = new THREE.Path();
  lubangKawasan.moveTo(-96, -63); lubangKawasan.lineTo(-96, 63); lubangKawasan.lineTo(96, 63); lubangKawasan.lineTo(96, -63); lubangKawasan.closePath();
  luar.holes.push(lubangKawasan);
  permukaan.push(datar(new THREE.ShapeGeometry(luar, 48), M.rumputLuar, 0));

  const kawasan = new THREE.Shape();
  kawasan.moveTo(-96, -63); kawasan.lineTo(96, -63); kawasan.lineTo(96, 63); kawasan.lineTo(-96, 63); kawasan.closePath();
  const lubangDanau = new THREE.Path();
  lubangDanau.absellipse(DANAU.x, -DANAU.z, DANAU.rx, DANAU.rz, 0, Math.PI * 2, true);
  kawasan.holes.push(lubangDanau);
  permukaan.push(datar(new THREE.ShapeGeometry(kawasan, 64), M.rumput, 0));

  // Danau: dinding tepi, muka air, dan bibir batu
  const tepi = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 64, 1, true), new THREE.MeshStandardMaterial({ color: 0x8c8577, roughness: 1, side: THREE.BackSide }));
  tepi.scale.set(DANAU.rx, 0.8, DANAU.rz);
  tepi.position.set(DANAU.x, -0.4, DANAU.z);
  adegan.add(tepi);
  datar(new THREE.ShapeGeometry(elips(DANAU.rx, DANAU.rz), 64), M.air, DANAU.muka, DANAU.x, DANAU.z);
  const bibir = elips(DANAU.rx + 0.9, DANAU.rz + 0.9);
  bibir.holes.push(elips(DANAU.rx, DANAU.rz, true));
  datar(new THREE.ShapeGeometry(bibir, 64), M.batu, 0.03, DANAU.x, DANAU.z);

  // Plaza pusat
  const plaza = new THREE.Mesh(new THREE.CylinderGeometry(16, 16, 0.1, 64), M.pavingPlaza);
  plaza.position.y = 0.05;
  plaza.receiveShadow = true;
  adegan.add(plaza);
  jalanSetapak.push(plaza);
  const cincin = new THREE.Mesh(new THREE.RingGeometry(10.5, 11.2, 64).rotateX(-Math.PI / 2), M.paving);
  cincin.position.y = 0.105;
  cincin.receiveShadow = true;
  adegan.add(cincin);

  const pj = new Perakit(); // permukaan jalan setapak
  const p = new Perakit(); // benda lain

  // Boulevard timur–barat dan promenade utara–selatan
  pj.kotak(M.paving, 80, 0.08, 7, -56, 0, 0);
  pj.kotak(M.paving, 80, 0.08, 7, 56, 0, 0);
  pj.kotak(M.paving, 6, 0.08, 47, 0, 0, -39.5);
  pj.kotak(M.paving, 6, 0.08, 47, 0, 0, 39.5);
  // Area yang tidak boleh ditanami pohon: kavling karya, plaza, gerbang, lalu jalur penghubung di bawah
  const terpakai = [
    [-80, -48, -48, -16], [-42, -10, -50, -18], [16, 44, -48, -16], [44, 94, -52, -20],
    [-78, -54, 20, 46], [-42, -18, 20, 48], [10, 35, 20, 40], [66, 95, 21, 47],
    [-17, 17, -17, 17], [-98, -94, -7, 7],
  ];
  // Jalur penghubung ke setiap karya: [x, z, lebar x, panjang z]
  const PENGHUBUNG = [
    [-59.8, 12.25, 3, 17.5], [-23.5, 12.75, 3, 18.5], [-64, -10.75, 3, 14.5], [-6.5, -34, 7, 3],
    [30, -9.75, 3, 12.5], [6.5, 30, 7, 3], [66, -15.25, 3, 23.5], [80, 13.75, 3, 20.5],
    [DANAU.x, 15.5, 3, 24], [DANAU.x, 53.5, 14, 3], [DANAU.x, 59, 3, 9],
  ];
  for (const [x, z, w, d] of PENGHUBUNG) {
    pj.kotak(M.paving, w, 0.08, d, x, 0, z);
    terpakai.push([x - w / 2 - 1.5, x + w / 2 + 1.5, z - d / 2, z + d / 2]);
  }

  // Jalan aspal keliling dan jalan keluar
  const aspal = (w, d, x, z) => pj.kotak(M.aspal, w, 0.05, d, x, 0, z);
  aspal(215, 7, 0, -67); aspal(215, 7, 0, 67); aspal(7, 127, -104, 0); aspal(7, 127, 104, 0);
  aspal(800, 7, -511, 0); aspal(800, 7, 511, 0); aspal(7, 800, 0, 474.5); aspal(7, 800, 0, -474.5);
  for (let x = -100; x <= 100; x += 8) { p.kotak(M.marka, 3, 0.07, 0.18, x, 0, -67); p.kotak(M.marka, 3, 0.07, 0.18, x, 0, 67); }
  for (let z = -63; z <= 63; z += 8) { p.kotak(M.marka, 0.18, 0.07, 3, -104, 0, z); p.kotak(M.marka, 0.18, 0.07, 3, 104, 0, z); }
  for (let x = 112; x <= 420; x += 8) { p.kotak(M.marka, 3, 0.07, 0.18, x, 0, 0); p.kotak(M.marka, 3, 0.07, 0.18, -x, 0, 0); }
  for (let z = 75; z <= 420; z += 8) { p.kotak(M.marka, 0.18, 0.07, 3, 0, 0, z); p.kotak(M.marka, 0.18, 0.07, 3, 0, 0, -z); }

  // Pembatas kawasan (bukaan untuk gerbang dan jalan masuk)
  const kerb = (w, d, x, z) => p.kotak(M.beton, w, 0.35, d, x, 0, z);
  kerb(192, 0.4, 0, -63.2); kerb(88, 0.4, -52, 63.2); kerb(88, 0.4, 52, 63.2);
  kerb(0.4, 58, -96.2, -34); kerb(0.4, 58, -96.2, 34); kerb(0.4, 58, 96.2, -34); kerb(0.4, 58, 96.2, 34);
  pj.kotak(M.paving, 8, 0.08, 7, 0, 0, 65.5);
  pj.kotak(M.paving, 7, 0.08, 7, 99.5, 0, 0);
  pj.kotak(M.paving, 7, 0.08, 7, -99.5, 0, 0);

  // Gerbang Studio Lentera (sisi barat)
  for (const z of [-5.2, 5.2]) p.kotak(M.batu, 1.3, 5.2, 1.3, -97, 0, z);
  p.kotak(M.gelap, 1.0, 1.5, 11.8, -97, 5.0, 0);
  const papan = buatPapanNama();
  papan.position.set(-97.52, 5.75, 0);
  papan.rotation.y = -Math.PI / 2;
  adegan.add(papan);

  // Bangku dan pot di plaza
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    p.bingkai(Math.sin(a) * 13.2, 0.1, Math.cos(a) * 13.2, a, () => {
      p.kotak(M.kayu, 2.2, 0.12, 0.6, 0, 0.42, 0);
      p.kotak(M.gelap, 0.1, 0.42, 0.5, -0.9, 0, 0);
      p.kotak(M.gelap, 0.1, 0.42, 0.5, 0.9, 0, 0);
    });
  }

  // Lampu taman sepanjang boulevard dan promenade (tidak menghalangi ujung jalur penghubung)
  const dekatPenghubung = (x, z) => PENGHUBUNG.some(([px, pz, w, d]) => Math.abs(x - px) < w / 2 + 2 && Math.abs(z - pz) < d / 2 + 2);
  const tiang = (x, z) => {
    if (dekatPenghubung(x, z)) return;
    p.tambah('silinder', M.baja, 0.14, 4.2, 0.14, x, 0, z);
    p.tambah('bola', M.lampu, 0.5, 0.5, 0.5, x, 4.05, z);
  };
  for (let x = 22; x <= 92; x += 14) { tiang(x, 4.3); tiang(-x, -4.3); }
  for (let z = 22; z <= 60; z += 14) { tiang(3.8, z); tiang(-3.8, -z); }

  // Pohon: deret boulevard, promenade, sabuk tepi kawasan
  const kosong = (x, z, r = 2.5) =>
    !terpakai.some(([x0, x1, z0, z1]) => x > x0 - r && x < x1 + r && z > z0 - r && z < z1 + r) &&
    ((x - DANAU.x) / (DANAU.rx + 3)) ** 2 + ((z - DANAU.z) / (DANAU.rz + 3)) ** 2 > 1;
  const pv = new Perakit();
  for (let x = 20; x <= 92; x += 9) for (const s of [-1, 1]) {
    if (kosong(x, s * 6.5, 0.5)) pohon(pv, M, x, s * 6.5, 0.85 + rng() * 0.2, rng);
    if (kosong(-x, s * 6.5, 0.5)) pohon(pv, M, -x, s * 6.5, 0.85 + rng() * 0.2, rng);
  }
  for (let z = 22; z <= 60; z += 9) for (const s of [-1, 1]) {
    if (kosong(s * 6, z, 0.5)) pohon(pv, M, s * 6, z, 0.8, rng, 'kerucut');
    if (kosong(s * 6, -z, 0.5)) pohon(pv, M, s * 6, -z, 0.8, rng, 'kerucut');
  }
  for (let i = 0; i < 110; i++) {
    const tepiX = rng() < 0.5;
    const x = tepiX ? (rng() < 0.5 ? -1 : 1) * (88 + rng() * 6) : -92 + rng() * 184;
    const z = tepiX ? -60 + rng() * 120 : (rng() < 0.5 ? -1 : 1) * (55 + rng() * 6);
    if (kosong(x, z) && Math.abs(z) > 5 && Math.abs(x) > 5) pohon(pv, M, x, z, 0.7 + rng() * 0.5, rng, rng() < 0.25 ? 'kerucut' : 'bulat');
  }
  for (let i = 0; i < 34; i++) {
    const x = -90 + rng() * 180, z = -58 + rng() * 116;
    if (kosong(x, z, 1) && Math.abs(z) > 8 && Math.abs(x) > 9) pohon(pv, M, x, z, 0.75 + rng() * 0.4, rng);
  }
  for (let i = 0; i < 18; i++) {
    const a = rng() * Math.PI * 2;
    const x = DANAU.x + Math.cos(a) * (DANAU.rx + 4 + rng() * 3), z = DANAU.z + Math.sin(a) * (DANAU.rz + 4 + rng() * 3);
    if (kosong(x, z, -1) && x < 66 && Math.abs(x - DANAU.x) > 3) pohon(pv, M, x, z, 0.8, rng, rng() < 0.4 ? 'palem' : 'bulat');
  }

  // Kampung, sawah, dan perbukitan di sekeliling kawasan
  const pl = new Perakit();
  const dindingRumah = ['#efe6d4', '#e8dcc6', '#f3efe6', '#dfe6e8', '#efe0cf', '#e6d2bd'];
  const atapRumah = ['#a65a3c', '#8f4a33', '#b4683f', '#6b6f75'];
  const jumlahRumah = kualitas === 'rendah' ? 50 : 110;
  const rumahKampung = (x, z, ry) => {
    pl.bingkai(x, 0, z, ry, () => {
      const w = 6 + rng() * 3, d = 7 + rng() * 4;
      pl.kotak(M.varian, w, 3, d, 0, 0, 0, { warna: pilihDari(rng, dindingRumah) });
      pl.tambah('prisma', M.varian, w + 1, 2.2, d + 1, 0, 3, 0, { warna: pilihDari(rng, atapRumah) });
    });
  };
  for (let i = 0; i < jumlahRumah; i++) {
    const sisi = i % 4;
    const jarak = 125 + rng() * 300;
    const tepiJalan = (rng() < 0.5 ? -1 : 1) * (12 + rng() * 14);
    if (sisi === 0) rumahKampung(-jarak, tepiJalan, rng() < 0.5 ? 0 : Math.PI);
    else if (sisi === 1) rumahKampung(jarak, tepiJalan, rng() < 0.5 ? 0 : Math.PI);
    else if (sisi === 2) rumahKampung(tepiJalan, jarak, Math.PI / 2);
    else rumahKampung(tepiJalan * 1.1, -jarak, Math.PI / 2);
  }
  const sawah = ['#9cc25e', '#8fb855', '#b6c76a', '#a8c060', '#c9c57a', '#7fae4f', '#93b95a'];
  for (let gx = -11; gx <= 11; gx++) for (let gz = -9; gz <= 9; gz++) {
    const x = gx * 38 + (rng() - 0.5) * 6, z = gz * 32 + (rng() - 0.5) * 6;
    if (Math.abs(x) < 140 && Math.abs(z) < 105) continue;
    if (Math.abs(x) < 34 || Math.abs(z) < 34) continue;
    if (rng() < 0.18) continue;
    pl.kotak(M.varian, 34, 0.06, 28, x, 0, z, { warna: pilihDari(rng, sawah) });
  }
  const jumlahPohonLuar = kualitas === 'rendah' ? 120 : 260;
  for (let i = 0; i < jumlahPohonLuar; i++) {
    const r = 115 + rng() * 380, a = rng() * Math.PI * 2;
    const x = Math.cos(a) * r * 1.2, z = Math.sin(a) * r;
    if (Math.abs(x) < 8 || Math.abs(z) < 8) continue;
    const s = 0.9 + rng() * 0.6;
    pl.tambah('silinder6', M.batang, 0.35 * s, 2.3 * s, 0.35 * s, x, 0, z);
    pl.tambah('ico0', M.daun, 4 * s, 3.6 * s, 4 * s, x, 1.8 * s, z, { warna: pilihDari(rng, ['#5f8f45', '#4f7f3e', '#6f9c4c', '#587f40']) });
  }
  // Perbukitan landai di cakrawala (tersamar kabut)
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 + rng() * 0.25;
    const r = 1050 + rng() * 250;
    const w = 520 + rng() * 380;
    pl.tambah('bola', M.varian, w, 70 + rng() * 50, w * 0.45, Math.cos(a) * r, -30, Math.sin(a) * r, { ry: a + Math.PI / 2, warna: pilihDari(rng, ['#6d8f5a', '#5e7f50', '#7a9663']) });
  }

  jalanSetapak.push(...pj.pasang(adegan, { bayangan: false }));
  p.pasang(adegan);
  pv.pasang(adegan);
  pl.pasang(adegan, { bayangan: kualitas !== 'rendah' });
}

function buatPapanNama() {
  const kanvas = document.createElement('canvas');
  kanvas.width = 1024;
  kanvas.height = 128;
  const tekstur = new THREE.CanvasTexture(kanvas);
  tekstur.colorSpace = THREE.SRGBColorSpace;
  tekstur.anisotropy = 4;
  const gambar = () => {
    const c = kanvas.getContext('2d');
    c.fillStyle = '#23272d';
    c.fillRect(0, 0, 1024, 128);
    c.fillStyle = '#f6dfa8';
    c.font = '700 70px Montserrat, "Segoe UI", Arial, sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('STUDIO LENTERA', 512, 68);
    tekstur.needsUpdate = true;
  };
  gambar();
  document.fonts?.ready.then(gambar);
  const papan = new THREE.Mesh(new THREE.PlaneGeometry(10.4, 1.3), new THREE.MeshStandardMaterial({ map: tekstur, roughness: 0.6, emissive: 0xffffff, emissiveMap: tekstur, emissiveIntensity: 0.15 }));
  papan.userData.papanNama = true;
  return papan;
}

/* ============================================================
 * Mesin utama
 * ============================================================ */
export async function buatMesin({ panggung, lapisanLabel, karya, kategori, kualitas = 'tinggi', kurangiGerak = false, peristiwa = {} }) {
  const kirim = (nama, ...arg) => peristiwa[nama]?.(...arg);
  const rng = acak(20261022);

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, kualitas === 'rendah' ? 1.5 : 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false; // kawasan statis: bayangan dihitung ulang hanya saat matahari/saringan berubah
  const kanvas = renderer.domElement;
  kanvas.className = 'jk-kanvas';
  kanvas.tabIndex = 0;
  kanvas.setAttribute('role', 'application');
  kanvas.setAttribute('aria-roledescription', 'peta 3D');
  kanvas.setAttribute('aria-label', 'Kawasan 3D karya Studio Lentera');
  panggung.prepend(kanvas);

  const adegan = new THREE.Scene();
  const kamera = new THREE.PerspectiveCamera(40, 1, 0.5, 4000);
  const M = buatMaterial();

  // Langit, bintang, kabut
  const matLangit = buatMaterialLangit();
  const langit = new THREE.Mesh(new THREE.SphereGeometry(2400, 32, 16), matLangit);
  langit.renderOrder = -1;
  langit.frustumCulled = false;
  adegan.add(langit);
  const bintang = (() => {
    const pos = [];
    for (let i = 0; i < 900; i++) {
      const u = rng(), v = rng() * 0.9 + 0.08;
      const a = u * Math.PI * 2, e = Math.asin(v);
      pos.push(Math.cos(a) * Math.cos(e) * 2200, Math.sin(e) * 2200, Math.sin(a) * Math.cos(e) * 2200);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const pts = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }));
    pts.frustumCulled = false;
    pts.renderOrder = -1;
    return pts;
  })();
  adegan.add(bintang);
  adegan.fog = new THREE.Fog(0xcfe0ef, 420, 1500);

  // Lingkungan untuk pantulan kaca dan air
  const pmrem = new THREE.PMREMGenerator(renderer);
  const adeganEnv = new THREE.Scene();
  adeganEnv.add(new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), matLangit));
  let targetEnv = null;
  const perbaruiEnv = () => {
    const baru = pmrem.fromScene(adeganEnv, 0.02, 0.1, 100);
    adegan.environment = baru.texture;
    targetEnv?.dispose();
    targetEnv = baru;
  };

  // Cahaya
  const hemi = new THREE.HemisphereLight(0xffffff, 0x887755, 0.7);
  adegan.add(hemi);
  const matahari = new THREE.DirectionalLight(0xffffff, 3);
  matahari.castShadow = true;
  const ukuranBayangan = kualitas === 'rendah' ? 2048 : 4096;
  matahari.shadow.mapSize.set(ukuranBayangan, ukuranBayangan);
  Object.assign(matahari.shadow.camera, { left: -135, right: 135, top: 110, bottom: -110, near: 10, far: 700 });
  matahari.shadow.bias = -0.0004;
  matahari.shadow.normalBias = 0.06;
  adegan.add(matahari, matahari.target);
  const cahayaLentera = new THREE.PointLight(0xffb45c, 0, 34, 1.7);
  cahayaLentera.position.set(0, 3.5, 0);
  adegan.add(cahayaLentera);
  const cahayaJalan = [[0, 4, 24], [0, 4, -24], [-30, 4, 0], [30, 4, 0], [DANAU.x, 3.5, DANAU.z]].map(([x, y, z]) => {
    const l = new THREE.PointLight(0xffd29a, 0, 32, 1.8);
    l.position.set(x, y, z);
    adegan.add(l);
    return l;
  });

  // Bangun kawasan dan karya
  const permukaan = [];
  const jalanSetapak = [];
  bangunLingkungan(adegan, M, rng, kualitas, permukaan, jalanSetapak);

  const dataKarya = new Map(karya.map((k) => [k.id, k]));
  // Model GLB dimuat bersamaan; bila gagal, fungsi bangun karya membuat massa sederhana sebagai gantinya.
  const modelKarya = new Map(await Promise.all(KAVLING.filter((k) => k.model && dataKarya.has(k.id)).map((k) =>
    muatModel(new URL(k.model, import.meta.url), M).then(
      (model) => [k.id, model],
      (galat) => {
        console.warn('[Jelajahi Karya] Model gagal dimuat:', k.model, galat);
        return [k.id, null];
      },
    ))));
  const daftar = [];
  const objekKlik = [];
  for (const kav of KAVLING) {
    const data = dataKarya.get(kav.id);
    if (!data) continue;
    const grup = new THREE.Group();
    grup.position.set(kav.x, 0, kav.z);
    grup.rotation.y = kav.ry;
    grup.userData.karyaId = kav.id;
    const p = new Perakit();
    const pj = new Perakit();
    const model = modelKarya.get(kav.id);
    const info = kav.bangun(p, pj, M, rng, !!model) || {};
    const mesh = p.pasang(grup);
    const meshJalan = pj.pasang(grup);
    if (model) {
      grup.add(model);
      mesh.push(...model.children);
    }
    adegan.add(grup);
    grup.updateMatrixWorld(true);
    // Karya ber-model diukur dari bangunannya saja, agar taman di satu sisi kavling tidak menggeser pusatnya
    const kotak = new THREE.Box3().setFromObject(model || grup);
    const pusat = kotak.getCenter(new THREE.Vector3());
    const ukuran = kotak.getSize(new THREE.Vector3());
    const semua = [...mesh, ...meshJalan];
    semua.forEach((m) => {
      m.userData.matAsli = m.material;
      objekKlik.push(m);
    });
    jalanSetapak.push(...meshJalan);
    permukaan.push(...meshJalan);
    const warna = kategori[data.kategori]?.warna || '#257cff';
    const label = document.createElement('button');
    label.type = 'button';
    label.className = 'jk-lbl';
    label.tabIndex = -1;
    label.setAttribute('aria-hidden', 'true');
    label.style.setProperty('--warna', warna);
    label.textContent = data.judul;
    label.addEventListener('click', () => pilih(kav.id, { terbang: !modeJalan, sumber: 'label' }));
    lapisanLabel.appendChild(label);
    daftar.push({
      id: kav.id, kav, data, grup, semua, pusat, ukuran, warna, label,
      jangkar: new THREE.Vector3(pusat.x, kotak.max.y + 2.2, pusat.z),
      tinggi: info.tinggi || ukuran.y,
    });
  }
  const karyaDari = (id) => daftar.find((d) => d.id === id);
  permukaan.push(...jalanSetapak.filter((m) => !permukaan.includes(m)));

  // Cincin penanda karya terpilih
  const cincin = new THREE.Mesh(new THREE.RingGeometry(0.92, 1, 96).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x257cff, transparent: true, opacity: 0.9, depthWrite: false, fog: false }));
  cincin.renderOrder = 2;
  cincin.visible = false;
  adegan.add(cincin);

  // Kamera dan kontrol orbit
  const kontrol = new OrbitControls(kamera, kanvas);
  kontrol.enableDamping = true;
  kontrol.dampingFactor = 0.08;
  kontrol.minDistance = 14;
  kontrol.maxDistance = 460;
  kontrol.maxPolarAngle = THREE.MathUtils.degToRad(82);
  kontrol.zoomToCursor = true;
  kontrol.screenSpacePanning = false;
  kontrol.rotateSpeed = 0.7;

  const ATAS_AWAL = { target: new THREE.Vector3(6, 0, 2), jarak: 228, polar: THREE.MathUtils.degToRad(57), azimut: THREE.MathUtils.degToRad(-32) };
  const posisiDari = (target, jarak, polar, azimut) =>
    new THREE.Vector3().setFromSphericalCoords(jarak, polar, azimut).add(target);
  kontrol.target.copy(ATAS_AWAL.target);
  kamera.position.copy(posisiDari(ATAS_AWAL.target, kurangiGerak ? ATAS_AWAL.jarak : 340, ATAS_AWAL.polar, ATAS_AWAL.azimut));
  kontrol.update();

  /* ---------- Status ---------- */
  let perluRender = true;
  let idRaf = 0;
  let aktif = false;
  let waktuLalu = performance.now();
  let terpilih = null;
  let sorot = null;
  let tampilan = '3d';
  let saringan = null;
  let modeJalan = false;
  let tur = null;
  let terbang = null;
  let transisi = null;
  let animCincin = 0;
  const lebarTinggi = { w: 1, h: 1 };
  const minta = () => { perluRender = true; };
  kontrol.addEventListener('change', minta);

  /* ---------- Suasana ---------- */
  const parameter = {};
  const salinParameter = (s) => ({
    arah: arahDariAzimut(s.azimut, s.elevasi),
    warnaMatahari: new THREE.Color(s.warnaMatahari), kuatMatahari: s.kuatMatahari,
    atas: new THREE.Color(s.atas), cakrawala: new THREE.Color(s.cakrawala), bawah: new THREE.Color(s.bawah),
    hemiLangit: new THREE.Color(s.hemiLangit), hemiTanah: new THREE.Color(s.hemiTanah), kuatHemi: s.kuatHemi, kuatEnv: s.kuatEnv,
    eksposur: s.eksposur, jendela: s.jendela, lampu: s.lampu, bintang: s.bintang, sinar: s.sinar,
    azimut: s.azimut,
  });
  const terapkanParameter = (q) => {
    matahari.color.copy(q.warnaMatahari);
    matahari.intensity = q.kuatMatahari;
    matahari.position.copy(q.arah).multiplyScalar(320);
    matahari.target.position.set(0, 0, 0);
    hemi.color.copy(q.hemiLangit);
    hemi.groundColor.copy(q.hemiTanah);
    hemi.intensity = q.kuatHemi;
    adegan.environmentIntensity = q.kuatEnv;
    const u = matLangit.uniforms;
    u.uAtas.value.copy(q.atas);
    u.uCakrawala.value.copy(q.cakrawala);
    u.uBawah.value.copy(q.bawah);
    u.uMatahari.value.copy(q.arah);
    u.uWarnaMatahari.value.copy(q.warnaMatahari);
    u.uKuatMatahari.value = q.sinar;
    adegan.fog.color.copy(q.cakrawala);
    renderer.toneMappingExposure = q.eksposur;
    for (const m of [M.kaca, M.kacaRedup]) m.emissiveIntensity = q.jendela * m.userData.kuatNyala;
    M.lampu.emissiveIntensity = 0.2 + q.lampu * 1.4;
    M.lentera.emissiveIntensity = 0.25 + q.lampu * 1.1;
    M.airKolam.emissiveIntensity = q.lampu * 0.35;
    cahayaLentera.intensity = q.lampu * 95;
    cahayaJalan.forEach((l) => { l.intensity = q.lampu * 60; });
    bintang.material.opacity = q.bintang;
    bintang.visible = q.bintang > 0.01;
    renderer.shadowMap.needsUpdate = true;
    Object.assign(parameter, q);
  };
  const lerpParameter = (a, b, t) => ({
    arah: a.arah.clone().lerp(b.arah, t).normalize(),
    warnaMatahari: a.warnaMatahari.clone().lerp(b.warnaMatahari, t), kuatMatahari: THREE.MathUtils.lerp(a.kuatMatahari, b.kuatMatahari, t),
    atas: a.atas.clone().lerp(b.atas, t), cakrawala: a.cakrawala.clone().lerp(b.cakrawala, t), bawah: a.bawah.clone().lerp(b.bawah, t),
    hemiLangit: a.hemiLangit.clone().lerp(b.hemiLangit, t), hemiTanah: a.hemiTanah.clone().lerp(b.hemiTanah, t),
    kuatHemi: THREE.MathUtils.lerp(a.kuatHemi, b.kuatHemi, t), kuatEnv: THREE.MathUtils.lerp(a.kuatEnv, b.kuatEnv, t),
    eksposur: THREE.MathUtils.lerp(a.eksposur, b.eksposur, t), jendela: THREE.MathUtils.lerp(a.jendela, b.jendela, t),
    lampu: THREE.MathUtils.lerp(a.lampu, b.lampu, t), bintang: THREE.MathUtils.lerp(a.bintang, b.bintang, t),
    sinar: THREE.MathUtils.lerp(a.sinar, b.sinar, t), azimut: t < 0.5 ? a.azimut : b.azimut,
  });
  let namaSuasana = null;
  function aturSuasana(nama, { langsung = false } = {}) {
    const kunci = nama === 'otomatis' ? suasanaOtomatis() : nama;
    if (!SUASANA[kunci] || kunci === namaSuasana) return kunci;
    namaSuasana = kunci;
    const tujuan = salinParameter(SUASANA[kunci]);
    if (langsung || kurangiGerak || !parameter.arah) {
      terapkanParameter(tujuan);
      perbaruiEnv();
      transisi = null;
    } else {
      transisi = { dari: { ...parameter, arah: parameter.arah.clone() }, ke: tujuan, mulai: performance.now(), lama: 1400 };
    }
    minta();
    return kunci;
  }

  /* ---------- Pemilihan, saringan, label ---------- */
  function pilih(id, { terbang: ikutTerbang = true, sumber = 'mesin' } = {}) {
    const k = id ? karyaDari(id) : null;
    terpilih = k;
    for (const d of daftar) d.label.classList.toggle('jk-lbl--pilih', d === k);
    if (k) {
      const r = Math.max(k.ukuran.x, k.ukuran.z) / 2 + 2.5;
      cincin.scale.set(r, 1, r);
      cincin.position.set(k.pusat.x, 0.14, k.pusat.z);
      cincin.material.color.set(k.warna);
      cincin.visible = true;
      animCincin = performance.now();
      if (ikutTerbang && !modeJalan) terbangKe(k);
    } else {
      cincin.visible = false;
    }
    if (sumber !== 'tur' && sumber !== 'ui-tur') hentikanTur();
    kirim('pilih', k ? k.id : null, sumber);
    minta();
  }

  function saring(namaKategori) {
    saringan = namaKategori || null;
    for (const d of daftar) {
      const cocok = !saringan || d.data.kategori === saringan;
      for (const m of d.semua) {
        m.material = cocok ? m.userData.matAsli : M.hantu;
        m.castShadow = cocok && !m.userData.matAsli.userData.tanpaBayangan;
      }
      d.label.classList.toggle('jk-lbl--redup', !cocok);
    }
    renderer.shadowMap.needsUpdate = true;
    minta();
  }

  const _v = new THREE.Vector3();
  const ukurLabelUlang = () => daftar.forEach((d) => { d.lebarLbl = 0; });
  document.fonts?.ready.then(() => { ukurLabelUlang(); minta(); });

  // Label yang bertabrakan digeser ke atas; karya terpilih lalu yang terdekat ke kamera didahulukan.
  function perbaruiLabel() {
    const { w, h } = lebarTinggi;
    const calon = [];
    for (const d of daftar) {
      _v.copy(d.jangkar).project(kamera);
      const tampak = _v.z < 1 && _v.x > -1.15 && _v.x < 1.15 && _v.y > -1.15 && _v.y < 1.2;
      const jarak = kamera.position.distanceTo(d.jangkar);
      if (!tampak || (modeJalan && jarak > 140)) {
        d.label.style.display = 'none';
        continue;
      }
      d.label.style.display = '';
      calon.push({ d, x: ((_v.x + 1) / 2) * w, y: ((1 - _v.y) / 2) * h, jarak });
    }
    calon.sort((a, b) => (b.d === terpilih) - (a.d === terpilih) || a.jarak - b.jarak);
    const terpakai = [];
    calon.forEach((c, i) => {
      const { d } = c;
      if (!d.lebarLbl) {
        d.lebarLbl = d.label.offsetWidth;
        d.tinggiLbl = d.label.offsetHeight;
      }
      let dy = 0;
      for (let coba = 0; coba < 4; coba++) {
        const k = [c.x - d.lebarLbl / 2 - 3, c.y + dy - d.tinggiLbl - 10, c.x + d.lebarLbl / 2 + 3, c.y + dy];
        const tabrak = terpakai.some((t) => t[0] < k[2] && t[2] > k[0] && t[1] < k[3] && t[3] > k[1]);
        if (!tabrak || coba === 3) {
          terpakai.push(k);
          break;
        }
        dy -= d.tinggiLbl + 6;
      }
      d.label.style.transform = `translate(-50%, -100%) translate(${c.x.toFixed(1)}px, ${(c.y + dy).toFixed(1)}px)`;
      d.label.style.zIndex = String(calon.length - i + (d === terpilih ? 100 : 0));
    });
  }

  function kirimKompas() {
    kamera.getWorldDirection(_v);
    const arah = Math.atan2(_v.x, -_v.z);
    kirim('kompas', THREE.MathUtils.radToDeg(arah), parameter.azimut ?? 0, namaSuasana);
  }

  /* ---------- Terbang (animasi kamera) ---------- */
  const _sf = new THREE.Spherical();
  function terbangOrbit(targetBaru, jarak, polar, azimut, lama = 1500) {
    const dari = _sf.setFromVector3(_v.copy(kamera.position).sub(kontrol.target)).clone();
    let dAz = azimut - dari.theta;
    dAz = Math.atan2(Math.sin(dAz), Math.cos(dAz));
    const jauh = kontrol.target.distanceTo(targetBaru);
    terbang = {
      jenis: 'orbit', mulai: performance.now(), lama: kurangiGerak ? 1 : lama,
      t0: kontrol.target.clone(), t1: targetBaru.clone(),
      r0: dari.radius, r1: jarak, p0: dari.phi, p1: polar, a0: dari.theta, a1: dari.theta + dAz,
      naik: Math.min(jauh * 0.35, 80),
    };
    minta();
  }

  function sudutPandangKarya(k) {
    const besar = Math.max(k.ukuran.x, k.ukuran.z, k.tinggi * 1.4);
    const jarak = THREE.MathUtils.clamp(besar * 2.1 + 14, 34, 150);
    const azimut = k.kav.ry + 0.62;
    return { target: new THREE.Vector3(k.pusat.x, Math.min(k.tinggi * 0.35, 12), k.pusat.z), jarak, polar: THREE.MathUtils.degToRad(62), azimut };
  }

  function terbangKe(k) {
    if (tampilan === 'denah') {
      terbangOrbit(new THREE.Vector3(k.pusat.x, 0, k.pusat.z), 120, 0.0001, 0);
      return;
    }
    const s = sudutPandangKarya(k);
    terbangOrbit(s.target, s.jarak, s.polar, s.azimut);
  }

  function langkahTerbang(now) {
    if (!terbang) return false;
    const t = Math.min(1, (now - terbang.mulai) / terbang.lama);
    const e = t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
    if (terbang.jenis === 'orbit') {
      kontrol.target.lerpVectors(terbang.t0, terbang.t1, e);
      const r = THREE.MathUtils.lerp(terbang.r0, terbang.r1, e) + Math.sin(Math.PI * e) * terbang.naik;
      _sf.set(r, THREE.MathUtils.lerp(terbang.p0, terbang.p1, e), THREE.MathUtils.lerp(terbang.a0, terbang.a1, e));
      kamera.position.setFromSpherical(_sf).add(kontrol.target);
      kamera.lookAt(kontrol.target);
    } else {
      kamera.position.lerpVectors(terbang.pos0, terbang.pos1, e);
      jalan.yaw = THREE.MathUtils.lerp(terbang.yaw0, terbang.yaw1, e);
      jalan.pitch = THREE.MathUtils.lerp(terbang.pitch0, terbang.pitch1, e);
      kamera.fov = THREE.MathUtils.lerp(terbang.fov0, terbang.fov1, e);
      kamera.updateProjectionMatrix();
      arahkanKameraJalan();
    }
    if (t >= 1) {
      const { selesai, jenis } = terbang;
      terbang = null;
      // OrbitControls hanya disinkronkan di mode orbit; di mode jalan update() akan menjepit sudut dan mengangkat kamera.
      if (jenis === 'orbit') kontrol.update();
      selesai?.();
    }
    return true;
  }

  /* ---------- Tampilan 3D / denah ---------- */
  function kontrolUntuk(nama) {
    const denah = nama === 'denah';
    kontrol.enableRotate = !denah;
    kontrol.screenSpacePanning = denah;
    kontrol.mouseButtons.LEFT = denah ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE;
    kontrol.touches.ONE = denah ? THREE.TOUCH.PAN : THREE.TOUCH.ROTATE;
    kontrol.minPolarAngle = 0;
    kontrol.maxPolarAngle = THREE.MathUtils.degToRad(82);
    kontrol.minAzimuthAngle = -Infinity;
    kontrol.maxAzimuthAngle = Infinity;
  }

  function aturTampilan(nama) {
    if (nama === tampilan && !modeJalan) return;
    if (modeJalan) keluarJalan({ langsung: true });
    tampilan = nama;
    hentikanTur();
    kontrolUntuk(nama);
    if (nama === 'denah') {
      const aspek = lebarTinggi.w / lebarTinggi.h;
      const jarak = Math.max(150 / (2 * Math.tan(THREE.MathUtils.degToRad(20))), 215 / (2 * Math.tan(THREE.MathUtils.degToRad(20)) * aspek));
      terbangOrbit(new THREE.Vector3(0, 0, 0), Math.min(jarak, 430), 0.0001, 0, 1200);
      terbang.selesai = () => {
        kontrol.minPolarAngle = 0;
        kontrol.maxPolarAngle = 0;
        kontrol.minAzimuthAngle = 0;
        kontrol.maxAzimuthAngle = 0;
      };
    } else {
      const t = kontrol.target.clone().setY(0);
      terbangOrbit(t, Math.min(kamera.position.distanceTo(kontrol.target) * 1.05, 300), ATAS_AWAL.polar, ATAS_AWAL.azimut, 1200);
    }
    kirim('tampilan', tampilan);
  }

  function zoom(arah) {
    if (modeJalan) {
      kamera.fov = THREE.MathUtils.clamp(kamera.fov + (arah > 0 ? -8 : 8), 28, 80);
      kamera.updateProjectionMatrix();
      minta();
      return;
    }
    const sf = new THREE.Spherical().setFromVector3(_v.copy(kamera.position).sub(kontrol.target));
    const r = THREE.MathUtils.clamp(sf.radius * (arah > 0 ? 0.7 : 1.4), kontrol.minDistance, kontrol.maxDistance);
    terbangOrbit(kontrol.target.clone(), r, sf.phi, sf.theta, 450);
  }

  /* ---------- Mode jalan (seperti Street View) ---------- */
  const jalan = { yaw: 0, pitch: -0.05, tombol: new Set(), simpan: null };
  const _arah = new THREE.Vector3();
  function arahkanKameraJalan() {
    _arah.set(Math.sin(jalan.yaw) * Math.cos(jalan.pitch), Math.sin(jalan.pitch), -Math.cos(jalan.yaw) * Math.cos(jalan.pitch));
    kamera.lookAt(_v.copy(kamera.position).add(_arah));
  }

  const penembak = new THREE.Raycaster();
  const _bawah = new THREE.Vector3(0, -1, 0);
  function tinggiTanah(x, z, cadangan) {
    penembak.set(_v.set(x, 60, z), _bawah);
    penembak.far = 120;
    const kena = penembak.intersectObjects(permukaan, false)[0];
    return kena ? kena.point.y : cadangan;
  }

  function masukJalan(titik, { lihat = null, langsung = false } = {}) {
    hentikanTur();
    if (tampilan === 'denah') {
      tampilan = '3d';
      kontrolUntuk('3d');
      kirim('tampilan', '3d');
    }
    if (!modeJalan) jalan.simpan = { pos: kamera.position.clone(), target: kontrol.target.clone(), fov: kamera.fov };
    const x = THREE.MathUtils.clamp(titik.x, -BATAS_JALAN.x, BATAS_JALAN.x);
    const z = THREE.MathUtils.clamp(titik.z, -BATAS_JALAN.z, BATAS_JALAN.z);
    const tujuan = new THREE.Vector3(x, tinggiTanah(x, z, titik.y) + TINGGI_MATA, z);
    let sasaran = lihat;
    if (!sasaran) {
      let terdekat = null;
      for (const d of daftar) {
        const j = Math.hypot(d.pusat.x - x, d.pusat.z - z);
        if (j > 6 && (!terdekat || j < terdekat[0])) terdekat = [j, d];
      }
      sasaran = terdekat ? terdekat[1].pusat.clone().setY(Math.min(terdekat[1].tinggi * 0.4, 8)) : new THREE.Vector3(0, 3, 0);
    }
    const yawTujuan = Math.atan2(sasaran.x - x, -(sasaran.z - z));
    const pitchTujuan = THREE.MathUtils.clamp(Math.atan2(sasaran.y - tujuan.y, Math.hypot(sasaran.x - x, sasaran.z - z)), -0.4, 0.5);
    kamera.getWorldDirection(_arah);
    const yawSekarang = Math.atan2(_arah.x, -_arah.z);
    let dYaw = yawTujuan - (modeJalan ? jalan.yaw : yawSekarang);
    dYaw = Math.atan2(Math.sin(dYaw), Math.cos(dYaw));
    const yawAwal = modeJalan ? jalan.yaw : yawSekarang;
    const pitchAwal = modeJalan ? jalan.pitch : Math.asin(THREE.MathUtils.clamp(_arah.y, -1, 1));
    modeJalan = true;
    kontrol.enabled = false;
    kanvas.classList.add('jk-kanvas--jalan');
    ukurLabelUlang();
    terbang = {
      jenis: 'jalan', mulai: performance.now(), lama: langsung || kurangiGerak ? 1 : 1600,
      pos0: kamera.position.clone(), pos1: tujuan, yaw0: yawAwal, yaw1: yawAwal + dYaw, pitch0: pitchAwal, pitch1: pitchTujuan,
      fov0: kamera.fov, fov1: 62,
    };
    kirim('modeJalan', true);
    minta();
  }

  function pindahJalan(titik) {
    const x = THREE.MathUtils.clamp(titik.x, -BATAS_JALAN.x, BATAS_JALAN.x);
    const z = THREE.MathUtils.clamp(titik.z, -BATAS_JALAN.z, BATAS_JALAN.z);
    terbang = {
      jenis: 'jalan', mulai: performance.now(), lama: kurangiGerak ? 1 : 900,
      pos0: kamera.position.clone(), pos1: new THREE.Vector3(x, tinggiTanah(x, z, titik.y) + TINGGI_MATA, z),
      yaw0: jalan.yaw, yaw1: jalan.yaw, pitch0: jalan.pitch, pitch1: jalan.pitch, fov0: kamera.fov, fov1: kamera.fov,
    };
    minta();
  }

  function keluarJalan({ langsung = false } = {}) {
    if (!modeJalan) return;
    modeJalan = false;
    jalan.tombol.clear();
    kanvas.classList.remove('jk-kanvas--jalan');
    ukurLabelUlang();
    const s = jalan.simpan;
    kamera.fov = s?.fov ?? 40;
    kamera.updateProjectionMatrix();
    kontrol.enabled = true;
    if (s) {
      kontrol.target.copy(s.target);
      const sf = new THREE.Spherical().setFromVector3(_v.copy(s.pos).sub(s.target));
      if (langsung) {
        kamera.position.copy(s.pos);
        kamera.lookAt(s.target);
      } else {
        kontrol.target.set(kamera.position.x, 0, kamera.position.z);
        terbangOrbit(s.target, sf.radius, sf.phi, sf.theta, 1300);
      }
    }
    kirim('modeJalan', false);
    minta();
  }

  function langkahJalan(dt) {
    if (!modeJalan || terbang) return false;
    const t = jalan.tombol;
    if (!t.size) return false;
    const cepat = t.has('Shift') ? 10 : 4.5;
    let maju = 0, samping = 0, putar = 0;
    if (t.has('w') || t.has('ArrowUp')) maju += 1;
    if (t.has('s') || t.has('ArrowDown')) maju -= 1;
    if (t.has('a')) samping -= 1;
    if (t.has('d')) samping += 1;
    if (t.has('ArrowLeft') || t.has('q')) putar -= 1;
    if (t.has('ArrowRight') || t.has('e')) putar += 1;
    jalan.yaw += putar * dt * 1.4;
    const sy = Math.sin(jalan.yaw), cy = Math.cos(jalan.yaw);
    const x = THREE.MathUtils.clamp(kamera.position.x + (sy * maju + cy * samping) * cepat * dt, -BATAS_JALAN.x, BATAS_JALAN.x);
    const z = THREE.MathUtils.clamp(kamera.position.z + (-cy * maju + sy * samping) * cepat * dt, -BATAS_JALAN.z, BATAS_JALAN.z);
    const y = tinggiTanah(x, z, kamera.position.y - TINGGI_MATA) + TINGGI_MATA;
    kamera.position.set(x, THREE.MathUtils.lerp(kamera.position.y, y, Math.min(1, dt * 10)), z);
    arahkanKameraJalan();
    return true;
  }

  /* ---------- Tur otomatis ---------- */
  function mulaiTur() {
    if (modeJalan) keluarJalan({ langsung: true });
    if (tampilan === 'denah') aturTampilan('3d');
    const urutan = daftar.filter((d) => !saringan || d.data.kategori === saringan).map((d) => d.id);
    const awal = terpilih ? (urutan.indexOf(terpilih.id) + 1) % urutan.length : 0;
    tur = { urutan, indeks: awal, berikut: 0 };
    langkahTurBerikut();
    kirim('tur', true);
  }
  function langkahTurBerikut() {
    if (!tur) return;
    const id = tur.urutan[tur.indeks % tur.urutan.length];
    tur.indeks++;
    pilih(id, { terbang: true, sumber: 'tur' });
    tur.berikut = performance.now() + (kurangiGerak ? 7000 : 8500);
  }
  function hentikanTur() {
    if (!tur) return;
    tur = null;
    kontrol.autoRotate = false;
    kirim('tur', false);
  }
  function langkahTur(now) {
    if (!tur) return false;
    if (!terbang && !kurangiGerak) {
      kontrol.autoRotate = true;
      kontrol.autoRotateSpeed = 0.9;
    }
    if (now >= tur.berikut) {
      kontrol.autoRotate = false;
      langkahTurBerikut();
    }
    return false;
  }

  /* ---------- Interaksi penunjuk ---------- */
  const penunjuk = new THREE.Vector2();
  const penembakLayar = new THREE.Raycaster();
  function tembak(ev, objek) {
    const r = kanvas.getBoundingClientRect();
    penunjuk.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    penembakLayar.setFromCamera(penunjuk, kamera);
    return penembakLayar.intersectObjects(objek, false);
  }
  const idKaryaDari = (obj) => {
    for (let o = obj; o; o = o.parent) if (o.userData.karyaId) return o.userData.karyaId;
    return null;
  };

  let tekan = null;
  let tungguHover = null;
  kanvas.addEventListener('pointerdown', (ev) => {
    kanvas.focus({ preventScroll: true });
    tekan = { x: ev.clientX, y: ev.clientY, t: performance.now(), id: ev.pointerId, yaw: jalan.yaw, pitch: jalan.pitch, geser: false };
    if (tur) hentikanTur();
    // Animasi kamera boleh diputus dengan menyeret, kecuali transisi denah yang harus selesai agar kamera tegak lurus.
    if (terbang && terbang.jenis === 'orbit' && !terbang.selesai) terbang = null;
    if (modeJalan) kanvas.setPointerCapture(ev.pointerId);
  });
  kanvas.addEventListener('pointermove', (ev) => {
    if (modeJalan && tekan && tekan.id === ev.pointerId) {
      const dx = ev.clientX - tekan.x, dy = ev.clientY - tekan.y;
      if (Math.hypot(dx, dy) > 4) tekan.geser = true;
      const k = (kamera.fov / 60) * 0.0042;
      jalan.yaw = tekan.yaw - dx * k;
      jalan.pitch = THREE.MathUtils.clamp(tekan.pitch + dy * k, -1.25, 1.25);
      arahkanKameraJalan();
      minta();
      return;
    }
    if (ev.pointerType !== 'mouse' || ev.buttons) return;
    tungguHover = ev;
  });
  kanvas.addEventListener('pointerup', (ev) => {
    const t = tekan;
    tekan = null;
    if (!t || t.id !== ev.pointerId) return;
    if (t.geser || Math.hypot(ev.clientX - t.x, ev.clientY - t.y) > 6 || performance.now() - t.t > 600) return;
    const kena = tembak(ev, [...objekKlik, ...jalanSetapak])[0];
    if (!kena) return;
    const id = idKaryaDari(kena.object);
    if (modeJalan) {
      if (jalanSetapak.includes(kena.object) && kena.point.y < 4) pindahJalan(kena.point);
      else if (id) pilih(id, { terbang: false, sumber: 'klik' });
      return;
    }
    if (id) pilih(id, { terbang: true, sumber: 'klik' });
  });
  kanvas.addEventListener('dblclick', (ev) => {
    if (modeJalan || tampilan === 'denah') return;
    const kena = tembak(ev, [...objekKlik, ...jalanSetapak])[0];
    if (kena && jalanSetapak.includes(kena.object) && kena.point.y < 4) masukJalan(kena.point);
  });
  kanvas.addEventListener('pointerleave', () => {
    tungguHover = null;
    aturSorot(null);
  });
  // Roda tetikus menggulir halaman seperti biasa; zoom hanya dengan Ctrl/⌘, setelah peta diklik, atau di layar penuh.
  let layarPenuh = false;
  panggung.addEventListener('wheel', (ev) => {
    if (modeJalan || layarPenuh || ev.ctrlKey || ev.metaKey || document.activeElement === kanvas) return;
    ev.stopPropagation();
    kirim('petunjukRoda');
  }, { capture: true, passive: true });
  kanvas.addEventListener('wheel', (ev) => {
    if (tur) hentikanTur();
    if (!modeJalan) return;
    ev.preventDefault();
    kamera.fov = THREE.MathUtils.clamp(kamera.fov + Math.sign(ev.deltaY) * 4, 28, 80);
    kamera.updateProjectionMatrix();
    minta();
  }, { passive: false });

  function aturSorot(id) {
    if (sorot === id) return;
    sorot = id;
    for (const d of daftar) d.label.classList.toggle('jk-lbl--sorot', d.id === id);
    kanvas.style.cursor = id ? 'pointer' : '';
  }
  function prosesHover() {
    if (!tungguHover) return;
    const ev = tungguHover;
    tungguHover = null;
    const kena = tembak(ev, objekKlik)[0];
    aturSorot(kena ? idKaryaDari(kena.object) : null);
  }

  /* ---------- Papan ketik ---------- */
  const TOMBOL_JALAN = new Set(['w', 'a', 's', 'd', 'q', 'e', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Shift']);
  kanvas.addEventListener('keydown', (ev) => {
    const k = ev.key.length === 1 ? ev.key.toLowerCase() : ev.key;
    if (modeJalan) {
      if (k === 'Escape') { keluarJalan(); ev.preventDefault(); return; }
      if (TOMBOL_JALAN.has(k)) { jalan.tombol.add(k); ev.preventDefault(); }
      if (k === '+' || k === '=') zoom(1);
      if (k === '-') zoom(-1);
      return;
    }
    if (tur) hentikanTur();
    const sf = new THREE.Spherical().setFromVector3(_v.copy(kamera.position).sub(kontrol.target));
    if (k === 'ArrowLeft' || k === 'ArrowRight') {
      if (tampilan === 'denah') return;
      terbangOrbit(kontrol.target.clone(), sf.radius, sf.phi, sf.theta + (k === 'ArrowLeft' ? -0.35 : 0.35), 350);
      ev.preventDefault();
    } else if (k === 'ArrowUp' || k === 'ArrowDown') {
      const maju = new THREE.Vector3();
      kamera.getWorldDirection(maju);
      if (tampilan === 'denah') maju.set(0, 0, -1);
      maju.setY(0).normalize().multiplyScalar((k === 'ArrowUp' ? 1 : -1) * Math.max(8, sf.radius * 0.12));
      terbangOrbit(kontrol.target.clone().add(maju), sf.radius, sf.phi, sf.theta, 350);
      ev.preventDefault();
    } else if (k === '+' || k === '=') {
      zoom(1);
    } else if (k === '-') {
      zoom(-1);
    } else if (k === 'Enter' && tampilan !== 'denah') {
      penembakLayar.setFromCamera(penunjuk.set(0, 0), kamera);
      const kena = penembakLayar.intersectObjects(jalanSetapak, false)[0];
      masukJalan(kena ? kena.point : kontrol.target.clone());
      ev.preventDefault();
    } else if (k === 'Escape' && terpilih) {
      pilih(null, { terbang: false, sumber: 'papan' });
    }
  });
  kanvas.addEventListener('keyup', (ev) => {
    const k = ev.key.length === 1 ? ev.key.toLowerCase() : ev.key;
    jalan.tombol.delete(k);
  });
  kanvas.addEventListener('blur', () => jalan.tombol.clear());

  /* ---------- Ukuran dan putaran render ---------- */
  function ukurUlang() {
    const r = panggung.getBoundingClientRect();
    const w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
    if (w === lebarTinggi.w && h === lebarTinggi.h) return;
    lebarTinggi.w = w;
    lebarTinggi.h = h;
    renderer.setSize(w, h, false);
    kamera.aspect = w / h;
    terapkanGeser();
    minta();
  }
  let geserTengah = 0;
  let geserTujuan = 0;
  function terapkanGeser() {
    const { w, h } = lebarTinggi;
    if (geserTengah > 0 && w > geserTengah * 4) kamera.setViewOffset(w, h, geserTengah, 0, w, h);
    else kamera.clearViewOffset();
    kamera.updateProjectionMatrix();
  }
  // Panel detail muncul dan hilang mengikuti pilihan, jadi pergeseran pusat pandang dilunakkan agar peta tidak melompat.
  function langkahGeser(dt) {
    if (geserTengah === geserTujuan) return false;
    const sisa = geserTujuan - geserTengah;
    geserTengah = Math.abs(sisa) < 0.5 ? geserTujuan : geserTengah + sisa * (1 - Math.exp(-dt * 9));
    terapkanGeser();
    return true;
  }
  const pengamatUkuran = new ResizeObserver(ukurUlang);
  pengamatUkuran.observe(panggung);
  ukurUlang();

  function batasiTarget() {
    if (modeJalan) return;
    const t = kontrol.target;
    const x = THREE.MathUtils.clamp(t.x, -BATAS_TARGET.x, BATAS_TARGET.x);
    const z = THREE.MathUtils.clamp(t.z, -BATAS_TARGET.z, BATAS_TARGET.z);
    const y = THREE.MathUtils.clamp(t.y, 0, 30);
    if (x !== t.x || y !== t.y || z !== t.z) {
      _v.set(x - t.x, y - t.y, z - t.z);
      t.add(_v);
      kamera.position.add(_v);
    }
  }

  function langkahTransisi(now) {
    if (!transisi) return false;
    const t = Math.min(1, (now - transisi.mulai) / transisi.lama);
    const e = t * t * (3 - 2 * t);
    terapkanParameter(lerpParameter(transisi.dari, transisi.ke, e));
    if (t >= 1) {
      transisi = null;
      perbaruiEnv();
    }
    return true;
  }

  function langkahCincin(now) {
    if (!cincin.visible || !animCincin) return false;
    const t = (now - animCincin) / 1600;
    if (t >= 1) {
      animCincin = 0;
      cincin.material.opacity = 0.9;
      return true;
    }
    cincin.material.opacity = 0.45 + 0.45 * Math.abs(Math.sin(t * Math.PI * 2));
    return true;
  }

  function render() {
    langit.position.copy(kamera.position);
    bintang.position.copy(kamera.position);
    renderer.render(adegan, kamera);
    perbaruiLabel();
    kirimKompas();
  }

  function putaran(now) {
    if (!aktif) {
      idRaf = 0;
      return;
    }
    idRaf = requestAnimationFrame(putaran);
    const dt = Math.min(0.05, (now - waktuLalu) / 1000);
    waktuLalu = now;
    let berubah = false;
    if (langkahTerbang(now)) berubah = true;
    if (modeJalan) {
      if (langkahJalan(dt)) berubah = true;
    } else if (!terbang) {
      batasiTarget();
      if (kontrol.update()) berubah = true;
    }
    if (langkahTransisi(now)) berubah = true;
    if (langkahGeser(dt)) berubah = true;
    if (langkahCincin(now)) berubah = true;
    langkahTur(now);
    prosesHover();
    if (berubah || perluRender) {
      perluRender = false;
      render();
    }
  }

  function lanjutkan() {
    if (aktif) return;
    aktif = true;
    waktuLalu = performance.now();
    if (!idRaf) idRaf = requestAnimationFrame(putaran);
  }
  function jeda() {
    aktif = false;
    jalan.tombol.clear();
  }

  // Siapkan suasana awal, kompilasi shader, lalu tampilkan
  aturSuasana('otomatis', { langsung: true });
  await renderer.compileAsync?.(adegan, kamera);
  render();
  if (!kurangiGerak) terbangOrbit(ATAS_AWAL.target, ATAS_AWAL.jarak, ATAS_AWAL.polar, ATAS_AWAL.azimut, 2600);
  lanjutkan();

  return {
    kanvas,
    pilih: (id, opsi) => pilih(id, { sumber: 'ui', ...opsi }),
    saring,
    aturTampilan,
    zoom,
    aturSuasana,
    mulaiTur,
    hentikanTur,
    sedangTur: () => !!tur,
    lihatDekat: (id) => {
      const k = karyaDari(id);
      if (!k) return;
      if (modeJalan) keluarJalan({ langsung: true });
      if (tampilan === 'denah') aturTampilan('3d');
      terbangKe(k);
    },
    lihatDariJalan: (id) => {
      const k = karyaDari(id);
      if (!k) return;
      const [x, z] = k.kav.jalan;
      masukJalan(new THREE.Vector3(x, 0, z), { lihat: k.pusat.clone().setY(Math.min(k.tinggi * 0.45, 9)) });
    },
    keluarJalan: () => keluarJalan(),
    sedangJalan: () => modeJalan,
    aturLayarPenuh: (penuh) => { layarPenuh = penuh; },
    aturGeser: (px) => {
      if (Math.abs(px - geserTujuan) < 1) return;
      geserTujuan = px;
      if (kurangiGerak || !aktif) {
        geserTengah = px;
        terapkanGeser();
      }
      minta();
    },
    lanjutkan,
    jeda,
    ukurUlang,
    hancurkan: () => {
      jeda();
      pengamatUkuran.disconnect();
      kontrol.dispose();
      renderer.dispose();
      pmrem.dispose();
      kanvas.remove();
      lapisanLabel.replaceChildren();
    },
  };
}
