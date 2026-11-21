/* Prediksi Listrik - logika tampilan.
   Semua perhitungan dilakukan model Python lewat API (/api/...).
   File ini hanya mengumpulkan input, memanggil API, dan menggambar hasilnya. */
(() => {
  'use strict';

  // ---------------------------------------------------------------- utilitas
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const fmtInt = (n) => Math.round(n).toLocaleString('id-ID');
  const fmtDec = (n, d = 1) => n.toLocaleString('id-ID', { minimumFractionDigits: d, maximumFractionDigits: d });
  const fmtJam = (n) => n.toLocaleString('id-ID', { maximumFractionDigits: 1 });
  const rp = (n) => 'Rp ' + fmtInt(n);   // spasi tak terputus: "Rp" tidak terpisah dari angkanya
  const rb = (n) => fmtInt(n / 1000) + ' rb';
  const pct = (n, d = 1) => fmtDec(n * 100, d) + '%';
  const tanda = (n) => (n >= 0 ? '+' : '−') + rp(Math.abs(n));
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const DEFAULT = {
    electric_power_va: 1300,
    num_occupants: 4,
    num_ac_units: 2,
    ac_hours_per_day: 6,
    num_refrigerators: 1,
    tv_laptop_hours_per_day: 4,
    has_washing_machine: 1,
  };
  const KUNCI_SIMPAN = 'prediksi-listrik:rumah';
  const TABS = ['prediksi', 'simulasi', 'token', 'model'];

  const WARNA_ASAL = {
    'AC': '#ffc62e',
    'Kulkas': '#86a6ff',
    'Jumlah penghuni': '#46e0b3',
    'Biaya dasar & daya VA': '#b79dff',
    'TV / laptop': '#ff8b7e',
    'Mesin cuci': '#93a5c6',
  };
  const NAMA_ASAL = {
    'TV / laptop': 'TV dan laptop',
    'Biaya dasar & daya VA': 'Biaya dasar dan daya VA',
  };
  const URUT_KATEGORI = ['Hemat', 'Normal', 'Boros'];

  // ------------------------------------------------------------------- state
  let rumah = muatRumah();
  let meta = null;
  let hasil = null;       // hasil /api/predict untuk rumah sekarang
  let simData = null;
  let tab = 'prediksi';
  let nominal = 200000;
  let skn = null;         // skenario sendiri
  let predictJanji = Promise.resolve();
  const dengar = { rumah: [], hasil: [], token: [] };   // pendengar dari interaksi.js

  function muatRumah() {
    try {
      const raw = JSON.parse(localStorage.getItem(KUNCI_SIMPAN) || 'null');
      if (raw && Object.keys(DEFAULT).every((k) => typeof raw[k] === 'number')) return { ...DEFAULT, ...raw };
    } catch (_) { /* penyimpanan bisa kosong atau ditolak */ }
    return { ...DEFAULT };
  }
  function simpanRumah() {
    try { localStorage.setItem(KUNCI_SIMPAN, JSON.stringify(rumah)); } catch (_) { /* abaikan */ }
  }

  // --------------------------------------------------------------------- API
  async function api(path, body) {
    const r = await fetch(path, {
      method: body ? 'POST' : 'GET',
      headers: { 'content-type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || 'Terjadi kesalahan di server.');
    return j;
  }

  const urutan = { predict: 0, sim: 0, token: 0, skn: 0, meta: 0, target: 0 };
  async function panggil(jenis, path, body) {
    const id = ++urutan[jenis];
    try {
      const j = await api(path, body);
      if (id !== urutan[jenis]) return null;   // sudah ada permintaan yang lebih baru
      tutupAlert();
      return j;
    } catch (e) {
      if (id !== urutan[jenis]) return null;
      tampilkanAlert(e instanceof TypeError
        ? 'Tidak bisa terhubung ke server. Pastikan "python web/app.py" masih berjalan, lalu muat ulang halaman.'
        : e.message);
      return null;
    }
  }
  function tampilkanAlert(teks) { const a = $('#alert'); a.textContent = teks; a.hidden = false; }
  function tutupAlert() { $('#alert').hidden = true; }

  // -------------------------------------------------------------- layar LCD
  function lcdHTML(teks) {
    return teks.split('.').map((g, i, a) => `<span>${g}</span>${i < a.length - 1 ? '<i class="sep">.</i>' : ''}`).join('');
  }
  function buatTween(el, format = fmtInt) {
    let sekarang = 0, raf = 0, terakhir = '';
    const gambar = (v) => {
      const teks = format(v);
      if (teks !== terakhir) { el.innerHTML = lcdHTML(teks); terakhir = teks; }
    };
    return (ke) => {
      cancelAnimationFrame(raf);
      if (reduceMotion) { sekarang = ke; gambar(ke); return; }
      const dari = sekarang, t0 = performance.now(), durasi = 560;
      const langkah = (t) => {
        const k = Math.min(1, (t - t0) / durasi);
        sekarang = dari + (ke - dari) * (1 - Math.pow(1 - k, 3));
        gambar(sekarang);
        if (k < 1) raf = requestAnimationFrame(langkah);
      };
      raf = requestAnimationFrame(langkah);
    };
  }
  const tweenTagihan = buatTween($('#lcd-val'));
  const tweenHari = buatTween($('#lcd-hari-val'), (n) => String(Math.round(n)));   // hari tanpa titik ribuan

  // -------------------------------------------------------------- form rumah
  function batasi(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

  function isiRentang(el) {
    const lo = +el.min, hi = +el.max;
    el.style.setProperty('--p', ((+el.value - lo) / (hi - lo)) * 100 + '%');
  }

  function sinkronForm() {
    const r = rumah;
    $$('input[name="va"]').forEach((i) => { i.checked = +i.value === r.electric_power_va; });
    $$('input[name="kulkas"]').forEach((i) => { i.checked = +i.value === r.num_refrigerators; });
    $$('.stepper').forEach((s) => {
      const v = r[s.dataset.field];
      $('.stepper-num', s).textContent = v;
      $('[data-d="-1"]', s).disabled = v <= +s.dataset.min;
      $('[data-d="1"]', s).disabled = v >= +s.dataset.max;
    });
    const jam = $('#r-jam-ac'), tv = $('#r-tv');
    jam.value = r.ac_hours_per_day; tv.value = r.tv_laptop_hours_per_day;
    isiRentang(jam); isiRentang(tv);

    const tanpaAc = r.num_ac_units === 0;
    jam.disabled = tanpaAc;
    $('#field-jam-ac').classList.toggle('is-off', tanpaAc);

    $('#o-va').textContent = fmtInt(r.electric_power_va) + ' VA';
    $('#o-penghuni').textContent = r.num_occupants + ' orang';
    $('#o-ac').textContent = tanpaAc ? 'Tanpa AC' : r.num_ac_units + ' unit';
    $('#o-jam-ac').textContent = tanpaAc ? 'Tanpa AC' : fmtJam(r.ac_hours_per_day) + ' jam';
    $('#o-kulkas').textContent = r.num_refrigerators + ' kulkas';
    $('#o-tv').textContent = fmtJam(r.tv_laptop_hours_per_day) + ' jam';
    $('#sw-cuci').setAttribute('aria-checked', String(!!r.has_washing_machine));
    dengar.rumah.forEach((f) => f(rumah));
  }

  let timer = 0;
  function berubah() {
    simpanRumah();
    sinkronForm();
    resetSendiri();
    clearTimeout(timer);
    timer = setTimeout(segarkan, 130);
  }

  function pasangForm() {
    $$('input[name="va"]').forEach((i) => i.addEventListener('change', () => { rumah.electric_power_va = +i.value; berubah(); }));
    $$('input[name="kulkas"]').forEach((i) => i.addEventListener('change', () => { rumah.num_refrigerators = +i.value; berubah(); }));

    $$('.stepper').forEach((s) => {
      s.addEventListener('click', (e) => {
        const b = e.target.closest('button[data-d]');
        if (!b || b.disabled) return;
        const f = s.dataset.field;
        const sebelum = rumah[f];
        rumah[f] = batasi(sebelum + +b.dataset.d, +s.dataset.min, +s.dataset.max);
        // Dari tanpa AC ke punya AC: beri jam awal yang masuk akal.
        if (f === 'num_ac_units' && sebelum === 0 && rumah[f] > 0 && rumah.ac_hours_per_day === 0) rumah.ac_hours_per_day = 4;
        berubah();
      });
    });

    [$('#r-jam-ac'), $('#r-tv')].forEach((el) => el.addEventListener('input', () => {
      rumah[el.dataset.field] = +el.value;
      berubah();
    }));

    $('#sw-cuci').addEventListener('click', () => { rumah.has_washing_machine = rumah.has_washing_machine ? 0 : 1; berubah(); });
    $('#atur-ulang').addEventListener('click', () => { rumah = { ...DEFAULT }; berubah(); });
  }

  // ----------------------------------------------------------------- Prediksi
  function segarkan() {
    predictJanji = segarkanPrediksi();
    if (tab === 'simulasi') segarkanSimulasi();
    if (tab === 'token') segarkanToken();
  }

  async function segarkanPrediksi() {
    const h = await panggil('predict', '/api/predict', rumah);
    if (!h) return;
    hasil = h;
    gambarMeter();
    gambarDock();
    if (tab === 'simulasi') perbaruiBanding();
  }

  function gambarMeter() {
    const h = hasil;
    const chip = $('#chip-kategori');
    chip.textContent = h.kategori; chip.dataset.k = h.kategori;

    tweenTagihan(h.tagihan);
    $('#range-teks').textContent = `Kemungkinan antara ${rp(h.rendah)} dan ${rp(h.tinggi)}`;
    $('#ringkas-sr').textContent = `Perkiraan tagihan ${rp(h.tagihan)} per bulan, kategori ${h.kategori}.`;

    const adaKwh = h.kwh !== null;
    $('#facts > div:first-child').hidden = !adaKwh;
    if (adaKwh) $('#f-kwh').textContent = fmtInt(h.kwh) + ' kWh';
    $('#f-hari').textContent = rp(h.per_hari);

    gambarKategori(h);
    gambarAsal(h);
    gambarTip(h);
    dengar.hasil.forEach((f) => f(h));
  }

  function gambarKategori(h) {
    if (!meta) return;
    const [b0, b1] = meta.batas;
    const maks = Math.max(meta.tagihan_maks, h.tagihan, b1 * 1.1);
    const w = [b0 / maks, (b1 - b0) / maks, 1 - b1 / maks];
    const segs = $$('.kat-seg');
    segs.forEach((s, i) => { s.style.flex = `${w[i]} 1 0`; s.classList.toggle('on', s.dataset.k === h.kategori); });
    $('#kat-pin').style.left = `calc(${Math.min(h.tagihan / maks, 1) * 100}% )`;

    // Baris 1: nama kategori di tengah tiap segmen. Baris 2: angka batas tepat di bawah sambungan segmen.
    const awal = [0, b0 / maks, b1 / maks], akhir = [b0 / maks, b1 / maks, 1];
    const nama = URUT_KATEGORI.map((k, i) => {
      const tengah = batasi(((awal[i] + akhir[i]) / 2) * 100, 8, 92);
      return `<span class="nm" style="left:${tengah}%"><b>${k}</b></span>`;
    }).join('');
    const batas = [b0, b1].map((b, i) => `<span class="bt" style="left:${(i ? b1 : b0) / maks * 100}%">${rb(b)}</span>`).join('');
    $('#kat-labels').innerHTML = nama + batas;
  }

  function gambarAsal(h) {
    const positif = h.rincian.reduce((j, r) => j + Math.max(r.nilai, 0), 0) || 1;
    $('#asal-bar').innerHTML = h.rincian
      .filter((r) => r.nilai > 0)
      .map((r) => `<span data-n="${esc(r.nama)}" style="flex:${r.nilai} 1 0;background:${WARNA_ASAL[r.nama] || '#93a5c6'}" title="${esc(NAMA_ASAL[r.nama] || r.nama)}: ${rp(r.nilai)}"></span>`)
      .join('');
    $('#asal-list').innerHTML = h.rincian.map((r) => `
      <li data-n="${esc(r.nama)}" tabindex="0">
        <i style="background:${WARNA_ASAL[r.nama] || '#93a5c6'}"></i>
        <span>${esc(NAMA_ASAL[r.nama] || r.nama)}</span>
        <span class="nilai">${r.nilai < 0 ? '−' : ''}${rp(Math.abs(r.nilai))}</span>
        <span class="persen">${r.nilai > 0 ? pct(r.nilai / positif, 0) : ''}</span>
      </li>`).join('');
  }

  function gambarTip(h) {
    const tip = $('#tip');
    if (!h.tip) { tip.hidden = true; return; }
    if (h.tip.jenis === 'ac') {
      tip.innerHTML = `<span>Kurangi AC 1 jam per hari, perkiraan tagihan turun ${rp(h.tip.hemat)} per bulan.</span>
        <button type="button" class="link" data-ke="simulasi">Lihat simulasi lengkap</button>`;
    } else {
      tip.innerHTML = '<span>Rumahmu tanpa AC, jadi tagihan terutama berasal dari kulkas dan jumlah penghuni.</span>';
    }
    tip.hidden = false;
  }

  // ------------------------------------------------------------------ Simulasi
  async function segarkanSimulasi() {
    const d = await panggil('sim', '/api/simulate', rumah);
    if (!d) return;
    simData = d;
    gambarSimulasi();
    await predictJanji;
    perbaruiBanding();
  }

  function gambarSimulasi() {
    const d = simData;
    $('#sim-ringkas').textContent = `Tagihan sekarang sekitar ${rp(d.dasar)} per bulan, kategori ${d.kategori}.`;
    $('#sim-list').innerHTML = d.skenario.map((s, i) => {
      const sisa = batasi((s.tagihan / d.dasar) * 100, 0, 100);
      const turun = batasi((s.hemat / d.dasar) * 100, 0, 100 - sisa);
      const chip = s.kategori === d.kategori ? `Tetap ${s.kategori}` : `Jadi ${s.kategori}`;
      return `
        <li class="skn">
          <div class="skn-top">
            <span class="skn-nama">${esc(s.nama)}</span>
            <span class="skn-hemat ${s.hemat < 0 ? 'naik' : ''}">${s.hemat < 0 ? 'Naik' : 'Hemat'} ${rp(Math.abs(s.hemat))}</span>
          </div>
          <div class="skn-bar" role="img" aria-label="Tagihan baru ${Math.round(sisa)} persen dari tagihan sekarang">
            <span class="sisa" style="width:${sisa}%"></span><span class="turun" style="width:${turun}%"></span>
          </div>
          <div class="skn-bot">
            <span>Tagihan baru ${rp(s.tagihan)} per bulan</span>
            <span class="skn-aksi">
              <span class="chip" data-k="${esc(s.kategori)}">${esc(chip)}</span>
              <button type="button" class="terapkan" data-i="${i}">Terapkan</button>
            </span>
          </div>
        </li>`;
    }).join('');
    $('#sim-kosong').hidden = d.skenario.length > 0;
  }

  // Skenario sendiri
  function resetSendiri() {
    skn = { ac: rumah.num_ac_units, jam: rumah.ac_hours_per_day, tv: rumah.tv_laptop_hours_per_day };
    $('#s-ac').value = skn.ac; $('#s-jam').value = skn.jam; $('#s-tv').value = skn.tv;
    sinkronSendiri();
  }
  function sinkronSendiri() {
    ['#s-ac', '#s-jam', '#s-tv'].forEach((s) => isiRentang($(s)));
    const tanpa = skn.ac === 0;
    $('#s-jam').disabled = tanpa;
    $('#mini-jam').classList.toggle('is-off', tanpa);
    $('#so-ac').textContent = tanpa ? 'Tanpa AC' : skn.ac + ' unit';
    $('#so-jam').textContent = tanpa ? 'Tanpa AC' : fmtJam(skn.jam) + ' jam';
    $('#so-tv').textContent = fmtJam(skn.tv) + ' jam';
  }

  let timerSkn = 0;
  function pasangSendiri() {
    $('#s-ac').addEventListener('input', (e) => {
      const sebelum = skn.ac;
      skn.ac = +e.target.value;
      if (sebelum === 0 && skn.ac > 0 && skn.jam === 0) { skn.jam = 4; $('#s-jam').value = 4; }
      sinkronSendiri(); jadwalBanding();
    });
    $('#s-jam').addEventListener('input', (e) => { skn.jam = +e.target.value; sinkronSendiri(); jadwalBanding(); });
    $('#s-tv').addEventListener('input', (e) => { skn.tv = +e.target.value; sinkronSendiri(); jadwalBanding(); });
  }
  function jadwalBanding() { clearTimeout(timerSkn); timerSkn = setTimeout(perbaruiBanding, 120); }

  async function perbaruiBanding() {
    if (tab !== 'simulasi' || !skn) return;
    const q = { ...rumah, num_ac_units: skn.ac, ac_hours_per_day: skn.ac ? skn.jam : 0, tv_laptop_hours_per_day: skn.tv };
    const baru = await panggil('skn', '/api/predict', q);
    await predictJanji;
    if (!baru || !hasil) return;
    const selisih = hasil.tagihan - baru.tagihan;
    const sama = Math.abs(selisih) < 500;
    const teks = sama ? 'Sama seperti sekarang' : selisih > 0 ? `Hemat ${rp(selisih)}` : `Lebih boros ${rp(-selisih)}`;
    const kelas = sama ? '' : selisih > 0 ? 'selisih-hemat' : 'selisih-boros';
    $('#banding').innerHTML = `
      <div><small>Tagihan skenario</small><strong>${rp(baru.tagihan)}</strong><span class="chip" data-k="${esc(baru.kategori)}">${esc(baru.kategori)}</span></div>
      <div><small>Selisih per bulan</small><strong class="${kelas}">${teks}</strong></div>`;
  }

  // --------------------------------------------------------------------- Token
  const inputNominal = $('#nominal');
  const infoNominal = $('#nominal-info');

  function tandaiChip() {
    $$('#nominal-chips button').forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.v === nominal)));
  }
  function nominalSah() { return nominal >= 20000 && nominal <= 5000000; }

  const sliderNominal = $('#r-nominal');
  function sinkronSlider() {
    sliderNominal.value = batasi(nominal, +sliderNominal.min, +sliderNominal.max);
    isiRentang(sliderNominal);
  }

  function pasangToken() {
    inputNominal.addEventListener('input', () => {
      const angka = parseInt(inputNominal.value.replace(/\D/g, '') || '0', 10);
      nominal = angka;
      inputNominal.value = angka ? fmtInt(angka) : '';
      tandaiChip(); sinkronSlider();
      periksaNominal();
      if (nominalSah()) { clearTimeout(timer); timer = setTimeout(segarkanToken, 160); }
    });
    sliderNominal.addEventListener('input', () => {
      nominal = +sliderNominal.value;
      inputNominal.value = fmtInt(nominal);
      isiRentang(sliderNominal); tandaiChip(); periksaNominal();
      clearTimeout(timer); timer = setTimeout(segarkanToken, 90);
    });
    $('#nominal-chips').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-v]');
      if (!b) return;
      nominal = +b.dataset.v;
      inputNominal.value = fmtInt(nominal);
      tandaiChip(); sinkronSlider(); periksaNominal(); segarkanToken();
    });
    tandaiChip(); sinkronSlider();
  }
  function periksaNominal() {
    const sah = nominalSah();
    $('.nominal').classList.toggle('salah', !sah);
    infoNominal.classList.toggle('salah', !sah);
    infoNominal.textContent = sah
      ? 'Nominal yang bisa dihitung: Rp 20.000 sampai Rp 5.000.000.'
      : 'Isi nominal antara Rp 20.000 dan Rp 5.000.000.';
  }

  async function segarkanToken() {
    if (!nominalSah()) return;
    const d = await panggil('token', '/api/token', { rumah, nominal });
    if (!d) return;
    const hari = d.hari === null ? 0 : d.hari;
    tweenHari(Math.round(hari));
    const habis = new Date(Date.now() + hari * 864e5)
      .toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    $('#token-tgl').textContent = hari < 1
      ? 'Token ini habis kurang dari sehari.'
      : `Kalau dipasang hari ini, kira-kira habis pada ${habis}.`;
    $('#token-sr').textContent = `Token ${rp(nominal)} habis dalam sekitar ${fmtInt(hari)} hari.`;
    $('#t-kwh').textContent = fmtInt(d.kwh_token) + ' kWh';
    $('#t-hari').textContent = fmtDec(d.kwh_hari, 1) + ' kWh per hari';
    $('#token-fine').textContent = `Tarif rata-rata dari data ${rp(d.tarif)} per kWh. Potongan admin dan pajak token belum dihitung.`;
    dengar.token.forEach((f) => f({ ...d, hari, nominal }));
  }

  // -------------------------------------------------------------- Tentang model
  const NAMA_FAKTOR = {
    ac_unit_hours: 'Tiap 1 jam AC menyala per hari, per unit',
    punya_ac: 'Punya AC (biaya tetap)',
    num_refrigerators: 'Tiap kulkas',
    num_occupants: 'Tiap penghuni',
    has_washing_machine: 'Punya mesin cuci',
    tv_laptop_hours_per_day: 'Tiap 1 jam TV dan laptop per hari',
  };

  function gambarModel() {
    if (!meta) return;
    const m = meta;
    $('#model-intro-teks').textContent =
      `Model dilatih dari ${fmtInt(m.jumlah_data)} data rumah tangga. Regresi linear berganda memperkirakan tagihan dalam rupiah, lalu SVM menentukan kategorinya: Hemat, Normal, atau Boros.`;

    $('#m-angka').innerHTML = [
      [pct(m.r2), 'Ketepatan perkiraan tagihan', 'Nilai R² pada 20% data yang tidak dipakai saat melatih. Makin dekat 100%, makin cocok dengan tagihan sebenarnya.'],
      [rp(m.mae), 'Meleset rata-rata', 'Selisih rata-rata perkiraan dengan tagihan sebenarnya per bulan. Angka ini juga dipakai untuk kisaran di halaman Prediksi.'],
      [pct(m.cv_r2), 'Ketepatan lintas data', 'Validasi silang 5 bagian, untuk memastikan hasil bagus bukan karena kebetulan membagi data.'],
      [pct(m.akurasi_svm), 'Akurasi kategori', `Dari 100 rumah, sekitar ${Math.round(m.akurasi_svm * 100)} ditebak benar kategorinya.`],
    ].map(([besar, nama, arti]) => `<div><div class="besar">${esc(besar)}</div><div class="nama">${esc(nama)}</div><div class="arti">${esc(arti)}</div></div>`).join('');

    // Matriks kebingungan, diurutkan Hemat, Normal, Boros
    const idx = URUT_KATEGORI.map((k) => m.kelas.indexOf(k));
    let html = '<span class="sudut"></span>' + URUT_KATEGORI.map((k) => `<span class="kepala">Ditebak ${k}</span>`).join('');
    idx.forEach((i, r) => {
      const total = idx.reduce((j, c) => j + m.matriks[i][c], 0) || 1;
      html += `<span class="baris">Aslinya ${URUT_KATEGORI[r]}</span>`;
      idx.forEach((c, k) => {
        const v = m.matriks[i][c];
        const a = (v / total).toFixed(2);
        html += `<span class="sel ${r === k ? 'benar' : 'salah-sel'}" style="--a:${a}" title="${v} rumah">${v}</span>`;
      });
    });
    $('#m-matriks').innerHTML = `<div class="matriks">${html}</div>`;

    $('#m-perkelas').innerHTML = '<div><span>Kategori</span><span class="kolom">Tepat saat ditebak</span><span class="kolom">Berhasil dikenali</span></div>' +
      URUT_KATEGORI.map((k) => {
        const p = m.per_kelas.find((x) => x.kelas === k);
        return `<div><span><span class="chip" data-k="${k}">${k}</span></span><span class="kolom">${p.presisi === null ? '-' : pct(p.presisi, 0)}</span><span class="kolom">${p.recall === null ? '-' : pct(p.recall, 0)}</span></div>`;
      }).join('');

    // Koefisien
    const daftar = Object.entries(m.koefisien).map(([k, v]) => {
      let nama = NAMA_FAKTOR[k];
      if (!nama && k.startsWith('va_')) nama = `Daya ${fmtInt(+k.slice(3))} VA, dibanding 900 VA`;
      return { nama: nama || k, v };
    }).sort((a, b) => Math.abs(b.v) - Math.abs(a.v));
    const maks = Math.max(...daftar.map((d) => Math.abs(d.v))) || 1;
    $('#m-koef').innerHTML = `<ul>${daftar.map((d) => `
      <li>
        <span class="nama">${esc(d.nama)}</span>
        <span class="jalur"><span class="isi ${d.v >= 0 ? 'plus' : 'minus'}" style="width:${Math.max(2, (Math.abs(d.v) / maks) * 100)}%"></span></span>
        <span class="nilai">${tanda(d.v)}</span>
      </li>`).join('')}</ul>`;

    const [b0, b1] = m.batas;
    $('#m-batas').innerHTML = [
      ['Hemat', `sampai ${rp(b0)}`, 'Sepertiga rumah dengan tagihan terendah di data.'],
      ['Normal', `${rp(b0)} sampai ${fmtInt(b1)}`, 'Sepertiga rumah di tengah.'],
      ['Boros', `di atas ${rp(b1)}`, 'Sepertiga rumah dengan tagihan tertinggi.'],
    ].map(([k, nilai, arti]) => `<div><span class="chip" data-k="${k}">${k}</span><div class="besar">${nilai}</div><div class="arti">${arti}</div></div>`).join('');
    if (m.tarif) {
      $('#m-batas').insertAdjacentHTML('afterend',
        `<p class="sub" style="margin-top:20px">Untuk mengubah rupiah menjadi kWh dan token, dipakai tarif rata-rata ${rp(m.tarif)} per kWh ditambah biaya tetap ${rp(m.biaya_tetap)} per bulan, yang dihitung dari dataset kWh.</p>`);
    }
  }

  // ------------------------------------------------------------ Tab dan dock
  function geserPil() {
    const b = $('.tabs button[aria-selected="true"]');
    const bar = $('#tabs');
    bar.style.setProperty('--pill-x', b.offsetLeft + 'px');
    bar.style.setProperty('--pill-w', b.offsetWidth + 'px');
  }

  function setTab(t, ubahHash = true) {
    if (!TABS.includes(t)) t = 'prediksi';
    tab = t;
    $('#utama').dataset.tab = t;
    $$('.tabs button').forEach((b) => {
      const aktif = b.dataset.tab === t;
      b.setAttribute('aria-selected', String(aktif));
      b.tabIndex = aktif ? 0 : -1;
    });
    const model = t === 'model';
    $('#rumah').hidden = model;
    $('#hasil').hidden = model;
    $('#pane-model').hidden = !model;
    ['prediksi', 'simulasi', 'token'].forEach((p) => { $('#pane-' + p).hidden = p !== t; });
    geserPil();
    if (ubahHash) history.replaceState(null, '', '#' + t);
    if (model) gambarModelSekali(); else segarkan();
    gambarDock();
    window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
  }

  let modelSudahDigambar = false;
  function gambarModelSekali() {
    if (modelSudahDigambar) return;
    gambarModel();
    modelSudahDigambar = !!meta;
  }

  function pasangTab() {
    $('#tabs').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-tab]');
      if (b) setTab(b.dataset.tab);
    });
    $('#tabs').addEventListener('keydown', (e) => {
      const i = TABS.indexOf(tab);
      let j = null;
      if (e.key === 'ArrowRight') j = (i + 1) % TABS.length;
      if (e.key === 'ArrowLeft') j = (i - 1 + TABS.length) % TABS.length;
      if (e.key === 'Home') j = 0;
      if (e.key === 'End') j = TABS.length - 1;
      if (j === null) return;
      e.preventDefault();
      setTab(TABS[j]);
      $('#tab-' + TABS[j]).focus();
    });
    addEventListener('hashchange', () => setTab(location.hash.slice(1), false));
    addEventListener('resize', geserPil);
    document.addEventListener('click', (e) => {
      const l = e.target.closest('[data-ke]');
      if (l) setTab(l.dataset.ke);
    });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(geserPil);
  }

  // Bilah ringkas di layar kecil: tampil saat kartu hasil tidak terlihat
  let hasilTerlihat = true;
  function gambarDock() {
    const dock = $('#dock');
    if (!hasil) { dock.classList.remove('tampil'); return; }
    $('#dock-nilai').textContent = rp(hasil.tagihan);
    const chip = $('#dock-chip');
    chip.textContent = hasil.kategori; chip.dataset.k = hasil.kategori;
    const kecil = matchMedia('(max-width: 960px)').matches;
    const tampil = kecil && tab !== 'model' && !hasilTerlihat;
    dock.hidden = false;
    dock.classList.toggle('tampil', tampil);
  }
  function pasangDock() {
    new IntersectionObserver(([e]) => { hasilTerlihat = e.isIntersecting; gambarDock(); }, { threshold: 0.05 }).observe($('#hasil'));
    $('#dock').addEventListener('click', () => {
      $('#hasil').scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
    });
    matchMedia('(max-width: 960px)').addEventListener('change', gambarDock);
  }

  // ------------------------------------------------- ubah dari luar, toast, urungkan
  let timerToast = 0;
  function toast(pesan, aksi) {
    const t = $('#toast');
    t.innerHTML = `<span>${esc(pesan)}</span>` + (aksi ? `<button type="button">${esc(aksi.label)}</button>` : '');
    if (aksi) $('button', t).addEventListener('click', () => { aksi.fn(); t.hidden = true; });
    t.hidden = false;
    t.classList.remove('masuk'); void t.offsetWidth; t.classList.add('masuk');
    clearTimeout(timerToast);
    timerToast = setTimeout(() => { t.hidden = true; }, 7000);
  }

  // Mengubah data rumah dari mana saja (rumah interaktif, target, simulasi).
  // Bila ada `pesan`, perubahan bisa diurungkan dari toast.
  function ubah(patch, opsi = {}) {
    const sebelum = { ...rumah };
    Object.assign(rumah, patch);
    berubah();
    if (opsi.pesan) toast(opsi.pesan, { label: 'Urungkan', fn: () => { rumah = { ...sebelum }; berubah(); } });
  }

  function pasangAksi() {
    $('#sim-list').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-i]');
      if (!b || !simData) return;
      const s = simData.skenario[+b.dataset.i];
      if (s) ubah(s.param, { pesan: `Diterapkan: ${s.nama}. Tagihan sekitar ${rp(s.tagihan)}.` });
    });
  }

  window.PL = {
    get rumah() { return rumah; },
    get hasil() { return hasil; },
    get meta() { return meta; },
    get tab() { return tab; },
    ubah, toast, setTab, panggil, api,
    onRumah: (f) => dengar.rumah.push(f),
    onHasil: (f) => dengar.hasil.push(f),
    onToken: (f) => dengar.token.push(f),
    u: { $, $$, rp, rb, fmtInt, fmtDec, fmtJam, esc, batasi, isiRentang, reduceMotion, URUT_KATEGORI },
  };

  // --------------------------------------------------------------------- mulai
  async function mulai() {
    pasangForm(); pasangSendiri(); pasangToken(); pasangTab(); pasangDock(); pasangAksi();
    sinkronForm(); resetSendiri(); periksaNominal(); tandaiChip();

    meta = await panggil('meta', '/api/meta');
    if (meta) {
      if (!meta.tarif) {
        $('#tab-token').hidden = true;
        TABS.splice(TABS.indexOf('token'), 1);
      }
    }
    setTab(location.hash.slice(1) || 'prediksi', false);
    if (meta && tab === 'model') gambarModelSekali();
    if (meta && hasil) gambarKategori(hasil);
  }
  mulai();
})();
