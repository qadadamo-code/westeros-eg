import { LOGO_PATHS } from "@/shell/logoPaths";

/** The Westeros artwork in solid black, for paper: used on receipts when no logo was uploaded in the invoice designer. */
export const BRAND_LOGO =
  "data:image/svg+xml," +
  encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="660 830 660 530"><g fill="#000">${LOGO_PATHS.map((d) => `<path d="${d}"/>`).join("")}</g></svg>`);
