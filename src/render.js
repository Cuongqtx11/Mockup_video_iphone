import { paintBackground } from './backgrounds.js';
import { drawTexts } from './text-render.js';
export function createRenderer(getConfig) {
  let cache = null;
  function layer(w, h) { if (typeof document === 'undefined') return new OffscreenCanvas(w, h); const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h; return canvas; }
  function render(context, source, sourceWidth, sourceHeight, timestamp = 0) {
    const { state, variant, assets, backgroundImage, backgroundUrl, pendingVideo } = getConfig();
    const width = context.canvas.width, height = context.canvas.height;
    if (!assets) {
      context.fillStyle = '#eee9f2'; context.fillRect(0, 0, width, height);
      context.fillStyle = '#93859a'; context.textAlign = 'center'; context.font = `${width * .04}px sans-serif`;
      context.fillText('Đang tải khung iPhone…', width / 2, height / 2); return;
    }
    const key = `${width}:${height}:${JSON.stringify({model:state.model,finish:state.finish,scale:state.scale,x:state.deviceX,y:state.deviceY,shadow:state.shadow,color:state.color,background:state.background})}:${backgroundUrl || ''}:${assets.frame.src}`;
    if (cache?.key !== key) {
      if (cache) for (const canvas of [cache.under,cache.mask,cache.screen]) { canvas.width=1; canvas.height=1; }
      const under = layer(width, height), b = under.getContext('2d');
      let ph = height * state.scale / 100, pw = ph * variant.frameSize.width / variant.frameSize.height;
      const x = width * (state.deviceX ?? 50) / 100 - pw / 2, y = height * (state.deviceY ?? 50) / 100 - ph / 2, k = pw / variant.frameSize.width;
      render.phoneBounds = { x, y, width: pw, height: ph };
      const geometry = { sx: x + variant.screen.x * k, sy: y + variant.screen.y * k, sw: variant.screen.width * k, sh: variant.screen.height * k };
      if (backgroundImage) {
        const k = Math.max(width / backgroundImage.width, height / backgroundImage.height);
        b.drawImage(backgroundImage, (width - backgroundImage.width * k) / 2, (height - backgroundImage.height * k) / 2, backgroundImage.width * k, backgroundImage.height * k);
      } else {
        if(state.color){b.fillStyle=state.color;b.fillRect(0,0,width,height);}else paintBackground(b,width,height,state.backgroundPreset);
      }
      // Allocate scratch layers only for the visible screen, even at 200% zoom.
      const left=Math.max(0,Math.min(width,Math.floor(geometry.sx))), top=Math.max(0,Math.min(height,Math.floor(geometry.sy)));
      const right=Math.max(left,Math.min(width,Math.ceil(geometry.sx+geometry.sw))), bottom=Math.max(top,Math.min(height,Math.ceil(geometry.sy+geometry.sh)));
      const rw=Math.max(1,right-left), rh=Math.max(1,bottom-top);
      const mask=layer(rw,rh), screen=layer(rw,rh), m=mask.getContext('2d'), s=screen.getContext('2d');
      m.drawImage(assets.mask,x-left,y-top,pw,ph);
      if (state.shadow) { b.save(); b.shadowColor = '#15101e55'; b.shadowBlur = pw * .11; b.shadowOffsetY = pw * .075; b.drawImage(assets.frame, x, y, pw, ph); b.restore(); }
      s.drawImage(mask, 0, 0); s.globalCompositeOperation = 'source-in'; s.fillStyle = '#08090b'; s.fillRect(0,0,rw,rh); s.globalCompositeOperation = 'source-over'; b.drawImage(screen,left,top);
      // The screen mask excludes the frame and Dynamic Island, so the frame
      // can be baked into the background instead of redrawn above every sample.
      b.drawImage(assets.frame,x,y,pw,ph);
      cache = { key, under, mask, screen, screenContext: s, geometry, left, top };
    }
    const { under, mask, screen, screenContext: c, geometry: { sx: gx, sy: gy, sw, sh }, left, top } = cache;
    const sx=gx-left, sy=gy-top;
    context.drawImage(under, 0, 0); c.clearRect(0, 0, width, height);
    if (source && sourceWidth && sourceHeight) {
      const k = (state.fit === 'cover' ? Math.max(sw / sourceWidth, sh / sourceHeight) : Math.min(sw / sourceWidth, sh / sourceHeight)) * state.zoom / 100;
      const dw = sourceWidth * k, dh = sourceHeight * k, dx = sx + (sw - dw) / 2, dy = sy + (sh - dh) / 2;
      if (typeof source.draw === 'function') source.draw(c, dx, dy, dw, dh); else c.drawImage(source, dx, dy, dw, dh);
    } else if (!pendingVideo) {
      const gradient = c.createLinearGradient(sx, sy, sx + sw, sy + sh); gradient.addColorStop(0, '#203e43'); gradient.addColorStop(.45, '#397c74'); gradient.addColorStop(1, '#c9d9b0'); c.fillStyle = gradient; c.fillRect(sx, sy, sw, sh);
      c.save(); c.translate(sx + sw * .5, sy + sh * .56); c.rotate(-.4 + Math.sin(timestamp / 5) * .06);
      for (let i = 0; i < 8; i++) { c.save(); c.rotate(i * .42); const glow = c.createLinearGradient(-sw * .2, 0, sw * .25, 0); glow.addColorStop(0, '#204c5080'); glow.addColorStop(.5, '#b7ded288'); glow.addColorStop(1, '#e1edc655'); c.fillStyle = glow; c.beginPath(); c.ellipse(0, 0, sw * .13, sw * .7, 0, 0, Math.PI * 2); c.fill(); c.restore(); } c.restore();
      c.fillStyle = '#f4f8ec'; c.textAlign = 'center'; c.font = `500 ${sw * .04}px sans-serif`; c.fillText('MAKE SPACE FOR YOUR IDEAS', sx + sw / 2, sy + sh * .18);
      c.font = `600 ${sw * .13}px -apple-system,sans-serif`; ['Ý tưởng', 'thành', 'hình.'].forEach((text, i) => c.fillText(text, sx + sw / 2, sy + sh * (.32 + i * .075)));
      c.font = `400 ${sw * .04}px sans-serif`; c.fillText('Một chiếc khung. Cả câu chuyện.', sx + sw / 2, sy + sh * .84);
    }
    c.globalCompositeOperation = 'destination-in'; c.drawImage(mask, 0, 0); c.globalCompositeOperation = 'source-over';
    context.drawImage(screen,left,top);
    render.bufferPixels=width*height+2*screen.width*screen.height;
    render.textBoxes = drawTexts(context,state.texts || [],width,height,timestamp);
  }
  render.dispose=()=>{if(cache){for(const canvas of [cache.under,cache.mask,cache.screen]){canvas.width=1;canvas.height=1;}cache=null;}};
  return render;
}
