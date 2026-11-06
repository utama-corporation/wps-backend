const fs = require("fs");
const path = require("path");

const templatePath = path.join(__dirname, "cca-label-pdf.html");

function esc(v) {
  return String(v ?? "-")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Angka gaya Indonesia: ribuan "." desimal "," (mirror DecimalFormat "#,###.##")
function fmtNumId(v) {
  const n = parseFloat(v);
  if (!Number.isFinite(n)) return "-";
  const [intPart, decRaw] = Math.abs(n).toFixed(2).split(".");
  const withThousands = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const dec = decRaw.replace(/0+$/, "");
  const sign = n < 0 ? "-" : "";
  return dec ? `${sign}${withThousands},${dec}` : `${sign}${withThousands}`;
}

function buildDetailRows(detail = []) {
  return detail
    .map(
      (r) => `<tr>
        <td>${fmtNumId(r.tebal)}</td>
        <td>${fmtNumId(r.lebar)}</td>
        <td>${fmtNumId(r.panjang)}</td>
        <td>${fmtNumId(r.pcs)}</td>
      </tr>`,
    )
    .join("\n");
}

/**
 * @param {object} data hasil labelCcaService.getLabelData(noCCA) + { qrBase64 }
 * @returns {string} HTML siap render ke PDF
 */
function buildCcaLabelHtml(data) {
  const html = fs.readFileSync(templatePath, "utf8");

  const remark = (data.remark || "").trim();
  const rejectRow = data.isReject
    ? `<div class="flags">REJECT</div>`
    : "";
  const lemburRow = data.isLembur
    ? `<div class="flags">LEMBUR</div>`
    : "";
  const remarkRow =
    remark && remark !== "-"
      ? `<div class="remark">Remark : ${esc(remark)}</div>`
      : "";

  const watermarkText = data.hasBeenPrinted > 0 ? "COPY" : "";

  const totalM3 = String(data.totalM3 ?? "-").replace(".", ",");

  return html
    .replace(/{{noCCAkhir}}/g, esc(data.noCCAkhir))
    .replace("{{jenisKayu}}", esc(data.jenisKayu))
    .replace("{{grade}}", esc(data.grade))
    .replace("{{fisik}}", esc(data.fisik))
    .replace("{{tanggal}}", esc(data.tanggal))
    .replace("{{jam}}", esc(data.jam))
    .replace("{{telly}}", esc(data.telly))
    .replace("{{noSPK}}", esc(data.noSPK))
    .replace("{{mesinSusun}}", esc(data.mesinSusun))
    .replace("{{detailRows}}", buildDetailRows(data.detail))
    .replace("{{totalPcs}}", esc(data.totalPcs))
    .replace("{{totalM3}}", esc(totalM3))
    .replace("{{mmYY}}", esc(data.mmYY))
    .replace("{{watermarkText}}", esc(watermarkText))
    .replace("{{rejectRow}}", rejectRow)
    .replace("{{lemburRow}}", lemburRow)
    .replace("{{remarkRow}}", remarkRow)
    .replace("{{qrBase64}}", data.qrBase64 || "");
}

module.exports = { buildCcaLabelHtml };
