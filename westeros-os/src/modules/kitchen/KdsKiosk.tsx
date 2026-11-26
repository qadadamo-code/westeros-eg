import { KitchenScreen } from "./KitchenPage";
import { AutoReady } from "./AutoReady";

/** /kds — the same kitchen display, chrome-less for a wall TV / tablet (outside the app shell, so it runs its own auto-ready). */
export default function KdsKiosk() {
  return (
    <>
      <AutoReady />
      <KitchenScreen kiosk />
    </>
  );
}
