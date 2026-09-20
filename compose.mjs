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

/* 所有可用样式。tag(state) 返回该样式的开标签。 */
const TEXT_OPTS = [
  {k:"b",         label:"加粗",     tag:()=>`<b>`},
  {k:"i",         label:"斜体",     tag:()=>`<i>`},
  {k:"u",         label:"下划线",   tag:()=>`<u>`},
  {k:"s",         label:"删除线",   tag:()=>`<s>`},
  {k:"uppercase", label:"全部大写", group:"case", tag:()=>`<uppercase>`},
  {k:"lowercase", label:"全部小写", group:"case", tag:()=>`<lowercase>`},
  {k:"sub",       label:"下标",     tag:()=>`<sub>`},
  {k:"sup",       label:"上标",     tag:()=>`<sup>`},
  {k:"smallcaps", label:"小型大写", tag:()=>`<smallcaps>`},
  {k:"nobr",      label:"禁止换行", tag:()=>`<nobr>`}
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

return {
  TEXT_OPTS, DECO_OPTS, PLAIN_TAGS, ALL_OPTS, LABEL, GROUPS,
  SELF_CLOSING_KEYS, TAG_NAME, tagNameOf, closingFor, tagFor, safeText, compose
};
});
