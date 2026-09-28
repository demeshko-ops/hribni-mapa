#!/usr/bin/env python3
"""Build site/data/grid.json: mushroom-growth index for a ~11 km grid over Czechia.

Method follows the published ČHMÚ approach (soil moisture index API30 from the
last 30 days of precipitation + 7-day mean temperature). Thresholds are our own
approximation, NOT the official ČHMÚ product.

Weather data: Open-Meteo.com (CC BY 4.0). Standard library only.
Usage: python3 scripts/build_data.py            # real data
       python3 scripts/build_data.py --fake     # synthetic data for local testing
"""
import json, math, os, random, sys, time, urllib.request, urllib.parse
from datetime import date, datetime, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GRID = json.load(open(os.path.join(ROOT, "scripts", "grid.json")))
OUT = os.path.join(ROOT, "site", "data", "grid.json")

PAST = 36          # days of history (30 for API30 + margin)
FUTURE = 4         # today + 3 days of forecast
K = 0.93           # API decay constant
BATCH = 100


def fetch_batch(pts):
    q = {
        "latitude": ",".join(str(p[0]) for p in pts),
        "longitude": ",".join(str(p[1]) for p in pts),
        "daily": "precipitation_sum,temperature_2m_mean",
        "past_days": PAST,
        "forecast_days": FUTURE,
        "timezone": "Europe/Prague",
    }
    url = "https://api.open-meteo.com/v1/forecast?" + urllib.parse.urlencode(q)
    for attempt in range(5):
        try:
            with urllib.request.urlopen(url, timeout=60) as r:
                data = json.load(r)
            return data if isinstance(data, list) else [data]
        except Exception as e:  # rate limit / transient
            wait = 10 * (attempt + 1)
            print(f"  retry in {wait}s: {e}", file=sys.stderr)
            time.sleep(wait)
    raise SystemExit("Open-Meteo unreachable")


def fake_series(lat, lon):
    rnd = random.Random(int(lat * 1000 + lon * 7))
    wet = 0.5 + 0.5 * math.sin(lon * 1.3) * math.cos(lat * 2.1)
    days = PAST + FUTURE
    p = [max(0.0, rnd.gauss(3 * wet, 4)) if rnd.random() < 0.45 else 0.0 for _ in range(days)]
    t = [12 + 4 * math.sin(i / 6) - (lat - 49.5) * 2 - (0.5 if lon > 16 else 0) for i in range(days)]
    return {"daily": {"time": [str(i) for i in range(days)], "precipitation_sum": p, "temperature_2m_mean": t}}


def api30(p, d):
    return sum((K ** i) * (p[d - i] or 0.0) for i in range(30))


def t7(t, d):
    vals = [x for x in t[d - 6:d + 1] if x is not None]
    return sum(vals) / len(vals) if vals else None


def temp_factor(T):
    if T is None:
        return 0.0
    if T < 4:
        return 0.0
    if T < 10:
        return (T - 4) / 6
    if T <= 20:
        return 1.0
    if T <= 28:
        return 1.0 - 0.6 * (T - 20) / 8
    return 0.4


def score(p, t, d):
    a = api30(p, d)
    T = t7(t, d)
    m = min(1.0, max(0.0, (a - 8) / (35 - 8)))
    return round(100 * m * temp_factor(T)), round(a, 1), None if T is None else round(T, 1)


def main():
    fake = "--fake" in sys.argv
    pts = GRID["points"]
    series = []
    if fake:
        series = [fake_series(*p) for p in pts]
    else:
        for i in range(0, len(pts), BATCH):
            print(f"batch {i // BATCH + 1}/{math.ceil(len(pts) / BATCH)}")
            series += fetch_batch(pts[i:i + BATCH])
            time.sleep(2)
    today = PAST  # index of today in the daily arrays
    cells = []
    for (lat, lon), s in zip(pts, series):
        p = s["daily"]["precipitation_sum"]
        t = s["daily"]["temperature_2m_mean"]
        s0, a0, T0 = score(p, t, today)
        s3, a3, T3 = score(p, t, today + 3)
        r7 = round(sum((x or 0) for x in p[today - 7:today]), 1)
        cells.append([lat, lon, s0, a0, T0, r7, s3, a3, T3])
    day0 = series[0]["daily"]["time"][today] if not fake else date.today().isoformat()
    out = {
        "generated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%MZ"),
        "date": day0,
        "fake": fake,
        "dlat": GRID["dlat"], "dlon": GRID["dlon"],
        "fields": ["lat", "lon", "score", "api30", "t7", "rain7", "score3", "api30_3", "t7_3"],
        "cells": cells,
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    json.dump(out, open(OUT, "w"), separators=(",", ":"))
    avg = sum(c[2] for c in cells) / len(cells)
    print(f"{len(cells)} cells, date {day0}, mean score {avg:.0f}")


if __name__ == "__main__":
    main()
