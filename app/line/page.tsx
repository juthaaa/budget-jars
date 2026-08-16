"use client";

import { useCallback, useEffect, useState } from "react";

interface LinkStatus {
  linked: boolean;
  lineUserIdPreview: string | null;
}

interface IssuedCode {
  code: string;
  expiresAt: string;
}

function formatCountdown(msLeft: number) {
  const total = Math.max(0, Math.ceil(msLeft / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

export default function LineLinkPage() {
  const [status, setStatus] = useState<LinkStatus | null>(null);
  const [issued, setIssued] = useState<IssuedCode | null>(null);
  const [msLeft, setMsLeft] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const fetchStatus = useCallback(async () => {
    const res = await fetch("/api/line/link");
    if (res.ok) setStatus(await res.json());
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // Tick the countdown, and drop the code once it expires so the page never
  // shows one the bot would reject.
  useEffect(() => {
    if (!issued) return;
    const expiry = new Date(issued.expiresAt).getTime();
    const tick = () => {
      const left = expiry - Date.now();
      setMsLeft(left);
      if (left <= 0) setIssued(null);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [issued]);

  // While a code is outstanding, poll so the page flips to "linked" as soon as
  // the user sends it to the bot — there is nothing to click here afterwards.
  useEffect(() => {
    if (!issued) return;
    const id = setInterval(fetchStatus, 3000);
    return () => clearInterval(id);
  }, [issued, fetchStatus]);

  useEffect(() => {
    if (status?.linked) setIssued(null);
  }, [status?.linked]);

  async function generate() {
    setBusy(true);
    setError("");
    const res = await fetch("/api/line/link", { method: "POST" });
    if (!res.ok) {
      setError("สร้างรหัสไม่สำเร็จ ลองใหม่อีกครั้ง");
      setBusy(false);
      return;
    }
    setIssued(await res.json());
    setBusy(false);
  }

  async function unlink() {
    if (!confirm("ยกเลิกการเชื่อมต่อ LINE? รายการที่ส่งมาทาง LINE จะไม่ถูกบันทึกอีก")) return;
    setBusy(true);
    setError("");
    const res = await fetch("/api/line/link", { method: "DELETE" });
    if (!res.ok) setError("ยกเลิกไม่สำเร็จ ลองใหม่อีกครั้ง");
    await fetchStatus();
    setBusy(false);
  }

  return (
    <div className="max-w-2xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">เชื่อมต่อ LINE</h1>
        <p className="text-sm text-gray-500 mt-1">
          เชื่อมบัญชี LINE เพื่อพิมพ์รายการเข้าบอทแล้วบันทึกเข้าบัญชีนี้อัตโนมัติ
        </p>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3">
          {error}
        </div>
      )}

      {status === null ? (
        <div className="text-sm text-gray-400">กำลังโหลด…</div>
      ) : status.linked ? (
        <div className="rounded-xl bg-white border border-gray-200 p-5 space-y-4">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center rounded-full bg-green-50 text-green-700 text-xs font-medium px-2.5 py-1">
              เชื่อมต่อแล้ว
            </span>
            <span className="text-sm text-gray-500 font-mono">{status.lineUserIdPreview}</span>
          </div>
          <p className="text-sm text-gray-600">
            พิมพ์รายการในแชทได้เลย เช่น <span className="font-medium">“ข้าวเที่ยง 60”</span>
          </p>
          <button
            onClick={unlink}
            disabled={busy}
            className="text-sm text-gray-600 hover:text-red-600 transition-colors disabled:opacity-50"
          >
            ยกเลิกการเชื่อมต่อ
          </button>
        </div>
      ) : (
        <div className="rounded-xl bg-white border border-gray-200 p-5 space-y-4">
          <ol className="text-sm text-gray-600 space-y-1.5 list-decimal list-inside">
            <li>กดปุ่มด้านล่างเพื่อสร้างรหัส</li>
            <li>เปิดแชท LINE ของบอท</li>
            <li>
              ส่งข้อความ <span className="font-mono font-medium">link รหัส</span> เช่น{" "}
              <span className="font-mono font-medium">link 123456</span>
            </li>
          </ol>

          {issued ? (
            <div className="rounded-lg bg-indigo-50 border border-indigo-200 p-4 text-center space-y-1">
              <div className="font-mono text-3xl font-bold tracking-[0.3em] text-indigo-700">
                {issued.code}
              </div>
              <div className="text-xs text-indigo-600">
                ส่ง <span className="font-mono">link {issued.code}</span> ให้บอท · หมดอายุใน{" "}
                {formatCountdown(msLeft)}
              </div>
            </div>
          ) : null}

          <button
            onClick={generate}
            disabled={busy}
            className="rounded-lg bg-indigo-600 text-white text-sm font-medium px-4 py-2 hover:bg-indigo-700 transition-colors disabled:opacity-50"
          >
            {issued ? "สร้างรหัสใหม่" : "สร้างรหัสเชื่อมต่อ"}
          </button>
        </div>
      )}
    </div>
  );
}
