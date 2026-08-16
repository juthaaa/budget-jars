"use client";

// Entry point when the app is opened from LINE (rich menu → LIFF URL).
// Exchanges the LIFF ID token for a normal session cookie, then hands over to
// the regular pages — everything downstream stays unaware it was opened inside
// LINE. middleware.ts also bounces expired LINE sessions back here, so a deep
// link like /month/2026-08 survives a session timeout without a login form.
import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type Phase = "starting" | "not_linked" | "error";

/** Only same-origin paths — never let ?next= bounce someone off-site. */
function safeNext(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/";
  return raw;
}

function LiffGate() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = safeNext(searchParams.get("next"));

  const [phase, setPhase] = useState<Phase>("starting");
  const [detail, setDetail] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function run() {
      const liffId = process.env.NEXT_PUBLIC_LIFF_ID;
      if (!liffId) {
        setPhase("error");
        setDetail("ยังไม่ได้ตั้งค่า NEXT_PUBLIC_LIFF_ID");
        return;
      }

      try {
        // Browser-only SDK — importing at module scope would break the build.
        const liff = (await import("@line/liff")).default;
        await liff.init({ liffId });

        // Inside LINE this is already true; in an external browser it kicks off
        // the LINE Login redirect and this page runs again on the way back.
        if (!liff.isLoggedIn()) {
          liff.login({ redirectUri: window.location.href });
          return;
        }

        const idToken = liff.getIDToken();
        if (!idToken) {
          setPhase("error");
          setDetail('ไม่ได้รับ ID token — ตรวจว่า LIFF scope มี "openid" หรือยัง');
          return;
        }

        const res = await fetch("/api/auth/line", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ idToken }),
        });

        if (cancelled) return;

        if (res.status === 403) {
          setPhase("not_linked");
          return;
        }
        if (!res.ok) {
          setPhase("error");
          setDetail("เข้าสู่ระบบไม่สำเร็จ");
          return;
        }

        router.replace(next);
        router.refresh();
      } catch (err) {
        if (cancelled) return;
        setPhase("error");
        setDetail(err instanceof Error ? err.message : String(err));
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [next, router]);

  if (phase === "starting") {
    return <Centered>กำลังเข้าสู่ระบบ…</Centered>;
  }

  if (phase === "not_linked") {
    return (
      <Centered>
        <div className="space-y-3 text-center">
          <p className="font-medium text-gray-900">บัญชี LINE นี้ยังไม่ได้ผูกกับผู้ใช้</p>
          <p className="text-sm text-gray-500">
            เข้าสู่ระบบด้วยรหัสผ่าน แล้วไปที่เมนู “เชื่อมต่อ LINE” เพื่อผูกบัญชี
          </p>
          <a
            href={`/login?next=${encodeURIComponent("/line")}`}
            className="inline-block rounded-lg bg-indigo-600 text-white text-sm font-medium px-4 py-2 hover:bg-indigo-700 transition-colors"
          >
            เข้าสู่ระบบ
          </a>
        </div>
      </Centered>
    );
  }

  return (
    <Centered>
      <div className="space-y-3 text-center">
        <p className="font-medium text-gray-900">เปิดแอปไม่สำเร็จ</p>
        {detail && <p className="text-sm text-gray-500 break-all">{detail}</p>}
        <a
          href={`/login?next=${encodeURIComponent(next)}`}
          className="inline-block rounded-lg bg-indigo-600 text-white text-sm font-medium px-4 py-2 hover:bg-indigo-700 transition-colors"
        >
          เข้าสู่ระบบด้วยรหัสผ่าน
        </a>
      </div>
    </Centered>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-6 text-gray-600">
      {children}
    </div>
  );
}

export default function LiffPage() {
  // useSearchParams needs a Suspense boundary to stay statically renderable.
  return (
    <Suspense fallback={<Centered>กำลังเข้าสู่ระบบ…</Centered>}>
      <LiffGate />
    </Suspense>
  );
}
