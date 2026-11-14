#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
PREDIKSI TAGIHAN LISTRIK RUMAH TANGGA  -  satu file, menu interaktif
====================================================================
Memperkirakan tagihan listrik bulanan (Rp) dari kebiasaan pemakaian alat
elektronik di rumah, menentukan kategorinya (Hemat/Normal/Boros),
menyimulasikan penghematan, dan memperkirakan token habis dalam berapa hari.

Tiga modul yang dipelajari di kuliah (urutan di file ini):
  Modul 1  Teknik Labelling Data       LabelEncoder, label kontinu & kategori
  Modul 2  Teknik Preprocessing Data   Binarizer, One-Hot, Mean Removal, MinMax
  Modul 3  Supervised Learning         Regresi (Linear, Random Forest) + SVM

Dataset (CSV, taruh di folder yang sama dengan file ini):
  dataset_electricity_multiple_linear.csv
  dataset_electricity_simple_linear.csv

Cara pakai:
    pip install pandas numpy scikit-learn
    python prediksi_listrik.py                 # CSV satu folder dengan program
    python prediksi_listrik.py --data folder   # atau tunjuk folder datanya
"""

import argparse
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn import preprocessing
from sklearn.ensemble import RandomForestRegressor
from sklearn.linear_model import LinearRegression
from sklearn.metrics import (accuracy_score, classification_report,
                             confusion_matrix, mean_absolute_error, r2_score)
from sklearn.model_selection import KFold, cross_val_score, train_test_split
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.svm import SVC

FILE_MULTI = "dataset_electricity_multiple_linear.csv"
FILE_SIMPLE = "dataset_electricity_simple_linear.csv"


# ============================================================================
# UTILITAS - pemuat dataset, format rupiah, input interaktif
# ============================================================================

# ----------------------------------------------------------------------------
# Memuat dataset (CSV langsung, tanpa zip)
# ----------------------------------------------------------------------------
def folder_pencarian(folder_data=None):
    """Daftar folder tempat program mencari file CSV."""
    folder_program = Path(__file__).resolve().parent
    daftar = [Path(folder_data)] if folder_data else []
    daftar += [folder_program, Path.cwd(), folder_program / "data"]
    return daftar


def muat_csv(nama_file, daftar_folder):
    """Baca CSV dari folder pertama yang memuatnya. Mengembalikan None jika tidak ada."""
    for folder in daftar_folder:
        berkas = folder / nama_file
        if berkas.exists():
            return pd.read_csv(berkas)
    return None


# ----------------------------------------------------------------------------
# Format tampilan
# ----------------------------------------------------------------------------
def rp(x):
    return "Rp {:,.0f}".format(x).replace(",", ".")


# ----------------------------------------------------------------------------
# Input interaktif (diulang sampai valid)
# ----------------------------------------------------------------------------
def ask_number(prompt, lo, hi, integer=False):
    while True:
        raw = input(f"  {prompt} [{lo}-{hi}]: ").strip().replace(",", ".")
        try:
            v = float(raw)
        except ValueError:
            print("   ! Masukkan angka saja, misal 3 atau 5.5")
            continue
        if integer and v != int(v):
            print("   ! Harus bilangan bulat.")
            continue
        if not lo <= v <= hi:
            print(f"   ! Nilai harus antara {lo} dan {hi}.")
            continue
        return int(v) if integer else v


def ask_yes_no(prompt):
    while True:
        a = input(f"  {prompt} [y/n]: ").strip().lower()
        if a in ("y", "ya", "1"):
            return 1
        if a in ("n", "t", "tidak", "0"):
            return 0
        print("   ! Jawab y (ya) atau n (tidak).")


def ask_pilihan(prompt, pilihan):
    teks = " / ".join(str(p) for p in pilihan)
    while True:
        raw = input(f"  {prompt} [{teks}]: ").strip().replace(",", ".")
        try:
            v = int(float(raw))
        except ValueError:
            print("   ! Ketik salah satu angka pilihan.")
            continue
        if v in pilihan:
            return v
        print(f"   ! Pilihan harus salah satu dari: {teks}")


# ============================================================================
# MODUL 1 - TEKNIK LABELLING DATA
# Materi: Modul3.ipynb (LabelEncoder). Label kontinu = tagihan (Rp); label kategori = Hemat/Normal/Boros.
# ============================================================================

NAMA_KELAS = ["Hemat", "Normal", "Boros"]


def buat_label_kategori(tagihan, batas=None):
    """Ubah tagihan (kontinu) menjadi kategori. Mengembalikan (label, batas)."""
    # 1. Tentukan batas Hemat/Normal dan Normal/Boros dari kuantil 1/3 dan 2/3.
    if batas is None:
        batas = tagihan.quantile([1 / 3, 2 / 3]).values
    # 2. Beri label pada tiap rumah.
    label = pd.cut(tagihan, bins=[-np.inf, batas[0], batas[1], np.inf], labels=NAMA_KELAS)
    return label.astype(str), batas


def buat_encoder():
    """LabelEncoder: mengubah teks label menjadi angka (seperti Modul3)."""
    encoder = preprocessing.LabelEncoder()
    encoder.fit(NAMA_KELAS)
    return encoder


def tampilkan_labelling(tagihan, label, batas, encoder):
    print("\n" + "=" * 56)
    print(" MODUL 1 - TEKNIK LABELLING DATA")
    print("=" * 56)
    print(" Label 1 (kontinu): total tagihan listrik per bulan")
    print(f"   terendah {rp(tagihan.min())} | rata-rata {rp(tagihan.mean())} | tertinggi {rp(tagihan.max())}")

    print("\n Label 2 (kategori): dibuat dari kuantil tagihan")
    jumlah = label.value_counts()
    print(f"   Hemat  : tagihan sampai {rp(batas[0])}  ({jumlah.get('Hemat', 0)} rumah)")
    print(f"   Normal : {rp(batas[0])} s/d {rp(batas[1])}  ({jumlah.get('Normal', 0)} rumah)")
    print(f"   Boros  : di atas {rp(batas[1])}  ({jumlah.get('Boros', 0)} rumah)")

    print("\n LabelEncoder (teks -> angka, seperti di Modul 3):")
    contoh = ["Normal", "Hemat", "Boros"]
    nilai = encoder.transform(contoh)
    print("   Labels         =", contoh)
    print("   Encoded values =", [int(v) for v in nilai])
    print("   Decoded labels =", [str(v) for v in encoder.inverse_transform(nilai)])
    print("   Urutan kode    =", {str(k): i for i, k in enumerate(encoder.classes_)})


# ============================================================================
# MODUL 2 - TEKNIK PREPROCESSING DATA
# Materi: Modul4.ipynb (Binarizer, mean removal, MinMax) + One-Hot Encoding daya VA.
# ============================================================================

VA_KATEGORI = [900, 1300, 2200, 3500, 5500]

FITUR_ANGKA = [
    "num_occupants",
    "num_refrigerators",
    "tv_laptop_hours_per_day",
    "has_washing_machine",
    "ac_unit_hours",
    "punya_ac",
]


def tambah_fitur(df):
    """Rekayasa fitur + Binarization."""
    df = df.copy()
    df["ac_unit_hours"] = df["num_ac_units"] * df["ac_hours_per_day"]
    biner = preprocessing.Binarizer(threshold=0.5)
    df["punya_ac"] = biner.fit_transform(df[["num_ac_units"]]).ravel()
    return df


def one_hot_va(df):
    """One-Hot Encoding daya VA. Kategori pertama (900 VA) jadi acuan."""
    tipe = pd.CategoricalDtype(VA_KATEGORI)
    hasil = pd.get_dummies(df["electric_power_va"].astype(tipe), prefix="va", dtype=float)
    return hasil.iloc[:, 1:]


def siapkan_fitur(df):
    """Dataframe mentah -> tabel fitur siap masuk model."""
    df = tambah_fitur(df)
    return pd.concat([df[FITUR_ANGKA], one_hot_va(df)], axis=1)


def _bulat(a):
    return np.round(a, 2) + 0.0  # +0.0 supaya "-0.0" tampil sebagai "0.0"


def tampilkan_preprocessing(df_multi):
    print("\n" + "=" * 56)
    print(" MODUL 2 - TEKNIK PREPROCESSING DATA")
    print("=" * 56)

    # 1. Binarization
    contoh = df_multi.head(5)
    biner = preprocessing.Binarizer(threshold=0.5).fit_transform(contoh[["num_ac_units"]])
    print(" 1. Binarization (threshold 0.5): jumlah AC -> punya AC?")
    tabel = pd.DataFrame({"jumlah_AC": contoh["num_ac_units"].values,
                          "punya_ac": biner.ravel().astype(int)})
    print("   " + tabel.to_string(index=False).replace("\n", "\n   "))

    # 2. Mean Removal (Standardisasi)
    kolom = ["ac_hours_per_day", "tv_laptop_hours_per_day"]
    data = df_multi[kolom].values
    data_scaled = preprocessing.scale(data)
    print("\n 2. Mean Removal (kolom: jam AC, jam TV/laptop)")
    print("   Sebelum  -> mean =", _bulat(data.mean(axis=0)), "| std =", _bulat(data.std(axis=0)))
    print("   Sesudah  -> mean =", _bulat(data_scaled.mean(axis=0)), "| std =", _bulat(data_scaled.std(axis=0)))

    # 3. Min-Max Scaling
    minmax = preprocessing.MinMaxScaler(feature_range=(0, 1))
    data_minmax = minmax.fit_transform(data)
    print("\n 3. Min-Max Scaling (skala 0 sampai 1)")
    print("   Sebelum  -> min =", _bulat(data.min(axis=0)), "| maks =", _bulat(data.max(axis=0)))
    print("   Sesudah  -> min =", _bulat(data_minmax.min(axis=0)), "| maks =", _bulat(data_minmax.max(axis=0)))

    # 4. One-Hot Encoding
    print("\n 4. One-Hot Encoding daya VA (5 rumah pertama)")
    onehot = one_hot_va(contoh)
    tabel = pd.concat([contoh[["electric_power_va"]].reset_index(drop=True),
                       onehot.reset_index(drop=True).astype(int)], axis=1)
    print("   " + tabel.to_string(index=False).replace("\n", "\n   "))
    print("   (900 VA = acuan, jadi semua kolom bernilai 0)")

    print("\n Catatan: normalisasi L1/L2 (materi Modul4.ipynb) tidak dipakai di sini karena")
    print(" menormalkan per baris (per rumah), sehingga mengaburkan arti jam dan")
    print(" jumlah alat.")


# ============================================================================
# MODUL 3 - SUPERVISED LEARNING
# Materi: SupervisedLearning.ipynb. Regresi (tagihan Rp) + klasifikasi SVM (Hemat/Normal/Boros).
# ============================================================================



TARGET = "electricity_bill_idr"
NAMA_REGRESI = "Multiple Linear Regression"
NAMA_RF = "Random Forest Regressor"


class ModelListrik:
    def __init__(self, df_multi, df_simple=None):
        # 1. Fitur (Modul 2) dan label (Modul 1)
        X = siapkan_fitur(df_multi)
        y = df_multi[TARGET]
        label, self.batas = buat_label_kategori(y)
        self.encoder = buat_encoder()
        kelas = self.encoder.transform(label)
        self.kolom = list(X.columns)
        self.rentang = df_multi.agg(["min", "max"])

        # 2. Membagi data menjadi training dan testing set (80% : 20%)
        X_tr, X_te, y_tr, y_te, k_tr, k_te = train_test_split(
            X, y, kelas, test_size=0.2, random_state=42)

        # 3. REGRESI: latih, uji, dan validasi silang
        self.model_regresi = {
            NAMA_REGRESI: make_pipeline(StandardScaler(), LinearRegression()),
            NAMA_RF: RandomForestRegressor(n_estimators=300, random_state=42),
        }
        self.laporan_regresi = {}
        kf = KFold(5, shuffle=True, random_state=42)
        for nama, m in self.model_regresi.items():
            m.fit(X_tr, y_tr)
            pred = m.predict(X_te)
            self.laporan_regresi[nama] = {
                "r2": r2_score(y_te, pred),
                "mae": mean_absolute_error(y_te, pred),
                "cv_r2": cross_val_score(m, X, y, cv=kf, scoring="r2").mean(),
            }
        self.mae = self.laporan_regresi[NAMA_REGRESI]["mae"]

        # 4. KLASIFIKASI: SVM (standarisasi lalu SVC, sama seperti materi).
        #    Kernel linear dipilih karena hubungan fitur-tagihan hampir linear
        #    (validasi silang ~96,5% vs ~90% untuk SVC() bawaan).
        self.model_svm = make_pipeline(StandardScaler(), SVC(kernel="linear", C=100))
        self.model_svm.fit(X_tr, k_tr)
        k_pred = self.model_svm.predict(X_te)
        self.laporan_svm = {
            "akurasi": accuracy_score(k_te, k_pred),
            "laporan": classification_report(k_te, k_pred, target_names=self.encoder.classes_),
            "matriks": confusion_matrix(k_te, k_pred),
        }

        # 5. Latih ulang model final dengan seluruh data
        self.regresi = self.model_regresi[NAMA_REGRESI].fit(X, y)
        self.model_svm.fit(X, kelas)

        # 6. Koefisien regresi dalam satuan asli (Rp per 1 satuan fitur)
        scaler = self.regresi.named_steps["standardscaler"]
        lr = self.regresi.named_steps["linearregression"]
        self.coef = pd.Series(lr.coef_ / scaler.scale_, index=self.kolom)
        self.intercept = lr.intercept_ - float((lr.coef_ * scaler.mean_ / scaler.scale_).sum())

        # 7. Model sederhana kWh -> tagihan (dataset kedua): tagihan = tarif x kWh + biaya tetap
        self.tarif, self.biaya_tetap = None, None
        if df_simple is not None:
            s = LinearRegression().fit(df_simple[["total_kwh_monthly"]], df_simple[TARGET])
            self.tarif, self.biaya_tetap = float(s.coef_[0]), float(s.intercept_)

    # ------------------------------------------------------------------
    def _fitur(self, p):
        return siapkan_fitur(pd.DataFrame([p]))[self.kolom]

    def prediksi_tagihan(self, p):
        return max(0.0, float(self.regresi.predict(self._fitur(p))[0]))

    def prediksi_kategori(self, p):
        kode = self.model_svm.predict(self._fitur(p))
        return str(self.encoder.inverse_transform(kode)[0])

    def kwh_dari_tagihan(self, tagihan):
        if self.tarif:
            return max(0.0, (tagihan - self.biaya_tetap) / self.tarif)
        return None

    def rincian(self, p):
        """Uraikan tagihan per komponen dari koefisien regresi linear."""
        r = self._fitur(p).iloc[0]
        va = [c for c in self.kolom if c.startswith("va_")]
        return {
            "AC": self.coef["ac_unit_hours"] * r["ac_unit_hours"] + self.coef["punya_ac"] * r["punya_ac"],
            "Kulkas": self.coef["num_refrigerators"] * r["num_refrigerators"],
            "Jumlah penghuni": self.coef["num_occupants"] * r["num_occupants"],
            "Mesin cuci": self.coef["has_washing_machine"] * r["has_washing_machine"],
            "TV / laptop": self.coef["tv_laptop_hours_per_day"] * r["tv_laptop_hours_per_day"],
            "Biaya dasar & daya VA": self.intercept + sum(self.coef[c] * r[c] for c in va),
        }


def tampilkan_supervised(m):
    print("\n" + "=" * 56)
    print(" MODUL 3 - SUPERVISED LEARNING")
    print("=" * 56)
    print(" A. REGRESI (prediksi tagihan dalam Rp)")
    print(f"   {'Model':<28}{'R2 uji':>8}{'R2 CV-5':>9}{'Selisih':>12}")
    for nama, r in m.laporan_regresi.items():
        print(f"   {nama:<28}{r['r2']:>8.3f}{r['cv_r2']:>9.3f}{rp(r['mae']):>12}")
    print("   (Selisih = rata-rata kesalahan prediksi pada data uji)")
    print(f"   Model yang dipakai program: {NAMA_REGRESI}")

    print("\n   Pengaruh tiap faktor terhadap tagihan:")
    label = [("ac_unit_hours", "1 jam AC per hari (per unit)"),
             ("num_refrigerators", "1 kulkas tambahan"),
             ("num_occupants", "1 penghuni tambahan"),
             ("has_washing_machine", "punya mesin cuci"),
             ("tv_laptop_hours_per_day", "1 jam TV/laptop per hari")]
    for k, teks in label:
        print(f"     {teks:<30}{rp(m.coef[k]):>12} / bulan")
    va = m.coef[[c for c in m.kolom if c.startswith("va_")]]
    print(f"     {'daya VA (selisih terhadap 900)':<30}{rp(va.abs().max()):>12} / bulan (maks.)")
    print("     -> daya VA nyaris tidak berpengaruh pada tagihan di dataset ini.")

    print("\n B. KLASIFIKASI SVM (prediksi Hemat / Normal / Boros)")
    print(f"   Akurasi SVM: {m.laporan_svm['akurasi']:.3f}")
    print("   Laporan Klasifikasi:")
    print("   " + m.laporan_svm["laporan"].replace("\n", "\n   "))
    print("   Matriks Konfusi (baris = sebenarnya, kolom = prediksi, urutan "
          + ", ".join(m.encoder.classes_) + "):")
    print("   " + str(m.laporan_svm["matriks"]).replace("\n", "\n   "))


# ============================================================================
# PROGRAM UTAMA - menu interaktif
# ============================================================================



# ----------------------------------------------------------------------------
# Input data rumah
# ----------------------------------------------------------------------------
def input_rumah():
    print("\nIsi data rumah Anda (ketik angkanya lalu tekan Enter):")
    va = ask_pilihan("Daya listrik terpasang (VA)", VA_KATEGORI)
    penghuni = ask_number("Jumlah penghuni rumah", 1, 6, integer=True)
    jumlah_ac = ask_number("Jumlah AC di rumah", 0, 4, integer=True)
    jam_ac = 0.0
    if jumlah_ac > 0:
        jam_ac = ask_number("Rata-rata AC menyala berapa jam per hari (per unit)", 0, 14)
    kulkas = ask_number("Jumlah kulkas", 1, 2, integer=True)
    tv = ask_number("TV + laptop menyala berapa jam per hari", 0, 10)
    mesin_cuci = ask_yes_no("Punya mesin cuci?")
    return {
        "electric_power_va": va,
        "num_occupants": penghuni,
        "num_ac_units": jumlah_ac,
        "ac_hours_per_day": jam_ac,
        "num_refrigerators": kulkas,
        "tv_laptop_hours_per_day": tv,
        "has_washing_machine": mesin_cuci,
    }


def pastikan_data_rumah(status):
    if "rumah" not in status:
        print("\nBelum ada data rumah. Isi dulu:")
        status["rumah"] = input_rumah()
    return status["rumah"]


# ----------------------------------------------------------------------------
# Menu 1: perkiraan tagihan
# ----------------------------------------------------------------------------
def menu_prediksi(model, status):
    status["rumah"] = input_rumah()
    tampilkan_hasil(model, status["rumah"])


def tampilkan_hasil(model, p):
    tagihan = model.prediksi_tagihan(p)                 # Modul 3: regresi
    kategori = model.prediksi_kategori(p)               # Modul 3: SVM (label Modul 1)
    kwh = model.kwh_dari_tagihan(tagihan)

    print("\n" + "=" * 56)
    print(" HASIL PERKIRAAN")
    print("=" * 56)
    print(f" Perkiraan tagihan per bulan : {rp(tagihan)}")
    print(f" Kemungkinan kisaran         : {rp(max(0, tagihan - model.mae))} - {rp(tagihan + model.mae)}")
    if kwh is not None:
        print(f" Perkiraan pemakaian         : sekitar {kwh:,.0f} kWh/bulan")
    print(f" Perkiraan per hari          : {rp(tagihan / 30)}")
    print(f" Kategori (SVM)              : {kategori}"
          f"   [Hemat s/d {rp(model.batas[0])}, Boros di atas {rp(model.batas[1])}]")

    rincian = model.rincian(p)
    print("\n Dari mana tagihan ini berasal (perkiraan):")
    total_positif = sum(v for v in rincian.values() if v > 0) or 1
    for nama, v in sorted(rincian.items(), key=lambda kv: -kv[1]):
        batang = "#" * int(round(25 * max(v, 0) / total_positif))
        print(f"   {nama:<22}{rp(v):>13}  {batang}")

    if p["ac_hours_per_day"] >= 1:
        hemat = tagihan - model.prediksi_tagihan(dict(p, ac_hours_per_day=p["ac_hours_per_day"] - 1))
        print(f"\n >> Tips: kurangi jam AC 1 jam/hari, perkiraan hemat {rp(hemat)}/bulan.")
    elif p["num_ac_units"] == 0:
        print("\n >> Rumah Anda tanpa AC; tagihan terutama dari kulkas dan jumlah penghuni.")
    print("=" * 56)


# ----------------------------------------------------------------------------
# Menu 2: simulasi hemat
# ----------------------------------------------------------------------------
def menu_simulasi(model, status):
    p = pastikan_data_rumah(status)
    dasar = model.prediksi_tagihan(p)
    print(f"\nTagihan saat ini (perkiraan): {rp(dasar)}")
    if p["num_ac_units"] == 0:
        print("Rumah Anda tidak memakai AC, jadi tidak ada simulasi AC yang bisa dilakukan.")

    skenario = []
    for h in (1, 2, 3):
        if p["ac_hours_per_day"] - h >= 0 and p["ac_hours_per_day"] >= 1:
            skenario.append((f"Kurangi jam AC {h} jam/hari",
                             dict(p, ac_hours_per_day=p["ac_hours_per_day"] - h)))
    if p["num_ac_units"] >= 1:
        sisa = p["num_ac_units"] - 1
        skenario.append(("Pakai 1 AC lebih sedikit",
                         dict(p, num_ac_units=sisa, ac_hours_per_day=p["ac_hours_per_day"] if sisa else 0)))
    if p["tv_laptop_hours_per_day"] >= 2:
        skenario.append(("TV/laptop 2 jam lebih sedikit",
                         dict(p, tv_laptop_hours_per_day=p["tv_laptop_hours_per_day"] - 2)))

    if skenario:
        print("\n Simulasi penghematan:")
        print(f"  {'Skenario':<32}{'Tagihan baru':>14}{'Hemat/bulan':>14}{'Kategori':>10}")
        for nama, q in skenario:
            baru = model.prediksi_tagihan(q)
            kategori = model.prediksi_kategori(q)
            print(f"  {nama:<32}{rp(baru):>14}{rp(dasar - baru):>14}{kategori:>10}")
        print(f"\n Kategori sekarang: {model.prediksi_kategori(p)}. Kolom 'Kategori' = hasil SVM untuk skenario tsb.")
        print(" Catatan: ini perkiraan statistik, bukan jaminan.")

    if input("\nCoba skenario sendiri? Ketik 'y' untuk mengisi ulang data: ").strip().lower() == "y":
        q = input_rumah()
        baru = model.prediksi_tagihan(q)
        selisih = dasar - baru
        kata = "hemat" if selisih >= 0 else "lebih boros"
        print(f"\n Tagihan skenario baru: {rp(baru)}  ({kata} {rp(abs(selisih))}/bulan)")


# ----------------------------------------------------------------------------
# Menu 3: token
# ----------------------------------------------------------------------------
def menu_token(model, status):
    if model.tarif is None:
        print("\nDataset kWh tidak ditemukan, fitur token tidak tersedia.")
        return
    p = pastikan_data_rumah(status)
    kwh_hari = model.kwh_dari_tagihan(model.prediksi_tagihan(p)) / 30
    print(f"\nPerkiraan pemakaian Anda: {kwh_hari:.1f} kWh/hari")
    nominal = ask_number("Nominal token yang dibeli (Rp)", 20_000, 5_000_000)
    kwh_token = nominal / model.tarif
    hari = kwh_token / kwh_hari if kwh_hari > 0 else float("inf")
    print(f"\n Token {rp(nominal)} ~ {kwh_token:.0f} kWh")
    print(f" Perkiraan habis dalam sekitar {hari:.0f} hari")
    print(f" (tarif rata-rata dari data: {rp(model.tarif)}/kWh; potongan admin/pajak token tidak dihitung)")


# ----------------------------------------------------------------------------
# Menu 4: cara kerja modul
# ----------------------------------------------------------------------------
def menu_modul(model, df_multi):
    while True:
        print("\n  CARA KERJA TIAP MODUL")
        print("  1. Modul 1 - Teknik Labelling Data")
        print("  2. Modul 2 - Teknik Preprocessing Data")
        print("  3. Modul 3 - Supervised Learning (regresi + SVM)")
        print("  0. Kembali")
        pilihan = input("\nPilih: ").strip()
        if pilihan == "1":
            y = df_multi[TARGET]
            label, batas = buat_label_kategori(y)
            tampilkan_labelling(y, label, batas, model.encoder)
        elif pilihan == "2":
            tampilkan_preprocessing(df_multi)
        elif pilihan == "3":
            tampilkan_supervised(model)
        elif pilihan == "0":
            return
        else:
            print("Pilihan tidak dikenal.")


# ----------------------------------------------------------------------------
# Program utama
# ----------------------------------------------------------------------------
def main():
    ap = argparse.ArgumentParser(description="Prediksi tagihan listrik rumah tangga")
    ap.add_argument("--data", help="folder yang berisi file CSV dataset")
    args = ap.parse_args()

    folder = folder_pencarian(args.data)
    df_multi = muat_csv(FILE_MULTI, folder)
    if df_multi is None:
        sys.exit(f"Dataset '{FILE_MULTI}' tidak ditemukan.\n"
                 "Letakkan file CSV di folder yang sama dengan program ini, "
                 "atau pakai: python prediksi_listrik.py --data <folder>")
    df_simple = muat_csv(FILE_SIMPLE, folder)

    print("Menyiapkan model, mohon tunggu sebentar...")
    model = ModelListrik(df_multi, df_simple)
    svm = model.laporan_svm["akurasi"]
    reg = model.laporan_regresi["Multiple Linear Regression"]
    print(f"Model siap. Regresi R2 {reg['r2']:.1%} (selisih rata-rata {rp(reg['mae'])}), "
          f"akurasi SVM {svm:.1%}.")

    status = {}
    menu = {
        "1": ("Perkirakan tagihan listrik bulan ini", menu_prediksi),
        "2": ("Simulasi: berapa yang bisa dihemat?", menu_simulasi),
        "3": ("Token saya habis dalam berapa hari?", menu_token),
    }
    while True:
        print("\n" + "=" * 56)
        print("  PREDIKSI TAGIHAN LISTRIK RUMAH TANGGA")
        print("=" * 56)
        for k, (teks, _) in menu.items():
            print(f"  {k}. {teks}")
        print("  4. Lihat cara kerja tiap modul")
        print("  0. Keluar")
        try:
            pilihan = input("\nPilih menu: ").strip()
        except (EOFError, KeyboardInterrupt):
            print("\nSampai jumpa!")
            break
        if pilihan == "0":
            print("Terima kasih, semoga tagihan listrik Anda makin hemat!")
            break
        try:
            if pilihan in menu:
                menu[pilihan][1](model, status)
            elif pilihan == "4":
                menu_modul(model, df_multi)
            else:
                print("Pilihan tidak dikenal, coba lagi.")
        except (KeyboardInterrupt, EOFError):
            print("\n(dibatalkan, kembali ke menu)")


if __name__ == "__main__":
    main()
