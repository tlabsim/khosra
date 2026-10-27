"""Stage changed portable release files locally; never upload or delete files."""
import argparse
import hashlib
import json
from pathlib import Path, PurePosixPath
import re
import stat
import zipfile


def stage(archive, destination, apply=False):
    expected = Path(str(archive) + '.sha256').read_text().split()[0]
    if hashlib.sha256(archive.read_bytes()).hexdigest() != expected:
        raise ValueError('Release checksum does not match.')
    destination = destination.resolve()
    with zipfile.ZipFile(archive) as release:
        entries = release.infolist()
        names = {entry.filename for entry in entries}
        required = {'index.html', '.htaccess', 'api/index.php', 'khosra-server/bootstrap.php'}
        if not required <= names:
            raise ValueError('Expected a portable upload-extract release.')
        # Validate the entire archive before writing anything.
        for entry in entries:
            path = PurePosixPath(entry.filename)
            if (path.is_absolute() or '..' in path.parts or '\\' in entry.filename
                    or ':' in entry.filename or stat.S_ISLNK(entry.external_attr >> 16)):
                raise ValueError('Unsafe release path: ' + entry.filename)
            if (path.name in {'khosra.config.php', '.ftpquota', '.env'}
                    or re.search(r'\.(?:sqlite(?:3)?|db)(?:-wal|-shm)?$', path.name, re.I)):
                raise ValueError('Private file in release: ' + entry.filename)
            target = destination / entry.filename
            if target.resolve() != target or not target.resolve().is_relative_to(destination):
                raise ValueError('Destination contains a symlink: ' + entry.filename)
        changed = []
        for entry in entries:
            if entry.is_dir():
                continue
            target = destination / entry.filename
            data = release.read(entry)
            if not target.exists() or target.read_bytes() != data:
                changed.append((entry.filename, data, target.exists()))
        # Publish referenced files before the browser entry points.
        changed.sort(key=lambda item: (item[0] in {'index.html', 'sw.js'}, item[0] == 'sw.js', item[0]))
        for name, data, exists in changed:
            print(('UPDATE ' if exists else 'ADD    ') + name)
            if apply:
                target = destination / name
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(data)
        print(f'{len(changed)} changed files. ' + ('Staged locally.' if apply else 'Dry run; no files changed.'))
        print('No files deleted. No server upload performed.')
        return len(changed)


def main():
    root = Path(__file__).resolve().parent.parent
    version = json.loads((root / 'package.json').read_text())['version']
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--archive', type=Path, default=root / 'releases' / f'khosra-{version}-upload-extract.zip')
    parser.add_argument('--destination', type=Path, default=root / 'live')
    parser.add_argument('--apply', action='store_true', help='Copy changed files into the local mirror.')
    args = parser.parse_args()
    try:
        stage(args.archive, args.destination, args.apply)
    except (OSError, ValueError, zipfile.BadZipFile) as error:
        parser.exit(1, f'Cannot stage release: {error}\n')


if __name__ == '__main__':
    main()
