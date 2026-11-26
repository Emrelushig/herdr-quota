// Hesap kotaları. Sayıları terminalde çizmez: kota_panel.py --json okur, bu panel çizer.
import { View, div, svg, image } from "gpui-kit";
import { v_flex, h_flex, ScrollHandle } from "gpui-base";
import { exec, theme, checking, layout, window, readTextFile, home, appHome } from "herdr";

function birlestir(kok, ...parca) {
  const sep = String(kok).includes("\\") ? "\\" : "/";
  return [String(kok).replace(/[\\/]+$/, ""), ...parca].join(sep);
}
const ONBELLEK = () => birlestir(home(), ".herdr-hesaplar", "kota-calisma", "son.json");
const KENDI = () => birlestir(home(), ".herdr-hesaplar", "kota_panel.py");
const ORNEK = () => birlestir(appHome(), "mods", "kota", "kota_panel.example.py");
const ARALIK = 180000;

function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

const dar = () => (find(layout(), "kota")?.size?.px ?? Infinity) < 160;

function renk(t, kalan) {
  if (kalan >= 50) return t.done;
  if (kalan >= 20) return t.working;
  return t.blocked;
}

function sure(reset) {
  if (!reset) return "";
  const t = Date.parse(String(reset));
  if (Number.isNaN(t)) return "";
  let s = Math.floor((t - Date.now()) / 1000);
  if (s <= 0) return "";
  const g = Math.floor(s / 86400);
  s %= 86400;
  const sa = Math.floor(s / 3600);
  s %= 3600;
  const dk = Math.floor(s / 60);
  if (g) return `${g}g ${sa}sa`;
  if (sa) return `${sa}sa ${dk}dk`;
  return `${dk}dk`;
}

function saat(iso) {
  const m = String(iso ?? "").match(/T(\d{2}:\d{2})/);
  return m ? m[1] : "";
}

function yuzdeYazi(kalan) {
  const k = Math.max(0, Math.min(100, Number(kalan) || 0));
  if (k > 0 && k < 10) return `%${k.toFixed(1)}`;
  return `%${Math.round(k)}`;
}

const RENKLI = {
  agy: "icons/antigravity.svg",
  codex: "icons/codex.svg",
  claude: "icons/claude.svg",
};
const TEK = {
  grok: "icons/grok.svg",
  gemini: "icons/gemini.svg",
};

function mark(t, key, size) {
  if (RENKLI[key]) return image(RENKLI[key]).w(size).h(size).flex_none();
  if (TEK[key]) return svg(TEK[key]).size(size).flex_none().text_color(t.foreground);
  return null;
}

function satirMark(ad) {
  const s = String(ad || "");
  if (s.startsWith("Gemini")) return "gemini";
  if (s.startsWith("Claude")) return "claude";
  return null;
}

function yaziBaslik(s) {
  const x = String(s ?? "").toLowerCase();
  return x ? x.charAt(0).toUpperCase() + x.slice(1) : "";
}

function cubuk(id, kalan, t) {
  const k = Math.max(0, Math.min(100, Number(kalan) || 0));
  return h_flex().id(id).w_full().h(6).rounded(3).bg(t.raised).overflow_hidden()
    .child(div().h(6).rounded(3).w(`${k}%`).bg(renk(t, k)));
}

export default class Kota extends View {
  init(_props, cx) {
    this.doc = null;
    this.hata = null;
    this.yukleniyor = false;
    this.tepe = false;
    this.scroll = ScrollHandle.new();
    if (checking()) return;
    cx.spawn(async (cx) => {
      try {
        const text = await readTextFile(ONBELLEK());
        if (text) {
          this.doc = JSON.parse(text);
          cx.notify();
          this.tepeye(cx);
        }
      } catch { /* önbellek yoksa ilk okuma beklenir */ }
    });
    cx.timer.every(ARALIK, (cx) => this.yenile(cx));
    this.yenile(cx);
  }

  async betik() {
    try {
      const kendi = await readTextFile(KENDI());
      if (kendi && kendi.trim()) return KENDI();
    } catch { /* kişinin betiği yok: paketteki örnek */ }
    return ORNEK();
  }

  async oku() {
    const script = await this.betik();
    const denemeler = [["python", [script, "--json"]], ["py", ["-3", script, "--json"]], ["python3", [script, "--json"]]];
    let son = null;
    for (const [cmd, args] of denemeler) {
      try { return await exec(cmd, args, { timeout: 180000 }); }
      catch (e) { son = e; }
    }
    throw son || new Error("python bulunamadı");
  }

  yenile(cx) {
    if (this.yukleniyor || window()?.visible === false) return;
    this.yukleniyor = true;
    cx.notify();
    cx.spawn(async (cx) => {
      try {
        const r = await this.oku();
        if (r.code !== 0) throw new Error((r.stderr || r.stdout || "okunamadı").trim().slice(0, 160));
        const ham = r.stdout.slice(r.stdout.indexOf("{"));
        this.doc = JSON.parse(ham);
        this.hata = null;
        cx.notify();
        this.tepeye(cx);
      } catch (e) {
        this.hata = String(e?.message || e).slice(0, 160);
      }
      this.yukleniyor = false;
      cx.notify();
    });
  }

  // Liste boşken en alttayız; veri gelince orada kalıyor. Bir kez başa al.
  tepeye(cx) {
    if (this.tepe || !this.doc) return;
    this.tepe = true;
    cx.timer.after(150, () => this.scroll.scroll_to_item(0));
  }

  satir(t, id, w) {
    if (w.not) {
      return div().id(id).text_size(10.5).text_color(t.dim).truncate().child(w.not);
    }
    const kalan = Number(w.kalan) || 0;
    const ek = w.reset_metin || (kalan >= 99.5 ? "kullanılmadı" : sure(w.reset));
    const rozet = satirMark(w.ad);
    return v_flex().id(id).gap(4).w_full()
      .child(h_flex().w_full().items_center().gap(6)
        .when(Boolean(rozet), (el) => el.child(mark(t, rozet, 12)))
        .child(div().flex_1().min_w(0).truncate().text_color(t.muted).child(w.ad || ""))
        .child(div().flex_none().font_semibold().text_color(renk(t, kalan)).child(yuzdeYazi(kalan))))
      .child(h_flex().w_full().items_center().gap(8)
        .child(div().flex_1().min_w(0).child(cubuk(`${id}-bar`, kalan, t)))
        .when(Boolean(ek), (el) => el.child(div().flex_none().max_w(108).text_size(10).text_color(t.dim).truncate().child(ek))));
  }

  kart(t, id, ad, arac, ic) {
    const logo = mark(t, arac, 16);
    return v_flex().id(id).w_full().rounded(8).border(1).border_color(t.border).bg(t.background).px(10).py(8).gap(7)
      .child(h_flex().w_full().gap(7).items_center()
        .when(Boolean(logo), (el) => el.child(logo))
        .child(div().flex_1().min_w(0).text_size(12.5).text_color(t.foreground).truncate().child(ad)))
      .children(ic);
  }

  govde(t) {
    if (this.hata && !this.doc) {
      return [div().id("kota-hata").rounded(8).border(1).border_color(t.border).bg(t.background).px(10).py(8).text_size(11).text_color(t.blocked).child(this.hata)];
    }
    if (!this.doc) {
      return [div().id("kota-bos").text_color(t.dim).child("okunuyor…")];
    }
    const rows = [];
    let onceki = null;
    for (const h of this.doc.hesaplar || []) {
      const id = `${h.arac}-${h.profil}`;
      if (h.arac !== onceki) {
        const bas = mark(t, h.arac, 14);
        rows.push(h_flex().id(`kota-g-${h.arac}`).pt(onceki ? 6 : 2).gap(7).items_center()
          .when(Boolean(bas), (el) => el.child(bas))
          .child(div().flex_none().text_size(10).text_color(t.dim).child(yaziBaslik(h.baslik)))
          .child(div().flex_1().h(1).bg(t.border)));
        onceki = h.arac;
      }
      const ic = [];
      if (h.hata) {
        ic.push(div().id(`kota-e-${id}`).text_size(10.5).text_color(t.blocked).child(h.hata));
      } else {
        for (let i = 0; i < (h.satirlar || []).length; i++) {
          ic.push(this.satir(t, `kota-s-${id}-${i}`, h.satirlar[i]));
        }
      }
      rows.push(this.kart(t, `kota-a-${id}`, h.ad, h.arac, ic));
    }
    return rows;
  }

  render() {
    const t = theme();
    if (dar()) {
      return v_flex().id("kota-dar").size_full().items_center().justify_center().gap(6)
        .child(svg("mods/kota/quota.svg").size(14).text_color(t.muted))
        .child(div().text_size(11).text_color(t.dim).child("K"));
    }
    const zaman = saat(this.doc?.zaman);
    return v_flex().id("kota").size_full().bg(t.chrome).text_size(11.5)
      .child(h_flex().id("kota-baslik").px(12).h(44).items_center().justify_between().border_b(1).border_color(t.border)
        .child(h_flex().gap(8).items_center().min_w(0)
          .child(svg("mods/kota/quota.svg").size(15).flex_none().text_color(t.muted))
          .child(v_flex().min_w(0).gap(0)
            .child(div().text_size(13).text_color(t.foreground).child("Kotalar"))
            .child(div().text_size(10).text_color(t.dim).child("kalan"))))
        .child(h_flex().gap(8).items_center().flex_none()
          .child(div().text_color(t.dim).child(this.yukleniyor ? "yenileniyor…" : zaman))
          .child(h_flex().id("kota-yenile").h(22).px(8).rounded(6).border(1).border_color(t.border).items_center()
            .text_color(this.yukleniyor ? t.dim : t.foreground)
            .hover((s) => s.bg(t.hover))
            .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
            .on_click((_e, cx) => this.yenile(cx))
            .child(this.yukleniyor ? "…" : "Yenile"))))
      .child(v_flex().id("kota-liste").flex_1().min_h(0).px(10).pt(8).pb(10).gap(8).justify_start().overflow_y_scrollbar().track_scroll(this.scroll).children(this.govde(t)));
  }
}
