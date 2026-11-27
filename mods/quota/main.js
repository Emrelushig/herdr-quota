// Renders remaining quota from a local Python reader.
import { View, div, svg, image } from "gpui-kit";
import { v_flex, h_flex, ScrollHandle } from "gpui-base";
import { exec, theme, checking, layout, window, readTextFile, home, appHome, shared, setShared, knownAgents, run, spaces, focused, terminals } from "herdr";

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
const PINNED_ACCOUNTS = "quota.pinnedAccounts";

function normalizeQuotaData(data) {
  const accounts = data?.accounts ?? data?.hesaplar;
  if (!Array.isArray(accounts)) throw new Error("The quota reader returned no account list");
  return {
    updated_at: data.updated_at ?? data.zaman,
    accounts: accounts.map((account) => {
      const provider = account.provider ?? account.arac;
      return {
        provider: provider === "agy" ? "antigravity" : provider,
        title: account.title ?? account.baslik,
        profile: account.profile ?? account.profil,
        name: account.name ?? account.ad,
        error: account.error ?? account.hata,
        program: account.program ?? (account.argv?.length === 1 ? account.argv[0] : undefined),
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
  const seconds = Math.ceil((timestamp - Date.now()) / 1000);
  if (seconds <= 0) return "";
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days) return `${days}d ${hours}h`;
  if (hours) return `${hours}h ${minutes}m`;
  return minutes ? `${minutes}m` : "<1m";
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

function accountId(account) {
  return JSON.stringify([account.provider, account.profile]);
}

function pinnedAccounts() {
  const pins = shared(PINNED_ACCOUNTS);
  return Array.isArray(pins) ? pins : [];
}

function quotaRank(account) {
  if (account.error) return -1;
  const rows = account.windows.filter(row =>
    !row.note && row.remaining != null && row.remaining !== "" && Number.isFinite(Number(row.remaining)));
  const weekly = rows.filter(row => /\bweekly\b|haftalık/i.test(row.name ?? ""));
  return Math.max(-1, ...(weekly.length ? weekly : rows).map(row => clampPercent(row.remaining)));
}

async function installedPrograms(accounts) {
  if (!accounts.some(account => typeof account.program === "string" && account.program)) return new Map();
  try {
    return new Map((await knownAgents()).filter(program => program.installed).map(program => [program.key, program]));
  } catch {
    return new Map();
  }
}

function activeProgram(programs) {
  if (!programs.size) return null;
  const address = focused()?.terminal;
  if (!address) return null;
  const terminal = terminals().find(item => item.address === address);
  const label = terminal?.labels?.["herdr.quotaAccount"];
  if (label) return programs.get(label) ?? null;

  const argv = terminal?.argv;
  if (!Array.isArray(argv)) return null;
  for (const program of programs.values()) {
    if (program.run.length === argv.length && program.run.every((arg, i) => arg === argv[i])) return program;
    if (program.run.length === 1 && argv.at(-2)?.toLowerCase() === "-command" &&
        argv.at(-1) === `& '${program.run[0].replace(/'/g, "''")}'`) return program;
  }
  return null;
}

function quotaBar(id, remaining, t) {
  const value = clampPercent(remaining);
  return h_flex().id(id).w_full().h(5).rounded(3).bg(t.raised).overflow_hidden()
    .child(div().h_full().rounded(3).w(`${value}%`).bg(quotaColor(t, value)));
}

export default class Quota extends View {
  init(_props, cx) {
    this.data = null;
    this.error = null;
    this.loading = false;
    this.scrolledToTop = false;
    this.programs = new Map();
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
        const data = normalizeQuotaData(JSON.parse(result.stdout.slice(start)));
        this.data = data;
        this.error = null;
        cx.notify();
        this.scrollToTop(cx);
        this.programs = await installedPrograms(data.accounts);
      } catch (error) {
        this.error = String(error?.message || error).slice(0, 160);
      } finally {
        this.loading = false;
        cx.notify();
      }
    });
  }

  scrollToTop(cx) {
    if (this.scrolledToTop || !this.data) return;
    this.scrolledToTop = true;
    cx.timer.after(150, () => this.scroll.scroll_to_item(0));
  }

  togglePin(id, cx) {
    const pins = pinnedAccounts();
    if (pins.includes(id)) {
      setShared(PINNED_ACCOUNTS, pins.filter(pin => pin !== id));
    } else {
      setShared(PINNED_ACCOUNTS, [id, ...pins]);
      cx.timer.after(150, () => this.scroll.scroll_to_item(0));
    }
  }

  usageRow(t, id, row) {
    if (row.note) {
      return div().id(id).text_size(10.5).text_color(t.dim).truncate().tooltip(row.note).child(row.note);
    }
    const remaining = clampPercent(row.remaining);
    const resetText = row.reset_text ? String(row.reset_text) : "";
    const shortResetText = resetText.replace(/\s+\([A-Za-z_+-]+(?:\/[A-Za-z_+-]+)+\)$/, "");
    const reset = shortResetText || (remaining >= 99.5 ? "Unused" : formatReset(row.reset));
    const timestamp = Date.parse(String(row.reset ?? ""));
    const resetDetails = resetText || (reset !== "Unused" && Number.isFinite(timestamp)
      ? `Resets ${new Date(timestamp).toLocaleString()}` : reset);
    const badge = rowIcon(row.name);
    return v_flex().id(id).gap(3).w_full()
      .child(h_flex().w_full().items_center().gap(6)
        .when(Boolean(badge), (el) => el.child(icon(t, badge, 12)))
        .child(div().flex_1().min_w(0).truncate().tooltip(row.name || "").text_color(t.muted).child(row.name || ""))
        .child(div().flex_none().text_size(13).font_semibold().text_color(quotaColor(t, remaining)).child(formatPercent(remaining))))
      .child(h_flex().w_full().h(13).items_center().gap(7)
        .child(div().flex_1().min_w(0).child(quotaBar(`${id}-bar`, remaining, t)))
        .child(h_flex().w(75).flex_none().justify_end().items_center()
          .when(Boolean(reset), (el) => el.child(div().min_w(0).text_size(10).text_color(t.dim)
            .truncate().tooltip(resetDetails).child(reset)))));
  }

  accountCard(t, id, account, rows, pinned, launcher, active) {
    const logo = icon(t, account.provider, 17);
    const title = `${providerLabel(account)} · ${account.name || account.profile}`;
    const pinButton = h_flex().id(`${id}-pin`).w(22).h(22).flex_none().items_center().justify_center().rounded(4)
      .role("button").accessibility_label(pinned ? `Unpin ${title}` : `Pin ${title} to top`)
      .tooltip(pinned ? "Unpin" : "Pin to top")
      .text_color(pinned ? t.foreground : t.muted).when(pinned, (el) => el.bg(t.selected))
      .cursor_pointer().hover((style) => style.bg(t.selected).text_color(t.foreground))
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      .on_click((_e, cx) => { cx.stop_propagation(); this.togglePin(accountId(account), cx); })
      .child(svg(`mods/workspace-chrome/${pinned ? "pin-off" : "pin"}.svg`).size(13));
    return v_flex().id(id).w_full().rounded(8).border(1).border_color(active ? t.accent : t.border).bg(t.background).overflow_hidden()
      .when(Boolean(launcher), (el) => el.cursor_pointer().hover((style) => style.border_color(active ? t.accent : t.muted))
        .on_click(() => run("tab.new", { name: launcher.name, argv: launcher.run })))
      .child(h_flex().w_full().px(8).py(5).gap(6).items_center().bg(active ? t.selected : t.raised)
        .border_b(1).border_color(t.border)
        .when(Boolean(logo), (el) => el.child(logo))
        .child(div().flex_1().min_w(0).text_size(12).font_semibold().text_color(active ? t.accent : t.foreground)
          .truncate().tooltip(active ? `Active account · ${title}` : title).child(title))
        .when(Boolean(launcher), (el) => el.child(h_flex().w(16).h(22).flex_none().items_center().justify_center()
          .text_color(t.muted).tooltip(`Open ${title} in a new tab`)
          .child(svg("mods/workspace-chrome/chevron-right.svg").size(12))))
        .child(pinButton))
      .child(v_flex().w_full().px(9).py(7).gap(7).children(rows));
  }

  content(t) {
    if (this.error && !this.data) {
      return [div().id("quota-error").rounded(8).border(1).border_color(t.border).bg(t.background).px(10).py(8).text_size(11).text_color(t.blocked).child(this.error)];
    }
    if (!this.data) {
      return [div().id("quota-loading").text_color(t.dim).child("Loading quotas…")];
    }
    if (!this.data.accounts.length) {
      return [div().id("quota-no-accounts").text_color(t.muted).child("No quota accounts configured")];
    }
    const pins = pinnedAccounts();
    const pinOrder = new Map(pins.map((id, index) => [id, index]));
    const position = (account) => pinOrder.get(accountId(account)) ?? pins.length;
    const local = !spaces().find((space) => space.active)?.machine;
    const active = local ? activeProgram(this.programs) : null;
    const accounts = [...this.data.accounts].sort((a, b) => position(a) - position(b) || quotaRank(b) - quotaRank(a));
    return accounts.map((account) => {
      const id = accountId(account);
      const accountRows = account.error
        ? [div().id(`quota-error-${id}`).text_size(10.5).text_color(t.blocked).tooltip(account.error).child(account.error)]
        : account.windows.map((row, index) => this.usageRow(t, `quota-window-${id}-${index}`, row));
      if (!accountRows.length) {
        accountRows.push(div().id(`quota-empty-${id}`).text_size(10.5).text_color(t.dim).child("No quota data"));
      }
      const launcher = local ? this.programs.get(account.program) : null;
      return this.accountCard(t, `quota-account-${id}`, account, accountRows, pinOrder.has(id), launcher, Boolean(active && active === launcher));
    });
  }

  render() {
    const t = theme();
    if (isNarrow()) {
      return v_flex().id("quota-narrow").size_full().items_center().justify_center().gap(6)
        .child(svg("mods/quota/quota.svg").size(14).text_color(t.muted))
        .child(div().text_size(11).text_color(t.dim).child("Q"));
    }
    const updatedAt = formatTime(this.data?.updated_at);
    const status = this.loading ? "Refreshing…" : updatedAt && `Updated ${updatedAt}`;
    const stale = Boolean(this.data && this.error);
    return v_flex().id("quota").size_full().bg(t.chrome).text_size(11.5)
      .child(v_flex().id("quota-header").px(10).py(8).gap(5).flex_none().border_b(1).border_color(t.border)
        .child(h_flex().justify_between().items_center().gap(6)
          .child(h_flex().gap(7).items_center()
            .child(h_flex().w(24).h(24).flex_none().items_center().justify_center().rounded(6).bg(t.raised)
              .text_color(t.accent).child(svg("mods/quota/quota.svg").size(15)))
            .child(div().text_size(15).font_semibold().text_color(t.foreground).child("Quota")))
          .child(h_flex().id("quota-refresh").h(24).px(8).rounded(6).border(1).border_color(t.border).bg(t.raised).items_center()
            .role("button").accessibility_label("Refresh quota")
            .text_color(this.loading ? t.dim : t.foreground)
            .when(!this.loading, (el) => el.cursor_pointer().hover((style) => style.bg(t.hover))
              .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
              .on_click((_e, cx) => this.refresh(cx)))
            .child("Refresh")))
        .child(h_flex().justify_between().items_center().gap(6).text_size(10).text_color(t.dim)
          .child(div().min_w(0).truncate().child("Weekly quota ↓"))
          .when(Boolean(status), (el) => el.child(div().flex_none()
            .tooltip(this.loading ? "Reading account quotas" : `Last updated ${String(this.data.updated_at).replace("T", " ")}`)
            .child(status)))))
      .when(stale, (el) => el.child(div().id("quota-stale").mx(10).mt(7).px(8).py(5).flex_none()
        .rounded(5).border(1).border_color(t.border).text_size(10.5).text_color(t.working)
        .tooltip(this.error).child("Refresh failed · showing saved quotas")))
      .child(v_flex().id("quota-list").flex_1().min_h(0).px(10).pt(8).pb(10).gap(8).justify_start().overflow_y_scrollbar().track_scroll(this.scroll).children(this.content(t)));
  }
}
