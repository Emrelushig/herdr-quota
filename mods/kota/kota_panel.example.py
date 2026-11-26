"""Örnek kota kaynağı. Panel bunu çalıştırır: python kota_panel.py --json

Kendi hesapların için bu dosyayı ~/.herdr-hesaplar/kota_panel.py olarak kopyala
ve aşağıdaki hesabı kendi okuyucunla değiştir. Panel sadece bu JSON şeklini okur.

{
  "zaman": "2026-11-26T21:00:00",
  "hesaplar": [{
    "arac": "claude",
    "baslik": "CLAUDE",
    "profil": "ornek",
    "ad": "ada",
    "hata": null,
    "satirlar": [
      {"ad": "5 saatlik", "kalan": 62, "reset": null, "reset_metin": "4sa 10dk"},
      {"not": "örnek veri"}
    ]
  }]
}

arac şunlardan biri olunca logo gelir: agy, codex, grok, claude.
Satır adı "Gemini" veya "Claude" ile başlarsa o satırın kendi logosu da gelir.
kalan 0 ile 100 arasında kalan orandır. reset ISO tarih olabilir.
"""
import datetime as dt
import json
import sys


def doc():
    return {
        "zaman": dt.datetime.now().isoformat(timespec="seconds"),
        "hesaplar": [
            {
                "arac": "agy",
                "baslik": "ANTIGRAVITY",
                "profil": "ornek",
                "ad": "ada",
                "hata": None,
                "satirlar": [
                    {"ad": "Gemini · haftalık", "kalan": 70, "reset": None, "reset_metin": "6g 4sa"},
                    {"ad": "Claude/GPT · 5 saatlik", "kalan": 12, "reset": None, "reset_metin": "3sa 20dk"},
                ],
            },
            {
                "arac": "codex",
                "baslik": "CODEX",
                "profil": "ornek",
                "ad": "ada",
                "hata": None,
                "satirlar": [
                    {"ad": "5 saatlik", "kalan": 80, "reset": None, "reset_metin": "2sa 5dk"},
                    {"ad": "haftalık", "kalan": 44, "reset": None, "reset_metin": "5g"},
                ],
            },
            {
                "arac": "claude",
                "baslik": "CLAUDE",
                "profil": "ornek",
                "ad": "erin",
                "hata": None,
                "satirlar": [
                    {"ad": "5 saatlik", "kalan": 53, "reset": None, "reset_metin": "4sa 10dk"},
                    {"ad": "haftalık", "kalan": 18, "reset": None, "reset_metin": "3g 2sa"},
                ],
            },
        ],
    }


def main():
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    json.dump(doc(), sys.stdout, ensure_ascii=False)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
