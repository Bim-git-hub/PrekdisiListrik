/* Prediksi Listrik - lapisan interaktif.
   Memakai window.PL dari app.js. Isinya:
   1. Rumah interaktif (klik alat untuk mengubah data, biaya tampil di tiap alat)
   2. Rincian tagihan yang terhubung ke rumah (sorot dan lompat)
   3. Target tagihan (cari perubahan paling ringan)
   4. Meteran miring mengikuti kursor, dan percikan saat kategori membaik
   5. Kalender hari untuk token */
(() => {
  'use strict';
  const PL = window.PL;
  if (!PL) return;
  const { $, $$, rp, fmtInt, fmtJam, esc, batasi, isiRentang, reduceMotion } = PL.u;
  const halus = !reduceMotion;
  const rbk = (n) => fmtInt(n / 1000) + 'rb';

  // =========================================================== 1. RUMAH
  const scene = $('#scene');
  const wrap = $('#scene-wrap');
  const pop = $('#pop');

  const WARNA_ORANG = ['#2748f0', '#46c2a0', '#ffc62e', '#ff8b7e', '#86a6ff', '#b79dff'];
  const PETA = { ac: 'AC', tv: 'TV / laptop', kulkas: 'Kulkas', cuci: 'Mesin cuci', orang: 'Jumlah penghuni', va: 'Biaya dasar & daya VA' };
  const KE_ID = Object.fromEntries(Object.entries(PETA).map(([id, nama]) => [nama, id]));
  const NAMA_ALAT = { ac: 'AC', tv: 'TV dan laptop', kulkas: 'Kulkas', cuci: 'Mesin cuci', va: 'Daya listrik' };

  const acSlot = (i, x) => `
    <g class="hot ac-slot" data-h="ac" data-i="${i}" data-x="${x}" transform="translate(${x} 132)" tabindex="0" role="button" aria-expanded="false">
      <rect class="hit" x="-12" y="-10" width="104" height="52" rx="14"/>
      <g class="ac-wind" aria-hidden="true">
        <path d="M18 33q-4 4 0 8M40 33q-4 4 0 8M62 33q-4 4 0 8"/>
      </g>
      <rect class="solid ac-body" width="80" height="28" rx="8"/>
      <rect class="ac-vent" x="10" y="18" width="60" height="4" rx="2"/>
      <circle class="ac-led" cx="68" cy="8" r="3"/>
      <path class="ac-plus" d="M40 8v12M34 14h12"/>
    </g>`;

  const kulkasGambar = (x, kelas) => `
    <g class="fr ${kelas}">
      <rect class="solid" x="${x}" y="254" width="56" height="98" rx="7"/>
      <path class="garis" d="M${x} 288h56"/>
      <rect class="gagang" x="${x + 8}" y="266" width="3.5" height="14" rx="1.75"/>
      <rect class="gagang" x="${x + 8}" y="298" width="3.5" height="26" rx="1.75"/>
    </g>`;

  const orangGambar = (i) => {
    const cx = 98 + i * 64;
    return `
    <g class="hot orang" data-h="orang" data-i="${i + 1}" tabindex="0" role="button" aria-pressed="false">
      <rect class="hit" x="${cx - 28}" y="354" width="56" height="64" rx="14"/>
      <g transform="translate(${cx} 412)"><g class="bob" style="--i:${i}">
        <circle class="kepala" cx="0" cy="-46" r="8"/>
        <path class="badan" d="M-13 0V-18a13 13 0 0 1 26 0V0z" style="--w:${WARNA_ORANG[i]}"/>
      </g></g>
    </g>`;
  };

  const tagGambar = (id, cx, y) => `
    <g class="tag" id="tag-${id}" transform="translate(${cx - 32} ${y})" style="display:none">
      <rect width="64" height="24" rx="12"/><text x="32" y="16.5" text-anchor="middle"></text>
    </g>`;

  scene.innerHTML = `
    <rect class="tanah" x="0" y="352" width="520" height="68" rx="16"/>
    <rect class="dinding" x="48" y="120" width="424" height="232"/>
    <g class="dekor">
      <rect x="72" y="214" width="150" height="22" rx="5" fill="#d6dff0"/>
      <rect x="72" y="204" width="44" height="18" rx="8" fill="#fff" stroke="#c3cddc" stroke-width="2"/>
      <rect x="68" y="198" width="7" height="38" rx="3" fill="#aab6cc"/>
    </g>
    <path class="sekat" d="M260 120v232"/>
    <path class="lantai" d="M48 236h424"/>
    <rect class="bingkai" x="48" y="120" width="424" height="232"/>
    <path class="atap" d="M26 124 260 32 494 124z"/>
    <path class="petir" d="M266 62 251 88h11l-4 20 16-28h-11z"/>

    ${acSlot(1, 66)}${acSlot(2, 160)}${acSlot(3, 272)}${acSlot(4, 368)}

    <g class="hot tv" data-h="tv" tabindex="0" role="button" aria-expanded="false">
      <rect class="hit" x="278" y="170" width="190" height="72" rx="14"/>
      <rect class="solid lp-layar" x="296" y="198" width="46" height="22" rx="3"/>
      <rect class="lp-glow" x="299" y="201" width="40" height="16" rx="1.5"/>
      <path class="garis-tebal" d="M289 223h60"/>
      <path class="meja" d="M284 228h70M290 228v8M348 228v8"/>
      <rect class="solid tv-layar" x="388" y="196" width="64" height="30" rx="5"/>
      <rect class="tv-glow" x="392" y="200" width="56" height="22" rx="2.5"/>
      <rect class="kaki" x="414" y="226" width="12" height="6"/>
      <rect class="kaki" x="402" y="232" width="36" height="4" rx="2"/>
    </g>

    <g class="hot kulkas" data-h="kulkas" tabindex="0" role="button" aria-expanded="false">
      <rect class="hit" x="60" y="244" width="140" height="108" rx="14"/>
      ${kulkasGambar(70, 'f1')}${kulkasGambar(136, 'f2')}
    </g>

    <g class="hot cuci" data-h="cuci" tabindex="0" role="button" aria-expanded="false">
      <rect class="hit" x="280" y="256" width="80" height="96" rx="14"/>
      <rect class="solid" x="288" y="264" width="64" height="88" rx="7"/>
      <path class="garis" d="M288 284h64"/>
      <circle class="knob" cx="299" cy="274" r="3"/><circle class="knob" cx="310" cy="274" r="3"/>
      <circle class="pintu" cx="320" cy="320" r="24"/>
      <path class="drum" d="M296 320a24 24 0 0 1 48 0z"/>
    </g>

    <g class="hot va" data-h="va" tabindex="0" role="button" aria-expanded="false">
      <rect class="hit" x="414" y="244" width="60" height="100" rx="14"/>
      <rect class="solid" x="424" y="254" width="40" height="44" rx="6"/>
      <circle class="dial" cx="444" cy="270" r="10"/>
      <path class="jarum" d="M444 270v-8"/>
      <rect class="lcd-kecil" x="432" y="284" width="24" height="8" rx="2"/>
      <text class="va-teks" x="444" y="316" text-anchor="middle"></text>
    </g>

    ${[0, 1, 2, 3, 4, 5].map(orangGambar).join('')}

    ${tagGambar('ac', 156, 174)}${tagGambar('tv', 372, 174)}${tagGambar('kulkas', 226, 300)}
    ${tagGambar('cuci', 386, 272)}${tagGambar('va', 444, 324)}${tagGambar('orang', 480, 380)}
  `;

  function segarScene(r) {
    $$('.ac-slot', scene).forEach((g) => {
      const i = +g.dataset.i, on = i <= r.num_ac_units;
      g.classList.toggle('on', on);
      g.classList.toggle('run', on && r.ac_hours_per_day > 0);
      g.style.setProperty('--w', batasi(r.ac_hours_per_day / 8, 0.2, 1).toFixed(2));
      g.setAttribute('aria-label', on ? `AC ${i}, menyala ${fmtJam(r.ac_hours_per_day)} jam per hari` : `Tambah AC ${i}`);
    });

    const tv = $('.tv', scene);
    tv.classList.toggle('run', r.tv_laptop_hours_per_day > 0);
    tv.style.setProperty('--w', batasi(r.tv_laptop_hours_per_day / 6, 0.25, 1).toFixed(2));
    tv.setAttribute('aria-label', `TV dan laptop, menyala ${fmtJam(r.tv_laptop_hours_per_day)} jam per hari`);

    $('.f2', scene).classList.toggle('off', r.num_refrigerators < 2);
    $('.kulkas', scene).setAttribute('aria-label', `Kulkas, ${r.num_refrigerators} unit`);

    const cuci = $('.cuci', scene);
    cuci.classList.toggle('off', !r.has_washing_machine);
    cuci.setAttribute('aria-label', r.has_washing_machine ? 'Mesin cuci, ada' : 'Mesin cuci, tidak ada');

    $$('.orang', scene).forEach((g) => {
      const i = +g.dataset.i, on = i <= r.num_occupants;
      g.classList.toggle('on', on);
      g.setAttribute('aria-pressed', String(on));
      g.setAttribute('aria-label', `Penghuni ${i}${on ? ', ada' : ', tidak ada'}`);
    });
    wrap.dataset.orang = r.num_occupants;

    $('.va-teks', scene).textContent = fmtInt(r.electric_power_va) + ' VA';
    const urutVa = [900, 1300, 2200, 3500, 5500].indexOf(r.electric_power_va);
    $('.jarum', scene).style.transform = `rotate(${-70 + urutVa * 35}deg)`;
    $('.va', scene).setAttribute('aria-label', `Daya listrik ${fmtInt(r.electric_power_va)} VA`);

    segarPop();
    segarTag();
  }

  function segarTag() {
    const h = PL.hasil;
    if (!h) return;
    const r = PL.rumah;
    const nilai = Object.fromEntries(h.rincian.map((x) => [x.nama, x.nilai]));
    Object.entries(PETA).forEach(([id, nama]) => {
      const el = $('#tag-' + id, scene);
      const v = nilai[nama];
      const tampil = v > 0
        && !(id === 'ac' && r.num_ac_units === 0)
        && !(id === 'cuci' && !r.has_washing_machine)
        && !(id === 'tv' && r.tv_laptop_hours_per_day === 0);
      el.style.display = tampil ? '' : 'none';
      if (tampil) $('text', el).textContent = rbk(v);
    });
  }

  // ---------- popover
  let buka = null;   // { jenis, pemicu, anchor }

  const TEMPLATE = {
    ac: () => `
      <div class="pop-h"><span>AC</span><button type="button" class="pop-x" data-a="tutup" aria-label="Tutup">×</button></div>
      <div class="pop-row"><span>Jumlah AC</span>
        <div class="mini-step"><button type="button" data-a="ac-" aria-label="Kurangi AC">−</button><output data-b="ac-n"></output><button type="button" data-a="ac+" aria-label="Tambah AC">+</button></div></div>
      <div class="pop-row kolom"><div class="pop-line"><label for="pp-jam">Jam menyala per hari</label><output data-b="jam-o"></output></div>
        <input class="range" type="range" id="pp-jam" min="0" max="14" step="0.5"></div>
      <p class="pop-biaya" data-b="biaya"></p>`,
    tv: () => `
      <div class="pop-h"><span>TV dan laptop</span><button type="button" class="pop-x" data-a="tutup" aria-label="Tutup">×</button></div>
      <div class="pop-row kolom"><div class="pop-line"><label for="pp-tv">Menyala per hari</label><output data-b="tv-o"></output></div>
        <input class="range" type="range" id="pp-tv" min="0" max="10" step="0.5"></div>
      <p class="pop-biaya" data-b="biaya"></p>`,
    kulkas: () => `
      <div class="pop-h"><span>Kulkas</span><button type="button" class="pop-x" data-a="tutup" aria-label="Tutup">×</button></div>
      <div class="pop-seg" role="radiogroup" aria-label="Jumlah kulkas">
        <button type="button" role="radio" data-a="kulkas" data-v="1">1 kulkas</button>
        <button type="button" role="radio" data-a="kulkas" data-v="2">2 kulkas</button></div>
      <p class="pop-biaya" data-b="biaya"></p>`,
    cuci: () => `
      <div class="pop-h"><span>Mesin cuci</span><button type="button" class="pop-x" data-a="tutup" aria-label="Tutup">×</button></div>
      <div class="pop-row"><span id="pp-cuci-l">Punya mesin cuci</span>
        <button type="button" class="switch" data-a="cuci" role="switch" aria-labelledby="pp-cuci-l"><span></span></button></div>
      <p class="pop-biaya" data-b="biaya"></p>`,
    va: () => `
      <div class="pop-h"><span>Daya listrik terpasang</span><button type="button" class="pop-x" data-a="tutup" aria-label="Tutup">×</button></div>
      <div class="pop-chips" role="radiogroup" aria-label="Daya listrik">
        ${[900, 1300, 2200, 3500, 5500].map((v) => `<button type="button" role="radio" data-a="va" data-v="${v}">${fmtInt(v)}</button>`).join('')}</div>
      <p class="pop-biaya" data-b="biaya"></p>`,
  };

  const ANCHOR = {
    ac: (g) => ({ x: +g.dataset.x + 40, atas: 132, bawah: 160 }),
    tv: () => ({ x: 372, atas: 196, bawah: 236 }),
    kulkas: () => ({ x: 130, atas: 254, bawah: 352 }),
    cuci: () => ({ x: 320, atas: 264, bawah: 352 }),
    va: () => ({ x: 444, atas: 254, bawah: 298 }),
  };

  function segarPop() {
    if (!buka) return;
    const r = PL.rumah;
    const set = (b, t) => { const el = $(`[data-b="${b}"]`, pop); if (el) el.textContent = t; };
    if (buka.jenis === 'ac') {
      set('ac-n', r.num_ac_units === 0 ? 'Tanpa AC' : r.num_ac_units + ' unit');
      $('[data-a="ac-"]', pop).disabled = r.num_ac_units <= 0;
      $('[data-a="ac+"]', pop).disabled = r.num_ac_units >= 4;
      const j = $('#pp-jam', pop);
      j.value = r.ac_hours_per_day; j.disabled = r.num_ac_units === 0; isiRentang(j);
      set('jam-o', r.num_ac_units === 0 ? '-' : fmtJam(r.ac_hours_per_day) + ' jam');
    } else if (buka.jenis === 'tv') {
      const t = $('#pp-tv', pop);
      t.value = r.tv_laptop_hours_per_day; isiRentang(t);
      set('tv-o', fmtJam(r.tv_laptop_hours_per_day) + ' jam');
    } else if (buka.jenis === 'kulkas') {
      $$('[data-a="kulkas"]', pop).forEach((b) => b.setAttribute('aria-checked', String(+b.dataset.v === r.num_refrigerators)));
    } else if (buka.jenis === 'cuci') {
      $('[data-a="cuci"]', pop).setAttribute('aria-checked', String(!!r.has_washing_machine));
    } else if (buka.jenis === 'va') {
      $$('[data-a="va"]', pop).forEach((b) => b.setAttribute('aria-checked', String(+b.dataset.v === r.electric_power_va)));
    }
    const h = PL.hasil;
    if (h) {
      const v = h.rincian.find((x) => x.nama === PETA[buka.jenis]);
      set('biaya', v ? `Ikut membentuk tagihan sekitar ${rp(v.nilai)} per bulan.` : '');
    }
  }

  function posisiPop() {
    if (!buka) return;
    const W = wrap.clientWidth, skala = W / 520;
    const lebar = Math.min(280, W - 16);
    pop.style.width = lebar + 'px';
    pop.style.left = batasi(buka.anchor.x * skala - lebar / 2, 8, W - lebar - 8) + 'px';
    const tinggi = pop.offsetHeight;
    // Utamakan di bawah alat. Boleh sedikit melewati ilustrasi (popover melayang),
    // asal tidak menutupi alat yang sedang diubah.
    const bawah = buka.anchor.bawah * skala + 10;
    const atas = buka.anchor.atas * skala - tinggi - 10;
    const muatDiBawah = bawah + tinggi <= wrap.clientHeight + 70;
    pop.style.top = (muatDiBawah || atas < 4 ? bawah : atas) + 'px';
  }

  function bukaPop(jenis, pemicu, viaKeyboard) {
    if (buka && buka.pemicu === pemicu) { tutupPop(true); return; }
    tutupPop(false);
    buka = { jenis, pemicu, anchor: ANCHOR[jenis](pemicu) };
    pop.innerHTML = TEMPLATE[jenis]();
    pop.setAttribute('aria-label', 'Pengaturan ' + NAMA_ALAT[jenis]);
    pop.hidden = false;
    pemicu.setAttribute('aria-expanded', 'true');
    pemicu.classList.add('aktif');
    segarPop(); posisiPop();
    pop.classList.remove('muncul'); void pop.offsetWidth; pop.classList.add('muncul');
    if (viaKeyboard) { const f = $('input:not(:disabled), button[data-a]:not(:disabled)', pop); if (f) f.focus(); }
  }

  function tutupPop(kembalikanFokus) {
    if (!buka) return;
    const { pemicu } = buka;
    pemicu.setAttribute('aria-expanded', 'false');
    pemicu.classList.remove('aktif');
    pop.hidden = true;
    buka = null;
    if (kembalikanFokus) pemicu.focus({ preventScroll: true });
  }

  pop.addEventListener('click', (e) => {
    const b = e.target.closest('[data-a]');
    if (!b || b.disabled) return;
    const r = PL.rumah;
    switch (b.dataset.a) {
      case 'tutup': tutupPop(true); break;
      case 'ac-': PL.ubah({ num_ac_units: Math.max(0, r.num_ac_units - 1) }); break;
      case 'ac+': PL.ubah({ num_ac_units: Math.min(4, r.num_ac_units + 1), ...(r.ac_hours_per_day === 0 ? { ac_hours_per_day: 4 } : {}) }); break;
      case 'kulkas': PL.ubah({ num_refrigerators: +b.dataset.v }); break;
      case 'cuci': PL.ubah({ has_washing_machine: r.has_washing_machine ? 0 : 1 }); break;
      case 'va': PL.ubah({ electric_power_va: +b.dataset.v }); break;
      default: break;
    }
  });
  pop.addEventListener('input', (e) => {
    if (e.target.id === 'pp-jam') PL.ubah({ ac_hours_per_day: +e.target.value });
    if (e.target.id === 'pp-tv') PL.ubah({ tv_laptop_hours_per_day: +e.target.value });
  });
  pop.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); tutupPop(true); } });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && buka) tutupPop(true); });
  document.addEventListener('pointerdown', (e) => {
    if (buka && !pop.contains(e.target) && !e.target.closest('.hot')) tutupPop(false);
  });
  addEventListener('resize', posisiPop);

  function aktifkan(g, viaKeyboard) {
    const jenis = g.dataset.h, r = PL.rumah;
    if (jenis === 'orang') {
      const n = +g.dataset.i;
      PL.ubah({ num_occupants: n === r.num_occupants ? Math.max(1, n - 1) : n });
      tutupPop(false);
      return;
    }
    if (jenis === 'ac') {
      const i = +g.dataset.i;
      if (i > r.num_ac_units) PL.ubah({ num_ac_units: i, ...(r.ac_hours_per_day === 0 ? { ac_hours_per_day: 4 } : {}) });
    }
    bukaPop(jenis, g, viaKeyboard);
  }

  scene.addEventListener('click', (e) => {
    const g = e.target.closest('.hot');
    if (g) aktifkan(g, e.detail === 0);
  });
  scene.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.classList && e.target.classList.contains('hot')) {
      e.preventDefault();
      aktifkan(e.target, true);
    }
  });

  // =========================================== 2. RINCIAN TERHUBUNG KE RUMAH
  function sorot(nama, hidup) {
    const id = KE_ID[nama];
    if (!id) return;
    $$(`[data-h="${id}"]`, scene).forEach((g) => {
      if (!g.classList.contains('ac-slot') || g.classList.contains('on')) g.classList.toggle('sorot', hidup);   // AC kosong tidak ikut menyala
    });
    const tag = $('#tag-' + id, scene);
    if (tag) tag.classList.toggle('sorot', hidup);
    $$('#asal-bar span, #asal-list li').forEach((el) => el.classList.toggle('redup', hidup && el.dataset.n !== nama));
  }

  function lompat(nama) {
    const id = KE_ID[nama];
    if (!id) return;
    wrap.scrollIntoView({ block: 'nearest', behavior: halus ? 'smooth' : 'auto' });
    if (id === 'orang') {
      tutupPop(false);
      $$('.orang', scene).forEach((g) => { g.classList.remove('denyut'); void g.getBoundingClientRect(); g.classList.add('denyut'); });
      return;
    }
    const r = PL.rumah;
    const g = id === 'ac'
      ? ($$('.ac-slot.on', scene)[0] || $('.ac-slot', scene))
      : $(`[data-h="${id}"]`, scene);
    if (id === 'ac' && r.num_ac_units === 0) {
      PL.toast('Rumahmu belum punya AC. Sentuh salah satu kotak AC di rumah untuk menambahnya.');
      return;
    }
    if (!buka || buka.pemicu !== g) bukaPop(id, g, false);
  }

  ['#asal-list', '#asal-bar'].forEach((sel) => {
    const el = $(sel);
    el.addEventListener('mouseover', (e) => { const x = e.target.closest('[data-n]'); if (x) sorot(x.dataset.n, true); });
    el.addEventListener('mouseout', (e) => { const x = e.target.closest('[data-n]'); if (x) sorot(x.dataset.n, false); });
    el.addEventListener('focusin', (e) => { const x = e.target.closest('[data-n]'); if (x) sorot(x.dataset.n, true); });
    el.addEventListener('focusout', (e) => { const x = e.target.closest('[data-n]'); if (x) sorot(x.dataset.n, false); });
    el.addEventListener('click', (e) => { const x = e.target.closest('[data-n]'); if (x) lompat(x.dataset.n); });
  });
  $('#asal-list').addEventListener('keydown', (e) => {
    const x = e.target.closest('li[data-n]');
    if (x && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); lompat(x.dataset.n); }
  });

  // ============================================================ 3. TARGET
  const rT = $('#r-target'), oT = $('#o-target'), hasilT = $('#target-hasil'), cepatT = $('#target-cepat');
  let targetAktif = false, targetNilai = 0, timerT = 0, opsiTarget = [];
  const RANK = { Hemat: 0, Normal: 1, Boros: 2 };

  function aturTarget(h) {
    const maks = Math.ceil(h.tagihan / 5000) * 5000;
    const min = Math.max(0, Math.floor((h.tagihan * 0.25) / 5000) * 5000);
    rT.min = min; rT.max = maks;
    rT.value = targetAktif ? batasi(targetNilai, min, maks) : maks;
    isiRentang(rT);
    oT.textContent = targetAktif ? rp(+rT.value) : 'Pilih target';
    oT.classList.toggle('belum', !targetAktif);
    $$('button', cepatT).forEach((b) => {
      const sudah = RANK[h.kategori] <= RANK[b.dataset.k];
      b.disabled = sudah;
      b.title = sudah ? `Sudah ${h.kategori}` : '';
    });
  }

  async function cariTarget() {
    const j = await PL.panggil('target', '/api/target', { rumah: PL.rumah, target: targetNilai });
    if (!j) return;
    opsiTarget = j.opsi || [];
    if (j.sudah) {
      hasilT.innerHTML = `<p class="target-info ok">Tagihanmu sudah di bawah ${rp(targetNilai)}.</p>`;
    } else if (!j.bisa) {
      hasilT.innerHTML = `<p class="target-info">Dengan semua AC dan TV dimatikan pun, tagihan masih sekitar ${rp(j.minimum)}. Sisanya dari kulkas, penghuni, dan biaya dasar.</p>`;
    } else {
      hasilT.innerHTML = j.opsi.map((o, i) => `
        <div class="opsi">
          <div class="opsi-top"><strong>${esc(o.judul)}</strong><span class="chip" data-k="${esc(o.kategori)}">${esc(o.kategori)}</span></div>
          <ul>${o.perubahan.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>
          <div class="opsi-bot">
            <span>Jadi ${rp(o.tagihan)}, hemat ${rp(o.hemat)}</span>
            <button type="button" class="terapkan" data-i="${i}">Terapkan</button>
          </div>
        </div>`).join('');
    }
  }

  function setTarget(nilai) {
    targetAktif = true;
    targetNilai = nilai;
    rT.value = nilai; isiRentang(rT);
    oT.textContent = rp(+rT.value);
    oT.classList.remove('belum');
    clearTimeout(timerT);
    timerT = setTimeout(cariTarget, 220);
  }

  rT.addEventListener('input', () => setTarget(+rT.value));
  cepatT.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-k]');
    const m = PL.meta;
    if (!b || b.disabled || !m) return;
    const batas = b.dataset.k === 'Hemat' ? m.batas[0] : m.batas[1];
    setTarget(batasi(Math.floor((batas - 5000) / 1000) * 1000, +rT.min, +rT.max));
  });
  hasilT.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-i]');
    const o = b && opsiTarget[+b.dataset.i];
    if (o) PL.ubah(o.param, { pesan: `Diterapkan: ${o.perubahan.join(', ')}.` });
  });

  // ================================= 4. MIRING, PERCIKAN, DAN HASIL BARU
  const meter = $('#meter');
  const layar = $('.screen', meter);
  if (halus && matchMedia('(hover: hover) and (pointer: fine)').matches) {
    meter.addEventListener('pointermove', (e) => {
      const r = layar.getBoundingClientRect();
      const x = batasi((e.clientX - r.left) / r.width, -0.15, 1.15);
      const y = batasi((e.clientY - r.top) / r.height, -0.4, 1.4);
      layar.style.setProperty('--rx', ((0.5 - y) * 6).toFixed(2) + 'deg');
      layar.style.setProperty('--ry', ((x - 0.5) * 8).toFixed(2) + 'deg');
      layar.style.setProperty('--mx', (x * 100).toFixed(1) + '%');
      layar.style.setProperty('--my', (y * 100).toFixed(1) + '%');
    });
    meter.addEventListener('pointerleave', () => {
      ['--rx', '--ry'].forEach((k) => layar.style.setProperty(k, '0deg'));
      layar.style.setProperty('--mx', '50%'); layar.style.setProperty('--my', '40%');
    });
  }

  function percik(el) {
    if (!halus) return;
    const r = el.getBoundingClientRect();
    if (!r.width) return;
    const warna = ['#ffc62e', '#46e0b3', '#86a6ff', '#ff8b7e', '#ffffff'];
    for (let i = 0; i < 18; i++) {
      const s = document.createElement('i');
      const sudut = (Math.PI * 2 * i) / 18 + Math.random() * 0.4;
      const jarak = 38 + Math.random() * 46;
      s.className = 'pcl';
      s.style.cssText = `left:${r.left + r.width / 2}px;top:${r.top + r.height / 2}px;background:${warna[i % warna.length]};` +
        `--dx:${(Math.cos(sudut) * jarak).toFixed(1)}px;--dy:${(Math.sin(sudut) * jarak).toFixed(1)}px`;
      document.body.appendChild(s);
      setTimeout(() => s.remove(), 900);
    }
  }

  let kategoriLama = null;
  function hasilBaru(h) {
    if (kategoriLama && RANK[h.kategori] < RANK[kategoriLama]) percik($('#chip-kategori'));
    kategoriLama = h.kategori;
    segarTag();
    segarPop();
    aturTarget(h);
    if (targetAktif) cariTarget();
  }

  // ============================================================ 5. KALENDER
  const HARI_KAL = 70;
  const kal = $('#kal'), ketKal = $('#kal-ket');
  (function bangunKal() {
    const sekarang = new Date();
    const awal = (sekarang.getDay() + 6) % 7;     // Senin = 0
    let html = '';
    for (let i = 0; i < awal; i++) html += '<i class="kd pad"></i>';
    for (let n = 0; n < HARI_KAL; n++) {
      const d = new Date(sekarang.getFullYear(), sekarang.getMonth(), sekarang.getDate() + n);
      const tampilTgl = n === 0 || d.getDate() === 1;
      const nama = d.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long' });
      html += `<i class="kd${n === 0 ? ' hariini' : ''}" data-n="${n}" title="${nama}">${tampilTgl ? `<b>${d.getDate()}</b>` : ''}</i>`;
    }
    kal.innerHTML = html;
  })();

  function segarKal(d) {
    const hari = d.hari || 0;
    const terakhir = Math.ceil(hari) - 1;
    $$('.kd[data-n]', kal).forEach((el) => {
      const n = +el.dataset.n;
      const isi = batasi(hari - n, 0, 1);
      el.classList.toggle('penuh', isi >= 1);
      el.classList.toggle('sebagian', isi > 0 && isi < 1);
      el.classList.toggle('akhir', n === terakhir && hari <= HARI_KAL);
      el.style.setProperty('--f', Math.round(isi * 100) + '%');
    });
    const habis = new Date(Date.now() + hari * 864e5);
    ketKal.textContent = hari > HARI_KAL
      ? `Token masih tersisa setelah ${HARI_KAL} hari ke depan.`
      : hari < 1
        ? 'Token ini habis kurang dari sehari.'
        : `Hari terakhir: ${habis.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long' })}.`;
    kal.setAttribute('aria-label', `Kalender: token bertahan sekitar ${fmtInt(hari)} hari.`);
  }

  // ================================================================ MULAI
  // Animasi lompat selesai: lepas kelasnya supaya animasi napas kembali jalan.
  scene.addEventListener('animationend', (e) => {
    const g = e.target.closest && e.target.closest('.denyut');
    if (g) g.classList.remove('denyut');
  });

  PL.onRumah(segarScene);
  PL.onHasil(hasilBaru);
  PL.onToken(segarKal);
  segarScene(PL.rumah);
  if (PL.hasil) hasilBaru(PL.hasil);
})();
