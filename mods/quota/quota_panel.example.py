"""Generate sample Quota data. Run with python quota_panel.example.py --json.

For live quotas, copy this file to ~/.herdr-quota/quota_panel.py and replace
the sample accounts with data from your own reader. Keep the JSON structure
and write it to standard output.
"""
import datetime as dt
import json
import sys


def sample_data():
    return {
        "updated_at": dt.datetime.now().isoformat(timespec="seconds"),
        "accounts": [
            {
                "provider": "antigravity",
                "profile": "demo",
                "name": "Ada",
                "windows": [
                    {"name": "Gemini · Weekly", "remaining": 70, "reset_text": "6d 4h"},
                    {"name": "Claude/GPT · 5-hour", "remaining": 12, "reset_text": "3h 20m"},
                ],
            },
            {
                "provider": "codex",
                "profile": "demo",
                "name": "Ada",
                "windows": [
                    {"name": "5-hour", "remaining": 80, "reset_text": "2h 5m"},
                    {"name": "Weekly", "remaining": 44, "reset_text": "5d"},
                ],
            },
            {
                "provider": "claude",
                "profile": "demo",
                "name": "Erin",
                "windows": [
                    {"name": "5-hour", "remaining": 53, "reset_text": "4h 10m"},
                    {"name": "Weekly", "remaining": 18, "reset_text": "3d 2h"},
                ],
            },
        ],
    }


def main():
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    json.dump(sample_data(), sys.stdout, ensure_ascii=False)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
