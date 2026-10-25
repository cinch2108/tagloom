/* Tagloom: SEO & webmaster tools. Everything runs locally; nothing is uploaded. */
(() => {
"use strict";
const $ = (s, r = document) => r.querySelector(s);
const BASE = (document.body && document.body.dataset.base) || ""; // sub-folder prefix, set by build.js
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = String(text); return e; };
const store = { get(k) { try { return JSON.parse(localStorage.getItem("tagloom:" + k)); } catch { return null; } }, set(k, v) { try { localStorage.setItem("tagloom:" + k, JSON.stringify(v)); } catch { /* storage off */ } } };
const PAGES = window.TL_PAGES || [];
const fmt = n => Number(n).toLocaleString("en-US");
const clampN = (v, lo, hi, d) => { v = Number(v); return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d; };
const today = () => new Date().toISOString().slice(0, 10);

/* ---------- UI helpers ---------- */
const toast = msg => { const t = $("#toast"); if (!t) return; t.textContent = msg; t.classList.add("on"); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove("on"), 1800); };
async function copy(text, what = "Copied") { try { await navigator.clipboard.writeText(text); } catch { const ta = el("textarea"); ta.value = text; document.body.append(ta); ta.select(); try { document.execCommand("copy"); } catch { /* ignore */ } ta.remove(); } toast(what + " ✓"); }
function download(blob, name) { const u = URL.createObjectURL(blob); const a = el("a"); a.href = u; a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 4000); }
function I(kind, attrs = {}) {
  const i = el(kind === "select" || kind === "textarea" ? kind : "input"); if (i.tagName === "INPUT") i.type = kind;
  for (const [k, v] of Object.entries(attrs)) { if (k === "options") v.forEach(o => { const op = el("option", null, Array.isArray(o) ? o[1] : o); op.value = Array.isArray(o) ? o[0] : o; i.append(op); }); else if (k === "value") i.value = v; else i.setAttribute(k, v); }
  if (i.tagName !== "SELECT" && !i.hasAttribute("maxlength") && !["color", "file", "checkbox", "range", "number", "date", "datetime-local"].includes(kind)) i.setAttribute("maxlength", kind === "textarea" ? "5000" : "300");
  if (i.tagName !== "SELECT" && kind !== "file" && kind !== "checkbox") { i.setAttribute("autocomplete", "off"); i.setAttribute("spellcheck", "false"); }
  return i;
}
function F(parent, label, input, cls = "") { const w = el("label", "field " + cls); w.append(el("span", "lab", label)); if (input.tagName === "TEXTAREA") w.append(input); else { const b = el("div", "inbox"); b.append(input); w.append(b); } parent.append(w); return input; }
function CK(parent, label, on) { const w = el("label", "field check"); const i = I("checkbox"); i.checked = !!on; w.append(i, el("span", null, label)); parent.append(w); return i; }
function seg(parent, items, cur, onPick) { const bar = el("div", "seg"); bar.setAttribute("role", "tablist"); items.forEach(([v, l]) => { const b = el("button", "segb" + (v === cur ? " on" : ""), l); b.type = "button"; b.dataset.v = v; b.setAttribute("role", "tab"); b.addEventListener("click", () => { bar.querySelectorAll(".segb").forEach(x => x.classList.toggle("on", x === b)); onPick(v); }); bar.append(b); }); parent.append(bar); return bar; }
function btn(parent, label, cls, fn) { const b = el("button", cls || "chip", label); b.type = "button"; b.addEventListener("click", fn); parent.append(b); return b; }
const sub = (parent, cls = "") => { const s = el("div", "subform " + cls); parent.append(s); return s; };
const H = (parent, text, tag = "h3") => { const h = el(tag, "oh", text); parent.append(h); return h; };
// code output box with copy + download
function codeBox(parent, title, fname, mime = "text/plain") {
  const w = el("div", "codebox"); const hd = el("div", "cbh"); const t = el("b", null, title); const tools = el("div", "row");
  const pre = el("pre", "code mono"); pre.tabIndex = 0;
  btn(tools, "Copy", "chip xs", () => copy(pre.textContent, title + " copied"));
  if (fname) btn(tools, "Download", "chip xs", () => download(new Blob([pre.textContent], { type: mime + ";charset=utf-8" }), typeof fname === "function" ? fname() : fname));
  hd.append(t, tools); w.append(hd, pre); parent.append(w);
  return { set(s) { pre.textContent = s; }, get: () => pre.textContent, el: w, title: t };
}
const msgList = parent => { const u = el("ul", "msgs"); parent.append(u); return { set(items) { u.textContent = ""; for (const [kind, text] of items) { const li = el("li", kind, text); u.append(li); } u.hidden = !items.length; } }; };
const attr = s => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const xml = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
const isAbsUrl = s => { try { const u = new URL(s); return u.protocol === "https:" || u.protocol === "http:"; } catch { return false; } };
const safeName = s => String(s).replace(/[^\w.\- ]+/g, "_").slice(0, 80);
// approximate text width with canvas (Google renders SERP titles in Arial)
const mctx = document.createElement("canvas").getContext("2d");
const textW = (s, font) => { mctx.font = font; return mctx.measureText(s).width; };
function fitWidth(s, font, max) { // Google-style: cut at a word boundary and add " ..."
  if (textW(s, font) <= max) return { text: s, cut: false };
  const words = s.split(/(\s+)/); let outS = "";
  for (const w of words) { if (textW((outS + w).trimEnd() + " ...", font) > max) break; outS += w; }
  if (!outS.trim()) { outS = ""; for (const ch of s) { if (textW(outS + ch + "...", font) > max) break; outS += ch; } return { text: outS + "...", cut: true }; }
  return { text: outS.trimEnd() + " ...", cut: true };
}
function fitLines(s, font, lineW, lines) { // wrap into N lines, truncate the last
  const words = s.split(/\s+/).filter(Boolean); const out = []; let cur = "";
  for (let i = 0; i < words.length; i++) {
    const w = words[i], t = cur ? cur + " " + w : w;
    if (textW(t, font) <= lineW) { cur = t; continue; }
    if (out.length === lines - 1) { const rest = words.slice(i).join(" "); return { text: [...out, fitWidth(cur + " " + rest, font, lineW).text].join(" "), cut: true }; }
    if (cur) out.push(cur); cur = w;
  }
  if (cur) out.push(cur);
  return { text: out.join(" "), cut: false };
}

/* ---------- file checks (magic bytes, size + megapixel caps) ---------- */
const MIME = { png: "image/png", jpg: "image/jpeg", gif: "image/gif", webp: "image/webp", svg: "image/svg+xml" };
function sniff(h) {
  if (h[0] === 0x89 && h[1] === 0x50 && h[2] === 0x4e && h[3] === 0x47) return "png";
  if (h[0] === 0xff && h[1] === 0xd8 && h[2] === 0xff) return "jpg";
  if (h[0] === 0x47 && h[1] === 0x49 && h[2] === 0x46 && h[3] === 0x38) return "gif";
  if (h[0] === 0x52 && h[1] === 0x49 && h[2] === 0x46 && h[3] === 0x46 && h[8] === 0x57 && h[9] === 0x45 && h[10] === 0x42 && h[11] === 0x50) return "webp";
  const head = new TextDecoder().decode(h).replace(/^\uFEFF/, "").trimStart().toLowerCase();
  if ((head.startsWith("<?xml") || head.startsWith("<svg") || head.startsWith("<!--")) && head.includes("<svg")) return "svg";
  return null;
}
async function loadImage(file, allowed, maxMB = 10) {
  if (!file) throw new Error("No file selected.");
  if (file.size > maxMB * 1024 * 1024) throw new Error(`That file is over ${maxMB} MB.`);
  const kind = sniff(new Uint8Array(await file.slice(0, 1024).arrayBuffer()));
  if (!kind || !allowed.includes(kind)) throw new Error("Unsupported file. Use " + allowed.map(x => x.toUpperCase()).join(", ") + ".");
  const url = URL.createObjectURL(new Blob([file], { type: MIME[kind] })); // SVG in <img> is sandboxed: scripts never run
  const img = new Image(); img.src = url;
  try { await img.decode(); } catch { URL.revokeObjectURL(url); throw new Error("Couldn't read that image."); }
  let w = img.naturalWidth, h = img.naturalHeight;
  if (kind === "svg" && (!w || !h)) { w = h = 512; }
  if (w * h > 40e6) { URL.revokeObjectURL(url); throw new Error("That image is too large (over 40 megapixels)."); }
  return { img, url, w, h, kind, size: file.size, name: safeName(file.name) };
}

/* ---------- ZIP writer (stored, CRC-32) ---------- */
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = b => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function zip(files) { // files: [{name, data: Uint8Array|string}]
  const enc = new TextEncoder(), parts = [], cen = []; let off = 0;
  const d = new Date(), dt = ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xffff, dd = (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xffff;
  for (const f of files) {
    const name = enc.encode(f.name), data = typeof f.data === "string" ? enc.encode(f.data) : f.data, crc = crc32(data);
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true); lh.setUint16(10, dt, true); lh.setUint16(12, dd, true);
    lh.setUint32(14, crc, true); lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true); lh.setUint16(26, name.length, true); lh.setUint16(28, 0, true);
    parts.push(new Uint8Array(lh.buffer), name, data);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(10, 0, true); ch.setUint16(12, dt, true); ch.setUint16(14, dd, true);
    ch.setUint32(16, crc, true); ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true); ch.setUint16(28, name.length, true); ch.setUint32(42, off, true);
    cen.push(new Uint8Array(ch.buffer), name); off += 30 + name.length + data.length;
  }
  const cenLen = cen.reduce((s, p) => s + p.length, 0), end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, cenLen, true); end.setUint32(16, off, true);
  return new Blob([...parts, ...cen, new Uint8Array(end.buffer)], { type: "application/zip" });
}

/* ================= META TAGS + SERP PREVIEW ================= */
const SERP = { desktop: { tFont: "20px Arial", tW: 600, tLines: 1, dFont: "14px Arial", dW: 920 }, mobile: { tFont: "20px Arial", tW: 330, tLines: 2, dFont: "14px Arial", dW: 680 } };
const HREF_RE = /^(x-default|[a-z]{2,3}(-[A-Za-z]{4})?(-([A-Za-z]{2}|\d{3}))?)$/;
function metaTags(v) {
  const L = [];
  if (v.charset) L.push('<meta charset="UTF-8">');
  if (v.viewport) L.push('<meta name="viewport" content="width=device-width, initial-scale=1">');
  if (v.title) L.push(`<title>${attr(v.title)}</title>`);
  if (v.desc) L.push(`<meta name="description" content="${attr(v.desc)}">`);
  if (v.canon) L.push(`<link rel="canonical" href="${attr(v.canon)}">`);
  const r = [v.index ? "index" : "noindex", v.follow ? "follow" : "nofollow"]; if (v.snip) r.push("max-snippet:-1", "max-image-preview:large", "max-video-preview:-1"); if (v.noarch) r.push("noarchive");
  if (!(v.index && v.follow && !v.snip && !v.noarch)) L.push(`<meta name="robots" content="${r.join(", ")}">`);
  for (const h of v.hreflang) L.push(`<link rel="alternate" hreflang="${attr(h[0])}" href="${attr(h[1])}">`);
  return L.join("\n");
}
function parseHreflang(text) {
  const ok = [], bad = [];
  text.split(/\r?\n/).map(s => s.trim()).filter(Boolean).slice(0, 200).forEach((line, i) => {
    const m = line.split(/[\s,|]+/); const code = m[0] || "", url = m[1] || "";
    if (!HREF_RE.test(code)) bad.push(`Line ${i + 1}: “${code.slice(0, 20)}” isn't a valid hreflang code (use e.g. en, en-US, es-419 or x-default).`);
    else if (!isAbsUrl(url)) bad.push(`Line ${i + 1}: hreflang URLs must be absolute (https://…).`);
    else ok.push([code, url]);
  });
  return { ok, bad };
}
function metaTool(form, out, p) {
  let dev = p.dev || "desktop";
  const v = { title: "Free Meta Tag Generator with Google SERP Preview | Tagloom", desc: "Write title tags and meta descriptions with a live Google preview for desktop and mobile, pixel-accurate length meters and copy-ready HTML.", canon: "https://example.com/meta-tag-generator/", site: "Example", index: true, follow: true, snip: false, noarch: false, viewport: true, charset: true, hreflang: [] };
  const tI = F(form, "Title tag", I("text", { maxlength: "200", value: v.title }), "wide");
  const dI = F(form, "Meta description", I("textarea", { maxlength: "500", rows: "3", value: v.desc }), "wide");
  const cI = F(form, "Canonical URL", I("url", { maxlength: "2000", value: v.canon, placeholder: "https://example.com/page/" }), "wide");
  const sI = F(form, "Site name (shown above the title)", I("text", { maxlength: "60", value: v.site }));
  const kI = F(form, "Keyword to highlight (bold)", I("text", { maxlength: "60", placeholder: "meta tag generator" }));
  const opt = sub(form, "opts");
  const idx = CK(opt, "Allow indexing (index)", true), fol = CK(opt, "Follow links (follow)", true), snip = CK(opt, "Large snippets & image previews", false), noar = CK(opt, "No cached copy (noarchive)", false), vp = CK(opt, "Mobile viewport tag", true), cs = CK(opt, "UTF-8 charset tag", true);
  const hI = F(form, "hreflang alternates (one per line: code URL)", I("textarea", { maxlength: "20000", rows: p.focus === "hreflang" ? "6" : "3", placeholder: "en https://example.com/\nes https://example.com/es/\nx-default https://example.com/" }), "wide");
  if (p.focus === "hreflang") { hI.value = "en-US https://example.com/\nen-GB https://example.com/uk/\nes https://example.com/es/\nx-default https://example.com/"; hI.closest(".field").classList.add("hl"); }
  // output
  seg(out, [["desktop", "🖥 Desktop"], ["mobile", "📱 Mobile"]], dev, d => { dev = d; draw(); });
  const prevWrap = el("div", "serpwrap"); out.append(prevWrap);
  const card = el("div", "serp"); prevWrap.append(card);
  const top = el("div", "s-top"), fav = el("span", "s-fav"), sw = el("div", "s-site"), sn = el("b"), su = el("small"); sw.append(sn, su); top.append(fav, sw);
  const st = el("div", "s-title"), sd = el("div", "s-desc"); card.append(top, st, sd);
  out.append(el("p", "hint", "Approximate preview. Google may rewrite titles and descriptions, and pixel widths vary slightly by font."));
  const meters = el("div", "meters"); out.append(meters);
  const meter = (label) => { const w = el("div", "mrow"); const top = el("div", "mtop"); const l = el("span", null, label), n = el("b"); top.append(l, n); const bar = el("div", "meter"); const i = el("i"); bar.append(i); w.append(top, bar); meters.append(w); return { set(px, max, chars, lo) { const pct = Math.min(100, px / max * 100); i.style.width = pct + "%"; bar.className = "meter " + (px > max ? "l1" : px < lo ? "l2" : "l3"); n.textContent = `${chars} chars · ${Math.round(px)} / ${max} px`; } }; };
  const mT = meter("Title width"), mD = meter("Description width");
  const msgs = msgList(out);
  const code = codeBox(out, "HTML tags", "meta-tags.html", "text/html");
  const hl = (node, text, kw) => { node.textContent = ""; if (!kw) { node.textContent = text; return; } const lo = text.toLowerCase(), k = kw.toLowerCase(); let i = 0, j; while ((j = lo.indexOf(k, i)) !== -1) { node.append(text.slice(i, j), el("b", null, text.slice(j, j + k.length))); i = j + k.length; } node.append(text.slice(i)); };
  function draw() {
    Object.assign(v, { title: tI.value.replace(/\s+/g, " ").trim(), desc: dI.value.replace(/\s+/g, " ").trim(), canon: cI.value.trim(), site: sI.value.trim(), index: idx.checked, follow: fol.checked, snip: snip.checked, noarch: noar.checked, viewport: vp.checked, charset: cs.checked });
    const hp = parseHreflang(hI.value); v.hreflang = hp.ok;
    const S = SERP[dev]; card.classList.toggle("mob", dev === "mobile");
    let host = "example.com", path = ""; try { const u = new URL(v.canon); host = u.hostname; path = u.pathname.split("/").filter(Boolean).map(decodeURIComponent).join(" › "); } catch { /* keep default */ }
    fav.textContent = (v.site || host).charAt(0).toUpperCase(); sn.textContent = v.site || host; su.textContent = "https://" + host + (path ? " › " + path : "");
    const T = S.tLines > 1 ? fitLines(v.title || "Untitled page", S.tFont, S.tW, S.tLines) : fitWidth(v.title || "Untitled page", S.tFont, S.tW);
    const D = fitWidth(v.desc || "No meta description. Google will pick text from the page.", S.dFont, S.dW);
    st.textContent = T.text; hl(sd, D.text, kI.value.trim());
    const tw = textW(v.title, S.tFont), dw = textW(v.desc, S.dFont);
    mT.set(tw, S.tW * S.tLines, [...v.title].length, S.tW * S.tLines * 0.5); mD.set(dw, S.dW, [...v.desc].length, S.dW * 0.5);
    const M = [];
    if (!v.title) M.push(["err", "Add a title tag. It's the biggest on-page ranking signal and the blue link in results."]);
    else if (T.cut) M.push(["warn", `The title is ${Math.round(tw - S.tW * S.tLines)} px too wide for ${dev} results and will be cut off.`]);
    else if (tw < S.tW * S.tLines * 0.5) M.push(["warn", "The title is short. Add your main keyword and brand to use the space."]);
    if (!v.desc) M.push(["warn", "No meta description. Google will choose a snippet from your page."]);
    else if (D.cut) M.push(["warn", `The description is ${Math.round(dw - S.dW)} px too wide for ${dev} and will be truncated.`]);
    if (v.canon && !isAbsUrl(v.canon)) M.push(["err", "The canonical URL must be absolute, starting with https://."]);
    if (!v.index) M.push(["warn", "noindex is set: this page won't appear in search results."]);
    hp.bad.slice(0, 5).forEach(b => M.push(["err", b]));
    if (hp.ok.length && !hp.ok.some(h => h[0] === "x-default")) M.push(["hint", "Tip: add an x-default line for visitors whose language you don't target."]);
    if (!M.length) M.push(["ok", "✓ Title and description fit, and every tag is valid."]);
    msgs.set(M); code.set(metaTags(v)); fitCard();
  }
  // shrink the fixed-width preview to fit narrow panels (CSSOM styles are CSP-safe)
  function fitCard() { const full = dev === "mobile" ? 360 : 652, avail = prevWrap.clientWidth - 2, k = avail > 0 && avail < full ? avail / full : 1; card.style.transform = k < 1 ? `scale(${k})` : ""; prevWrap.style.height = k < 1 ? Math.ceil(card.offsetHeight * k) + 2 + "px" : ""; }
  if (window.ResizeObserver) new ResizeObserver(() => fitCard()).observe(prevWrap);
  [tI, dI, cI, sI, kI, hI, idx, fol, snip, noar, vp, cs].forEach(i => i.addEventListener("input", draw));
  if (p.focus === "desc") dI.closest(".field").classList.add("hl");
  draw();
}

/* ================= OPEN GRAPH / TWITTER CARDS ================= */
const NETS = [["fb", "Facebook-style"], ["x", "X-style"], ["li", "LinkedIn-style"], ["slack", "Slack-style"], ["discord", "Discord-style"]];
function ogTags(v) {
  const L = [`<meta property="og:type" content="${attr(v.type)}">`, `<meta property="og:title" content="${attr(v.title)}">`];
  if (v.desc) L.push(`<meta property="og:description" content="${attr(v.desc)}">`);
  if (v.url) L.push(`<meta property="og:url" content="${attr(v.url)}">`);
  if (v.site) L.push(`<meta property="og:site_name" content="${attr(v.site)}">`);
  if (v.locale) L.push(`<meta property="og:locale" content="${attr(v.locale)}">`);
  if (v.image) { L.push(`<meta property="og:image" content="${attr(v.image)}">`); if (v.iw && v.ih) L.push(`<meta property="og:image:width" content="${v.iw}">`, `<meta property="og:image:height" content="${v.ih}">`); if (v.alt) L.push(`<meta property="og:image:alt" content="${attr(v.alt)}">`); }
  L.push("", `<meta name="twitter:card" content="${v.card}">`, `<meta name="twitter:title" content="${attr(v.title)}">`);
  if (v.desc) L.push(`<meta name="twitter:description" content="${attr(v.desc)}">`);
  if (v.image) { L.push(`<meta name="twitter:image" content="${attr(v.image)}">`); if (v.alt) L.push(`<meta name="twitter:image:alt" content="${attr(v.alt)}">`); }
  if (v.tsite) L.push(`<meta name="twitter:site" content="${attr(v.tsite)}">`);
  if (v.tcreator) L.push(`<meta name="twitter:creator" content="${attr(v.tcreator)}">`);
  return L.join("\n");
}
function ogTool(form, out, p) {
  let net = p.net || "all", pic = null;
  const tI = F(form, "Title (og:title)", I("text", { maxlength: "200", value: "Tagloom: free SEO & webmaster tools" }), "wide");
  const dI = F(form, "Description", I("textarea", { maxlength: "500", rows: "3", value: "Meta tags, social cards, robots.txt, sitemaps, favicons, redirects and schema, all in your browser." }), "wide");
  const uI = F(form, "Page URL", I("url", { maxlength: "2000", value: "https://example.com/" }), "wide");
  const imI = F(form, "Image URL (og:image, absolute)", I("url", { maxlength: "2000", value: "https://example.com/og.png" }), "wide");
  const altI = F(form, "Image alt text", I("text", { maxlength: "300", value: "Tagloom logo and tool list" }), "wide");
  const sI = F(form, "Site name", I("text", { maxlength: "80", value: "Tagloom" }));
  const tyI = F(form, "og:type", I("select", { options: ["website", "article", "product", "profile", "video.other", "book"] }));
  const lcI = F(form, "Locale", I("text", { maxlength: "10", value: "en_US" }));
  const cdI = F(form, "Twitter card", I("select", { options: [["summary_large_image", "Large image"], ["summary", "Summary (small image)"]] }));
  const tsI = F(form, "twitter:site (@handle)", I("text", { maxlength: "16", placeholder: "@yourbrand" }));
  const tcI = F(form, "twitter:creator", I("text", { maxlength: "16", placeholder: "@author" }));
  if (p.net === "x") cdI.closest(".field").classList.add("hl");
  const fbox = el("div", "field wide"); form.append(fbox);
  fbox.append(el("span", "lab", "Preview image from your computer (PNG, JPEG, GIF or WebP, up to 10 MB). It stays on your device."));
  const frow = el("div", "row"); fbox.append(frow);
  const fileI = I("file", { accept: "image/png,image/jpeg,image/gif,image/webp", "aria-label": "Preview image" }); fileI.className = "file";
  const fname = el("span", "fname", "No image chosen: a placeholder is shown"); frow.append(fileI, fname);
  // output
  seg(out, [["all", "All"], ...NETS.map(([k, l]) => [k, l.replace("-style", "")])], net, n => { net = n; draw(); });
  out.append(el("p", "hint", "Approximate previews in a generic style. They are not the platforms' real interfaces, and each network crops and caches images in its own way."));
  const cards = el("div", "cards"); out.append(cards);
  const imgNote = el("p", "meta"); out.append(imgNote);
  const msgs = msgList(out);
  const code = codeBox(out, "Open Graph & Twitter tags", "social-tags.html", "text/html");
  const host = u => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return "example.com"; } };
  const thumb = (cls) => { const d = el("div", "ogimg " + cls); if (pic) { const i = el("img"); i.src = pic.url; i.alt = ""; d.append(i); } else d.append(el("span", null, "1200 × 630")); return d; };
  const clip = (s, n) => [...s].length > n ? [...s].slice(0, n - 1).join("").trimEnd() + "…" : s;
  function card(k, v) {
    const c = el("figure", "ogcard oc-" + k); const cap = el("figcaption", "oclab", NETS.find(n => n[0] === k)[1] + " (approximate)"); c.append(cap);
    const small = v.card === "summary";
    if (k === "fb") { c.append(thumb("wide")); const b = el("div", "ocb"); b.append(el("small", "up", host(v.url)), el("b", null, clip(v.title, 88)), el("p", null, clip(v.desc, 110))); c.append(b); }
    if (k === "x") { const inner = el("div", "ocx" + (small ? " sm" : "")); inner.append(thumb(small ? "sq" : "wide")); const b = el("div", "ocb"); b.append(el("small", null, host(v.url)), el("b", null, clip(v.title, 70)), small ? el("p", null, clip(v.desc, 120)) : el("span")); inner.append(b); c.append(inner); }
    if (k === "li") { c.append(thumb("wide")); const b = el("div", "ocb"); b.append(el("b", null, clip(v.title, 100)), el("small", null, host(v.url))); c.append(b); }
    if (k === "slack" || k === "discord") { const b = el("div", "ocq " + k); b.append(el("small", "sn", v.site || host(v.url)), el("b", "lk", clip(v.title, 100)), el("p", null, clip(v.desc, k === "slack" ? 160 : 300))); b.append(thumb(small && k === "discord" ? "sq" : "wide")); c.append(b); }
    return c;
  }
  function draw() {
    const v = { title: tI.value.trim() || "Untitled", desc: dI.value.trim(), url: uI.value.trim(), image: imI.value.trim(), alt: altI.value.trim(), site: sI.value.trim(), type: tyI.value, locale: lcI.value.trim(), card: cdI.value, tsite: tsI.value.trim(), tcreator: tcI.value.trim(), iw: pic && pic.w, ih: pic && pic.h };
    cards.textContent = ""; (net === "all" ? NETS.map(n => n[0]) : [net]).forEach(k => cards.append(card(k, v)));
    const M = [];
    if (!v.image) M.push(["warn", "Add an og:image. Links without images get far fewer clicks."]); else if (!isAbsUrl(v.image)) M.push(["err", "og:image must be an absolute URL (https://…). Relative paths don't work."]);
    if (v.url && !isAbsUrl(v.url)) M.push(["err", "og:url must be an absolute URL."]);
    if ([...v.title].length > 95) M.push(["warn", "Titles longer than about 60–90 characters get cut off on most networks."]);
    if ([...v.desc].length > 200) M.push(["warn", "Descriptions over 200 characters are usually truncated."]);
    for (const h of [v.tsite, v.tcreator]) if (h && !/^@\w{1,15}$/.test(h)) M.push(["err", `“${h}” isn't a valid @handle (letters, digits and _ only, up to 15).`]);
    if (pic) {
      const r = pic.w / pic.h; imgNote.textContent = `Your image: ${pic.w} × ${pic.h} px, ${(pic.size / 1024).toFixed(0)} KB (${pic.kind.toUpperCase()}). Ratio ${r.toFixed(2)}:1.`;
      if (pic.w < 600 || pic.h < 315) M.push(["warn", "The image is small. Use at least 1200 × 630 px for sharp large cards."]);
      if (v.card === "summary_large_image" && Math.abs(r - 1.91) > 0.25) M.push(["warn", "Large cards are about 1.91:1 (1200 × 630). This image will be cropped."]);
      if (pic.size > 5 * 1024 * 1024) M.push(["warn", "Images over 5 MB are rejected by X and slow for others. Aim for under 1 MB."]);
    } else imgNote.textContent = "";
    if (!M.length) M.push(["ok", "✓ All tags look valid."]);
    msgs.set(M); code.set(ogTags(v));
  }
  fileI.addEventListener("change", async () => { const f = fileI.files[0]; if (pic) URL.revokeObjectURL(pic.url); pic = null; try { pic = await loadImage(f, ["png", "jpg", "gif", "webp"], 10); fname.textContent = pic.name; } catch (e) { fileI.value = ""; fname.textContent = "No image chosen"; toast(e.message); } draw(); });
  [tI, dI, uI, imI, altI, sI, tyI, lcI, cdI, tsI, tcI].forEach(i => i.addEventListener("input", draw));
  draw();
}

/* ================= ROBOTS.TXT ================= */
const AI_BOTS = ["GPTBot", "ChatGPT-User", "OAI-SearchBot", "CCBot", "Google-Extended", "ClaudeBot", "anthropic-ai", "PerplexityBot", "Bytespider", "Applebot-Extended", "meta-externalagent", "Amazonbot", "cohere-ai", "Diffbot"];
const ROBOT_PRESETS = {
  allow: { groups: [{ ua: "*", allow: "", dis: "", delay: "" }] },
  block: { groups: [{ ua: "*", allow: "", dis: "/", delay: "" }] },
  ai: { groups: [{ ua: "*", allow: "", dis: "", delay: "" }, { ua: AI_BOTS.join(", "), allow: "", dis: "/", delay: "" }] },
  wp: { groups: [{ ua: "*", allow: "/wp-admin/admin-ajax.php", dis: "/wp-admin/\n/?s=\n/search/", delay: "" }] },
  shop: { groups: [{ ua: "*", allow: "", dis: "/cart\n/checkout\n/account\n/*?sort=\n/*?filter=", delay: "" }] }
};
const cleanPath = s => s.replace(/[\r\n#]/g, "").trim().slice(0, 500);
function robotsText(groups, sitemaps, host) {
  const L = [];
  for (const g of groups) {
    const uas = g.ua.split(/[,\n]/).map(s => s.replace(/[^\w*.\-/ ]/g, "").trim()).filter(Boolean); if (!uas.length) continue;
    if (L.length) L.push("");
    uas.forEach(u => L.push("User-agent: " + u));
    const al = g.allow.split(/\r?\n/).map(cleanPath).filter(Boolean), di = g.dis.split(/\r?\n/).map(cleanPath).filter(Boolean);
    al.forEach(x => L.push("Allow: " + x)); di.forEach(x => L.push("Disallow: " + x));
    if (!al.length && !di.length) L.push("Disallow:");
    const d = Number(g.delay); if (g.delay !== "" && Number.isFinite(d) && d > 0) L.push("Crawl-delay: " + Math.min(60, d));
  }
  const sm = sitemaps.split(/\r?\n/).map(cleanPath).filter(Boolean); if (sm.length) L.push("", ...sm.map(s => "Sitemap: " + s));
  if (host) L.push("", "# Host: " + cleanPath(host));
  return L.join("\n") + "\n";
}
// RFC 9309 / Google parsing and matching
function parseRobots(txt) {
  const groups = []; let cur = null, lastWasUA = false; const sitemaps = [];
  for (let raw of String(txt).slice(0, 500 * 1024).split(/\r\n|\r|\n/)) {
    const line = raw.replace(/#.*$/, "").trim(); if (!line) continue;
    const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/); if (!m) continue;
    const key = m[1].toLowerCase(), val = m[2].trim();
    if (key === "user-agent") { if (!cur || !lastWasUA) { cur = { uas: [], rules: [] }; groups.push(cur); } cur.uas.push(val.toLowerCase()); lastWasUA = true; continue; }
    lastWasUA = false;
    if (key === "sitemap") { sitemaps.push(val); continue; }
    if (!cur) continue;
    if (key === "allow" || key === "disallow") cur.rules.push({ allow: key === "allow", path: val });
    if (key === "crawl-delay") cur.delay = val;
  }
  return { groups, sitemaps };
}
function ruleRe(path) { // * = any chars, trailing $ = end of URL
  let p = path, end = false; if (p.endsWith("$")) { end = true; p = p.slice(0, -1); }
  return new RegExp("^" + p.split("*").map(s => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*") + (end ? "$" : ""));
}
const normPath = s => { s = String(s).trim(); try { if (/^https?:\/\//i.test(s)) { const u = new URL(s); s = u.pathname + u.search; } } catch { /* path */ } if (!s.startsWith("/")) s = "/" + s; return s.replace(/%[0-9a-f]{2}/gi, x => x.toUpperCase()); };
function robotsCheck(txt, agent, url) {
  const { groups } = parseRobots(txt), a = String(agent || "*").trim().toLowerCase().split("/")[0], path = normPath(url);
  if (path === "/robots.txt") return { allowed: true, rule: null, group: null, why: "robots.txt itself is always crawlable." };
  let best = null, bestLen = -1;
  for (const g of groups) for (const u of g.uas) { if (u !== "*" && a.startsWith(u) && u.length > bestLen) { best = u; bestLen = u.length; } }
  const chosen = best || (groups.some(g => g.uas.includes("*")) ? "*" : null);
  if (!chosen) return { allowed: true, rule: null, group: null, why: "No group applies to this crawler, so everything is allowed." };
  const rules = groups.filter(g => g.uas.includes(chosen)).flatMap(g => g.rules); // groups for the same agent are merged
  let win = null;
  for (const r of rules) {
    if (!r.path) continue; // empty Disallow matches nothing
    if (!ruleRe(normPath(r.path)).test(path)) continue;
    const len = r.path.length;
    if (!win || len > win.path.length || (len === win.path.length && r.allow && !win.allow)) win = r;
  }
  return { allowed: !win || win.allow, rule: win, group: chosen, why: win ? `Longest matching rule wins: “${win.allow ? "Allow" : "Disallow"}: ${win.path}” in the “User-agent: ${chosen}” group.` : `No rule in the “User-agent: ${chosen}” group matches, so it's allowed.` };
}
function robotsTool(form, out, p) {
  let tab = p.tab || "build"; const st = JSON.parse(JSON.stringify(ROBOT_PRESETS[p.preset || "wp"]));
  const tb = seg(form, [["build", "Build"], ["test", "Test a URL"]], tab, t => { tab = t; show(); }); tb.classList.add("wide");
  const bWrap = sub(form), tWrap = sub(form);
  // builder
  const pr = el("div", "field wide"); pr.append(el("span", "lab", "Presets")); const prow = el("div", "row"); pr.append(prow); bWrap.append(pr);
  [["allow", "Allow all"], ["block", "Block all"], ["ai", "Block AI crawlers"], ["wp", "WordPress"], ["shop", "Online store"]].forEach(([k, l]) => btn(prow, l, "chip", () => { st.groups = JSON.parse(JSON.stringify(ROBOT_PRESETS[k].groups)); renderGroups(); draw(); toast(l + " preset loaded"); }));
  const gbox = el("div", "groups wide"); bWrap.append(gbox);
  btn(bWrap, "+ Add user-agent group", "chip wide", () => { if (st.groups.length >= 20) return toast("Up to 20 groups."); st.groups.push({ ua: "Googlebot", allow: "", dis: "", delay: "" }); renderGroups(); draw(); });
  const smI = F(bWrap, "Sitemap URLs (one per line)", I("textarea", { rows: "2", maxlength: "5000", value: "https://example.com/sitemap.xml" }), "wide");
  function renderGroups() {
    gbox.textContent = "";
    st.groups.forEach((g, i) => {
      const c = el("div", "group"); const hd = el("div", "ghead"); hd.append(el("b", null, "Group " + (i + 1))); if (st.groups.length > 1) btn(hd, "Remove", "chip xs", () => { st.groups.splice(i, 1); renderGroups(); draw(); }); c.append(hd);
      const s = sub(c);
      const bind = (label, k, inp, cls) => { inp.value = g[k]; inp.addEventListener("input", () => { g[k] = inp.value; draw(); }); F(s, label, inp, cls); };
      bind("User-agent(s), comma separated", "ua", I("text", { maxlength: "1000" }), "wide");
      bind("Disallow paths (one per line)", "dis", I("textarea", { rows: "3", maxlength: "5000", placeholder: "/admin/\n/*.pdf$" }));
      bind("Allow paths (one per line)", "allow", I("textarea", { rows: "3", maxlength: "5000", placeholder: "/admin/public/" }));
      bind("Crawl-delay (seconds, optional)", "delay", I("number", { min: "0", max: "60", step: "1" }));
      gbox.append(c);
    });
  }
  // tester
  const srcI = F(tWrap, "robots.txt to test (filled from the builder; paste your own any time)", I("textarea", { rows: "9", maxlength: "512000" }), "wide mono");
  const uaI = F(tWrap, "Crawler user-agent", I("text", { maxlength: "100", value: "Googlebot", list: "uas" }));
  const dl = el("datalist"); dl.id = "uas"; ["Googlebot", "Googlebot-Image", "Googlebot-News", "Bingbot", "DuckDuckBot", "Applebot", ...AI_BOTS, "*"].forEach(x => { const o = el("option"); o.value = x; dl.append(o); }); tWrap.append(dl);
  const urlI = F(tWrap, "URL or path", I("text", { maxlength: "2000", value: "/wp-admin/admin-ajax.php" }));
  const multiI = F(tWrap, "Bulk test (one URL or path per line, optional)", I("textarea", { rows: "3", maxlength: "20000", placeholder: "/\n/wp-admin/\n/blog/post?s=1" }), "wide");
  let srcTouched = false; srcI.addEventListener("input", () => { srcTouched = true; test(); });
  btn(tWrap, "↺ Use the builder's robots.txt", "chip wide", () => { srcTouched = false; srcI.value = code.get(); test(); });
  // output
  const msgs = msgList(out);
  const verdict = el("div", "verdict big2"); const why = el("p", "meta"); const bulk = el("div", "bulk");
  const tOut = el("div"); tOut.append(verdict, why, bulk);
  const code = codeBox(out, "robots.txt", "robots.txt");
  out.append(tOut);
  function draw() {
    const txt = robotsText(st.groups, smI.value, ""); code.set(txt);
    const M = []; const pr = parseRobots(txt);
    if (pr.groups.some(g => g.uas.includes("*") && g.rules.some(r => !r.allow && r.path === "/"))) M.push(["warn", "“Disallow: /” for * blocks every search engine from your whole site."]);
    if (st.groups.some(g => g.delay)) M.push(["hint", "Googlebot ignores Crawl-delay. Bing and Yandex respect it."]);
    smI.value.split(/\r?\n/).map(s => s.trim()).filter(Boolean).forEach(s => { if (!isAbsUrl(s)) M.push(["err", `Sitemap lines need a full URL: “${s.slice(0, 60)}”`]); });
    if (st.groups.some(g => /(^|,)\s*(GPTBot|CCBot)/i.test(g.ua) && /^\/$/m.test(g.dis))) M.push(["ok", "✓ AI training crawlers are blocked. Search engines can still crawl."]);
    if (!M.length) M.push(["ok", "✓ Valid robots.txt. Upload it to the root of your site: /robots.txt"]);
    msgs.set(M); if (!srcTouched) srcI.value = txt; test();
  }
  function test() {
    const r = robotsCheck(srcI.value, uaI.value, urlI.value || "/");
    verdict.className = "verdict big2 " + (r.allowed ? "ok" : "no"); verdict.textContent = (r.allowed ? "✓ Allowed" : "✗ Blocked") + ` for ${uaI.value.trim() || "*"}: ${normPath(urlI.value || "/")}`; why.textContent = r.why;
    bulk.textContent = ""; const lines = multiI.value.split(/\r?\n/).map(s => s.trim()).filter(Boolean).slice(0, 500);
    if (lines.length) { const t = el("table", "tbl2"); const tr = el("tr"); ["URL", "Result", "Rule"].forEach(h => tr.append(el("th", null, h))); t.append(tr); for (const u of lines) { const x = robotsCheck(srcI.value, uaI.value, u), row = el("tr"); row.append(el("td", "mono", normPath(u)), el("td", x.allowed ? "okc" : "noc", x.allowed ? "Allowed" : "Blocked"), el("td", "mono", x.rule ? (x.rule.allow ? "Allow: " : "Disallow: ") + x.rule.path : "-")); t.append(row); } bulk.append(t); }
  }
  function show() { bWrap.hidden = tab !== "build"; tWrap.hidden = tab !== "test"; code.el.hidden = tab !== "build"; if (tab === "build") draw(); else msgs.set([]); tOut.hidden = tab !== "test"; }
  [uaI, urlI, multiI].forEach(i => i.addEventListener("input", test)); smI.addEventListener("input", draw);
  renderGroups(); draw(); show();
}

/* ================= SITEMAP.XML ================= */
const SM_MAX = 50000, SM_BYTES = 50 * 1024 * 1024 - 2048, SM_CAP = 500000;
function buildSitemaps(lines, o) {
  const seen = new Set(), urls = [], errors = [], dupes = []; let host = null, otherHost = 0;
  for (let i = 0; i < lines.length; i++) {
    let s = lines[i].trim(); if (!s || s.startsWith("#")) continue;
    if (urls.length + errors.length >= SM_CAP) { errors.push([i + 1, `Stopped at ${fmt(SM_CAP)} URLs.`]); break; }
    if (o.base && s.startsWith("/")) { try { s = new URL(s, o.base).href; } catch { /* fall through */ } }
    let u; try { u = new URL(s); } catch { errors.push([i + 1, "Not a valid absolute URL"]); continue; }
    if (u.protocol !== "https:" && u.protocol !== "http:") { errors.push([i + 1, "Only http and https URLs are allowed"]); continue; }
    u.hash = ""; const href = u.href;
    if (href.length > 2048) { errors.push([i + 1, "Longer than 2,048 characters"]); continue; }
    if (seen.has(href)) { dupes.push(href); continue; } seen.add(href);
    if (!host) host = u.host; else if (u.host !== host) otherHost++;
    urls.push(href);
  }
  const depth = h => new URL(h).pathname.split("/").filter(Boolean).length;
  const pri = h => o.pri === "auto" ? Math.max(0.1, 1 - depth(h) * 0.2).toFixed(1) : o.pri;
  const head = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n', tail = "</urlset>\n";
  const files = []; let cur = [], bytes = head.length + tail.length;
  const enc = new TextEncoder();
  const flush = () => { if (cur.length) files.push(head + cur.join("") + tail); cur = []; bytes = head.length + tail.length; };
  for (const h of urls) {
    let e = `  <url>\n    <loc>${xml(h)}</loc>\n`;
    if (o.lastmod) e += `    <lastmod>${o.lastmod}</lastmod>\n`;
    if (o.freq) e += `    <changefreq>${o.freq}</changefreq>\n`;
    if (o.pri) e += `    <priority>${pri(h)}</priority>\n`;
    e += "  </url>\n"; const b = enc.encode(e).length;
    if (cur.length >= SM_MAX || bytes + b > SM_BYTES) flush();
    cur.push(e); bytes += b;
  }
  flush();
  let index = null;
  if (files.length > 1) {
    const base = (o.indexBase || (urls[0] ? new URL(urls[0]).origin + "/" : "https://example.com/")).replace(/\/?$/, "/");
    index = '<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + files.map((_, i) => `  <sitemap>\n    <loc>${xml(base + `sitemap-${i + 1}.xml`)}</loc>\n${o.lastmod ? `    <lastmod>${o.lastmod}</lastmod>\n` : ""}  </sitemap>\n`).join("") + "</sitemapindex>\n";
  }
  return { files, index, urls: urls.length, errors, dupes, otherHost };
}
function sitemapTool(form, out, p) {
  const demo = ["https://example.com/", "https://example.com/about/", "https://example.com/blog/", "https://example.com/blog/seo-tips?ref=a&b=1", "https://example.com/blog/", "/contact/"].join("\n");
  const lI = F(form, "URLs (one per line). Relative paths use the base URL below.", I("textarea", { rows: "10", maxlength: "30000000", value: demo }), "wide mono");
  const bI = F(form, "Base URL for relative paths", I("url", { maxlength: "300", value: "https://example.com" }));
  const lmS = F(form, "lastmod", I("select", { options: [["today", "Today"], ["custom", "Pick a date"], ["", "Leave out"]] }));
  const lmD = F(form, "lastmod date", I("date", { value: today() }));
  const fq = F(form, "changefreq", I("select", { options: [["", "Leave out (recommended)"], "always", "hourly", "daily", "weekly", "monthly", "yearly", "never"] }));
  const pr = F(form, "priority", I("select", { options: [["", "Leave out (recommended)"], ["auto", "Auto by URL depth"], "1.0", "0.9", "0.8", "0.7", "0.6", "0.5", "0.4", "0.3", "0.2", "0.1"] }));
  const fileWrap = el("div", "field wide"); form.append(fileWrap); fileWrap.append(el("span", "lab", "…or load a .txt / .csv list of URLs (up to 30 MB, read locally)"));
  const fI = I("file", { accept: ".txt,.csv,text/plain,text/csv", "aria-label": "URL list file" }); fI.className = "file"; fileWrap.append(fI);
  btn(form, "Generate sitemap", "btn", () => draw());
  const stats = el("div", "stats"); out.append(stats);
  const msgs = msgList(out);
  const dlRow = el("div", "row"); out.append(dlRow);
  const code = codeBox(out, "sitemap.xml (preview)", null);
  let res = null;
  btn(dlRow, "⬇ Download", "btn", () => {
    if (!res || !res.files.length) return toast("Add some URLs first.");
    if (!res.index) download(new Blob([res.files[0]], { type: "application/xml" }), "sitemap.xml");
    else download(zip([{ name: "sitemap_index.xml", data: res.index }, ...res.files.map((f, i) => ({ name: `sitemap-${i + 1}.xml`, data: f }))]), "sitemaps.zip");
  });
  btn(dlRow, "Copy XML", "chip", () => res && res.files.length && copy(res.index || res.files[0], "XML copied"));
  const stat = (k, v) => { const d = el("div"); d.append(el("b", null, v), el("small", null, k)); stats.append(d); };
  function draw() {
    const lm = lmS.value === "today" ? today() : lmS.value === "custom" && /^\d{4}-\d{2}-\d{2}$/.test(lmD.value) ? lmD.value : "";
    lmD.closest(".field").hidden = lmS.value !== "custom";
    const base = isAbsUrl(bI.value.trim()) ? bI.value.trim() : "";
    res = buildSitemaps(lI.value.split(/\r?\n/), { base, lastmod: lm, freq: fq.value, pri: pr.value, indexBase: base });
    stats.textContent = ""; stat("valid URLs", fmt(res.urls)); stat("duplicates removed", fmt(res.dupes.length)); stat("invalid lines", fmt(res.errors.length)); stat(res.index ? "sitemap files + index" : "sitemap file", fmt(res.files.length));
    const M = [];
    res.errors.slice(0, 6).forEach(([n, e]) => M.push(["err", `Line ${n}: ${e}`])); if (res.errors.length > 6) M.push(["err", `…and ${fmt(res.errors.length - 6)} more invalid lines.`]);
    if (res.otherHost) M.push(["warn", `${fmt(res.otherHost)} URLs are on a different host than the first one. A sitemap should only list URLs from its own site.`]);
    if (res.index) M.push(["hint", `Over ${fmt(SM_MAX)} URLs: split into ${res.files.length} sitemaps with a sitemap index. Download gives a ZIP; upload all files to your site root and submit sitemap_index.xml.`]);
    if (!res.urls) M.push(["warn", "No valid URLs yet."]); else if (!res.errors.length) M.push(["ok", "✓ Valid sitemap XML following the sitemaps.org protocol."]);
    msgs.set(M);
    const show = res.index || res.files[0] || "";
    code.title.textContent = res.index ? "sitemap_index.xml (preview)" : "sitemap.xml (preview)";
    code.set(show.length > 60000 ? show.slice(0, 60000) + "\n<!-- preview truncated: download for the full file -->" : show);
  }
  fI.addEventListener("change", async () => { const f = fI.files[0]; if (!f) return; if (f.size > 30 * 1024 * 1024) { fI.value = ""; return toast("Files up to 30 MB."); } const head = new Uint8Array(await f.slice(0, 512).arrayBuffer()); if (head.some(b => b === 0)) { fI.value = ""; return toast("That isn't a text file."); } lI.value = (await f.text()).slice(0, 30000000); draw(); });
  let t; [lI, bI, lmS, lmD, fq, pr].forEach(i => i.addEventListener("input", () => { clearTimeout(t); t = setTimeout(draw, lI.value.length > 200000 ? 600 : 120); }));
  draw();
}

/* ================= FAVICON GENERATOR ================= */
function icoFromCanvases(cs) { // real ICO: 32-bit BMP (DIB) entries with alpha + AND mask
  const imgs = cs.map(c => {
    const w = c.width, h = c.height, px = c.getContext("2d").getImageData(0, 0, w, h).data;
    const maskRow = Math.ceil(w / 32) * 4, size = 40 + w * h * 4 + maskRow * h, b = new DataView(new ArrayBuffer(size));
    b.setUint32(0, 40, true); b.setInt32(4, w, true); b.setInt32(8, h * 2, true); b.setUint16(12, 1, true); b.setUint16(14, 32, true); b.setUint32(16, 0, true); b.setUint32(20, w * h * 4 + maskRow * h, true);
    let o = 40;
    for (let y = h - 1; y >= 0; y--) for (let x = 0; x < w; x++) { const i = (y * w + x) * 4; b.setUint8(o++, px[i + 2]); b.setUint8(o++, px[i + 1]); b.setUint8(o++, px[i]); b.setUint8(o++, px[i + 3]); }
    for (let y = h - 1; y >= 0; y--) for (let x = 0; x < maskRow; x++) { let byte = 0; for (let bit = 0; bit < 8; bit++) { const xx = x * 8 + bit; if (xx < w && px[(y * w + xx) * 4 + 3] === 0) byte |= 0x80 >> bit; } b.setUint8(o++, byte); }
    return { w, h, data: new Uint8Array(b.buffer) };
  });
  const head = 6 + 16 * imgs.length, total = head + imgs.reduce((s, x) => s + x.data.length, 0), out = new Uint8Array(total), dv = new DataView(out.buffer);
  dv.setUint16(0, 0, true); dv.setUint16(2, 1, true); dv.setUint16(4, imgs.length, true);
  let off = head; imgs.forEach((im, i) => { const e = 6 + 16 * i; dv.setUint8(e, im.w >= 256 ? 0 : im.w); dv.setUint8(e + 1, im.h >= 256 ? 0 : im.h); dv.setUint8(e + 2, 0); dv.setUint8(e + 3, 0); dv.setUint16(e + 4, 1, true); dv.setUint16(e + 6, 32, true); dv.setUint32(e + 8, im.data.length, true); dv.setUint32(e + 12, off, true); out.set(im.data, off); off += im.data.length; });
  return out;
}
const toBlob = c => new Promise((res, rej) => c.toBlob(b => b ? res(b) : rej(new Error("PNG encode failed")), "image/png"));
function roundRect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
function demoSource() { const c = el("canvas"); c.width = c.height = 512; const x = c.getContext("2d"); const g = x.createLinearGradient(0, 0, 512, 512); g.addColorStop(0, "#fb923c"); g.addColorStop(1, "#8b5cf6"); x.fillStyle = g; x.beginPath(); x.arc(256, 256, 250, 0, Math.PI * 2); x.fill(); x.fillStyle = "#fff"; x.font = "bold 300px Arial, sans-serif"; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText("T", 256, 276); return { img: c, w: 512, h: 512, kind: "demo", name: "demo", size: 0 }; }
function renderIcon(src, S, o, mode = "") { // mode: "" | "apple" | "maskable"
  const c = el("canvas"); c.width = c.height = S; const x = c.getContext("2d"); x.imageSmoothingEnabled = true; x.imageSmoothingQuality = "high";
  const solid = mode || !o.transparent, bg = o.transparent ? "#ffffff" : o.bg;
  const r = mode ? 0 : Math.round(S * o.radius / 100);
  if (r > 0) { roundRect(x, 0, 0, S, S, r); x.clip(); }
  if (solid) { x.fillStyle = mode && o.transparent ? bg : o.bg; x.fillRect(0, 0, S, S); }
  const inner = mode === "maskable" ? S * Math.min(0.6, 1 - 2 * o.pad / 100) : S * (1 - 2 * o.pad / 100);
  const ox = (S - inner) / 2; x.save(); x.beginPath(); x.rect(ox, ox, inner, inner); x.clip();
  const sc = (o.fit === "cover" ? Math.max(inner / src.w, inner / src.h) : Math.min(inner / src.w, inner / src.h)) * o.zoom / 100;
  const dw = src.w * sc, dh = src.h * sc, dx = ox + (inner - dw) / 2 + o.dx / 100 * inner, dy = ox + (inner - dh) / 2 + o.dy / 100 * inner;
  x.drawImage(src.img, dx, dy, dw, dh); x.restore();
  return c;
}
const FAV_PNG = [["favicon-16x16.png", 16], ["favicon-32x32.png", 32], ["apple-touch-icon.png", 180, "apple"], ["android-chrome-192x192.png", 192], ["android-chrome-512x512.png", 512], ["maskable-icon-512x512.png", 512, "maskable"]];
function favManifest(o) { return JSON.stringify({ name: o.name, short_name: o.short, icons: [{ src: "/android-chrome-192x192.png", sizes: "192x192", type: "image/png" }, { src: "/android-chrome-512x512.png", sizes: "512x512", type: "image/png" }, { src: "/maskable-icon-512x512.png", sizes: "512x512", type: "image/png", purpose: "maskable" }], theme_color: o.theme, background_color: o.transparent ? "#ffffff" : o.bg, display: "standalone", start_url: "/" }, null, 2); }
const favHtml = o => `<link rel="icon" href="/favicon.ico" sizes="48x48">\n<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">\n<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png">\n<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">\n<link rel="manifest" href="/site.webmanifest">\n<meta name="theme-color" content="${o.theme}">`;
function faviconTool(form, out, p) {
  let src = demoSource(), fit = "contain";
  const drop = el("label", "drop"); drop.append(el("b", null, "⬆"), el("span", null, "Drop an image or click to choose"), el("small", "hint", "PNG, JPG, SVG or WebP · up to 10 MB · 40 MP · square, 512 px+ works best"));
  const fileI = I("file", { accept: "image/png,image/jpeg,image/svg+xml,image/webp,.svg", "aria-label": "Source image" }); fileI.className = "visually-hidden"; drop.append(fileI); form.append(drop);
  const fname = el("p", "fname wide", "Using a demo image until you choose one."); form.append(fname);
  const fs = seg(form, [["contain", "Fit (pad)"], ["cover", "Fill (crop to square)"]], fit, v => { fit = v; draw(); }); fs.classList.add("wide");
  const zI = F(form, "Zoom %", I("range", { min: "50", max: "200", value: "100" }));
  const pI = F(form, "Padding %", I("range", { min: "0", max: "30", value: "0" }));
  const xI = F(form, "Move left/right", I("range", { min: "-50", max: "50", value: "0" }));
  const yI = F(form, "Move up/down", I("range", { min: "-50", max: "50", value: "0" }));
  const rI = F(form, "Rounded corners %", I("range", { min: "0", max: "50", value: "0" }));
  const bgI = F(form, "Background color", I("color", { value: "#ffffff" }));
  const trI = CK(form, "Transparent background (apple-touch and maskable icons always get a solid one)", true);
  const nI = F(form, "App name (manifest)", I("text", { maxlength: "60", value: "My Website" }));
  const sI = F(form, "Short name", I("text", { maxlength: "20", value: "Website" }));
  const thI = F(form, "Theme color", I("color", { value: "#111827" }));
  if (p.focus === "apple") { trI.checked = false; pI.value = "10"; }
  if (p.focus === "manifest") nI.closest(".field").classList.add("hl");
  // output
  const prev = el("div", "favprev"); out.append(prev);
  const tabs = el("div", "tabmock"); const tab = el("div", "tabm"); const tIco = el("img"); tIco.alt = ""; tIco.width = 16; tIco.height = 16; tab.append(tIco, el("span", null, "My Website · Home")); tabs.append(tab, el("div", "tabm dim", "Other tab")); prev.append(tabs);
  const sizes = el("div", "sizes"); prev.append(sizes);
  const home = el("div", "homemock"); prev.append(home);
  const dlRow = el("div", "row"); out.append(dlRow);
  const filesUl = el("ul", "files"); out.append(filesUl);
  const htmlBox = codeBox(out, "HTML for your <head>", "favicon-head.html", "text/html");
  const manBox = codeBox(out, "site.webmanifest", "site.webmanifest", "application/manifest+json");
  let pack = null, busy = 0;
  const opts = () => ({ fit, zoom: clampN(zI.value, 50, 200, 100), pad: clampN(pI.value, 0, 30, 0), dx: clampN(xI.value, -50, 50, 0), dy: clampN(yI.value, -50, 50, 0), radius: clampN(rI.value, 0, 50, 0), bg: bgI.value, transparent: trI.checked, name: nI.value.trim() || "My Website", short: sI.value.trim() || "Website", theme: thI.value });
  async function draw() {
    const my = ++busy, o = opts();
    const ico = [16, 32, 48].map(s => renderIcon(src, s, o));
    const pngs = FAV_PNG.map(([n, s, m]) => [n, s, renderIcon(src, s, o, m || "")]);
    const blobs = await Promise.all(pngs.map(x => toBlob(x[2]))); if (my !== busy) return;
    const icoBytes = icoFromCanvases(ico), man = favManifest(o), html = favHtml(o);
    if (pack) pack.urls.forEach(u => URL.revokeObjectURL(u));
    const files = [{ name: "favicon.ico", data: icoBytes }, ...await Promise.all(pngs.map(async (x, i) => ({ name: x[0], data: new Uint8Array(await blobs[i].arrayBuffer()) }))), { name: "site.webmanifest", data: man }, { name: "favicon-head.html", data: html + "\n" }];
    if (my !== busy) return;
    pack = { files, urls: [] };
    const url = b => { const u = URL.createObjectURL(b); pack.urls.push(u); return u; };
    tIco.src = url(new Blob([icoBytes], { type: "image/x-icon" }));
    sizes.textContent = "";
    [["16", ico[0], "ico"], ["32", ico[1], "ico"], ["48", ico[2], "ico"], ...pngs.slice(2).map(x => [String(x[1]), x[2], x[0]])].forEach(([lab, c, n]) => { const mk = n.startsWith("maskable"); const f = el("figure", "sz" + (mk ? " mask" : "")); const i = el("img"); i.alt = lab + " px icon"; i.src = c.toDataURL("image/png"); f.append(i, el("figcaption", null, (mk ? "maskable " : n.startsWith("apple") ? "apple " : n === "ico" ? "ico " : "") + lab + "px")); sizes.append(f); });
    home.textContent = ""; const hi = el("img"); hi.src = pngs[2][2].toDataURL("image/png"); hi.alt = ""; home.append(hi, el("span", null, o.short));
    filesUl.textContent = ""; files.forEach(f => { const li = el("li"); const a = el("button", "linkbtn", f.name); a.type = "button"; a.addEventListener("click", () => download(new Blob([f.data]), f.name)); li.append(a, el("small", null, fmt(typeof f.data === "string" ? new TextEncoder().encode(f.data).length : f.data.length) + " bytes")); filesUl.append(li); });
    htmlBox.set(html); manBox.set(man);
  }
  btn(dlRow, "⬇ Download all (ZIP)", "btn", () => { if (pack) download(zip(pack.files), "favicons.zip"); });
  btn(dlRow, "favicon.ico", "chip", () => { if (pack) download(new Blob([pack.files[0].data], { type: "image/x-icon" }), "favicon.ico"); });
  async function pick(f) {
    try { const im = await loadImage(f, ["png", "jpg", "webp", "svg"], 10); src = im; fname.textContent = `${im.name} · ${im.kind.toUpperCase()} · ${im.w} × ${im.h} px`; if (im.w !== im.h) fname.textContent += " · not square: use Fill to crop or Fit to pad"; draw(); }
    catch (e) { fileI.value = ""; toast(e.message); fname.textContent = e.message; }
  }
  fileI.addEventListener("change", () => fileI.files[0] && pick(fileI.files[0]));
  drop.addEventListener("dragover", e => { e.preventDefault(); drop.classList.add("over"); }); drop.addEventListener("dragleave", () => drop.classList.remove("over"));
  drop.addEventListener("drop", e => { e.preventDefault(); drop.classList.remove("over"); const f = e.dataTransfer.files[0]; if (f) pick(f); });
  let t; [zI, pI, xI, yI, rI, bgI, trI, nI, sI, thI].forEach(i => i.addEventListener("input", () => { clearTimeout(t); t = setTimeout(draw, 60); }));
  draw();
}

/* ================= .HTACCESS / _REDIRECTS / NGINX ================= */
const SAFE_PATH = /^\/[A-Za-z0-9\-._~/%?&=+:@!$,;*()]*$/, SAFE_URL = /^https?:\/\/[A-Za-z0-9.-]+(:\d+)?(\/[A-Za-z0-9\-._~/%?&=+:@!$,;*()#]*)?$/;
function parseRedirects(text) {
  const ok = [], bad = [];
  text.split(/\r?\n/).slice(0, 5000).forEach((raw, i) => {
    const line = raw.trim(); if (!line || line.startsWith("#")) return;
    const [from, to, code = "301", ...rest] = line.split(/\s+/);
    if (rest.length) return bad.push(`Line ${i + 1}: too many parts. Use: /old-path /new-path 301`);
    if (!from || !SAFE_PATH.test(from)) return bad.push(`Line ${i + 1}: the “from” path must start with / and use only URL-safe characters.`);
    if (!to || !(SAFE_PATH.test(to) || SAFE_URL.test(to))) return bad.push(`Line ${i + 1}: the target must be a /path or a full https:// URL.`);
    if (!/^(301|302|307|308|410)$/.test(code)) return bad.push(`Line ${i + 1}: status must be 301, 302, 307, 308 or 410.`);
    if (from === to) return bad.push(`Line ${i + 1}: redirects to itself (loop).`);
    ok.push({ from, to, code });
  });
  return { ok, bad };
}
const reEsc = s => s.replace(/[.+?^${}()|[\]\\*]/g, "\\$&");
function serverConfig(f, o) {
  const d = o.domain, dRe = reEsc(d), canon = o.www === "www" ? "www." + d : d, proto = o.https ? "https" : "http";
  const H = [["Strict-Transport-Security", "max-age=31536000; includeSubDomains"], ["X-Content-Type-Options", "nosniff"], ["X-Frame-Options", "SAMEORIGIN"], ["Referrer-Policy", "strict-origin-when-cross-origin"], ["Permissions-Policy", "camera=(), microphone=(), geolocation=()"]].filter(h => o.https || h[0] !== "Strict-Transport-Security");
  const L = [];
  if (f === "apache") {
    L.push("# .htaccess generated by Tagloom. Test on a staging copy first.", "Options -Indexes", "RewriteEngine On", "");
    if (o.https) L.push("# Force HTTPS", "RewriteCond %{HTTPS} off", "RewriteRule ^ https://%{HTTP_HOST}%{REQUEST_URI} [L,R=301]", "");
    if (o.www === "www") L.push("# Force www", `RewriteCond %{HTTP_HOST} ^${dRe}$ [NC]`, `RewriteRule ^ ${proto}://www.${d}%{REQUEST_URI} [L,R=301]`, "");
    if (o.www === "non") L.push("# Remove www", `RewriteCond %{HTTP_HOST} ^www\\.${dRe}$ [NC]`, `RewriteRule ^ ${proto}://${d}%{REQUEST_URI} [L,R=301]`, "");
    if (o.slash === "add") L.push("# Add a trailing slash (not for files)", "RewriteCond %{REQUEST_FILENAME} !-f", "RewriteRule ^(.*[^/])$ /$1/ [L,R=301]", "");
    if (o.slash === "remove") L.push("# Remove the trailing slash (not for folders)", "RewriteCond %{REQUEST_FILENAME} !-d", "RewriteRule ^(.+)/$ /$1 [L,R=301]", "");
    if (o.rules.length) { L.push("# Redirects"); o.rules.forEach(r => L.push(r.code === "410" ? `Redirect gone ${r.from}` : `Redirect ${r.code} ${r.from} ${r.to}`)); L.push(""); }
    if (o.e404) L.push(`ErrorDocument 404 ${o.e404}`, "");
    if (o.gzip) L.push("# Compression", "<IfModule mod_deflate.c>", "  AddOutputFilterByType DEFLATE text/html text/plain text/css text/xml application/javascript application/json application/xml image/svg+xml", "</IfModule>", "");
    if (o.cache) L.push("# Browser caching", "<IfModule mod_expires.c>", "  ExpiresActive On", '  ExpiresByType text/html "access plus 0 seconds"', '  ExpiresByType text/css "access plus 1 year"', '  ExpiresByType application/javascript "access plus 1 year"', '  ExpiresByType image/png "access plus 1 year"', '  ExpiresByType image/jpeg "access plus 1 year"', '  ExpiresByType image/webp "access plus 1 year"', '  ExpiresByType image/svg+xml "access plus 1 year"', '  ExpiresByType font/woff2 "access plus 1 year"', "</IfModule>", "");
    if (o.sec) { L.push("# Security headers", "<IfModule mod_headers.c>"); H.forEach(([k, v]) => L.push(`  Header always set ${k} "${v}"`)); L.push("</IfModule>", ""); }
    return [[".htaccess", L.join("\n")]];
  }
  if (f === "netlify") {
    const R = ["# _redirects for Netlify (and Cloudflare Pages for path rules). Generated by Tagloom."];
    if (o.www !== "none") { const other = o.www === "www" ? d : "www." + d; R.push("", "# Domain redirect (Netlify only; on Cloudflare use a Redirect Rule)", `http://${other}/* https://${canon}/:splat 301!`, `https://${other}/* https://${canon}/:splat 301!`); }
    if (o.https) R.push("", "# HTTPS is enforced automatically on Netlify and Cloudflare Pages (turn on “Always Use HTTPS”).");
    if (o.slash !== "none") R.push("", `# Trailing slashes: Netlify → Pretty URLs setting; Cloudflare Pages ${o.slash === "add" ? "adds them for folder pages" : "strips .html automatically"}.`);
    if (o.rules.length) { R.push("", "# Redirects"); o.rules.forEach(r => R.push(`${r.from} ${r.to} ${r.code === "410" ? "410" : r.code}`)); }
    if (o.e404) R.push("", "# Custom 404 (both hosts also serve /404.html automatically)", `/* ${o.e404} 404`);
    const Hh = ["# _headers for Netlify and Cloudflare Pages. Generated by Tagloom."];
    if (o.sec) { Hh.push("/*"); H.forEach(([k, v]) => Hh.push(`  ${k}: ${v}`)); }
    if (o.cache) Hh.push("", "/assets/*", "  Cache-Control: public, max-age=31536000, immutable", "", "/*.css", "  Cache-Control: public, max-age=31536000, immutable", "", "/*.js", "  Cache-Control: public, max-age=31536000, immutable");
    if (o.gzip) Hh.push("", "# Gzip and Brotli compression are automatic on both hosts.");
    return [["_redirects", R.join("\n") + "\n"], ["_headers", Hh.join("\n") + "\n"]];
  }
  // nginx
  if (o.https) L.push("# Redirect all HTTP to HTTPS", "server {", "    listen 80;", "    listen [::]:80;", `    server_name ${d} www.${d};`, `    return 301 https://${canon}$request_uri;`, "}", "");
  if (o.www !== "none") { const other = o.www === "www" ? d : "www." + d; L.push(`# Send ${other} to ${canon}`, "server {", o.https ? "    listen 443 ssl;" : "    listen 80;", `    server_name ${other};`, o.https ? "    # ssl_certificate / ssl_certificate_key here" : "", `    return 301 ${proto}://${canon}$request_uri;`, "}", ""); }
  L.push("server {", o.https ? "    listen 443 ssl;\n    listen [::]:443 ssl;\n    http2 on;\n    # ssl_certificate /etc/letsencrypt/live/" + canon + "/fullchain.pem;\n    # ssl_certificate_key /etc/letsencrypt/live/" + canon + "/privkey.pem;" : "    listen 80;", `    server_name ${o.www === "none" ? d + " www." + d : canon};`, `    root /var/www/${d};`, "    index index.html;", "");
  if (o.slash === "add") L.push("    # Add a trailing slash (skips URLs with a file extension)", "    rewrite ^([^.?]*[^/])$ $1/ permanent;", "");
  if (o.slash === "remove") L.push("    # Remove the trailing slash", "    rewrite ^/(.*)/$ /$1 permanent;", "");
  if (o.rules.length) { L.push("    # Redirects"); o.rules.forEach(r => L.push(r.code === "410" ? `    location = ${r.from.split("?")[0]} { return 410; }` : `    location = ${r.from.split("?")[0]} { return ${r.code} ${r.to}; }`)); L.push(""); }
  if (o.e404) L.push(`    error_page 404 ${o.e404};`, "");
  if (o.gzip) L.push("    gzip on;", "    gzip_vary on;", "    gzip_min_length 1024;", "    gzip_types text/plain text/css text/xml application/javascript application/json application/xml image/svg+xml;", "");
  if (o.cache) L.push("    location ~* \\.(css|js|png|jpe?g|gif|webp|avif|svg|ico|woff2?)$ {", "        expires 1y;", '        add_header Cache-Control "public, immutable";', "    }", "");
  if (o.sec) { H.forEach(([k, v]) => L.push(`    add_header ${k} "${v}" always;`)); L.push(""); }
  L.push("    location / {", "        try_files $uri $uri/ =404;", "    }", "}");
  return [["nginx.conf", L.filter(x => x !== "").length ? L.join("\n").replace(/\n{3,}/g, "\n\n") + "\n" : ""]];
}
function redirectsTool(form, out, p) {
  let f = p.fmt || "apache", www = "non", slash = "none";
  const fs = seg(form, [["apache", "Apache .htaccess"], ["netlify", "Netlify / Cloudflare"], ["nginx", "nginx"]], f, v => { f = v; draw(); }); fs.classList.add("wide");
  const dI = F(form, "Your domain (without https://)", I("text", { maxlength: "253", value: "example.com" }), "wide");
  const hI = CK(form, "Force HTTPS", true);
  const w = el("div", "field wide"); w.append(el("span", "lab", "www")); form.append(w);
  seg(w, [["none", "Leave as is"], ["www", "Force www"], ["non", "Force non-www"]], www, v => { www = v; draw(); });
  const s = el("div", "field wide"); s.append(el("span", "lab", "Trailing slash")); form.append(s);
  seg(s, [["none", "Leave as is"], ["add", "Add /"], ["remove", "Remove /"]], slash, v => { slash = v; draw(); });
  const rI = F(form, "Redirects (one per line: /old /new 301). Codes: 301, 302, 307, 308, 410", I("textarea", { rows: "5", maxlength: "200000", value: "/old-page /new-page 301\n/blog/2019/post /blog/post 301\n/promo https://shop.example.com/sale 302" }), "wide mono");
  const eI = F(form, "Custom 404 page (optional)", I("text", { maxlength: "200", value: "/404.html" }));
  const gz = CK(form, "Gzip compression", true), ca = CK(form, "Browser caching for assets", true), se = CK(form, "Security headers (HSTS, nosniff, frame, referrer, permissions)", true);
  const msgs = msgList(out); const boxes = el("div"); out.append(boxes);
  function draw() {
    const M = []; let domain = dI.value.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/^www\./, "");
    if (!/^(?=.{1,253}$)([a-z0-9](-*[a-z0-9])*\.)+[a-z]{2,63}$/.test(domain)) { M.push(["err", "Enter a valid domain like example.com."]); domain = "example.com"; }
    const pr = parseRedirects(rI.value); pr.bad.slice(0, 6).forEach(b => M.push(["err", b]));
    let e404 = eI.value.trim(); if (e404 && !SAFE_PATH.test(e404)) { M.push(["err", "The 404 page must be a path like /404.html."]); e404 = ""; }
    const loops = pr.ok.filter(r => pr.ok.some(q => q.from === r.to && q.to === r.from)); if (loops.length) M.push(["warn", "Some redirects point at each other and would loop."]);
    const chains = pr.ok.filter(r => pr.ok.some(q => q.from === r.to)); if (chains.length && !loops.length) M.push(["hint", "Redirect chain found (A → B → C). Point A straight at C for faster crawling."]);
    if (pr.ok.some(r => r.code === "302" || r.code === "307")) M.push(["hint", "302/307 are temporary. Use 301/308 for permanent moves so ranking signals transfer."]);
    if (!M.length) M.push(["ok", `✓ ${pr.ok.length} redirect${pr.ok.length === 1 ? "" : "s"} ready.`]);
    msgs.set(M); boxes.textContent = "";
    for (const [name, txt] of serverConfig(f, { domain, https: hI.checked, www, slash, rules: pr.ok, e404, gzip: gz.checked, cache: ca.checked, sec: se.checked })) { codeBox(boxes, name, name).set(txt); }
  }
  [dI, hI, rI, eI, gz, ca, se].forEach(i => i.addEventListener("input", draw));
  draw();
}

/* ================= SCHEMA / JSON-LD ================= */
function rowsEditor(parent, label, cols, init) {
  const w = el("div", "field wide rowsed"); w.append(el("span", "lab", label)); const list = el("div", "rlist"); w.append(list); parent.append(w);
  const inputs = [];
  const add = vals => { if (list.children.length >= 100) return toast("Up to 100 rows."); const r = el("div", "rrow"); const ins = cols.map((c, i) => { const ta = c.endsWith("…"); const x = I(ta ? "textarea" : "text", { maxlength: ta ? "3000" : "300", placeholder: c.replace("…", ""), "aria-label": c.replace("…", ""), rows: "2" }); x.value = vals && vals[i] || ""; x.addEventListener("input", () => w.dispatchEvent(new Event("input", { bubbles: true }))); r.append(x); return x; }); const rm = btn(r, "✕", "chip xs rm", () => { r.remove(); inputs.splice(inputs.indexOf(ins), 1); w.dispatchEvent(new Event("input", { bubbles: true })); }); rm.setAttribute("aria-label", "Remove row"); list.append(r); inputs.push(ins); };
  (init || [[]]).forEach(add);
  btn(w, "+ Add row", "chip xs", () => { add(); w.dispatchEvent(new Event("input", { bubbles: true })); });
  return { get: () => inputs.map(r => r.map(i => i.value.trim())).filter(r => r.some(Boolean)) };
}
const lines = s => String(s || "").split(/\r?\n/).map(x => x.trim()).filter(Boolean);
const iso = m => { m = Number(m); if (!(m > 0)) return ""; const h = Math.floor(m / 60), r = Math.round(m % 60); return "PT" + (h ? h + "H" : "") + (r ? r + "M" : ""); };
function clean(o) { if (Array.isArray(o)) { const a = o.map(clean).filter(x => x !== undefined); return a.length ? a : undefined; } if (o && typeof o === "object") { const r = {}; let n = 0; for (const [k, v] of Object.entries(o)) { const c = clean(v); if (c !== undefined) { r[k] = c; n++; } } return n && Object.keys(r).some(k => k[0] !== "@") ? r : undefined; } return o === "" || o == null || (typeof o === "number" && !Number.isFinite(o)) ? undefined : o; }
const num = s => s === "" || s == null ? "" : Number(s);
const SCHEMA = {
  Organization: { f: [["name*", "Name"], ["url*", "Website URL", "url"], ["logo", "Logo URL", "url"], ["description", "Description", "textarea"], ["email", "Email"], ["telephone", "Phone"], ["sameAs", "Social profile URLs (one per line)", "lines"]],
    b: v => ({ "@type": "Organization", name: v.name, url: v.url, logo: v.logo, description: v.description, email: v.email, telephone: v.telephone, sameAs: lines(v.sameAs) }) },
  LocalBusiness: { f: [["sub", "Business type", ["LocalBusiness", "Restaurant", "Store", "Dentist", "MedicalClinic", "LegalService", "AutoRepair", "BeautySalon", "HomeAndConstructionBusiness", "RealEstateAgent", "Hotel", "ProfessionalService"]], ["name*", "Business name"], ["url", "Website URL", "url"], ["image*", "Photo or logo URL", "url"], ["telephone", "Phone"], ["priceRange", "Price range (e.g. $$)"], ["street*", "Street address"], ["city*", "City"], ["region", "State / region"], ["postal", "Postal code"], ["country*", "Country code (e.g. US)"], ["lat", "Latitude", "number"], ["lng", "Longitude", "number"], ["hours", "Opening hours, one per line (e.g. Mo-Fr 09:00-17:00)", "lines"]],
    b: v => ({ "@type": v.sub || "LocalBusiness", name: v.name, url: v.url, image: v.image, telephone: v.telephone, priceRange: v.priceRange, address: { "@type": "PostalAddress", streetAddress: v.street, addressLocality: v.city, addressRegion: v.region, postalCode: v.postal, addressCountry: v.country }, geo: v.lat !== "" && v.lng !== "" ? { "@type": "GeoCoordinates", latitude: num(v.lat), longitude: num(v.lng) } : "", openingHours: lines(v.hours) }) },
  Article: { f: [["sub", "Article type", ["Article", "BlogPosting", "NewsArticle"]], ["headline*", "Headline (110 characters or less)"], ["image*", "Image URL", "url"], ["author*", "Author name"], ["authorUrl", "Author profile URL", "url"], ["publisher", "Publisher name"], ["publisherLogo", "Publisher logo URL", "url"], ["datePublished*", "Date published", "date"], ["dateModified", "Date modified", "date"], ["url", "Article URL", "url"]],
    b: v => ({ "@type": v.sub || "Article", headline: v.headline, image: v.image ? [v.image] : "", author: { "@type": "Person", name: v.author, url: v.authorUrl }, publisher: { "@type": "Organization", name: v.publisher, logo: { "@type": "ImageObject", url: v.publisherLogo } }, datePublished: v.datePublished, dateModified: v.dateModified, mainEntityOfPage: v.url }) },
  Product: { f: [["name*", "Product name"], ["image*", "Image URL", "url"], ["description", "Description", "textarea"], ["brand", "Brand"], ["sku", "SKU"], ["gtin", "GTIN / barcode"], ["price*", "Price", "number"], ["currency*", "Currency (e.g. USD)"], ["availability", "Availability", ["InStock", "OutOfStock", "PreOrder", "BackOrder", "Discontinued", "LimitedAvailability"]], ["condition", "Condition", ["NewCondition", "UsedCondition", "RefurbishedCondition"]], ["url", "Product URL", "url"], ["priceValidUntil", "Price valid until", "date"], ["ratingValue", "Average rating (1–5)", "number"], ["reviewCount", "Number of reviews", "number"]],
    b: v => ({ "@type": "Product", name: v.name, image: v.image ? [v.image] : "", description: v.description, brand: { "@type": "Brand", name: v.brand }, sku: v.sku, gtin: v.gtin, offers: { "@type": "Offer", url: v.url, price: v.price, priceCurrency: v.currency.toUpperCase(), availability: "https://schema.org/" + v.availability, itemCondition: "https://schema.org/" + v.condition, priceValidUntil: v.priceValidUntil }, aggregateRating: v.ratingValue !== "" && v.reviewCount !== "" ? { "@type": "AggregateRating", ratingValue: num(v.ratingValue), reviewCount: num(v.reviewCount) } : "" }) },
  FAQPage: { f: [["faq", "Questions and answers", "rows", ["Question", "Answer…"], [["What is your return policy?", "You can return any item within 30 days for a full refund."], ["Do you ship internationally?", "Yes, we ship to over 40 countries."]]]],
    b: v => ({ "@type": "FAQPage", mainEntity: v.faq.filter(r => r[0] && r[1]).map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) }) },
  HowTo: { f: [["name*", "Title (How to …)"], ["description", "Description", "textarea"], ["image", "Image URL", "url"], ["time", "Total time (minutes)", "number"], ["supply", "Supplies, one per line", "lines"], ["tool", "Tools, one per line", "lines"], ["steps", "Steps", "rows", ["Step name", "Instructions…"], [["Prepare", "Gather everything you need."], ["Do it", "Follow the instructions carefully."]]]],
    b: v => ({ "@type": "HowTo", name: v.name, description: v.description, image: v.image, totalTime: iso(v.time), supply: lines(v.supply).map(n => ({ "@type": "HowToSupply", name: n })), tool: lines(v.tool).map(n => ({ "@type": "HowToTool", name: n })), step: v.steps.filter(r => r[1] || r[0]).map(([n, t], i) => ({ "@type": "HowToStep", position: i + 1, name: n, text: t || n })) }) },
  BreadcrumbList: { f: [["items", "Breadcrumb trail (top level first)", "rows", ["Name", "URL"], [["Home", "https://example.com/"], ["Blog", "https://example.com/blog/"], ["This post", "https://example.com/blog/post/"]]]],
    b: v => ({ "@type": "BreadcrumbList", itemListElement: v.items.map(([n, u], i) => ({ "@type": "ListItem", position: i + 1, name: n, item: u })) }) },
  Event: { f: [["name*", "Event name"], ["startDate*", "Start", "datetime-local"], ["endDate", "End", "datetime-local"], ["mode", "Attendance", [["OfflineEventAttendanceMode", "In person"], ["OnlineEventAttendanceMode", "Online"], ["MixedEventAttendanceMode", "Mixed"]]], ["status", "Status", ["EventScheduled", "EventPostponed", "EventRescheduled", "EventMovedOnline", "EventCancelled"]], ["place", "Venue name"], ["address", "Venue address"], ["online", "Online event URL", "url"], ["image", "Image URL", "url"], ["description", "Description", "textarea"], ["organizer", "Organizer name"], ["organizerUrl", "Organizer URL", "url"], ["price", "Ticket price", "number"], ["currency", "Currency (e.g. USD)"], ["ticketUrl", "Ticket URL", "url"]],
    b: v => { const place = { "@type": "Place", name: v.place, address: v.address }, vr = { "@type": "VirtualLocation", url: v.online }; return { "@type": "Event", name: v.name, startDate: v.startDate, endDate: v.endDate, eventAttendanceMode: "https://schema.org/" + v.mode, eventStatus: "https://schema.org/" + v.status, location: v.mode === "OnlineEventAttendanceMode" ? vr : v.mode === "MixedEventAttendanceMode" ? [vr, place] : place, image: v.image ? [v.image] : "", description: v.description, organizer: { "@type": "Organization", name: v.organizer, url: v.organizerUrl }, offers: { "@type": "Offer", price: v.price, priceCurrency: v.currency.toUpperCase(), url: v.ticketUrl, availability: v.price !== "" ? "https://schema.org/InStock" : "" } }; } },
  Recipe: { f: [["name*", "Recipe name"], ["image*", "Image URL", "url"], ["author", "Author name"], ["description", "Description", "textarea"], ["prep", "Prep time (minutes)", "number"], ["cook", "Cook time (minutes)", "number"], ["yield", "Servings (e.g. 4 servings)"], ["category", "Category (e.g. Dessert)"], ["cuisine", "Cuisine (e.g. Italian)"], ["calories", "Calories per serving", "number"], ["ingredients*", "Ingredients, one per line", "lines"], ["steps*", "Instructions, one step per line", "lines"], ["ratingValue", "Average rating (1–5)", "number"], ["ratingCount", "Number of ratings", "number"]],
    b: v => ({ "@type": "Recipe", name: v.name, image: v.image ? [v.image] : "", author: { "@type": "Person", name: v.author }, description: v.description, prepTime: iso(v.prep), cookTime: iso(v.cook), totalTime: iso(Number(v.prep || 0) + Number(v.cook || 0)), recipeYield: v.yield, recipeCategory: v.category, recipeCuisine: v.cuisine, nutrition: v.calories !== "" ? { "@type": "NutritionInformation", calories: v.calories + " calories" } : "", recipeIngredient: lines(v.ingredients), recipeInstructions: lines(v.steps).map(t => ({ "@type": "HowToStep", text: t })), aggregateRating: v.ratingValue !== "" && v.ratingCount !== "" ? { "@type": "AggregateRating", ratingValue: num(v.ratingValue), ratingCount: num(v.ratingCount) } : "" }) },
  Person: { f: [["name*", "Full name"], ["url", "Website URL", "url"], ["image", "Photo URL", "url"], ["jobTitle", "Job title"], ["worksFor", "Works for (organization)"], ["description", "Short bio", "textarea"], ["sameAs", "Profile URLs (one per line)", "lines"]],
    b: v => ({ "@type": "Person", name: v.name, url: v.url, image: v.image, jobTitle: v.jobTitle, worksFor: { "@type": "Organization", name: v.worksFor }, description: v.description, sameAs: lines(v.sameAs) }) },
  WebSite: { f: [["name*", "Site name"], ["url*", "Home page URL", "url"], ["alternateName", "Alternate name"], ["search", "Search URL with {search_term_string} (e.g. https://example.com/search?q={search_term_string})"]],
    b: v => ({ "@type": "WebSite", name: v.name, alternateName: v.alternateName, url: v.url, potentialAction: v.search ? { "@type": "SearchAction", target: { "@type": "EntryPoint", urlTemplate: v.search }, "query-input": "required name=search_term_string" } : "" }) },
  VideoObject: { f: [["name*", "Video title"], ["description*", "Description", "textarea"], ["thumbnailUrl*", "Thumbnail URL", "url"], ["uploadDate*", "Upload date", "date"], ["duration", "Duration (seconds)", "number"], ["contentUrl", "Video file URL", "url"], ["embedUrl", "Embed / player URL", "url"]],
    b: v => ({ "@type": "VideoObject", name: v.name, description: v.description, thumbnailUrl: v.thumbnailUrl ? [v.thumbnailUrl] : "", uploadDate: v.uploadDate, duration: v.duration ? "PT" + Math.round(v.duration) + "S" : "", contentUrl: v.contentUrl, embedUrl: v.embedUrl }) }
};
const SCHEMA_DEMO = { name: "Example Co", url: "https://example.com/", headline: "How to Write Better Page Titles", image: "https://example.com/photo.jpg", author: "Jane Doe", datePublished: "", price: "29.99", currency: "USD", street: "1 Main St", city: "Springfield", country: "US", startDate: "", description: "A short description.", thumbnailUrl: "https://example.com/thumb.jpg", uploadDate: "", ingredients: "2 cups flour\n1 cup sugar", steps: "Mix the ingredients.\nBake for 30 minutes." };
function schemaJson(obj) { const o = clean(Object.assign({ "@context": "https://schema.org" }, obj)) || { "@context": "https://schema.org" }; const json = JSON.stringify(o, null, 2).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026"); return { o, json, tag: `<script type="application/ld+json">\n${json}\n</script>` }; }
function schemaTool(form, out, p) {
  let type = p.type || "Organization";
  const tI = F(form, "Schema type", I("select", { options: Object.keys(SCHEMA).map(k => [k, k === "WebSite" ? "WebSite (with SearchAction)" : k === "FAQPage" ? "FAQPage" : k.replace(/([a-z])([A-Z])/g, "$1 $2")]), value: type }), "wide");
  tI.value = type;
  const box = el("div", "subform wide"); form.append(box);
  const msgs = msgList(out); const code = codeBox(out, "JSON-LD script tag", "schema.html", "text/html");
  const hint = el("p", "hint", "Paste the script into your page's <head> or <body>, then check it with Google's Rich Results Test and the Schema.org validator."); out.append(hint);
  let get = {};
  function form2() {
    box.textContent = ""; get = {};
    for (const [k0, label, kind, a, b] of SCHEMA[type].f) {
      const k = k0.replace("*", ""), req = k0.endsWith("*"), lab = label + (req ? " *" : "");
      let x;
      if (kind === "rows") { const r = rowsEditor(box, lab, a, b); get[k] = { r, req }; continue; }
      if (Array.isArray(kind)) x = F(box, lab, I("select", { options: kind }));
      else if (kind === "textarea" || kind === "lines") x = F(box, lab, I("textarea", { rows: "3", maxlength: "5000" }), "wide");
      else x = F(box, lab, I(kind === "url" ? "url" : kind || "text", kind === "number" ? { step: "any" } : { maxlength: kind === "url" ? "2048" : "300" }));
      if (SCHEMA_DEMO[k] != null && !Array.isArray(kind)) x.value = SCHEMA_DEMO[k] || (kind === "date" ? today() : kind === "datetime-local" ? today() + "T19:00" : "");
      get[k] = { x, kind, req, label };
    }
  }
  function draw() {
    const v = {}, M = [];
    for (const [k, g] of Object.entries(get)) {
      if (g.r) { v[k] = g.r.get(); if (g.req && !v[k].length) M.push(["warn", `Add at least one row.`]); continue; }
      v[k] = g.x.value.trim();
      if (g.req && !v[k]) M.push(["warn", `Required for rich results: ${g.label}.`]);
      if (g.kind === "url" && v[k] && !isAbsUrl(v[k])) { M.push(["err", `${g.label} must be a full URL starting with https://.`]); v[k] = ""; }
      if (g.kind === "number" && v[k] !== "" && !Number.isFinite(Number(v[k]))) { M.push(["err", `${g.label} must be a number.`]); v[k] = ""; }
    }
    if (type === "Article" && v.headline.length > 110) M.push(["warn", "Headlines over 110 characters may be cut."]);
    if (type === "Product" && v.ratingValue !== "" && !(Number(v.ratingValue) >= 1 && Number(v.ratingValue) <= 5)) M.push(["warn", "Rating should be between 1 and 5."]);
    if (type === "Product" && v.currency && !/^[A-Za-z]{3}$/.test(v.currency)) M.push(["warn", "Currency should be a 3-letter ISO code like USD."]);
    if (type === "FAQPage") { v.faq.forEach((r, i) => { if (!r[0] || !r[1]) M.push(["warn", `FAQ row ${i + 1} needs both a question and an answer.`]); }); M.push(["hint", "Google shows FAQ rich results mainly for authoritative government and health sites now, but FAQ markup still helps other search and AI tools understand the page."]); }
    if (type === "BreadcrumbList") v.items.forEach((r, i) => { if (!r[0]) M.push(["warn", `Breadcrumb ${i + 1} needs a name.`]); if (r[1] && !isAbsUrl(r[1])) M.push(["err", `Breadcrumb ${i + 1} URL must be absolute.`]); });
    if (type === "WebSite" && v.search && !v.search.includes("{search_term_string}")) M.push(["err", "The search URL must contain {search_term_string}."]);
    if (type === "Event" && v.endDate && v.startDate && v.endDate < v.startDate) M.push(["err", "End is before start."]);
    if (type === "BreadcrumbList") v.items = v.items.map(([n, u]) => [n, isAbsUrl(u) ? u : ""]);
    const r = schemaJson(SCHEMA[type].b(v));
    try { JSON.parse(r.json); if (!M.some(m => m[0] !== "hint")) M.unshift(["ok", `✓ Valid JSON-LD · ${type} · all required fields filled.`]); } catch (e) { M.unshift(["err", "JSON error: " + e.message]); }
    msgs.set(M); code.set(r.tag);
  }
  tI.addEventListener("change", () => { type = SCHEMA[tI.value] ? tI.value : "Organization"; form2(); draw(); });
  box.addEventListener("input", draw); box.addEventListener("change", draw);
  form2(); draw();
}

/* ================= KEYWORD DENSITY ================= */
const STOP = new Set("a about above after again against all am an and any are aren't as at be because been before being below between both but by can can't cannot could couldn't did didn't do does doesn't doing don't down during each few for from further had hadn't has hasn't have haven't having he he'd he'll he's her here here's hers herself him himself his how how's i i'd i'll i'm i've if in into is isn't it it's its itself let's me more most mustn't my myself no nor not of off on once only or other ought our ours ourselves out over own same shan't she she'd she'll she's should shouldn't so some such than that that's the their theirs them themselves then there there's these they they'd they'll they're they've this those through to too under until up very was wasn't we we'd we'll we're we've were weren't what what's when when's where where's which while who who's whom why why's will with won't would wouldn't you you'd you'll you're you've your yours yourself yourselves also just get got like one can may us via".split(" "));
function parseHtmlDoc(html) { // DOMParser builds an inert document; nothing is inserted into the page or executed
  // Rename on*= handler attributes first: Chrome still fires error/load events inside DOMParser documents (CSP would block them, but we never want them compiled).
  const safe = String(html).slice(0, 2000000).replace(/([\s\/"'])on([a-z]+\s*=)/gi, "$1data-x-on$2"); // global, so quoted ">" tricks can't hide one
  const d = new DOMParser().parseFromString(safe, "text/html");
  d.querySelectorAll("script,style,noscript,template,svg,iframe,object,embed").forEach(n => n.remove());
  const title = (d.querySelector("title") || {}).textContent || "";
  const md = d.querySelector('meta[name="description" i]'); const desc = md ? md.getAttribute("content") || "" : "";
  const heads = [...d.querySelectorAll("h1,h2,h3,h4,h5,h6")].slice(0, 300).map(h => [Number(h.tagName[1]), h.textContent.replace(/\s+/g, " ").trim()]);
  const body = d.body || d.documentElement; body.querySelectorAll("p,div,li,h1,h2,h3,h4,h5,h6,br,td,th,section,article,header,footer").forEach(n => n.append(d.createTextNode("\n")));
  const firstP = [...d.querySelectorAll("p")].map(p => p.textContent.trim()).find(Boolean) || "";
  const imgs = [...d.querySelectorAll("img")]; const noAlt = imgs.filter(i => !(i.getAttribute("alt") || "").trim()).length;
  return { text: body.textContent || "", title: title.trim(), desc: desc.trim(), heads, firstP, imgs: imgs.length, noAlt, links: d.querySelectorAll("a[href]").length };
}
const tokenize = s => (s.toLowerCase().normalize("NFKC").match(/[\p{L}\p{N}][\p{L}\p{N}'’\-]*/gu) || []).map(w => w.replace(/’/g, "'").replace(/['\-]+$/, ""));
function analyzeText(text, o = {}) {
  const sentences = String(text).split(/[.!?;:\n\r]+/), words = tokenize(text), N = words.length, counts = [new Map(), new Map(), new Map()];
  for (const s of sentences) { const t = tokenize(s); for (let n = 1; n <= 3; n++) for (let i = 0; i + n <= t.length; i++) { const g = t.slice(i, i + n); if (o.stop !== false && (STOP.has(g[0]) || STOP.has(g[n - 1]))) continue; if (n === 1 && (g[0].length < 2 || /^\d+$/.test(g[0]))) continue; const k = g.join(" "); counts[n - 1].set(k, (counts[n - 1].get(k) || 0) + 1); } }
  const top = counts.map((m, i) => [...m].filter(([, c]) => i === 0 || c > 1).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 25).map(([k, c]) => ({ k, c, d: N ? c * (i + 1) / N * 100 : 0 })));
  const chars = String(text).replace(/\s/g, "").length, sentN = sentences.filter(s => tokenize(s).length).length;
  return { N, unique: new Set(words).size, chars, sentences: sentN, read: Math.max(N ? 1 : 0, Math.round(N / 238)), top };
}
function countPhrase(text, phrase) { const t = tokenize(text), p = tokenize(phrase); if (!p.length) return 0; let c = 0; for (let i = 0; i + p.length <= t.length; i++) if (p.every((w, j) => t[i + j] === w)) c++; return c; }
function kwTool(form, out, p) {
  let mode = p.mode || "text", n = 0;
  const demoT = "Keyword density is the share of words on a page that match a keyword. A good keyword density checker shows one-word, two-word and three-word phrases.\n\nWrite for readers first. Use your keyword in the title, the first paragraph and a heading, then use related phrases naturally.";
  const demoH = '<title>Keyword density checker guide</title>\n<meta name="description" content="Learn what keyword density is.">\n<h1>Keyword density checker</h1>\n<p>Keyword density is the share of words that match a keyword.</p>\n<h2>How to use it</h2>\n<p>Paste text, read the phrase table and fix overuse.</p>\n<img src="a.png">';
  const ms = seg(form, [["text", "Plain text"], ["html", "HTML source"]], mode, v => { mode = v; tI.value = v === "html" ? demoH : demoT; draw(); }); ms.classList.add("wide");
  const tI = F(form, "Paste your text or page HTML (up to 2 MB). HTML is parsed safely and never run.", I("textarea", { rows: "10", maxlength: "2000000", value: mode === "html" ? demoH : demoT }), "wide");
  const kI = F(form, "Target keyword (optional)", I("text", { maxlength: "100", value: "keyword density" }));
  const sI = CK(form, "Ignore stopwords (the, and, of…)", true);
  const stats = el("div", "stats"); out.append(stats);
  const msgs = msgList(out);
  const gs = seg(out, [["0", "1 word"], ["1", "2 words"], ["2", "3 words"]], "0", v => { n = Number(v); table(); });
  const tblW = el("div", "tblw"); out.append(tblW);
  H(out, "Headings outline"); const outline = el("ol", "outline"); out.append(outline);
  let A = null;
  function table() {
    tblW.textContent = ""; const t = el("table", "tbl2"); const hr = el("tr"); ["Phrase", "Count", "Density"].forEach(h => hr.append(el("th", null, h))); const th = el("thead"); th.append(hr); t.append(th); const tb = el("tbody"); t.append(tb);
    const rows = A ? A.top[n] : []; if (!rows.length) { const r = el("tr"); const td = el("td", "hint", "No repeated phrases yet."); td.colSpan = 3; r.append(td); tb.append(r); }
    rows.forEach(x => { const r = el("tr"); r.append(el("td", null, x.k), el("td", null, fmt(x.c)), el("td", x.d > 3 ? "noc" : null, x.d.toFixed(2) + "%")); tb.append(r); });
    tblW.append(t);
  }
  function draw() {
    const raw = tI.value; let text = raw, info = null;
    if (mode === "html") { info = parseHtmlDoc(raw); text = info.text; }
    else { info = { heads: [], firstP: lines(raw)[0] || "", title: "" }; raw.split(/\r?\n/).forEach(l => { const m = /^(#{1,6})\s+(.+)/.exec(l); if (m) info.heads.push([m[1].length, m[2].trim()]); }); }
    A = analyzeText(text, { stop: sI.checked });
    stats.textContent = ""; [["words", fmt(A.N)], ["unique", fmt(A.unique)], ["sentences", fmt(A.sentences)], ["characters", fmt(A.chars)], ["min read", A.read]].forEach(([k, v]) => { const d = el("div"); d.append(el("b", null, v), el("small", null, k)); stats.append(d); });
    const M = [], kw = kI.value.trim();
    if (kw) {
      const c = countPhrase(text, kw), kn = tokenize(kw).length, dens = A.N ? c * kn / A.N * 100 : 0;
      M.push([c ? "ok" : "warn", `“${kw}” appears ${fmt(c)} time${c === 1 ? "" : "s"} · density ${dens.toFixed(2)}%`]);
      if (dens > 3) M.push(["warn", "Density over 3% can read as keyword stuffing. Use synonyms and related phrases."]);
      else if (c && dens < 0.5 && A.N > 300) M.push(["hint", "Density is low; make sure the topic is clear from the text."]);
      const h1s = info.heads.filter(h => h[0] === 1);
      if (mode === "html") {
        M.push(info.title ? (countPhrase(info.title, kw) ? ["ok", "✓ Keyword is in the <title>."] : ["warn", "Keyword is missing from the <title>."]) : ["warn", "No <title> found."]);
        M.push(info.desc ? (countPhrase(info.desc, kw) ? ["ok", "✓ Keyword is in the meta description."] : ["hint", "Keyword isn't in the meta description."]) : ["warn", "No meta description found."]);
      }
      if (mode === "html" || h1s.length) M.push(h1s.length ? (h1s.some(h => countPhrase(h[1], kw)) ? ["ok", "✓ Keyword is in the H1."] : ["warn", "Keyword is missing from the H1."]) : ["warn", "No H1 found."]);
      M.push(info.firstP && countPhrase(info.firstP, kw) ? ["ok", "✓ Keyword is in the first paragraph."] : ["warn", "Keyword isn't in the first paragraph."]);
    }
    if (mode === "html") {
      const h1n = info.heads.filter(h => h[0] === 1).length; if (h1n > 1) M.push(["warn", `${h1n} H1 headings found. Use one H1 per page.`]);
      for (let i = 1; i < info.heads.length; i++) if (info.heads[i][0] > info.heads[i - 1][0] + 1) { M.push(["hint", `Heading level skips from H${info.heads[i - 1][0]} to H${info.heads[i][0]}.`]); break; }
      if (info.noAlt) M.push(["warn", `${info.noAlt} of ${info.imgs} images have no alt text.`]);
      if (A.N < 300) M.push(["hint", `Only ${A.N} words of visible text. Thin pages rarely rank.`]);
    }
    msgs.set(M); table();
    outline.textContent = ""; if (!info.heads.length) outline.append(el("li", "hint", mode === "html" ? "No headings found." : "No headings found. In plain text, lines starting with # count as headings."));
    info.heads.forEach(([lv, t]) => { const li = el("li", "lv" + lv); li.append(el("b", null, "H" + lv), el("span", null, t || "(empty)")); outline.append(li); });
  }
  let t; [tI, kI, sI].forEach(i => i.addEventListener("input", () => { clearTimeout(t); t = setTimeout(draw, tI.value.length > 100000 ? 400 : 100); }));
  draw();
}

/* ================= page wiring ================= */
const TOOLS = { meta: metaTool, og: ogTool, robots: robotsTool, sitemap: sitemapTool, favicon: faviconTool, redirects: redirectsTool, schema: schemaTool, kw: kwTool };
function adSlot(name, kind) { const d = el("div", "ad ad-" + kind); d.dataset.slot = name; d.append(el("span", null, "Advertisement")); return d; }
const setTheme = t => { document.documentElement.dataset.theme = t; store.set("theme", t); const b = $("#theme"); if (b) { b.textContent = t === "light" ? "🌙" : "☀️"; b.setAttribute("aria-label", t === "light" ? "Switch to dark theme" : "Switch to light theme"); } };
setTheme(store.get("theme") || (window.matchMedia && matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark"));
$("#theme") && $("#theme").addEventListener("click", () => setTheme(document.documentElement.dataset.theme === "light" ? "dark" : "light"));
if ($("#year")) $("#year").textContent = new Date().getFullYear();

const PAGE_ID = document.body.dataset.tool || "", IS_DOC = document.body.dataset.doc === "1";
if (PAGE_ID) {
  const pg = PAGES.find(x => x.id === PAGE_ID);
  if (pg && TOOLS[pg.tool]) {
    $("#home") && ($("#home").hidden = true); $("#tool").hidden = false;
    $("#t-icon").textContent = pg.icon; $("#t-cat").textContent = pg.cat; $("#t-name").textContent = pg.name; $("#t-desc").textContent = pg.desc;
    const form = $("#t-form"), out = $("#t-out");
    try { TOOLS[pg.tool](form, out, Object.assign({}, pg.p || {})); }
    catch (e) { out.textContent = ""; out.append(el("div", "err", "This tool couldn't start in your browser: " + (e && e.message || "error"))); }
    const rec = (store.get("recent") || []).filter(x => x !== pg.id); rec.unshift(pg.id); store.set("recent", rec.slice(0, 6));
  }
} else if (!IS_DOC && $("#grid") && $("#grid").tagName === "SECTION") {
  const CATS = ["All", ...new Set(PAGES.map(x => x.cat))]; let curCat = "All";
  const grid = $("#grid"), search = $("#search"), recent = store.get("recent") || [];
  const render = () => {
    const q = search.value.trim().toLowerCase().slice(0, 60);
    const list = PAGES.filter(c => (curCat === "All" || c.cat === curCat) && (!q || (c.name + " " + c.desc + " " + c.cat).toLowerCase().includes(q)));
    grid.textContent = "";
    list.forEach((c, i) => { const a = el("a", "tile"); a.href = BASE + "/" + c.id + "/"; a.append(el("span", "ti", c.icon), el("b", null, c.name), el("p", null, c.desc), el("small", null, c.cat + (recent.includes(c.id) ? " · recent" : ""))); grid.append(a); if (i === 5) grid.append(adSlot("in-grid", "rect")); });
    if (!list.length) grid.append(el("p", "empty", "No tools match “" + q + "”."));
    $("#count").textContent = `${list.length} tool${list.length === 1 ? "" : "s"}${curCat !== "All" ? " in " + curCat : ""}`;
  };
  CATS.forEach(c => { const b = el("button", "pill" + (c === "All" ? " on" : ""), c); b.type = "button"; b.addEventListener("click", () => { curCat = c; document.querySelectorAll(".pill").forEach(p => p.classList.toggle("on", p === b)); render(); }); $("#cats").append(b); });
  search.addEventListener("input", render);
  document.addEventListener("keydown", e => { if (e.key === "/" && document.activeElement !== search && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) { e.preventDefault(); search.focus(); } });
  render();
}

/* cookie / ad consent (ads load only after a choice; non-personalized if rejected) */
window.tagloomConsent = () => store.get("consent");
if (!store.get("consent")) {
  const bar = el("div", "consent"); bar.setAttribute("role", "dialog"); bar.setAttribute("aria-label", "Cookie consent");
  const t = el("p"); t.append("We use cookies only to show ads that keep Tagloom free. Everything you type or upload stays on your device. "); const a = el("a", null, "Privacy policy"); a.href = BASE + "/privacy/"; t.append(a);
  const acc = el("button", "btn sm", "Accept"), rej = el("button", "chip", "Only necessary"); [acc, rej].forEach(b => { b.type = "button"; });
  const done = v => { store.set("consent", { ads: v, at: Date.now() }); bar.remove(); document.dispatchEvent(new CustomEvent("tagloom:consent", { detail: v, bubbles: true })); };
  acc.addEventListener("click", () => done(true)); rej.addEventListener("click", () => done(false));
  const bx = el("div", "cbtns"); bx.append(rej, acc); bar.append(t, bx); document.body.append(bar);
}
// Ad loading hook: after approval, load the network's script here, e.g.
// document.addEventListener("tagloom:consent", e => { /* e.detail === true → personalized, false → non-personalized */ });

window.TL_TEST = { robotsCheck, parseRobots, robotsText, zip, crc32, metaTags, ogTags, parseHreflang, buildSitemaps, icoFromCanvases, renderIcon, demoSource, favManifest, parseRedirects, serverConfig, schemaJson, SCHEMA, analyzeText, parseHtmlDoc, countPhrase, fitWidth, textW, sniff };
})();
