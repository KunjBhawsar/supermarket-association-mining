"""
Generates a realistic supermarket transaction dataset.
Designed so that:
  - confidence is NOT always 1 (noise + partial co-purchases)
  - lift varies meaningfully (some pairs near 1 = independent, some >> 1 = strong association)
  - Apriori / FP-Growth / FP-Max produce genuinely comparable but distinct outputs
Output: data/supermarket_transactions.csv  (columns: TransactionID, Date, CustomerID, Product)
"""
import random
import csv
from datetime import datetime, timedelta

random.seed(42)

CATALOG = {
    "Bakery": ["Bread", "Bagels", "Croissant", "Muffins"],
    "Dairy": ["Milk", "Butter", "Cheese", "Yogurt", "Cream"],
    "Eggs": ["Eggs"],
    "Breakfast": ["Cereal", "Oats", "Honey", "Peanut Butter", "Jam"],
    "Beverages": ["Coffee", "Tea", "Orange Juice", "Soda", "Bottled Water", "Energy Drink"],
    "Snacks": ["Chips", "Chocolate", "Cookies", "Popcorn", "Salsa"],
    "Produce": ["Bananas", "Apples", "Tomatoes", "Onions", "Potatoes", "Lettuce", "Avocado", "Lemons"],
    "Meat": ["Chicken Breast", "Ground Beef", "Bacon", "Sausages", "Fish Fillet"],
    "Pantry": ["Pasta", "Pasta Sauce", "Rice", "Cooking Oil", "Flour", "Sugar", "Salt"],
    "Household": ["Detergent", "Dish Soap", "Paper Towels", "Trash Bags", "Toilet Paper"],
    "Personal Care": ["Shampoo", "Soap", "Toothpaste", "Toothbrush", "Tissues"],
    "Baby": ["Diapers", "Baby Food", "Baby Wipes"],
    "Alcohol": ["Beer", "Wine"],
    "Frozen": ["Ice Cream", "Frozen Pizza", "Frozen Vegetables"],
}

ALL_PRODUCTS = [p for cat in CATALOG.values() for p in cat]

# --- Association "recipes": (itemset, base probability a matching basket includes the *rest*, weight)
# These create genuine, learnable patterns with realistic noise (never probability 1.0)
RECIPES = [
    (["Bread", "Butter"], 0.82),
    (["Bread", "Milk", "Eggs"], 0.55),
    (["Pasta", "Pasta Sauce"], 0.88),
    (["Pasta", "Pasta Sauce", "Cheese"], 0.5),
    (["Diapers", "Beer"], 0.42),
    (["Diapers", "Baby Food", "Baby Wipes"], 0.6),
    (["Chips", "Soda"], 0.7),
    (["Chips", "Salsa", "Soda"], 0.38),
    (["Coffee", "Sugar"], 0.6),
    (["Tea", "Honey"], 0.45),
    (["Cereal", "Milk"], 0.8),
    (["Chicken Breast", "Cooking Oil", "Onions"], 0.5),
    (["Ground Beef", "Pasta Sauce", "Onions"], 0.4),
    (["Wine", "Cheese"], 0.65),
    (["Beer", "Chips"], 0.5),
    (["Shampoo", "Soap"], 0.55),
    (["Toothpaste", "Toothbrush"], 0.75),
    (["Detergent", "Dish Soap"], 0.48),
    (["Ice Cream", "Chocolate"], 0.4),
    (["Frozen Pizza", "Soda"], 0.45),
    (["Bananas", "Apples"], 0.5),
    (["Tomatoes", "Onions", "Cooking Oil"], 0.42),
    (["Bacon", "Eggs"], 0.6),
    (["Bagels", "Cream"], 0.5),
    (["Orange Juice", "Croissant"], 0.4),
    (["Rice", "Chicken Breast"], 0.35),
    (["Paper Towels", "Trash Bags"], 0.5),
    (["Baby Food", "Baby Wipes", "Diapers"], 0.55),
    (["Lettuce", "Tomatoes", "Avocado"], 0.45),
    (["Energy Drink", "Chips"], 0.35),
]

N_TRANSACTIONS = 1500
MIN_ITEMS, MAX_ITEMS = 2, 11

start_date = datetime(2024, 1, 1)


def build_basket():
    basket = set()
    # 1-3 recipes seed the basket (creates realistic co-purchase structure)
    n_recipes = random.choices([0, 1, 2, 3], weights=[0.08, 0.45, 0.35, 0.12])[0]
    chosen_recipes = random.sample(RECIPES, k=min(n_recipes, len(RECIPES)))
    for items, prob in chosen_recipes:
        anchor = random.choice(items)
        basket.add(anchor)
        for it in items:
            if it == anchor:
                continue
            if random.random() < prob:
                basket.add(it)

    # fill remainder with random noise items so baskets look realistic
    target_size = random.randint(MIN_ITEMS, MAX_ITEMS)
    while len(basket) < target_size:
        basket.add(random.choice(ALL_PRODUCTS))

    # occasionally drop an item (missed purchase / out of stock) to add further noise
    if len(basket) > MIN_ITEMS and random.random() < 0.15:
        basket.discard(random.choice(list(basket)))

    return list(basket)


rows = []
txn_id = 1000
for i in range(N_TRANSACTIONS):
    basket = build_basket()
    date = start_date + timedelta(days=random.randint(0, 269), hours=random.randint(8, 21), minutes=random.randint(0, 59))
    customer_id = f"CUST{random.randint(1, 420):04d}"
    for product in basket:
        rows.append({
            "TransactionID": f"T{txn_id}",
            "Date": date.strftime("%Y-%m-%d %H:%M"),
            "CustomerID": customer_id,
            "Product": product,
        })
    txn_id += 1

with open("/home/claude/project/data/supermarket_transactions.csv", "w", newline="") as f:
    writer = csv.DictWriter(f, fieldnames=["TransactionID", "Date", "CustomerID", "Product"])
    writer.writeheader()
    writer.writerows(rows)

print(f"Generated {len(rows)} rows across {N_TRANSACTIONS} transactions, {len(ALL_PRODUCTS)} unique products.")
