(() => {
  'use strict';

  const PAGE_WIDTH = 595.28;
  const PAGE_HEIGHT = 841.89;
  const MARGIN = 42;
  const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

  function number(value) {
    const rounded = Math.round(Number(value || 0) * 100) / 100;
    return String(rounded).replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
  }

  function pdfText(value) {
    const replacements = {
      '–': '-', '—': '-', '−': '-', '•': '*', '…': '...', '“': '"', '”': '"', '‘': "'", '’': "'", '№': 'No.', '€': 'EUR'
    };
    return Array.from(String(value ?? '')).map(character => {
      const replacement = replacements[character];
      if (replacement) return replacement;
      return character.charCodeAt(0) <= 255 ? character : '?';
    }).join('');
  }

  function escapePdf(value) {
    return pdfText(value).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)').replace(/[\r\n]+/g, ' ');
  }

  function toBytes(value) {
    const bytes = new Uint8Array(value.length);
    for (let index = 0; index < value.length; index += 1) bytes[index] = value.charCodeAt(index) & 0xff;
    return bytes;
  }

  function color(values, operator = 'rg') {
    return `${values.map(value => number(value)).join(' ')} ${operator}`;
  }

  function fillRect(page, x, y, width, height, fill) {
    page.push(`q ${color(fill)} ${number(x)} ${number(y)} ${number(width)} ${number(height)} re f Q`);
  }

  function strokeRect(page, x, y, width, height, stroke, lineWidth = 0.6) {
    page.push(`q ${color(stroke, 'RG')} ${number(lineWidth)} w ${number(x)} ${number(y)} ${number(width)} ${number(height)} re S Q`);
  }

  function drawLine(page, x1, y1, x2, y2, stroke, lineWidth = 0.6) {
    page.push(`q ${color(stroke, 'RG')} ${number(lineWidth)} w ${number(x1)} ${number(y1)} m ${number(x2)} ${number(y2)} l S Q`);
  }

  function text(page, x, y, value, size = 10, weight = 'regular', fill = [0.09, 0.11, 0.13]) {
    const font = weight === 'bold' ? 'F2' : 'F1';
    page.push(`q ${color(fill)} BT /${font} ${number(size)} Tf 1 0 0 1 ${number(x)} ${number(y)} Tm (${escapePdf(value)}) Tj ET Q`);
  }

  function truncate(value, maxLength) {
    const normalized = pdfText(value).replace(/\s+/g, ' ').trim();
    return normalized.length <= maxLength ? normalized : `${normalized.slice(0, Math.max(1, maxLength - 3)).trimEnd()}...`;
  }

  function addHeader(page, report, kicker = 'RELATÓRIO GERENCIAL') {
    fillRect(page, 0, PAGE_HEIGHT - 58, PAGE_WIDTH, 58, [0.06, 0.08, 0.1]);
    text(page, MARGIN, PAGE_HEIGHT - 24, kicker, 8, 'bold', [0.95, 0.76, 0.19]);
    text(page, MARGIN, PAGE_HEIGHT - 43, truncate(report.companyName || 'CRM', 58), 17, 'bold', [1, 1, 1]);
  }

  function addFooter(page, pageNumber, totalPages) {
    drawLine(page, MARGIN, 43, PAGE_WIDTH - MARGIN, 43, [0.78, 0.81, 0.84]);
    text(page, MARGIN, 28, 'Tony CRM - Relatório gerado automaticamente', 8, 'regular', [0.42, 0.47, 0.52]);
    text(page, PAGE_WIDTH - MARGIN - 55, 28, `Página ${pageNumber} de ${totalPages}`, 8, 'regular', [0.42, 0.47, 0.52]);
  }

  function addMetric(page, x, y, label, value) {
    const width = (CONTENT_WIDTH - 12) / 2;
    const height = 55;
    fillRect(page, x, y, width, height, [0.95, 0.96, 0.97]);
    strokeRect(page, x, y, width, height, [0.82, 0.84, 0.86]);
    text(page, x + 12, y + 37, truncate(label, 38), 8.5, 'regular', [0.38, 0.43, 0.48]);
    text(page, x + 12, y + 16, truncate(value, 30), 16, 'bold', [0.08, 0.1, 0.13]);
  }

  function createPdfBlob(pages) {
    const objects = [];
    const contentIds = pages.map((_, index) => 5 + index * 2);
    const pageIds = pages.map((_, index) => 6 + index * 2);
    const objectCount = 4 + pages.length * 2;

    objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
    objects[2] = `<< /Type /Pages /Kids [${pageIds.map(id => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>`;
    objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
    objects[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';

    pages.forEach((page, index) => {
      const stream = page.join('\n');
      objects[contentIds[index]] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
      objects[pageIds[index]] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentIds[index]} 0 R >>`;
    });

    let pdf = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
    const offsets = [0];
    for (let id = 1; id <= objectCount; id += 1) {
      offsets[id] = pdf.length;
      pdf += `${id} 0 obj\n${objects[id]}\nendobj\n`;
    }
    const xrefOffset = pdf.length;
    pdf += `xref\n0 ${objectCount + 1}\n0000000000 65535 f \n`;
    for (let id = 1; id <= objectCount; id += 1) pdf += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`;
    pdf += `trailer\n<< /Size ${objectCount + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
    return new Blob([toBytes(pdf)], { type: 'application/pdf' });
  }

  function build(report) {
    const safeReport = report && typeof report === 'object' ? report : {};
    const metrics = safeReport.metrics || {};
    const sales = Array.isArray(safeReport.sales) ? safeReport.sales : [];
    const pages = [];
    let page;
    let cursorY;

    function newPage() {
      page = [];
      pages.push(page);
      addHeader(page, safeReport);
      cursorY = 752;
    }

    function drawTableHeader() {
      fillRect(page, MARGIN, cursorY - 18, CONTENT_WIDTH, 18, [0.1, 0.13, 0.16]);
      text(page, MARGIN + 8, cursorY - 13, 'FECHAMENTO', 7.5, 'bold', [1, 1, 1]);
      text(page, MARGIN + 82, cursorY - 13, 'CLIENTE', 7.5, 'bold', [1, 1, 1]);
      text(page, MARGIN + 226, cursorY - 13, 'SERVIÇO', 7.5, 'bold', [1, 1, 1]);
      text(page, MARGIN + 417, cursorY - 13, 'VALOR', 7.5, 'bold', [1, 1, 1]);
      cursorY -= 25;
    }

    newPage();
    text(page, MARGIN, cursorY, 'Resumo do período', 11, 'bold', [0.08, 0.1, 0.13]);
    cursorY -= 23;
    text(page, MARGIN, cursorY, truncate(safeReport.periodLabel || 'Período não informado', 68), 19, 'bold', [0.08, 0.1, 0.13]);
    cursorY -= 19;
    text(page, MARGIN, cursorY, `Gerado em ${truncate(safeReport.generatedAt || '', 56)}`, 8.5, 'regular', [0.42, 0.47, 0.52]);
    cursorY -= 29;

    addMetric(page, MARGIN, cursorY - 55, 'Leads cadastrados', metrics.leads || '0');
    addMetric(page, MARGIN + (CONTENT_WIDTH + 12) / 2, cursorY - 55, 'Vendas fechadas', metrics.closedSales || '0');
    cursorY -= 67;
    addMetric(page, MARGIN, cursorY - 55, 'Faturamento fechado', metrics.revenue || 'R$ 0,00');
    addMetric(page, MARGIN + (CONTENT_WIDTH + 12) / 2, cursorY - 55, 'Ticket médio', metrics.averageTicket || 'R$ 0,00');
    cursorY -= 75;

    if (Number(metrics.missingCloseDates || 0) > 0) {
      fillRect(page, MARGIN, cursorY - 33, CONTENT_WIDTH, 33, [1, 0.96, 0.84]);
      strokeRect(page, MARGIN, cursorY - 33, CONTENT_WIDTH, 33, [0.85, 0.67, 0.23]);
      text(page, MARGIN + 10, cursorY - 14, `${metrics.missingCloseDates} venda(s) sem data de fechamento não entraram neste período.`, 8.5, 'regular', [0.35, 0.25, 0.06]);
      cursorY -= 47;
    }

    text(page, MARGIN, cursorY, 'Vendas fechadas no período', 12, 'bold', [0.08, 0.1, 0.13]);
    cursorY -= 13;
    text(page, MARGIN, cursorY, `${sales.length} registro(s) listado(s) pela data de fechamento.`, 8.5, 'regular', [0.42, 0.47, 0.52]);
    cursorY -= 16;
    drawTableHeader();

    if (!sales.length) {
      text(page, MARGIN + 8, cursorY - 10, 'Nenhuma venda fechada foi encontrada neste período.', 10, 'regular', [0.42, 0.47, 0.52]);
    }

    sales.forEach((sale, index) => {
      if (cursorY - 19 < 58) {
        newPage();
        text(page, MARGIN, cursorY, 'Vendas fechadas no período (continuação)', 11, 'bold', [0.08, 0.1, 0.13]);
        cursorY -= 19;
        drawTableHeader();
      }
      if (index % 2 === 0) fillRect(page, MARGIN, cursorY - 16, CONTENT_WIDTH, 17, [0.97, 0.98, 0.99]);
      text(page, MARGIN + 8, cursorY - 12, truncate(sale.closedAt || '-', 12), 8.2, 'regular');
      text(page, MARGIN + 82, cursorY - 12, truncate(sale.name || '-', 27), 8.2, 'regular');
      text(page, MARGIN + 226, cursorY - 12, truncate(sale.service || 'Não informado', 35), 8.2, 'regular');
      text(page, MARGIN + 417, cursorY - 12, truncate(sale.value || 'R$ 0,00', 15), 8.2, 'bold');
      cursorY -= 18;
    });

    pages.forEach((currentPage, index) => addFooter(currentPage, index + 1, pages.length));
    return createPdfBlob(pages);
  }

  function wrap(value, maxLength) {
    const words = pdfText(value).replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
    if (!words.length) return [''];
    const lines = [];
    let line = '';
    words.forEach(word => {
      const candidate = line ? `${line} ${word}` : word;
      if (candidate.length <= maxLength) {
        line = candidate;
        return;
      }
      if (line) lines.push(line);
      line = word.length > maxLength ? `${word.slice(0, Math.max(1, maxLength - 3))}...` : word;
    });
    if (line) lines.push(line);
    return lines;
  }

  function buildClient(report) {
    const safeReport = report && typeof report === 'object' ? report : {};
    const details = Array.isArray(safeReport.details) ? safeReport.details : [];
    const history = Array.isArray(safeReport.history) ? safeReport.history : [];
    const pages = [];
    let page;
    let cursorY;

    function newPage(continuation = false) {
      page = [];
      pages.push(page);
      addHeader(page, safeReport, 'RELATÓRIO DO CLIENTE');
      cursorY = 752;
      if (continuation) {
        text(page, MARGIN, cursorY, 'Histórico comercial (continuação)', 12, 'bold', [0.08, 0.1, 0.13]);
        cursorY -= 24;
      }
    }

    function detailCard(x, y, detail) {
      const cardWidth = (CONTENT_WIDTH - 12) / 2;
      fillRect(page, x, y, cardWidth, 51, [0.95, 0.96, 0.97]);
      strokeRect(page, x, y, cardWidth, 51, [0.82, 0.84, 0.86]);
      text(page, x + 11, y + 34, truncate(detail.label || '', 34), 8, 'regular', [0.38, 0.43, 0.48]);
      text(page, x + 11, y + 16, truncate(detail.value || 'Não informado', 36), 10.5, 'bold', [0.08, 0.1, 0.13]);
    }

    newPage();
    text(page, MARGIN, cursorY, 'Relatório individual', 11, 'bold', [0.08, 0.1, 0.13]);
    cursorY -= 24;
    text(page, MARGIN, cursorY, truncate(safeReport.clientName || 'Cliente', 58), 20, 'bold', [0.08, 0.1, 0.13]);
    cursorY -= 18;
    text(page, MARGIN, cursorY, `Etapa atual: ${truncate(safeReport.status || 'Não informada', 65)}`, 9.5, 'regular', [0.42, 0.47, 0.52]);
    cursorY -= 16;
    text(page, MARGIN, cursorY, `Gerado em ${truncate(safeReport.generatedAt || '', 55)}`, 8.5, 'regular', [0.42, 0.47, 0.52]);
    cursorY -= 29;

    details.forEach((detail, index) => {
      const row = Math.floor(index / 2);
      const column = index % 2;
      detailCard(MARGIN + column * ((CONTENT_WIDTH + 12) / 2), cursorY - row * 61 - 51, detail || {});
    });
    cursorY -= Math.ceil(details.length / 2) * 61 + 8;

    fillRect(page, MARGIN, cursorY - 40, CONTENT_WIDTH, 40, [1, 0.96, 0.84]);
    strokeRect(page, MARGIN, cursorY - 40, CONTENT_WIDTH, 40, [0.85, 0.67, 0.23]);
    text(page, MARGIN + 10, cursorY - 15, `Contrato: ${safeReport.contractLink ? 'link cadastrado no CRM' : 'nenhum link cadastrado'}`, 9, 'regular', [0.35, 0.25, 0.06]);
    cursorY -= 58;

    text(page, MARGIN, cursorY, 'Observações', 11, 'bold', [0.08, 0.1, 0.13]);
    cursorY -= 15;
    wrap(safeReport.notes || 'Sem observações registradas.', 91).slice(0, 5).forEach(line => {
      text(page, MARGIN, cursorY, line, 9, 'regular', [0.25, 0.29, 0.33]);
      cursorY -= 13;
    });
    cursorY -= 12;

    text(page, MARGIN, cursorY, 'Histórico comercial', 12, 'bold', [0.08, 0.1, 0.13]);
    cursorY -= 20;
    if (!history.length) text(page, MARGIN, cursorY, 'Nenhum evento foi registrado para este cliente.', 9.5, 'regular', [0.42, 0.47, 0.52]);

    history.forEach(entry => {
      const lines = wrap(entry.message || '', 73);
      const requiredHeight = Math.max(24, lines.length * 12 + 13);
      if (cursorY - requiredHeight < 58) newPage(true);
      fillRect(page, MARGIN, cursorY - requiredHeight + 4, CONTENT_WIDTH, requiredHeight - 2, [0.97, 0.98, 0.99]);
      text(page, MARGIN + 9, cursorY - 10, truncate(entry.at || 'Data não registrada', 26), 8, 'bold', [0.36, 0.41, 0.46]);
      let messageY = cursorY - 10;
      lines.forEach((line, index) => {
        text(page, MARGIN + 126, messageY - index * 12, line, 8.8, 'regular', [0.15, 0.18, 0.22]);
      });
      cursorY -= requiredHeight + 3;
    });

    pages.forEach((currentPage, index) => addFooter(currentPage, index + 1, pages.length));
    return createPdfBlob(pages);
  }

  function download(report, filename = 'relatorio-tony-crm.pdf') {
    const blob = build(report);
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = String(filename || 'relatorio-tony-crm.pdf').replace(/[^a-z0-9._-]/gi, '-');
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 700);
    return blob;
  }

  function downloadClient(report, filename = 'relatorio-cliente.pdf') {
    const blob = buildClient(report);
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = String(filename || 'relatorio-cliente.pdf').replace(/[^a-z0-9._-]/gi, '-');
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 700);
    return blob;
  }

  window.TonyPdfReport = { build, download, buildClient, downloadClient };
})();
