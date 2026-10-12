#!/usr/bin/env python3
"""Record human review gates; never infer or synthesize user approval."""
import argparse
import hashlib
import json
import math
from datetime import datetime, timezone
from pathlib import Path


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def record_document(job, document):
    job = Path(job).resolve()
    path = Path(document).resolve()
    if not path.is_file() or path.suffix.lower() != '.docx':
        raise ValueError('Document must be an existing DOCX')
    try:
        relative = path.relative_to(job)
    except ValueError:
        raise ValueError('Keep document versions inside the job directory')
    return {'path': relative.as_posix(), 'sha256': digest(path)}


def verify_document(job, record):
    job = Path(job).resolve()
    path = (job / record['path']).resolve()
    if not path.is_relative_to(job):
        raise ValueError('Document path escapes job directory')
    if not path.is_file() or digest(path) != record['sha256']:
        raise ValueError('Reviewed document changed; submit and confirm its new version')


def capture_file(job, record):
    if (not isinstance(record, dict) or not isinstance(record.get('path'), str)
            or not record['path'].strip() or Path(record['path']).is_absolute()
            or not isinstance(record.get('sha256'), str)):
        raise ValueError('Capture artifact requires a relative path and SHA256')
    job = Path(job).resolve()
    path = (job / record['path']).resolve()
    if not path.is_relative_to(job) or not path.is_file() or digest(path) != record['sha256']:
        raise ValueError('Capture evidence missing, outside job, or changed; review it again')
    return path


def validate_capture(job, state):
    if state.get('source_kind') != 'video':
        return
    if 'capture_report' not in state:
        raise ValueError('Complete video requires a reviewed --capture-report, not a chapter summary')
    path = capture_file(job, state['capture_report'])
    report = json.loads(path.read_text(encoding='utf-8'))
    if not isinstance(report, dict) or report.get('version') != 1:
        raise ValueError('Unsupported video capture report format')
    if report.get('source_url') != state.get('source_url'):
        raise ValueError('Capture report must identify the actual task source URL')
    if report.get('basis') not in ('full_audio_transcription', 'full_subtitles', 'provided_full_transcript'):
        raise ValueError('Chapter summaries cannot establish complete video speech coverage')
    review = report.get('review', {})
    if (not isinstance(review, dict) or report.get('full_timeline_checked') is not True
            or review.get('checked') is not True or not isinstance(review.get('note'), str)
            or not review['note'].strip() or report.get('unresolved_gaps') != []):
        raise ValueError('Review full timeline, technical details and unresolved gaps before complete coverage')
    durations = [report.get('expected_duration_seconds'), report.get('processed_duration_seconds')]
    if any(isinstance(x, bool) or not isinstance(x, (float, int)) or not math.isfinite(x) or x <= 0 for x in durations):
        raise ValueError('Capture report requires verified positive source and processed durations')
    if abs(durations[0] - durations[1]) > max(2, durations[0] * 0.02) and not (isinstance(review.get('duration_note'), str) and review['duration_note'].strip()):
        raise ValueError('Duration mismatch requires an actual reviewed explanation')
    artifacts = report.get('artifacts')
    if not isinstance(artifacts, list) or not artifacts:
        raise ValueError('Capture report must bind original subtitle or transcription artifacts')
    for artifact in artifacts:
        evidence = capture_file(job, artifact)
        if evidence == path:
            raise ValueError('Capture report cannot use itself as original evidence')


def validate_ready(job, state):
    job = Path(job).resolve()
    if state.get('phase') != 'ready_to_publish':
        raise ValueError('Current draft has not been confirmed for image production')
    if not state.get('source_approval') or not state.get('rewrite_approval'):
        raise ValueError('Both human review records are required')
    if state.get('coverage') != 'complete':
        raise ValueError('Source coverage is incomplete')
    validate_capture(job, state)
    verify_document(job, state['source'])
    verify_document(job, state['rewrite'])
    for name in ('source', 'rewrite'):
        if state[name + '_approval'].get('sha256') != state[name]['sha256']:
            raise ValueError('Approval does not match the reviewed document')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['init', 'submit-source', 'confirm-source',
                                          'submit-rewrite', 'confirm-rewrite', 'status'])
    parser.add_argument('--job', required=True)
    parser.add_argument('--url', default='')
    parser.add_argument('--rights', choices=['unknown', 'user_owned', 'authorized', 'provided'], default='unknown')
    parser.add_argument('--source-kind', choices=['article', 'video', 'provided'], default='provided')
    parser.add_argument('--capture-report', help='Reviewed video capture report stored inside the job')
    parser.add_argument('--document')
    parser.add_argument('--coverage', choices=['complete', 'partial'])
    parser.add_argument('--mode', choices=['verbatim', 'detailed_summary'], default='detailed_summary')
    parser.add_argument('--evidence', help='Exact relevant human message, not a generated approval')
    args = parser.parse_args()
    job = Path(args.job).resolve()
    target = job / 'job.json'
    stamp = datetime.now(timezone.utc).isoformat()
    if args.action == 'init':
        if target.exists():
            raise ValueError('Job already exists; use another job directory')
        job.mkdir(parents=True, exist_ok=True)
        state = {'version': 2, 'phase': 'capture', 'source_url': args.url, 'source_kind': args.source_kind,
                 'rights': args.rights, 'created_at': stamp, 'history': []}
    else:
        state = json.loads(target.read_text(encoding='utf-8'))
    phase = state.get('phase')
    if args.action == 'submit-source':
        if not args.document or not args.coverage:
            raise ValueError('--document and --coverage are required')
        if args.mode == 'verbatim' and state.get('rights') == 'unknown':
            raise ValueError('Unknown-rights material must use detailed_summary')
        state['source'] = record_document(job, args.document)
        state['coverage'] = args.coverage
        state['capture_mode'] = args.mode
        state.pop('capture_report', None)
        if args.capture_report:
            report_path = Path(args.capture_report).resolve()
            if not report_path.is_relative_to(job) or not report_path.is_file() or report_path.suffix != '.json':
                raise ValueError('Capture report must be an existing JSON inside the job')
            state['capture_report'] = {'path': report_path.relative_to(job).as_posix(), 'sha256': digest(report_path)}
        if args.coverage == 'complete':
            validate_capture(job, state)
        for key in ('source_approval', 'rewrite', 'rewrite_approval'):
            state.pop(key, None)
        state['phase'] = 'source_review'
    elif args.action == 'confirm-source':
        if phase != 'source_review' or state.get('coverage') != 'complete':
            raise ValueError('Complete source must be submitted before confirmation')
        if not args.evidence or not args.evidence.strip():
            raise ValueError('Actual human confirmation is required')
        verify_document(job, state['source'])
        state['source_approval'] = {'message': args.evidence, 'at': stamp,
                                    'sha256': state['source']['sha256']}
        state['phase'] = 'rewrite'
    elif args.action == 'submit-rewrite':
        if phase not in ('rewrite', 'rewrite_review', 'ready_to_publish'):
            raise ValueError('Source confirmation is required before rewriting')
        if not args.document:
            raise ValueError('--document is required')
        verify_document(job, state['source'])
        state['rewrite'] = record_document(job, args.document)
        state.pop('rewrite_approval', None)
        state['phase'] = 'rewrite_review'
    elif args.action == 'confirm-rewrite':
        if phase != 'rewrite_review':
            raise ValueError('Submit a draft for review before confirming it')
        if not args.evidence or not args.evidence.strip():
            raise ValueError('Actual human confirmation for image production is required')
        verify_document(job, state['source'])
        verify_document(job, state['rewrite'])
        state['rewrite_approval'] = {'message': args.evidence, 'at': stamp,
                                     'sha256': state['rewrite']['sha256']}
        state['phase'] = 'ready_to_publish'
    if args.action != 'status':
        if args.action not in ('init', 'submit-source') and state.get('coverage') == 'complete':
            validate_capture(job, state)
        state['history'].append({'action': args.action, 'at': stamp})
        temp = job / 'job.json.tmp'
        temp.write_text(json.dumps(state, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        temp.replace(target)
    else:
        if state.get('coverage') == 'complete':
            validate_capture(job, state)
        for key in ('source', 'rewrite'):
            if key in state:
                verify_document(job, state[key])
    print(json.dumps(state, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    try:
        main()
    except (ValueError, OSError, KeyError) as error:
        raise SystemExit(str(error))
