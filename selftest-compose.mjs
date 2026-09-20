// 生成器自检：验证"文字 + 已选样式 → 代码"的拼装逻辑（纯函数，不需要浏览器）
import { loadLib } from "./test-helpers.mjs";

const RTC = loadLib("compose.mjs");
const { compose, tagFor, closingFor, PLAIN_TAGS, ALL_OPTS, LABEL, GROUPS, SELF_CLOSING_KEYS, safeText } = RTC;
const { parseTree, linesOf } = loadLib("lib.mjs");

let pass = 0, fail = 0;
const check = (n, c, x) => { if (c) { pass++; console.log("PASS  " + n); } else { fail++; console.log("FAIL  " + n + (x ? "\n      " + x : "")); } };

const ST = {
  font:"SimHei", fw:"800", alpha:"#80", space:"3em",
  color:"#e0b45e", markColor:"#ffcc00", size:100,
  cspace:0.5, lineh:150, rotate:15, voffset:0.5, indent:15, width:60,
  sprite:"smile", link:"item_1001"
};
const nodesOf = (n, out = []) => { if (n.tag && n.tag[0] !== "#") out.push(n); (n.kids || []).forEach(k => nodesOf(k, out)); return out; };
const gen = (text, keys, over = {}) => {
  const on = {}; keys.forEach(k => on[k] = true);
  return compose(text, keys, on, Object.assign({}, ST, over));
};

/* ---------- 1) 你给的那个例子 ---------- */
check("复现原始例子（顺序 color→size→b）",
  gen("滴滴滴", ["color","size","b"]) === "<color=#e0b45e><size=100><b>滴滴滴</b></size></color>",
  gen("滴滴滴", ["color","size","b"]));

check("先选的样式在外层（color→b 时 color 在外）",
  gen("x", ["color","b"]) === "<color=#e0b45e><b>x</b></color>",
  gen("x", ["color","b"]));

check("顺序反过来时嵌套也跟着换（b→color 时 b 在外）",
  gen("x", ["b","color"]) === "<b><color=#e0b45e>x</color></b>",
  gen("x", ["b","color"]));

/* ---------- 2) 闭合完整性：开闭必须配对且顺序相反 ---------- */
const allKeys = Object.keys(PLAIN_TAGS).concat(ALL_OPTS.map(o => o.k));
const unclosed = [];
for (const k of allKeys){
  const code = gen("字", [k]);
  const open = code.slice(0, code.indexOf("字"));
  const close = code.slice(code.indexOf("字") + 1);
  if (SELF_CLOSING_KEYS.has(k)){
    if (close !== "") unclosed.push(k + " 不该有闭合标签，实际 " + JSON.stringify(close));
  } else {
    const want = closingFor(k);
    if (close !== want) unclosed.push(k + " 闭合错误: 期望 " + want + " 实际 " + JSON.stringify(close));
  }
}
check("每种样式的闭合标签都正确（" + allKeys.length + " 种）", unclosed.length === 0, unclosed.join(" | "));

/* ---------- 3) 标签必须能被解析器正确解析（生成 → 解析 往返） ---------- */
const order = ["color","size","b","i","u","cspace","rotate","voffset","indent","width","lineh","alpha","fw","mspace"];
const code = gen("测试文字", order);
const tree = parseTree(code, { enabled:false });
let text = "";
(function walk(n){ if(n.tag==="#text") text += n.text; (n.kids||[]).forEach(walk); })(tree);
check("往返后正文不变", text === "测试文字", JSON.stringify(text));
check("往返后是单行", linesOf(tree).length === 1, "行数=" + linesOf(tree).length);

/* ---------- 4) 转义：防止用户输入被当成标签 ---------- */
/* 注意：&lt; 是引擎要显示的"字面文本"，解析回来当然还是 &lt; 本身；关键是别再被当成标签 */
check("尖括号被转义", safeText("<b>假加粗</b>") === "&lt;b&gt;假加粗&lt;/b&gt;", safeText("<b>假加粗</b>"));
check("& 被转义", safeText("A&B") === "A&amp;B");
check("换行转 <br>", safeText("第一行\n第二行") === "第一行<br>第二行");
check("CRLF 归一化", safeText("a\r\nb") === "a<br>b");
const escTree = parseTree(gen("<坏标签>", ["b"]), { enabled:false });
check("尖括号不生成多余标签节点", nodesOf(escTree).map(n => n.tag).join(",") === "b",
  JSON.stringify(nodesOf(escTree).map(n => n.tag)));
let escText = ""; (function walk(n){ if(n.tag==="#text") escText += n.text; (n.kids||[]).forEach(walk); })(escTree);
check("转义后的字面文本送达渲染层", escText === "&lt;坏标签&gt;", JSON.stringify(escText));

/* ---------- 5) 空输入不产生垃圾代码 ---------- */
check("空文字返回空串", gen("", ["color","b"]) === "", JSON.stringify(gen("", ["color","b"])));
check("只选样式不输入文字也为空", compose("", ["color"], {color:true}, ST) === "");

/* ---------- 6) 参数真的进了标签 ---------- */
check("字号参数生效", gen("x", ["size"], {size:200}).includes("<size=200>"));
check("颜色参数生效", gen("x", ["color"], {color:"#ff0000"}).includes("<color=#ff0000>"));
check("8 位含透明度颜色生效", gen("x", ["color"], {color:"#ff000066"}).includes("<color=#ff000066>"));
check("字间距参数生效", gen("x", ["cspace"], {cspace:1.25}).includes("<cspace=1.25em>"));
check("行高参数生效", gen("x", ["lineh"], {lineh:200}).includes("<line-height=200%>"));
check("位移参数保留负号", gen("x", ["voffset"], {voffset:-0.5}).includes("<voffset=-0.5em>"));
check("旋转参数保留负号", gen("x", ["rotate"], {rotate:-30}).includes("<rotate=-30>"));
check("sprite 用引号包名字", gen("x", ["sprite"], {sprite:"smile"}).includes('<sprite name="smile">'));
check("link 用引号包 id", gen("x", ["link"], {link:"item_1001"}).includes('<link="item_1001">'));

/* ---------- 7) 元数据自洽 ---------- */
check("每个样式都有中文名", Object.keys(PLAIN_TAGS).concat(ALL_OPTS.map(o=>o.k)).every(k => !!LABEL[k]),
  Object.keys(PLAIN_TAGS).concat(ALL_OPTS.map(o=>o.k)).filter(k => !LABEL[k]).join(","));
check("大小写互斥同组", GROUPS.uppercase === "case" && GROUPS.lowercase === "case");
check("标签不允许重复出现两次", (() => {
  const seen = {};
  return ALL_OPTS.every(o => !seen[o.k] && (seen[o.k] = 1));
})());

/* ---------- 8) 重复键不会产生重复标签 ---------- */
check("同一 key 重复出现在 order 里只生成一次",
  compose("x", ["b","b"], {b:true}, ST) === "<b>x</b>",
  compose("x", ["b","b"], {b:true}, ST));

/* ---------- 9) 未勾选的样式不生成 ---------- */
check("on=false 的样式被跳过",
  compose("x", ["color","b"], {b:true}, ST) === "<b>x</b>",
  compose("x", ["color","b"], {b:true}, ST));

/* ---------- 10) 回归：已实测无效的标签不应出现在生成器里 ---------- */
/* <gradient> 需要客户端预设名；<mark> 在目标聊天里不生效。都从生成器移除。 */
const DEAD_KEYS = ["gradient", "mark"];
DEAD_KEYS.forEach(function(k){
  check("生成器不再提供 " + k, !(k in PLAIN_TAGS) && !(k in LABEL),
    "PLAIN_TAGS=" + (k in PLAIN_TAGS) + " LABEL=" + (k in LABEL));
});
check("生成器不会产出已失效的标签",
  DEAD_KEYS.every(function(k){ return gen("x", Object.keys(PLAIN_TAGS).concat(ALL_OPTS.map(o => o.k))).indexOf("<" + k) < 0; }),
  gen("x", Object.keys(PLAIN_TAGS).concat(ALL_OPTS.map(o => o.k))));

console.log("\n结果: " + pass + " 通过, " + fail + " 失败");
process.exit(fail ? 1 : 0);
