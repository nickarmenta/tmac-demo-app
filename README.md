# Family Meal Planner

Plan a week of healthy meals that fit your family's diet and budget, then shop from one grocery list that builds itself. Built live during a talk. AI wrote the code, and the app never calls an AI.

**Live:** https://nickarmenta.github.io/tmac-demo-app/

## Use it

- **Plan:** a 7-day plan (breakfast and dinner by default) sized to your household and budget. Tap a meal for its recipe, swap it, lock it so **New plan** keeps it, or skip it. Every change can be undone.
- **Groceries:** everything the plan needs, totaled by aisle with estimated cost. Check items off, add extras, and **Copy list** to paste into Notes or a text.
- **Recipes:** 48 built-in healthy recipes, plus your own. Your ingredients scale to your household and land on the grocery list. Hide any recipe you never want suggested.
- **Settings:** adults and kids (kids count as smaller portions), weekly budget, daily calorie goal, which meals to plan, diets and allergies (vegetarian, vegan, gluten-free, dairy-free, nut-free, low-carb, high-protein…), and ingredients to never include.
- **Share plan:** a link that carries the whole plan and settings to another phone.

Everything is saved in your browser (`localStorage`). There are no accounts and no server. Prices are rough US grocery averages, meant for estimates only.

## Run locally

Serve the folder so ES modules load:

```sh
python3 -m http.server 8000
# then visit http://localhost:8000
```

## Files

| File | What's in it |
| --- | --- |
| `index.html` | Page structure |
| `app.js` | State, rendering, plan & grocery actions, tabs |
| `forms.js` | Your-own-recipe form and Settings |
| `planner.js` | Pure logic: diet filters, budget-aware planning, grocery totals, share links |
| `recipes.js` | Ingredient catalog (prices, aisles, allergens) and recipes |
| `ui.js` | DOM helpers, toast, dialogs, clipboard |
| `style.css` | All styling (light and dark) |
