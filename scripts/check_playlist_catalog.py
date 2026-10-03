"""Validate the reviewed candidate catalog and render its human review document."""

import argparse
import json
import re
from collections import Counter, defaultdict
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CATALOG = ROOT / "docs/playlists/demo-candidates.json"
REPORT = ROOT / "docs/playlists/demo-candidates.md"


def artist_key(name):
    return name.casefold().replace("洛天依official", "洛天依").replace("(g)i-dle", "i-dle")


def artist_counts(songs):
    return Counter(a for s in songs for a in set(map(artist_key, s["artistCredits"])))


def cell(value):
    return str(value).replace("|", "\\|").replace("\n", " ")


def validate(data):
    songs = data["songs"]
    by_id = {s["id"]: s for s in songs}
    taxonomy = {t["id"]: t for t in data["taxonomy"]}
    assert len(taxonomy) == len(data["taxonomy"]) == 16
    assert len(songs) == len(by_id), "Duplicate candidate ID"
    assert all(f"S{i:03}" in by_id for i in range(1, 399)), "Original S001-S398 IDs must survive"
    assert data["taxonomyVersion"] == "onboarding-tags-v2"
    server = (ROOT / "apps/server/src/materials.ts").read_text(encoding="utf-8")
    for tag in taxonomy.values():
        assert f"id: '{tag['id']}'" in server, tag
        assert f"label: '{tag['label']}'" in server, tag
    assert set(data["shortlists"]) == set(taxonomy)
    assert {t for g in data["groups"] for t in g["tagIds"]} == set(taxonomy)
    recording_ids = set()
    for s in songs:
        assert re.fullmatch(r"S\d{3,}", s["id"])
        assert s["title"] and s["artist"] and s["album"] and s["artistCredits"], s["id"]
        assert s["tagIds"] and set(s["tagIds"]) <= set(taxonomy), s["id"]
        assert len(set(s["tagIds"])) == len(s["tagIds"])
        assert s["catalogStatus"] in {"confirmed", "unresolved"}
        if s["catalogStatus"] == "unresolved":
            assert s["revisionNote"] and s["searchQueries"], s["id"]
            continue
        src = s["source"]
        for kind in ("song", "album"):
            assert re.fullmatch(r"\d+", src[kind + "Id"]), s["id"]
            assert src[kind + "Url"] == f"https://music.163.com/#/{kind}?id={src[kind + 'Id']}"
        assert src["songId"] not in recording_ids, "One platform recording used as two candidates"
        recording_ids.add(src["songId"])
        assert src["evidence"] == "album-tracklist"
        assert src["observedAlbum"] == s["album"]
        assert src["observedArtist"] == "/".join(s["artistCredits"]), s["id"]
        assert s["artist"] == "、".join(s["artistCredits"]), s["id"]
        assert src["observedTitle"] == s["platformTitle"]
        assert src["observedReleaseDate"] == s["releaseDate"]
        assert s["year"] == str(date.fromisoformat(s["releaseDate"]).year)
        date.fromisoformat(src["checkedOn"])
        assert re.fullmatch(r"\d+:\d{2}", s["duration"]), s["id"]
    for tid, ids in data["shortlists"].items():
        assert len(ids) == len(set(ids)) == 30, tid
        selected = [by_id[i] for i in ids]
        assert all(s["catalogStatus"] == "confirmed" and tid in s["tagIds"] for s in selected), tid
        assert max(artist_counts(selected).values()) <= 5, tid
    return by_id, taxonomy


def render(data, by_id, taxonomy):
    songs = data["songs"]
    confirmed = [s for s in songs if s["catalogStatus"] == "confirmed"]
    unresolved = [s for s in songs if s["catalogStatus"] == "unresolved"]
    selected_ids = {i for ids in data["shortlists"].values() for i in ids}
    releases = defaultdict(list)
    for s in confirmed:
        releases[s["source"]["albumId"]].append(s)
    out = [
        "# Demo 歌单审阅稿 v0.2", "",
        "对应 [Issue #65](https://github.com/HirasawaNiji/ai-karuta-arena/issues/65)。本表由 [候选数据](demo-candidates.json) 生成，供选曲和版本审阅。", "",
        f"共 **{len(songs)} 首候选**：**{len(confirmed)} 首**已在网易云网页精确到歌曲与专辑曲目表确认，**{len(unresolved)} 首**待定。16 个标签各列 30 首已确认候选，去重后为 **{len(selected_ids)} 首**；其他已确认候选 {len(confirmed)-len(selected_ids)} 首。", "",
        "保留原稿 S001–S398 编号，新增 S399《フォニイ》和 S400《上弦の月》，用于分散虚拟歌手声库。歌曲可以属于多个标签。", "",
        "## 阅读口径", "",
        "- 核验日期：2026-10-03。证据为网易云官方网页专辑曲目表、歌曲链接、艺人署名和发行时间；从歌曲搜索未找到时进一步查询专辑。",
        "- 年份是**所选网易云发行条目**的年份，可能为精选或再版年份。原稿的标题、歌手、专辑、年份、备注保存在 JSON 的 `originalProposal`，便于对照；它们不是已核验事实。",
        "- 表内艺人采用平台署名。游戏原声有时列制作团队或作曲者，不能据此断言其本人演唱；原稿误署周深的《Da Capo》已改为 HOYO-MiX。",
        "- 同版候选按网页版本标注、艺人和时长筛选；现场、混音、重录、TV Edit 和其他语种不自动替代。录音是否完全一致仍需后续试听确认。",
        "- 单曲／EP优先；同专辑按平台 album ID 统计，不把不同 album ID 直接当成封面图片不同。封面的实际视觉辨识度留待卡牌审阅。",
        "- 每个标签的30首推荐中，任一平台署名最多5首；合唱、制作团队和声库均保守计入，洛天依／洛天依Official 等别名归并。候选池中的备用曲另列，不宣称全池每个艺人都不超过5首。",
        "- 标签沿用 WebUI 的 `onboarding-tags-v2`。语种按录音语言；影视指真人影视，动漫单列；真人演唱的虚构角色不标虚拟歌手。纯音乐和法语、虚构语言不强塞进现有语言标签。曲风是供审阅的编辑判断。",
        "- 已确认收录只表示目录存在。本次不核验 VIP／下载资格，不下载或转换音频；未替换 PJSK 音频，也未接入运行时可玩题库。", "",
        "## 总体组成", "",
        "| 分组 | 标签 | 原稿及新增候选 | 已确认候选 | 推荐 | 推荐中最多同艺人 | 推荐涉及专辑 |",
        "| --- | --- | ---: | ---: | ---: | ---: | ---: |",
    ]
    for group in data["groups"]:
        for tid in group["tagIds"]:
            chosen=[by_id[i] for i in data["shortlists"][tid]]
            out.append(f"| {group['label']} | {taxonomy[tid]['label']} | {sum(tid in s['tagIds'] for s in songs)} | {sum(tid in s['tagIds'] for s in confirmed)} | 30 | {max(artist_counts(chosen).values())} | {len({s['source']['albumId'] for s in chosen})} |")
    out += ["", "## 本轮重点修订", "",
        "- 《当年情》改到《爱火》；《尘世闲游》改到《闪耀的群星》第一辑；《Grievous Lady》改到 Memories of Conflict。",
        "- 《ヒビカセ》改为 No title＋ 的初音版本；《右肩の蝶》锁定镜音连；《普通DISCO》从原专辑页找回。",
        "- 《LOVE SCENARIO》锁定 2018-01-25 韩语版 Return；DDU-DU DDU-DU、春日等检索时明确区分日语版和现场版。",
        "- 《成都》《Yellow》《千本桜》《Shape of You》等优先采用独立发行；所有变化都可在 JSON 的 `originalProposal`、`revisionNote` 与来源链接中追溯。", "",
        "## 待定曲目（不计入30首推荐）", "",
        "没有定位到目标发行不等于平台全站不存在。这里保留原候选，不用同名翻唱或不同录音偷偷替换。", "",
        "| 编号 | 歌曲 | 原拟艺人 | 原拟专辑 | 原因 |", "| --- | --- | --- | --- | --- |"]
    for s in unresolved:
        out.append("| " + " | ".join(cell(s[k]) for k in ("id","title","artist","album","revisionNote")) + " |")
    out += ["", "## 共用专辑条目", "", "以下只统计已确认候选；不同发行之间仍可能使用相同封面图片。", "", "| 专辑 | 候选 |", "| --- | --- |"]
    for group in releases.values():
        if len(group)>1:
            out.append(f"| [{cell(group[0]['album'])}]({group[0]['source']['albumUrl']}) | " + "、".join(f"{s['id']} {cell(s['title'])}" for s in group) + " |")
    for group in data["groups"]:
        out += ["", f"## {group['label']}", ""]
        for tid in group["tagIds"]:
            out += [f"### {taxonomy[tid]['label']} · 30 首", "", "| 编号 | 歌曲 | 艺人（平台署名） | 所选专辑 | 年份 |", "| --- | --- | --- | --- | ---: |"]
            for sid in data["shortlists"][tid]:
                s=by_id[sid]
                out.append(f"| {sid} | [{cell(s['title'])}]({s['source']['songUrl']}) | {cell(s['artist'])} | [{cell(s['album'])}]({s['source']['albumUrl']}) | {s['year']} |")
            out.append("")
    out += ["## 其他已确认候选", "", "以下未进入本稿任一标签的30首首选，可用于调整。", "", "| 编号 | 歌曲 | 艺人 | 专辑 | 年份 | 标签 |", "| --- | --- | --- | --- | ---: | --- |"]
    for s in confirmed:
        if s['id'] not in selected_ids:
            out.append(f"| {s['id']} | [{cell(s['title'])}]({s['source']['songUrl']}) | {cell(s['artist'])} | [{cell(s['album'])}]({s['source']['albumUrl']}) | {s['year']} | {'、'.join(taxonomy[t]['label'] for t in s['tagIds'])} |")
    out += ["", "## 修改与复核", "", "编辑 JSON 后运行 `python scripts/check_playlist_catalog.py --write` 重建此表；不带 `--write` 时核验编号、标签、来源字段、年份、曲目去重、每标签30首、艺人上限和文档同步。该检查验证数据约束，不会重新联网验证网页或音频。", ""]
    return "\n".join(out)


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--write", action="store_true")
    args=parser.parse_args()
    data=json.loads(CATALOG.read_text(encoding="utf-8"))
    by_id,taxonomy=validate(data)
    report=render(data,by_id,taxonomy)
    if args.write:
        REPORT.write_text(report,encoding="utf-8",newline="\n")
    else:
        assert REPORT.read_text(encoding="utf-8")==report, "Regenerate report with --write"
    confirmed=sum(s['catalogStatus']=='confirmed' for s in data['songs'])
    print(f"Playlist checks passed: {len(by_id)} candidates, {confirmed} confirmed, 16 x 30 recommendations; artist cap <= 5.")


if __name__=="__main__":
    main()
