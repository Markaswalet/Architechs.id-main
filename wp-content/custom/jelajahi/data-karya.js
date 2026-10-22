/*
 * Data portofolio "Jelajahi Karya Studio Lentera" (halaman /tentang-kami, seksi #jelajahi).
 *
 * Teks di sini bisa diubah langsung tanpa build. Setiap karya terhubung ke model 3D
 * lewat `id` (lihat KAVLING di mesin-3d.js), jadi jangan ubah id kecuali modelnya ikut diganti.
 *
 * Kolom:
 *   id         kunci karya; juga dipakai untuk tautan langsung /tentang-kami/?karya=<id>#jelajahi
 *   judul      nama karya di label 3D, panel, dan daftar
 *   kategori   salah satu kunci KATEGORI di bawah (menentukan warna dan filter)
 *   ringkas    satu kalimat untuk kartu daftar
 *   deskripsi  paragraf di panel detail
 *   fakta      pasangan [label, nilai] yang tampil sebagai tabel kecil
 *   poin       poin desain (3–4 butir)
 *   galeri     gambar referensi (pakai ukuran kecil, mis. -300x180)
 *   tautan     tombol utama ke halaman terkait
 *   kataKunci  kata tambahan untuk kotak pencarian
 */

export const KATEGORI = {
  studio: { nama: 'Studio', warna: '#f2b630' },
  hunian: { nama: 'Hunian', warna: '#e0803a' },
  komersial: { nama: 'Komersial', warna: '#257cff' },
  ibadah: { nama: 'Ibadah', warna: '#16a08c' },
  industri: { nama: 'Industri', warna: '#7b68d9' },
  lanskap: { nama: 'Lanskap', warna: '#4f9e3a' },
};

export const KARYA = [
  {
    id: 'paviliun-lentera',
    judul: 'Paviliun Lentera',
    kategori: 'studio',
    ringkas: 'Titik awal penjelajahan: paviliun kayu yang menyala seperti lentera saat malam.',
    deskripsi:
      'Paviliun di tengah plaza ini menjadi simbol Studio Lentera. Rangka kayu berlapis kisi vertikal menyaring cahaya siang, lalu inti ruangnya menyala hangat saat malam, seperti lentera yang menuntun langkah.',
    fakta: [
      ['Fungsi', 'Galeri & ruang temu'],
      ['Struktur', 'Rangka kayu, kisi vertikal'],
      ['Lokasi di peta', 'Plaza pusat'],
    ],
    poin: [
      'Kisi kayu menyaring panas tanpa menutup pandangan',
      'Atap limas dengan teritis lebar untuk hujan tropis',
      'Inti ruang menyala menjadi penanda kawasan di malam hari',
    ],
    galeri: [],
    tautan: { label: 'Kunjungi studiolentera.com', href: 'https://studiolentera.com/' },
    kataKunci: 'lentera studio galeri plaza',
  },
  {
    id: 'rumah-tropis',
    judul: 'Rumah Tropis Modern',
    kategori: 'hunian',
    ringkas: 'Rumah dua lantai beratap limas lebar dengan kisi kayu dan carport.',
    deskripsi:
      'Rumah tinggal dua lantai untuk iklim tropis. Lantai atas dibuat menggantung di atas teras sehingga bagian depan rumah teduh sepanjang hari, sementara kisi kayu vertikal menjaga privasi kamar tanpa menghalangi angin.',
    fakta: [
      ['Fungsi', 'Rumah tinggal'],
      ['Lantai', '2'],
      ['Gaya', 'Tropis modern'],
    ],
    poin: [
      'Teritis atap lebar melindungi dinding dari panas dan hujan',
      'Lantai atas kantilever menjadi peneduh teras',
      'Kisi kayu vertikal untuk privasi dan sirkulasi udara',
      'Carport terbuka menyatu dengan taman depan',
    ],
    galeri: [
      '/wp-content/uploads/2026/10/tren-desain-rumah-2026-800x450.jpg',
      '/wp-content/uploads/2022/10/jasa-arsitek-rumah-1-300x180.jpg',
    ],
    tautan: { label: 'Lihat desain rumah', href: '/rumah' },
    kataKunci: 'rumah tinggal tropis carport kayu',
  },
  {
    id: 'rumah-split-level',
    judul: 'Rumah Split Level',
    kategori: 'hunian',
    ringkas: 'Rumah di lahan berkontur dengan lantai berselisih setengah tingkat.',
    deskripsi:
      'Rumah untuk lahan miring yang mengikuti kontur, bukan meratakannya. Tiga massa bangunan berselisih setengah lantai, sehingga ruang keluarga, ruang makan, dan kamar terhubung oleh tangga pendek dengan pandangan yang tetap lapang.',
    fakta: [
      ['Fungsi', 'Rumah tinggal'],
      ['Konsep', 'Split level, semibasemen'],
      ['Lahan', 'Berkontur'],
    ],
    poin: [
      'Massa bertingkat mengikuti kemiringan lahan',
      'Atap miring tunggal berlawanan arah memasukkan cahaya tinggi',
      'Dinding penahan tanah sekaligus menjadi taman berundak',
    ],
    galeri: ['/wp-content/uploads/2026/10/rumah-split-level-800x450.jpg'],
    tautan: { label: 'Baca: rumah split level', href: '/rumah-split-level' },
    kataKunci: 'split level kontur semibasemen miring rumah',
  },
  {
    id: 'villa-tepi-danau',
    judul: 'Villa Tepi Danau',
    kategori: 'hunian',
    ringkas: 'Villa beratap datar dengan dek kayu dan kolam renang menghadap danau.',
    deskripsi:
      'Villa peristirahatan yang membuka seluruh sisi depannya ke arah danau. Dek kayu, kolam renang, dan ruang keluarga berdinding kaca disusun satu garis pandang, sementara atap datar berteritis dalam menahan terik matahari sore.',
    fakta: [
      ['Fungsi', 'Villa peristirahatan'],
      ['Lantai', '2'],
      ['Fasilitas', 'Kolam renang, dek kayu'],
    ],
    poin: [
      'Ruang keluarga berdinding kaca menghadap danau',
      'Kolam renang menyatu dengan dek kayu',
      'Teritis atap dalam untuk menahan matahari sore',
    ],
    galeri: [
      '/wp-content/uploads/2022/10/jasa-arsitek-villa-1-300x214.jpg',
      '/wp-content/uploads/2022/11/arsitek-kolam-renang-1-300x180.jpg',
    ],
    tautan: { label: 'Lihat desain villa', href: '/villa' },
    kataKunci: 'villa kolam renang danau resort',
  },
  {
    id: 'masjid',
    judul: 'Masjid Kubah Hijau',
    kategori: 'ibadah',
    ringkas: 'Masjid dengan kubah, menara, serambi bertiang, dan pelataran wudu.',
    deskripsi:
      'Masjid berukuran sedang dengan ruang salat bebas kolom di bawah kubah. Serambi bertiang di sisi timur menjadi ruang peralihan yang teduh, dan pelataran depannya dilengkapi kolam wudu terbuka.',
    fakta: [
      ['Fungsi', 'Tempat ibadah'],
      ['Arah kiblat', 'Barat laut'],
      ['Elemen', 'Kubah, menara, serambi'],
    ],
    poin: [
      'Ruang salat bebas kolom di bawah kubah',
      'Serambi bertiang sebagai ruang peralihan yang teduh',
      'Jendela tinggi vertikal untuk cahaya dan ventilasi silang',
    ],
    galeri: [
      '/wp-content/uploads/2022/10/jasa-desain-arsitek-masjid-musholla-1-300x225.jpg',
      '/wp-content/uploads/2022/10/jasa-desain-arsitek-masjid-musholla-2-300x225.jpg',
    ],
    tautan: { label: 'Lihat desain masjid', href: '/masjid' },
    kataKunci: 'masjid musholla kubah menara ibadah',
  },
  {
    id: 'kantor',
    judul: 'Kantor Taman Atap',
    kategori: 'komersial',
    ringkas: 'Gedung kantor enam lantai dengan sirip fasad dan taman di atap.',
    deskripsi:
      'Gedung kantor enam lantai dengan fasad kaca yang dilindungi sirip vertikal untuk mengurangi silau. Atapnya dijadikan taman dan ruang istirahat karyawan, sekaligus menurunkan panas yang masuk ke lantai teratas.',
    fakta: [
      ['Fungsi', 'Kantor'],
      ['Lantai', '6 + taman atap'],
      ['Fasad', 'Kaca dengan sirip vertikal'],
    ],
    poin: [
      'Sirip vertikal mengurangi silau dan panas',
      'Taman atap sebagai ruang istirahat',
      'Lobi lantai dasar transparan menghadap plaza',
    ],
    galeri: [
      '/wp-content/uploads/2022/11/Arsitek-Kantor-1-300x180.jpg',
      '/wp-content/uploads/2022/11/jasa-arsitek-Rooftop-1-300x180.jpg',
    ],
    tautan: { label: 'Lihat desain kantor', href: '/kantor' },
    kataKunci: 'kantor gedung rooftop taman atap office',
  },
  {
    id: 'hotel',
    judul: 'Hotel Kota',
    kategori: 'komersial',
    ringkas: 'Menara hotel sepuluh lantai di atas podium dengan kolam renang.',
    deskripsi:
      'Hotel kota dengan menara kamar di atas podium dua lantai. Podium menampung lobi, restoran, dan kanopi penurunan tamu, sedangkan atapnya menjadi kolam renang dan taman yang dinikmati dari balkon kamar.',
    fakta: [
      ['Fungsi', 'Hotel'],
      ['Lantai', '2 podium + 10 menara'],
      ['Fasilitas', 'Kolam renang podium'],
    ],
    poin: [
      'Balkon di setiap kamar menghadap kota',
      'Kolam renang dan taman di atap podium',
      'Kanopi penurunan tamu di depan lobi',
    ],
    galeri: [
      '/wp-content/uploads/2022/10/desain-hotel-1-300x180.jpg',
      '/wp-content/uploads/2022/10/desain-hotel-2-300x180.jpg',
    ],
    tautan: { label: 'Lihat desain hotel', href: '/hotel' },
    kataKunci: 'hotel menara apartemen kolam',
  },
  {
    id: 'cafe',
    judul: 'Cafe Taman',
    kategori: 'komersial',
    ringkas: 'Cafe industrial berdinding kaca dengan teras pergola kayu.',
    deskripsi:
      'Cafe satu lantai bergaya industrial: rangka baja gelap, dinding beton ekspos, dan muka kaca penuh. Teras dek kayu berpergola menghadap danau sehingga pengunjung bisa memilih duduk di dalam atau di luar.',
    fakta: [
      ['Fungsi', 'Cafe & coffee shop'],
      ['Lantai', '1'],
      ['Gaya', 'Industrial'],
    ],
    poin: [
      'Muka kaca penuh menghadap teras',
      'Pergola kayu meneduhkan area duduk luar',
      'Rangka baja dan beton ekspos khas industrial',
    ],
    galeri: [
      '/wp-content/uploads/2022/10/jasa-arsitek-cafe-1-300x180.jpg',
      '/wp-content/uploads/2022/10/Interior-Cafe-Industrial-300x200.jpg',
    ],
    tautan: { label: 'Lihat desain cafe', href: '/cafe' },
    kataKunci: 'cafe kafe coffee shop kopi industrial',
  },
  {
    id: 'industri',
    judul: 'Pabrik & Gudang',
    kategori: 'industri',
    ringkas: 'Bangunan industri beratap gergaji dengan panel surya dan dok muat.',
    deskripsi:
      'Pabrik dan gudang dengan atap gergaji: bidang kacanya menghadap utara untuk cahaya alami yang merata, bidang miringnya dipasangi panel surya. Kantor pengelola berada di depan, dok muat di samping.',
    fakta: [
      ['Fungsi', 'Pabrik & gudang'],
      ['Atap', 'Gergaji (sawtooth)'],
      ['Energi', 'Panel surya atap'],
    ],
    poin: [
      'Atap gergaji memberi cahaya alami merata',
      'Panel surya di bidang atap miring',
      'Dok muat terpisah dari jalur pengunjung',
    ],
    galeri: [
      '/wp-content/uploads/2022/10/jasa-arsitek-pabrik-2-300x180.jpg',
      '/wp-content/uploads/2022/10/jasa-arsitek-pabrik-3-300x180.jpg',
    ],
    tautan: { label: 'Lihat desain industri', href: '/industri' },
    kataKunci: 'pabrik gudang industri warehouse',
  },
  {
    id: 'jembatan',
    judul: 'Jembatan Taman',
    kategori: 'lanskap',
    ringkas: 'Jembatan pejalan kaki melengkung yang melintasi danau.',
    deskripsi:
      'Jembatan pejalan kaki berlantai kayu yang melengkung di atas danau, ditopang lengkung baja ramping. Jembatan ini menghubungkan teras cafe dengan taman di seberang danau.',
    fakta: [
      ['Fungsi', 'Jembatan pejalan kaki'],
      ['Bentang', '± 24 m'],
      ['Material', 'Lantai kayu, lengkung baja'],
    ],
    poin: [
      'Lengkung baja ramping sebagai struktur utama',
      'Lantai kayu dengan pagar pengaman',
      'Menghubungkan dua sisi taman di tepi danau',
    ],
    galeri: [
      '/wp-content/uploads/2022/11/desain-jembatan-3-300x180.jpg',
      '/wp-content/uploads/2022/11/desain-jembatan-2-300x300.jpg',
    ],
    tautan: { label: 'Lihat desain jembatan', href: '/jembatan' },
    kataKunci: 'jembatan danau taman lanskap eksterior',
  },
];
