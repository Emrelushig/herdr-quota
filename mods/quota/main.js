// Renders remaining quota from a local Python reader.
import { View, div, svg, image } from "gpui-kit";
import { v_flex, h_flex, ScrollHandle } from "gpui-base";
import { exec, theme, checking, layout, window, readTextFile, home, appHome } from "herdr";

function joinPath(root, ...parts) {
  const separator = String(root).includes("\\") ? "\\" : "/";
  return [String(root).replace(/[\\/]+$/, ""), ...parts].join(separator);
}

const READER_PATHS = [
  [".herdr-quota", "quota_panel.py"],
  [".herdr-hesaplar", "kota_panel.py"],
];
const LEGACY_CACHE = () => joinPath(home(), ".herdr-hesaplar", "kota-calisma", "son.json");
const EXAMPLE = () => joinPath(appHome(), "mods", "quota", "quota_panel.example.py");
const REFRESH_INTERVAL = 180000;

function normalizeQuotaData(data) {
  return {
    updated_at: data.updated_at ?? data.zaman,
    accounts: (data.accounts ?? data.hesaplar ?? []).map((account) => {
      const provider = account.provider ?? account.arac;
      return {
        provider: provider === "agy" ? "antigravity" : provider,
        title: account.title ?? account.baslik,
        profile: account.profile ?? account.profil,
        name: account.name ?? account.ad,
        error: account.error ?? account.hata,
        windows: (account.windows ?? account.satirlar ?? []).map((row) => ({
          name: row.name ?? row.ad,
          remaining: row.remaining ?? row.kalan,
          reset: row.reset,
          reset_text: row.reset_text ?? row.reset_metin,
          note: row.note ?? row.not,
        })),
      };
    }),
  };
}

function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

const isNarrow = () => (find(layout(), "quota")?.size?.px ?? Infinity) < 160;

function quotaColor(t, remaining) {
  if (remaining >= 50) return t.done;
  if (remaining >= 20) return t.working;
  return t.blocked;
}

function formatReset(reset) {
  if (!reset) return "";
  const timestamp = Date.parse(String(reset));
  if (Number.isNaN(timestamp)) return "";
  const seconds = Math.floor((timestamp - Date.now()) / 1000);
  if (seconds <= 0) return "";
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days) return `${days}d ${hours}h`;
  if (hours) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function formatTime(value) {
  return String(value ?? "").match(/T(\d{2}:\d{2})/)?.[1] ?? "";
}

function clampPercent(value) {
  return Math.max(0, Math.min(100, Number(value) || 0));
}

function formatPercent(remaining) {
  const value = clampPercent(remaining);
  return value > 0 && value < 10 ? `${value.toFixed(1)}%` : `${Math.round(value)}%`;
}

const COLOR_ICONS = {
  antigravity: "icons/antigravity.svg",
  codex: "icons/codex.svg",
  claude: "icons/claude.svg",
};
const MONO_ICONS = {
  grok: "icons/grok.svg",
  gemini: "icons/gemini.svg",
};

function icon(t, key, size) {
  if (COLOR_ICONS[key]) return image(COLOR_ICONS[key]).w(size).h(size).flex_none();
  if (MONO_ICONS[key]) return svg(MONO_ICONS[key]).size(size).flex_none().text_color(t.foreground);
  return null;
}

function rowIcon(name) {
  const label = String(name ?? "");
  if (label.startsWith("Gemini")) return "gemini";
  if (label.startsWith("Claude")) return "claude";
  return null;
}

function providerLabel(account) {
  const label = String(account.title ?? account.provider ?? "").toLowerCase();
  return label ? label.charAt(0).toUpperCase() + label.slice(1) : "";
}

function quotaBar(id, remaining, t) {
  const value = clampPercent(remaining);
  return h_flex().id(id).w_full().h(6).rounded(3).bg(t.raised).overflow_hidden()
    .child(div().h(6).rounded(3).w(`${value}%`).bg(quotaColor(t, value)));
}

export default class Quota extends View {
  init(_props, cx) {
    this.data = null;
    this.error = null;
    this.loading = false;
    this.scrolledToTop = false;
    this.scroll = ScrollHandle.new();
    if (checking()) return;
    cx.spawn(async (cx) => {
      try {
        const text = await readTextFile(LEGACY_CACHE());
        if (!this.data && text) {
          this.data = normalizeQuotaData(JSON.parse(text));
          cx.notify();
          this.scrollToTop(cx);
        }
      } catch { /* Wait for the first refresh if there is no usable cache. */ }
    });
    cx.timer.every(REFRESH_INTERVAL, (cx) => this.refresh(cx));
    this.refresh(cx);
  }

  async readerPath() {
    for (const parts of READER_PATHS) {
      const path = joinPath(home(), ...parts);
      try {
        if ((await readTextFile(path))?.trim()) return path;
      } catch { /* Try the next reader if this one is unavailable. */ }
    }
    return EXAMPLE();
  }

  async readQuota() {
    const script = await this.readerPath();
    const commands = [["python", [script, "--json"]], ["py", ["-3", script, "--json"]], ["python3", [script, "--json"]]];
    let lastError = null;
    for (const [command, args] of commands) {
      try { return await exec(command, args, { timeout: 180000 }); }
      catch (error) { lastError = error; }
    }
    throw lastError || new Error("Python was not found");
  }

  refresh(cx) {
    if (this.loading || window()?.visible === false) return;
    this.loading = true;
    cx.notify();
    cx.spawn(async (cx) => {
      try {
        const result = await this.readQuota();
        if (result.code !== 0) {
          throw new Error((result.stderr || result.stdout || "Could not read quota").trim().slice(0, 160));
        }
        const start = result.stdout.indexOf("{");
        if (start === -1) throw new Error("The quota reader did not return JSON");
        this.data = normalizeQuotaData(JSON.parse(result.stdout.slice(start)));
        this.error = null;
        cx.notify();
        this.scrollToTop(cx);
      } catch (error) {
        this.error = String(error?.message || error).slice(0, 160);
      }
      this.loading = false;
      cx.notify();
    });
  }

  scrollToTop(cx) {
    if (this.scrolledToTop || !this.data) return;
    this.scrolledToTop = true;
    cx.timer.after(150, () => this.scroll.scroll_to_item(0));
  }

  usageRow(t, id, row) {
    if (row.note) {
      return div().id(id).text_size(10.5).text_color(t.dim).truncate().child(row.note);
    }
    const remaining = Number(row.remaining) || 0;
    const reset = row.reset_text || (remaining >= 99.5 ? "Unused" : formatReset(row.reset));
    const badge = rowIcon(row.name);
    return v_flex().id(id).gap(4).w_full()
      .child(h_flex().w_full().items_center().gap(6)
        .when(Boolean(badge), (el) => el.child(icon(t, badge, 12)))
        .child(div().flex_1().min_w(0).truncate().text_color(t.muted).child(row.name || ""))
        .child(div().flex_none().font_semibold().text_color(quotaColor(t, remaining)).child(formatPercent(remaining))))
      .child(h_flex().w_full().items_center().gap(8)
        .child(div().flex_1().min_w(0).child(quotaBar(`${id}-bar`, remaining, t)))
        .when(Boolean(reset), (el) => el.child(div().flex_none().max_w(108).text_size(10).text_color(t.dim).truncate().child(reset))));
  }

  accountCard(t, id, account, rows) {
    const logo = icon(t, account.provider, 16);
    return v_flex().id(id).w_full().rounded(8).border(1).border_color(t.border).bg(t.background).px(10).py(8).gap(7)
      .child(h_flex().w_full().gap(7).items_center()
        .when(Boolean(logo), (el) => el.child(logo))
        .child(div().flex_1().min_w(0).text_size(12.5).text_color(t.foreground).truncate().child(account.name)))
      .children(rows);
  }

  content(t) {
    if (this.error && !this.data) {
      return [div().id("quota-error").rounded(8).border(1).border_color(t.border).bg(t.background).px(10).py(8).text_size(11).text_color(t.blocked).child(this.error)];
    }
    if (!this.data) {
      return [div().id("quota-loading").text_color(t.dim).child("Loading quotas…")];
    }
    const rows = [];
    let previousProvider = null;
    for (const account of this.data.accounts) {
      const id = `${account.provider}-${account.profile}`;
      if (account.provider !== previousProvider) {
        const logo = icon(t, account.provider, 14);
        rows.push(h_flex().id(`quota-provider-${account.provider}`).pt(previousProvider ? 6 : 2).gap(7).items_center()
          .when(Boolean(logo), (el) => el.child(logo))
          .child(div().flex_none().text_size(10).text_color(t.dim).child(providerLabel(account)))
          .child(div().flex_1().h(1).bg(t.border)));
        previousProvider = account.provider;
      }
      const accountRows = account.error
        ? [div().id(`quota-error-${id}`).text_size(10.5).text_color(t.blocked).child(account.error)]
        : account.windows.map((row, index) => this.usageRow(t, `quota-window-${id}-${index}`, row));
      rows.push(this.accountCard(t, `quota-account-${id}`, account, accountRows));
    }
    return rows;
  }

  render() {
    const t = theme();
    if (isNarrow()) {
      return v_flex().id("quota-narrow").size_full().items_center().justify_center().gap(6)
        .child(svg("mods/quota/quota.svg").size(14).text_color(t.muted))
        .child(div().text_size(11).text_color(t.dim).child("Q"));
    }
    const updatedAt = formatTime(this.data?.updated_at);
    return v_flex().id("quota").size_full().bg(t.chrome).text_size(11.5)
      .child(h_flex().id("quota-header").px(12).h(44).items_center().justify_between().border_b(1).border_color(t.border)
        .child(h_flex().gap(8).items_center().min_w(0)
          .child(svg("mods/quota/quota.svg").size(15).flex_none().text_color(t.muted))
          .child(v_flex().min_w(0).gap(0)
            .child(div().text_size(13).text_color(t.foreground).child("Quotas"))
            .child(div().text_size(10).text_color(t.dim).child("remaining"))))
        .child(h_flex().gap(8).items_center().flex_none()
          .child(div().text_color(t.dim).child(this.loading ? "Refreshing…" : updatedAt))
          .child(h_flex().id("quota-refresh").h(22).px(8).rounded(6).border(1).border_color(t.border).items_center()
            .text_color(this.loading ? t.dim : t.foreground)
            .hover((style) => style.bg(t.hover))
            .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
            .on_click((_e, cx) => this.refresh(cx))
            .child(this.loading ? "…" : "Refresh"))))
      .child(v_flex().id("quota-list").flex_1().min_h(0).px(10).pt(8).pb(10).gap(8).justify_start().overflow_y_scrollbar().track_scroll(this.scroll).children(this.content(t)));
  }
}
