import os
import sqlite3

path = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'frontend', 'SolFermeOffline.db'))
print('DB path:', path)
print('exists', os.path.exists(path))
if not os.path.exists(path):
    raise SystemExit(1)
conn = sqlite3.connect(path)
cur = conn.cursor()
for tbl in ['farms', 'lots', 'sync_queue', 'id_mapping']:
    try:
        count = cur.execute(f'SELECT count(*) FROM {tbl}').fetchone()[0]
        print(f'{tbl}:', count)
    except Exception as e:
        print('ERR', tbl, type(e).__name__, e)
print('\nFARMS:')
for row in cur.execute('SELECT id,name,status,created_at,updated_at FROM farms ORDER BY id').fetchall():
    print(row)
print('\nLOTS:')
for row in cur.execute('SELECT id,name,status,farm_id,current_quantity FROM lots ORDER BY id').fetchall():
    print(row)
print('\nSYNC QUEUE:')
for row in cur.execute("SELECT id,operation,endpoint,table_name,local_id,status,error_message FROM sync_queue WHERE table_name IN ('farms','lots') ORDER BY id").fetchall():
    print(row)
conn.close()
