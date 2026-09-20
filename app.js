/* =============================================================================
   生成器页面逻辑（经典脚本，故意不用 ES module）
   原因：Chrome / Edge 在 file:// 下会以 CORS 为由拦截 ES module，
   双击打开 HTML 时 import 直接失败、整段脚本不执行。
   这里改成普通脚本 + window.RTLib / window.RTCompose 全局对象，file:// 可正常跑。
   ============================================================================= */
(function(){
"use strict";

var RTLib = window.RTLib, RTC = window.RTCompose;
if(!RTLib || !RTC){
  document.body.insertAdjacentHTML("afterbegin",
    '<div style="background:#ef6b6b;color:#fff;padding:12px 16px;border-radius:8px;margin:12px">'
    + '共享库没加载成功（lib.mjs / compose.mjs）。请确认这三个文件在同一目录下。</div>');
  return;
}

var parseTree = RTLib.parseTree, renderTree = RTLib.renderTree, applySizes = RTLib.applySizes;
var TEXT_OPTS = RTC.TEXT_OPTS, DECO_OPTS = RTC.DECO_OPTS, PLAIN_TAGS = RTC.PLAIN_TAGS;
var LABEL = RTC.LABEL, GROUPS = RTC.GROUPS, tagFor = RTC.tagFor, compose = RTC.compose;

var $ = function(id){ return document.getElementById(id); };

var COLORS = [
  ["#e0b45e","金"],["#ff5555","红"],["#ff9f43","橙"],["#ffcc00","黄"],
  ["#5ad19a","绿"],["#7ec3ff","蓝"],["#b48ef7","紫"],["#ff8ac4","粉"],
  ["#ffffff","白"],["#9aa2b8","灰"],["#000000","黑"],["#7a5c2e","暗金"]
];
var SIZES = [["50","很小"],["70","小"],["85","略小"],["100","标准"],["125","略大"],["150","大"],["200","很大"],["300","巨大"]];

var state = {
  order: [], on: {},
  font:"SimHei", fw:"800", alpha:"#80", space:"3em",
  color:"#e0b45e", size:100,
  cspace:0.5, lineh:150, rotate:15, voffset:0.5, indent:15, width:60,
  sprite:"smile", link:"item_1001"
};

/* ================= 生成 ================= */
function generate(){ return compose($("text").value, state.order, state.on, state); }

/* ================= 预览 ================= */
function escapeHtml(s){
  return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}
function renderPreview(code){
  var pane = $("preview"), rawEl = $("rawout");

  var re = /<(\/?)([A-Za-z_][\w-]*)((?:"[^"]*"|'[^']*'|[^>])*?)(\/?)>/g;
  var out = "", last = 0, m;
  while((m = re.exec(code))){
    out += escapeHtml(code.slice(last, m.index));
    out += '<span class="t-name">' + escapeHtml(m[0]) + "</span>";
    last = re.lastIndex;
  }
  out += escapeHtml(code.slice(last));
  rawEl.innerHTML = out || '<span style="color:#4d5468">（还没有输入文字）</span>';

  pane.innerHTML = "";
  if(!code){ pane.textContent = "（还没有输入文字）"; pane.style.color = "#5c6273"; return; }
  pane.style.color = "";
  var base = 16;
  pane.style.fontSize = base + "px";
  pane.appendChild(renderTree(parseTree(code, { enabled:false }), { base: base }));
  applySizes(pane, base);
  pane.querySelectorAll("[data-indent]").forEach(function(s){
    var line = s.closest ? s.closest(".msgline") : null;
    if(line) line.style.paddingLeft = s.dataset.indent;
  });
}

/* ================= 状态操作 ================= */
function add(k){
  if(state.on[k]) return remove(k);
  var g = GROUPS[k];
  if(g) state.order.filter(function(x){ return GROUPS[x] === g; }).forEach(remove);
  state.on[k] = true;
  state.order.push(k);
  sync(); update();
}
function remove(k){
  if(!state.on[k]) return;
  state.on[k] = false;
  state.order = state.order.filter(function(x){ return x !== k; });
  sync(); update();
}
function move(k, dir){
  var i = state.order.indexOf(k), j = i + dir;
  if(i < 0 || j < 0 || j >= state.order.length) return;
  var t = state.order[i]; state.order[i] = state.order[j]; state.order[j] = t;
  sync(); update();
}
function setOnly(keys){
  state.order = []; state.on = {};
  keys.forEach(function(k){ state.on[k] = true; state.order.push(k); });
  sync(); update();
}

/* ================= 构建控件 ================= */
function buildOptions(){
  TEXT_OPTS.forEach(function(o){
    var b = document.createElement("button");
    b.className = "opt"; b.textContent = o.label; b.dataset.k = o.k;
    b.onclick = function(){ add(o.k); };
    $("grp-text").appendChild(b);
  });
  DECO_OPTS.forEach(function(o){
    var b = document.createElement("button");
    b.className = "opt"; b.textContent = o.label; b.dataset.k = o.k;
    b.onclick = function(){ add(o.k); };
    $("grp-deco").appendChild(b);
  });
  SIZES.forEach(function(pair){
    var v = pair[0], label = pair[1];
    var b = document.createElement("button");
    b.className = "opt"; b.textContent = label + " " + v; b.dataset.size = v;
    b.onclick = function(){
      if(state.on.size && String(state.size) === v) return remove("size");
      state.size = Number(v);
      $("sizeRange").value = v; $("sizeNum").value = v;
      if(!state.on.size){ state.on.size = true; state.order.push("size"); }
      sync(); update();
    };
    $("grp-size").appendChild(b);
  });
  COLORS.forEach(function(pair){
    var hex = pair[0], name = pair[1];
    var b = document.createElement("button");
    b.className = "sw"; b.style.background = hex; b.title = name + " " + hex;
    b.dataset.hex = hex.toLowerCase();
    b.onclick = function(){
      state.color = hex; $("hexin").value = hex; $("colorpick").value = hex;
      if(!state.on.color){ state.on.color = true; state.order.push("color"); }
      sync(); update();
    };
    $("swatches").appendChild(b);
  });
  [["金色加粗", ["color","size","b"]],
   ["只有颜色", ["color"]],
   ["大字警告", ["size","color","b"]],
   ["小字注释", ["size","color"]],
   ["全部清空", []]].forEach(function(pair){
    var label = pair[0], keys = pair[1];
    var b = document.createElement("button");
    b.className = "btn tiny"; b.textContent = label;
    b.onclick = function(){
      if(keys.length === 0) return setOnly([]);
      if(keys.indexOf("size") >= 0){
        state.size = (label === "小字注释") ? 70 : (label === "大字警告" ? 200 : 100);
        $("sizeRange").value = Math.min(300, state.size); $("sizeNum").value = state.size;
      }
      if(keys.indexOf("color") >= 0){
        state.color = (label === "小字注释") ? "#9aa2b8" : "#e0b45e";
        $("hexin").value = state.color; $("colorpick").value = state.color;
      }
      setOnly(keys);
    };
    $("presets").appendChild(b);
  });
}

/* ================= 同步界面 ================= */
function sync(){
  Array.prototype.forEach.call(document.querySelectorAll(".opt[data-k]"), function(b){
    b.classList.toggle("on", !!state.on[b.dataset.k]);
  });
  Array.prototype.forEach.call(document.querySelectorAll("#grp-size .opt"), function(b){
    b.classList.toggle("on", !!state.on.size && String(state.size) === b.dataset.size);
  });
  Array.prototype.forEach.call(document.querySelectorAll(".sw"), function(b){
    b.classList.toggle("on", !!state.on.color && b.dataset.hex === String(state.color).toLowerCase());
  });
  [["chipCspace","cspace"],["chipLineh","lineh"],
   ["chipRotate","rotate"],["chipVoffset","voffset"],["chipIndent","indent"],["chipWidth","width"],
   ["chipSprite","sprite"],["chipLink","link"]].forEach(function(pair){
    $(pair[0]).classList.toggle("on", !!state.on[pair[1]]);
  });

  var picked = $("picked");
  picked.innerHTML = "";
  var active = state.order.filter(function(k){ return state.on[k]; });
  active.forEach(function(k, i){
    var el = document.createElement("span");
    el.className = "tagchip";
    var name = document.createElement("span");
    name.textContent = LABEL[k] || k;
    var cd = document.createElement("code");
    cd.textContent = tagFor(k, state);
    var up = document.createElement("button");
    up.className = "mv"; up.textContent = "◀"; up.title = "往外移（更外层）";
    up.disabled = (i === 0); up.onclick = function(){ move(k, -1); };
    var dn = document.createElement("button");
    dn.className = "mv"; dn.textContent = "▶"; dn.title = "往里移（更内层）";
    dn.disabled = (i === active.length - 1); dn.onclick = function(){ move(k, 1); };
    var x = document.createElement("button");
    x.className = "x"; x.textContent = "×"; x.title = "移除";
    x.onclick = function(){ remove(k); };
    el.appendChild(name); el.appendChild(cd); el.appendChild(up); el.appendChild(dn); el.appendChild(x);
    picked.appendChild(el);
  });

  var plain = $("text").value.replace(/\n/g, "");
  var cEl = $("counter");
  cEl.textContent = plain.length + " 字 · 整段代码 " + generate().length + " 字符";
  cEl.className = "counter" + (plain.length > 120 ? " over" : plain.length > 60 ? " warn" : "");
}

function update(){
  var code = generate();
  $("code").value = code;
  var plain = $("text").value.replace(/\n/g, "");
  $("taglen").textContent = code ? ("共 " + code.length + " 字符，其中标签占 " + (code.length - plain.length) + " 个") : "";
  renderPreview(code);
}

/* ================= 事件 ================= */
$("text").addEventListener("input", function(){ sync(); update(); });
$("btn-br").onclick = function(){ insertAtCursor("\n"); sync(); update(); };
$("btn-clear").onclick = function(){ $("text").value = ""; sync(); update(); $("text").focus(); };
$("btn-gen").onclick = function(){ update(); toast("代码已生成"); };

$("colorpick").oninput = function(e){
  state.color = e.target.value; $("hexin").value = e.target.value;
  if(!state.on.color){ state.on.color = true; state.order.push("color"); }
  sync(); update();
};
$("hexin").onchange = function(e){
  var v = e.target.value.trim();
  if(/^#?[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(v)){
    state.color = (v.charAt(0) === "#") ? v : ("#" + v);
    $("hexin").value = state.color; $("hexin").classList.remove("bad");
    if(state.color.length === 7) $("colorpick").value = state.color;
    if(!state.on.color){ state.on.color = true; state.order.push("color"); }
    sync(); update();
  }else{
    toast("颜色要写成 #RRGGBB 或 #RRGGBBAA", true);
    $("hexin").classList.add("bad");
    setTimeout(function(){ $("hexin").classList.remove("bad"); }, 1200);
    $("hexin").value = state.on.color ? state.color : "";
  }
};
$("sizeRange").oninput = function(e){
  state.size = Number(e.target.value); $("sizeNum").value = e.target.value;
  if(!state.on.size){ state.on.size = true; state.order.push("size"); }
  sync(); update();
};
$("sizeNum").onchange = function(e){
  var v = Math.max(10, Math.min(999, Number(e.target.value) || 100));
  state.size = v; e.target.value = v; $("sizeRange").value = Math.min(300, v);
  if(!state.on.size){ state.on.size = true; state.order.push("size"); }
  sync(); update();
};

function bindSlider(rangeId, valId, key, fmt, apply){
  $(rangeId).oninput = function(e){
    var v = Number(e.target.value);
    apply(v);
    $(valId).textContent = fmt(v);
    if(!state.on[key]){ state.on[key] = true; state.order.push(key); }
    sync(); update();
  };
}
bindSlider("cspaceRange","cspaceVal","cspace", function(v){ return v.toFixed(2) + "em"; }, function(v){ state.cspace = v; });
bindSlider("linehRange","linehVal","lineh", function(v){ return v + "%"; }, function(v){ state.lineh = v; });
bindSlider("rotateRange","rotateVal","rotate", function(v){ return v + "°"; }, function(v){ state.rotate = v; });
bindSlider("voffsetRange","voffsetVal","voffset", function(v){ return v.toFixed(1) + "em"; }, function(v){ state.voffset = v; });
bindSlider("indentRange","indentVal","indent", function(v){ return v + "%"; }, function(v){ state.indent = v; });
bindSlider("widthRange","widthVal","width", function(v){ return v + "%"; }, function(v){ state.width = v; });

$("chipCspace").onclick = function(){ add("cspace"); };
$("chipLineh").onclick = function(){ add("lineh"); };
$("chipSprite").onclick = function(){ add("sprite"); };
$("chipLink").onclick = function(){ add("link"); };
$("spriteName").onchange = function(e){ state.sprite = e.target.value.trim() || "smile"; sync(); update(); };
$("linkId").onchange = function(e){ state.link = e.target.value.trim() || "item_1001"; sync(); update(); };

$("btn-copy").onclick = function(){
  var code = generate();
  if(!code) return toast("还没有代码可复制", true);
  var done = function(ok){
    $("code").setAttribute("readonly", "readonly");
    toast(ok ? "已复制到剪贴板" : "复制失败，请手动全选复制", !ok);
  };
  if(navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(code).then(function(){ done(true); }, function(){ legacyCopy(code, done); });
  }else{
    legacyCopy(code, done);
  }
};
function legacyCopy(code, done){
  var el = $("code");
  el.removeAttribute("readonly");
  el.select();
  var ok = false;
  try{ ok = document.execCommand("copy"); }catch(e){ ok = false; }
  done(ok);
}

function insertAtCursor(t){
  var el = $("text");
  var s = el.selectionStart, e = el.selectionEnd;
  el.value = el.value.slice(0, s) + t + el.value.slice(e);
  el.selectionStart = el.selectionEnd = s + t.length;
  el.focus();
}
var toastTimer = 0;
function toast(msg, isErr){
  var t = $("toast");
  t.textContent = msg;
  t.className = "toast show" + (isErr ? " err" : "");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function(){ t.className = "toast" + (isErr ? " err" : ""); }, 1700);
}

/* ================= 启动 ================= */
buildOptions();
$("text").value = "滴滴滴";
state.on.color = state.on.size = state.on.b = true;
state.order = ["color", "size", "b"];
$("hexin").value = state.color;
$("sizeRange").value = 100; $("sizeNum").value = 100;
sync(); update();

/* 给自检脚本用 */
window.__composer = { compose: compose, tagFor: tagFor, PLAIN_TAGS: PLAIN_TAGS, state: state };
})();
