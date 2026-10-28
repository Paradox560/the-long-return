"""Prepare only intended client files and the bounded server function for publishing."""
from pathlib import Path
import shutil
import subprocess
import sys

root = Path(__file__).resolve().parent
subprocess.run([sys.executable, str(root / 'build.py')], check=True)
destination = root / 'playable'
destination.mkdir(exist_ok=True)
files = ['index.html', 'style.css', 'app.mjs', 'engine.mjs', 'render.mjs',
         'sf.jsonc', 'functions/api/dm.mjs', 'server/dm.mjs']
for relative in files:
    target = destination / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(root / 'game' / relative, target)
shutil.copyfile(root / 'dist/index.html', destination / 'design.html')
shutil.copyfile(root / 'dist/design-document.txt', destination / 'design-document.txt')
print('Prepared playable prototype with design document and server endpoint.')
