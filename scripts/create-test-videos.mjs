import { mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
await mkdir('test-results', {recursive:true});
for (const [name, seconds] of [['input',2],['short',.3],['long',12],['source-60fps',3]]) {
  execFileSync('ffmpeg', ['-hide_banner','-loglevel','error','-y','-f','lavfi','-i',name==='source-60fps'?'testsrc2=size=720x1280:rate=60':'testsrc2=size=360x780:rate=30','-f','lavfi','-i','sine=frequency=440:sample_rate=48000','-t',String(seconds),'-c:v','libx264','-preset','ultrafast','-pix_fmt','yuv420p','-c:a','aac','-movflags','+faststart',`test-results/${name}.mp4`], {stdio:'inherit'});
}
console.log('Created local H.264/AAC test fixtures (2s, 0.3s, 12s).');
