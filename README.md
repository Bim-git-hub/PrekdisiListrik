# Tampilan web Prediksi Tagihan Listrik

GUI berbasis web untuk model di `prediksi_listrik.py`. Logika prediksi tidak diubah:
`web/app.py` memanggil class `ModelListrik` yang sama, lalu membuka hasilnya lewat API JSON.

## Cara menjalankan

Dari folder project (yang berisi file CSV):

```bash
pip install -r requirments.txt      # dependensi model yang sudah ada
pip install -r web/requirements.txt # Flask
python web/app.py
```

Buka http://127.0.0.1:5000 di browser.

Opsi tambahan:

- `--data <folder>` jika file CSV ada di folder lain
- `--port 8080` untuk ganti port
- `--host 0.0.0.0` agar bisa dibuka dari HP di jaringan yang sama

## Isi halaman

| Tab | Fungsi |
| --- | --- |
| Prediksi | Perkiraan tagihan per bulan, kategori Hemat/Normal/Boros, pemakaian kWh, dan rincian per komponen. Berubah langsung saat input digeser. |
| Simulasi hemat | Skenario hemat otomatis (kurangi jam AC, kurangi 1 AC, kurangi TV dan laptop) plus skenario buatan sendiri dengan slider. Tiap skenario bisa langsung diterapkan. |
| Token | Token yang dibeli habis dalam berapa hari, lengkap dengan kalender hari demi hari. |
| Model | Akurasi model, matriks kebingungan SVM, pengaruh tiap faktor, dan batas kategori. |

## Fitur interaktif

- **Rumah interaktif.** Sentuh AC, TV dan laptop, kulkas, mesin cuci, atau meteran listrik untuk mengubahnya. Sentuh penghuni untuk menambah atau mengurangi. Biaya per bulan tampil di tiap alat.
- **Rincian terhubung ke rumah.** Arahkan kursor ke baris rincian tagihan untuk menyorot alatnya di rumah, atau klik untuk membuka pengaturannya.
- **Target tagihan.** Geser target atau pilih "Turun ke Hemat". Aplikasi mencari perubahan paling ringan (jam AC, jumlah AC, jam TV) yang mencapai target.
- **Terapkan dan Urungkan.** Skenario simulasi dan saran target bisa diterapkan satu klik, dan bisa diurungkan dari notifikasi di bawah.
- **Meteran.** Layar meteran miring mengikuti kursor, dan muncul percikan saat kategori membaik.

Data rumah terakhir yang kamu isi tersimpan di browser (localStorage).

## API

| Endpoint | Fungsi |
| --- | --- |
| `GET /api/meta` | Kualitas model, koefisien, batas kategori, tarif |
| `POST /api/predict` | Tagihan, kategori, kWh, rincian |
| `POST /api/simulate` | Daftar skenario hemat (beserta parameter untuk diterapkan) |
| `POST /api/target` | Perubahan paling ringan untuk mencapai target tagihan |
| `POST /api/token` | Lama token bertahan |

Batas input sama dengan versi terminal (daya VA, 1 sampai 6 penghuni, 0 sampai 4 AC, dan seterusnya).
Font (Plus Jakarta Sans dan DSEG7) disimpan di `web/static/fonts`, jadi halaman jalan tanpa internet.
