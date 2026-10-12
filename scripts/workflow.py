#!/usr/bin/env python3
"""Record human review gates; never infer or synthesize user approval."""
import argparse
import hashlib
import json
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


def validate_ready(job, state):
    job = Path(job).resolve()
    if state.get('phase') != 'ready_to_publish':
        raise ValueError('Current draft has not been confirmed for image production')
    if not state.get('source_approval') or not state.get('rewrite_approval'):
        raise ValueError('Both human review records are required')
    if state.get('coverage') != 'complete':
        raise ValueError('Source coverage is incomplete')
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
        state = {'version': 1, 'phase': 'capture', 'source_url': args.url,
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
        state['history'].append({'action': args.action, 'at': stamp})
        temp = job / 'job.json.tmp'
        temp.write_text(json.dumps(state, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        temp.replace(target)
    else:
        for key in ('source', 'rewrite'):
            if key in state:
                verify_document(job, state[key])
    print(json.dumps(state, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    try:
        main()
    except (ValueError, OSError, KeyError) as error:
        raise SystemExit(str(error))
