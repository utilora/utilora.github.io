const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const context = { window: {} };
vm.createContext(context);
vm.runInContext(fs.readFileSync("assets/js/csv.js", "utf8"), context);
const C = context.window.UtiloraCsv;

assert.deepEqual(JSON.parse(JSON.stringify(C.parseCsv('\uFEFF客户,金额\r\n"上海,公司",11300'))), [["客户", "金额"], ["上海,公司", "11300"]]);
assert.deepEqual(JSON.parse(JSON.stringify(C.parseCsv("客户\t金额\n甲公司\t100"))), [["客户", "金额"], ["甲公司", "100"]]);
assert.match(C.objectsToCsv([{ 客户: "甲公司", 金额: 100 }]), /客户,金额/);
console.log("CSV/TSV 解析测试通过");
