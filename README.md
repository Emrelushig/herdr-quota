# Herdr Kota

A Herdr desktop layout with a quota panel beside the terminal. The **Quota** button shows or hides the panel. Each account card shows remaining usage by window and the next reset when the quota source provides it.

![Herdr Kota with sample accounts](preview.png)

## Install

Give this repository link to your Herdr agent and ask it to add the layout. For manual setup:

1. Copy `layouts/kota.json` and both folders under `mods/` into the corresponding directories in your Herdr app home (typically `~/.config/herdr-app`).
2. Select **Kota** with Herdr's layout switcher (`Ctrl+Shift+L`).
3. Open **Quota**. Python 3 is required to run the quota reader. The panel labels are in Turkish.

The bundled Python reader shows sample accounts. To display your own quotas, use `mods/kota/kota_panel.example.py` as a JSON format reference and place your own reader at `~/.herdr-hesaplar/kota_panel.py`. The panel runs the local reader when you open it and when you select **Yenile** (Refresh).

See [RECIPE.md](RECIPE.md) for the layout, refresh behavior, and quota format.

## Credits

`layouts/kota.json` and `mods/tabs-kota/` adapt the main layout and tabs mod from [Herdr App 0.1.18](https://github.com/herdrdev/herdr-app/tree/v0.1.18). The layout adds the quota panel, and the tabs mod adds its toggle. Provider icons are supplied by Herdr. See the upstream [Apache 2.0 license](LICENSE).
