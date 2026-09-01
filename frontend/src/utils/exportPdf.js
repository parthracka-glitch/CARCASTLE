export const exportPdf = async (elementId, businessName = "Car Castle Goa", dateRangeLabel = "") => {
  const element = document.getElementById(elementId);
  if (!element) throw new Error("Element not found for PDF export");

  // Dynamically load heavy libraries only when user requests PDF export
  const [{ jsPDF }, html2canvas] = await Promise.all([
    import("jspdf"),
    import("html2canvas").then((m) => m.default || m),
  ]);

  // Temporarily style for export (clean background, fixed width)
  const originalStyle = element.getAttribute("style") || "";
  element.setAttribute(
    "style",
    `${originalStyle}; background: #FFFFFF; padding: 20px; width: 1000px; max-width: 1000px; border-radius: 12px;`
  );

  try {
    const canvas = await html2canvas(element, { scale: 2, useCORS: true, backgroundColor: "#FFFFFF" });
    const imgData = canvas.toDataURL("image/png");

    // A4 landscape dimensions
    const pdf = new jsPDF("landscape", "mm", "a4");
    const pdfWidth = pdf.internal.pageSize.getWidth(); // 297mm
    const pdfHeight = pdf.internal.pageSize.getHeight(); // 210mm

    const maxPrintWidth = pdfWidth - 30; // 267mm
    const maxPrintHeight = 170; // 170mm

    const scaleFactor = canvas.width / maxPrintWidth;
    const slicePixelHeight = maxPrintHeight * scaleFactor;

    const drawHeader = (pageNum) => {
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(16);
      pdf.setTextColor(32, 55, 59); // Brand dark teal (#20373B)
      pdf.text(`${businessName}`, 15, 12);

      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(9);
      pdf.setTextColor(81, 156, 171); // Secondary teal (#519CAB)
      pdf.text(`Enquiry & Analytics Report  |  Period: ${dateRangeLabel || "All Time"}`, 15, 18);

      // Header Divider Line
      pdf.setDrawColor(195, 231, 241); // Light sky border (#C3E7F1)
      pdf.setLineWidth(0.5);
      pdf.line(15, 22, pdfWidth - 15, 22);

      // Page numbers at the top right
      pdf.setFontSize(9);
      pdf.setTextColor(150, 150, 150);
      pdf.text(`Page ${pageNum}`, pdfWidth - 25, 12);
    };

    let remainingHeight = canvas.height;
    let sourceY = 0;
    let pageNum = 1;

    drawHeader(pageNum);

    if (remainingHeight <= slicePixelHeight) {
      const imgHeight = (canvas.height * maxPrintWidth) / canvas.width;
      pdf.addImage(imgData, "PNG", 15, 26, maxPrintWidth, imgHeight);
    } else {
      while (remainingHeight > 0) {
        const sliceCanvas = document.createElement("canvas");
        sliceCanvas.width = canvas.width;
        sliceCanvas.height = Math.min(slicePixelHeight, remainingHeight);

        const ctx = sliceCanvas.getContext("2d");
        ctx.drawImage(
          canvas,
          0,
          sourceY,
          canvas.width,
          sliceCanvas.height,
          0,
          0,
          sliceCanvas.width,
          sliceCanvas.height
        );

        const sliceData = sliceCanvas.toDataURL("image/png");
        const sliceHeightMm = (sliceCanvas.height * maxPrintWidth) / canvas.width;

        if (pageNum > 1) {
          pdf.addPage();
          drawHeader(pageNum);
        }

        pdf.addImage(sliceData, "PNG", 15, 26, maxPrintWidth, sliceHeightMm);

        remainingHeight -= slicePixelHeight;
        sourceY += slicePixelHeight;
        pageNum++;
      }
    }

    pdf.save(`${businessName.replace(/\s+/g, "_")}_Enquiries_Report.pdf`);
  } finally {
    element.setAttribute("style", originalStyle);
  }
};
