import requests
import sqlite3
import time
import os
from datetime import datetime

API_BASE = 'http://127.0.0.1:8000/api'
FRONTEND_DB = os.path.join(os.path.dirname(__file__), '..', 'frontend', 'SolFermeOffline.db')
FRONTEND_DB = os.path.abspath(FRONTEND_DB)

# Minimal schema for test
SCHEMA = [
    "CREATE TABLE IF NOT EXISTS farms (id INTEGER PRIMARY KEY, name TEXT, status TEXT);",
    "CREATE TABLE IF NOT EXISTS lots (id INTEGER PRIMARY KEY, farm_id INTEGER, name TEXT, status TEXT, current_quantity INTEGER);",
    "CREATE TABLE IF NOT EXISTS sync_queue (id INTEGER PRIMARY KEY AUTOINCREMENT, operation TEXT, endpoint TEXT, payload_json TEXT, local_id INTEGER, table_name TEXT, status TEXT, created_at TEXT, updated_at TEXT, retry_count INTEGER, error_message TEXT);",
    "CREATE TABLE IF NOT EXISTS id_mapping (local_id INTEGER, server_id INTEGER, table_name TEXT, PRIMARY KEY(local_id, table_name));",
]

LOGS = []

def log(s):
    print(s)
    LOGS.append(f"{datetime.utcnow().isoformat()} {s}")


def reset_db():
    if os.path.exists(FRONTEND_DB):
        os.remove(FRONTEND_DB)
    conn = sqlite3.connect(FRONTEND_DB)
    cur = conn.cursor()
    for stmt in SCHEMA:
        cur.execute(stmt)
    conn.commit()
    conn.close()


def create_user_and_get_token():
    # create a user
    email = 'tester+sync@example.com'
    password = 'StrongP@ssw0rd!'
    # Create user
    r = requests.post(f"{API_BASE}/users/", json={
        'name': 'SyncTester', 'email': email, 'password': password, 'role': 'PROPRIETAIRE'
    })
    if r.status_code not in (200, 201):
        log(f"User create returned {r.status_code}: {r.text}")
        # Maybe user exists, try to find by listing users (requires auth). For simplicity, ignore.
    # Obtain token
    r2 = requests.post(f"{API_BASE}/auth/login/", json={'email': email, 'password': password})
    if r2.status_code != 200:
        log(f"Login failed {r2.status_code}: {r2.text}")
        raise SystemExit('Login failed')
    token = r2.json().get('access')
    return token


def create_farm_and_lot(headers):
    r = requests.post(f"{API_BASE}/farms/", headers=headers, json={'name': 'SyncFarm', 'capacity': 100})
    r.raise_for_status()
    farm = r.json()
    log(f"Created farm id={farm['id']}")
    r2 = requests.post(f"{API_BASE}/lots/", headers=headers, json={'name': 'SyncLot', 'farm': farm['id'], 'breed': 'HYBRID', 'initial_quantity': 10, 'current_quantity': 10, 'purchase_date': '2023-01-01', 'subjects_price': 10.0, 'purchase_price': 100.0})
    if r2.status_code != 201 and r2.status_code != 200:
        log(f"Create lot failed {r2.status_code}: {r2.text}")
        r2.raise_for_status()
    lot = r2.json()
    log(f"Created lot id={lot['id']} (qty={lot['current_quantity']})")
    return farm, lot


def insert_local_rows(farm, lot):
    conn = sqlite3.connect(FRONTEND_DB)
    cur = conn.cursor()
    # Insert local copies mirroring server state
    cur.execute('INSERT OR REPLACE INTO farms (id, name, status) VALUES (?, ?, ?)', (farm['id'], farm['name'], farm.get('status', 'ACTIF')))
    cur.execute('INSERT OR REPLACE INTO lots (id, farm_id, name, status, current_quantity) VALUES (?, ?, ?, ?, ?)', (lot['id'], lot['farm'], lot['name'], lot.get('status', 'ACTIF'), lot.get('current_quantity', 0)))
    conn.commit()
    conn.close()


def enqueue_action(endpoint, table_name, local_id, operation='CREATE', payload_json='{}'):
    conn = sqlite3.connect(FRONTEND_DB)
    cur = conn.cursor()
    now = datetime.utcnow().isoformat()
    cur.execute('INSERT INTO sync_queue (operation, endpoint, payload_json, local_id, table_name, status, created_at, updated_at, retry_count) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
                (operation, endpoint, payload_json, local_id, table_name, 'PENDING', now, now, 0))
    conn.commit()
    qid = cur.lastrowid
    conn.close()
    log(f"Enqueued {operation} {endpoint} as sync_queue id={qid}")
    return qid


def process_queue_once(headers):
    conn = sqlite3.connect(FRONTEND_DB)
    cur = conn.cursor()
    rows = cur.execute("SELECT id, operation, endpoint, payload_json, local_id, table_name, status FROM sync_queue WHERE status = 'PENDING' ORDER BY id").fetchall()
    if not rows:
        log('No pending items')
        conn.close()
        return []
    results = []
    for r in rows:
        qid, op, endpoint, payload_json, local_id, table_name, status = r
        log(f"Processing queue id={qid} op={op} endpoint={endpoint} local_id={local_id}")
        # mark PROCESSING
        cur.execute("UPDATE sync_queue SET status = 'PROCESSING', updated_at = ? WHERE id = ?", (datetime.utcnow().isoformat(), qid))
        conn.commit()
        full_url = endpoint if endpoint.startswith('http') else API_BASE + endpoint
        try:
            if op == 'CREATE':
                resp = requests.post(full_url, headers=headers, json={} )
                method = 'POST'
            elif op == 'UPDATE':
                resp = requests.patch(full_url, headers=headers, json={})
                method = 'PATCH'
            elif op == 'DELETE':
                resp = requests.delete(full_url, headers=headers)
                method = 'DELETE'
            else:
                resp = requests.post(full_url, headers=headers, json={})
                method = 'POST'
        except Exception as e:
            log(f"Network error for queue id={qid}: {e}")
            # set back to PENDING
            cur.execute("UPDATE sync_queue SET status = 'PENDING', updated_at = ? WHERE id = ?", (datetime.utcnow().isoformat(), qid))
            conn.commit()
            results.append((qid, 'PENDING', str(e), method))
            continue

        log(f"HTTP {method} {full_url} -> {resp.status_code}")
        if 200 <= resp.status_code < 300:
            # Success: delete queue item and update local row from server
            cur.execute('DELETE FROM sync_queue WHERE id = ?', (qid,))
            conn.commit()
            # Fetch server row to persist local
            # For farms/lots we fetch GET endpoint
            if table_name in ('lots', 'farms'):
                get_url = API_BASE + f'/{table_name}/' + str(local_id) + '/' if not endpoint.startswith(API_BASE) else full_url
                try:
                    g = requests.get(get_url, headers=headers)
                    if g.status_code == 200:
                        data = g.json()
                        if table_name == 'lots':
                            cur.execute('INSERT OR REPLACE INTO lots (id, farm_id, name, status, current_quantity) VALUES (?, ?, ?, ?, ?)',
                                        (data['id'], data.get('farm'), data.get('name'), data.get('status'), data.get('current_quantity', 0)))
                        else:
                            cur.execute('INSERT OR REPLACE INTO farms (id, name, status) VALUES (?, ?, ?)', (data['id'], data.get('name'), data.get('status')))
                        conn.commit()
                except Exception as e:
                    log(f"Warning: could not fetch persisted row for {table_name} {local_id}: {e}")
            results.append((qid, 'SUCCESS', resp.status_code, method))
        else:
            # Client error -> mark FAILED with message
            if 400 <= resp.status_code < 500:
                cur.execute("UPDATE sync_queue SET status = 'FAILED', error_message = ?, updated_at = ? WHERE id = ?", (resp.text[:400], datetime.utcnow().isoformat(), qid))
                conn.commit()
                results.append((qid, 'FAILED', resp.status_code, method))
            else:
                # server error -> back to PENDING
                cur.execute("UPDATE sync_queue SET status = 'PENDING', updated_at = ? WHERE id = ?", (datetime.utcnow().isoformat(), qid))
                conn.commit()
                results.append((qid, 'PENDING', resp.status_code, method))
    conn.close()
    return results


def read_queue():
    conn = sqlite3.connect(FRONTEND_DB)
    cur = conn.cursor()
    rows = cur.execute('SELECT id, operation, endpoint, local_id, table_name, status, error_message FROM sync_queue').fetchall()
    conn.close()
    return rows


def run_tests():
    reset_db()
    token = create_user_and_get_token()
    headers = {'Authorization': f'Bearer {token}'}

    farm, lot = create_farm_and_lot(headers)
    insert_local_rows(farm, lot)

    results_summary = []

    # G: Offline archive lot then sync
    log('\n=== Scenario G: Offline archive lot then sync ===')
    # Simulate offline action: local app applied archive locally
    conn = sqlite3.connect(FRONTEND_DB)
    cur = conn.cursor()
    cur.execute("UPDATE lots SET status = 'ARCHIVE' WHERE id = ?", (lot['id'],))
    conn.commit(); conn.close()
    qid = enqueue_action(f'/lots/{lot['id']}/archive/', 'lots', lot['id'], 'CREATE', '{}')
    time.sleep(1)
    res = process_queue_once(headers)
    results_summary.append(('G', res))

    # Check final states
    conn = sqlite3.connect(FRONTEND_DB)
    cur = conn.cursor()
    local_lot = cur.execute('SELECT id, status FROM lots WHERE id = ?', (lot['id'],)).fetchone()
    conn.close()
    server_lot = requests.get(f"{API_BASE}/lots/{lot['id']}/", headers=headers).json()
    log(f"G: local lot status={local_lot[1]}, server lot status={server_lot.get('status')}")

    # H: Offline reactivate lot then sync
    log('\n=== Scenario H: Offline reactivate lot then sync ===')
    # Simulate offline reactivation locally
    conn = sqlite3.connect(FRONTEND_DB)
    cur = conn.cursor()
    cur.execute("UPDATE lots SET status = 'ACTIF' WHERE id = ?", (lot['id'],))
    conn.commit(); conn.close()
    qid2 = enqueue_action(f'/lots/{lot['id']}/reactivate/', 'lots', lot['id'], 'CREATE', '{}')
    time.sleep(1)
    res2 = process_queue_once(headers)
    results_summary.append(('H', res2))
    conn = sqlite3.connect(FRONTEND_DB)
    cur = conn.cursor()
    local_lot2 = cur.execute('SELECT id, status FROM lots WHERE id = ?', (lot['id'],)).fetchone()
    conn.close()
    server_lot2 = requests.get(f"{API_BASE}/lots/{lot['id']}/", headers=headers).json()
    log(f"H: local lot status={local_lot2[1]}, server lot status={server_lot2.get('status')}")

    # I: Try to reactivate a lot whose farm is ARCHIVE -> should be refused by server and queue item should become FAILED
    log('\n=== Scenario I: Reactivate lot when farm is ARCHIVE (server should refuse) ===')
    # First archive the lot server-side so it is archived, then archive the farm
    requests.post(f"{API_BASE}/lots/{lot['id']}/archive/", headers=headers)
    # Sync local mirror
    conn = sqlite3.connect(FRONTEND_DB)
    cur = conn.cursor()
    cur.execute("UPDATE lots SET status = 'ARCHIVE' WHERE id = ?", (lot['id'],))
    conn.commit(); conn.close()
    # Now archive the farm server-side
    requests.post(f"{API_BASE}/farms/{farm['id']}/archive/", headers=headers)
    # client tries to reactivate lot offline (should be blocked by server because farm is ARCHIVE)
    conn = sqlite3.connect(FRONTEND_DB)
    cur = conn.cursor()
    cur.execute("UPDATE lots SET status = 'ACTIF' WHERE id = ?", (lot['id'],))
    conn.commit(); conn.close()
    qid3 = enqueue_action(f'/lots/{lot['id']}/reactivate/', 'lots', lot['id'], 'CREATE', '{}')
    time.sleep(1)
    res3 = process_queue_once(headers)
    results_summary.append(('I', res3))
    q_after = read_queue()
    log(f"I: queue after processing: {q_after}")

    # J: Try to reactivate lot with current_quantity <= 0 -> should be refused by server and queue becomes FAILED; also client should have blocked earlier
    log('\n=== Scenario J: Reactivate lot with current_quantity <= 0 (server should refuse) ===')
    # set farm ACTIF again to avoid farm rule interfering
    r_f_re = requests.post(f"{API_BASE}/farms/{farm['id']}/reactivate/?status=ARCHIVE", headers=headers)
    log(f"Reactivate farm response: {r_f_re.status_code} {r_f_re.text}")
    # verify farm status
    f_get = requests.get(f"{API_BASE}/farms/{farm['id']}/?status=ACTIF", headers=headers)
    log(f"Farm status before J: {f_get.status_code} {f_get.text}")
    # set server lot current_quantity to 0 and archive it (to be in reactivation path)
    requests.patch(f"{API_BASE}/lots/{lot['id']}/", headers=headers, json={'current_quantity': 0})
    requests.post(f"{API_BASE}/lots/{lot['id']}/archive/", headers=headers)
    # local attempt (simulate client trying to reactivate despite qty 0)
    conn = sqlite3.connect(FRONTEND_DB)
    cur = conn.cursor()
    cur.execute("UPDATE lots SET current_quantity = 0, status = 'ARCHIVE' WHERE id = ?", (lot['id'],))
    conn.commit(); conn.close()
    qid4 = enqueue_action(f'/lots/{lot['id']}/reactivate/', 'lots', lot['id'], 'CREATE', '{}')
    time.sleep(1)
    res4 = process_queue_once(headers)
    results_summary.append(('J', res4))
    q_after2 = read_queue()
    log(f"J: queue after processing: {q_after2}")

    # Print summary
    log('\n=== SUMMARY ===')
    for tag, res in results_summary:
        log(f"{tag}: {res}")

    # Dump logs to file
    out = os.path.join(os.path.dirname(__file__), 'simulate_sync_logs.txt')
    with open(out, 'w', encoding='utf-8') as f:
        f.write('\n'.join(LOGS))
    log(f"Logs written to {out}")

if __name__ == '__main__':
    run_tests()
