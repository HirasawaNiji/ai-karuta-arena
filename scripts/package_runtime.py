"""Package built runtime with Linux workspace links; no dev tools or credentials."""
import argparse
import io
import json
import subprocess
import tarfile
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--output', type=Path, default=Path('.local/runtime.tar.gz'))
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
args.output.parent.mkdir(parents=True, exist_ok=True)
with tarfile.open(args.output, 'w:gz', dereference=True) as archive:
    for base in ['apps/server', 'apps/web', 'packages/core', 'packages/adapters', 'packages/music-profile', 'packages/party-runtime', 'packages/playlist-engine']:
        path = root/base
        if not (path/'dist').is_dir():
            raise RuntimeError('Build missing: '+base)
        archive.add(path/'package.json',arcname=base+'/package.json')
        archive.add(path/'dist',arcname=base+'/dist')
        if base != 'apps/web':
            name = json.loads((path/'package.json').read_text())['name']
            link = tarfile.TarInfo('node_modules/'+name)
            link.type = tarfile.SYMTYPE
            link.linkname = '../../'+base
            archive.addfile(link)
    archive.add(root/'packages/core/node_modules/zod',arcname='node_modules/zod')
    # Legacy mode remains deployable, but downloaded mode is selected by env.
    for name in ['d0-pjsk-materials.json','pjsk-intro-review.json']:
        archive.add(root/'docs/evidence'/name,arcname='docs/evidence/'+name)
    commit = subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip()
    payload = json.dumps({'baseCommit':commit,'source':'built workspace; see deployment PR for final commit'}).encode()
    info=tarfile.TarInfo('release.json')
    info.size=len(payload)
    archive.addfile(info,io.BytesIO(payload))
print(f'Runtime packaged: {args.output} ({args.output.stat().st_size/1024/1024:.1f} MiB)')
