# Deploy to Vercel + Turso

แอปนี้ใช้ Next.js (server) + Prisma + SQLite. บน Vercel ระบบไฟล์เขียนไม่ได้
จึงย้ายฐานข้อมูลขึ้น **Turso** (SQLite บน cloud, มี free tier) แล้วเชื่อมผ่าน
Prisma libSQL driver adapter. โค้ดพร้อมแล้ว — เหลือแค่ขั้นตอน account ด้านล่าง

---

> วิธีนี้ **ไม่ต้องติดตั้ง Turso CLI** (ติดตั้งบน Windows ยุ่งยาก) — ใช้หน้าเว็บ
> dashboard + สคริปต์ก๊อปข้อมูลที่มากับโปรเจกต์แทน

## 1) สร้าง DB ผ่านหน้าเว็บ Turso

1. ไป https://app.turso.tech → sign up (ใช้ GitHub login ได้)
2. **Create Database** → ตั้งชื่อ `budget-jars` → เลือก region ใกล้ๆ (เช่น Singapore)
3. เข้าไปที่ DB → แท็บ/ปุ่ม **Connect** จะเห็น:
   - **Database URL** (`libsql://budget-jars-....turso.io`) → คือ `TURSO_DATABASE_URL`
   - กด **Create Token** → คือ `TURSO_AUTH_TOKEN`
   เก็บไว้ทั้งสองค่า

## 2) ก๊อปข้อมูล dev.db เดิมขึ้น Turso (รันในเครื่อง)

ในโฟลเดอร์ `manage-cash` รัน (PowerShell):

```powershell
$env:TURSO_DATABASE_URL="libsql://budget-jars-....turso.io"   # ค่าจากข้อ 1
$env:TURSO_AUTH_TOKEN="<your-token>"                          # ค่าจากข้อ 1
npx tsx scripts/migrate-to-turso.ts
```

สคริปต์จะสร้างตารางและก๊อปข้อมูลทั้งหมดจาก `prisma/dev.db` ขึ้น Turso ให้
(รันซ้ำได้ — มันจะ drop/recreate ตารางก่อนทุกครั้ง)

> เสร็จแล้วอย่าลืมล้าง env ออกจาก session ถ้าไม่อยากให้ local dev ไปต่อ Turso:
> `Remove-Item Env:TURSO_DATABASE_URL, Env:TURSO_AUTH_TOKEN`

## 3) Push โค้ดขึ้น GitHub

```powershell
git add -A
git commit -m "Add Turso libSQL adapter for Vercel deploy"
git push origin develop-vercel        # หรือ merge เข้า main ก่อน push
```

## 4) เชื่อม Vercel

1. ไป https://vercel.com → **Add New → Project** → import repo `juthaaa/budget-jars`
2. **Root Directory** = `manage-cash`  ⚠️ (สำคัญ เพราะโค้ดอยู่ในโฟลเดอร์ย่อย)
3. Framework Preset = Next.js (auto)
4. **Environment Variables** ใส่ 2 ตัว (ค่าเดียวกับข้อ 1):
   - `TURSO_DATABASE_URL`
   - `TURSO_AUTH_TOKEN`
5. **Deploy**

---

## หมายเหตุ

- **Local dev ยังเหมือนเดิม**: ไม่ต้องตั้ง `TURSO_*` ในเครื่อง — `lib/db.ts` จะ fall
  back ไปอ่านไฟล์ `prisma/dev.db` อัตโนมัติ
- เมื่อแก้ข้อมูลบนเว็บ (Vercel) ข้อมูลจะถูกเขียนลง Turso (cloud) ไม่ใช่ไฟล์ในเครื่อง
- ถ้าแก้ข้อมูลในเครื่อง (local) แล้วอยากดันขึ้น Turso อีกครั้ง: รัน `scripts/migrate-to-turso.ts`
  ซ้ำได้ตามข้อ 2 (มันจะ drop/recreate ตารางให้ใหม่)
