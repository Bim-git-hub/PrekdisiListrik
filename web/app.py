"""
Server web untuk Prediksi Tagihan Listrik.

Model dan logika prediksi tetap memakai ModelListrik dari prediksi_listrik.py
(tidak diubah). File ini hanya membuka model itu lewat API JSON dan
menyajikan tampilan web di folder static/.

Jalankan dari folder project:
    python web/app.py
lalu buka http://127.0.0.1:5000
"""
import argparse
import sys
from pathlib import Path

from flask import Flask, jsonify, request, send_from_directory

FOLDER_WEB = Path(__file__).resolve().parent
FOLDER_PROJECT = FOLDER_WEB.parent
sys.path.insert(0, str(FOLDER_PROJECT))

import prediksi_listrik as pl  # noqa: E402  (harus setelah sys.path diatur)

app = Flask(__name__, static_folder=str(FOLDER_WEB / "static"), static_url_path="/static")
app.json.ensure_ascii = False

model = None
df_data = None


# ----------------------------------------------------------------------------
# Memuat model sekali saat server mulai
# ----------------------------------------------------------------------------
def siapkan_model(folder_data=None):
    global model, df_data
    folder = pl.folder_pencarian(folder_data)
    df_multi = pl.muat_csv(pl.FILE_MULTI, folder)
    if df_multi is None:
        sys.exit(f"Dataset '{pl.FILE_MULTI}' tidak ditemukan. "
                 "Pakai: python web/app.py --data <folder berisi CSV>")
    df_simple = pl.muat_csv(pl.FILE_SIMPLE, folder)
    print("Menyiapkan model, mohon tunggu sebentar...")
    model = pl.ModelListrik(df_multi, df_simple)
    df_data = df_multi
    reg = model.laporan_regresi[pl.NAMA_REGRESI]
    print(f"Model siap. Regresi R2 {reg['r2']:.1%}, akurasi SVM {model.laporan_svm['akurasi']:.1%}.")


# ----------------------------------------------------------------------------
# Validasi input (batas sama dengan versi terminal)
# ----------------------------------------------------------------------------
class InputSalah(ValueError):
    pass


def _angka(data, kunci, lo, hi, bulat=False, nama=None):
    nama = nama or kunci
    if kunci not in data:
        raise InputSalah(f"Data '{nama}' belum diisi.")
    try:
        v = float(data[kunci])
    except (TypeError, ValueError):
        raise InputSalah(f"'{nama}' harus berupa angka.")
    if bulat and v != int(v):
        raise InputSalah(f"'{nama}' harus bilangan bulat.")
    if not lo <= v <= hi:
        raise InputSalah(f"'{nama}' harus antara {lo} dan {hi}.")
    return int(v) if bulat else v


def baca_rumah(data):
    """Ubah JSON dari browser menjadi dict rumah yang dipakai ModelListrik."""
    if not isinstance(data, dict):
        raise InputSalah("Data rumah tidak terbaca.")
    va = _angka(data, "electric_power_va", 0, 10**6, bulat=True, nama="Daya listrik")
    if va not in pl.VA_KATEGORI:
        raise InputSalah("Daya listrik harus salah satu dari: " + ", ".join(map(str, pl.VA_KATEGORI)))
    jumlah_ac = _angka(data, "num_ac_units", 0, 4, bulat=True, nama="Jumlah AC")
    jam_ac = _angka(data, "ac_hours_per_day", 0, 14, nama="Jam AC per hari") if jumlah_ac > 0 else 0.0
    return {
        "electric_power_va": va,
        "num_occupants": _angka(data, "num_occupants", 1, 6, bulat=True, nama="Jumlah penghuni"),
        "num_ac_units": jumlah_ac,
        "ac_hours_per_day": jam_ac,
        "num_refrigerators": _angka(data, "num_refrigerators", 1, 2, bulat=True, nama="Jumlah kulkas"),
        "tv_laptop_hours_per_day": _angka(data, "tv_laptop_hours_per_day", 0, 10, nama="Jam TV dan laptop"),
        "has_washing_machine": _angka(data, "has_washing_machine", 0, 1, bulat=True, nama="Mesin cuci"),
    }


@app.errorhandler(InputSalah)
def tangani_input_salah(e):
    return jsonify(error=str(e)), 400


# ----------------------------------------------------------------------------
# Halaman utama
# ----------------------------------------------------------------------------
@app.get("/")
def halaman_utama():
    resp = send_from_directory(app.static_folder, "index.html")
    resp.headers["Cache-Control"] = "no-store"
    return resp


# ----------------------------------------------------------------------------
# API
# ----------------------------------------------------------------------------
@app.get("/api/meta")
def api_meta():
    """Info statis: batas input, kualitas model, koefisien, tarif."""
    reg = model.laporan_regresi[pl.NAMA_REGRESI]
    kelas = [str(k) for k in model.encoder.classes_]
    matriks = model.laporan_svm["matriks"].tolist()

    per_kelas = []
    for i, nama in enumerate(kelas):
        tp = matriks[i][i]
        total_prediksi = sum(matriks[r][i] for r in range(len(kelas)))
        total_asli = sum(matriks[i])
        per_kelas.append({
            "kelas": nama,
            "presisi": tp / total_prediksi if total_prediksi else None,
            "recall": tp / total_asli if total_asli else None,
            "jumlah": total_asli,
        })

    tagihan = df_data[pl.TARGET]
    return jsonify(
        va=pl.VA_KATEGORI,
        batas=[float(b) for b in model.batas],
        tagihan_min=float(tagihan.min()),
        tagihan_maks=float(tagihan.max()),
        tagihan_rata=float(tagihan.mean()),
        jumlah_data=int(len(df_data)),
        r2=reg["r2"], mae=reg["mae"], cv_r2=reg["cv_r2"],
        akurasi_svm=model.laporan_svm["akurasi"],
        kelas=kelas, matriks=matriks, per_kelas=per_kelas,
        tarif=model.tarif, biaya_tetap=model.biaya_tetap,
        koefisien={k: float(v) for k, v in model.coef.items()},
        intercept=float(model.intercept),
    )


def hitung_hasil(p):
    tagihan = model.prediksi_tagihan(p)
    kwh = model.kwh_dari_tagihan(tagihan)
    rincian = [{"nama": nama, "nilai": float(v)} for nama, v in model.rincian(p).items()]
    rincian.sort(key=lambda r: -r["nilai"])

    tip = None
    if p["ac_hours_per_day"] >= 1:
        hemat = tagihan - model.prediksi_tagihan(dict(p, ac_hours_per_day=p["ac_hours_per_day"] - 1))
        tip = {"jenis": "ac", "hemat": float(hemat)}
    elif p["num_ac_units"] == 0:
        tip = {"jenis": "tanpa_ac", "hemat": 0.0}

    return {
        "tagihan": float(tagihan),
        "rendah": float(max(0.0, tagihan - model.mae)),
        "tinggi": float(tagihan + model.mae),
        "kwh": None if kwh is None else float(kwh),
        "per_hari": float(tagihan / 30),
        "kategori": model.prediksi_kategori(p),
        "rincian": rincian,
        "tip": tip,
    }


@app.post("/api/predict")
def api_predict():
    p = baca_rumah(request.get_json(silent=True))
    return jsonify(hitung_hasil(p))


@app.post("/api/simulate")
def api_simulate():
    """Skenario hemat otomatis, sama seperti menu simulasi di versi terminal."""
    p = baca_rumah(request.get_json(silent=True))
    dasar = model.prediksi_tagihan(p)

    skenario = []
    for h in (1, 2, 3):
        if p["ac_hours_per_day"] - h >= 0 and p["ac_hours_per_day"] >= 1:
            skenario.append((f"Kurangi jam AC {h} jam per hari",
                             dict(p, ac_hours_per_day=p["ac_hours_per_day"] - h)))
    if p["num_ac_units"] >= 1:
        sisa = p["num_ac_units"] - 1
        skenario.append(("Pakai 1 AC lebih sedikit",
                         dict(p, num_ac_units=sisa, ac_hours_per_day=p["ac_hours_per_day"] if sisa else 0)))
    if p["tv_laptop_hours_per_day"] >= 2:
        skenario.append(("TV dan laptop 2 jam lebih sedikit",
                         dict(p, tv_laptop_hours_per_day=p["tv_laptop_hours_per_day"] - 2)))

    hasil = []
    for nama, q in skenario:
        baru = model.prediksi_tagihan(q)
        hasil.append({
            "nama": nama,
            "tagihan": float(baru),
            "hemat": float(dasar - baru),
            "kategori": model.prediksi_kategori(q),
            # parameter lengkap supaya tombol "Terapkan" di browser bisa memakainya
            "param": {
                "num_ac_units": q["num_ac_units"],
                "ac_hours_per_day": q["ac_hours_per_day"],
                "tv_laptop_hours_per_day": q["tv_laptop_hours_per_day"],
            },
        })
    hasil.sort(key=lambda r: -r["hemat"])
    return jsonify(
        dasar=float(dasar),
        kategori=model.prediksi_kategori(p),
        punya_ac=p["num_ac_units"] > 0,
        skenario=hasil,
    )


def _frek(n):
    """Jam dengan setengah jam: 4.0 -> '4', 4.5 -> '4,5'."""
    return f"{n:g}".replace(".", ",")


@app.post("/api/target")
def api_target():
    """Cari perubahan paling ringan supaya tagihan turun ke target.

    Yang diubah hanya jumlah AC, jam AC, dan jam TV/laptop, dan hanya ke arah
    berkurang. Tagihan kandidat dihitung cepat dari koefisien regresi (rumusnya
    sama dengan ModelListrik), lalu hasil akhirnya dicek ulang oleh model asli.
    """
    data = request.get_json(silent=True) or {}
    p = baca_rumah(data.get("rumah"))
    target = _angka(data, "target", 0, 10_000_000, nama="Target tagihan")

    dasar = model.prediksi_tagihan(p)
    if dasar <= target:
        return jsonify(sudah=True, dasar=float(dasar), target=float(target), opsi=[])

    r = model.rincian(p)
    lain = sum(r.values()) - r["AC"] - r["TV / laptop"]     # komponen yang tidak diubah
    c_ac = model.coef["ac_unit_hours"]
    c_punya = model.coef["punya_ac"]
    c_tv = model.coef["tv_laptop_hours_per_day"]

    U, H, T = p["num_ac_units"], p["ac_hours_per_day"], p["tv_laptop_hours_per_day"]
    jam_ac = [i * 0.5 for i in range(int(H * 2) + 1)]
    jam_tv = [i * 0.5 for i in range(int(T * 2) + 1)]

    kandidat = []
    for u in range(U, -1, -1):
        for h in (jam_ac if u > 0 else [0.0]):
            ac = c_ac * u * h + (c_punya if u > 0 else 0.0)
            for t in jam_tv:
                tagihan = max(0.0, lain + ac + c_tv * t)
                if tagihan > target:
                    continue
                # "Beratnya" perubahan: jam AC yang hilang, plus bobot bila alat dilepas
                berat = (U * H - u * h) + 1.5 * (U - u) + 0.5 * (T - t)
                kandidat.append((berat, u, h, t))

    if not kandidat:
        minimum = max(0.0, lain)          # semua AC dan TV/laptop dimatikan
        return jsonify(sudah=False, bisa=False, dasar=float(dasar), target=float(target),
                       minimum=float(minimum), opsi=[])

    kandidat.sort()
    # Tiga gaya yang sengaja berbeda supaya pengguna punya pilihan nyata.
    filter_opsi = [
        ("Paling ringan", lambda u, h, t: True),
        ("Lepas satu AC", lambda u, h, t: U >= 1 and u == U - 1),
        ("Ikut kurangi TV dan laptop", lambda u, h, t: T >= 1 and t <= T - 1),
    ]
    terpilih, dipakai = [], set()
    for judul, cocok in filter_opsi:
        for berat, u, h, t in kandidat:
            if not cocok(u, h, t) or (u, h, t) in dipakai:
                continue
            dipakai.add((u, h, t))
            terpilih.append((judul, u, h, t))
            break

    opsi = []
    for judul, u, h, t in terpilih:
        q = dict(p, num_ac_units=u, ac_hours_per_day=h, tv_laptop_hours_per_day=t)
        perubahan = []
        if u < U:
            perubahan.append("Pakai %d AC lebih sedikit" % (U - u) if U - u > 1 else "Pakai 1 AC lebih sedikit")
        if u > 0 and h < H:
            perubahan.append(f"AC dari {_frek(H)} jadi {_frek(h)} jam per hari")
        if t < T:
            perubahan.append(f"TV dan laptop dari {_frek(T)} jadi {_frek(t)} jam")
        baru = model.prediksi_tagihan(q)
        opsi.append({
            "judul": judul,
            "perubahan": perubahan,
            "tagihan": float(baru),
            "hemat": float(dasar - baru),
            "kategori": model.prediksi_kategori(q),
            "param": {"num_ac_units": u, "ac_hours_per_day": h, "tv_laptop_hours_per_day": t},
        })
    return jsonify(sudah=False, bisa=True, dasar=float(dasar), target=float(target), opsi=opsi)


@app.post("/api/token")
def api_token():
    """Token yang dibeli akan habis dalam berapa hari."""
    if model.tarif is None:
        return jsonify(error="Dataset kWh tidak ditemukan, fitur token tidak tersedia."), 400
    data = request.get_json(silent=True) or {}
    p = baca_rumah(data.get("rumah"))
    nominal = _angka(data, "nominal", 20_000, 5_000_000, nama="Nominal token")

    kwh_bulan = model.kwh_dari_tagihan(model.prediksi_tagihan(p))
    kwh_hari = kwh_bulan / 30
    kwh_token = nominal / model.tarif
    hari = kwh_token / kwh_hari if kwh_hari > 0 else None
    return jsonify(
        kwh_hari=float(kwh_hari),
        kwh_token=float(kwh_token),
        hari=None if hari is None else float(hari),
        tarif=float(model.tarif),
    )


# ----------------------------------------------------------------------------
# Program utama
# ----------------------------------------------------------------------------
def main():
    ap = argparse.ArgumentParser(description="Tampilan web Prediksi Tagihan Listrik")
    ap.add_argument("--data", help="folder yang berisi file CSV dataset")
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=5000)
    args = ap.parse_args()

    siapkan_model(args.data)
    print(f"Buka http://{args.host}:{args.port} di browser.")
    app.run(host=args.host, port=args.port, debug=False)


if __name__ == "__main__":
    main()
