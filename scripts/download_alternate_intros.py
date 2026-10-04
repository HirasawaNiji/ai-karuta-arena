"""Supplement reviewed original recordings with yt-dlp and author-provided audio.

No login cookies, account IDs, paywall workarounds or media URLs enter the output.
Review the curated plan first; metadata review is not human listening acceptance.
For 5sing, supply a transient URL JSON obtained from normal author-page playback.
"""
import argparse
import hashlib
import json
import re
import subprocess
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

import requests


def run(command, timeout=180):
    result = subprocess.run(command, capture_output=True, timeout=timeout)
    if result.returncode:
        # stderr may contain signed CDN URLs; never include it in reports.
        raise RuntimeError('tool-operation-failed')
    return result.stdout


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--sources', type=Path, default=Path('docs/playlists/alternate-intro-sources.json'))
    parser.add_argument('--catalog', type=Path, default=Path('docs/playlists/demo-candidates.json'))
    parser.add_argument('--output', type=Path, default=Path('.local/netease-intros'))
    parser.add_argument('--yt-dlp', default='yt-dlp')
    parser.add_argument('--source-cache', type=Path)
    parser.add_argument('--author-media', type=Path)
    parser.add_argument('--ffmpeg', default='ffmpeg')
    parser.add_argument('--ffprobe', default='ffprobe')
    args = parser.parse_args()
    plan = json.loads(args.sources.read_text(encoding='utf-8'))
    catalog = json.loads(args.catalog.read_text(encoding='utf-8'))
    chosen = {i for ids in catalog['shortlists'].values() for i in ids}
    songs = {s['id']: s for s in catalog['songs'] if s['id'] in chosen and s['catalogStatus'] == 'confirmed'}
    if plan['schemaVersion'] != 1 or len({s['id'] for s in plan['sources']}) != len(plan['sources']):
        raise RuntimeError('invalid-source-plan')
    root = args.output.resolve()
    manifest_path = root/'materials.json'
    manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
    if manifest['schemaVersion'] not in ['netease-intros-v1', 'downloaded-intros-v2']:
        raise RuntimeError('invalid-base-manifest')
    records = {r['id']: r for r in manifest['records']}
    for r in records.values():
        r.setdefault('sourcePlatform', 'netease')
    author_media = json.loads(args.author_media.read_text(encoding='utf-8')) if args.author_media else {}
    outcomes = []

    def save():
        merged = {'schemaVersion': 'downloaded-intros-v2', 'taxonomy': manifest['taxonomy'], 'records': sorted(records.values(), key=lambda r:r['id'])}
        temporary = root/'materials.partial.json'
        temporary.write_text(json.dumps(merged, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
        temporary.replace(manifest_path)
        missing = [{'id':sid,'title':s['title'],'reason':'no-accepted-source'} for sid,s in songs.items() if sid not in records]
        report = {'requested':len(songs),'downloaded':len(records),'neteaseDownloaded':sum(r['sourcePlatform']=='netease' for r in records.values()),'alternateDownloaded':sum(r['sourcePlatform']!='netease' for r in records.values()),'missing':missing,'alternateResults':outcomes,'storedSeconds':30,'questionSeconds':10,'humanListeningChecked':False,'communityUploadIds':[r['id'] for r in records.values() if r.get('sourceTrust')=='community-upload']}
        (root/'download-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')

    for source in plan['sources']:
        sid = source['id']
        temporary = root/(sid+'.partial.mp3')
        try:
            if sid not in songs or source['sourceStartMs'] != 0 or not source['review'].strip():
                raise RuntimeError('unreviewed-or-nonzero-source')
            song = songs[sid]
            platform, source_id = source['platform'], source['sourceId']
            if platform == 'youtube' and re.fullmatch(r'[A-Za-z0-9_-]{11}', source_id):
                reference = 'https://www.youtube.com/watch?v='+source_id
                metadata = json.loads(run([args.yt_dlp,'--no-playlist','--skip-download','--dump-single-json','--no-warnings',reference]))
                if metadata.get('id') != source_id or metadata.get('channel_id') != source['channelId'] or metadata.get('title') != source['expectedTitle'] or metadata.get('album') != source['expectedPlatformAlbum'] or abs(metadata['duration']-source['expectedDurationSeconds']) > 2:
                    raise RuntimeError('platform-metadata-changed')
                media_duration_ms = round(metadata['duration']*1000)
            elif platform == '5sing' and source_id.isdigit():
                reference = 'https://5sing.kugou.com/yc/'+source_id+'.html'
                response = requests.get(reference,timeout=30)
                response.raise_for_status()
                html = response.text
                if not all(text in html for text in ['var SongID     = '+source_id+';', 'var OwnerUserID = '+source['channelId']+';', source['expectedTitle'], '免费下载', 'COP', '洛天依', '乐正绫']):
                    raise RuntimeError('author-page-metadata-changed')
                media_duration_ms = round(source['expectedDurationSeconds']*1000)
            else:
                raise RuntimeError('unsupported-source')
            prior = records.get(sid)
            if prior and prior.get('sourcePlatform') == platform and prior['sourceSongId'] == source_id and prior.get('sourceReview') == source['review']:
                old = root/prior['file']
                if old.is_file() and hashlib.sha256(old.read_bytes()).hexdigest() == prior['audioSha256']:
                    outcomes.append({'id':sid,'status':'reused','platform':platform})
                    save()
                    print(sid,'reused',flush=True)
                    continue
            with tempfile.TemporaryDirectory(prefix='alternate-',dir=root) as working:
                work = Path(working)
                cached = []
                if args.source_cache:
                    prefix = source_id if platform == 'youtube' else '5sing-'+source_id
                    cached = [p for p in args.source_cache.glob(prefix+'.*') if p.suffix in ['.webm','.m4a','.mp3','.mp4']]
                if cached:
                    media = cached[0]
                elif platform == 'youtube':
                    run([args.yt_dlp,'--no-playlist','--no-warnings','--no-progress','--extractor-args','youtube:player_client=visionos','-f','bestaudio','-o',str(work/'source.%(ext)s'),reference])
                    media = next(work.glob('source.*'))
                else:
                    url = author_media.get(sid,'')
                    host = urlparse(url).hostname or ''
                    if urlparse(url).scheme != 'https' or not host.endswith('.kugou.com'):
                        raise RuntimeError('author-playback-url-required')
                    media = work/'source.mp3'
                    # A normal public author-page playback URL, no login cookie.
                    response = requests.get(url,headers={'Referer':reference},timeout=60)
                    response.raise_for_status()
                    media.write_bytes(response.content)
                source_duration = float(json.loads(run([args.ffprobe,'-v','error','-show_entries','format=duration','-of','json',str(media)],30))['format']['duration'])
                if abs(source_duration-media_duration_ms/1000) > 2 or source_duration < 30:
                    raise RuntimeError('incomplete-source')
                run([args.ffmpeg,'-hide_banner','-loglevel','error','-y','-i',str(media),'-t','30','-map','0:a:0','-vn','-map_metadata','-1','-ac','2','-ar','44100','-c:a','libmp3lame','-b:a','96k','-id3v2_version','0','-write_id3v1','0',str(temporary)])
            fmt = json.loads(run([args.ffprobe,'-v','error','-show_entries','format=duration:format_tags','-of','json',str(temporary)],30))['format']
            duration = float(fmt['duration'])
            if not 30 <= duration <= 30.15 or fmt.get('tags'):
                raise RuntimeError('invalid-intro')
            run([args.ffmpeg,'-v','error','-i',str(temporary),'-f','null','-'],30)
            target = root/(sid+'.mp3')
            temporary.replace(target)
            raw = target.read_bytes()
            minutes,seconds = map(int,song['duration'].split(':'))
            records[sid] = {'id':sid,'title':song['title'],'artists':song['artistCredits'],'tagIds':song['tagIds'],'sourcePlatform':platform,'sourceSongId':source_id,'sourceChannelId':source['channelId'],'sourceAlbum':source['albumLabel'],'sourceTrust':source['sourceTrust'],'sourceReview':source['review'],'sourceStartMs':0,'sourceDurationMs':round(source_duration*1000),'sourceReference':reference,'recordingDurationMs':(minutes*60+seconds)*1000,'audioDurationMs':round(duration*1000),'introDurationMs':30000,'file':target.name,'bytes':len(raw),'audioSha256':hashlib.sha256(raw).hexdigest(),'retrievedAt':datetime.now(timezone.utc).isoformat(),'verification':'reviewed-platform-metadata-original-intro-decode'}
            outcomes.append({'id':sid,'status':'downloaded','platform':platform})
            print(sid,'downloaded',platform,flush=True)
        except Exception as error:
            temporary.unlink(missing_ok=True)
            reason = str(error) if type(error) is RuntimeError else type(error).__name__
            outcomes.append({'id':sid,'status':'failed','reason':reason})
            print(sid,'failed',reason,flush=True)
        save()
    print('Library:',len(records),'/',len(songs),flush=True)


if __name__ == '__main__':
    main()
