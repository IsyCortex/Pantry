/* Inventory overview — client-only sorting (by expiration date / location).
   No server round trip: the DOM is reordered in place using the date/location
   data attributes rendered on each item. */
(function () {
  const list = document.querySelector('.inventory-list');
  if (!list) {
    return;
  }

  const direction = { date: 'asc', location: 'asc' };

  function setActive(activeKey) {
    for (const button of document.querySelectorAll('[data-sort]')) {
      const isActive = button.dataset.sort === activeKey;
      button.setAttribute('aria-pressed', String(isActive));
      if (isActive) {
        button.classList.add('active');
      } else {
        button.classList.remove('active');
      }
    }
  }

  function compareValues(key) {
    const dir = direction[key] === 'asc' ? 1 : -1;
    return (a, b) => {
      const aValue = a.dataset[key] || '';
      const bValue = b.dataset[key] || '';
      if (key === 'date') {
        // Undated items sort last in ascending order (and first in descending).
        if (!aValue && !bValue) return 0;
        if (!aValue) return 1;
        if (!bValue) return -1;
      }
      // ISO dates compare lexicographically as chronological strings.
      return aValue.localeCompare(bValue) * dir;
    };
  }

  function applySort(key) {
    const articles = Array.from(list.querySelectorAll('article.inventory-item'));
    const ordered = articles.slice().sort(compareValues(key));
    for (const article of ordered) {
      list.append(article);
    }
    direction[key] = direction[key] === 'asc' ? 'desc' : 'asc';
    setActive(key);
  }

  for (const button of document.querySelectorAll('[data-sort]')) {
    button.addEventListener('click', () => applySort(button.dataset.sort));
  }
})();