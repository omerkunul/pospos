#!/usr/bin/env python3
import datetime as dt
import json
import os
import re
import sqlite3
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, "restaurant.db")
STATIC_DIR = os.path.join(BASE_DIR, "static")


def now_iso():
    return dt.datetime.now().replace(microsecond=0).isoformat()


def get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = get_conn()
    cur = conn.cursor()

    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS tables (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE
        )
        """
    )

    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS menu_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            category TEXT NOT NULL,
            price REAL NOT NULL CHECK(price >= 0),
            is_active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL
        )
        """
    )

    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS orders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            table_id INTEGER NOT NULL,
            status TEXT NOT NULL CHECK(status IN ('open', 'closed')),
            created_at TEXT NOT NULL,
            closed_at TEXT,
            payment_method TEXT,
            total_amount REAL NOT NULL DEFAULT 0,
            FOREIGN KEY(table_id) REFERENCES tables(id)
        )
        """
    )

    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS order_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            order_id INTEGER NOT NULL,
            menu_item_id INTEGER NOT NULL,
            quantity INTEGER NOT NULL CHECK(quantity > 0),
            unit_price REAL NOT NULL CHECK(unit_price >= 0),
            status TEXT NOT NULL CHECK(status IN ('pending', 'prepared', 'served', 'cancelled')),
            notes TEXT,
            FOREIGN KEY(order_id) REFERENCES orders(id),
            FOREIGN KEY(menu_item_id) REFERENCES menu_items(id)
        )
        """
    )

    cur.execute("SELECT COUNT(*) AS c FROM tables")
    if cur.fetchone()["c"] == 0:
        cur.executemany(
            "INSERT INTO tables(name) VALUES (?)",
            [(f"Masa {i}",) for i in range(1, 13)],
        )

    cur.execute("SELECT COUNT(*) AS c FROM menu_items")
    if cur.fetchone()["c"] == 0:
        seeded_menu = [
            ("Adana Kebap", "Ana Yemek", 320.0),
            ("Lahmacun", "Ana Yemek", 140.0),
            ("Köfte", "Ana Yemek", 280.0),
            ("Mercimek Çorbası", "Çorba", 95.0),
            ("Ayran", "İçecek", 45.0),
            ("Kola", "İçecek", 70.0),
            ("Su", "İçecek", 20.0),
            ("Künefe", "Tatlı", 130.0),
            ("Baklava", "Tatlı", 155.0),
        ]
        cur.executemany(
            "INSERT INTO menu_items(name, category, price, created_at) VALUES (?, ?, ?, ?)",
            [(name, category, price, now_iso()) for name, category, price in seeded_menu],
        )

    conn.commit()
    conn.close()


def row_to_dict(row):
    return dict(row) if row is not None else None


def fetch_order_with_items(conn, order_id):
    order = conn.execute(
        """
        SELECT o.id, o.table_id, t.name AS table_name, o.status, o.created_at, o.closed_at,
               o.payment_method, o.total_amount
        FROM orders o
        JOIN tables t ON t.id = o.table_id
        WHERE o.id = ?
        """,
        (order_id,),
    ).fetchone()

    if order is None:
        return None

    items = conn.execute(
        """
        SELECT oi.id, oi.order_id, oi.menu_item_id, mi.name AS menu_item_name,
               oi.quantity, oi.unit_price, oi.status, oi.notes,
               ROUND(oi.quantity * oi.unit_price, 2) AS line_total
        FROM order_items oi
        JOIN menu_items mi ON mi.id = oi.menu_item_id
        WHERE oi.order_id = ?
        ORDER BY oi.id DESC
        """,
        (order_id,),
    ).fetchall()

    payload = row_to_dict(order)
    payload["items"] = [row_to_dict(i) for i in items]
    payload["computed_total"] = round(
        sum(i["line_total"] for i in items if i["status"] != "cancelled"),
        2,
    )
    return payload


def compute_order_total(conn, order_id):
    row = conn.execute(
        """
        SELECT ROUND(COALESCE(SUM(quantity * unit_price), 0), 2) AS total
        FROM order_items
        WHERE order_id = ? AND status != 'cancelled'
        """,
        (order_id,),
    ).fetchone()
    return float(row["total"])


class RestaurantHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=STATIC_DIR, **kwargs)

    def _send_json(self, payload, status=HTTPStatus.OK):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _read_json(self):
        length = int(self.headers.get("Content-Length", "0"))
        raw = self.rfile.read(length) if length > 0 else b"{}"
        try:
            return json.loads(raw.decode("utf-8"))
        except json.JSONDecodeError:
            return None

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path

        if path == "/api/health":
            self._send_json({"ok": True, "time": now_iso()})
            return

        if path == "/api/tables":
            self._handle_get_tables()
            return

        if path == "/api/menu-items":
            self._handle_get_menu_items()
            return

        if path == "/api/orders/open":
            self._handle_get_open_orders()
            return

        if path == "/api/kitchen/tickets":
            self._handle_get_kitchen_tickets()
            return

        if path == "/api/reports/daily":
            self._handle_get_daily_report(parsed.query)
            return

        m = re.fullmatch(r"/api/orders/(\d+)", path)
        if m:
            self._handle_get_order(int(m.group(1)))
            return

        if path == "/":
            self.path = "/index.html"
        return super().do_GET()

    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path
        body = self._read_json()

        if body is None:
            self._send_json({"error": "Geçersiz JSON body"}, status=HTTPStatus.BAD_REQUEST)
            return

        if path == "/api/menu-items":
            self._handle_post_menu_item(body)
            return

        if path == "/api/orders":
            self._handle_post_order(body)
            return

        m = re.fullmatch(r"/api/orders/(\d+)/items", path)
        if m:
            self._handle_post_order_item(int(m.group(1)), body)
            return

        m = re.fullmatch(r"/api/orders/(\d+)/close", path)
        if m:
            self._handle_close_order(int(m.group(1)), body)
            return

        self._send_json({"error": "Endpoint bulunamadı"}, status=HTTPStatus.NOT_FOUND)

    def do_PATCH(self):
        path = urlparse(self.path).path
        body = self._read_json()

        if body is None:
            self._send_json({"error": "Geçersiz JSON body"}, status=HTTPStatus.BAD_REQUEST)
            return

        m = re.fullmatch(r"/api/order-items/(\d+)", path)
        if m:
            self._handle_patch_order_item(int(m.group(1)), body)
            return

        self._send_json({"error": "Endpoint bulunamadı"}, status=HTTPStatus.NOT_FOUND)

    def _handle_get_tables(self):
        conn = get_conn()
        rows = conn.execute(
            """
            SELECT t.id, t.name,
                   (
                     SELECT o.id
                     FROM orders o
                     WHERE o.table_id = t.id AND o.status = 'open'
                     ORDER BY o.id DESC
                     LIMIT 1
                   ) AS open_order_id
            FROM tables t
            ORDER BY t.id
            """
        ).fetchall()
        conn.close()

        payload = []
        for row in rows:
            item = row_to_dict(row)
            item["status"] = "occupied" if item["open_order_id"] else "available"
            payload.append(item)

        self._send_json(payload)

    def _handle_get_menu_items(self):
        conn = get_conn()
        rows = conn.execute(
            """
            SELECT id, name, category, price, is_active, created_at
            FROM menu_items
            WHERE is_active = 1
            ORDER BY category, name
            """
        ).fetchall()
        conn.close()
        self._send_json([row_to_dict(r) for r in rows])

    def _handle_post_menu_item(self, body):
        name = str(body.get("name", "")).strip()
        category = str(body.get("category", "")).strip() or "Diğer"
        price = body.get("price")

        if not name:
            self._send_json({"error": "Ürün adı zorunludur"}, status=HTTPStatus.BAD_REQUEST)
            return

        try:
            price = float(price)
        except (TypeError, ValueError):
            self._send_json({"error": "Geçerli bir fiyat giriniz"}, status=HTTPStatus.BAD_REQUEST)
            return

        if price < 0:
            self._send_json({"error": "Fiyat negatif olamaz"}, status=HTTPStatus.BAD_REQUEST)
            return

        conn = get_conn()
        cur = conn.execute(
            "INSERT INTO menu_items(name, category, price, created_at) VALUES (?, ?, ?, ?)",
            (name, category, price, now_iso()),
        )
        conn.commit()
        created = conn.execute(
            "SELECT id, name, category, price, is_active, created_at FROM menu_items WHERE id = ?",
            (cur.lastrowid,),
        ).fetchone()
        conn.close()

        self._send_json(row_to_dict(created), status=HTTPStatus.CREATED)

    def _handle_post_order(self, body):
        table_id = body.get("table_id")
        try:
            table_id = int(table_id)
        except (TypeError, ValueError):
            self._send_json({"error": "Geçerli bir masa seçiniz"}, status=HTTPStatus.BAD_REQUEST)
            return

        conn = get_conn()
        table = conn.execute("SELECT id, name FROM tables WHERE id = ?", (table_id,)).fetchone()
        if table is None:
            conn.close()
            self._send_json({"error": "Masa bulunamadı"}, status=HTTPStatus.NOT_FOUND)
            return

        existing = conn.execute(
            "SELECT id FROM orders WHERE table_id = ? AND status = 'open' ORDER BY id DESC LIMIT 1",
            (table_id,),
        ).fetchone()

        if existing:
            payload = fetch_order_with_items(conn, existing["id"])
            conn.close()
            self._send_json(payload, status=HTTPStatus.OK)
            return

        cur = conn.execute(
            "INSERT INTO orders(table_id, status, created_at) VALUES (?, 'open', ?)",
            (table_id, now_iso()),
        )
        conn.commit()
        payload = fetch_order_with_items(conn, cur.lastrowid)
        conn.close()

        self._send_json(payload, status=HTTPStatus.CREATED)

    def _handle_get_order(self, order_id):
        conn = get_conn()
        payload = fetch_order_with_items(conn, order_id)
        conn.close()

        if payload is None:
            self._send_json({"error": "Sipariş bulunamadı"}, status=HTTPStatus.NOT_FOUND)
            return

        self._send_json(payload)

    def _handle_post_order_item(self, order_id, body):
        menu_item_id = body.get("menu_item_id")
        quantity = body.get("quantity", 1)
        notes = str(body.get("notes", "")).strip()

        try:
            menu_item_id = int(menu_item_id)
            quantity = int(quantity)
        except (TypeError, ValueError):
            self._send_json({"error": "Ürün ve adet bilgisi geçersiz"}, status=HTTPStatus.BAD_REQUEST)
            return

        if quantity < 1:
            self._send_json({"error": "Adet en az 1 olmalıdır"}, status=HTTPStatus.BAD_REQUEST)
            return

        conn = get_conn()

        order = conn.execute(
            "SELECT id, status FROM orders WHERE id = ?",
            (order_id,),
        ).fetchone()
        if order is None:
            conn.close()
            self._send_json({"error": "Sipariş bulunamadı"}, status=HTTPStatus.NOT_FOUND)
            return

        if order["status"] != "open":
            conn.close()
            self._send_json({"error": "Kapalı siparişe ürün eklenemez"}, status=HTTPStatus.CONFLICT)
            return

        menu_item = conn.execute(
            "SELECT id, price FROM menu_items WHERE id = ? AND is_active = 1",
            (menu_item_id,),
        ).fetchone()
        if menu_item is None:
            conn.close()
            self._send_json({"error": "Ürün bulunamadı"}, status=HTTPStatus.NOT_FOUND)
            return

        conn.execute(
            """
            INSERT INTO order_items(order_id, menu_item_id, quantity, unit_price, status, notes)
            VALUES (?, ?, ?, ?, 'pending', ?)
            """,
            (order_id, menu_item_id, quantity, menu_item["price"], notes),
        )

        total = compute_order_total(conn, order_id)
        conn.execute("UPDATE orders SET total_amount = ? WHERE id = ?", (total, order_id))
        conn.commit()

        payload = fetch_order_with_items(conn, order_id)
        conn.close()
        self._send_json(payload, status=HTTPStatus.CREATED)

    def _handle_patch_order_item(self, item_id, body):
        new_status = str(body.get("status", "")).strip()
        allowed = {"pending", "prepared", "served", "cancelled"}

        if new_status not in allowed:
            self._send_json(
                {"error": f"Durum geçersiz. Geçerli değerler: {', '.join(sorted(allowed))}"},
                status=HTTPStatus.BAD_REQUEST,
            )
            return

        conn = get_conn()
        row = conn.execute(
            "SELECT id, order_id FROM order_items WHERE id = ?",
            (item_id,),
        ).fetchone()

        if row is None:
            conn.close()
            self._send_json({"error": "Sipariş kalemi bulunamadı"}, status=HTTPStatus.NOT_FOUND)
            return

        conn.execute("UPDATE order_items SET status = ? WHERE id = ?", (new_status, item_id))
        total = compute_order_total(conn, row["order_id"])
        conn.execute("UPDATE orders SET total_amount = ? WHERE id = ?", (total, row["order_id"]))
        conn.commit()
        order_payload = fetch_order_with_items(conn, row["order_id"])
        conn.close()
        self._send_json(order_payload)

    def _handle_close_order(self, order_id, body):
        payment_method = str(body.get("payment_method", "")).strip().lower()
        allowed = {"nakit", "kart", "qr", "yemek-karti"}
        if payment_method not in allowed:
            self._send_json(
                {"error": "Ödeme yöntemi geçersiz. (nakit, kart, qr, yemek-karti)"},
                status=HTTPStatus.BAD_REQUEST,
            )
            return

        conn = get_conn()
        order = conn.execute("SELECT id, status FROM orders WHERE id = ?", (order_id,)).fetchone()

        if order is None:
            conn.close()
            self._send_json({"error": "Sipariş bulunamadı"}, status=HTTPStatus.NOT_FOUND)
            return

        if order["status"] != "open":
            conn.close()
            self._send_json({"error": "Sipariş zaten kapalı"}, status=HTTPStatus.CONFLICT)
            return

        total = compute_order_total(conn, order_id)
        conn.execute(
            """
            UPDATE orders
            SET status = 'closed', closed_at = ?, payment_method = ?, total_amount = ?
            WHERE id = ?
            """,
            (now_iso(), payment_method, total, order_id),
        )
        conn.commit()

        payload = fetch_order_with_items(conn, order_id)
        conn.close()
        self._send_json(payload)

    def _handle_get_open_orders(self):
        conn = get_conn()
        rows = conn.execute(
            """
            SELECT o.id, o.table_id, t.name AS table_name, o.created_at, o.total_amount
            FROM orders o
            JOIN tables t ON t.id = o.table_id
            WHERE o.status = 'open'
            ORDER BY o.id DESC
            """
        ).fetchall()
        conn.close()
        self._send_json([row_to_dict(r) for r in rows])

    def _handle_get_kitchen_tickets(self):
        conn = get_conn()
        rows = conn.execute(
            """
            SELECT oi.id, oi.order_id, t.name AS table_name, mi.name AS menu_item_name,
                   oi.quantity, oi.status, oi.notes, o.created_at
            FROM order_items oi
            JOIN orders o ON o.id = oi.order_id
            JOIN tables t ON t.id = o.table_id
            JOIN menu_items mi ON mi.id = oi.menu_item_id
            WHERE o.status = 'open' AND oi.status = 'pending'
            ORDER BY oi.id ASC
            """
        ).fetchall()
        conn.close()
        self._send_json([row_to_dict(r) for r in rows])

    def _handle_get_daily_report(self, query_string):
        query = parse_qs(query_string)
        day = query.get("date", [dt.date.today().isoformat()])[0]

        try:
            dt.date.fromisoformat(day)
        except ValueError:
            self._send_json({"error": "Tarih formatı YYYY-MM-DD olmalı"}, status=HTTPStatus.BAD_REQUEST)
            return

        conn = get_conn()

        totals = conn.execute(
            """
            SELECT
              COUNT(*) AS closed_orders,
              ROUND(COALESCE(SUM(total_amount), 0), 2) AS revenue
            FROM orders
            WHERE status = 'closed' AND date(closed_at) = date(?)
            """,
            (day,),
        ).fetchone()

        payments = conn.execute(
            """
            SELECT payment_method, COUNT(*) AS count,
                   ROUND(COALESCE(SUM(total_amount), 0), 2) AS amount
            FROM orders
            WHERE status = 'closed' AND date(closed_at) = date(?)
            GROUP BY payment_method
            ORDER BY amount DESC
            """,
            (day,),
        ).fetchall()

        top_items = conn.execute(
            """
            SELECT mi.name,
                   SUM(oi.quantity) AS qty,
                   ROUND(SUM(oi.quantity * oi.unit_price), 2) AS amount
            FROM order_items oi
            JOIN orders o ON o.id = oi.order_id
            JOIN menu_items mi ON mi.id = oi.menu_item_id
            WHERE o.status = 'closed' AND date(o.closed_at) = date(?) AND oi.status != 'cancelled'
            GROUP BY mi.id, mi.name
            ORDER BY qty DESC, amount DESC
            LIMIT 10
            """,
            (day,),
        ).fetchall()

        conn.close()

        self._send_json(
            {
                "date": day,
                "summary": row_to_dict(totals),
                "payments": [row_to_dict(r) for r in payments],
                "top_items": [row_to_dict(r) for r in top_items],
            }
        )


def run_server(host="127.0.0.1", port=8000):
    init_db()
    server = ThreadingHTTPServer((host, port), RestaurantHandler)
    print(f"Restaurant POS server running at http://{host}:{port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    run_server()
