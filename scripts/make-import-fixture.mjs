// Regenerates src/import/__fixtures__/sample-import.xlsx, the file parse.test.ts reads.
// Run with: node scripts/make-import-fixture.mjs
// It mimics a template filled in by hand: times are real Excel times (fractions of a day)
// in most rows, typed text in others, plus duplicates, a misspelled field and bad rows.
import ExcelJS from "exceljs";

const t = (h, m = 0) => (h * 60 + m) / 1440;
const headers = ["Organization", "Field", "Start Time", "End Time", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun", "Notes"];
const days = (...on) => ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (on.includes(d) ? "Y" : null));

const rows = [
  // row 2-4: good rows (Excel time values)
  ["Kailua Youth Soccer", "Field A", t(17), t(18, 30), ...days("Mon", "Wed"), "U10 practice"],
  ["Kailua Youth Soccer", "Field A", t(9), t(11), ...days("Sat"), "Games"],
  ["Windward Little League", "Field B", t(15, 30), t(17, 30), ...days("Tue", "Thu"), ""],
  // row 5: good row with typed text times and lower-case y
  ["Lanikai Lacrosse", "field b", "6:00 PM", "7:45 pm", ...days("Fri").map((v) => v && "y"), "Typed times"],
  // row 6: duplicate of row 2 (extra spaces and different case)
  ["  kailua youth   SOCCER ", "FIELD A", t(17), t(18, 30), ...days("Wed", "Mon"), "dup"],
  // row 7: misspelled field -> imports as broken
  ["Kaneohe Ultimate", "Feild A", t(19), t(21), ...days("Tue"), "misspelled field"],
  // row 8: blank row (ignored)
  [null, null, null, null, null, null, null, null, null, null, null, null],
  // row 9: missing organization
  ["", "Field A", t(8), t(9), ...days("Mon"), ""],
  // row 10: end before start
  ["Backwards FC", "Field B", t(18), t(17), ...days("Mon"), ""],
  // row 11: no days
  ["No Days Club", "Field B", t(10), t(11), ...days(), ""],
  // row 12: unreadable time and bad day value
  ["Bad Time United", "Field A", "after school", t(17), "maybe", null, null, null, null, null, null, ""],
  // row 13: out of hours (still imported, but flagged)
  ["Early Birds Running", "Field A", t(4, 30), t(6), ...days("Sun"), "early"],
];

const workbook = new ExcelJS.Workbook();
const sheet = workbook.addWorksheet("Permits");
sheet.addRow(headers);
for (const row of rows) sheet.addRow(row);
for (let r = 2; r <= rows.length + 1; r += 1) for (const c of [3, 4]) sheet.getRow(r).getCell(c).numFmt = "h:mm AM/PM";
workbook.addWorksheet("Instructions").addRow(["This sheet is ignored by the importer."]);

const out = new URL("../src/import/__fixtures__/sample-import.xlsx", import.meta.url);
await workbook.xlsx.writeFile(out.pathname);
console.log(`Wrote ${out.pathname}`);
