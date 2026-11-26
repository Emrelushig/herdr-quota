# Quota

See how much quota you have left without leaving your Herdr terminal. Open Quota for account cards with provider logos, remaining percentages, usage bars and reset times. Try it with sample data, then connect your own local reader for live Antigravity, Codex, Claude or Grok quotas.

![Quota beside the terminal in Herdr](preview.png)

## What you see

The window uses Herdr's main layout and a `canvas` background. The left sidebar is 268px wide with a `chrome` background, a 44px minimum and a 480px maximum. It contains the workspace brand at 46px, spaces and agents sharing the remaining height with a 90px minimum each, and the workspace footer at 69px.

The work column has a 42px draggable tab bar. An 8px padded row with an 8px gap holds the terminal, the Files and Changes stack, and Quota. The terminal fills the remaining width and its panes have an 8px gap, a 10px radius, a 1px `border`, a 1px `accent` focus ring and an always-visible 30px header. The Files and Changes stack starts hidden at 368px wide and can range from 280px to 900px. Quota starts at 320px and can range from 240px to 520px. It uses a `chrome` background, 10px corner radius and 1px `border`. A 28px status bar sits at the bottom. The system title bar is hidden and macOS traffic lights sit at 12, 16.

The 44px panel header shows a bar-chart icon, Quotas, remaining, the last refresh time and a Refresh button. Below it, each provider has an icon, a muted name and a divider. Account cards have an 8px radius, a 1px `border`, a `background` fill, 10px horizontal padding and 8px vertical padding. Each card title pairs the account name with a 16px logo.

Each usage window shows a label, a remaining percentage, a 6px bar and optional reset text. The theme supplies colors through `done` at 50% and above, `working` from 20% to below 50%, and `blocked` below 20%. Values above zero and below 10% show one decimal. At 99.5% or above, the reset label reads Unused unless the reader supplies `reset_text`. Notes appear in muted text without a bar.

Herdr supplies the Antigravity, Codex and Claude color logos and the monochrome Grok and Gemini logos. Rows whose labels start with Gemini or Claude also show a 12px logo.

## How it behaves

Refresh runs the local quota reader and updates the panel. The reader runs on the first open and the panel checks again every three minutes while the window is visible. While it runs, the status says Refreshing… and the button shows an ellipsis. If the reader fails, the panel keeps any previously loaded data. With no data loaded, it displays the error. While the first read is in progress, it shows Loading quotas….

Quota in the tab bar toggles the right-hand panel and uses the selected background while the panel is visible. Files and Changes keep their own toggles. Below 160px, Quota shows its icon and the letter Q.

## Built from

[layouts/quota.json](layouts/quota.json) adapts Herdr's main layout from 0.1.18. The tab block uses `tabs-quota`, and the final child of `work-body` is the `quota` block. The other blocks use the shipped `workspace-chrome`, `spaces`, `agents`, `pane`, `files`, `changes` and `workspace-status` mods.

[mods/tabs-quota/](mods/tabs-quota) adapts the shipped tabs mod. It draws Quota after Changes when the layout contains a `quota` node. Clicking it runs `layout.hide` or `layout.show` with that node ID. The mod directory also provides its Windows window-control icons.

[mods/quota/main.js](mods/quota/main.js) renders the panel. It uses Herdr's theme, layout, window, home, app home, file reader and command runner. The bar-chart icon is [mods/quota/quota.svg](mods/quota/quota.svg). Provider icons come from Herdr's `icons/` directory.

The panel looks for `~/.herdr-quota/quota_panel.py`, then the earlier `~/.herdr-hesaplar/kota_panel.py`. If neither reader exists or both are empty, it runs [the bundled example](mods/quota/quota_panel.example.py). It tries `python <script> --json`, `py -3 <script> --json` and `python3 <script> --json` in that order. If a process starts and exits with a nonzero status, the panel treats it as a reader error. The timeout is 180 seconds. The JSON object starts at the first `{` in stdout.

The expected object has `updated_at` and an `accounts` array. Each account has `provider`, `profile`, `name` and `windows`, with optional `title` and `error` strings. Provider keys are `antigravity`, `codex`, `claude` and `grok`. A window has a `name`, a `remaining` percentage from 0 to 100, and optional `reset` (ISO timestamp) or `reset_text` (display string). A note row has a `note` string.

Earlier readers' field names and the `agy` provider key remain accepted. If present, the earlier cache at `~/.herdr-hesaplar/kota-calisma/son.json` can supply a first view while the reader runs. Account names, custom window labels and reader-provided reset text are displayed as supplied.

## Watch out

The sample accounts Ada and Erin use fixture data. A local reader supplies live values and handles provider authentication. Keep private account configuration local.

The bundled tab bar is a copy of Herdr 0.1.18. New features in Herdr's stock tab bar require updating the copied mod. The layout relies on Herdr's built-in provider icons.

## Done when

`herdr-app check` passes for `mods/quota` and `mods/tabs-quota`. Switching to Quota shows the terminal and the Files, Changes and Quota buttons. Quota toggles the panel. With the sample reader, the panel lists Ada under Antigravity and Codex and Erin under Claude with icons, usage bars, remaining percentages and reset times. Refresh runs the reader again. An invalid reader shows an error when no quota data has loaded.
