(function(root, factory){
  const api = factory();
  /* 浏览器里用 <script src> 直接跑，挂到全局；Node 里走 ESM export。
     这样 file:// 打开也能工作 —— file:// 下浏览器会拦截 ES module（CORS）。 */
  if(typeof module !== "undefined" && module.exports){ module.exports = api; }
  else { root.RTCompose = api; }
})(typeof globalThis !== "undefined" ? globalThis : this, function(){
"use strict";
/* =============================================================================
   生成器核心：把"文字 + 已选样式"拼装成富文本代码。
   纯函数、不碰 DOM，所以浏览器和 Node 自检脚本可以共用同一份实现。
   ============================================================================= */

/* 所有可用样式。tag(state) 返回该样式的开标签。
   文字样式目前只保留实测可用的 <b> / <i>；其余 TMP 标签（u/s/大小写/上下标/小型大写/nobr）
   已从生成器移除 —— 不是 TMP 不支持，而是目标游戏聊天里未验证，留着容易生成无效代码。 */
const TEXT_OPTS = [
  {k:"b", label:"加粗", tag:()=>`<b>`},
  {k:"i", label:"斜体", tag:()=>`<i>`}
];

const DECO_OPTS = [
  {k:"font",   label:"换字体",   tag:s=>`<font=${s.font}>`},
  {k:"fw",     label:"字重",     tag:s=>`<font-weight=${s.fw}>`},
  {k:"alpha",  label:"半透明",   tag:s=>`<alpha=${s.alpha}>`},
  {k:"mspace", label:"等宽",     tag:()=>`<mspace=1.5em>`},
  {k:"space",  label:"插入空白", tag:s=>`<space=${s.space}>`}
];

const PLAIN_TAGS = {
  color:    s => `<color=${s.color}>`,
  size:     s => `<size=${s.size}>`,
  cspace:   s => `<cspace=${s.cspace}em>`,
  lineh:    s => `<line-height=${s.lineh}%>`,
  rotate:   s => `<rotate=${s.rotate}>`,
  voffset:  s => `<voffset=${s.voffset}em>`,
  indent:   s => `<indent=${s.indent}%>`,
  width:    s => `<width=${s.width}%>`,
  sprite:   s => `<sprite name="${s.sprite}">`,
  link:     s => `<link="${s.link}">`
};

const ALL_OPTS = [...TEXT_OPTS, ...DECO_OPTS];

/* 这些标签没有闭合标签 */
const SELF_CLOSING_KEYS = new Set(["sprite", "space", "mspace"]);

/* 内部 key → 真实标签名。两者不一致时，闭合标签必须用真实标签名 */
const TAG_NAME = {
  fw: "font-weight",
  lineh: "line-height"
};
const tagNameOf = k => TAG_NAME[k] || k;

/* 某个样式对应的闭合标签（自闭和标签返回空串） */
function closingFor(k){
  return SELF_CLOSING_KEYS.has(k) ? "" : "</" + tagNameOf(k) + ">";
}

const LABEL = {
  color:"文字颜色", size:"字号", cspace:"字间距",
  lineh:"行高", rotate:"旋转", voffset:"上下位移", indent:"整段缩进", width:"文本宽度",
  sprite:"表情图标", link:"可点击链接"
};
ALL_OPTS.forEach(o => { LABEL[o.k] = o.label; });

const GROUPS = {};
ALL_OPTS.forEach(o => { if(o.group) GROUPS[o.k] = o.group; });

/* 取某个样式的开标签。state 里放着颜色、字号等具体取值。 */
function tagFor(k, state){
  const o = ALL_OPTS.find(x => x.k === k);
  if(o) return o.tag(state);
  return PLAIN_TAGS[k] ? PLAIN_TAGS[k](state) : "";
}

/* 正文转义：防止用户输入的 < > 被当成标签；换行转 <br> */
function safeText(raw){
  return String(raw)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/\r\n?/g, "\n").replace(/\n/g, "<br>");
}

/* 拼装代码：order 里靠前的样式在外层，所以开标签顺序拼接、闭合标签倒序。
   闭合标签只用标签名，不能带属性值（</color=#fff> 是错的）。*/
function compose(text, order, on, state){
  const body = safeText(text);
  if(!body) return "";
  const keys = [...new Set(order.filter(k => on[k]))];   // 去重：同一 key 只套一层
  const tags = keys.map(k => tagFor(k, state)).filter(Boolean);
  const open = tags.join("");                            // keys[0] 在最外层
  const close = keys.slice().reverse().map(closingFor).join("");
  return open + body + close;
}

/* -----------------------------------------------------------------------------
   分段生成：一条消息可以由多个"片段"拼成，每段有自己的颜色/字号/加粗/斜体。
   例：白色「好友给你赠送了」+ 红色「【千机神杯×100】」+ 青色「【点击领取】」

   seg  = { text, on:{color:true,...}, color:"#ffffff", size:"16" }
   base = 全局默认值（片段没单独设过的值就取 base）
   ----------------------------------------------------------------------------- */
const SEG_ORDER = ["size", "color", "b", "i"];   /* 固定嵌套顺序，输出稳定可预期 */

function segmentState(seg, base){
  const s = Object.assign({}, base);
  if(seg.color) s.color = seg.color;
  if(seg.size !== undefined && seg.size !== null && seg.size !== "") s.size = seg.size;
  return s;
}
function composeSegment(seg, base){
  const body = safeText(seg.text);
  if(!body) return "";
  const on = seg.on || {};
  const st = segmentState(seg, base);
  const keys = SEG_ORDER.filter(k => on[k]);
  const tags = keys.map(k => tagFor(k, st)).filter(Boolean);
  const open = tags.join("");
  const close = keys.slice().reverse().map(closingFor).join("");
  return open + body + close;
}
function composeSegments(segments, base){
  return (segments || []).map(seg => composeSegment(seg, base)).filter(Boolean).join("");
}

return {
  TEXT_OPTS, DECO_OPTS, PLAIN_TAGS, ALL_OPTS, LABEL, GROUPS,
  SELF_CLOSING_KEYS, TAG_NAME, tagNameOf, closingFor, tagFor, safeText, compose,
  SEG_ORDER, segmentState, composeSegment, composeSegments
};
});
