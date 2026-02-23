#!/usr/bin/env python3
import json
import os
import random
import urllib.parse
import urllib.request
from datetime import datetime, timedelta
from pathlib import Path
from urllib.parse import urlparse

import pg8000

SEED_TAG = "DEMO_SEED_HOTELPOS_V1"
ORDER_TAG = "DEMO_ORDER_SEED_HOTELPOS_V1"
PAYMENT_TAG = "DEMO_PAYMENT_SEED_HOTELPOS_V1"

MENU_ITEMS = [
    # Restoran
    {"outlet": "Restoran", "category": "Burger", "name": "Cheeseburger", "price": 320, "source": "meal", "query": "burger"},
    {"outlet": "Restoran", "category": "Burger", "name": "Kofte Burger", "price": 335, "source": "meal", "query": "kofta"},
    {"outlet": "Restoran", "category": "Burger", "name": "Double Burger", "price": 390, "source": "meal", "query": "beef"},
    {"outlet": "Restoran", "category": "Pizza", "name": "Margherita Pizza", "price": 360, "source": "meal", "query": "pizza"},
    {"outlet": "Restoran", "category": "Pizza", "name": "Pepperoni Pizza", "price": 390, "source": "meal", "query": "pepperoni"},
    {"outlet": "Restoran", "category": "Pizza", "name": "Karisik Pizza", "price": 420, "source": "meal", "query": "pizza"},
    {"outlet": "Restoran", "category": "Ana Yemek", "name": "Grilled Steak", "price": 520, "source": "meal", "query": "steak"},
    {"outlet": "Restoran", "category": "Ana Yemek", "name": "Penne Alfredo", "price": 310, "source": "meal", "query": "pasta"},
    {"outlet": "Restoran", "category": "Ana Yemek", "name": "Fish and Chips", "price": 340, "source": "meal", "query": "fish"},
    {"outlet": "Restoran", "category": "Ana Yemek", "name": "Club Sandwich", "price": 265, "source": "meal", "query": "sandwich"},
    {"outlet": "Restoran", "category": "Atistirmalik", "name": "French Fries", "price": 130, "source": "meal", "query": "fries"},
    {"outlet": "Restoran", "category": "Atistirmalik", "name": "Onion Rings", "price": 140, "source": "meal", "query": "onion"},
    {"outlet": "Restoran", "category": "Atistirmalik", "name": "Chicken Nuggets", "price": 185, "source": "meal", "query": "chicken"},
    {"outlet": "Restoran", "category": "Tatli", "name": "Cheesecake", "price": 160, "source": "meal", "query": "cake"},
    # Bar
    {"outlet": "Bar", "category": "Alkolsuz Icecek", "name": "Virgin Mojito", "price": 170, "source": "drink", "query": "Virgin Mojito"},
    {"outlet": "Bar", "category": "Alkolsuz Icecek", "name": "Lemonade", "price": 95, "source": "drink", "query": "Lemonade"},
    {"outlet": "Bar", "category": "Alkolsuz Icecek", "name": "Shirley Temple", "price": 105, "source": "drink", "query": "Shirley Temple"},
    {"outlet": "Bar", "category": "Alkolsuz Icecek", "name": "Iced Tea", "price": 90, "source": "drink", "query": "Iced Tea"},
    {"outlet": "Bar", "category": "Alkolsuz Icecek", "name": "Cola", "price": 75, "source": "drink", "query": "Coke"},
    {"outlet": "Bar", "category": "Alkolsuz Icecek", "name": "Mineral Water", "price": 65, "source": "drink", "query": "Soda"},
    {"outlet": "Bar", "category": "Alkollu Icecek", "name": "Mojito", "price": 260, "source": "drink", "query": "Mojito"},
    {"outlet": "Bar", "category": "Alkollu Icecek", "name": "Margarita", "price": 280, "source": "drink", "query": "Margarita"},
    {"outlet": "Bar", "category": "Alkollu Icecek", "name": "Gin Tonic", "price": 270, "source": "drink", "query": "Gin Tonic"},
    {"outlet": "Bar", "category": "Alkollu Icecek", "name": "Whiskey Sour", "price": 310, "source": "drink", "query": "Whiskey Sour"},
    {"outlet": "Bar", "category": "Alkollu Icecek", "name": "Old Fashioned", "price": 315, "source": "drink", "query": "Old Fashioned"},
    {"outlet": "Bar", "category": "Alkollu Icecek", "name": "Pina Colada", "price": 285, "source": "drink", "query": "Pina Colada"},
    {"outlet": "Bar", "category": "Alkollu Icecek", "name": "Aperol Spritz", "price": 290, "source": "drink", "query": "Spritz"},
    {"outlet": "Bar", "category": "Alkollu Icecek", "name": "Red Wine Glass", "price": 230, "source": "drink", "query": "Red Wine"},
]

GUEST_NAMES = [
    "Ahmet Yilmaz",
    "Ayse Kaya",
    "Mehmet Demir",
    "Elif Arslan",
    "Can Koc",
    "Zeynep Aksoy",
    "Mert Aydin",
    "Deniz Sen",
    "Ece Kurt",
    "Bora Kaplan",
    "Seda Dincer",
    "Hakan Tas",
    "Nisan Ozturk",
    "Burak Erdem",
    "Selin Ucar",
]


def parse_database_url():
    db_url = os.environ.get("DATABASE_URL")
    if not db_url:
        raise SystemExit("DATABASE_URL env degiskeni gerekli.")

    u = urlparse(db_url)
    return {
        "user": u.username,
        "password": u.password,
        "host": u.hostname,
        "port": u.port or 5432,
        "database": (u.path or "/postgres").lstrip("/"),
    }


def fetch_json(url: str):
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 (compatible; HotelPOSSeeder/1.0)",
            "Accept": "application/json",
        },
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


def meal_image(query: str):
    q = urllib.parse.quote(query)
    url = f"https://www.themealdb.com/api/json/v1/1/search.php?s={q}"
    data = fetch_json(url)
    meals = data.get("meals") or []
    if meals:
        return meals[0].get("strMealThumb")
    return None


def drink_image(query: str):
    q = urllib.parse.quote(query)
    url = f"https://www.thecocktaildb.com/api/json/v1/1/search.php?s={q}"
    data = fetch_json(url)
    drinks = data.get("drinks") or []
    if drinks:
        return drinks[0].get("strDrinkThumb")
    return None


def resolve_image(item):
    try:
        if item["source"] == "meal":
            img = meal_image(item["query"])
        else:
            img = drink_image(item["query"])
        if img:
            return img
    except Exception:
        pass

    return "https://www.themealdb.com/images/media/meals/1548772327.jpg"


def ensure_schema(conn):
    schema_path = Path(__file__).resolve().parents[1] / "sql" / "schema.sql"
    sql = schema_path.read_text(encoding="utf-8")
    cur = conn.cursor()
    cur.execute(sql)
    conn.commit()
    cur.close()


def seed_menu(conn):
    cur = conn.cursor()

    cur.execute("select id, name from public.outlets")
    outlets = {row[1]: row[0] for row in cur.fetchall()}

    inserted = 0
    updated = 0
    for item in MENU_ITEMS:
        outlet_id = outlets[item["outlet"]]
        image_url = resolve_image(item)

        cur.execute(
            """
            insert into public.menu_items (outlet_id, category, name, price, image_url, is_active)
            values (%s, %s, %s, %s, %s, true)
            on conflict (outlet_id, name)
            do update set
                category = excluded.category,
                price = excluded.price,
                image_url = excluded.image_url,
                is_active = true
            returning (xmax = 0)
            """,
            (
                outlet_id,
                item["category"],
                item["name"],
                item["price"],
                image_url,
            ),
        )
        is_insert = cur.fetchone()[0]
        if is_insert:
            inserted += 1
        else:
            updated += 1

    conn.commit()
    cur.close()
    return inserted, updated


def ensure_room(cur, room_number):
    cur.execute("select id from public.rooms where room_number = %s", (room_number,))
    row = cur.fetchone()
    if row:
        return row[0]

    cur.execute(
        "insert into public.rooms (room_number, is_active) values (%s, true) returning id",
        (room_number,),
    )
    return cur.fetchone()[0]


def ensure_guest(cur, full_name, phone):
    cur.execute("select id from public.guests where full_name = %s", (full_name,))
    row = cur.fetchone()
    if row:
        return row[0]

    cur.execute(
        "insert into public.guests (full_name, phone) values (%s, %s) returning id",
        (full_name, phone),
    )
    return cur.fetchone()[0]


def seed_stays(conn):
    cur = conn.cursor()
    created = 0

    now = datetime.utcnow()
    stay_ids = []

    for i, name in enumerate(GUEST_NAMES, start=1):
        room_number = str(200 + i)
        phone = f"0555{7000000 + i}"

        room_id = ensure_room(cur, room_number)
        guest_id = ensure_guest(cur, f"Demo {name}", phone)

        note = f"{SEED_TAG}:{room_number}"
        cur.execute("select id, status from public.stays where note = %s limit 1", (note,))
        row = cur.fetchone()

        if row:
            stay_ids.append((row[0], row[1]))
            continue

        check_in = now - timedelta(days=random.randint(0, 4), hours=random.randint(1, 18))
        planned = check_in + timedelta(days=random.randint(1, 3))

        status = "open" if i <= 10 else "closed"
        closed_at = (check_in + timedelta(hours=random.randint(5, 22))) if status == "closed" else None

        cur.execute(
            """
            insert into public.stays
              (guest_id, room_id, check_in, check_out_plan, status, note, closed_at)
            values
              (%s, %s, %s, %s, %s, %s, %s)
            returning id
            """,
            (guest_id, room_id, check_in, planned, status, note, closed_at),
        )
        stay_ids.append((cur.fetchone()[0], status))
        created += 1

    conn.commit()
    cur.close()
    return stay_ids, created


def seed_orders_and_items(conn, stay_ids):
    cur = conn.cursor()

    cur.execute("select count(*) from public.orders where note like %s", (f"{ORDER_TAG}%",))
    if cur.fetchone()[0] > 0:
        cur.close()
        return 0, 0

    cur.execute("select id, name from public.outlets")
    outlets = {r[1]: r[0] for r in cur.fetchall()}

    cur.execute(
        "select id, outlet_id, name, price from public.menu_items where is_active = true order by id"
    )
    menu_rows = cur.fetchall()

    menu_by_outlet = {}
    for item_id, outlet_id, name, price in menu_rows:
        menu_by_outlet.setdefault(outlet_id, []).append((item_id, name, float(price)))

    order_count = 0
    item_count = 0
    now = datetime.utcnow()

    for stay_id, status in stay_ids:
        order_per_stay = random.randint(1, 3)
        for idx in range(order_per_stay):
            outlet_id = random.choice(list(outlets.values()))
            created_at = now - timedelta(hours=random.randint(2, 96), minutes=random.randint(0, 59))
            note = f"{ORDER_TAG}:stay:{stay_id}:{idx}"

            cur.execute(
                """
                insert into public.orders (stay_id, outlet_id, order_source, status, note, created_at)
                values (%s, %s, 'pos', 'closed', %s, %s)
                returning id
                """,
                (stay_id, outlet_id, note, created_at),
            )
            order_id = cur.fetchone()[0]
            order_count += 1

            available = menu_by_outlet.get(outlet_id, [])
            if not available:
                continue

            for _ in range(random.randint(2, 5)):
                mi = random.choice(available)
                quantity = random.randint(1, 3)
                cur.execute(
                    """
                    insert into public.order_items (order_id, menu_item_id, item_name, quantity, unit_price)
                    values (%s, %s, %s, %s, %s)
                    """,
                    (order_id, mi[0], mi[1], quantity, mi[2]),
                )
                item_count += 1

    # Walk-in orders (stay_id = null)
    for idx in range(8):
        outlet_id = random.choice(list(outlets.values()))
        created_at = now - timedelta(hours=random.randint(1, 48), minutes=random.randint(0, 59))
        note = f"{ORDER_TAG}:walkin:{idx}"

        cur.execute(
            """
            insert into public.orders (stay_id, outlet_id, order_source, status, note, created_at)
            values (null, %s, 'pos', 'closed', %s, %s)
            returning id
            """,
            (outlet_id, note, created_at),
        )
        order_id = cur.fetchone()[0]
        order_count += 1

        available = menu_by_outlet.get(outlet_id, [])
        for _ in range(random.randint(1, 4)):
            mi = random.choice(available)
            quantity = random.randint(1, 2)
            cur.execute(
                """
                insert into public.order_items (order_id, menu_item_id, item_name, quantity, unit_price)
                values (%s, %s, %s, %s, %s)
                """,
                (order_id, mi[0], mi[1], quantity, mi[2]),
            )
            item_count += 1

    conn.commit()
    cur.close()
    return order_count, item_count


def seed_payments(conn, stay_ids):
    cur = conn.cursor()

    cur.execute("select count(*) from public.payments where note like %s", (f"{PAYMENT_TAG}%",))
    if cur.fetchone()[0] > 0:
        cur.close()
        return 0

    methods = ["nakit", "kart", "havale", "diger"]
    payment_count = 0

    for stay_id, status in stay_ids:
        cur.execute(
            """
            select coalesce(sum(oi.quantity * oi.unit_price), 0)
            from public.orders o
            join public.order_items oi on oi.order_id = o.id
            where o.stay_id = %s
            """,
            (stay_id,),
        )
        total = float(cur.fetchone()[0] or 0)
        if total <= 0:
            continue

        ratio = 1.0 if status == "closed" else random.uniform(0.35, 0.85)
        pay_total = round(total * ratio, 2)
        if pay_total <= 0:
            continue

        split = 1 if pay_total < 300 else random.choice([1, 2])
        remain = pay_total
        for idx in range(split):
            if idx == split - 1:
                amount = round(remain, 2)
            else:
                amount = round(pay_total * random.uniform(0.35, 0.65), 2)
                remain = round(remain - amount, 2)

            if amount <= 0:
                continue

            cur.execute(
                """
                insert into public.payments (stay_id, method, amount, note, created_at)
                values (%s, %s, %s, %s, %s)
                """,
                (
                    stay_id,
                    random.choice(methods),
                    amount,
                    f"{PAYMENT_TAG}:{stay_id}:{idx}",
                    datetime.utcnow() - timedelta(hours=random.randint(1, 48)),
                ),
            )
            payment_count += 1

    conn.commit()
    cur.close()
    return payment_count


def main():
    random.seed(42)

    db_params = parse_database_url()
    conn = pg8000.connect(
        user=db_params["user"],
        password=db_params["password"],
        host=db_params["host"],
        port=db_params["port"],
        database=db_params["database"],
        timeout=30,
    )

    ensure_schema(conn)
    menu_inserted, menu_updated = seed_menu(conn)
    stay_ids, stays_created = seed_stays(conn)
    orders_created, order_items_created = seed_orders_and_items(conn, stay_ids)
    payments_created = seed_payments(conn, stay_ids)

    conn.close()

    print("seed_ok")
    print(f"menu_inserted={menu_inserted}")
    print(f"menu_updated={menu_updated}")
    print(f"stays_created={stays_created}")
    print(f"orders_created={orders_created}")
    print(f"order_items_created={order_items_created}")
    print(f"payments_created={payments_created}")


if __name__ == "__main__":
    main()
