// Run the QR pipeline once on load (blur -> deblur -> reconstruct) so every panel opens populated.
window.addEventListener("load", () => {
  const click = (id, delay) => setTimeout(() => document.getElementById(id)?.click(), delay);
  click("apply-blur-qr", 300);
  click("apply-deblur-qr", 700);
  click("apply-reconstruction-qr", 2400);
});
