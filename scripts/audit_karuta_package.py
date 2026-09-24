"""Read-only inventory of the existing JLA metadata/seg_30 package format.

Produces review evidence, never a production-approved question catalog.
Requires ffprobe and ffmpeg; no archive members are extracted by their paths.
"""
import argparse
import csv
import hashlib
import io
import json
import subprocess
import tempfile
from collections import Counter
from pathlib import Path
from zipfile import ZipFile


def digest(data):
    return hashlib.sha256(data).hexdigest()


def probe(data, suffix, ffprobe, ffmpeg):
    with tempfile.TemporaryDirectory() as directory:
        media = Path(directory) / ('asset' + suffix)
        media.write_bytes(data)
        result = subprocess.run([ffprobe, '-v', 'error', '-show_entries',
                                 'format=duration:stream=codec_name,codec_type,width,height',
                                 '-of', 'json', str(media)], capture_output=True, check=True)
        decoded = subprocess.run([ffmpeg, '-v', 'error', '-xerror', '-i', str(media),
                                  '-f', 'null', '-'], capture_output=True)
        info = json.loads(result.stdout)
        return {'durationMs': round(float(info.get('format', {}).get('duration', 0)) * 1000),
                'streams': info.get('streams', []), 'decodeOk': decoded.returncode == 0}


def audit(package, ffprobe, ffmpeg):
    records = []
    with package.open('rb') as source:
        package_hash = hashlib.file_digest(source, 'sha256').hexdigest()
    with ZipFile(package) as archive:
        members = archive.namelist()
        if len(members) != len(set(members)):
            raise ValueError('Duplicate ZIP member names are ambiguous')
        rows = list(csv.DictReader(io.StringIO(archive.read('meta/metadata.csv').decode('utf-8-sig'))))
        track_counts = Counter(row['track_id'] for row in rows)
        for row in rows:
            problems = []
            if row['mapping_status'] != 'OK':
                problems.append('source_mapping_not_ok')
            track = row['track_id']
            if not track or track_counts[track] != 1:
                problems.append('ambiguous_track_id')
            audio_path = row['audio_path']
            # This audit intentionally supports only this known export layout.
            # It must not silently select a filename from another directory.
            segment_path = audio_path.replace('mp3_files/', 'mp3_files/seg_30/', 1)
            matches = [name for name in dict.fromkeys([audio_path, segment_path]) if name in members]
            if len(matches) != 1:
                problems.append('missing_or_ambiguous_audio')
            image_paths = [name for name in row['cover_paths'].split('|') if name]
            image_path = next((name for name in image_paths if name.lower().endswith('.webp')),
                              next(iter(image_paths), None))
            if not image_path or image_path not in members:
                problems.append('missing_cover')
            media = None
            if len(matches) == 1:
                data = archive.read(matches[0])
                media = {'member': matches[0], 'sha256': digest(data), 'bytes': len(data),
                         **probe(data, '.mp3', ffprobe, ffmpeg)}
                if not media['decodeOk'] or media['durationMs'] < 10000:
                    problems.append('unplayable_audio')
                if not any(s['codec_type'] == 'audio' for s in media['streams']):
                    problems.append('missing_audio_stream')
            image = None
            if image_path and image_path in members:
                data = archive.read(image_path)
                image = {'member': image_path, 'sha256': digest(data), 'bytes': len(data),
                         **probe(data, Path(image_path).suffix, ffprobe, ffmpeg)}
                if not image['decodeOk'] or not any(s.get('width', 0) > 0 and s.get('height', 0) > 0 for s in image['streams']):
                    problems.append('unreadable_cover')
            number = int(row['work_number'])
            records.append({'sourceTrackId': track, 'title': row['song_title'],
                            'artist': row['artist'] or None, 'workName': row['work_name'],
                            'engineCardKey': f"{number}|{image_path}|{row['work_name']}" if image else None,
                            'sourceMappingStatus': row['mapping_status'],
                            'audio': media, 'image': image, 'problems': problems,
                            'technicalStatus': 'available' if not problems else 'excluded',
                            'semanticReview': 'pending', 'segmentKind': 'unverified',
                            'sourceRecordingVersion': 'unverified',
                            'productionEligible': False})
    return {'schemaVersion': 'd0-material-audit-v1', 'package': package.name,
            'packageSha256': package_hash, 'metadataRows': len(records),
            'availableRecords': sum(not r['problems'] for r in records),
            'scope': 'Existing user-administered Karuta material; not an open-source license or QQ distribution grant.',
            'records': records}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('package', type=Path)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--ffprobe', default='ffprobe')
    parser.add_argument('--ffmpeg', default='ffmpeg')
    args = parser.parse_args()
    if args.package.resolve() == args.output.resolve():
        parser.error('Output must not overwrite the source archive')
    result = audit(args.package, args.ffprobe, args.ffmpeg)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({k: v for k, v in result.items() if k != 'records'}, ensure_ascii=False))


if __name__ == '__main__':
    main()
