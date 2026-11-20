/**
 * المسح الضوئي: reads QR codes with the device camera (the browser's own detector when it has one, else jsQR),
 * and from a box where a USB scanner types the code and presses Enter. Each code is handed to `onScan` once;
 * the same code seen again within two seconds is ignored, so holding a sticker in front of the camera counts it once.
 */
import { useEffect, useRef, useState } from "react";
import { Camera, CameraOff, ScanLine } from "lucide-react";
import { Button, Input } from "@/ui";

type Detector = { detect: (src: CanvasImageSource) => Promise<{ rawValue: string }[]> };

export function Scanner({ onScan, autoStart = true }: { onScan: (text: string) => void; autoStart?: boolean }) {
  const video = useRef<HTMLVideoElement>(null);
  const [on, setOn] = useState(autoStart);
  const [problem, setProblem] = useState("");
  const [typed, setTyped] = useState("");
  const last = useRef<{ text: string; at: number }>({ text: "", at: 0 });
  const handler = useRef(onScan);
  handler.current = onScan;
  const hand = (text: string) => {
    const t = text.trim();
    const now = Date.now();
    if (!t || (t === last.current.text && now - last.current.at < 2000)) return;
    last.current = { text: t, at: now };
    handler.current(t);
  };

  useEffect(() => {
    if (!on) return;
    let stream: MediaStream | null = null;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("no camera");
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
        if (stopped) return stream.getTracks().forEach((t) => t.stop());
        const v = video.current!;
        v.srcObject = stream;
        await v.play().catch(() => {});
        const Native = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => Detector }).BarcodeDetector;
        const native = Native ? new Native({ formats: ["qr_code"] }) : null;
        const jsQR = native ? null : (await import("jsqr")).default;
        setProblem("");
        const tick = async () => {
          if (stopped) return;
          try {
            if (v.readyState >= 2 && v.videoWidth) {
              if (native) {
                const found = await native.detect(v);
                if (found[0]?.rawValue) hand(found[0].rawValue);
              } else if (jsQR && ctx) {
                const w = Math.min(640, v.videoWidth);
                const h = Math.round((v.videoHeight * w) / v.videoWidth);
                canvas.width = w;
                canvas.height = h;
                ctx.drawImage(v, 0, 0, w, h);
                const img = ctx.getImageData(0, 0, w, h);
                const code = jsQR(img.data, w, h, { inversionAttempts: "dontInvert" });
                if (code?.data) hand(code.data);
              }
            }
          } catch {
            /* a frame that could not be read */
          }
          timer = setTimeout(tick, 250);
        };
        void tick();
      } catch {
        setProblem("الكاميرا مش متاحة. اسمح للمتصفح باستخدام الكاميرا، أو استخدم جهاز المسح أو اكتب الكود.");
        setOn(false);
      }
    })();
    return () => {
      stopped = true;
      clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [on]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="grid gap-2">
      {on ? (
        <div className="relative mx-auto aspect-[4/3] w-full max-w-[360px] overflow-hidden rounded-2xl border border-line bg-black">
          <video ref={video} muted playsInline className="size-full object-cover" />
          <div className="pointer-events-none absolute inset-[18%] rounded-xl border-2 border-primary/80" />
        </div>
      ) : null}
      {problem ? <p className="text-[13px] text-danger">{problem}</p> : null}
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[200px] flex-1">
          <Input icon={<ScanLine />} placeholder="جهاز المسح أو اكتب الكود ثم Enter" dir="ltr" value={typed} onChange={(e) => setTyped(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); last.current = { text: "", at: 0 }; hand(typed); setTyped(""); } }} />
        </div>
        <Button variant="outline" icon={on ? <CameraOff /> : <Camera />} onClick={() => setOn((v) => !v)}>{on ? "إيقاف الكاميرا" : "تشغيل الكاميرا"}</Button>
      </div>
    </div>
  );
}
