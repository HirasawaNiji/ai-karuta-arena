"""Fail-closed checks for the D0 material audit, without external media tools."""
import csv
import io
import subprocess
import sys
import tempfile
import unittest
import warnings
from pathlib import Path
from zipfile import ZipFile

from audit_karuta_package import audit


class AuditInputs(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.archive = Path(self.temp.name) / 'package.zip'
        self.row = dict(track_id='track-1', mapping_status='OK',
                        audio_path='mp3_files/demo.mp3', cover_paths='',
                        work_number='1', work_name='Demo', song_title='Demo', artist='')

    def package(self, members=None):
        csv_text = io.StringIO()
        writer = csv.DictWriter(csv_text, fieldnames=list(self.row))
        writer.writeheader()
        writer.writerow(self.row)
        with ZipFile(self.archive, 'w') as archive:
            archive.writestr('meta/metadata.csv', csv_text.getvalue())
            for name, value in (members or {}).items():
                archive.writestr(name, value)

    def result(self):
        return audit(self.archive, 'must-not-run-ffprobe', 'must-not-run-ffmpeg')

    def test_missing_media_stays_visible_and_ineligible(self):
        self.package()
        report = self.result()
        self.assertEqual(report['metadataRows'], 1)
        self.assertEqual(report['availableRecords'], 0)
        row = report['records'][0]
        self.assertEqual(row['technicalStatus'], 'excluded')
        self.assertFalse(row['productionEligible'])
        self.assertIn('missing_or_ambiguous_audio', row['problems'])
        self.assertIn('missing_cover', row['problems'])

    def test_competing_full_and_segment_paths_are_not_guessed(self):
        self.package({'mp3_files/demo.mp3': b'full', 'mp3_files/seg_30/demo.mp3': b'segment'})
        row = self.result()['records'][0]
        self.assertIn('missing_or_ambiguous_audio', row['problems'])
        self.assertIsNone(row['audio'])

    def test_source_mapping_failure_is_preserved(self):
        self.row['mapping_status'] = 'MISSING_COVER'
        self.package()
        self.assertIn('source_mapping_not_ok', self.result()['records'][0]['problems'])

    def test_duplicate_zip_names_fail_before_interpreting_metadata(self):
        self.package()
        with warnings.catch_warnings():
            warnings.simplefilter('ignore', UserWarning)
            with ZipFile(self.archive, 'a') as archive:
                archive.writestr('meta/metadata.csv', 'ambiguous')
        with self.assertRaisesRegex(ValueError, 'Duplicate ZIP'):
            self.result()

    def test_cli_cannot_overwrite_source(self):
        self.package()
        before = self.archive.read_bytes()
        result = subprocess.run([sys.executable, str(Path(__file__).with_name('audit_karuta_package.py')),
                                 str(self.archive), '--output', str(self.archive)], capture_output=True)
        self.assertEqual(result.returncode, 2)
        self.assertEqual(self.archive.read_bytes(), before)


if __name__ == '__main__':
    unittest.main()
