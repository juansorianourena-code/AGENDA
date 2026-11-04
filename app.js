document.getElementById('date').textContent =
  new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
