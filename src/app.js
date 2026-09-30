const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const path = require("path");

// Import routes
const authRoutes = require("./modules/auth/auth-routes");
const stockOpnameRoutes = require("./modules/stock-opname/stock-opname-routes");
const labelDataRoutes = require("./modules/label-data/label-data-routes");
const profileRoutes = require("./modules/profile/profile-routes");
const auditRoutes = require("./modules/audit/audit-routes");
const mappingRoutes = require("./modules/mapping/mapping-routes");
const nyangkutRoutes = require("./modules/nyangkut/nyangkut-routes");
const mstLokasiRoutes = require("./modules/locations/locations-routes");
const bongkarKdRoutes = require("./modules/bongkar-kd/bongkar-kd-routes");
// const kayuBulatRoutes = require('./modules/kayu-bulat/kayu-bulat-routes');
const qcSawmill = require("./modules/qc-sawmill/qc-sawmill-routes");
const qcSpkBarangJadi = require("./modules/qc-spk-barang-jadi/qc-spk-barang-jadi-routes");
const jenisKayu = require("./modules/jenis-kayu/jenis-kayu-routes");
const mesinSawmill = require("./modules/mesin-sawmill/mesin-sawmill-routes");
const stSawmill = require("./modules/st-sawmill/st-sawmill-route");
const updateRoutes = require("./modules/update/update-routes");
const fingerJoinRoutes = require("./modules/proses/finger-join/finger-join-routes");
const s4sRoutes = require("./modules/proses/s4s/s4s-routes");
const ccakhirRoutes = require("./modules/proses/ccakhir/ccakhir-routes");
const stRoutes = require("./modules/proses/st/st-routes");
const mouldingRoutes = require("./modules/proses/moulding/moulding-routes");
const laminatingRoutes = require("./modules/proses/laminating/laminating-routes");
const sandingRoutes = require("./modules/proses/sanding/sanding-routes");
const barangJadiRoutes = require("./modules/proses/barangjadi/barangjadi-routes");
const kdRoutes = require("./modules/proses/kd/kd-routes");
const s4sProduksiRoutes = require("./modules/produksi/s4s/s4s-produksi-routes");
const mouldingProduksiRoutes = require("./modules/produksi/moulding/moulding-produksi-routes");
const laminatingProduksiRoutes = require("./modules/produksi/laminating/laminating-produksi-routes");
const ccakhirProduksiRoutes = require("./modules/produksi/ccakhir/ccakhir-produksi-routes");
const sandingProduksiRoutes = require("./modules/produksi/sanding/sanding-produksi-routes");
const fingerJoinProduksiRoutes = require("./modules/produksi/finger-join/finger-join-produksi-routes");
const packingProduksiRoutes = require("./modules/produksi/packing/packing-produksi-routes");
const penKayuBulatRoutes = require("./modules/pen-kayu-bulat/pen-kayu-bulat-routes");
const lembarTallyHasilSawmillRoutes = require("./modules/Lembar-tally-hasil-sawmill/lembar-tally-hasil-sawmill-routes");
const vacuumV2Routes = require("./modules/vacuumv2/vacuumv2-routes");
const labelS4sRoutes = require("./modules/label/s4s/label-s4s-routes");
const labelFjRoutes = require("./modules/label/fj/label-fj-routes");
const labelMouldingRoutes = require("./modules/label/moulding/label-moulding-routes");
const labelLmtRoutes = require('./modules/label/lmt/label-lmt-routes');
const labelCcaRoutes = require('./modules/label/cca/label-cca-routes');
const labelSndRoutes = require('./modules/label/snd/label-snd-routes');
const labelBjRoutes = require('./modules/label/bj/label-bj-routes');

const app = express();

// Middleware
app.use(express.json());
app.use(cors());
app.use(bodyParser.json());

// Static folder
app.use(
  "/storage/kayu-bulat",
  express.static(path.join(__dirname, "../storage/kayu-bulat")),
);

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok!!!" });
});

// API routes
app.use("/api/auth", authRoutes);
app.use("/api", stockOpnameRoutes);
app.use("/api", labelDataRoutes);
app.use("/api", profileRoutes);
app.use("/api", auditRoutes);
app.use("/api", mappingRoutes);
app.use("/api", nyangkutRoutes);
app.use("/api", mstLokasiRoutes);
app.use("/api", bongkarKdRoutes);
// app.use('/api', kayuBulatRoutes);
app.use("/api/qc-sawmill", qcSawmill);
app.use("/api/qc-spk-bj", qcSpkBarangJadi);
app.use("/api/jenis-kayu", jenisKayu);
app.use("/api/mesin-sawmill", mesinSawmill);
app.use("/api/sawmill", stSawmill);
app.use("/api/update", updateRoutes);
app.use("/api/proses/finger-join", fingerJoinRoutes);
app.use("/api/proses/s4s", s4sRoutes);
app.use("/api/proses/ccakhir", ccakhirRoutes);
app.use("/api/proses/st", stRoutes);
app.use("/api/proses/moulding", mouldingRoutes);
app.use("/api/proses/laminating", laminatingRoutes);
app.use("/api/proses/sanding", sandingRoutes);
app.use("/api/proses/barangjadi", barangJadiRoutes);
app.use("/api/kd", kdRoutes);
app.use("/api/produksi/s4s", s4sProduksiRoutes);
app.use("/api/produksi/moulding", mouldingProduksiRoutes);
app.use("/api/produksi/laminating", laminatingProduksiRoutes);
app.use("/api/produksi/ccakhir", ccakhirProduksiRoutes);
app.use("/api/produksi/sanding", sandingProduksiRoutes);
app.use("/api/produksi/finger-join", fingerJoinProduksiRoutes);
app.use("/api/produksi/packing", packingProduksiRoutes);
app.use("/api/penerimaan/kayu-bulat", penKayuBulatRoutes);
app.use("/api/lembar-tally-hasil-sawmill", lembarTallyHasilSawmillRoutes);
app.use("/api/vacuumv2", vacuumV2Routes);
app.use("/api", labelS4sRoutes);
app.use("/api", labelFjRoutes);
app.use("/api", labelMouldingRoutes);
app.use("/api", labelLmtRoutes);
app.use("/api", labelCcaRoutes);
app.use("/api", labelSndRoutes);
app.use("/api", labelBjRoutes);

module.exports = app;
