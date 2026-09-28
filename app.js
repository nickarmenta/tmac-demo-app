// All logic lives here. No runtime AI, no backend: static files + localStorage only.

// Newest first. Append an entry every time a feature ships.
const SHIPPED = [
  { date: '2026-09-28', text: 'App shell deployed. Waiting for the first feature request.' },
];

function renderShipped() {
  const list = document.getElementById('shipped');
  const status = document.getElementById('status');
  list.replaceChildren(
    ...SHIPPED.map(({ date, text }) => {
      const li = document.createElement('li');
      const time = document.createElement('time');
      time.dateTime = date;
      time.textContent = date;
      li.append(time, document.createTextNode(' ' + text));
      return li;
    })
  );
  status.textContent = `${SHIPPED.length} update${SHIPPED.length === 1 ? '' : 's'} so far.`;
}

renderShipped();
