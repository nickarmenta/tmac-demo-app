# TMAC Demo App

A tool built live during a talk, with requirements dictated on stage. AI writes the code, and the deployed app never calls an AI.

**Live:** https://nickarmenta.github.io/tmac-demo-app/

## Use it

Open the link on your phone. Everything you enter stays in your browser (`localStorage`). There are no accounts and no server.

## Run locally

Open `index.html` in a browser, or serve the folder so ES modules load:

```sh
python3 -m http.server 8000
# then visit http://localhost:8000
```

## Rules

- Static files only: `index.html`, `app.js`, `style.css`. No build step, no framework.
- No runtime AI or backend.
- Mobile first, dark mode supported.
