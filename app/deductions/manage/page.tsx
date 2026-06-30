"use client";

import { useEffect, useState } from "react";

interface DeductionRule {
  id: number;
  deductionTypeId: number;
  valueType: string;
  value: number;
  effectiveDate: string;
}

interface DeductionType {
  id: number;
  name: string;
  code: string;
  sortOrder: number;
  rules: DeductionRule[];
}

interface IncomeType {
  id: number;
  name: string;
  code: string;
  excludeFromNet: boolean;
  sortOrder: number;
}

export default function DeductionsManagePage() {
  const [types, setTypes] = useState<DeductionType[]>([]);
  const [incomeTypes, setIncomeTypes] = useState<IncomeType[]>([]);
  const [loading, setLoading] = useState(true);

  // Income type form
  const [showIncomeForm, setShowIncomeForm] = useState(false);
  const [editingIncome, setEditingIncome] = useState<IncomeType | null>(null);
  const [iName, setIName] = useState("");
  const [iCode, setICode] = useState("");
  const [iExclude, setIExclude] = useState(false);
  const [iSort, setISort] = useState("99");

  // Deduction type form
  const [showTypeForm, setShowTypeForm] = useState(false);
  const [editingType, setEditingType] = useState<DeductionType | null>(null);
  const [tName, setTName] = useState("");
  const [tCode, setTCode] = useState("");
  const [tSort, setTSort] = useState("");

  // Rule form
  const [showRuleForm, setShowRuleForm] = useState(false);
  const [editingRule, setEditingRule] = useState<DeductionRule | null>(null);
  const [rTypeId, setRTypeId] = useState<number>(0);
  const [rValueType, setRValueType] = useState<"amount" | "percent">("amount");
  const [rValue, setRValue] = useState("");
  const [rDate, setRDate] = useState("");

  const [saving, setSaving] = useState(false);

  async function fetchAll() {
    const [deductionData, incomeData] = await Promise.all([
      fetch("/api/deduction-types").then((r) => r.json()),
      fetch("/api/income-types").then((r) => r.json()),
    ]);
    setTypes(deductionData);
    setIncomeTypes(incomeData);
    setLoading(false);
  }

  async function fetchTypes() {
    const data = await fetch("/api/deduction-types").then((r) => r.json());
    setTypes(data);
  }

  useEffect(() => { fetchAll(); }, []);

  // --- Income type handlers ---
  function openAddIncome() {
    setEditingIncome(null);
    setIName(""); setICode(""); setIExclude(false); setISort("99");
    setShowIncomeForm(true);
  }

  function openEditIncome(t: IncomeType) {
    setEditingIncome(t);
    setIName(t.name); setICode(t.code); setIExclude(t.excludeFromNet); setISort(String(t.sortOrder));
    setShowIncomeForm(true);
  }

  async function saveIncome() {
    if (!iName || !iCode) return;
    setSaving(true);
    const body = { name: iName, code: iCode.toUpperCase().trim(), excludeFromNet: iExclude, sortOrder: Number(iSort) || 99 };
    if (editingIncome) {
      await fetch(`/api/income-types/${editingIncome.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } else {
      await fetch("/api/income-types", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    }
    setShowIncomeForm(false);
    const data = await fetch("/api/income-types").then((r) => r.json());
    setIncomeTypes(data);
    setSaving(false);
  }

  async function deleteIncome(id: number, name: string) {
    if (!confirm(`ลบประเภทรายรับ "${name}"? จะลบข้อมูลในทุกเดือนด้วย`)) return;
    await fetch(`/api/income-types/${id}`, { method: "DELETE" });
    const data = await fetch("/api/income-types").then((r) => r.json());
    setIncomeTypes(data);
  }

  function openAddType() {
    setEditingType(null);
    setTName(""); setTCode(""); setTSort("99");
    setShowTypeForm(true);
  }

  function openEditType(t: DeductionType) {
    setEditingType(t);
    setTName(t.name); setTCode(t.code); setTSort(String(t.sortOrder));
    setShowTypeForm(true);
  }

  async function saveType() {
    if (!tName || !tCode) return;
    setSaving(true);
    const body = { name: tName, code: tCode.toUpperCase().trim(), sortOrder: tSort };
    if (editingType) {
      await fetch(`/api/deduction-types/${editingType.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } else {
      await fetch("/api/deduction-types", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    }
    setShowTypeForm(false);
    await fetchTypes();
    setSaving(false);
  }

  async function deleteType(id: number, name: string) {
    if (!confirm(`ลบประเภท "${name}"? จะลบกฎและข้อมูลในแต่ละเดือนทั้งหมด`)) return;
    await fetch(`/api/deduction-types/${id}`, { method: "DELETE" });
    await fetchTypes();
  }

  function openAddRule(typeId: number) {
    setEditingRule(null);
    setRTypeId(typeId);
    setRValueType("amount");
    setRValue("");
    setRDate(new Date().toISOString().slice(0, 10));
    setShowRuleForm(true);
  }

  function openEditRule(rule: DeductionRule) {
    setEditingRule(rule);
    setRTypeId(rule.deductionTypeId);
    setRValueType(rule.valueType as "amount" | "percent");
    setRValue(String(rule.value));
    setRDate(rule.effectiveDate.slice(0, 10));
    setShowRuleForm(true);
  }

  async function saveRule() {
    if (!rDate || !rValue) return;
    setSaving(true);
    const body = {
      deductionTypeId: rTypeId,
      valueType: rValueType,
      value: rValue,
      effectiveDate: rDate,
    };
    if (editingRule) {
      await fetch(`/api/deductions/${editingRule.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } else {
      await fetch("/api/deductions", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    }
    setShowRuleForm(false);
    await fetchTypes();
    setSaving(false);
  }

  async function deleteRule(id: number) {
    if (!confirm("ลบกฎนี้?")) return;
    await fetch(`/api/deductions/${id}`, { method: "DELETE" });
    await fetchTypes();
  }

  if (loading) return <div className="py-12 text-center text-gray-500">กำลังโหลด...</div>;

  return (
    <div className="space-y-8">

      {/* ===== INCOME TYPES SECTION ===== */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">ประเภทรายรับ</h1>
            <p className="text-sm text-gray-500 mt-0.5">รายการที่มี flag &quot;ไม่รวมสุทธิ&quot; จะถูกบันทึกแต่ไม่นับใน Net Income</p>
          </div>
          <button onClick={openAddIncome}
            className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700">
            + เพิ่มประเภทรายรับ
          </button>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {incomeTypes.length === 0 ? (
            <div className="py-10 text-center text-gray-400 text-sm">ยังไม่มีประเภทรายรับ</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500">
                <tr>
                  <th className="text-left px-4 py-3">ชื่อ</th>
                  <th className="text-left px-3 py-3">Code</th>
                  <th className="text-center px-3 py-3">Flag</th>
                  <th className="text-center px-3 py-3 w-16">ลำดับ</th>
                  <th className="px-3 py-3 w-24"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {incomeTypes.map((it) => (
                  <tr key={it.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-800">{it.name}</td>
                    <td className="px-3 py-3 text-gray-500 font-mono text-xs">{it.code}</td>
                    <td className="px-3 py-3 text-center">
                      {it.excludeFromNet ? (
                        <span className="text-xs bg-orange-100 text-orange-600 px-2 py-0.5 rounded-full font-medium">ไม่รวมสุทธิ</span>
                      ) : (
                        <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">รวมสุทธิ</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-center text-gray-400">{it.sortOrder}</td>
                    <td className="px-3 py-3">
                      <div className="flex gap-2 justify-end">
                        <button onClick={() => openEditIncome(it)} className="text-gray-400 hover:text-indigo-600 text-xs">แก้ไข</button>
                        <button onClick={() => deleteIncome(it.id, it.name)} className="text-gray-400 hover:text-red-500 text-xs">ลบ</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ===== DEDUCTIONS SECTION ===== */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">รายการหัก (Deductions)</h1>
            <p className="text-sm text-gray-500 mt-0.5">ระบบใช้ค่าล่าสุดที่มีผลก่อนวันที่ 1 ของเดือนเป็น default</p>
          </div>
          <button onClick={openAddType}
            className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700">
            + เพิ่มประเภทรายหัก
          </button>
        </div>

      <div>
      {types.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 py-12 text-center text-gray-400">
          ยังไม่มีประเภทรายการหัก กดปุ่ม &quot;+ เพิ่มประเภทรายหัก&quot; เพื่อสร้าง
        </div>
      ) : (
        types.map((type) => (
          <div key={type.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-gray-800">{type.name}</h2>
                <p className="text-xs text-gray-400 mt-0.5">code: {type.code}</p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => openEditType(type)} className="text-xs text-gray-500 hover:text-indigo-600 px-2">แก้ไขประเภท</button>
                <button onClick={() => deleteType(type.id, type.name)} className="text-xs text-gray-500 hover:text-red-500 px-2">ลบประเภท</button>
                <button onClick={() => openAddRule(type.id)}
                  className="text-xs bg-indigo-600 text-white px-3 py-1.5 rounded-md hover:bg-indigo-700">
                  + เพิ่มค่า
                </button>
              </div>
            </div>
            {type.rules.length === 0 ? (
              <div className="py-8 text-center text-gray-400 text-sm">ยังไม่มีค่า default</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-500">
                  <tr>
                    <th className="text-left px-4 py-3">วันที่มีผล</th>
                    <th className="text-left px-3 py-3">ประเภทค่า</th>
                    <th className="text-right px-3 py-3">ค่า</th>
                    <th className="px-3 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {type.rules.map((rule, idx) => (
                    <tr key={rule.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2.5 text-gray-800">
                        {new Date(rule.effectiveDate).toLocaleDateString("th-TH", {
                          day: "numeric", month: "long", year: "numeric",
                        })}
                        {idx === 0 && (
                          <span className="ml-2 text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded">ปัจจุบัน</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-gray-500">
                        {rule.valueType === "percent" ? "% ของเงินเดือน" : "จำนวนเงิน (บาท)"}
                      </td>
                      <td className="px-3 py-2.5 text-right font-semibold text-gray-900">
                        {rule.valueType === "percent"
                          ? `${rule.value}%`
                          : `฿${rule.value.toLocaleString()}`}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex gap-2 justify-end">
                          <button onClick={() => openEditRule(rule)} className="text-gray-400 hover:text-indigo-600 text-xs">แก้ไข</button>
                          <button onClick={() => deleteRule(rule.id)} className="text-gray-400 hover:text-red-500 text-xs">ลบ</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        ))
      )}
      </div>

      </div>{/* end deductions section */}

      {/* Income type form modal */}
      {showIncomeForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-sm shadow-2xl">
            <div className="px-5 py-4 border-b border-gray-100">
              <h3 className="font-semibold">{editingIncome ? "แก้ไขประเภทรายรับ" : "เพิ่มประเภทรายรับ"}</h3>
            </div>
            <div className="p-5 space-y-3">
              <label className="block">
                <span className="text-xs text-gray-500">ชื่อ *</span>
                <input type="text" value={iName} onChange={(e) => setIName(e.target.value)}
                  placeholder="เช่น เงินเดือน, เบี้ยเลี้ยง"
                  className="mt-1 block w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400" />
              </label>
              <label className="block">
                <span className="text-xs text-gray-500">Code *</span>
                <input type="text" value={iCode} onChange={(e) => setICode(e.target.value.toUpperCase())}
                  placeholder="SALARY"
                  className="mt-1 block w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400" />
              </label>
              <label className="block">
                <span className="text-xs text-gray-500">ลำดับ</span>
                <input type="number" value={iSort} onChange={(e) => setISort(e.target.value)}
                  className="mt-1 block w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400" />
              </label>
              <label className="flex items-center gap-3 cursor-pointer select-none">
                <input type="checkbox" checked={iExclude} onChange={(e) => setIExclude(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 text-orange-500 focus:ring-orange-400" />
                <div>
                  <p className="text-sm font-medium text-gray-800">ไม่รวมรายได้สุทธิ</p>
                  <p className="text-xs text-gray-400">บันทึกเป็นประวัติเฉยๆ ไม่นำไปคำนวณ Net Income</p>
                </div>
              </label>
            </div>
            <div className="px-5 py-4 border-t border-gray-100 flex gap-2 justify-end">
              <button onClick={() => setShowIncomeForm(false)} className="text-sm text-gray-500 px-4 py-2 rounded-lg hover:bg-gray-100">ยกเลิก</button>
              <button onClick={saveIncome} disabled={saving || !iName || !iCode}
                className="text-sm bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 disabled:opacity-50">
                {saving ? "..." : "บันทึก"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Deduction type form modal */}
      {showTypeForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-sm shadow-2xl">
            <div className="px-5 py-4 border-b border-gray-100">
              <h3 className="font-semibold">{editingType ? "แก้ไขประเภท" : "เพิ่มประเภทรายการหัก"}</h3>
            </div>
            <div className="p-5 space-y-3">
              <label className="block">
                <span className="text-xs text-gray-500">ชื่อ *</span>
                <input type="text" value={tName} onChange={(e) => setTName(e.target.value)}
                  placeholder="เช่น กองทุนสำรองเลี้ยงชีพ"
                  className="mt-1 block w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
              </label>
              <label className="block">
                <span className="text-xs text-gray-500">Code (ใช้อ้างอิงภายใน) *</span>
                <input type="text" value={tCode} onChange={(e) => setTCode(e.target.value.toUpperCase())}
                  placeholder="PROVIDENT"
                  className="mt-1 block w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
              </label>
              <label className="block">
                <span className="text-xs text-gray-500">ลำดับ (เลขน้อย = แสดงก่อน)</span>
                <input type="number" value={tSort} onChange={(e) => setTSort(e.target.value)}
                  className="mt-1 block w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
              </label>
            </div>
            <div className="px-5 py-4 border-t border-gray-100 flex gap-2 justify-end">
              <button onClick={() => setShowTypeForm(false)} className="text-sm text-gray-500 px-4 py-2 rounded-lg hover:bg-gray-100">ยกเลิก</button>
              <button onClick={saveType} disabled={saving || !tName || !tCode}
                className="text-sm bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50">
                {saving ? "..." : "บันทึก"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rule form modal */}
      {showRuleForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-sm shadow-2xl">
            <div className="px-5 py-4 border-b border-gray-100">
              <h3 className="font-semibold">{editingRule ? "แก้ไขค่า Default" : "เพิ่มค่า Default"}</h3>
            </div>
            <div className="p-5 space-y-3">
              <label className="block">
                <span className="text-xs text-gray-500">วันที่มีผล *</span>
                <input type="date" value={rDate} onChange={(e) => setRDate(e.target.value)}
                  className="mt-1 block w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-xs text-gray-500">ประเภทค่า</span>
                  <select value={rValueType} onChange={(e) => setRValueType(e.target.value as "amount" | "percent")}
                    className="mt-1 block w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400">
                    <option value="amount">จำนวนเงิน (บาท)</option>
                    <option value="percent">% ของเงินเดือน</option>
                  </select>
                </label>
                <label className="block">
                  <span className="text-xs text-gray-500">
                    {rValueType === "percent" ? "% (เช่น 5)" : "จำนวน (บาท)"}
                  </span>
                  <input type="number" value={rValue} onChange={(e) => setRValue(e.target.value)}
                    placeholder={rValueType === "percent" ? "5" : "750"}
                    step={rValueType === "percent" ? "0.01" : "1"}
                    className="mt-1 block w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                </label>
              </div>
            </div>
            <div className="px-5 py-4 border-t border-gray-100 flex gap-2 justify-end">
              <button onClick={() => setShowRuleForm(false)} className="text-sm text-gray-500 px-4 py-2 rounded-lg hover:bg-gray-100">ยกเลิก</button>
              <button onClick={saveRule} disabled={saving || !rDate || !rValue}
                className="text-sm bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50">
                {saving ? "..." : "บันทึก"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
