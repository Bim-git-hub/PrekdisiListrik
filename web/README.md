# Tampilan web

Antarmuka web untuk model di `prediksi_listrik.py`. Dokumentasi lengkap (cara pasang, fitur, cara kerja model, dan referensi API) ada di [README utama](../README.md).

Jalankan dari folder project, bukan dari dalam `web/`:

```bash
pip install -r web/requirements.txt
python web/app.py
```

Lalu buka http://127.0.0.1:5000.

| File | Isi |
| --- | --- |
| `app.py` | Server Flask dan API JSON. Memakai `ModelListrik` tanpa mengubahnya. |
| `static/index.html` | Kerangka halaman |
| `static/style.css` | Gaya |
| `static/app.js` | Form, tab, dan pemanggilan API |
| `static/interaksi.js` | Rumah interaktif, target tagihan, dan kalender token |
| `static/fonts/` | Plus Jakarta Sans dan DSEG7, disimpan lokal |
