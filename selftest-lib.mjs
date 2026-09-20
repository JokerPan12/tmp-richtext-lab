// 解析/渲染层自检：加载同一份 UMD 库源码（与浏览器加载的完全一致）
import { loadLib, makeEl, makeDocument, withDom } from "./test-helpers.mjs";

const {
  TAGS, ALIAS, SELF_CLOSING, esc, attrs, av, len, normColor, resolveName,
  parseTree, linesOf, renderTree, applySizes, highlight
} = loadLib("lib.mjs");

/* 最小 DOM 桩：只为让 renderTree/applySizes 能跑起来，断言不依赖它 */
let pass = 0, fail = 0;
const check = (n, c, x) => { if (c) { pass++; console.log("PASS  " + n); } else { fail++; console.log("FAIL  " + n + (x ? "\n      " + x : "")); } };

const treeText = n => (n.tag === "#text" ? (n.text || "") : (n.kids || []).map(treeText).join(""));
const nodesOf = (n, out = []) => { if (n.tag && n.tag[0] !== "#") out.push(n); (n.kids || []).forEach(k => nodesOf(k, out)); return out; };
const parse = (s, wl) => parseTree(s, wl || { enabled:false });
const renderNoThrow = (s, wl) => withDom(makeDocument(), () => {
  const frag = renderTree(parseTree(s, wl || { enabled:false }), { base:16 });
  applySizes(frag, 16);
  return frag;
});

/* ---------- 属性与颜色 ---------- */
check("属性：name=v", av(attrs(" size=100"), "size") === "100");
check("属性：name=\"v\"", attrs(' name="smile"').name === "smile");
check("属性：省略属性名", av(attrs("=#e0b45e"), "color") === "#e0b45e");
check("属性：裸属性", attrs(" noparse").noparse === "");
check("颜色：#RRGGBB 原样", normColor("#e0b45e") === "#e0b45e");
check("颜色：#RRGGBBAA → rgba", normColor("#ffcc0066") === "rgba(255,204,0,0.400)", normColor("#ffcc0066"));
check("长度：百分比", len("15%") === "15%");
check("长度：裸数字按 px", len("30") === "30px");
check("别名 strike→s", resolveName("STRIKE") === "s");

/* ---------- 你给的那个例子 ---------- */
const t1 = parse("<size=100><color=#e0b45e><b>滴滴滴</b></color></size>");
check("原始例子文本完整", treeText(t1) === "滴滴滴");
check("原始例子标签栈 size→color→b", JSON.stringify(nodesOf(t1).map(n => n.tag)) === '["size","color","b"]');

/* ---------- 全部标签可达、不吞正文、渲染不崩 ---------- */
const ARG = { color:"=#ff0000", alpha:"=80", size:"=140", font:"=SimHei",
  "font-weight":"=800", sprite:' name="smile"', style:'="Title"', link:'="item_1"', align:"=center",
  indent:"=15%", "line-indent":"=2em", "line-height":"=180%", margin:"=2em", width:"=60%",
  voffset:"=0.5em", cspace:"=0.4em", mspace:"=1.5em", space:"=3em", pos:"=40%", rotate:"=20" };
const NO_NODE = ["br", "page", "noparse"];
const lost = [], crashed = [];
for (const name of Object.keys(TAGS)){
  const arg = ARG[name] || "";
  const self = SELF_CLOSING.has(name);
  const src = self ? "前<" + name + arg + ">后" : "前<" + name + arg + ">字</" + name + ">后";
  try {
    const t = treeText(parse(src));
    if (!t.includes("前") || !t.includes("后")) lost.push(name + "→" + JSON.stringify(t));
    if (!self && !t.includes("字")) lost.push(name + " 丢了内容 →" + JSON.stringify(t));
    if (!NO_NODE.includes(name) && !nodesOf(parse(src)).some(n => n.tag === name)) lost.push(name + " 没生成节点");
    renderNoThrow(src);
  } catch (e) { crashed.push(name + ": " + e.message); }
}
check("全部 " + Object.keys(TAGS).length + " 个标签可达且不吞正文", lost.length === 0, lost.join(" | "));
check("全部标签渲染不抛异常", crashed.length === 0, crashed.join(" | "));

/* ---------- 行切分与对齐 ---------- */
check("br 切出 2 行", linesOf(parse("A<br>B")).length === 2);
check("page 切出 2 行", linesOf(parse("上<page>下")).length === 2);
check("br 前的内联文本保留", treeText(parse("<b>前</b><br>后")) === "前后");
check("align=center 生效于该行", linesOf(parse("前<align=center>中</align>后"))[1].align === "center",
  JSON.stringify(linesOf(parse("前<align=center>中</align>后")).map(l => l.align)));

/* ---------- 边界输入 ---------- */
const bad = ["<b>粗<color=#fff>色", "<b><i>字</b></i>尾巴", "<foo>bar</foo>", "a < b 且 c > d", "<", "<size=", "纯文本", "<<转义"];
const badFail = [];
for (const s of bad){
  try {
    const t = treeText(parse(s));
    if (s === "<b><i>字</b></i>尾巴" && !t.includes("尾巴")) badFail.push("交叉闭合丢文本");
    if (s === "<foo>bar</foo>" && !t.includes("<foo>")) badFail.push("未知标签被吞");
    if (s === "纯文本" && t !== "纯文本") badFail.push("纯文本被改");
    renderNoThrow(s);
  } catch (e) { badFail.push(s + " → " + e.message); }
}
check("边界输入不崩、不吞文本", badFail.length === 0, badFail.join(" | "));

/* ---------- noparse ---------- */
check("noparse 内部保持原文", treeText(parse("<noparse><b>不变粗</b></noparse>")) === "<b>不变粗</b>",
  JSON.stringify(treeText(parse("<noparse><b>不变粗</b></noparse>"))));
check("noparse 外部标签仍生效", nodesOf(parse("<b>粗</b><noparse><i>x</i></noparse>")).some(n => n.tag === "b"));

/* ---------- 白名单 ---------- */
const wl = { enabled:true, set:new Set(["b","color"]) };
const t8 = parse('X<sprite name="a">Y<b>粗</b>', wl);
check("被过滤标签退回字面文本", treeText(t8).includes("<sprite"), JSON.stringify(treeText(t8)));
check("被过滤标签不生成节点", !nodesOf(t8).some(n => n.tag === "sprite"));
check("被放行标签正常成节点", nodesOf(t8).some(n => n.tag === "b"));

/* ---------- 高亮 ---------- */
const hl = highlight("<color=#fff>字</color>", { enabled:true, set:new Set(["color"]) });
check("高亮把标签名包成 span", hl.includes('class="t-name"') && hl.includes("t-name"));
check("高亮转义用户内容", highlight("<foo>", { enabled:false, set:new Set() }).includes("t-bad"), highlight("<foo>", { enabled:false, set:new Set() }));

console.log("\n结果: " + pass + " 通过, " + fail + " 失败");
process.exit(fail ? 1 : 0);
