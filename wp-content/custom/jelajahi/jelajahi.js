/*
 * Penjelajah karya 3D Studio Lentera (seksi #jelajahi di /tentang-kami).
 * Mengatur bilah alat, panel detail, daftar karya, dan memuat mesin-3d.js
 * hanya saat seksi mendekati layar. Panel dan daftar tetap berfungsi tanpa WebGL.
 */
import { KARYA, KATEGORI } from './data-karya.js?ver=3';

const NOMOR_WA = '6282229540204';

function esc(teks) {
  return String(teks).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

const normal = (t) => t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

function dukungWebGL() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGL2RenderingContext && c.getContext('webgl2'));
  } catch {
    return false;
  }
}

function mulai(akar) {
  const $ = (s) => akar.querySelector(s);
  const penjelajah = $('.jk-penjelajah');
  const area = $('.jk-area');
  const panggung = $('.jk-panggung');
  const poster = $('.jk-poster');
  const statusMuat = $('.jk-muat-teks');
  const lapisanLabel = $('.jk-label');
  const panel = $('.jk-panel');
  const panelDetail = $('.jk-panel-detail');
  const pita = $('.jk-pita');
  const daftar = $('.jk-daftar');
  const cari = $('#jk-cari');
  const jumlahHasil = $('.jk-jumlah');
  const saringGrup = $('.jk-saring');
  const tombolTur = $('.jk-tur');
  const tombolPenuh = $('.jk-penuh');
  const pilihSuasana = $('.jk-suasana select');
  const petunjuk = $('.jk-petunjuk');
  const tombolKeluarJalan = $('.jk-keluar-jalan');
  const gerbang = $('.jk-gerbang');
  const tombolKunci = $('.jk-kunci');
  const kompas = $('.jk-kompas');
  const jarum = $('.jk-kompas-jarum');
  const mataharinya = $('.jk-kompas-matahari');
  const toast = $('.jk-toast');
  const umum = $('.jk-umum');

  const kurangiGerak = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const sentuh = matchMedia('(pointer: coarse)').matches;
  const sempit = () => matchMedia('(max-width: 760px)').matches;
  const urutan = KARYA.map((k) => k.id);
  const dataDari = (id) => KARYA.find((k) => k.id === id);
  const PETUNJUK_ORBIT = sentuh
    ? 'Geser untuk memutar, cubit untuk zoom, ketuk bangunan untuk detail.'
    : 'Seret untuk memutar · klik bangunan untuk detail · klik ganda jalan setapak untuk mode jalan.';
  const PETUNJUK_DENAH = sentuh
    ? 'Geser untuk berpindah, cubit untuk zoom, ketuk bangunan untuk detail.'
    : 'Seret untuk menggeser denah · Ctrl + scroll untuk zoom · klik bangunan untuk detail.';
  const PETUNJUK_JALAN = sentuh
    ? 'Geser untuk melihat sekeliling, ketuk jalan untuk berpindah.'
    : 'Seret untuk melihat sekeliling · klik jalan untuk berpindah · W A S D untuk berjalan · Esc untuk keluar.';

  let mesin = null;
  let rodaTerakhir = 0;
  let idTerpilih = null;
  let saringan = null;
  let kataCari = '';

  /* ---------- Chip kategori dan daftar karya ---------- */
  const kategoriDipakai = [...new Set(KARYA.map((k) => k.kategori))].filter((k) => k !== 'studio');
  saringGrup.insertAdjacentHTML(
    'beforeend',
    kategoriDipakai
      .map((k) => `<button type="button" class="jk-chip" data-kategori="${esc(k)}" aria-pressed="false" style="--warna:${KATEGORI[k].warna}"><i aria-hidden="true"></i>${esc(KATEGORI[k].nama)}</button>`)
      .join(''),
  );

  daftar.innerHTML = KARYA.map((k) => {
    const kat = KATEGORI[k.kategori];
    return `<li><button type="button" class="jk-kartu" data-karya="${esc(k.id)}" style="--warna:${kat.warna}">
      <span class="jk-kartu-kat"><i aria-hidden="true"></i>${esc(kat.nama)}</span>
      <strong class="jk-kartu-judul">${esc(k.judul)}</strong>
      <span class="jk-kartu-ringkas">${esc(k.ringkas)}</span>
    </button></li>`;
  }).join('');

  function terapkanSaring() {
    const q = normal(kataCari.trim());
    let n = 0;
    for (const li of daftar.children) {
      const k = dataDari(li.firstElementChild.dataset.karya);
      const teks = normal(`${k.judul} ${k.ringkas} ${KATEGORI[k.kategori].nama} ${k.kataKunci || ''}`);
      const cocok = (!saringan || k.kategori === saringan) && (!q || q.split(/\s+/).every((kata) => teks.includes(kata)));
      li.hidden = !cocok;
      if (cocok) n++;
    }
    jumlahHasil.textContent = q || saringan ? `${n} karya cocok` : '';
    return n;
  }

  saringGrup.addEventListener('click', (ev) => {
    const b = ev.target.closest('.jk-chip');
    if (!b) return;
    saringan = b.dataset.kategori || null;
    for (const c of saringGrup.querySelectorAll('.jk-chip')) c.setAttribute('aria-pressed', String(c === b));
    mesin?.saring(saringan);
    terapkanSaring();
  });

  cari.addEventListener('input', () => {
    kataCari = cari.value;
    terapkanSaring();
  });
  cari.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Enter') return;
    ev.preventDefault();
    const pertama = [...daftar.children].find((li) => !li.hidden);
    if (pertama) pilih(pertama.firstElementChild.dataset.karya, { gulir: true });
    else tampilkanToast('Karya tidak ditemukan. Coba kata lain, mis. "villa" atau "masjid".');
  });

  daftar.addEventListener('click', (ev) => {
    const b = ev.target.closest('.jk-kartu');
    if (b) pilih(b.dataset.karya, { gulir: true });
  });

  /* ---------- Panel detail ---------- */
  function htmlDetail(k) {
    const kat = KATEGORI[k.kategori];
    const i = urutan.indexOf(k.id);
    const sebelum = dataDari(urutan[(i - 1 + urutan.length) % urutan.length]);
    const sesudah = dataDari(urutan[(i + 1) % urutan.length]);
    const luar = /^https?:/.test(k.tautan.href);
    const pesan = `Halo, saya tertarik dengan desain seperti "${k.judul}" dari portofolio Studio Lentera di architechs.id. Bisa dibantu konsultasinya?`;
    const ada3D = !!mesin;
    return `
      <div class="jk-panel-kepala">
        <span class="jk-tag" style="--warna:${kat.warna}">${esc(kat.nama)}</span>
        <button type="button" class="jk-tutup" data-aksi="tutup" aria-label="Tutup detail">×</button>
      </div>
      <h3 class="jk-panel-judul" tabindex="-1">${esc(k.judul)}</h3>
      <p class="jk-panel-teks">${esc(k.deskripsi)}</p>
      <dl class="jk-fakta">${k.fakta.map(([a, b]) => `<div><dt>${esc(a)}</dt><dd>${esc(b)}</dd></div>`).join('')}</dl>
      <ul class="jk-poin">${k.poin.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>
      ${k.galeri.length ? `<p class="jk-mini-judul">Referensi desain</p><div class="jk-galeri">${k.galeri
        .map((src) => `<a href="${esc(k.tautan.href)}"${luar ? ' target="_blank" rel="noopener"' : ''}><img src="${esc(src)}" alt="Referensi desain ${esc(kat.nama.toLowerCase())}: ${esc(k.judul)}" loading="lazy" decoding="async"></a>`)
        .join('')}</div>` : ''}
      <div class="jk-aksi">
        <a class="jk-tombol" href="${esc(k.tautan.href)}"${luar ? ' target="_blank" rel="noopener"' : ''}>${esc(k.tautan.label)}</a>
        <a class="jk-tombol jk-tombol--garis" href="https://api.whatsapp.com/send?phone=${NOMOR_WA}&text=${encodeURIComponent(pesan)}" target="_blank" rel="noopener">Konsultasi desain serupa</a>
      </div>
      <div class="jk-aksi-kecil">
        ${ada3D ? '<button type="button" data-aksi="dekat">Lihat dekat</button><button type="button" data-aksi="jalan">Lihat dari jalan</button>' : ''}
        <button type="button" data-aksi="salin">Salin tautan</button>
      </div>
      <nav class="jk-navigasi" aria-label="Karya lain">
        <button type="button" data-aksi="pindah" data-ke="${esc(sebelum.id)}"><span aria-hidden="true">‹</span> ${esc(sebelum.judul)}</button>
        <button type="button" data-aksi="pindah" data-ke="${esc(sesudah.id)}">${esc(sesudah.judul)} <span aria-hidden="true">›</span></button>
      </nav>`;
  }

  function tampilkanPanel(id) {
    const k = id && dataDari(id);
    idTerpilih = k ? k.id : null;
    for (const b of daftar.querySelectorAll('.jk-kartu')) b.setAttribute('aria-current', String(b.dataset.karya === idTerpilih));
    area.classList.toggle('jk-area--ada-pilihan', !!k);
    if (!k) {
      panelDetail.hidden = true;
      panelDetail.innerHTML = '';
      pita.hidden = true;
      return;
    }
    panelDetail.innerHTML = htmlDetail(k);
    panelDetail.hidden = false;
    panel.scrollTop = 0;
    pita.hidden = false;
    pita.querySelector('.jk-pita-judul').textContent = k.judul;
    pita.style.setProperty('--warna', KATEGORI[k.kategori].warna);
    umum.textContent = `${k.judul} dipilih.`;
  }

  function pilih(id, { gulir = false } = {}) {
    if (!dataDari(id)) return;
    if (mesin) mesin.pilih(id);
    else tampilkanPanel(id);
    if (gulir) {
      const r = penjelajah.getBoundingClientRect();
      if (r.top < 0 || r.top > window.innerHeight * 0.4) penjelajah.scrollIntoView({ behavior: kurangiGerak ? 'auto' : 'smooth', block: 'start' });
    }
  }

  panel.addEventListener('click', async (ev) => {
    const b = ev.target.closest('[data-aksi]');
    if (!b) return;
    const aksi = b.dataset.aksi;
    if (aksi === 'tutup') {
      if (mesin) mesin.pilih(null, { terbang: false });
      else tampilkanPanel(null);
    } else if (aksi === 'pindah') {
      pilih(b.dataset.ke);
      panelDetail.querySelector('.jk-panel-judul')?.focus({ preventScroll: true });
    } else if (aksi === 'dekat') {
      mesin?.lihatDekat(idTerpilih);
    } else if (aksi === 'jalan') {
      mesin?.lihatDariJalan(idTerpilih);
    } else if (aksi === 'salin') {
      const url = `${location.origin}${location.pathname}?karya=${encodeURIComponent(idTerpilih)}#jelajahi`;
      try {
        await navigator.clipboard.writeText(url);
        tampilkanToast('Tautan karya disalin.');
      } catch {
        window.prompt('Salin tautan karya ini:', url);
      }
    }
  });

  pita.addEventListener('click', () => panel.scrollIntoView({ behavior: kurangiGerak ? 'auto' : 'smooth', block: 'start' }));

  /* ---------- Toast ---------- */
  let waktuToast = 0;
  function tampilkanToast(pesan, lama = 2400) {
    toast.textContent = pesan;
    toast.hidden = false;
    clearTimeout(waktuToast);
    waktuToast = setTimeout(() => { toast.hidden = true; }, lama);
  }

  /* ---------- Bilah alat ---------- */
  akar.querySelectorAll('[data-tampilan]').forEach((b) => b.addEventListener('click', () => mesin?.aturTampilan(b.dataset.tampilan)));
  akar.querySelectorAll('[data-zoom]').forEach((b) => b.addEventListener('click', () => mesin?.zoom(b.dataset.zoom === '+' ? 1 : -1)));

  function mulaiTur() {
    if (!mesin) return;
    if (mesin.sedangTur()) mesin.hentikanTur();
    else mesin.mulaiTur();
  }
  tombolTur.addEventListener('click', mulaiTur);

  pilihSuasana.addEventListener('change', () => {
    mesin?.aturSuasana(pilihSuasana.value);
    try { localStorage.setItem('jk-suasana', pilihSuasana.value); } catch {}
  });
  try {
    const tersimpan = localStorage.getItem('jk-suasana');
    if (tersimpan && pilihSuasana.querySelector(`option[value="${tersimpan}"]`)) pilihSuasana.value = tersimpan;
  } catch {}
  setInterval(() => { if (mesin && pilihSuasana.value === 'otomatis') mesin.aturSuasana('otomatis'); }, 60000);

  tombolKeluarJalan.addEventListener('click', () => mesin?.keluarJalan());

  /* ---------- Layar penuh ---------- */
  const penuhAsli = () => document.fullscreenElement === penjelajah;
  function aturPenuh(penuh) {
    penjelajah.classList.toggle('jk-penjelajah--penuh', penuh);
    document.documentElement.classList.toggle('jk-kunci-gulir', penuh && !penuhAsli());
    tombolPenuh.setAttribute('aria-pressed', String(penuh));
    tombolPenuh.setAttribute('aria-label', penuh ? 'Keluar layar penuh' : 'Layar penuh');
    tombolPenuh.title = penuh ? 'Keluar layar penuh' : 'Layar penuh';
    if (penuh) bukaKunci();
    mesin?.aturLayarPenuh(penuh);
  }
  tombolPenuh.addEventListener('click', async () => {
    const sedang = penjelajah.classList.contains('jk-penjelajah--penuh');
    if (sedang) {
      if (penuhAsli()) await document.exitFullscreen().catch(() => {});
      aturPenuh(false);
      return;
    }
    if (document.fullscreenEnabled && penjelajah.requestFullscreen) {
      try {
        await penjelajah.requestFullscreen({ navigationUI: 'hide' });
      } catch {}
    }
    aturPenuh(true);
  });
  document.addEventListener('fullscreenchange', () => {
    if (!penuhAsli() && penjelajah.classList.contains('jk-penjelajah--penuh')) aturPenuh(false);
  });
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && penjelajah.classList.contains('jk-penjelajah--penuh') && !penuhAsli() && !mesin?.sedangJalan()) aturPenuh(false);
  });

  /* ---------- Kunci sentuh: di layar sentuh, peta baru menerima geseran setelah diketuk ---------- */
  function kunci() {
    if (!sentuh || penjelajah.classList.contains('jk-penjelajah--penuh')) return;
    area.classList.add('jk-area--terkunci');
    gerbang.hidden = false;
    tombolKunci.hidden = true;
  }
  function bukaKunci() {
    area.classList.remove('jk-area--terkunci');
    gerbang.hidden = true;
    tombolKunci.hidden = !sentuh;
  }
  gerbang.addEventListener('click', () => {
    bukaKunci();
    mesin?.kanvas.focus({ preventScroll: true });
  });
  tombolKunci.addEventListener('click', kunci);
  if (sentuh) kunci();

  /* ---------- Kompas ---------- */
  let arahLalu = null;
  function perbaruiKompas(arah, azimutMatahari, suasana) {
    if (arahLalu !== null && Math.abs(arah - arahLalu) < 0.3 && kompas.dataset.suasana === suasana) return;
    arahLalu = arah;
    jarum.style.transform = `rotate(${-arah}deg)`;
    mataharinya.style.transform = `rotate(${azimutMatahari - arah}deg)`;
    kompas.dataset.suasana = suasana;
    mataharinya.removeAttribute('hidden');
  }

  /* ---------- Muat mesin 3D ---------- */
  let sedangMuat = false;
  async function muatMesin() {
    if (sedangMuat || mesin) return;
    sedangMuat = true;
    if (!dukungWebGL()) {
      gagal('Perangkat atau peramban ini belum mendukung tampilan 3D. Jelajahi karya lewat daftar di bawah.');
      return;
    }
    try {
      const { buatMesin } = await import('./mesin-3d.js?ver=4');
      const kecil = sempit() || (navigator.hardwareConcurrency || 8) <= 4;
      mesin = await buatMesin({
        panggung,
        lapisanLabel,
        karya: KARYA,
        kategori: KATEGORI,
        kualitas: kecil ? 'rendah' : 'tinggi',
        kurangiGerak,
        peristiwa: {
          pilih: (id) => tampilkanPanel(id),
          kompas: perbaruiKompas,
          tampilan: (nama) => {
            akar.querySelectorAll('[data-tampilan]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tampilan === nama)));
            petunjuk.textContent = nama === 'denah' ? PETUNJUK_DENAH : PETUNJUK_ORBIT;
          },
          tur: (aktif) => {
            tombolTur.setAttribute('aria-pressed', String(aktif));
            tombolTur.querySelector('span').textContent = aktif ? 'Hentikan tur' : 'Tur karya';
            umum.textContent = aktif ? 'Tur karya dimulai.' : 'Tur karya dihentikan.';
          },
          modeJalan: (aktif) => {
            tombolKeluarJalan.hidden = !aktif;
            petunjuk.textContent = aktif ? PETUNJUK_JALAN : PETUNJUK_ORBIT;
            area.classList.toggle('jk-area--jalan', aktif);
            umum.textContent = aktif ? 'Mode jalan aktif.' : 'Kembali ke tampilan kawasan.';
          },
          petunjukRoda: () => {
            if (performance.now() - rodaTerakhir < 4000) return;
            rodaTerakhir = performance.now();
            tampilkanToast(`Tahan ${/Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl'} sambil scroll untuk zoom, atau klik peta terlebih dahulu.`);
          },
        },
      });
      mesin.aturSuasana(pilihSuasana.value, { langsung: true });
      if (saringan) mesin.saring(saringan);
      if (idTerpilih) mesin.pilih(idTerpilih);
      mesin.kanvas.setAttribute('aria-describedby', 'jk-petunjuk-papan');
      aturGeser();
      new ResizeObserver(aturGeser).observe(panel);
      area.classList.add('jk-area--siap');
      poster.setAttribute('aria-hidden', 'true');
      akar.querySelectorAll('.jk-perlu-3d').forEach((el) => { el.disabled = false; });
      pantauTampak();
    } catch (galat) {
      console.error('[Jelajahi Karya]', galat);
      gagal('Tampilan 3D gagal dimuat. Jelajahi karya lewat daftar di bawah.');
    }
  }
  // Panel detail melayang di kanan menutupi sebagian peta, jadi selama panel tampil titik fokus kamera digeser ke tengah area yang terlihat.
  function aturGeser() {
    if (!mesin) return;
    const melayang = getComputedStyle(panel).position === 'absolute' && getComputedStyle(panel).display !== 'none';
    mesin.aturGeser(melayang ? (panel.offsetWidth + 14) / 2 : 0);
  }

  function gagal(pesan) {
    area.classList.add('jk-area--gagal');
    statusMuat.textContent = pesan;
    gerbang.hidden = true;
  }

  function pantauTampak() {
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) mesin.lanjutkan();
      else {
        mesin.jeda();
        if (!penjelajah.classList.contains('jk-penjelajah--penuh')) kunci();
      }
    }, { threshold: 0 });
    io.observe(panggung);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) mesin.jeda();
      else if (panggung.getBoundingClientRect().bottom > 0 && panggung.getBoundingClientRect().top < window.innerHeight) mesin.lanjutkan();
    });
  }

  // Tautan langsung: /tentang-kami/?karya=<id>#jelajahi
  const idAwal = new URLSearchParams(location.search).get('karya');
  if (dataDari(idAwal)) {
    tampilkanPanel(idAwal);
    if (!location.hash) requestAnimationFrame(() => akar.scrollIntoView({ block: 'start' }));
  }

  petunjuk.textContent = PETUNJUK_ORBIT;
  terapkanSaring();
  if ('IntersectionObserver' in window) {
    const pemicu = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) {
        pemicu.disconnect();
        muatMesin();
      }
    }, { rootMargin: '600px 0px' });
    pemicu.observe(area);
  } else {
    muatMesin();
  }
}

const akar = document.getElementById('jelajahi');
if (akar) mulai(akar);
