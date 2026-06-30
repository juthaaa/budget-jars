# Manage Cash

แอปจัดการกระแสเงินสดส่วนตัวด้วยระบบ Money Jar (Next.js 14 + Prisma + SQLite)

## Tech Stack

- Next.js 14.2 (App Router) + TypeScript
- Prisma 5 + SQLite
- Tailwind CSS 3 + shadcn/ui
- Recharts (กราฟ)

ต้องการ Node 18 ขึ้นไป

## เริ่มต้นใช้งาน (เริ่มจาก database เปล่า)

```bash
npm install
cp .env.example .env          # ตั้งค่า DATABASE_URL (ชี้ไปที่ prisma/dev.db)
npx prisma generate           # สร้าง Prisma Client
npx prisma migrate deploy     # สร้าง dev.db เปล่า + ตารางตาม schema
npm run dev                   # เปิดที่ http://localhost:3000
```

> ถ้า `migrate deploy` มีปัญหา ใช้ `npx prisma db push` แทนเพื่อ sync schema เข้า db โดยตรง

## กรอกข้อมูลเริ่มต้น

database ที่เพิ่งสร้างจะ **ว่างเปล่า** ยังไม่มีค่า default ใดๆ — เข้าไปตั้งค่าผ่าน UI ตามลำดับนี้:

1. **`/accounts/manage`** — เพิ่มบัญชีธนาคาร
2. **`/jars/manage`** — เพิ่ม Jar พร้อมตั้ง % และผูกบัญชีธนาคาร
3. **`/deductions/manage`** — เพิ่มประเภทรายรับ (เช่น เงินเดือน/OT/โบนัส) และประเภทรายการหัก (เช่น ภาษี/ประกันสังคม)
4. **`/payment-methods/manage`** — เพิ่มวิธีจ่าย (เงินสด/เครดิต/เดบิต)
5. **`/recurring-expenses/manage`** — (ถ้าต้องการ) ตั้งรายจ่ายประจำที่จะถูกเพิ่มอัตโนมัติในแต่ละเดือนใหม่
6. **หน้าหลัก `/`** — เพิ่มเดือน แล้วเริ่มกรอกรายรับ–รายจ่าย

## หมายเหตุ

- `.env` และ `prisma/dev.db` ถูก gitignore ไว้ (เป็นข้อมูล/ค่าเฉพาะเครื่อง) — clone มาแล้วต้อง `cp .env.example .env` เองทุกครั้ง
- การย้าย **ข้อมูลจริง** ระหว่างเครื่องของตัวเอง: copy ไฟล์ `prisma/dev.db` ไปตรงๆ (ข้ามขั้นตอนกรอกข้อมูลใหม่)
- รายละเอียดสถาปัตยกรรม/โครงสร้างข้อมูลทั้งหมดอยู่ใน [CLAUDE.md](./CLAUDE.md)
