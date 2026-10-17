const fs = require("fs");
const path = require("path");

const templatePath = path.join(__dirname, "st-label-pdf.html");

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

function buildDetailRows(detail = [], uomTebal = "", uomPanjang = "") {
  const tSuffix = uomTebal ? ` ${uomTebal}` : "";
  const pSuffix = uomPanjang ? ` ${uomPanjang}` : "";
  return detail
    .map(
      (r) => `<tr>
        <td>${fmtNumId(r.tebal)}${tSuffix}</td>
        <td>${fmtNumId(r.lebar)}${tSuffix}</td>
        <td>${fmtNumId(r.panjang)}${pSuffix}</td>
        <td>${fmtNumId(r.pcs)}</td>
      </tr>`,
    )
    .join("\n");
}

/**
 * @param {object} data hasil labelStService.getPdfData(noST) yang sudah
 *                    di-disassemble controller + { qrBase64 }
 * @returns {string} HTML siap render ke PDF
 */
function buildStLabelHtml(data) {
  const html = fs.readFileSync(templatePath, "utf8");

  const remark = (data.remark || "").trim();
  const remarkRow =
    remark && remark !== "-"
      ? `<div class="remark">Remark : ${esc(remark)}</div>`
      : "";
  const slpRow = data.isSLP ? `<div class="slp">SLP</div>` : "";
  const watermarkText = data.hasBeenPrinted > 0 ? "COPY" : "";
  const kbRow = `No. KB : ${esc(data.noKB)} - ${esc(data.supplier)} - ${esc(data.noTruk)}`;

  return html
    .replace(/{{noST}}/g, esc(data.noST))
    .replace("{{jenisKayu}}", esc(data.jenisKayu))
    .replace("{{platTruk}}", esc(data.platTruk))
    .replace("{{noSPK}}", esc(data.noSPK))
    .replace("{{tanggal}}", esc(data.tanggal))
    .replace("{{telly}}", esc(data.telly))
    .replace("{{stickBy}}", esc(data.stickBy))
    .replace("{{kbRow}}", kbRow)
    .replace("{{detailRows}}", buildDetailRows(data.detail, data.uomTebal, data.uomPanjang))
    .replace("{{totalPcs}}", esc(data.totalPcs))
    .replace("{{totalTon}}", esc(data.totalTon))
    .replace("{{totalM3}}", esc(data.totalM3))
    .replace("{{mmYY}}", esc(data.mmYY))
    .replace("{{watermarkText}}", esc(watermarkText))
    .replace("{{slpRow}}", slpRow)
    .replace("{{remarkRow}}", remarkRow)
    .replace(/{{qrBase64}}/g, data.qrBase64 || "");
}

module.exports = { buildStLabelHtml };
