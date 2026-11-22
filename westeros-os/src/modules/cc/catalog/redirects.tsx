/** The old links of قائمة المنتجات والخامات (removed 2026-11-22) go to where its tabs live now. */
import { Navigate, useLocation } from "react-router-dom";

const MOVED: Record<string, string> = { "/catalog": "/stores/raws", "/catalog/products": "/manufacturing/products", "/catalog/sale": "/manufacturing/sale" };

export default function CatalogRedirect() {
  const { pathname, search } = useLocation();
  const path = pathname.replace(/\/+$/, "") || "/catalog";
  return <Navigate to={`${MOVED[path] ?? "/stores/raws"}${search}`} replace />;
}
