function openWindow(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.style.display = "block";
  el.style.zIndex = Date.now();
}

function closeWindow(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.style.display = "none";
}
