from pathlib import Path
import re

base_dir = Path(__file__).resolve().parent
root = base_dir / 'src' / 'screens'
files = sorted(root.rglob('*.tsx'))
changed_files = []
for file in files:
    text = file.read_text(encoding='utf-8')
    if 'apiClient' not in text and 'fetchAll(' not in text:
        continue

    rel = file.relative_to(root)
    depth = len(rel.parts) - 1
    repo_import_path = '../' * (depth + 1) + 'repositories'

    lines = text.splitlines()
    new_lines = []
    added_repo_import = False
    have_repo_import = any('repositoryProvider' in line and 'from' in line for line in lines)

    for line in lines:
        m = re.match(r"import\s+\{([^}]*)\}\s+from\s+['\"](.*/api/client)['\"];?", line)
        if m:
            imports = [item.strip() for item in m.group(1).split(',')]
            imports = [item for item in imports if item not in ('apiClient', 'fetchAll')]
            if imports:
                new_lines.append(f"import {{ {', '.join(imports)} }} from '{m.group(2)}'" )
            # if the import line only had apiClient/fetchAll, drop it entirely
            if not have_repo_import and not added_repo_import:
                new_lines.append(f"import {{ repositoryProvider }} from '{repo_import_path}';")
                added_repo_import = True
        else:
            new_lines.append(line)

    if not have_repo_import and not added_repo_import and ('apiClient' in text or 'fetchAll(' in text):
        # insert after last import if there are imports, else at top
        insert_idx = 0
        for idx, line in enumerate(new_lines):
            if line.startswith('import '):
                insert_idx = idx + 1
        new_lines.insert(insert_idx, f"import {{ repositoryProvider }} from '{repo_import_path}';")
        added_repo_import = True

    new_text = '\n'.join(new_lines)
    new_text = new_text.replace('apiClient.', 'repositoryProvider.api.')
    new_text = new_text.replace('fetchAll(', 'repositoryProvider.api.fetchAll(')

    if new_text != text:
        file.write_text(new_text, encoding='utf-8')
        changed_files.append(str(file))

print('changed', len(changed_files), 'files')
for f in changed_files:
    print(f)
