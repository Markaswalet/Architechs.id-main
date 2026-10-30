"""Mengolah ekspor GLB arsitektur (SketchUp/Enscape) menjadi model maket ringan untuk seksi
Jelajahi Karya di /tentang-kami (wp-content/custom/jelajahi/model/).

Hanya memakai pustaka bawaan Python. Langkah untuk karya baru:

  1. python alat/olah-glb.py daftar "<sumber.glb>" [node,...]
       Menampilkan kelompok node beserta jumlah segitiga, ukuran (meter) dan material,
       untuk memilah bangunan dari perabot, tanaman, dan orang.
  2. Tambahkan pengaturan karya di KARYA (node yang disimpan, batas tapak, peran material).
  3. python alat/olah-glb.py tekstur "<sumber.glb>" <id-karya> <folder>
       Menulis tekstur material yang dipakai + ukur.html; buka lewat server lokal untuk mengukur
       warna rata-rata, lalu isi WARNA di pengaturan karya.
  4. python alat/olah-glb.py bake "<sumber.glb>" <id-karya> wp-content/custom/jelajahi/model/<id-karya>.glb

Untuk model yang perabotnya bercampur dengan bangunan, pakai aturan `saring` (bukan daftar `simpan`), lalu
uji keterlihatan sebelum bake:

  python alat/olah-glb.py visibilitas "<sumber.glb>" <id-karya> _sementara
       Menulis geometri + uji.html; buka lewat server lokal, salin window.hasil ke alat/karya/<id-karya>-terlihat.json.
       Hanya mesh yang terlihat dari luar bangunan yang dipakai saat bake.

Hasil bake: satu mesh per peran material, posisi int16 ternormalisasi (KHR_mesh_quantization),
tanpa tekstur dan normal, titik asal di tengah tapak, depan bangunan menghadap +z.
Peran yang namanya sama dengan material mesin 3D (kaca, rumput, logam, kayu, putih) ditandai
`materialMesin` dan dibuat dua arah, karena material mesin bermuka tunggal.
"""
import base64
import json
import os
import re
import struct
import sys
from array import array
from collections import Counter

KARYA = {
    # K House .glb (SimLab GLTF dari SketchUp/Enscape). Depan rumah menghadap +z glTF
    # (dilihat dari titik kamera "Eksterior Tampak Depan").
    'kasang-house': {
        'simpan': [
            1695,                                  # dinding, lantai tapak, kerikil, rumput
            33,                                    # atap pelana + gording
            4067,                                  # jendela pita (clerestory) + talang
            4138,                                  # pergola carport + panel atap tembus cahaya
            4172,                                  # pagar samping panel berlubang
            483, 501, 519, 538, 2577, 2593,        # pintu
            1962, 2253,                            # roster tengah
            2504, 2529, 2554, 2571, 2573,          # elemen fasad depan
            482,                                   # garis tepi samping
        ],
        'buang': list(range(34, 358)) + [1701, 1708],  # kuda-kuda di bawah atap, bidang tanah 40 x 40 m
        'tapak': {'x': (11.95, 17.45), 'z': (-23.45, -1.85)},
        'peran': {
            3: 'dinding', 24: 'dinding', 47: 'roster',
            1: 'baja', 2: 'baja', 5: 'baja', 425: 'baja', 431: 'baja',
            7: 'abu', 430: 'abu', 0: 'logam', 6: 'kayu', 21: 'kerikil', 22: 'rumput', None: 'putih',
            48: 'kaca',
        },
        'kanopi': {48: [4138]},  # kaca di bawah node ini adalah atap tembus cahaya, bukan jendela
        'warna': {  # sRGB, kekasaran, kelogaman; dari rata-rata tekstur dan render Behance
            'dinding': (0x9d9b97, 0.92, 0), 'roster': (0xb1b0b3, 0.9, 0), 'baja': (0x2a2b2d, 0.55, 0.3),
            'abu': (0x5c5d5f, 0.7, 0.1), 'kerikil': (0x8a8785, 1, 0), 'kanopi': (0x9aa0a6, 0.3, 0),
        },
    },
    # SA House .glb (SimLab GLTF dari SketchUp/Enscape). Depan rumah menghadap +x glTF, ke jalan
    # (kamera "Tampak Depan SA H" dan "DEPAN EKSTERIOR"), jadi model diputar agar menghadap +z.
    'sa-house': {
        'saring': {
            'kecil': 3, 'ambang': 200,  # benda kurang dari 3 m dengan lebih dari 200 segitiga: perabot
            'nama': r'Kebun|Plant|Monstera|Potted|Tree|Pohon|Salix|Speak|Samsung|Air_cond|Chair|Sofa|Bed|Lamp|Objetos|BWC|wastafel|park_uno|ducha',
            'material': r'Leaf|Trunk|Salix|Sansevieria|Sweater|xiadele|Material #1|cone|^0216|Plastic|hitamlamp|Grass 02',  # Niraj_Shoe_Stitching bukan sepatu: itu sirip dan tangga
        },
        'terlihat': 'sa-house-terlihat.json',
        'putar_y': True,
        'y_tanah': -0.02,
        'y_min': 0.0,  # tanah sekitar lahan 1,4 m lebih rendah; pondasi di bawah muka tanah tidak dipakai
        'tapak': {'x': (5.4, 47.7), 'z': (-36.4, -22.0)},
        'buang_material': r'^AM134|^oblojka|^list_|^label_|aromawater|lavatrice|^105681866|^lampu$|^Material 54$',
        'peran_bawaan': 'dinding',
        'peran_nama': {
            '[0136_Charcoal]': 'baja', '[Color_008]2': 'baja', 'hitam k': 'baja', '[0137_Black]': 'baja', 'mirror_01': 'baja',
            '[Fencing Construction]1': 'baja', '[Fencing Construction]2': 'baja', '[Color_007]': 'baja',
            '[0135_DarkGray]': 'abu', '[0134_DimGray]': 'abu', 'Tiles 13': 'abu', '[Roofing Shingles Asphalt]': 'abu',
            '[Steel Brushed Stainless]': 'rel', '[Metal Silver]': 'rel', 'Iron 01, Stainless': 'rel', '[Aluminum]': 'rel', '[Metal Corrugated Shiny]': 'rel',
            '[0038_Orange]1': 'oranye', 'Niraj_Shoe_Stitching': 'sirip', 'TI X0049 CM1': 'sirip', '*3': 'sirip', '[Color A01]': 'sirip',
            '[Wood Cherry Original]': 'kayu', '[Wood Cherry Original]1': 'kayu', '[Wood Veneer 01]': 'kayu', '*16': 'kayu', '<auto>19': 'kayu',
            'Pavement 13, Herringbone': 'paving', '[Blacktop Old 01]1': 'paving', '[Blacktop Old 02]': 'paving', 'Concrete 05, Printed': 'paving',
            'Concrete 01': 'paving', 'Concrete 03': 'paving', '[Stone_Pavers_Flagstone_Gray]': 'paving', 'Stone 01, Wall_1': 'paving',
            '[Metal Seamed]': 'paving', '[Metal Seamed]1': 'paving', '*11': 'paving',
            '[Translucent Glass Gray]': 'kaca', '[Translucent Glass Gray]2': 'kaca', 'Glass 01, Pyramids': 'kaca', '[Mirror 02]': 'kaca',
            'Grass 03': 'rumput', '[Vegetation Grass]': 'rumput', '[Color_F18]1': 'rumput',
            '[Groundcover Wood Mix]': 'kerikil', '[Groundcover Rock Crushed 2 inch]': 'kerikil',
        },
        'warna': {  # sRGB, kekasaran, kelogaman; dari rata-rata tekstur dan render Drive
            'dinding': (0xeeeae3, 0.88, 0), 'baja': (0x2a2b2d, 0.55, 0.3), 'abu': (0x4f4d4c, 0.75, 0.1),
            'rel': (0xd2d4d5, 0.5, 0.2), 'oranye': (0xd8922f, 0.75, 0), 'sirip': (0xc98f4f, 0.8, 0),
            'paving': (0x8d8f90, 0.95, 0), 'kerikil': (0x867f7b, 1, 0),
        },
    },
}
MATERIAL_MESIN = {'kaca', 'rumput', 'logam', 'kayu', 'putih'}
KANOPI_OPASITAS = 0.45


def muat(sumber):
    data = open(sumber, 'rb').read()
    clen = struct.unpack_from('<I', data, 12)[0]
    g = json.loads(data[20:20 + clen])
    boff = 20 + clen
    blen = struct.unpack_from('<I', data, boff)[0]
    return g, memoryview(data)[boff + 8: boff + 8 + blen]


def kali(a, b):
    return [sum(a[r + 4 * k] * b[k + 4 * c] for k in range(4)) for c in range(4) for r in range(4)]


def matriks_lokal(nd):
    if 'matrix' in nd:
        return nd['matrix']
    t = nd.get('translation', [0, 0, 0]); s = nd.get('scale', [1, 1, 1]); x, y, z, w = nd.get('rotation', [0, 0, 0, 1])
    r = [1 - 2 * (y * y + z * z), 2 * (x * y + z * w), 2 * (x * z - y * w), 0,
         2 * (x * y - z * w), 1 - 2 * (x * x + z * z), 2 * (y * z + x * w), 0,
         2 * (x * z + y * w), 2 * (y * z - x * w), 1 - 2 * (x * x + y * y), 0, 0, 0, 0, 1]
    for c in range(3):
        for rr in range(3):
            r[rr + 4 * c] *= s[c]
    r[12], r[13], r[14] = t
    return r


class Model:
    def __init__(self, sumber):
        self.g, self.bin = muat(sumber)
        g = self.g
        self.nodes, self.acc, self.bvs, self.mats = g['nodes'], g['accessors'], g['bufferViews'], g.get('materials', [])
        self.dunia = [None] * len(self.nodes)
        self.induk = [None] * len(self.nodes)
        st = [(r, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]) for r in g['scenes'][g.get('scene', 0)]['nodes']]
        while st:
            n, m = st.pop()
            self.dunia[n] = kali(m, matriks_lokal(self.nodes[n]))
            for ch in self.nodes[n].get('children', []):
                self.induk[ch] = n
                st.append((ch, self.dunia[n]))

    def subpohon(self, n, buang=()):
        st, out = [n], []
        while st:
            k = st.pop()
            if k in buang:
                continue
            out.append(k)
            st.extend(self.nodes[k].get('children', []))
        return out

    def segitiga(self, prim):
        return self.acc[prim.get('indices', prim['attributes']['POSITION'])]['count'] // 3

    def baca(self, ai):
        a = self.acc[ai]
        bv = self.bvs[a['bufferView']]
        komp = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}[a['type']]
        kode = {5126: 'f', 5125: 'I', 5123: 'H', 5121: 'B'}[a['componentType']]
        ukuran = array(kode).itemsize
        mulai = bv.get('byteOffset', 0) + a.get('byteOffset', 0)
        langkah = bv.get('byteStride', ukuran * komp)
        arr = array(kode)
        if langkah == ukuran * komp:
            arr.frombytes(self.bin[mulai: mulai + a['count'] * komp * ukuran])
        else:
            for i in range(a['count']):
                o = mulai + i * langkah
                arr.frombytes(self.bin[o: o + komp * ukuran])
        return arr

    def batas(self, n):
        """Batas dunia (meter) dan ringkasan material untuk subpohon node n."""
        titik, tri, mc = [], 0, Counter()
        for k in self.subpohon(n):
            nd = self.nodes[k]
            if 'mesh' not in nd:
                continue
            m = self.dunia[k]
            for p in self.g['meshes'][nd['mesh']]['primitives']:
                a = self.acc[p['attributes']['POSITION']]
                for cx in (a['min'][0], a['max'][0]):
                    for cy in (a['min'][1], a['max'][1]):
                        for cz in (a['min'][2], a['max'][2]):
                            titik.append([m[0] * cx + m[4] * cy + m[8] * cz + m[12], m[1] * cx + m[5] * cy + m[9] * cz + m[13], m[2] * cx + m[6] * cy + m[10] * cz + m[14]])
                t = self.segitiga(p)
                tri += t
                mc[self.mats[p['material']].get('name') if 'material' in p else None] += t
        if not titik:
            return None
        lo = [min(p[i] for p in titik) for i in range(3)]
        hi = [max(p[i] for p in titik) for i in range(3)]
        return tri, lo, hi, mc

    def info_material(self, mi):
        m = self.mats[mi] if mi is not None else {}
        pbr = m.get('pbrMetallicRoughness', {})
        sg = m.get('extensions', {}).get('KHR_materials_pbrSpecularGlossiness', {})
        faktor = sg.get('diffuseFactor') or pbr.get('baseColorFactor') or [1, 1, 1, 1]
        tex = (sg.get('diffuseTexture') or pbr.get('baseColorTexture') or {}).get('index')
        return m.get('name'), faktor, (self.g['textures'][tex]['source'] if tex is not None else None)


def perintah_daftar(sumber, akar=None):
    md = Model(sumber)
    if akar is None:
        akar = md.g['scenes'][md.g.get('scene', 0)]['nodes']
    for r in akar:
        baris = []
        for ch in md.nodes[r].get('children', []) or [r]:
            b = md.batas(ch)
            if b:
                baris.append((ch, b))
        print(f'== anak node {r} ({md.nodes[r].get("name")}) ==')
        for ch, (t, lo, hi, mc) in sorted(baris, key=lambda x: -x[1][0]):
            sz = [hi[i] - lo[i] for i in range(3)]
            mm = ', '.join(f'{k}:{v}' for k, v in mc.most_common(3))
            print(f'[{ch}] {str(md.nodes[ch].get("name"))[:28]:28s} segitiga={t:7d} '
                  f'min=({lo[0]:6.2f},{lo[1]:5.2f},{lo[2]:6.2f}) ukuran=({sz[0]:5.2f},{sz[1]:5.2f},{sz[2]:5.2f}) | {mm}')


def daun_terpilih(md, cfg, pakai_terlihat=True):
    if 'simpan' in cfg:
        buang = set(cfg['buang'])
        return [k for r in cfg['simpan'] for k in md.subpohon(r, buang) if 'mesh' in md.nodes[k]]
    berkas = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'karya', cfg.get('terlihat', ''))
    if pakai_terlihat and os.path.isfile(berkas):
        return json.load(open(berkas))
    s = cfg['saring']
    pola_nama, pola_material = re.compile(s['nama'], re.I), re.compile(s['material'], re.I)
    hasil = []
    for k, nd in enumerate(md.nodes):
        if 'mesh' not in nd or md.dunia[k] is None:
            continue
        t, lo, hi, mc = md.batas(k)
        if max(hi[i] - lo[i] for i in range(3)) < s['kecil'] and t > s['ambang']:
            continue
        if pola_material.search(str(mc.most_common(1)[0][0])):
            continue
        n, nama = k, []
        while n is not None:
            nama.append(md.nodes[n].get('name') or '')
            n = md.induk[n]
        if not pola_nama.search(' '.join(nama)):
            hasil.append(k)
    return hasil


def posisi_dunia(md, k, p):
    m = md.dunia[k]
    pos = md.baca(p['attributes']['POSITION'])
    n = len(pos) // 3
    dp = array('f', bytes(12 * n))
    for i in range(n):
        x, y, z = pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]
        dp[3 * i] = m[0] * x + m[4] * y + m[8] * z + m[12]
        dp[3 * i + 1] = m[1] * x + m[5] * y + m[9] * z + m[13]
        dp[3 * i + 2] = m[2] * x + m[6] * y + m[10] * z + m[14]
    return dp, (md.baca(p['indices']) if 'indices' in p else range(n))


def di_tapak(cfg, dp, a, b, c):
    tapak = cfg['tapak']
    cx = (dp[3 * a] + dp[3 * b] + dp[3 * c]) / 3
    cy = (dp[3 * a + 1] + dp[3 * b + 1] + dp[3 * c + 1]) / 3
    cz = (dp[3 * a + 2] + dp[3 * b + 2] + dp[3 * c + 2]) / 3
    return tapak['x'][0] <= cx <= tapak['x'][1] and tapak['z'][0] <= cz <= tapak['z'][1] and cy >= cfg.get('y_min', -1e9)


UJI_HTML = """<!doctype html><meta charset="utf-8"><title>uji keterlihatan</title><script type="module">
import * as THREE from '/wp-content/custom/jelajahi/vendor/three-orbit.min.js';
const m = await (await fetch('meta.json')).json();
const pos = new Float32Array(await (await fetch('segitiga.bin')).arrayBuffer());
const id = new Uint32Array(await (await fetch('id.bin')).arrayBuffer());
const warna = new Uint8Array(id.length * 9);
id.forEach((v, t) => { const n = v + 1; for (let i = 0; i < 3; i++) { warna[t * 9 + i * 3] = n & 255; warna[t * 9 + i * 3 + 1] = (n >> 8) & 255; warna[t * 9 + i * 3 + 2] = (n >> 16) & 255; } });
const geo = new THREE.BufferGeometry();
geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
geo.setAttribute('warna', new THREE.BufferAttribute(warna, 3, true));
const mat = new THREE.ShaderMaterial({ side: THREE.DoubleSide, vertexShader: 'attribute vec3 warna; varying vec3 v; void main(){ v = warna; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }', fragmentShader: 'varying vec3 v; void main(){ gl_FragColor = vec4(v, 1.0); }' });
const adegan = new THREE.Scene(); adegan.add(new THREE.Mesh(geo, mat));
const r = new THREE.WebGLRenderer({ antialias: false }); r.setClearColor(0x000000, 1);
const S = 1024, rt = new THREE.WebGLRenderTarget(S, S, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter }); r.setRenderTarget(rt);
const kam = new THREE.PerspectiveCamera(50, 1, 0.3, 500), px = new Uint8Array(S * S * 4), hit = new Uint32Array(m.jumlah + 2);
const [cx, cz, hx, hz] = m.tapak, target = new THREE.Vector3(cx, 5, cz);
const uji = (x, y, z, tx, ty, tz) => { kam.position.set(x, y, z); kam.lookAt(tx, ty, tz); kam.updateMatrixWorld(); r.render(adegan, kam); r.readRenderTargetPixels(rt, 0, 0, S, S, px); for (let i = 0; i < px.length; i += 4) { const n = px[i] | (px[i + 1] << 8) | (px[i + 2] << 16); if (n) hit[n]++; } };
for (const d of [6, 16, 40]) for (let a = 0; a < 24; a++) for (const y of [1.6, 6, 14, 30, 60]) { const t = a / 24 * Math.PI * 2; uji(cx + Math.cos(t) * (hx + d), y, cz + Math.sin(t) * (hz + d), target.x, target.y, target.z); }
for (const y of [1.6, 5, 10]) { for (let t = -hx; t <= hx; t += 4) { uji(cx + t, y, cz + hz + 6, cx + t, y, cz); uji(cx + t, y, cz - hz - 6, cx + t, y, cz); } for (let t = -hz; t <= hz; t += 4) { uji(cx + hx + 6, y, cz + t, cx, y, cz + t); uji(cx - hx - 6, y, cz + t, cx, y, cz + t); } }
for (let a = -hx; a <= hx; a += 6) for (let b = -hz; b <= hz; b += 5) uji(cx + a, 30, cz + b + 0.01, cx + a, 0, cz + b);
const hasil = []; for (let i = 0; i < m.jumlah; i++) if (hit[i + 1] >= 3) hasil.push(m.daun[i]);
window.hasil = hasil; document.title = 'selesai ' + hasil.length + ' dari ' + m.jumlah;
</script>"""


def perintah_visibilitas(sumber, karya, folder):
    md, cfg = Model(sumber), KARYA[karya]
    os.makedirs(folder, exist_ok=True)
    daun = daun_terpilih(md, cfg, pakai_terlihat=False)
    pos, ids = array('f'), array('I')
    for i, k in enumerate(daun):
        for p in md.g['meshes'][md.nodes[k]['mesh']]['primitives']:
            if p.get('mode', 4) != 4:
                continue
            dp, idx = posisi_dunia(md, k, p)
            for t in range(0, len(idx) - 2, 3):
                a, b, c = idx[t], idx[t + 1], idx[t + 2]
                if di_tapak(cfg, dp, a, b, c):
                    for v in (a, b, c):
                        pos.extend(dp[3 * v: 3 * v + 3])
                    ids.append(i)
    open(os.path.join(folder, 'segitiga.bin'), 'wb').write(pos.tobytes())
    open(os.path.join(folder, 'id.bin'), 'wb').write(ids.tobytes())
    tp = cfg['tapak']
    json.dump({'daun': daun, 'jumlah': len(daun),
               'tapak': [(tp['x'][0] + tp['x'][1]) / 2, (tp['z'][0] + tp['z'][1]) / 2, (tp['x'][1] - tp['x'][0]) / 2, (tp['z'][1] - tp['z'][0]) / 2]},
              open(os.path.join(folder, 'meta.json'), 'w'))
    open(os.path.join(folder, 'uji.html'), 'w', encoding='utf-8').write(UJI_HTML)
    print(f'{len(daun)} mesh, {len(ids)} segitiga -> {folder}/uji.html')


def perintah_tekstur(sumber, karya, folder):
    md, cfg = Model(sumber), KARYA[karya]
    os.makedirs(folder, exist_ok=True)
    dipakai = Counter()
    for k in daun_terpilih(md, cfg):
        for p in md.g['meshes'][md.nodes[k]['mesh']]['primitives']:
            dipakai[p.get('material')] += md.segitiga(p)
    gambar = []
    for mi, n in dipakai.most_common():
        nama, faktor, img = md.info_material(mi)
        berkas = None
        if img is not None:
            im = md.g['images'][img]
            bv = md.bvs[im['bufferView']]
            raw = bytes(md.bin[bv.get('byteOffset', 0): bv.get('byteOffset', 0) + bv['byteLength']])
            mime = im.get('mimeType', 'image/png')
            berkas = f'm{mi}.' + ('png' if mime == 'image/png' else 'jpg')
            open(os.path.join(folder, berkas), 'wb').write(raw)
            gambar.append(f'<img data-mi="{mi}" src="data:{mime};base64,{base64.b64encode(raw).decode()}" width="96">')
        print(f'material {mi}: {nama!r} {n} segitiga faktor={[round(f, 3) for f in faktor]} tekstur={berkas}')
    # Gambar disisipkan sebagai data URL agar kanvas boleh dibaca; hasil ada di window.hasil
    open(os.path.join(folder, 'ukur.html'), 'w').write(
        '<!doctype html><meta charset="utf-8"><body>' + ''.join(gambar) +
        '<script>window.hasil={};addEventListener("load",()=>{for(const im of document.images){const c=document.createElement("canvas");'
        'c.width=c.height=64;const x=c.getContext("2d");x.drawImage(im,0,0,64,64);const d=x.getImageData(0,0,64,64).data;let r=0,g=0,b=0,n=0;'
        'for(let i=0;i<d.length;i+=4){if(d[i+3]<128)continue;r+=d[i];g+=d[i+1];b+=d[i+2];n++;}'
        'window.hasil[im.dataset.mi]=n?[r/n/255,g/n/255,b/n/255]:null;}document.title="selesai";});</script>')


def srgb_ke_linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def perintah_bake(sumber, karya, keluaran):
    md, cfg = Model(sumber), KARYA[karya]

    def akar_simpan(n):
        while n is not None:
            if n in cfg.get('simpan', ()):
                return n
            n = md.induk[n]

    def peran_dari(mi, akar):
        if akar in cfg.get('kanopi', {}).get(mi, []):
            return 'kanopi'
        nama = md.mats[mi].get('name') if mi is not None else None
        if 'buang_material' in cfg and nama and re.search(cfg['buang_material'], nama):
            return None
        if nama in cfg.get('peran_nama', {}):
            return cfg['peran_nama'][nama]
        return cfg.get('peran', {}).get(mi, cfg.get('peran_bawaan', 'putih'))

    kelompok = {}
    for k in daun_terpilih(md, cfg):
        m = md.dunia[k]
        det = m[0] * (m[5] * m[10] - m[9] * m[6]) - m[4] * (m[1] * m[10] - m[9] * m[2]) + m[8] * (m[1] * m[6] - m[5] * m[2])
        akar = akar_simpan(k)
        for p in md.g['meshes'][md.nodes[k]['mesh']]['primitives']:
            if p.get('mode', 4) != 4:
                continue
            dp, idx = posisi_dunia(md, k, p)
            peran = peran_dari(p.get('material'), akar)
            if peran is None:
                continue
            kel = kelompok.setdefault(peran, {'pos': array('f'), 'idx': array('I')})
            peta = {}
            for t in range(0, len(idx) - 2, 3):
                a, b, c = idx[t], idx[t + 1], idx[t + 2]
                if det < 0:  # node bercermin: putar balik urutan agar muka tetap menghadap keluar
                    b, c = c, b
                if not di_tapak(cfg, dp, a, b, c):
                    continue
                for v in (a, b, c):
                    if v not in peta:
                        peta[v] = len(kel['pos']) // 3
                        kel['pos'].extend(dp[3 * v: 3 * v + 3])
                    kel['idx'].append(peta[v])

    if cfg.get('putar_y'):  # depan +x menjadi depan +z
        for kel in kelompok.values():
            pos = kel['pos']
            for i in range(0, len(pos), 3):
                pos[i], pos[i + 2] = -pos[i + 2], pos[i]

    # Titik asal di tengah tapak, 2 cm di atas tanah kawasan agar tidak berkedip dengan rumput
    semua = [kel['pos'] for kel in kelompok.values()]
    lo = [min(min(p[a::3]) for p in semua) for a in range(3)]
    hi = [max(max(p[a::3]) for p in semua) for a in range(3)]
    geser = ((lo[0] + hi[0]) / 2, cfg.get('y_tanah', lo[1] - 0.02), (lo[2] + hi[2]) / 2)
    print(f'ukuran {hi[0] - lo[0]:.2f} x {hi[1] - lo[1]:.2f} x {hi[2] - lo[2]:.2f} m')

    biner = bytearray()
    views, accessors, meshes, materials, nodes = [], [], [], [], []

    def tambah_view(b, target, stride=None):
        while len(biner) % 4:
            biner.append(0)
        bv = {'buffer': 0, 'byteOffset': len(biner), 'byteLength': len(b), 'target': target}
        if stride:
            bv['byteStride'] = stride
        biner.extend(b)
        views.append(bv)
        return len(views) - 1

    total = 0
    for peran in sorted(kelompok):
        pos, idx = kelompok[peran]['pos'], kelompok[peran]['idx']
        for i in range(0, len(pos), 3):
            pos[i] -= geser[0]; pos[i + 1] -= geser[1]; pos[i + 2] -= geser[2]
        if peran in MATERIAL_MESIN:
            n = len(pos) // 3
            pos.extend(pos[:])
            balik = array('I')
            for t in range(0, len(idx), 3):
                balik.extend((idx[t] + n, idx[t + 2] + n, idx[t + 1] + n))
            idx.extend(balik)
        n = len(pos) // 3
        plo = [min(pos[a::3]) for a in range(3)]; phi = [max(pos[a::3]) for a in range(3)]
        pusat = [(plo[a] + phi[a]) / 2 for a in range(3)]
        setengah = max((phi[a] - plo[a]) / 2 for a in range(3)) or 1
        q = bytearray(); qmin = [32767] * 3; qmax = [-32767] * 3
        for i in range(n):
            for a in range(3):
                v = max(-32767, min(32767, round((pos[3 * i + a] - pusat[a]) / setengah * 32767)))
                qmin[a] = min(qmin[a], v); qmax[a] = max(qmax[a], v)
                q += struct.pack('<h', v)
            q += b'\x00\x00'
        accessors.append({'bufferView': tambah_view(bytes(q), 34962, 8), 'componentType': 5122, 'normalized': True,
                          'count': n, 'type': 'VEC3', 'min': qmin, 'max': qmax})
        apos = len(accessors) - 1
        kecil = n <= 65535
        accessors.append({'bufferView': tambah_view(array('H' if kecil else 'I', idx).tobytes(), 34963),
                          'componentType': 5123 if kecil else 5125, 'count': len(idx), 'type': 'SCALAR'})
        warna, kasar, logam = cfg['warna'].get(peran, (0xffffff, 0.9, 0))
        rgb = [srgb_ke_linear(((warna >> s) & 255) / 255) for s in (16, 8, 0)]
        mat = {'name': peran, 'doubleSided': peran not in MATERIAL_MESIN,
               'pbrMetallicRoughness': {'baseColorFactor': rgb + [KANOPI_OPASITAS if peran == 'kanopi' else 1],
                                        'metallicFactor': logam, 'roughnessFactor': kasar},
               'extras': {'peran': peran, 'materialMesin': peran in MATERIAL_MESIN}}
        if peran == 'kanopi':
            mat['alphaMode'] = 'BLEND'
        materials.append(mat)
        meshes.append({'name': peran, 'primitives': [{'attributes': {'POSITION': apos}, 'indices': apos + 1, 'material': len(materials) - 1}]})
        nodes.append({'name': peran, 'mesh': len(meshes) - 1, 'translation': pusat, 'scale': [setengah] * 3})
        total += len(idx) // 3
        print(f'{peran:8s} {len(idx) // 3:6d} segitiga {n:6d} titik')

    while len(biner) % 4:
        biner.append(0)
    gltf = {
        'asset': {'version': '2.0', 'generator': 'alat/olah-glb.py (Jelajahi Karya)'},
        'extensionsUsed': ['KHR_mesh_quantization'], 'extensionsRequired': ['KHR_mesh_quantization'],
        'scene': 0, 'scenes': [{'nodes': list(range(len(nodes)))}], 'nodes': nodes, 'meshes': meshes,
        'materials': materials, 'accessors': accessors, 'bufferViews': views, 'buffers': [{'byteLength': len(biner)}],
    }
    js = json.dumps(gltf, separators=(',', ':')).encode()
    js += b' ' * ((4 - len(js) % 4) % 4)
    panjang = 12 + 8 + len(js) + 8 + len(biner)
    with open(keluaran, 'wb') as f:
        f.write(struct.pack('<III', 0x46546C67, 2, panjang))
        f.write(struct.pack('<II', len(js), 0x4E4F534A)); f.write(js)
        f.write(struct.pack('<II', len(biner), 0x004E4942)); f.write(biner)
    print(f'total {total} segitiga, berkas {panjang / 1e6:.2f} MB -> {keluaran}')


if __name__ == '__main__':
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    mode, sumber = sys.argv[1], sys.argv[2]
    if mode == 'daftar':
        perintah_daftar(sumber, [int(x) for x in sys.argv[3].split(',')] if len(sys.argv) > 3 else None)
    elif mode == 'tekstur':
        perintah_tekstur(sumber, sys.argv[3], sys.argv[4])
    elif mode == 'visibilitas':
        perintah_visibilitas(sumber, sys.argv[3], sys.argv[4])
    elif mode == 'bake':
        perintah_bake(sumber, sys.argv[3], sys.argv[4])
    else:
        sys.exit(__doc__)
