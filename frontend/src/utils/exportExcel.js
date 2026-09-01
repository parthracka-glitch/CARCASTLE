import { api } from "@/lib/api";

export const exportExcel = async (dateRange = {}, businessName = "Car Castle Goa") => {
  // Fetch all enquiries for the range without pagination (up to backend cap of 500)
  const params = { limit: 500 };
  if (dateRange.from) params.from = dateRange.from;
  if (dateRange.to) params.to = dateRange.to;

  const res = await api.get("/enquiries", { params });
  const enquiries = res.data.enquiries || [];

  if (enquiries.length === 0) {
    throw new Error("No enquiry records found for the selected period");
  }

  // Dynamically load heavy XLSX library on-demand
  const XLSX = await import("xlsx-js-style");

  const titleText = `${businessName} — Enquiries & Leads Report`;
  const infoText = `Generated: ${new Date().toLocaleDateString("en-IN")} | Period: ${dateRange.from || "Start"} to ${dateRange.to || "End"} | Total Enquiries: ${enquiries.length}`;

  // Build grid data row-by-row
  const rows = [
    [titleText],
    [infoText],
    [], // Spacer row
    [
      "Date",
      "Customer Name",
      "Phone Number",
      "Email Address",
      "City",
      "State",
      "Car of Interest",
      "Status",
      "Notes",
    ],
  ];

  enquiries.forEach((enq) => {
    rows.push([
      enq.enquiry_date ? new Date(enq.enquiry_date).toLocaleDateString("en-IN") : "—",
      enq.name || "—",
      enq.phone || "—",
      enq.email || "—",
      enq.city || "—",
      enq.state || "—",
      enq.car_model || "—",
      (enq.status || "new").charAt(0).toUpperCase() + (enq.status || "new").slice(1),
      enq.notes || "—",
    ]);
  });

  const worksheet = XLSX.utils.aoa_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Enquiries");

  // Merges for the title and info block
  worksheet["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 8 } }, // Merge title across all 9 columns
    { s: { r: 1, c: 0 }, e: { r: 1, c: 8 } }, // Merge metadata subtitle
  ];

  // Set row heights (height in points)
  worksheet["!rows"] = [
    { hpt: 32 }, // Title row
    { hpt: 20 }, // Subtitle row
    { hpt: 10 }, // Spacer row
    { hpt: 24 }, // Header row
  ];

  // Auto-fit column widths
  const colWidths = [14, 24, 16, 26, 18, 18, 22, 14, 35];
  worksheet["!cols"] = colWidths.map((w) => ({ wch: w }));

  // Apply rich styling to every cell
  for (const key in worksheet) {
    if (key.startsWith("!")) continue;
    const cell = worksheet[key];
    const decoded = XLSX.utils.decode_cell(key);
    const r = decoded.r;

    // Default base styles
    cell.s = {
      font: { name: "Segoe UI", size: 10 },
      border: {
        top: { style: "thin", color: { rgb: "E5E7EB" } },
        bottom: { style: "thin", color: { rgb: "E5E7EB" } },
        left: { style: "thin", color: { rgb: "E5E7EB" } },
        right: { style: "thin", color: { rgb: "E5E7EB" } },
      },
      alignment: { vertical: "center" },
    };

    if (r === 0) {
      // Title formatting
      cell.s.font = { name: "Segoe UI", size: 14, bold: true, color: { rgb: "FFFFFF" } };
      cell.s.fill = { fgColor: { rgb: "20373B" } }; // Car Castle Dark Teal
      cell.s.alignment = { horizontal: "center", vertical: "center" };
      cell.s.border = null;
    } else if (r === 1) {
      // Subtitle formatting
      cell.s.font = { name: "Segoe UI", size: 9, italic: true, color: { rgb: "C3E7F1" } };
      cell.s.fill = { fgColor: { rgb: "2C494E" } }; // Secondary Teal
      cell.s.alignment = { horizontal: "center", vertical: "center" };
      cell.s.border = null;
    } else if (r === 3) {
      // Table Header row
      cell.s.font = { name: "Segoe UI", size: 10, bold: true, color: { rgb: "FFFFFF" } };
      cell.s.fill = { fgColor: { rgb: "519CAB" } }; // Accent Teal
      cell.s.alignment = { horizontal: "center", vertical: "center" };
    } else if (r > 3) {
      // Alternating row styling
      if (r % 2 === 1) {
        cell.s.fill = { fgColor: { rgb: "F4FAFC" } };
      }
    }
  }

  XLSX.writeFile(workbook, `${businessName.replace(/\s+/g, "_")}_Enquiries.xlsx`);
};
