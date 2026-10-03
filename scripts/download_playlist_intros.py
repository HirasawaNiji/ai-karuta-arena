"""Fetch exact NetEase recordings using the owner's existing desktop session.

Only complete, non-trial sources are accepted. Credentials never leave memory;
the output contains 30-second MP3s, hashes, provenance and a missing-track report.
Protocol reference: https://github.com/zixing131/pyncm (Apache-2.0).
Requires requests and cryptography; ffmpeg/ffprobe must be installed.
"""
import argparse
import hashlib
import json
import subprocess
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

from netease_client import desktop_session, weapi


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--catalog', type=Path, default=Path('docs/playlists/demo-candidates.json'))
    parser.add_argument('--output', type=Path, default=Path('.local/netease-intros'))
    parser.add_argument('--desktop-profile', type=Path)
    parser.add_argument('--ffmpeg', default='ffmpeg')
    parser.add_argument('--ffprobe', default='ffprobe')
    parser.add_argument('--workers', type=int, default=4)
    parser.add_argument('--limit', type=int)
    args = parser.parse_args()
    data = json.loads(args.catalog.read_text(encoding='utf-8'))
    chosen = {i for ids in data['shortlists'].values() for i in ids}
    songs = [s for s in data['songs'] if s['id'] in chosen and s['catalogStatus'] == 'confirmed']
    if args.limit:
        songs = songs[:args.limit]
    root = args.output.resolve()
    root.mkdir(parents=True, exist_ok=True)
    prior = {}
    if (root/'materials.json').exists():
        prior = {r['id']: r for r in json.loads((root/'materials.json').read_text(encoding='utf-8'))['records']}
    session = desktop_session(args.desktop_profile)
    records, missing = [], []
    jobs = []
    for start in range(0, len(songs), 25):
        batch = songs[start:start+25]
        todo = []
        for song in batch:
            old = prior.get(song['id'])
            if old and (old['sourceSongId'] == song['source']['songId'] or old.get('sourcePlatform') in ['youtube', '5sing']):
                file = root/old['file']
                if file.exists() and hashlib.sha256(file.read_bytes()).hexdigest() == old['audioSha256']:
                    records.append(old)
                    continue
            todo.append(song)
        if not todo:
            continue
        ids = [int(s['source']['songId']) for s in todo]
        details = weapi(session, '/weapi/v3/song/detail', {'c': json.dumps([{'id': i} for i in ids])})
        audio = weapi(session, '/weapi/song/enhance/player/url/v1', {'ids': ids, 'level': 'standard', 'encodeType': 'mp3'})
        by_audio = {str(t['id']): t for t in audio.get('data', [])}
        by_detail = {str(t['id']): t for t in details.get('songs', [])}
        for song in todo:
            sid = song['source']['songId']
            track, detail = by_audio.get(sid, {}), by_detail.get(sid, {})
            reason = None
            if not track.get('url') or track.get('code') != 200:
                reason = 'source-unavailable'
            elif track.get('freeTrialInfo'):
                reason = 'trial-source-rejected'
            elif str(detail.get('al', {}).get('id')) != song['source']['albumId']:
                reason = 'album-version-mismatch'
            elif track.get('time', 0) < 30000 or abs(track.get('time', 0) - detail.get('dt', 0)) > 2000:
                reason = 'incomplete-recording'
            elif not urlparse(track['url']).hostname.endswith(('.music.126.net', '.music.163.com')):
                reason = 'unexpected-media-host'
            if reason:
                missing.append({'id': song['id'], 'title': song['title'], 'sourceSongId': sid, 'reason': reason, 'code': track.get('code')})
            else:
                jobs.append((song, detail, track))
        print(f'API checked {min(start+25,len(songs))}/{len(songs)}; ready {len(jobs)}; unavailable {len(missing)}', flush=True)

    def download(job):
        song, detail, track = job
        filename = song['id']+'.mp3'
        target = root/filename
        temporary = root/(song['id']+'.partial.mp3')
        try:
            # No login cookie is sent to the media CDN. ffmpeg stops reading after 30s.
            result = subprocess.run([args.ffmpeg, '-hide_banner', '-loglevel', 'error', '-y', '-rw_timeout', '30000000', '-i', track['url'], '-t', '30', '-map', '0:a:0', '-vn', '-map_metadata', '-1', '-ac', '2', '-ar', '44100', '-c:a', 'libmp3lame', '-b:a', '96k', '-id3v2_version', '0', '-write_id3v1', '0', str(temporary)], capture_output=True, timeout=120)
            if result.returncode:
                raise RuntimeError('media-download-failed')
            probe = subprocess.run([args.ffprobe, '-v', 'error', '-show_entries', 'format=duration:format_tags', '-of', 'json', str(temporary)], capture_output=True, check=True, timeout=20)
            fmt = json.loads(probe.stdout)['format']
            duration = float(fmt['duration'])
            if not 29.99 <= duration <= 30.15 or fmt.get('tags'):
                raise RuntimeError('invalid-intro-output')
            decode = subprocess.run([args.ffmpeg, '-v', 'error', '-i', str(temporary), '-f', 'null', '-'], capture_output=True, timeout=20)
            if decode.returncode:
                raise RuntimeError('intro-decode-failed')
            temporary.replace(target)
            raw = target.read_bytes()
            return {'id': song['id'], 'title': song['title'], 'artists': song['artistCredits'], 'tagIds': song['tagIds'], 'sourceSongId': song['source']['songId'], 'sourceAlbumId': song['source']['albumId'], 'sourceReference': song['source']['songUrl'], 'recordingDurationMs': detail['dt'], 'audioDurationMs': round(duration*1000), 'introDurationMs': 30000, 'file': filename, 'bytes': len(raw), 'audioSha256': hashlib.sha256(raw).hexdigest(), 'retrievedAt': datetime.now(timezone.utc).isoformat(), 'verification': 'exact-platform-id-full-source-zero-start-decode'}
        except Exception as e:
            temporary.unlink(missing_ok=True)
            # ffmpeg exceptions can contain signed URLs: never log their text.
            return {'id': song['id'], 'title': song['title'], 'sourceSongId': song['source']['songId'], 'reason': str(e) if type(e) is RuntimeError else type(e).__name__}

    def checkpoint():
        mixed = any(r.get('sourcePlatform') in ['youtube', '5sing'] for r in records)
        if mixed:
            for r in records:
                r.setdefault('sourcePlatform', 'netease')
        manifest = {'schemaVersion': 'downloaded-intros-v2' if mixed else 'netease-intros-v1', 'taxonomy': data['taxonomy'], 'records': sorted(records,key=lambda r:r['id'])}
        (root/'materials.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
        report = {'requested': len(songs), 'downloaded': len(records), 'neteaseDownloaded': sum(r.get('sourcePlatform', 'netease') == 'netease' for r in records), 'alternateDownloaded': sum(r.get('sourcePlatform') in ['youtube', '5sing'] for r in records), 'missing': sorted(missing,key=lambda r:r['id']), 'storedSeconds': 30, 'questionSeconds': 10, 'humanListeningChecked': False, 'communityUploadIds': [r['id'] for r in records if r.get('sourceTrust') == 'community-upload']}
        (root/'download-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')

    checkpoint()
    with ThreadPoolExecutor(max_workers=max(1,min(args.workers,8))) as executor:
        for n, future in enumerate(as_completed([executor.submit(download,j) for j in jobs]),1):
            item = future.result()
            (missing if 'reason' in item else records).append(item)
            checkpoint()
            print(f'Processed {n}/{len(jobs)}; downloaded {len(records)}; unavailable {len(missing)}',flush=True)
    checkpoint()
    print(f'Finished: {len(records)}/{len(songs)} intros; {sum(r["bytes"] for r in records)/1024/1024:.1f} MiB; report: {root/"download-report.json"}')


if __name__ == '__main__':
    main()
