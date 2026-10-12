import importlib.util
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from docx import Document

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / 'scripts/workflow.py'
spec = importlib.util.spec_from_file_location('capture_workflow', SCRIPT)
workflow = importlib.util.module_from_spec(spec)
spec.loader.exec_module(workflow)


class VideoCaptureTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.job = Path(self.temp.name)
        doc = Document()
        doc.add_paragraph('匿名视频整理测试')
        doc.save(self.job / 'source.docx')
        doc.save(self.job / 'rewrite.docx')
        self.action('init', '--source-kind', 'video', '--url', 'https://example.test/video', '--rights', 'provided')
        self.artifact = self.job / 'transcript.json'
        self.artifact.write_text('{"text":"测试", "checked":false}', encoding='utf-8')
        self.report = {'version': 1, 'source_url': 'https://example.test/video',
                       'basis': 'full_audio_transcription', 'expected_duration_seconds': 120,
                       'processed_duration_seconds': 120, 'full_timeline_checked': True,
                       'review': {'checked': True, 'note': 'TEST FIXTURE: checked full timeline and screen details'},
                       'unresolved_gaps': [],
                       'artifacts': [{'path': 'transcript.json', 'sha256': workflow.digest(self.artifact)}]}

    def action(self, action, *args, ok=True):
        r = subprocess.run([sys.executable, str(SCRIPT), action, '--job', str(self.job), *args], capture_output=True, text=True)
        self.assertEqual(r.returncode == 0, ok, r.stdout + r.stderr)
        return r

    def submit(self, ok=True):
        path = self.job / 'capture-report.json'
        path.write_text(json.dumps(self.report), encoding='utf-8')
        return self.action('submit-source', '--document', str(self.job / 'source.docx'),
                           '--coverage', 'complete', '--capture-report', str(path), ok=ok)

    def test_complete_video_requires_report(self):
        self.action('submit-source', '--document', str(self.job / 'source.docx'), '--coverage', 'complete', ok=False)

    def test_chapter_summary_cannot_become_complete_speech(self):
        self.report['basis'] = 'chapter_summary'
        self.submit(ok=False)

    def test_browser_raw_unreviewed_result_does_not_advance(self):
        self.report['review']['checked'] = False
        self.submit(ok=False)

    def test_gaps_cannot_be_hidden_by_matching_duration(self):
        self.report['unresolved_gaps'] = ['20–30s missing speech']
        self.submit(ok=False)

    def test_duration_mismatch_requires_actual_note(self):
        self.report['processed_duration_seconds'] = 60
        self.submit(ok=False)
        self.report['review']['duration_note'] = 'TEST FIXTURE: explicitly checked scope'
        self.submit()

    def test_source_url_mismatch_rejected(self):
        self.report['source_url'] = 'https://example.test/other'
        self.submit(ok=False)

    def test_original_artifact_changed_blocks_confirmation(self):
        self.submit()
        self.artifact.write_text('changed after capture review')
        self.action('confirm-source', '--evidence', 'TEST FIXTURE ONLY', ok=False)

    def test_report_changed_blocks_confirmation(self):
        self.submit()
        (self.job / 'capture-report.json').write_text('{}')
        self.action('confirm-source', '--evidence', 'TEST FIXTURE ONLY', ok=False)

    def test_human_confirmation_still_separate(self):
        self.submit()
        self.action('submit-rewrite', '--document', str(self.job / 'rewrite.docx'), ok=False)
        self.action('confirm-source', '--evidence', 'TEST FIXTURE ONLY')
        self.action('submit-rewrite', '--document', str(self.job / 'rewrite.docx'))
        self.action('confirm-rewrite', '--evidence', 'TEST FIXTURE ONLY')
        workflow.validate_ready(self.job, json.loads((self.job / 'job.json').read_text()))

    def test_evidence_outside_job_rejected(self):
        self.report['artifacts'][0]['path'] = '../not-in-job.json'
        self.submit(ok=False)

    def test_partial_video_deliverable_but_not_confirmable(self):
        self.action('submit-source', '--document', str(self.job / 'source.docx'), '--coverage', 'partial')
        self.action('confirm-source', '--evidence', 'TEST FIXTURE ONLY', ok=False)


if __name__ == '__main__':
    unittest.main()
