export function createRenderer(getConfig) {
  let cache = null;
  function layer(w, h) { const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h; return canvas; }
  return function render(context, source, sourceWidth, sourceHeight, demoTime = 0) {
    const { state, variant, assets, backgroundImage, backgroundUrl } = getConfig();
    const width = context.canvas.width, height = context.canvas.height;
    if (!assets) {
      context.fillStyle = '#eee9f2'; context.fillRect(0, 0, width, height);
      context.fillStyle = '#93859a'; context.textAlign = 'center'; context.font = `${width * .04}px sans-serif`;
      context.fillText('Đang tải khung iPhone…', width / 2, height / 2); return;
    }
    const key = `${width}:${height}:${JSON.stringify(state)}:${backgroundUrl || ''}:${assets.frame.src}`;
    if (cache?.key !== key) {
      const under = layer(width, height), over = layer(width, height), mask = layer(width, height), screen = layer(width, height);
      const b = under.getContext('2d'), f = over.getContext('2d'), m = mask.getContext('2d'), s = screen.getContext('2d');
      let ph = height * state.scale / 100, pw = ph * variant.frameSize.width / variant.frameSize.height;
      if (pw > width * .88) { ph *= width * .88 / pw; pw = width * .88; }
      const x = (width - pw) / 2, y = (height - ph) / 2, k = pw / variant.frameSize.width;
      const geometry = { sx: x + variant.screen.x * k, sy: y + variant.screen.y * k, sw: variant.screen.width * k, sh: variant.screen.height * k };
      if (backgroundImage) {
        const k = Math.max(width / backgroundImage.width, height / backgroundImage.height);
        b.drawImage(backgroundImage, (width - backgroundImage.width * k) / 2, (height - backgroundImage.height * k) / 2, backgroundImage.width * k, backgroundImage.height * k);
      } else {
        const colors = state.color ? [state.color, state.color] : state.backgroundColors;
        const gradient = b.createLinearGradient(0, 0, width, height); gradient.addColorStop(0, colors[0]); gradient.addColorStop(1, colors[1]);
        b.fillStyle = gradient; b.fillRect(0, 0, width, height);
      }
      m.drawImage(assets.mask, x, y, pw, ph);
      if (state.shadow) { b.save(); b.shadowColor = '#15101e55'; b.shadowBlur = pw * .11; b.shadowOffsetY = pw * .075; b.drawImage(assets.frame, x, y, pw, ph); b.restore(); }
      s.drawImage(mask, 0, 0); s.globalCompositeOperation = 'source-in'; s.fillStyle = '#08090b'; s.fillRect(0, 0, width, height); s.globalCompositeOperation = 'source-over'; b.drawImage(screen, 0, 0);
      f.drawImage(assets.frame, x, y, pw, ph);
      cache = { key, under, over, mask, screen, screenContext: s, geometry };
    }
    const { under, over, mask, screen, screenContext: c, geometry: { sx, sy, sw, sh } } = cache;
    context.drawImage(under, 0, 0); c.clearRect(0, 0, width, height);
    if (source && sourceWidth && sourceHeight) {
      const k = (state.fit === 'cover' ? Math.max(sw / sourceWidth, sh / sourceHeight) : Math.min(sw / sourceWidth, sh / sourceHeight)) * state.zoom / 100;
      const dw = sourceWidth * k, dh = sourceHeight * k, dx = sx + (sw - dw) / 2, dy = sy + (sh - dh) / 2;
      if (typeof source.draw === 'function') source.draw(c, dx, dy, dw, dh); else c.drawImage(source, dx, dy, dw, dh);
    } else {
      const gradient = c.createLinearGradient(sx, sy, sx + sw, sy + sh); gradient.addColorStop(0, '#203e43'); gradient.addColorStop(.45, '#397c74'); gradient.addColorStop(1, '#c9d9b0'); c.fillStyle = gradient; c.fillRect(sx, sy, sw, sh);
      c.save(); c.translate(sx + sw * .5, sy + sh * .56); c.rotate(-.4 + Math.sin(demoTime / 5000) * .06);
      for (let i = 0; i < 8; i++) { c.save(); c.rotate(i * .42); const glow = c.createLinearGradient(-sw * .2, 0, sw * .25, 0); glow.addColorStop(0, '#204c5080'); glow.addColorStop(.5, '#b7ded288'); glow.addColorStop(1, '#e1edc655'); c.fillStyle = glow; c.beginPath(); c.ellipse(0, 0, sw * .13, sw * .7, 0, 0, Math.PI * 2); c.fill(); c.restore(); } c.restore();
      c.fillStyle = '#f4f8ec'; c.textAlign = 'center'; c.font = `500 ${sw * .04}px sans-serif`; c.fillText('MAKE SPACE FOR YOUR IDEAS', sx + sw / 2, sy + sh * .18);
      c.font = `600 ${sw * .13}px -apple-system,sans-serif`; ['Ý tưởng', 'thành', 'hình.'].forEach((text, i) => c.fillText(text, sx + sw / 2, sy + sh * (.32 + i * .075)));
      c.font = `400 ${sw * .04}px sans-serif`; c.fillText('Một chiếc khung. Cả câu chuyện.', sx + sw / 2, sy + sh * .84);
    }
    c.globalCompositeOperation = 'destination-in'; c.drawImage(mask, 0, 0); c.globalCompositeOperation = 'source-over';
    context.drawImage(screen, 0, 0); context.drawImage(over, 0, 0);
  };
}
