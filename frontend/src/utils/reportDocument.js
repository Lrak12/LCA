import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

const safeFileName = (value) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const stylesheetMarkup = () =>
  Array.from(document.head.querySelectorAll('link[rel="stylesheet"], style'))
    .map((node) => {
      if (node.tagName === "LINK") {
        return `<link rel="stylesheet" href="${node.href}">`;
      }
      return node.outerHTML;
    })
    .join("\n");

export const printReport = (element, { title }) => {
  if (!element) throw new Error("The report is not ready to print yet.");

  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    throw new Error("The print window was blocked. Allow pop-ups and try again.");
  }
  printWindow.opener = null;

  printWindow.document.write(`<!doctype html>
    <html>
      <head>
        <meta charset="utf-8">
        <base href="${window.location.origin}/">
        <title>${title}</title>
        ${stylesheetMarkup()}
        <style>
          @page { size: landscape; margin: 10mm; }
          html, body { background: #fff !important; color: #0f172a; }
          body { margin: 0; padding: 0; font-family: Arial, sans-serif; }
          .report-print-title { margin: 0 0 14px; font-size: 20px; font-weight: 800; }
          .report-print-content { width: 100%; overflow: visible !important; }
          .report-print-content * { animation: none !important; }
          .report-print-content > div, .report-print-content section { overflow: visible !important; }
          table { width: 100% !important; min-width: 0 !important; page-break-inside: auto; }
          tr { page-break-inside: avoid; page-break-after: auto; }
          thead { display: table-header-group; }
        </style>
      </head>
      <body>
        <h1 class="report-print-title">${title}</h1>
        <main class="report-print-content">${element.innerHTML}</main>
      </body>
    </html>`);
  printWindow.document.close();

  printWindow.addEventListener("load", () => {
    window.setTimeout(() => {
      printWindow.focus();
      printWindow.print();
    }, 250);
  });
};

export const exportReportPdf = (element, { title, subtitle = "", fileName }) => {
  if (!element) throw new Error("The report is not ready to export yet.");

  const tables = Array.from(element.querySelectorAll("table"));
  if (tables.length === 0) throw new Error("There is no report table to export.");

  const documentPdf = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const margin = 28;
  const pageHeight = documentPdf.internal.pageSize.getHeight();
  let nextY = 34;

  documentPdf.setFont("helvetica", "bold");
  documentPdf.setFontSize(15);
  documentPdf.text(title, margin, nextY);
  nextY += 15;

  if (subtitle) {
    documentPdf.setFont("helvetica", "normal");
    documentPdf.setFontSize(8);
    documentPdf.setTextColor(71, 85, 105);
    documentPdf.text(subtitle, margin, nextY);
    documentPdf.setTextColor(15, 23, 42);
    nextY += 16;
  }

  tables.forEach((table, index) => {
    const sectionTitle = table.closest("section")?.querySelector("h3")?.textContent?.trim();
    if (sectionTitle) {
      if (nextY > pageHeight - 90) {
        documentPdf.addPage();
        nextY = 34;
      }
      documentPdf.setFont("helvetica", "bold");
      documentPdf.setFontSize(9);
      documentPdf.text(sectionTitle, margin, nextY);
      nextY += 7;
    }

    autoTable(documentPdf, {
      html: table,
      startY: nextY,
      theme: "grid",
      margin: { top: 28, right: margin, bottom: 28, left: margin },
      styles: {
        font: "helvetica",
        fontSize: tables.length > 1 ? 7 : 6.5,
        cellPadding: 3,
        lineColor: [203, 213, 225],
        lineWidth: 0.4,
        textColor: [15, 23, 42],
        overflow: "linebreak",
      },
      headStyles: {
        fillColor: [241, 245, 249],
        textColor: [30, 41, 59],
        fontStyle: "bold",
        halign: "center",
      },
      horizontalPageBreak: true,
      horizontalPageBreakRepeat: 0,
      showHead: "everyPage",
    });

    nextY = (documentPdf.lastAutoTable?.finalY ?? nextY) + 18;
    if (index < tables.length - 1 && nextY > pageHeight - 75) {
      documentPdf.addPage();
      nextY = 34;
    }
  });

  documentPdf.save(`${safeFileName(fileName || title) || "report"}.pdf`);
};

export const showReportActionError = (error) => {
  window.alert(error?.message ?? "The report could not be generated. Please try again.");
};
