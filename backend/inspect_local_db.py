import os
import sqlite3

path = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'frontend', 'SolFermeOffline.db'))
print('DB path:', path)
print('exists', os.path.exists(path))
if not os.path.exists(path):
    raise SystemExit(1)
conn = sqlite3.connect(path)
cur = conn.cursor()
print('FARMS schema:')
for row in cur.execute("PRAGMA table_info(farms)").fetchall():
    print(row)
print('\nLOTS schema:')
for row in cur.execute("PRAGMA table_info(lots)").fetchall():
    print(row)
print('\nSYNC_QUEUE schema:')
for row in cur.execute("PRAGMA table_info(sync_queue)").fetchall():
    print(row)
print('\nFarms rows:')
for row in cur.execute('SELECT * FROM farms').fetchall():
    print(row)
print('\nLots rows:')
for row in cur.execute('SELECT * FROM lots').fetchall():
    print(row)
print('\nSync queue rows:')
for row in cur.execute("SELECT id,operation,endpoint,table_name,local_id,status,error_message FROM sync_queue").fetchall():
    print(row)
conn.close()
