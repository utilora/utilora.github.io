const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const context = { window: {} };
vm.createContext(context);
vm.runInContext(fs.readFileSync("assets/js/finance.js", "utf8"), context);
const F = context.window.UtiloraFinance;

assert.deepEqual(JSON.parse(JSON.stringify(F.vatFromInclusive(113000, 0.13))), {
  exclusive: 100000, tax: 13000, inclusive: 113000, rate: 0.13,
});
assert.deepEqual(JSON.parse(JSON.stringify(F.vatFromExclusive(100000, 0.13))), {
  exclusive: 100000, tax: 13000, inclusive: 113000, rate: 0.13,
});
assert.equal(F.parseAmount("11,300.00").value, 11300);
assert.equal(F.parseAmount("-1").value, -1);
assert.equal(F.parseAmount("1.2.3").error, "无效数字");
assert.equal(F.pitOnTaxable(36000).tax, 1080);
assert.equal(F.pitOnTaxable(36001).tax, 1080.1);
assert.equal(F.toMoney(35590), "叁万伍仟伍佰玖拾元整");

const vatTool = fs.readFileSync("tools/vat-split/tool.js", "utf8");
assert.match(vatTool, /rateMatch/);
assert.match(vatTool, /\\uFEFF/);
assert.match(vatTool, /join\("\\r\\n"\)/);

console.log("财务计算与 CSV 回归测试通过");
