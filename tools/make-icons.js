// tools/make-icons.js — generate placeholder icon PNGs (no deps)
const fs = require('fs'), zlib = require('zlib'), path = require('path');
function crc32(buf){let c=~0;for(let i=0;i<buf.length;i++){c^=buf[i];for(let k=0;k<8;k++)c=(c>>>1)^(0xEDB88320&-(c&1));}return (~c)>>>0;}
function chunk(type,data){const t=Buffer.from(type,'ascii');const len=Buffer.alloc(4);len.writeUInt32BE(data.length,0);const crc=Buffer.alloc(4);crc.writeUInt32BE(crc32(Buffer.concat([t,data])),0);return Buffer.concat([len,t,data,crc]);}
function png(size){
  const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(size,0);ihdr.writeUInt32BE(size,4);ihdr[8]=8;ihdr[9]=6;
  const raw=Buffer.alloc(size*(size*4+1));
  for(let y=0;y<size;y++){raw[y*(size*4+1)]=0;for(let x=0;x<size;x++){const o=y*(size*4+1)+1+x*4;
    const edge=x<size*0.08||x>size*0.92||y<size*0.08||y>size*0.92;
    raw[o]=edge?0x12:0x0b;raw[o+1]=edge?0x8a:0x6e;raw[o+2]=edge?0x63:0x4f;raw[o+3]=0xff;}}
  const idat=zlib.deflateSync(raw);
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',idat),chunk('IEND',Buffer.alloc(0))]);
}
const dir=path.join(__dirname,'..','assets','icons');fs.mkdirSync(dir,{recursive:true});
for(const s of [16,32,48,128]) fs.writeFileSync(path.join(dir,'icon'+s+'.png'),png(s));
console.log('icons written');
