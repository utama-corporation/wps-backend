# WPS Backend

Backend API untuk sistem WPS (Wood Processing System) berbasis Node.js + Express dengan database Microsoft SQL Server.

## Teknologi

- **Runtime**: Node.js 20
- **Framework**: Express.js
- **Database**: Microsoft SQL Server (mssql)
- **Auth**: JWT (jsonwebtoken)
- **Realtime**: WebSocket (ws)
- **File Processing**: Multer, Sharp, FFmpeg

## Modul

| Modul         | Endpoint             |
| ------------- | -------------------- |
| Auth          | `/api/auth`          |
| Stock Opname  | `/api`               |
| Label Data    | `/api`               |
| Profile       | `/api`               |
| Mapping       | `/api`               |
| Nyangkut      | `/api`               |
| Locations     | `/api`               |
| Bongkar KD    | `/api`               |
| QC Sawmill    | `/api/qc-sawmill`    |
| Jenis Kayu    | `/api/jenis-kayu`    |
| Mesin Sawmill | `/api/mesin-sawmill` |
| ST Sawmill    | `/api/sawmill`       |

## Setup Lokal

### 1. Install dependencies

```bash
npm install
```

### 2. Buat file `.env`

```env
PORT=5002

DB_USER=your_db_user
DB_PASSWORD=your_db_password
DB_SERVER=your_db_server
DB_PORT=1433
DB_DATABASE=your_db_name

JWT_SECRET=your_jwt_secret
```

### 3. Jalankan development server

```bash
npm run dev
```

Server berjalan di `http://localhost:5002`

## Health Check

```
GET /health
```

Response:

```json
{ "status": "ok" }
```

## Deploy ke Server (Docker)

### Prasyarat

- Docker & Docker Compose terinstall di server
- File `.env` sudah ada di server

### Manual deploy

```bash
./deploy.sh
```

### Auto deploy via GitHub Actions

Push atau merge ke branch `production` akan otomatis trigger deploy:

```bash
git checkout production
git merge master
git push origin production
git checkout master
```

GitHub Actions akan menjalankan `git pull` dan `docker compose up -d --build` secara otomatis di server.

## Struktur Folder

```
wps_backend/
├── src/
│   ├── app.js
│   ├── core/
│   │   ├── config/       # Konfigurasi DB
│   │   ├── middleware/   # Auth middleware
│   │   ├── socket/       # WebSocket
│   │   └── utils/
│   └── modules/          # Modul-modul API
├── storage/              # File upload
├── Dockerfile
├── docker-compose.yml
├── deploy.sh
└── server.js
```

CD TEST - 2026-05-17 - NEW

## Penyimpanan update Docker (tablet dan mobile)

Compose menetapkan `UPDATES_DIR=/app/storage/wps_updates`, mengesampingkan path Windows dari `.env` khusus di container Linux. Bind mount `./storage:/app/storage` menyimpan file pada host:

```text
storage/wps_updates/tablet/version.json
storage/wps_updates/tablet/<nama-apk>.apk
storage/wps_updates/mobile/version.json
storage/wps_updates/mobile/<nama-apk>.apk
```

Data ini bertahan ketika container dibuat ulang, selama folder host `storage` dipertahankan dan deploy memakai direktori proyek host yang sama. Ini tidak menggantikan backup eksternal. Folder `storage/` dikecualikan dari Git dan build context Docker.

### Migrasi pertama pada server Linux

Hentikan sementara aktivitas publish APK sampai migrasi dan deploy selesai. Jangan hapus container lama, menjalankan `docker compose down`, atau membuat ulang container sebelum file lama tersalin. Jika container lama berhenti, periksa penyebabnya dan jalankan kembali container yang sama sebelum migrasi; jangan buat penggantinya dahulu.

Ambil perubahan kode di direktori checkout server yang selama ini dipakai, lalu jalankan:

```bash
git pull
bash ./prepare-update-storage.sh
bash ./deploy.sh
```

`deploy.sh` juga menjalankan persiapan penyimpanan sebelum `docker compose up -d --build`. Skrip persiapan membaca lokasi update dari environment container lama, dengan aturan fallback yang sama seperti layanan update, lalu menyalin isinya melalui `docker cp` ke `storage/update-migration-backups/<timestamp>-<pid>`. Salinan kemudian digabungkan ke `storage/wps_updates` tanpa menimpa file yang berbeda dan diverifikasi byte per byte. Konflik, container berhenti, atau kegagalan penyalinan membatalkan deploy sebelum penggantian container. Jika file memang sudah tidak ada di container lama, migrasi tidak dapat mengembalikannya; pulihkan backup atau publish ulang APK yang hilang.

Jika ada konflik, jangan hapus backup. Tentukan pasangan APK dan `version.json` yang benar untuk aplikasi terkait, simpan salinan kedua versi di luar folder aktif, lalu selaraskan sumber dan tujuan sebelum mencoba lagi. Sesudah migrasi pertama, skrip melewati penyalinan jika path update dan sumber mount host sudah sesuai. Backup migrasi tidak dihapus otomatis.

### Verifikasi setelah deploy

```bash
docker inspect --format '{{range .Mounts}}{{println .Source "->" .Destination}}{{end}}' wps-backend
docker exec wps-backend node -e 'console.log(process.env.UPDATES_DIR)'
curl -f http://127.0.0.1:5002/api/update/tablet/version
curl -f http://127.0.0.1:5002/api/update/mobile/version
```

Nilai environment harus `/app/storage/wps_updates`. Pastikan tiap respons versi menunjuk APK yang benar, lalu periksa endpoint `/api/update/<tablet|mobile>/download/<fileName>` dengan HTTP Range untuk memastikan berkas tersedia. Setelah file berhasil dimigrasikan, uji recreate dalam waktu pemeliharaan dan ulangi pemeriksaan versi serta download:

```bash
docker compose up -d --force-recreate
```

Jangan menghapus direktori host `storage`, menjalankan sinkronisasi dengan penghapusan terhadapnya, atau memindahkan checkout tanpa membawa data penyimpanan. Audit cron/timer/cleanup pagi hari tetap perlu dilakukan di server; perubahan ini menangani kehilangan akibat pembuatan ulang container, bukan membuktikan pemicu kejadian sebelumnya.


Pengujian migrasi dengan Docker palsu (Linux, tanpa mengubah container produksi): bash scripts/test-update-storage.sh. Meliputi deploy pertama, penyalinan APK tablet/mobile beserta metadata, pengulangan, konflik file, container berhenti, kegagalan backup, dan sumber lama yang tidak ada. Pengujian ini perlu dijalankan di Linux; belum dijalankan pada lingkungan Windows ini.


## Label module integration for WPS Tablet V2
The fj/moulding/lmt/cca/snd/bj list APIs keep data arrays and add top-level total using the same search and unused-label filters. Update APIs accept SPK Asal explicitly while preserving it when absent from legacy requests; BJ also exposes location choices and location edits. Header/PDF data retains existing camel-case fields and includes the raw header metadata needed by the Flutter detail view.

Moulding, Laminating, Cross Cut, Sanding and Packing create services accept dateCreate, jam and noBongkarSusun. When a reference is supplied, its header date must match the label date. Header, sizes and Bongkar Susun output link are inserted within one SQL transaction; a failure rolls the insert back. FJ already supports Bongkar Susun output creation. Label deletions for these six modules now remove the Bongkar Susun output link together with existing output references, dimensions and header in a transaction, rolling back on failure.

Run npm run test:label-modules for mocked contract checks covering all six modules, list/controller compatibility, native keys, create date/link bindings, edit fields and delete rollback. This does not replace testing against the deployment's actual SQL Server schema. No live database writes or deployment were performed during this implementation. Deploy from the same existing backend directory using the persistent-storage migration/deploy steps above, then verify role permissions and one test label per module before operational rollout.

## Flutter S4S production
GET /api/produksi/s4s/master-options now adds lokasi (enabled location IDs as strings) and orgTelly choices while retaining jenisKayu, grade, spk and warna. This supports shared S4S create/edit dialogs in wps_tablet_v2 production; deploy this service update together with that client. Existing production routes, permissions and mutation contracts are unchanged. Checked with mocked master-query responses and existing label-module regressions; no live operational writes were performed.
