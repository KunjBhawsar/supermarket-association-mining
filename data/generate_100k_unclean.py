import csv, random
from datetime import date, timedelta
from pathlib import Path

OUT = Path(__file__).resolve().parent / 'supermarket_100000_unclean.csv'
rng = random.Random(20261006)

products = [
    'Milk','Bread','Eggs','Butter','Cheese','Rice','Wheat Flour','Sugar','Salt',
    'Cooking Oil','Tea','Coffee','Biscuits','Chips','Chocolate','Juice','Soft Drink',
    'Mineral Water','Yogurt','Ice Cream','Corn Flakes','Oats','Pasta','Noodles',
    'Tomato Sauce','Ketchup','Mayonnaise','Jam','Peanut Butter','Honey','Cereal',
    'Soap','Shampoo','Toothpaste','Toothbrush','Detergent','Dishwash Liquid',
    'Hand Wash','Tissue','Toilet Paper','Laundry Powder','Shaving Cream','Deodorant',
    'Baby Diapers','Baby Wipes','Pet Food','Instant Soup','Spices','Turmeric',
    'Chilli Powder','Garam Masala','Dry Fruits','Biscuits Premium','Frozen Peas',
    'Frozen Corn','Chicken','Paneer','Basmati Rice','Green Tea'
]

groups = [
    ['Milk','Bread','Eggs'], ['Bread','Butter','Jam'], ['Rice','Wheat Flour','Cooking Oil','Salt'],
    ['Tea','Sugar','Biscuits'], ['Coffee','Sugar','Milk'], ['Pasta','Tomato Sauce','Cheese'],
    ['Noodles','Tomato Sauce','Soft Drink'], ['Chips','Soft Drink','Chocolate'],
    ['Corn Flakes','Milk','Oats'], ['Soap','Shampoo','Toothpaste','Toothbrush'],
    ['Detergent','Dishwash Liquid','Laundry Powder'], ['Hand Wash','Tissue','Toilet Paper'],
    ['Baby Diapers','Baby Wipes'], ['Chicken','Paneer','Spices'],
    ['Turmeric','Chilli Powder','Garam Masala','Cooking Oil'], ['Yogurt','Ice Cream','Juice'],
    ['Mineral Water','Juice','Soft Drink'], ['Peanut Butter','Honey','Bread'],
    ['Dry Fruits','Oats','Cereal'], ['Frozen Peas','Frozen Corn','Paneer'],
]
weights = {p: rng.uniform(0.5, 2.0) for p in products}
for p in ['Milk','Bread','Eggs','Rice','Cooking Oil','Sugar','Tea','Biscuits','Soap','Detergent']:
    weights[p] *= 2.2

def make_items():
    basket = set()
    if rng.random() < 0.75:
        basket.update(rng.choice(groups))
    target = rng.choices([3,4,5,6,7,8], weights=[18,28,28,16,7,3])[0]
    remaining = [p for p in products if p not in basket]
    while len(basket) < target and remaining:
        p = rng.choices(remaining, weights=[weights[x] for x in remaining], k=1)[0]
        basket.add(p); remaining.remove(p)
    return sorted(basket)

start = date(2025, 1, 1)
base = []
for i in range(1, 97001):
    tid = f'TX{i:06d}'
    items = make_items()
    dt = start + timedelta(days=rng.randrange(365 * 2))
    customer = f'C{rng.randint(1, 20000):05d}'
    qty = rng.randint(1, 5)
    base.append([tid, ', '.join(items), dt.isoformat(), customer, qty])

rows = list(base)
# 1,000 exact duplicate records: exercises duplicate detection.
rows.extend(rng.choice(base)[:] for _ in range(1000))
# 1,000 records with missing basket values: exercises missing-value removal.
for i in range(97001, 98001):
    dt = start + timedelta(days=rng.randrange(365 * 2))
    customer = f'C{rng.randint(1, 20000):05d}' if rng.random() > 0.08 else ''
    qty = rng.randint(1, 5)
    rows.append([f'TX{i:06d}', '', dt.isoformat(), customer, qty])
# 1,000 valid but deliberately messy records: casing/spacing, dates, quantity issues.
for i in range(98001, 99001):
    items = make_items()
    dirty_items = []
    for p in items:
        if rng.random() < 0.45:
            dirty_items.append('  ' + p.lower() + '  ')
        else:
            dirty_items.append(p)
    dt = start + timedelta(days=rng.randrange(365 * 2))
    date_value = dt.isoformat() if rng.random() > 0.05 else 'not-a-date'
    customer = f'C{rng.randint(1, 20000):05d}' if rng.random() > 0.08 else None
    qty = rng.choice([0, -2, 1, 2, 3, 5, 50, 1000])
    rows.append([f'TX{i:06d}', ', '.join(dirty_items), date_value, customer, qty])

# Shuffle so dirty records are not all at the end.
rng.shuffle(rows)
assert len(rows) == 100000

with OUT.open('w', newline='', encoding='utf-8-sig') as f:
    w = csv.writer(f)
    w.writerow(['TransactionID','Items','Date','CustomerID','Quantity'])
    w.writerows(rows)

print(OUT)
print('rows', len(rows))
