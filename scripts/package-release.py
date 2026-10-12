#!/usr/bin/env python3
"""Package only verified release images and explicitly named publishing text."""
import argparse
import hashlib
import json
import struct
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile
from workflow import validate_ready


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--job', required=True)
    parser.add_argument('--images', required=True)
    parser.add_argument('--caption', required=True)
    parser.add_argument('--copyable', action='append', default=[])
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    job = Path(args.job).resolve()
    state = json.loads((job / 'job.json').read_text(encoding='utf-8'))
    validate_ready(job, state)
    images = Path(args.images).resolve()
    if not images.is_relative_to(job):
        raise ValueError('Release images must be inside the job directory')
    report = json.loads((images / 'render-report.json').read_text(encoding='utf-8'))
    if report.get('mode') != 'release' or report.get('draft_sha256') != state['rewrite']['sha256']:
        raise ValueError('Preview or outdated images cannot become a release package')
    files = []
    for item in report['pages']:
        filename = item['file']
        if Path(filename).name != filename:
            raise ValueError('Invalid image filename')
        image = (images / filename).resolve()
        if not image.is_relative_to(images):
            raise ValueError('Image path escapes output directory')
        data = image.read_bytes()
        if data[:8] != b'\x89PNG\r\n\x1a\n' or struct.unpack('>II', data[16:24]) != (1080, 1800):
            raise ValueError('Invalid PNG dimensions: ' + filename)
        if hashlib.sha256(data).hexdigest() != item['sha256']:
            raise ValueError('Image changed after render checks: ' + filename)
        files.append(image)
    for filename in [args.caption, *args.copyable]:
        file = Path(filename).resolve()
        if not file.is_relative_to(job) or file.suffix.lower() not in ('.md', '.txt'):
            raise ValueError('Publishing text must be a local job MD or TXT file')
        if not file.is_file() or not file.read_text(encoding='utf-8').strip():
            raise ValueError('Publishing text is missing or empty')
        files.append(file)
    names = [file.name for file in files]
    if len(names) != len(set(names)):
        raise ValueError('Archive filenames must be unique')
    output = Path(args.output).resolve()
    if not output.is_relative_to(job) or output.suffix.lower() != '.zip' or output.exists():
        raise ValueError('Use a new ZIP filename inside the job directory')
    output.parent.mkdir(parents=True, exist_ok=True)
    with ZipFile(output, 'w', ZIP_DEFLATED) as archive:
        for file in files:
            archive.write(file, arcname=file.name)
    with ZipFile(output) as archive:
        if archive.namelist() != names or archive.testzip() is not None:
            raise ValueError('Archive integrity failed')
    print(json.dumps({'output': str(output), 'files': len(files)}, ensure_ascii=False))


if __name__ == '__main__':
    try:
        main()
    except (ValueError, OSError, KeyError) as error:
        raise SystemExit(str(error))
