// Shared Excel styling constants for exceljs
export const COLORS = {
  green: "15803D",
  greenLight: "F0FDF4",
  greenBorder: "BBF7D0",
  blue: "1D4ED8",
  blueLight: "EFF6FF",
  yellow: "A16207",
  yellowLight: "FEFCE8",
  red: "DC2626",
  headerBg: "15803D",
  headerFont: "FFFFFF",
  titleBg: "F9FAFB",
  totalBg: "F3F4F6",
  white: "FFFFFF",
  black: "000000",
  gray: "6B7280",
  border: "D1D5DB",
};

export const FONT_TITLE = { name: "Calibri", size: 14, bold: true, color: { argb: COLORS.green } };
export const FONT_SUBTITLE = { name: "Calibri", size: 11, bold: false, color: { argb: COLORS.gray } };
export const FONT_HEADER = { name: "Calibri", size: 10, bold: true, color: { argb: COLORS.headerFont } };
export const FONT_BODY = { name: "Calibri", size: 10 };
export const FONT_BOLD = { name: "Calibri", size: 10, bold: true };
export const FONT_TOTAL = { name: "Calibri", size: 10, bold: true, color: { argb: COLORS.black } };

export const BORDER_THIN = {
  top: { style: "thin" as const, color: { argb: COLORS.border } },
  bottom: { style: "thin" as const, color: { argb: COLORS.border } },
  left: { style: "thin" as const, color: { argb: COLORS.border } },
  right: { style: "thin" as const, color: { argb: COLORS.border } },
};

export const FILL_HEADER = { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: COLORS.headerBg } };
export const FILL_TOTAL = { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: COLORS.totalBg } };
export const FILL_GREEN_LIGHT = { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: COLORS.greenLight } };
export const FILL_BLUE_LIGHT = { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: COLORS.blueLight } };
export const FILL_YELLOW_LIGHT = { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: COLORS.yellowLight } };

export const ALIGN_CENTER = { horizontal: "center" as const, vertical: "middle" as const };
export const ALIGN_LEFT = { horizontal: "left" as const, vertical: "middle" as const };
