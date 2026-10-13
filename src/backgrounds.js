export const BACKGROUNDS = [
  { name: 'Lavender', colors: ['#f2ecfa', '#d6c8e9'], style: 'gradient' },
  { name: 'Apricot', colors: ['#fff0de', '#e7b6a4'], style: 'gradient' },
  { name: 'Ocean', colors: ['#e2eff6', '#9dbcca'], style: 'gradient' },
  { name: 'Midnight', colors: ['#3c3b50', '#171821'], style: 'gradient' },
  { name: 'Sage', colors: ['#eef1e9', '#b6c9b6'], style: 'gradient' },
  { name: 'Paper', colors: ['#faf9f7', '#eae8e4'], style: 'gradient' },
  { name: 'Aurora', colors: ['#071a24', '#143b43', '#55b3a8', '#ba90fb'], style: 'mesh' },
  { name: 'Rose silk', colors: ['#ffede5', '#d7909f', '#f7c9b5', '#b9a0d7'], style: 'silk' },
  { name: 'Peach glow', colors: ['#fff5db', '#ffc098', '#fa839d', '#ffdcb0'], style: 'mesh' },
  { name: 'Indigo', colors: ['#101138', '#29357f', '#817ef9', '#87c9ed'], style: 'mesh' },
  { name: 'Matcha', colors: ['#eef3dd', '#abc197', '#59785a', '#f0e9ba'], style: 'arch' },
  { name: 'Desert sun', colors: ['#f4dcc0', '#d1946e', '#9c6e5a', '#ffefbc'], style: 'landscape' },
  { name: 'Coastal', colors: ['#d8eef0', '#699daa', '#e6e4cf', '#f8f3dd'], style: 'landscape' },
  { name: 'Neon night', colors: ['#100d26', '#55378b', '#e979cc', '#57d4c7'], style: 'mesh' },
  { name: 'Champagne', colors: ['#f8f0de', '#d5bb9a', '#b09b7b', '#fff9e7'], style: 'silk' },
  { name: 'Editorial', colors: ['#f2eee6', '#e2dacd', '#b3baac', '#d4a48a'], style: 'arch' },
  { name: 'Blue hour', colors: ['#182c48', '#46647d', '#bbacb7', '#f0cda8'], style: 'landscape' },
  { name: 'Studio grid', colors: ['#e8ede7', '#ccd7cc', '#90a698', '#fafcf7'], style: 'grid' },
];

export function paintBackground(ctx, width, height, preset) {
  const colors = preset.colors;
  const gradient = ctx.createLinearGradient(0, 0, width * .8, height);
  gradient.addColorStop(0, colors[0]); gradient.addColorStop(1, colors[1]); ctx.fillStyle = gradient; ctx.fillRect(0, 0, width, height);
  if (preset.style === 'mesh') {
    for (const [x,y,r,color] of [[.1,.18,.72,colors[2]],[.94,.7,.8,colors[3]],[.6,.95,.7,colors[1]]]) {
      const glow = ctx.createRadialGradient(width * x, height * y, 0, width * x, height * y, Math.max(width,height) * r);
      glow.addColorStop(0, color+'c0'); glow.addColorStop(1, color+'00'); ctx.fillStyle = glow; ctx.fillRect(0,0,width,height);
    }
  } else if (preset.style === 'silk') {
    for (let i=0; i<9; i++) { ctx.save(); ctx.translate(width * .5, height * .58); ctx.rotate(-.6+i*.035); const glow=ctx.createLinearGradient(-width,0,width,0); glow.addColorStop(0,colors[1]+'10'); glow.addColorStop(.45,colors[2]+'45'); glow.addColorStop(.6,colors[3]+'90'); glow.addColorStop(1,colors[1]+'00'); ctx.fillStyle=glow; ctx.beginPath(); ctx.ellipse(width*(i-4)*.055,0,width*.18,height*1.2,0,0,Math.PI*2);ctx.fill();ctx.restore(); }
  } else if (preset.style === 'arch') {
    ctx.fillStyle = colors[2]+'35'; ctx.beginPath(); ctx.roundRect(-width*.13,height*.34,width*.74,height*.9,[width*.37,width*.37,0,0]);ctx.fill();
    ctx.fillStyle = colors[3]+'90'; ctx.beginPath();ctx.roundRect(width*.67,-height*.2,width*.61,height*.55,[0,0,width*.31,width*.31]);ctx.fill();
  } else if (preset.style === 'landscape') {
    ctx.fillStyle=colors[3]+'bb';ctx.beginPath();ctx.arc(width*.77,height*.24,width*.18,0,Math.PI*2);ctx.fill();
    for(let i=0;i<3;i++){ctx.fillStyle=[colors[1]+'80',colors[2]+'80',colors[2]][i];ctx.beginPath();ctx.moveTo(0,height);ctx.lineTo(0,height*(.63+i*.12));ctx.bezierCurveTo(width*.3,height*(.48+i*.12),width*.58,height*(.86+i*.03),width,height*(.64+i*.12));ctx.lineTo(width,height);ctx.closePath();ctx.fill();}
  } else if (preset.style === 'grid') {
    ctx.strokeStyle=colors[2]+'45';ctx.lineWidth=Math.max(1,width/1200);const gap=Math.min(width,height)/13;
    for(let x=0;x<width;x+=gap){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,height);ctx.stroke();}
    for(let y=0;y<height;y+=gap){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(width,y);ctx.stroke();}
  }
}
